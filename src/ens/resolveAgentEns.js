"use strict";

// ENS Universal Resolver read helper.
//
// This intentionally performs all ENS resolution on the Ethereum (Sepolia) RPC
// where the ENS Universal Resolver + ENS contracts live, then returns the
// resolved values as plain strings for downstream Arc/KeeperHub flows.
//
// Resolution strategy:
// - Normalize ENS name (lowercase, etc.)
// - Build a multicall payload that queries:
//   - addr(node)
//   - text(node, agentId)
//   - text(node, tokenUri)
//   - text(node, capabilitiesUri)
//   - text(node, allowedIntents)
// - Call UniversalResolver.resolve(dnsEncodedName, multicallPayload)
// - Decode multicall return values back into individual record values

// Sepolia Universal Resolver deployment (see `@ensdomains/ensjs` chain contract constants).
const DEFAULT_UNIVERSAL_RESOLVER_ADDRESS = "0x3c85752a5d47DD09D677C645Ff2A938B38fbFEbA";

const TEXT_KEYS = [
  "agentId",
  "tokenUri",
  "capabilitiesUri",
  "allowedIntents",
  "arcAddress",
  "attestor",
  "attestationUpdatedAt",
  "highRiskIntents",
  "payoutMode",
  "privacyReceiver",
  "privacyUpdatedAt",
  "agentVersion",
  "capabilitiesVersion",
  "compatibleIntents"
];

function toNonEmptyString(value) {
  const s = typeof value === "string" ? value.trim() : "";
  return s || null;
}

function parseAllowedIntents(value) {
  const s = typeof value === "string" ? value.trim() : "";
  if (!s) {
    return [];
  }
  // Support either JSON arrays or comma-separated lists.
  try {
    if (s.startsWith("[") || s.startsWith("{")) {
      const parsed = JSON.parse(s);
      if (Array.isArray(parsed)) {
        return parsed.map((x) => String(x).trim()).filter(Boolean);
      }
    }
  } catch (_e) {
    // fall through to CSV parsing
  }
  return s
    .split(",")
    .map((x) => String(x).trim())
    .filter(Boolean);
}

function parseStringList(value) {
  return parseAllowedIntents(value);
}

function isResolverNotFoundError(error) {
  const message = [error?.shortMessage, error?.details, error?.message].filter(Boolean).join(" ").toLowerCase();
  return message.includes("resolvernotfound") || message.includes("resolver not found");
}

function isTransientReadError(error) {
  const message = [error?.shortMessage, error?.details, error?.message].filter(Boolean).join(" ").toLowerCase();
  return (
    message.includes("request took too long") ||
    message.includes("request timed out") ||
    message.includes("the request timed out") ||
    message.includes("http error")
  );
}

