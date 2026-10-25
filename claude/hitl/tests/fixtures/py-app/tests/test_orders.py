import unittest
from decimal import Decimal

from orders import Order, apply_discount, round_money


class TestOrders(unittest.TestCase):
    def test_T2_AC1_rejects_bad_pct(self):
        """@covers apply_discount @ac T-2.AC1 @kind example @origin test-author"""
        with self.assertRaises(ValueError):
            apply_discount(Order(Decimal("10.00")), Decimal("150"))

    def test_T2_AC2_rounds_half_up(self):
        """@covers round_money @ac T-2.AC2 @kind example @origin test-author"""
        self.assertEqual(round_money(Decimal("1.005")), Decimal("1.01"))


if __name__ == "__main__":
    unittest.main()
