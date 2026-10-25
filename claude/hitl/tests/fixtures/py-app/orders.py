from decimal import Decimal


class Order:
    def __init__(self, total: Decimal):
        self.total = total
        self.discounted = False


def round_money(value: Decimal) -> Decimal:
    """Round a money amount to 2 decimal places, half up.

    @task T-2 @impl agent @status skeleton @prio 1
    @concurrency none
    """
    # TODO(impl): 1. quantize value to Decimal("0.01") with ROUND_HALF_UP
    raise NotImplementedError("TODO(impl): round_money")


def apply_discount(order: Order, pct: Decimal) -> Order:
    """Apply pct% discount once; total never negative.

    @task T-2 @impl manual @status skeleton @prio 2
    @calls round_money
    @concurrency none
    """
    # TODO(impl): 1. validate 0 <= pct <= 100 else ValueError
    # TODO(impl): 2. if order.discounted, return order unchanged
    # TODO(impl): 3. set total to round_money(total * (100 - pct) / 100), mark discounted, return order
    raise NotImplementedError("TODO(impl): apply_discount")
