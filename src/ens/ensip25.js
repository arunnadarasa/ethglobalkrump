"use strict";

function parseCaip10LikeRegistry(value) {
  const raw = String(value || "").trim();
  const match = raw.match(/^eip155:(\d+):(0x[a-fA-F0-9]{40})$/);
  if (!match) {
    return null;
  }
  return {
    chainId: Number(match[1]),
    address: match[2].toLowerCase()
  };
}

function toEvenHex(hex) {
  const normalized = String(hex || "").replace(/^0x/i, "").toLowerCase();
  if (!normalized) {
    return "";
  }
  return normalized.length % 2 === 0 ? normalized : `0${normalized}`;
}

function toHexByteLength(hexWithoutPrefix) {
  const bytes = Math.floor(String(hexWithoutPrefix || "").length / 2);
  return bytes.toString(16).padStart(2, "0");
}

function toInteroperableRegistryAddress({ registryAddress, chainId } = {}) {
  const address = String(registryAddress || "").trim().toLowerCase();
  const chain = Number(chainId || 0);
  if (!/^0x[a-f0-9]{40}$/.test(address)) {
    throw new Error("registryAddress must be a valid EVM address");
  }
  if (!Number.isInteger(chain) || chain < 1) {
    throw new Error("chainId must be a positive integer");
  }
  const chainHex = toEvenHex(chain.toString(16));
  const addrHex = toEvenHex(address.slice(2));
  // ERC-7930 interoperable address style used by ENSIP-25 examples:
  // 0x0001 + 000001 + <chainLen> + <chainHex> + <addrLen> + <addrHex>
  return `0x0001000001${toHexByteLength(chainHex)}${chainHex}${toHexByteLength(addrHex)}${addrHex}`;
}

function parseInteroperableRegistryAddress(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (!/^0x[0-9a-f]+$/.test(raw)) {
    return null;
  }
  const hex = raw.slice(2);
  if (hex.length < 16 || hex.length % 2 !== 0) {
    return null;
  }
  // ENSIP-25 examples rely on ERC-7930 style:
  // 0001 | 000001 | <chainLen:1 byte> | <chainHex> | <addrLen:1 byte> | <addrHex>
  if (!hex.startsWith("0001000001")) {
    return null;
  }
  let cursor = 10;
  const chainLen = Number.parseInt(hex.slice(cursor, cursor + 2), 16);
  if (!Number.isInteger(chainLen) || chainLen <= 0) {
    return null;
  }
  cursor += 2;
  const chainHex = hex.slice(cursor, cursor + chainLen * 2);
  if (chainHex.length !== chainLen * 2) {
    return null;
  }
  cursor += chainLen * 2;
  const addrLen = Number.parseInt(hex.slice(cursor, cursor + 2), 16);
  if (!Number.isInteger(addrLen) || addrLen !== 20) {
    return null;
  }
  cursor += 2;
  const addrHex = hex.slice(cursor, cursor + addrLen * 2);
  if (addrHex.length !== 40 || !/^[0-9a-f]{40}$/.test(addrHex)) {
    return null;
  }
  cursor += addrLen * 2;
  if (cursor !== hex.length) {
    return null;
  }
  const chainId = Number.parseInt(chainHex || "0", 16);
  if (!Number.isInteger(chainId) || chainId < 1) {
    return null;
  }
  return {
    normalized: raw,
    chainId,
    address: `0x${addrHex}`
  };
}

function getRegistryInteropAddress({
  registryInteropAddress,
  registryAddress,
  chainId,
  fallbackRegistry
} = {}) {
  const direct = String(registryInteropAddress || "").trim();
  if (direct) {
    const parsedDirect = parseInteroperableRegistryAddress(direct);
    if (!parsedDirect) {
      throw new Error("registryInteropAddress must be a valid ERC-7930 interoperable address");
    }
    return parsedDirect.normalized;
  }
  const parsed = parseCaip10LikeRegistry(fallbackRegistry);
  if (parsed) {
    return toInteroperableRegistryAddress({
      registryAddress: parsed.address,
      chainId: parsed.chainId
    });
  }
  return toInteroperableRegistryAddress({
    registryAddress,
    chainId
  });
}

function buildEnsip25Key({ registryInteropAddress, agentId } = {}) {
  const registry = String(registryInteropAddress || "").trim().toLowerCase();
  const normalizedAgentId = String(agentId || "").trim();
  if (!registry) {
    throw new Error("registryInteropAddress is required");
  }
  if (!normalizedAgentId) {
    throw new Error("agentId is required");
  }
  if (normalizedAgentId.includes("[") || normalizedAgentId.includes("]")) {
    throw new Error("agentId must not contain [ or ]");
  }
  return `agent-registration[${registry}][${normalizedAgentId}]`;
}

function hasEnsip25Attestation(value) {
  return String(value || "").trim().length > 0;
}

module.exports = {
  parseCaip10LikeRegistry,
  parseInteroperableRegistryAddress,
  toInteroperableRegistryAddress,
  getRegistryInteropAddress,
  buildEnsip25Key,
  hasEnsip25Attestation
};
