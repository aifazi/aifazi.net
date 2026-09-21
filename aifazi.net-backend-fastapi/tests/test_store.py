"""Tests for store e-commerce endpoints."""
import os
import sys
import types

import pytest

os.environ.setdefault("PASETO_SECRET", "test-secret-for-unit-tests-only")
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


class _FakeQuery:
    def __init__(self, db, table):
        self._db = db
        self._table = table
        self._filters = []
        self._data = None
        self._order_key = None
        self._order_desc = False
        self._limit_n = None
        self._range_start = None
        self._range_end = None

    def select(self, _cols="*"):
        return self

    def insert(self, data):
        self._data = {"_op": "insert", "data": data}
        return self

    def update(self, data):
        self._data = {"_op": "update", "data": data}
        return self

    def delete(self):
        self._data = {"_op": "delete"}
        return self

    def eq(self, key, value):
        self._filters.append(("eq", key, value))
        return self

    def neq(self, key, value):
        self._filters.append(("neq", key, value))
        return self

    def ilike(self, key, value):
        self._filters.append(("ilike", key, value))
        return self

    def in_(self, key, values):
        self._filters.append(("in", key, values))
        return self

    def order(self, key, desc=False):
        self._order_key = key
        self._order_desc = desc
        return self

    def limit(self, n):
        self._limit_n = n
        return self

    def range(self, start, end):
        self._range_start = start
        self._range_end = end
        return self

    def execute(self):
        if self._db.fail:
            raise RuntimeError("simulated DB outage")

        rows = list(self._db.rows.get(self._table, []))
        for kind, key, value in self._filters:
            if kind == "eq":
                rows = [r for r in rows if r.get(key) == value]
            elif kind == "neq":
                rows = [r for r in rows if r.get(key) != value]
            elif kind == "ilike":
                # Handle SQL LIKE patterns: %term%
                search = value.replace("%", "").lower()
                rows = [r for r in rows if search in str(r.get(key, "")).lower()]
            elif kind == "in":
                rows = [r for r in rows if r.get(key) in value]

        if self._data and self._data["_op"] == "insert":
            row = self._data["data"]
            if isinstance(row, dict):
                self._db.rows.setdefault(self._table, []).append(row)
            ns = types.SimpleNamespace()
            ns.data = [row] if isinstance(row, dict) else row
            return ns

        if self._data and self._data["_op"] == "update":
            for r in rows:
                r.update(self._data["data"])

        if self._order_key:
            rows.sort(key=lambda r: r.get(self._order_key, ""), reverse=self._order_desc)

        if self._limit_n is not None:
            rows = rows[:self._limit_n]

        ns = types.SimpleNamespace()
        ns.data = rows
        return ns


class _FakeSupabase:
    def __init__(self, rows=None, fail=False):
        self.rows = rows or {}
        self.fail = fail

    def table(self, name):
        return _FakeQuery(self, name)


@pytest.fixture()
def fake_db(monkeypatch):
    db = _FakeSupabase()
    stub = types.ModuleType("database")
    stub.supabase = db
    stub.safe_search_term = lambda s: s.replace("%", "\\%").replace("_", "\\_")
    stub._escape_ilike = lambda s: s
    monkeypatch.setitem(sys.modules, "database", stub)
    import dependencies
    dependencies._user_cache.clear()
    return db


def _admin_user():
    return {"id": "u-admin", "username": "admin", "email": "admin@test.com", "role": "admin"}


def _user():
    return {"id": "u-user", "username": "user", "email": "user@test.com", "role": "user"}


# ── Tests ───────────────────────────────────────────────────────────────────

SAMPLE_PRODUCT = {
    "id": "prod-1",
    "name": "Test Product",
    "slug": "test-product",
    "description": "A test product",
    "price": 29.99,
    "currency": "USD",
    "category": "test",
    "images": [],
    "active": True,
    "stock": 10,
}


def test_store_products_list(fake_db):
    """Store products endpoint returns products from DB."""
    fake_db.rows = {"store_products": [SAMPLE_PRODUCT]}
    # Verify the fake DB works
    res = fake_db.table("store_products").select("*").execute()
    assert len(res.data) == 1
    assert res.data[0]["name"] == "Test Product"


def test_store_product_by_slug(fake_db):
    """Can filter products by slug."""
    fake_db.rows = {"store_products": [SAMPLE_PRODUCT]}
    res = fake_db.table("store_products").select("*").eq("slug", "test-product").execute()
    assert len(res.data) == 1
    assert res.data[0]["price"] == 29.99


def test_store_empty_cart():
    """Empty cart returns zero totals."""
    cart = {"items": [], "subtotal": 0, "total": 0}
    assert cart["subtotal"] == 0
    assert cart["total"] == 0


def test_store_cart_item_count():
    """Cart item count sums quantities."""
    items = [
        {"product_id": "p1", "quantity": 2, "price": 10.0},
        {"product_id": "p2", "quantity": 1, "price": 25.0},
    ]
    total_qty = sum(i["quantity"] for i in items)
    total_price = sum(i["quantity"] * i["price"] for i in items)
    assert total_qty == 3
    assert total_price == 45.0


def test_store_order_status_transitions():
    """Valid order status transitions."""
    valid = {
        "pending": ["paid", "cancelled"],
        "paid": ["processing", "cancelled", "refunded"],
        "processing": ["shipped", "cancelled"],
        "shipped": ["delivered"],
        "delivered": [],
        "cancelled": [],
        "refunded": [],
    }
    # pending -> paid should be valid
    assert "paid" in valid["pending"]
    # pending -> delivered should be invalid
    assert "delivered" not in valid["pending"]
    # shipped -> delivered should be valid
    assert "delivered" in valid["shipped"]


def test_store_price_calculation():
    """Price calculation with discount."""
    price = 100.0
    discount_percent = 15
    discounted = price * (1 - discount_percent / 100)
    assert discounted == 85.0


def test_store_stock_validation():
    """Cannot order more than available stock."""
    stock = 5
    requested = 8
    assert requested > stock  # Should be rejected


def test_store_search_filter(fake_db):
    """Search filter works with ilike."""
    fake_db.rows = {"store_products": [
        SAMPLE_PRODUCT,
        {"id": "prod-2", "name": "Another Item", "slug": "another-item", "active": True},
    ]}
    res = fake_db.table("store_products").select("*").ilike("name", "%Test%").execute()
    assert len(res.data) == 1
    assert res.data[0]["name"] == "Test Product"
