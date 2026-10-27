# Python skeleton patterns

Rules: every target symbol gets intent docstring + reserved tags + numbered `# TODO(impl):` steps + the sentinel raise.
The sentinel MUST be `raise NotImplementedError("TODO(impl): <ref>")` (the adapter detects it).
Tag lines contain only reserved tags (see `../tag-grammar.md`). Keep full type hints.

## Function / method stub (exact shape)
```py
def apply_discount(order: Order, pct: Decimal) -> Order:
    """Apply pct% discount once; total never negative.

    @task T-2 @impl manual @status skeleton @prio 2
    @dec D-1
    @calls round_money
    @concurrency none
    """
    # TODO(impl): 1. validate 0 <= pct <= 100 else ValueError
    # TODO(impl): 2. if order.discounted, return order unchanged
    raise NotImplementedError("TODO(impl): apply_discount")
```
`@dec D-n` (optional, 0–3 per task): only on symbols that embody a design decision (change `design.md`, cited in the task's **Why**) whose *cost if wrong* matters.
Not hashed; adding it never needs re-approval.
Method: same inside the class; ref is `Class.method` (e.g. `"TODO(impl): Order.apply"`).
Async: `async def …`, `@concurrency async`.

## Modify an existing symbol (keep working code)
```py
def find_by_email(self, email: str) -> User | None:
    """Find a user by email, case-insensitive.

    @task T-3 @impl agent @status skeleton @prio 1
    @concurrency none
    """
    # TODO(impl): 1. compare casefolded emails
    return next((u for u in self.users if u.email == email), None)  # existing code stays
```
Add the sentinel only when the whole body will be rewritten.

## New class
```py
class OrderService:
    """Applies pricing rules to orders.

    @task T-2 @impl agent @status skeleton
    """

    def __init__(self, repo: OrderRepo) -> None:
        self.repo = repo
```

## Types needed by signatures (full types, no sentinel)
```py
@dataclass(frozen=True)
class DiscountInput:
    """Discount request."""
    order_id: str
    pct: Decimal
    # TODO(impl): define reason/audit fields
```

## Test stubs (one per test-plan row; no assertions yet)
unittest (default when pytest is absent):
```py
import unittest

class TestOrders(unittest.TestCase):
    @unittest.skip("TODO(test): T-2.AC1")
    def test_T2_AC1_rejects_bad_pct(self):
        """@covers apply_discount @ac T-2.AC1 @kind example @origin skeleton"""
```
pytest:
```py
import pytest

@pytest.mark.skip(reason="TODO(test): T-2.AC1")
def test_T2_AC1_rejects_bad_pct():
    """@covers apply_discount @ac T-2.AC1 @kind example @origin skeleton"""
```
Name: `test_T<n>_AC<k>_<short_snake_desc>`. `@concurrency` ≠ none → add a `@kind concurrency` stub.

## After implementation (for reference)
`# TODO(impl): 1. x` becomes `# 1. x` and the sentinel is removed. Step comments stay.
