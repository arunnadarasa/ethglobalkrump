"use strict";

const AGENT_REGISTRY_ABI = [
  {
    type: "function",
    name: "getAgent",
    stateMutability: "view",
    inputs: [{ name: "agentId", type: "string" }],
    outputs: [
      { name: "outAgentId", type: "string" },
      { name: "controller", type: "address" },
      { name: "ensName", type: "string" },
      { name: "tokenUri", type: "string" },
      { name: "capabilitiesUri", type: "string" },
      { name: "metadataUri", type: "string" },
      { name: "active", type: "bool" },
      { name: "createdAt", type: "uint64" },
      { name: "updatedAt", type: "uint64" }
    ]
  },
  {
    type: "function",
    name: "exists",
    stateMutability: "view",
    inputs: [{ name: "agentId", type: "string" }],
    outputs: [{ name: "", type: "bool" }]
  },
  {
    type: "function",
    name: "verifyEnsLink",
    stateMutability: "view",
    inputs: [
      { name: "agentId", type: "string" },
      { name: "ensName", type: "string" }
    ],
    outputs: [{ name: "", type: "bool" }]
  }
];

function normalizeEnsName(value) {
  return String(value || "").trim().toLowerCase();
}

async function createAgentRegistryClient({
  rpcUrl,
  registryAddress,
  chain,
  abi = AGENT_REGISTRY_ABI
} = {}) {
  const normalizedRpcUrl = String(rpcUrl || "").trim();
  const normalizedRegistryAddress = String(registryAddress || "").trim();
  if (!normalizedRpcUrl) {
    throw new Error("rpcUrl is required");
  }
  if (!/^0x[a-fA-F0-9]{40}$/.test(normalizedRegistryAddress)) {
    throw new Error("registryAddress must be a valid EVM address");
  }

  const viem = await import("viem");
  const viemChains = await import("viem/chains");
  const { createPublicClient, http } = viem;
  const chainConfig = chain || viemChains.sepolia;

  const client = createPublicClient({
    chain: chainConfig,
    transport: http(normalizedRpcUrl)
  });

  async function exists(agentId) {
    const id = String(agentId || "").trim();
    if (!id) {
      return false;
    }
    return client.readContract({
      address: normalizedRegistryAddress,
      abi,
      functionName: "exists",
      args: [id]
    });
  }

  async function getAgent(agentId) {
    const id = String(agentId || "").trim();
    if (!id) {
      return null;
    }
    try {
      const result = await client.readContract({
        address: normalizedRegistryAddress,
        abi,
        functionName: "getAgent",
        args: [id]
      });
      if (!Array.isArray(result) || result.length < 9) {
        return null;
      }
      return {
        agent_id: String(result[0] || ""),
        controller: String(result[1] || ""),
        ens_name: String(result[2] || ""),
        token_uri: String(result[3] || ""),
        capabilities_uri: String(result[4] || ""),
        metadata_uri: String(result[5] || ""),
        active: Boolean(result[6]),
        created_at_unix: Number(result[7] || 0),
        updated_at_unix: Number(result[8] || 0)
      };
    } catch (error) {
      const message = String(error?.message || "").toLowerCase();
      if (message.includes("agent missing")) {
        return null;
      }
      throw error;
    }
  }

  async function verifyEnsLink(agentId, ensName) {
    const id = String(agentId || "").trim();
    const name = normalizeEnsName(ensName);
    if (!id || !name) {
      return false;
    }
    return client.readContract({
      address: normalizedRegistryAddress,
      abi,
      functionName: "verifyEnsLink",
      args: [id, name]
    });
  }

  async function getVerification(agentId, ensName) {
    const [existsValue, agent, ensLinkMatch] = await Promise.all([
      exists(agentId),
      getAgent(agentId),
      verifyEnsLink(agentId, ensName)
    ]);
    return {
      available: true,
      exists: Boolean(existsValue),
      ens_link_match: Boolean(ensLinkMatch),
      agent
    };
  }

  return {
    getVerification,
    getAgent,
    exists,
    verifyEnsLink
  };
}

module.exports = {
  AGENT_REGISTRY_ABI,
  createAgentRegistryClient
};
