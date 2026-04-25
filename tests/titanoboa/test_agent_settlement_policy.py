import boa
import pytest


@pytest.fixture
def policy():
    return boa.load("contracts/AgentSettlementPolicy.vy", 500, 1000)


def test_authorize_within_limits(policy):
    agent = boa.env.generate_address("payments-agent")
    assert policy.can_authorize(agent, 300) is True
    assert policy.authorize_payment(agent, 300) is True
    assert policy.spent_today_minor(agent) == 300


def test_reject_ticket_above_max(policy):
    agent = boa.env.generate_address("payments-agent")
    assert policy.can_authorize(agent, 600) is False
    with pytest.raises(Exception):
        policy.authorize_payment(agent, 600)


def test_reject_when_daily_cap_exceeded(policy):
    agent = boa.env.generate_address("payments-agent")
    assert policy.authorize_payment(agent, 500) is True
    assert policy.can_authorize(agent, 501) is False
    with pytest.raises(Exception):
        policy.authorize_payment(agent, 501)


def test_owner_can_reset_spend(policy):
    agent = boa.env.generate_address("payments-agent")
    policy.authorize_payment(agent, 200)
    assert policy.spent_today_minor(agent) == 200
    policy.reset_agent_spend(agent)
    assert policy.spent_today_minor(agent) == 0
