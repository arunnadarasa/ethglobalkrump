"use strict";

const { AGENT_REGISTRY_ABI } = require("./registryClient");

async function createAgentRegistryWriter({
  rpcUrl,
  privateKey,
  registryAddress,
  chain
} = {}) {
  const normalizedRpcUrl = String(rpcUrl || "").trim();
  const normalizedPrivateKey = String(privateKey || "").trim();
  const normalizedRegistryAddress = String(registryAddress || "").trim();
  if (!normalizedRpcUrl) {
    throw new Error("rpcUrl is required");
  }
  if (!normalizedPrivateKey) {
    throw new Error("privateKey is required");
  }
  if (!/^0x[a-fA-F0-9]{40}$/.test(normalizedRegistryAddress)) {
    throw new Error("registryAddress must be a valid EVM address");
  }

  const viem = await import("viem");
  const viemChains = await import("viem/chains");
  const viemAccounts = await import("viem/accounts");
  const { createWalletClient, createPublicClient, http, isAddress } = viem;
  const { privateKeyToAccount } = viemAccounts;
  const chainConfig = chain || viemChains.sepolia;

  const account = privateKeyToAccount(normalizedPrivateKey);
  const walletClient = createWalletClient({
    account,
    chain: chainConfig,
    transport: http(normalizedRpcUrl)
  });
  const publicClient = createPublicClient({
    chain: chainConfig,
    transport: http(normalizedRpcUrl)
  });

  async function upsertAgent({
    agentId,
    controller,
    ensName,
    tokenUri,
    capabilitiesUri,
    metadataUri,
    active
  } = {}) {
    const normalizedAgentId = String(agentId || "").trim();
    const normalizedEnsName = String(ensName || "").trim().toLowerCase();
    const normalizedController = String(controller || "").trim() || account.address;
    if (!normalizedAgentId) {
      throw new Error("agentId is required");
    }
    if (!normalizedEnsName) {
      throw new Error("ensName is required");
    }
    if (!isAddress(normalizedController)) {
      throw new Error("controller must be a valid EVM address");
    }

    const hash = await walletClient.writeContract({
      address: normalizedRegistryAddress,
      abi: AGENT_REGISTRY_ABI,
      functionName: "upsertAgent",
      args: [
        normalizedAgentId,
        normalizedController,
        normalizedEnsName,
        String(tokenUri || "").trim(),
        String(capabilitiesUri || "").trim(),
        String(metadataUri || "").trim(),
        Boolean(active)
      ]
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    return {
      tx_hash: hash,
      receipt,
      signer: account.address,
      registry_address: normalizedRegistryAddress
    };
  }

  return {
    signerAddress: account.address,
    upsertAgent
  };
}

module.exports = {
  createAgentRegistryWriter
};
