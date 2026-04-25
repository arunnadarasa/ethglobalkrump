import os

import boa
from eth_account import Account


def required_env(name: str) -> str:
    value = os.getenv(name, "").strip()
    if not value:
        raise RuntimeError(f"Missing required env var: {name}")
    return value


def main() -> None:
    rpc_url = required_env("ARC_RPC_URL")
    deployer_private_key = required_env("DEPLOYER_PRIVATE_KEY")

    max_ticket_minor = int(os.getenv("VYPER_POLICY_MAX_TICKET_MINOR", "5000"))
    daily_cap_minor = int(os.getenv("VYPER_POLICY_DAILY_CAP_MINOR", "25000"))

    boa.set_network_env(rpc_url)
    deployer = Account.from_key(deployer_private_key)
    boa.env.add_account(deployer)

    contract = boa.load("contracts/AgentSettlementPolicy.vy", max_ticket_minor, daily_cap_minor)
    print("Deployment successful")
    print(f"Contract address: {contract.address}")
    print(f"Owner: {deployer.address}")
    print(f"max_ticket_minor={max_ticket_minor}")
    print(f"daily_cap_minor={daily_cap_minor}")


if __name__ == "__main__":
    main()
