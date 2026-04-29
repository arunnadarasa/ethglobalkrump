import { http, createPublicClient, createWalletClient, privateKeyToAccount } from "viem";
import { sepolia } from "viem/chains";
import { addEnsContracts } from "@ensdomains/ensjs";
import { getOwner, getResolver, getPrice } from "@ensdomains/ensjs/public";
import {
  commitName,
  registerName,
  setResolver,
  setAddressRecord,
  setTextRecord
} from "@ensdomains/ensjs/wallet";
import { randomSecret } from "@ensdomains/ensjs/utils";

function getArgValue(flag) {
  const prefix = `--${flag}=`;
  const arg = process.argv.find((a) => typeof a === "string" && a.startsWith(prefix));
  return arg ? arg.slice(prefix.length) : undefined;
}

async function main() {
  const ENS_NAME = getArgValue("ENS_NAME") || process.env.ENS_NAME || "";
  const ENS_PRIVATE_KEY = getArgValue("ENS_PRIVATE_KEY") || process.env.ENS_PRIVATE_KEY || "";
  const ENS_SEPOLIA_RPC_URL = getArgValue("ENS_SEPOLIA_RPC_URL") || process.env.ENS_SEPOLIA_RPC_URL || "https://rpc.sepolia.org";

  const ENS_AGENT_ID = getArgValue("ENS_AGENT_ID") || process.env.ENS_AGENT_ID || "";
  const ENS_TOKEN_URI = getArgValue("ENS_TOKEN_URI") || process.env.ENS_TOKEN_URI || "";
  const ENS_CAPABILITIES_URI = getArgValue("ENS_CAPABILITIES_URI") || process.env.ENS_CAPABILITIES_URI || "";
  const ENS_ALLOWED_INTENTS =
    getArgValue("ENS_ALLOWED_INTENTS") || process.env.ENS_ALLOWED_INTENTS || "";

  // 0x... address to place into ENS addr record (used by Krump as the “agent actor address”).
  const AGENT_ARC_ADDRESS = getArgValue("AGENT_ARC_ADDRESS") || process.env.AGENT_ARC_ADDRESS || "";

  const ENS_DURATION_SECONDS = Number(getArgValue("ENS_DURATION_SECONDS") || process.env.ENS_DURATION_SECONDS || 31536000);

  if (!ENS_NAME || typeof ENS_NAME !== "string") {
    throw new Error("Missing ENS_NAME");
  }
  if (!ENS_PRIVATE_KEY || typeof ENS_PRIVATE_KEY !== "string") {
    throw new Error("Missing ENS_PRIVATE_KEY");
  }
  if (!AGENT_ARC_ADDRESS || typeof AGENT_ARC_ADDRESS !== "string") {
    throw new Error("Missing AGENT_ARC_ADDRESS (the Arc actor address to write into ENS addr record)");
  }
  if (!ENS_AGENT_ID) {
    throw new Error("Missing ENS_AGENT_ID (text record key: agentId)");
  }
  if (!ENS_CAPABILITIES_URI) {
    throw new Error("Missing ENS_CAPABILITIES_URI (text record key: capabilitiesUri)");
  }
  if (!ENS_ALLOWED_INTENTS) {
    throw new Error("Missing ENS_ALLOWED_INTENTS (comma-separated intent ids; text record key: allowedIntents)");
  }

  const account = privateKeyToAccount(ENS_PRIVATE_KEY);
  const ensChain = addEnsContracts(sepolia);

  const publicClient = createPublicClient({
    chain: ensChain,
    transport: http(ENS_SEPOLIA_RPC_URL)
  });

  const walletClient = createWalletClient({
    chain: ensChain,
    transport: http(ENS_SEPOLIA_RPC_URL),
    account
  });

  const nameOwner = await getOwner(publicClient, { name: ENS_NAME });
  let currentOwnershipLevel = nameOwner?.ownershipLevel || null;
  const signer = account.address;

  // ENS public resolver for Sepolia from ensjs chain constants.
  const publicResolverAddress = ensChain.contracts.ensPublicResolver.address;

  console.log("[ens-setup] signer:", signer);
  console.log("[ens-setup] name:", ENS_NAME);
  console.log("[ens-setup] owner:", nameOwner?.owner || null, "level:", currentOwnershipLevel || "none");

  if (!nameOwner) {
    console.log("[ens-setup] Name is unowned; registering...");
    const secret = randomSecret();

    // 1) Commit
    const commitmentHash = await commitName(walletClient, {
      name: ENS_NAME,
      owner: signer,
      duration: ENS_DURATION_SECONDS,
      secret,
      resolverAddress: publicResolverAddress
    });
    console.log("[ens-setup] commitName tx:", commitmentHash);
    await publicClient.waitForTransactionReceipt({ hash: commitmentHash });

    // 2) Register after commitment finality buffer
    console.log("[ens-setup] waiting for commitment finality (60s)...");
    await new Promise((resolve) => setTimeout(resolve, 60 * 1000));

    const price = await getPrice(publicClient, { nameOrNames: ENS_NAME, duration: ENS_DURATION_SECONDS });
    const value = (price.base + price.premium) * 110n / 100n; // add 10% buffer

    const registerHash = await registerName(walletClient, {
      name: ENS_NAME,
      owner: signer,
      duration: ENS_DURATION_SECONDS,
      secret,
      resolverAddress: publicResolverAddress,
      value
    });
    console.log("[ens-setup] registerName tx:", registerHash);
    await publicClient.waitForTransactionReceipt({ hash: registerHash });

    const refreshedOwner = await getOwner(publicClient, { name: ENS_NAME });
    currentOwnershipLevel = refreshedOwner?.ownershipLevel || null;
  } else if (String(nameOwner.owner).toLowerCase() !== String(signer).toLowerCase()) {
    throw new Error(`ENS name is owned by ${nameOwner.owner}, not signer ${signer}. Re-run with the correct ENS_PRIVATE_KEY.`);
  }

  // Ensure resolver is the public resolver.
  const currentResolver = await getResolver(publicClient, { name: ENS_NAME });
  if (!currentResolver || String(currentResolver).toLowerCase() !== String(publicResolverAddress).toLowerCase()) {
    console.log("[ens-setup] Setting resolver to public resolver...");
    const contract = currentOwnershipLevel === "nameWrapper" ? "nameWrapper" : "registry";
    const resolverHash = await setResolver(walletClient, {
      name: ENS_NAME,
      contract,
      resolverAddress: publicResolverAddress
    });
    console.log("[ens-setup] setResolver tx:", resolverHash);
    await publicClient.waitForTransactionReceipt({ hash: resolverHash });
  }

  // Write addr record (coin=60 == ETH).
  console.log("[ens-setup] Setting addr record for coin=60 (ETH) to AGENT_ARC_ADDRESS...");
  const addrHash = await setAddressRecord(walletClient, {
    name: ENS_NAME,
    coin: 60,
    value: AGENT_ARC_ADDRESS,
    resolverAddress: publicResolverAddress
  });
  console.log("[ens-setup] setAddressRecord tx:", addrHash);
  await publicClient.waitForTransactionReceipt({ hash: addrHash });

  // Write required text records.
  const allowedIntentsCsv = ENS_ALLOWED_INTENTS.includes("[") ? ENS_ALLOWED_INTENTS : ENS_ALLOWED_INTENTS;
  const textRecords = [
    ["agentId", ENS_AGENT_ID],
    ["tokenUri", ENS_TOKEN_URI || null],
    ["capabilitiesUri", ENS_CAPABILITIES_URI],
    ["allowedIntents", allowedIntentsCsv],
    ["arcAddress", AGENT_ARC_ADDRESS]
  ];

  for (const [key, value] of textRecords) {
    console.log(`[ens-setup] Setting text ${key} -> ${value ? value : "(null)"}`);
    const txHash = await setTextRecord(walletClient, {
      name: ENS_NAME,
      key,
      value: value === null ? null : String(value),
      resolverAddress: publicResolverAddress
    });
    console.log(`[ens-setup] setTextRecord(${key}) tx:`, txHash);
    await publicClient.waitForTransactionReceipt({ hash: txHash });
  }
  console.log("[ens-setup] Done.");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[ens-setup] failed:", err?.message || err);
    process.exit(1);
  });

