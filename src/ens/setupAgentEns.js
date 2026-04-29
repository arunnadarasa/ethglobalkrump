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

function formatEthFromWei(wei) {
  const value = typeof wei === "bigint" ? wei : BigInt(wei || 0);
  const base = 10n ** 18n;
  const whole = value / base;
  const frac = value % base;
  if (frac === 0n) {
    return `${whole.toString()}.0`;
  }
  const fracStr = frac.toString().padStart(18, "0").replace(/0+$/, "");
  return `${whole.toString()}.${fracStr}`;
}

function debugEnsServerLog(hypothesisId, location, message, data = {}) {
  // #region agent log
  fetch("http://127.0.0.1:7488/ingest/73a172ba-d779-4052-830f-514180f8d969", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Debug-Session-Id": "995d4d"
    },
    body: JSON.stringify({
      sessionId: "995d4d",
      runId: "ens-setup-privatekey-import",
      hypothesisId,
      location,
      message,
      data,
      timestamp: Date.now()
    })
  }).catch(() => {});
  // #endregion
}

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
  const runStartMs = Date.now();
  const rpcHost = (() => {
    try {
      return new URL(String(sepoliaRpcUrl || "")).host || "invalid-url";
    } catch (_err) {
      return "invalid-url";
    }
  })();
  debugEnsServerLog("T1", "src/ens/setupAgentEns.js:start", "setup run started", {
    rpcHost,
    usesDefaultRpc: String(sepoliaRpcUrl || "") === DEFAULT_ENS_SEPOLIA_RPC_URL
  });

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
  const viemAccounts = await import("viem/accounts");
  const viemChains = await import("viem/chains");
  const ensjs = await import("@ensdomains/ensjs");
  const ensPublic = await import("@ensdomains/ensjs/public");
  const ensWallet = await import("@ensdomains/ensjs/wallet");

  const { createPublicClient, createWalletClient, http } = viem;
  const { privateKeyToAccount } = viemAccounts;
  debugEnsServerLog("S1", "src/ens/setupAgentEns.js:import-viem", "loaded viem module export probes", {
    hasCreatePublicClient: typeof createPublicClient === "function",
    hasCreateWalletClient: typeof createWalletClient === "function",
    hasHttp: typeof http === "function",
    hasPrivateKeyToAccount: typeof privateKeyToAccount === "function",
    hasAccountsNamespace: Boolean(viem && viem.accounts),
    hasViemAccountsModule: Boolean(viemAccounts),
    hasDefaultExport: Boolean(viem && viem.default)
  });
  const { sepolia } = viemChains;
  const { addEnsContracts } = ensjs;
  const { getOwner, getResolver, getPrice } = ensPublic;
  const { commitName, registerName, setResolver, setAddressRecord, setTextRecord } = ensWallet;
  const { randomSecret } = await import("@ensdomains/ensjs/utils");

  debugEnsServerLog("S2", "src/ens/setupAgentEns.js:import-ensjs", "loaded ENS helper export probes", {
    hasAddEnsContracts: typeof addEnsContracts === "function",
    hasGetOwner: typeof getOwner === "function",
    hasSetAddressRecord: typeof setAddressRecord === "function"
  });

  const ensChain = addEnsContracts(sepolia);

  const publicClient = createPublicClient({
    chain: ensChain,
    transport: http(sepoliaRpcUrl)
  });

  debugEnsServerLog("S3", "src/ens/setupAgentEns.js:before-private-key-account", "about to derive wallet account", {
    privateKeyPrefix: String(ensPrivateKey || "").slice(0, 2),
    privateKeyLength: String(ensPrivateKey || "").length
  });
  const account = privateKeyToAccount(ensPrivateKey);
  debugEnsServerLog("S4", "src/ens/setupAgentEns.js:after-private-key-account", "derived wallet account", {
    hasAccountAddress: Boolean(account && account.address)
  });
  const walletClient = createWalletClient({
    chain: ensChain,
    transport: http(sepoliaRpcUrl),
    account
  });

  const signer = account.address;
  const publicResolverAddress = ensChain.contracts.ensPublicResolver.address;
  const signerBalanceWei = await publicClient.getBalance({ address: signer });
  debugEnsServerLog("S11", "src/ens/setupAgentEns.js:signer-balance", "loaded signer Sepolia balance", {
    signer,
    signerBalanceWei: signerBalanceWei.toString()
  });

  const ownerStartMs = Date.now();
  debugEnsServerLog("T2", "src/ens/setupAgentEns.js:getOwner:start", "calling getOwner", {
    elapsedMsFromStart: ownerStartMs - runStartMs
  });
  const nameOwner = await getOwner(publicClient, { name: ensName });
  debugEnsServerLog("T2", "src/ens/setupAgentEns.js:getOwner:done", "getOwner returned", {
    elapsedMsFromStart: Date.now() - runStartMs,
    callDurationMs: Date.now() - ownerStartMs
  });
  const currentOwnershipLevel = nameOwner?.ownershipLevel || null;
  debugEnsServerLog("S5", "src/ens/setupAgentEns.js:owner-check", "checked ENS ownership state", {
    hasNameOwner: Boolean(nameOwner),
    ownershipLevel: currentOwnershipLevel || null,
    ownerMatchesSigner: Boolean(
      nameOwner?.owner && String(nameOwner.owner).toLowerCase() === String(signer).toLowerCase()
    )
  });

  // Register if unowned.
  if (!nameOwner) {
    debugEnsServerLog("S6", "src/ens/setupAgentEns.js:register-branch", "name unowned; entering commit/register flow", {});
    if (signerBalanceWei <= 0n) {
      throw new Error(
        `Circle wallet mode requires Sepolia ETH for ENS signer gas. Signer ${signer} has 0 wei; fund it and retry.`
      );
    }
    const preflightPrice = await getPrice(publicClient, { nameOrNames: ensName, duration: 31536000 });
    const preflightValue = (preflightPrice.base + preflightPrice.premium) * 110n / 100n;
    debugEnsServerLog("S12", "src/ens/setupAgentEns.js:register-preflight-cost", "computed register value preflight", {
      signerBalanceWei: signerBalanceWei.toString(),
      requiredValueWei: preflightValue.toString()
    });
    if (signerBalanceWei < preflightValue) {
      const shortfallWei = preflightValue - signerBalanceWei;
      throw new Error(
        `Insufficient SepoliaETH for ENS registration value. Signer ${signer} balance=${formatEthFromWei(signerBalanceWei)} ETH, required≈${formatEthFromWei(preflightValue)} ETH, shortfall≈${formatEthFromWei(shortfallWei)} ETH. Top up signer and retry.`
      );
    }
    const secret = randomSecret();

    // Commit then register.
    const commitmentHash = await commitName(walletClient, {
      name: ensName,
      owner: signer,
      duration: 31536000, // default (1y). If you need different durations, extend env/params.
      secret,
      resolverAddress: publicResolverAddress
    });
    debugEnsServerLog("S7", "src/ens/setupAgentEns.js:commitName", "submitted commitName transaction", {
      hasCommitmentHash: Boolean(commitmentHash)
    });
    await publicClient.waitForTransactionReceipt({ hash: commitmentHash });
    debugEnsServerLog("S7", "src/ens/setupAgentEns.js:commitName", "commitName receipt confirmed", {});

    // ENS name commitments have a validity buffer; the helper script used 60s.
    await new Promise((resolve) => setTimeout(resolve, 60 * 1000));

    const registerHash = await registerName(walletClient, {
      name: ensName,
      owner: signer,
      duration: 31536000,
      secret,
      resolverAddress: publicResolverAddress,
      value: preflightValue
    });
    debugEnsServerLog("S8", "src/ens/setupAgentEns.js:registerName", "submitted registerName transaction", {
      hasRegisterHash: Boolean(registerHash)
    });
    await publicClient.waitForTransactionReceipt({ hash: registerHash });
    debugEnsServerLog("S8", "src/ens/setupAgentEns.js:registerName", "registerName receipt confirmed", {});
  } else if (String(nameOwner.owner).toLowerCase() !== String(signer).toLowerCase()) {
    throw new Error(`ENS name is owned by ${nameOwner.owner}, not signer ${signer}.`);
  } else {
    debugEnsServerLog("S6", "src/ens/setupAgentEns.js:register-branch", "name already owned by signer; skipping registration", {});
  }

  // Re-fetch ownership info in case registration created a wrapped name.
  const refreshedOwner = await getOwner(publicClient, { name: ensName });
  const refreshedOwnershipLevel = refreshedOwner?.ownershipLevel || null;
  debugEnsServerLog("S13", "src/ens/setupAgentEns.js:owner-refresh", "refreshed owner after register/ownership checks", {
    hasRefreshedOwner: Boolean(refreshedOwner),
    refreshedOwnershipLevel: refreshedOwnershipLevel || null,
    refreshedOwnerAddress: refreshedOwner?.owner || null
  });

  // Ensure resolver is the public resolver.
  const resolverStartMs = Date.now();
  debugEnsServerLog("T3", "src/ens/setupAgentEns.js:getResolver:start", "calling getResolver", {
    elapsedMsFromStart: resolverStartMs - runStartMs
  });
  const currentResolver = await getResolver(publicClient, { name: ensName });
  debugEnsServerLog("T3", "src/ens/setupAgentEns.js:getResolver:done", "getResolver returned", {
    elapsedMsFromStart: Date.now() - runStartMs,
    callDurationMs: Date.now() - resolverStartMs
  });
  debugEnsServerLog("S9", "src/ens/setupAgentEns.js:resolver-check", "checked resolver before update", {
    hasCurrentResolver: Boolean(currentResolver)
  });
  if (!currentResolver || String(currentResolver).toLowerCase() !== String(publicResolverAddress).toLowerCase()) {
    const contract = refreshedOwnershipLevel === "nameWrapper" ? "nameWrapper" : "registry";
    debugEnsServerLog("S14", "src/ens/setupAgentEns.js:setResolver:attempt", "attempting setResolver", {
      contract,
      currentResolver: currentResolver || null,
      targetResolver: publicResolverAddress,
      signer
    });
    try {
      const resolverHash = await setResolver(walletClient, {
        name: ensName,
        contract,
        resolverAddress: publicResolverAddress
      });
      debugEnsServerLog("S14", "src/ens/setupAgentEns.js:setResolver:submitted", "setResolver tx submitted", {
        hasResolverHash: Boolean(resolverHash)
      });
      await publicClient.waitForTransactionReceipt({ hash: resolverHash });
      debugEnsServerLog("S14", "src/ens/setupAgentEns.js:setResolver:confirmed", "setResolver tx confirmed", {});
    } catch (error) {
      debugEnsServerLog("S15", "src/ens/setupAgentEns.js:setResolver:failed", "setResolver failed", {
        message: error?.message || String(error),
        shortMessage: error?.shortMessage || null,
        details: error?.details || null
      });
      throw error;
    }
  } else {
    debugEnsServerLog("S14", "src/ens/setupAgentEns.js:setResolver:skipped", "resolver already set; skipped", {
      currentResolver
    });
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
  debugEnsServerLog("S10", "src/ens/setupAgentEns.js:complete", "ENS setup completed all writes", {});
  debugEnsServerLog("T4", "src/ens/setupAgentEns.js:finish", "setup run finished", {
    totalDurationMs: Date.now() - runStartMs
  });
}

module.exports = {
  setupAgentEns
};

