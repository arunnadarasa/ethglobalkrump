import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadDotenv } from "dotenv";
import { createWalletClient, createPublicClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import solc from "solc";

loadDotenv();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "../..");

const CONTRACT_PATH = path.join(projectRoot, "contracts", "AgentRegistry8004.sol");
const OUTPUT_PATH = path.join(projectRoot, "artifacts", "agent-registry-sepolia.json");

function requireEnv(name) {
  const value = String(process.env[name] || "").trim();
  if (!value) {
    throw new Error(`Missing required env: ${name}`);
  }
  return value;
}

function compileContract(source) {
  const input = {
    language: "Solidity",
    sources: {
      "AgentRegistry8004.sol": { content: source }
    },
    settings: {
      viaIR: true,
      optimizer: { enabled: true, runs: 200 },
      outputSelection: {
        "*": {
          "*": ["abi", "evm.bytecode.object"]
        }
      }
    }
  };
  const output = JSON.parse(solc.compile(JSON.stringify(input)));
  const errors = Array.isArray(output?.errors) ? output.errors : [];
  const fatal = errors.filter((entry) => entry?.severity === "error");
  if (fatal.length > 0) {
    throw new Error(
      `Solidity compile failed:\n${fatal.map((entry) => `- ${entry.formattedMessage || entry.message}`).join("\n")}`
    );
  }
  const contract = output?.contracts?.["AgentRegistry8004.sol"]?.AgentRegistry8004;
  if (!contract?.abi || !contract?.evm?.bytecode?.object) {
    throw new Error("Compiled contract artifact is missing ABI/bytecode.");
  }
  return {
    abi: contract.abi,
    bytecode: `0x${contract.evm.bytecode.object}`
  };
}

async function main() {
  const rpcUrl = String(process.env.ENS_SEPOLIA_RPC_URL || "https://rpc.sepolia.org").trim();
  const privateKey = requireEnv("ENS_PRIVATE_KEY");
  const initialOwner = String(process.env.ERC8004_REGISTRY_OWNER || "").trim();

  const source = await fs.readFile(CONTRACT_PATH, "utf8");
  const { abi, bytecode } = compileContract(source);

  const account = privateKeyToAccount(privateKey);
  const ownerArg = initialOwner || account.address;

  const wallet = createWalletClient({
    account,
    chain: sepolia,
    transport: http(rpcUrl)
  });
  const publicClient = createPublicClient({
    chain: sepolia,
    transport: http(rpcUrl)
  });

  console.log("[deploy-agent-registry] deployer:", account.address);
  console.log("[deploy-agent-registry] owner arg:", ownerArg);
  console.log("[deploy-agent-registry] rpc host:", new URL(rpcUrl).host);

  const hash = await wallet.deployContract({
    abi,
    bytecode,
    args: [ownerArg]
  });
  console.log("[deploy-agent-registry] tx hash:", hash);

  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  const contractAddress = receipt.contractAddress;
  if (!contractAddress) {
    throw new Error("Deployment receipt missing contractAddress");
  }
  console.log("[deploy-agent-registry] contract:", contractAddress);

  await fs.mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  await fs.writeFile(
    OUTPUT_PATH,
    JSON.stringify(
      {
        chain: "sepolia",
        chain_id: sepolia.id,
        rpc_url: rpcUrl,
        deployer: account.address,
        owner: ownerArg,
        tx_hash: hash,
        contract_address: contractAddress,
        deployed_at: new Date().toISOString(),
        abi
      },
      null,
      2
    ),
    "utf8"
  );
  console.log("[deploy-agent-registry] wrote artifact:", OUTPUT_PATH);
}

main().catch((error) => {
  console.error("[deploy-agent-registry] failed:", error?.message || error);
  process.exit(1);
});
