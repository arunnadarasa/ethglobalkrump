"use strict";

// ENS setup helper (write addr + text records) on Ethereum Sepolia.
//
// This is used by the judge-facing UI endpoint to register/update an ENS
// name and set the text records used by the app for:
// - agent identity metadata
// - intent gating via `allowedIntents`
// - Vyper policy `agentId` via the resolved `addr(...)` record

const DEFAULT_ENS_SEPOLIA_RPC_URL = "https://rpc.sepolia.org";
const ETH_COIN_TYPE = 60; // ENSIP-9 coinType for ETH

async function setupAgentEns({
  ensName,
  ensPrivateKey,
  sepoliaRpcUrl = DEFAULT_ENS_SEPOLIA_RPC_URL,
  arcActorAddress,
  agentId,
  tokenUri,
  capabilitiesUri,
  allowedIntent
} = {}) {
  if (!ensName || typeof ensName !== "string") {
    throw new Error("ensName is required (string)");
  }
  if (!ensPrivateKey || typeof ensPrivateKey !== "string") {
    throw new Error("ensPrivateKey is required");
  }
  if (!arcActorAddress || typeof arcActorAddress !== "string") {
    throw new Error("arcActorAddress is required");
  }
  if (!agentId || typeof agentId !== "string") {
    throw new Error("agentId is required");
  }
  if (!allowedIntent || typeof allowedIntent !== "string") {
    throw new Error("allowedIntent is required (single intent id)");
  }

  // Import ESM dependencies at runtime because this repo is CommonJS.
  const viem = await import("viem");
  const viemChains = await import("viem/chains");
  const ensjs = await import("@ensdomains/ensjs");
  const ensPublic = await import("@ensdomains/ensjs/public");
  const ensWallet = await import("@ensdomains/ensjs/wallet");

  const { createPublicClient, createWalletClient, http, privateKeyToAccount } = viem;
  const { sepolia } = viemChains;
  const { addEnsContracts } = ensjs;
  const { getOwner, getResolver, getPrice } = ensPublic;
  const { commitName, registerName, setResolver, setAddressRecord, setTextRecord } = ensWallet;
  const { randomSecret } = await import("@ensdomains/ensjs/utils");

  const ensChain = addEnsContracts(sepolia);

  const publicClient = createPublicClient({
    chain: ensChain,
    transport: http(sepoliaRpcUrl)
  });

  const account = privateKeyToAccount(ensPrivateKey);
  const walletClient = createWalletClient({
    chain: ensChain,
    transport: http(sepoliaRpcUrl),
    account
  });

  const signer = account.address;
  const publicResolverAddress = ensChain.contracts.ensPublicResolver.address;

  const nameOwner = await getOwner(publicClient, { name: ensName });
  const currentOwnershipLevel = nameOwner?.ownershipLevel || null;

  // Register if unowned.
  if (!nameOwner) {
    const secret = randomSecret();

    // Commit then register.
    const commitmentHash = await commitName(walletClient, {
      name: ensName,
      owner: signer,
      duration: 31536000, // default (1y). If you need different durations, extend env/params.
      secret,
      resolverAddress: publicResolverAddress
    });
    await publicClient.waitForTransactionReceipt({ hash: commitmentHash });

    // ENS name commitments have a validity buffer; the helper script used 60s.
    await new Promise((resolve) => setTimeout(resolve, 60 * 1000));

    const price = await getPrice(publicClient, { nameOrNames: ensName, duration: 31536000 });
    const value = (price.base + price.premium) * 110n / 100n;

    const registerHash = await registerName(walletClient, {
      name: ensName,
      owner: signer,
      duration: 31536000,
      secret,
      resolverAddress: publicResolverAddress,
      value
    });
    await publicClient.waitForTransactionReceipt({ hash: registerHash });
  } else if (String(nameOwner.owner).toLowerCase() !== String(signer).toLowerCase()) {
    throw new Error(`ENS name is owned by ${nameOwner.owner}, not signer ${signer}.`);
  }

  // Re-fetch ownership info in case registration created a wrapped name.
  const refreshedOwner = await getOwner(publicClient, { name: ensName });
  const refreshedOwnershipLevel = refreshedOwner?.ownershipLevel || null;

  // Ensure resolver is the public resolver.
  const currentResolver = await getResolver(publicClient, { name: ensName });
  if (!currentResolver || String(currentResolver).toLowerCase() !== String(publicResolverAddress).toLowerCase()) {
    const contract = refreshedOwnershipLevel === "nameWrapper" ? "nameWrapper" : "registry";
    const resolverHash = await setResolver(walletClient, {
      name: ensName,
      contract,
      resolverAddress: publicResolverAddress
    });
    await publicClient.waitForTransactionReceipt({ hash: resolverHash });
  }

  // Set addr record (coin=60/ETH) to arcActorAddress.
  const addrHash = await setAddressRecord(walletClient, {
    name: ensName,
    coin: ETH_COIN_TYPE,
    value: arcActorAddress,
    resolverAddress: publicResolverAddress
  });
  await publicClient.waitForTransactionReceipt({ hash: addrHash });

  // Set required text records.
  const normalizedTokenUri = typeof tokenUri === "string" ? tokenUri.trim() : "";
  const normalizedCapabilitiesUri = typeof capabilitiesUri === "string" ? capabilitiesUri.trim() : "";

  const textPairs = [
    ["agentId", agentId],
    ["tokenUri", normalizedTokenUri || null],
    ["capabilitiesUri", normalizedCapabilitiesUri || null],
    ["allowedIntents", allowedIntent],
    ["arcAddress", arcActorAddress]
  ];

  for (const [key, value] of textPairs) {
    const txHash = await setTextRecord(walletClient, {
      name: ensName,
      key,
      value: value === null ? null : String(value),
      resolverAddress: publicResolverAddress
    });
    await publicClient.waitForTransactionReceipt({ hash: txHash });
  }
}

module.exports = {
  setupAgentEns
};