async function resolveAgentEns({
  ensName,
  sepoliaRpcUrl,
  ensip25Key,
  universalResolverAddress = DEFAULT_UNIVERSAL_RESOLVER_ADDRESS
} = {}) {
  if (!ensName || typeof ensName !== "string") {
    throw new Error("ensName is required (string)");
  }
  if (!sepoliaRpcUrl || typeof sepoliaRpcUrl !== "string") {
    throw new Error("sepoliaRpcUrl is required (string)");
  }

  // Dynamic import keeps the file syntactically valid even if deps are added later.
  const viem = await import("viem");
  const viemEns = await import("viem/ens");

  const {
    createPublicClient,
    http,
    parseAbi,
    encodeFunctionData,
    decodeFunctionResult,
    toHex
  } = viem;
  const { normalize, namehash, packetToBytes } = viemEns;
  const { sepolia } = await import("viem/chains");

  const universalResolverAbi = parseAbi([
    "error ResolverNotFound(bytes name)",
    "error ResolverNotContract(bytes name, address resolver)",
    "error UnsupportedResolverProfile(bytes4 selector)",
    "error ResolverError(bytes errorData)",
    "error ReverseAddressMismatch(string primary, bytes primaryAddress)",
    "error HttpError(uint16 status, string message)",
    "function resolve(bytes name, bytes data) view returns (bytes result, address resolver)"
  ]);

  const simpleResolverAbi = parseAbi([
    "function addr(bytes32 node) view returns (address)",
    "function text(bytes32 node, string key) view returns (string)"
  ]);

  const multicallAbi = parseAbi(["function multicall(bytes[] calldata data) view returns (bytes[] results)"]);

  const normalizedName = normalize(ensName.trim());
  const dnsEncodedName = toHex(packetToBytes(normalizedName));
  const node = namehash(normalizedName);

  const dynamicTextKeys = ensip25Key ? [...TEXT_KEYS, String(ensip25Key).trim()] : TEXT_KEYS;
  // Compose resolverCalls in a fixed order so decoding is deterministic.
  const resolverCalls = [
    {
      abi: simpleResolverAbi,
      functionName: "addr",
      args: [node]
    },
    ...dynamicTextKeys.map((key) => ({
      abi: simpleResolverAbi,
      functionName: "text",
      args: [node, key]
    }))
  ];

  const resolverCallData = resolverCalls.map((call) =>
    encodeFunctionData({
      abi: call.abi,
      functionName: call.functionName,
      args: call.args
    })
  );

  const multicallData = encodeFunctionData({
    abi: multicallAbi,
    functionName: "multicall",
    args: [resolverCallData]
  });

  const client = createPublicClient({
    chain: sepolia,
    transport: http(sepoliaRpcUrl)
  });

  let result;
  try {
    result = await client.readContract({
      address: universalResolverAddress,
      abi: universalResolverAbi,
      functionName: "resolve",
      args: [dnsEncodedName, multicallData]
    });
  } catch (error) {
    // This happens for unconfigured/unregistered names. Treat as unresolved metadata,
    // not a hard failure, so UI can still show ownership/status checks cleanly.
    if (isResolverNotFoundError(error) || isTransientReadError(error)) {
      return {
        ens_name: normalizedName,
        agent_address: null,
        agentId: null,
        tokenUri: null,
        capabilitiesUri: null,
        allowedIntents: [],
        trust: {
          ensip25_verified: false,
          ensip25_key: ensip25Key || null,
          ensip25_value: null,
          attestor: null,
          attestation_updated_at: null,
          high_risk_intents: []
        },
        privacy: {
          payout_mode: "public",
          privacy_receiver: null,
          privacy_updated_at: null
        },
        versioning: {
          agent_version: null,
          capabilities_version: null,
          compatible_intents: []
        },
        text: {}
      };
    }
    throw error;
  }

  const resolvedBytes = Array.isArray(result) ? result[0] : result;
  const decodedMulticall = decodeFunctionResult({
    abi: multicallAbi,
    functionName: "multicall",
    data: resolvedBytes
  });

  const decoded = Array.isArray(decodedMulticall) ? decodedMulticall : [];
  const addrResultBytes = decoded[0];
  const textResultBytes = decoded.slice(1);

  let addr = null;
  if (typeof addrResultBytes === "string" && addrResultBytes) {
    try {
      addr = decodeFunctionResult({
        abi: simpleResolverAbi,
        functionName: "addr",
        data: addrResultBytes
      });
    } catch (_error) {
      addr = null;
    }
  }

  const textValues = textResultBytes.map((data) => {
    if (typeof data !== "string" || !data) {
      return null;
    }
    try {
      const value = decodeFunctionResult({
        abi: simpleResolverAbi,
        functionName: "text",
        data
      });
      return toNonEmptyString(value);
    } catch (_error) {
      return null;
    }
  });

  const text = {};
  for (let i = 0; i < dynamicTextKeys.length; i += 1) {
    text[dynamicTextKeys[i]] = toNonEmptyString(textValues[i]);
  }

  const allowedIntents = parseAllowedIntents(text.allowedIntents);
  const arcAddress = toNonEmptyString(text.arcAddress);
  const highRiskIntents = parseStringList(text.highRiskIntents);
  const compatibleIntents = parseStringList(text.compatibleIntents);
  const payoutModeRaw = toNonEmptyString(text.payoutMode);
  const payoutMode = payoutModeRaw === "privacy" ? "privacy" : "public";

  const agent_address = arcAddress || (typeof addr === "string" ? addr : null);

  const ensip25Value = ensip25Key ? toNonEmptyString(text[String(ensip25Key).trim()]) : null;

  return {
    ens_name: normalizedName,
    agent_address,
    agentId: text.agentId || null,
    tokenUri: text.tokenUri || null,
    capabilitiesUri: text.capabilitiesUri || null,
    allowedIntents,
    trust: {
      ensip25_verified: Boolean(ensip25Value),
      ensip25_key: ensip25Key || null,
      ensip25_value: ensip25Value,
      attestor: toNonEmptyString(text.attestor),
      attestation_updated_at: toNonEmptyString(text.attestationUpdatedAt),
      high_risk_intents: highRiskIntents
    },
    privacy: {
      payout_mode: payoutMode,
      privacy_receiver: toNonEmptyString(text.privacyReceiver),
      privacy_updated_at: toNonEmptyString(text.privacyUpdatedAt)
    },
    versioning: {
      agent_version: toNonEmptyString(text.agentVersion),
      capabilities_version: toNonEmptyString(text.capabilitiesVersion),
      compatible_intents: compatibleIntents
    },
    // full text map (useful for debugging / demos)
    text
  };
}

module.exports = {
  resolveAgentEns,
  parseAllowedIntents
};

