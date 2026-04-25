# @version 0.4.0

# Minimal policy contract for agentic payment authorization.
# Mirrors the in-app policy checks used by the Node fallback.

owner: public(address)
max_ticket_minor: public(uint256)
daily_cap_minor: public(uint256)
spent_today_minor: public(HashMap[address, uint256])


@deploy
def __init__(_max_ticket_minor: uint256, _daily_cap_minor: uint256):
    self.owner = msg.sender
    self.max_ticket_minor = _max_ticket_minor
    self.daily_cap_minor = _daily_cap_minor


@internal
def _only_owner():
    assert msg.sender == self.owner, "not owner"


@external
def set_limits(_max_ticket_minor: uint256, _daily_cap_minor: uint256):
    self._only_owner()
    self.max_ticket_minor = _max_ticket_minor
    self.daily_cap_minor = _daily_cap_minor


@view
@external
def can_authorize(agent: address, amount_minor: uint256) -> bool:
    if amount_minor == 0:
        return False
    if amount_minor > self.max_ticket_minor:
        return False
    if self.spent_today_minor[agent] + amount_minor > self.daily_cap_minor:
        return False
    return True


@external
def authorize_payment(agent: address, amount_minor: uint256) -> bool:
    assert amount_minor > 0, "amount"
    assert amount_minor <= self.max_ticket_minor, "ticket"
    assert self.spent_today_minor[agent] + amount_minor <= self.daily_cap_minor, "daily_cap"

    self.spent_today_minor[agent] += amount_minor
    return True


@external
def reset_agent_spend(agent: address):
    self._only_owner()
    self.spent_today_minor[agent] = 0
