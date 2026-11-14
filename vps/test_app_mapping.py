#!/usr/bin/env python3
"""Pure mapping/SMS helper tests — stubs psycopg so app.py can import without the DB driver."""
from __future__ import annotations

import sys
import types
import unittest
from datetime import date
from pathlib import Path

psycopg = types.ModuleType("psycopg")
rows = types.ModuleType("psycopg.rows")
rows.dict_row = object()
psycopg.rows = rows
sys.modules["psycopg"] = psycopg
sys.modules["psycopg.rows"] = rows

sys.path.insert(0, str(Path(__file__).resolve().parent))
import app  # noqa: E402


class PolicyDateFilterTests(unittest.TestCase):
    def test_jalali_year_month_reads_live_end_date(self):
        self.assertEqual(app.jalali_year_month("۱۴۰۵/۰۶/۰۲"), (1405, 6))
        self.assertIsNone(app.jalali_year_month("2026-03-21"))


class MappingTests(unittest.TestCase):
    def test_kind_is_not_forced_to_life(self):
        self.assertEqual(app.map_policy_kind("مسئولیت پزشکان"), "مسئولیت پزشکان")
        self.assertEqual(app.map_policy_kind(""), "")

    def test_extras_keep_unmapped_excel_columns(self):
        extras = app.extras_from_row(
            {"id": "1", "source_system": "fasihicrm", "computer_code": "77"},
            {"id", "computer_code"},
        )
        self.assertEqual(extras["sourceSystem"], "fasihicrm")
        self.assertNotIn("computerCode", extras)

    def test_mobile_normalize_persian(self):
        self.assertEqual(app.normalize_mobile("۰۹۱۲۱۲۳۴۵۶۷"), "09121234567")
        self.assertEqual(app.normalize_mobile("+989121234567"), "09121234567")


class SmsConfigTests(unittest.TestCase):
    def test_status_never_includes_secrets(self):
        public = app.sms_status_public()
        dumped = str(public)
        self.assertNotIn("_password", dumped)
        self.assertNotIn("_api_key", dumped)
        self.assertIn("passwordSet", public)
        self.assertIn("configured", public)

    def test_mask_phone(self):
        self.assertEqual(app.mask_phone("09121234567"), "0912***67")

    def test_login_token_extraction(self):
        self.assertEqual(app.extract_login_token({"data": {"token": "abc"}}), "abc")
        self.assertEqual(app.extract_login_token({"apiKey": "k"}), "k")


class SlimDossierTests(unittest.TestCase):
    def test_customer_record_matches_c_prefix(self):
        item = {"id": "C-0011748206", "nationalId": "0011748206"}
        self.assertTrue(app.customer_record_matches(item, "C-0011748206"))
        self.assertTrue(app.customer_record_matches(item, "0011748206"))
        self.assertFalse(app.customer_record_matches(item, "C-999"))

    def test_unique_holder_codes(self):
        codes = app.unique_holder_codes(
            [{"holderCode": "12"}, {"holderCode": "12"}],
            [{"holderCode": "34"}],
        )
        self.assertEqual(codes, ["12", "34"])

    def test_sms_dry_run_does_not_need_env(self):
        result = app.sms_dry_run_result(["09121234567"])
        self.assertTrue(result["ok"])
        self.assertTrue(result["dryRun"])
        self.assertEqual(result["code"], "sms_dry_run")

    def test_as_bool_dry_run_flag(self):
        self.assertTrue(app.as_bool(True))
        self.assertTrue(app.as_bool("true"))
        self.assertFalse(app.as_bool(None))
        self.assertFalse(app.as_bool("no"))

    def test_customer_lite_row_is_slim(self):
        row = app.map_customer_lite_row(
            {
                "id": "C-0011748206",
                "full_name": "آزمون",
                "national_id": "0011748206",
                "legal_entity_id": "01063009330",
                "mobile": "۰۹۱۲۱۲۳۴۵۶۷",
                "holder_code": "H-1",
                "email": "secret@example.com",
                "note": "should not appear",
            }
        )
        self.assertEqual(row["id"], "C-0011748206")
        self.assertEqual(row["holderCode"], "H-1")
        self.assertEqual(row["holder_code"], "H-1")
        self.assertEqual(row["mobile"], "09121234567")
        self.assertNotIn("email", row)
        self.assertNotIn("extras", row)
        self.assertNotIn("note", row)


class JalaliDateTests(unittest.TestCase):
    def test_jalali_to_gregorian_matches_frontend_anchors(self):
        self.assertEqual(app.jalali_to_gregorian(1404, 1, 1), (2025, 3, 21))
        self.assertEqual(app.jalali_to_gregorian(1403, 1, 1), (2024, 3, 20))
        self.assertEqual(app.jalali_to_gregorian(1404, 4, 19), (2025, 7, 10))

    def test_parse_date_value_reads_jalali_and_gregorian(self):
        self.assertEqual(app.parse_date_value("1404/04/19"), date(2025, 7, 10))
        self.assertEqual(app.parse_date_value("1404-04-19"), date(2025, 7, 10))
        self.assertEqual(app.parse_date_value("۱۴۰۴/۰۱/۰۱"), date(2025, 3, 21))
        self.assertEqual(app.parse_date_value("2026-09-11"), date(2026, 9, 11))
        self.assertIsNone(app.parse_date_value("798/07/08"))
        self.assertIsNone(app.parse_date_value(""))
        self.assertIsNone(app.parse_date_value("not-a-date"))

    def test_relative_days_and_renewal_window(self):
        # Empty end_date alone is out of window; fetch_renewals may substitute due_date (P1).
        today = date(2025, 7, 1)
        self.assertEqual(app.relative_days("1404/04/19", today), 9)
        self.assertIsNone(app.relative_days("", today))
        self.assertTrue(app.is_in_renewal_window("1404/04/19", today, 45))
        self.assertFalse(app.is_in_renewal_window("1404/01/01", today, 45))
        self.assertFalse(app.is_in_renewal_window("1405/06/01", today, 45))
        self.assertFalse(app.is_in_renewal_window("", today, 45))

    def test_renewal_window_includes_today_and_last_day(self):
        today = date(2025, 7, 1)  # 1404/04/10
        self.assertTrue(app.is_in_renewal_window("1404/04/10", today, 45))
        self.assertTrue(app.is_in_renewal_window("1404/05/24", today, 45))
        self.assertFalse(app.is_in_renewal_window("1404/05/25", today, 45))


class InstallmentFilterTests(unittest.TestCase):
    def test_status_derived_from_amounts_then_jalali_due_date(self):
        today = date(2025, 7, 1)
        self.assertEqual(app.derive_installment_status(100, 100, "1404/04/19", today), "paid")
        self.assertEqual(app.derive_installment_status(100, 40, "1404/04/19", today), "partial")
        self.assertEqual(app.derive_installment_status(100, 0, "1404/04/19", today), "due")
        self.assertEqual(app.derive_installment_status(100, 0, "1404/01/01", today), "overdue")
        self.assertEqual(app.derive_installment_status(100, 0, "", today, "paid"), "paid")
        self.assertEqual(app.derive_installment_status(100, 0, "", today, ""), "overdue")

    def test_parse_status_filter(self):
        self.assertEqual(app.parse_status_filter(""), {"overdue", "due"})
        self.assertEqual(app.parse_status_filter("overdue,due"), {"overdue", "due"})
        self.assertEqual(app.parse_status_filter("unpaid"), {"overdue", "due", "partial"})
        self.assertEqual(app.parse_status_filter("bogus"), {"overdue", "due"})
        self.assertEqual(app.parse_status_filter("all"), app.INSTALLMENT_STATUS_ENUM)

    def test_undated_rows_sort_last(self):
        values = ["", "1404/04/19", "1403/01/01"]
        self.assertEqual(
            sorted(values, key=app.date_sort_key), ["1403/01/01", "1404/04/19", ""]
        )


CUSTOMER_ROWS = [
    {
        "id": "C-0011748206",
        "full_name": "فاطمه محمدی",
        "national_id": "0011748206",
        "holder_code": "88012",
    }
]
POLICY_ROWS = [
    {
        "id": "P-1",
        "policy_number": "1404/100201",
        "computer_code": "77",
        "holder_national_id": "0011748206",
        "holder_name": "فاطمه محمدی",
        "status": "عادي",
        "kind": "درمان",
        "end_date": "1404/04/19",
    },
    {
        "id": "P-2",
        "policy_number": "1404/100202",
        "computer_code": "78",
        "holder_national_id": "0011748206",
        "status": "عادي",
        "kind": "اتومبیل",
        "end_date": "1405/03/01",
    },
    {
        "id": "P-3",
        "policy_number": "1404/100203",
        "computer_code": "79",
        "holder_national_id": "0011748206",
        "status": "ابطال",
        "kind": "درمان",
        "end_date": "1404/04/20",
    },
]
INSTALLMENT_ROWS = [
    {
        "id": "I-1",
        "computer_code": "77",
        "policy_id": "P-1",
        "payer_national_id": "0011748206",
        "amount": "1000000",
        "paid_amount": "0",
        "due_date": "1404/01/01",
        "seq": 1,
        "status": "معوق",
    },
    {
        "id": "I-2",
        "computer_code": "77",
        "policy_id": "P-1",
        "payer_national_id": "0011748206",
        "amount": "1000000",
        "paid_amount": "0",
        "due_date": "1404/04/19",
        "seq": 2,
        "status": "سررسید",
    },
    {
        "id": "I-3",
        "computer_code": "77",
        "policy_id": "P-1",
        "payer_national_id": "0011748206",
        "amount": "1000000",
        "paid_amount": "1000000",
        "due_date": "1403/10/01",
        "seq": 3,
        "status": "پرداخت شده",
    },
]


class FakeCursor:
    def __init__(self, tables: dict):
        self.tables = tables
        self.rows: list[dict] = []

    def execute(self, sql: str, *args):
        self.rows = []
        for name, rows in self.tables.items():
            if f'"{name}"' in sql:
                self.rows = rows
                return

    def fetchall(self):
        return self.rows

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False


class FakeConn:
    def __init__(self, tables: dict):
        self.tables = tables

    def cursor(self):
        return FakeCursor(self.tables)


def fake_conn() -> FakeConn:
    return FakeConn(
        {
            "customers": CUSTOMER_ROWS,
            "policies": POLICY_ROWS,
            "installments": INSTALLMENT_ROWS,
        }
    )


class SlimDueEndpointTests(unittest.TestCase):
    def test_installments_endpoint_returns_unpaid_rows_sorted_by_due_date(self):
        data = app.fetch_installments_due(
            fake_conn(), app.parse_status_filter("overdue,due"), 200, today=date(2025, 7, 1)
        )
        self.assertEqual(data["total"], 2)
        self.assertEqual([i["id"] for i in data["installments"]], ["I-1", "I-2"])
        self.assertEqual(data["installments"][0]["status"], "overdue")
        self.assertEqual(data["installments"][1]["status"], "due")
        self.assertEqual(data["asOf"], "2025-07-01")

    def test_installment_rows_carry_the_fields_the_ui_needs(self):
        data = app.fetch_installments_due(
            fake_conn(), app.parse_status_filter(""), 200, today=date(2025, 7, 1)
        )
        row = data["installments"][0]
        self.assertEqual(row["policyId"], "P-1")
        self.assertEqual(row["policyNumber"], "1404/100201")
        self.assertEqual(row["customerId"], "C-0011748206")
        self.assertEqual(row["customerName"], "فاطمه محمدی")
        self.assertEqual(row["holderCode"], "88012")
        self.assertEqual(row["dueDate"], "1404/01/01")
        self.assertEqual(row["amount"], 1000000.0)
        self.assertNotIn("extras", row)
        self.assertNotIn("payments", row)

    def test_paid_rows_only_appear_when_asked(self):
        data = app.fetch_installments_due(
            fake_conn(), app.parse_status_filter("paid"), 200, today=date(2025, 7, 1)
        )
        self.assertEqual([i["id"] for i in data["installments"]], ["I-3"])

    def test_renewals_endpoint_uses_jalali_window_and_skips_cancelled(self):
        data = app.fetch_renewals(fake_conn(), 45, 200, today=date(2025, 7, 1))
        self.assertEqual(data["withinDays"], 45)
        self.assertEqual([p["id"] for p in data["policies"]], ["P-1"])
        row = data["policies"][0]
        self.assertEqual(row["endDate"], "1404/04/19")
        self.assertEqual(row["daysLeft"], 9)
        self.assertEqual(row["policyNumber"], "1404/100201")
        self.assertEqual(row["customerName"], "فاطمه محمدی")
        self.assertEqual(row["holderCode"], "88012")
        self.assertEqual(row["status"], "active")
        self.assertEqual(row["renewalDateSource"], "end_date")

    def test_renewals_window_can_widen_without_touching_the_db(self):
        data = app.fetch_renewals(fake_conn(), 365, 200, today=date(2025, 7, 1))
        self.assertEqual([p["id"] for p in data["policies"]], ["P-1", "P-2"])

    def test_limit_is_capped_and_offset_pages(self):
        data = app.fetch_installments_due(
            fake_conn(), app.parse_status_filter("all"), 5000, offset=1, today=date(2025, 7, 1)
        )
        self.assertEqual(data["limit"], 200)
        self.assertEqual(data["offset"], 1)
        self.assertEqual(data["total"], 3)
        self.assertEqual(len(data["installments"]), 2)




class EffectiveRenewalEndTests(unittest.TestCase):
    """Import P1: empty policies.end_date → installment due_date for renewals window."""

    def test_fallback_prefers_soonest_upcoming_unpaid_due(self):
        today = date(2025, 7, 1)
        inst = [
            {"dueDate": "1404/01/01", "amount": 100, "paidAmount": 0, "status": "overdue"},
            {"dueDate": "1404/04/19", "amount": 100, "paidAmount": 0, "status": "due"},
            {"dueDate": "1404/05/01", "amount": 100, "paidAmount": 100, "status": "paid"},
        ]
        self.assertEqual(app.fallback_due_from_installments(inst, today), "1404/04/19")

    def test_fallback_uses_latest_past_when_all_unpaid_are_past(self):
        today = date(2025, 7, 1)
        inst = [
            {"dueDate": "1403/10/01", "amount": 100, "paidAmount": 0, "status": "overdue"},
            {"dueDate": "1404/01/01", "amount": 100, "paidAmount": 0, "status": "overdue"},
        ]
        self.assertEqual(app.fallback_due_from_installments(inst, today), "1404/01/01")

    def test_effective_end_prefers_policy_end_date(self):
        today = date(2025, 7, 1)
        end, source = app.effective_renewal_end(
            "1404/04/19",
            [{"dueDate": "1404/04/10", "amount": 1, "paidAmount": 0}],
            today,
        )
        self.assertEqual(end, "1404/04/19")
        self.assertEqual(source, "end_date")

    def test_effective_end_falls_back_to_due_date(self):
        today = date(2025, 7, 1)
        end, source = app.effective_renewal_end(
            "",
            [{"dueDate": "1404/04/19", "amount": 1, "paidAmount": 0, "status": "due"}],
            today,
        )
        self.assertEqual(end, "1404/04/19")
        self.assertEqual(source, "due_date")

    def test_effective_end_empty_when_no_signal(self):
        today = date(2025, 7, 1)
        end, source = app.effective_renewal_end("", [], today)
        self.assertEqual(end, "")
        self.assertEqual(source, "")


def overdue_empty_end_conn() -> FakeConn:
    """overdue_installments policy with empty end_date + due in / out of window."""
    customers = CUSTOMER_ROWS
    policies = POLICY_ROWS + [
        {
            "id": "P-overdue-in",
            "policy_number": "OV-1001",
            "computer_code": "",
            "holder_national_id": "0011748206",
            "holder_name": "فاطمه محمدی",
            "status": "عادي",
            "kind": "overdue_installments",
            "end_date": "",
        },
        {
            "id": "P-overdue-none",
            "policy_number": "OV-1002",
            "computer_code": "",
            "holder_national_id": "0011748206",
            "status": "عادي",
            "kind": "overdue_installments",
            "end_date": "",
        },
    ]
    installments = INSTALLMENT_ROWS + [
        {
            "id": "I-ov-1",
            "computer_code": "",
            "policy_number": "OV-1001",
            "policy_id": "",
            "payer_national_id": "0011748206",
            "amount": "500000",
            "paid_amount": "0",
            "due_date": "1404/04/20",  # today 1404/04/10 + 10d → in 45-day window
            "seq": 1,
            "status": "معوق",
        },
        {
            "id": "I-ov-empty",
            "computer_code": "",
            "policy_number": "OV-1002",
            "policy_id": "",
            "payer_national_id": "0011748206",
            "amount": "500000",
            "paid_amount": "0",
            "due_date": "",
            "seq": 1,
            "status": "معوق",
        },
    ]
    return FakeConn(
        {"customers": customers, "policies": policies, "installments": installments}
    )


class RenewalsEmptyEndDateTests(unittest.TestCase):
    def test_empty_end_date_with_due_in_window_appears(self):
        data = app.fetch_renewals(overdue_empty_end_conn(), 45, 200, today=date(2025, 7, 1))
        ids = [p["id"] for p in data["policies"]]
        self.assertIn("P-1", ids)
        self.assertIn("P-overdue-in", ids)
        self.assertNotIn("P-overdue-none", ids)
        row = next(p for p in data["policies"] if p["id"] == "P-overdue-in")
        self.assertEqual(row["endDate"], "1404/04/20")
        self.assertEqual(row["renewalDateSource"], "due_date")
        self.assertEqual(row["daysLeft"], 10)
        self.assertEqual(row.get("policyEndDate"), "")

    def test_empty_end_date_without_usable_due_excluded(self):
        data = app.fetch_renewals(overdue_empty_end_conn(), 45, 200, today=date(2025, 7, 1))
        ids = [p["id"] for p in data["policies"]]
        self.assertNotIn("P-overdue-none", ids)


class PolicyLiteCustomerIdResolveTests(unittest.TestCase):
    """#31b CoS: customerId is real CRM id only — never raw holder_code."""

    def test_national_id_joins_to_customer_id(self):
        cust_rows = [
            {"id": "C-0011748206", "national_id": "0011748206", "holder_code": "88012", "full_name": "فاطمه"}
        ]
        ids, nat, holder = app.customer_lookup(cust_rows)
        row = app.map_policy_lite_row(
            {
                "id": "P-1",
                "policy_number": "33022",
                "computer_code": "100",
                "holder_national_id": "0011748206",
                "holder_code": "8968224",
                "holder_name": "فاطمه",
                "kind": "ثالث",
                "status": "فعال",
                "premium": 1,
                "end_date": "1404/12/01",
            },
            ids,
            nat,
            holder,
        )
        self.assertEqual(row["customerId"], "C-0011748206")
        self.assertEqual(row["holderCode"], "8968224")

    def test_holder_code_joins_when_national_id_missing(self):
        cust_rows = [
            {
                "id": "C-3050162929",
                "national_id": "3050162929",
                "holder_code": "549186",
                "full_name": "فاطمه اميري",
            }
        ]
        ids, nat, holder = app.customer_lookup(cust_rows)
        row = app.map_policy_lite_row(
            {
                "id": "P-sales",
                "policy_number": "41896",
                "computer_code": "200",
                "holder_national_id": "",
                "holder_code": "549186",
                "holder_name": "فاطمه اميري کد 549186",
                "kind": "ثالث",
                "status": "فعال",
                "premium": 1,
                "end_date": "1404/12/01",
            },
            ids,
            nat,
            holder,
        )
        self.assertEqual(row["customerId"], "C-3050162929")
        self.assertEqual(row["holderCode"], "549186")

    def test_holder_code_from_customer_name_suffix(self):
        cust_rows = [
            {
                "id": "C-0011748206",
                "national_id": "0011748206",
                "holder_code": "",
                "full_name": "بهناز شريفي کد 2756767",
            }
        ]
        ids, nat, holder = app.customer_lookup(cust_rows)
        self.assertEqual(holder.get("2756767"), "C-0011748206")
        row = app.map_policy_lite_row(
            {
                "id": "P-x",
                "policy_number": "1",
                "computer_code": "1",
                "holder_national_id": "",
                "holder_code": "2756767",
                "holder_name": "بهناز شريفي کد 2756767",
                "kind": "ثالث",
                "status": "فعال",
                "premium": 1,
                "end_date": "1404/12/01",
            },
            ids,
            nat,
            holder,
        )
        self.assertEqual(row["customerId"], "C-0011748206")

    def test_unmatched_holder_code_leaves_customer_id_empty(self):
        """Live QA sample 33022 / 8968224 — no customer row → empty cid, not holderCode."""
        cust_rows = [
            {"id": "C-0011748206", "national_id": "0011748206", "holder_code": "88012", "full_name": "فاطمه"}
        ]
        ids, nat, holder = app.customer_lookup(cust_rows)
        row = app.map_policy_lite_row(
            {
                "id": "P-10001026-20042028-0",
                "policy_number": "33022",
                "computer_code": "10001026",
                "holder_national_id": "",
                "holder_code": "8968224",
                "holder_name": "فاطمه اميري دوماري کد 8968224",
                "kind": "ثالث",
                "status": "فعال",
                "premium": 1,
                "end_date": "1404/04/19",
            },
            ids,
            nat,
            holder,
        )
        self.assertEqual(row["customerId"], "")
        self.assertEqual(row["holderCode"], "8968224")
        self.assertNotEqual(row["customerId"], row["holderCode"])

    def test_resolve_never_returns_raw_holder_code(self):
        ids, nat, holder = app.customer_lookup([])
        cid = app.resolve_policy_customer_id(
            {"holder_national_id": "", "holder_code": "8968224"},
            ids,
            nat,
            holder,
        )
        self.assertEqual(cid, "")



class PremiumAdjustmentCalcTests(unittest.TestCase):
    def test_year1_equals_p0(self):
        self.assertEqual(app.premium_at_year(10_000_000, 0.1, 1), 10_000_000)

    def test_docs_example_year5(self):
        self.assertEqual(app.premium_at_year(10_000_000, 0.1, 5), 14_641_000)

    def test_schedule_shape(self):
        rows = app.premium_adjustment_schedule(10_000_000, 0.1, 3)
        self.assertEqual(
            rows,
            [
                {"year": 1, "jalaliYear": 1405, "premiumRial": 10_000_000, "premiumToman": 1_000_000},
                {"year": 2, "jalaliYear": 1406, "premiumRial": 11_000_000, "premiumToman": 1_100_000},
                {"year": 3, "jalaliYear": 1407, "premiumRial": 12_100_000, "premiumToman": 1_210_000},
            ],
        )

    def test_schedule_custom_start_year(self):
        rows = app.premium_adjustment_schedule(1_000_000, 0, 2, start_year=1400)
        self.assertEqual(rows[0]["jalaliYear"], 1400)
        self.assertEqual(rows[1]["jalaliYear"], 1401)
        self.assertEqual(rows[0]["year"], 1)

    def test_parse_body_ok(self):
        rows, err = app.parse_premium_adjustment_body({"p0": 100, "r": 0, "years": 2})
        self.assertIsNone(err)
        self.assertEqual(len(rows), 2)
        self.assertEqual(rows[0]["jalaliYear"], 1405)

    def test_parse_body_start_year(self):
        rows, err = app.parse_premium_adjustment_body(
            {"p0": 100, "r": 0, "years": 2, "startYear": 1399}
        )
        self.assertIsNone(err)
        self.assertEqual(rows[0]["jalaliYear"], 1399)
        self.assertEqual(rows[1]["jalaliYear"], 1400)

    def test_parse_body_bad(self):
        rows, err = app.parse_premium_adjustment_body({"p0": "x", "r": 0.1, "years": 2})
        self.assertIsNone(rows)
        self.assertIsNotNone(err)

    def test_diya_1405_verified_lock(self):
        d = app.DIYA_1405_VERIFIED
        self.assertEqual(d["status"], "VERIFIED")
        self.assertEqual(d["sourceLabel"], "قوه قضاییه")
        self.assertEqual(d["ordinaryRial"], 21_000_000_000)
        self.assertEqual(d["haramRial"], 28_000_000_000)
        self.assertEqual(d["ordinaryToman"], 2_100_000_000)
        self.assertEqual(d["haramToman"], 2_800_000_000)
        self.assertEqual(d["thirdPartyPropertyMinRial"], 700_000_000)
        self.assertEqual(d["thirdPartyPropertyMinToman"], 70_000_000)
        self.assertEqual(d["year"], 1405)
        self.assertEqual(app.DIYA_DEFAULT_YEAR, 1405)


class ExtractHolderCodeFromFullNameTests(unittest.TestCase):
    def test_ascii_suffix(self):
        self.assertEqual(app.extract_holder_code_from_full_name("بهناز شريفي کد 2756767"), "2756767")

    def test_persian_digits(self):
        self.assertEqual(
            app.extract_holder_code_from_full_name("علي کد ۲۷۵۶۷۶۷"),
            "2756767",
        )

    def test_arabic_kaf_and_indic_digits(self):
        # Arabic kaf ك + Arabic-Indic digits
        self.assertEqual(app.extract_holder_code_from_full_name("نام كد ١٢٣٤"), "1234")

    def test_trim_and_no_match(self):
        self.assertEqual(app.extract_holder_code_from_full_name("  فاطمه  "), "")
        self.assertEqual(app.extract_holder_code_from_full_name(None), "")
        self.assertEqual(app.extract_holder_code_from_full_name(""), "")

    def test_no_false_positive_inside_word(self):
        # «کمال» must not yield a code; only «کد» + digits
        self.assertEqual(app.extract_holder_code_from_full_name("مريم بمي نژادکمال آبادي"), "")


class HolderCodeBackfillPlanTests(unittest.TestCase):
    def test_only_fills_empty(self):
        rows = [
            {"id": "C-1", "full_name": "الف کد 111", "holder_code": ""},
            {"id": "C-2", "full_name": "ب کد 222", "holder_code": "999"},
            {"id": "C-3", "full_name": "بدون کد", "holder_code": None},
            {"id": "C-4", "full_name": "ج کد ۳۳۳", "holder_code": "  "},
        ]
        plan = app.plan_holder_code_backfill(rows)
        self.assertEqual(plan["scanned"], 4)
        self.assertEqual(plan["wouldUpdate"], 2)  # C-1 and C-4
        self.assertEqual(plan["alreadySet"], 1)
        self.assertEqual(plan["emptyNoCode"], 1)
        ids = {u["id"] for u in plan["updates"]}
        self.assertEqual(ids, {"C-1", "C-4"})
        by_id = {u["id"]: u["holderCode"] for u in plan["updates"]}
        self.assertEqual(by_id["C-1"], "111")
        self.assertEqual(by_id["C-4"], "333")

    def test_never_lists_nonempty_for_update(self):
        rows = [{"id": "C-x", "full_name": "نام کد 1", "holder_code": "keep-me"}]
        plan = app.plan_holder_code_backfill(rows)
        self.assertEqual(plan["wouldUpdate"], 0)
        self.assertEqual(plan["alreadySet"], 1)

    def test_admin_token_gate(self):
        prev = app.os.environ.pop("ADMIN_TOKEN", None)
        prev2 = app.os.environ.pop("FASIHI_ADMIN_TOKEN", None)
        try:
            self.assertFalse(app.admin_token_ok("x"))
            app.os.environ["ADMIN_TOKEN"] = "secret-token"
            self.assertTrue(app.admin_token_ok("secret-token"))
            self.assertFalse(app.admin_token_ok("wrong"))
            self.assertFalse(app.admin_token_ok(""))
        finally:
            if prev is None:
                app.os.environ.pop("ADMIN_TOKEN", None)
            else:
                app.os.environ["ADMIN_TOKEN"] = prev
            if prev2 is None:
                app.os.environ.pop("FASIHI_ADMIN_TOKEN", None)
            else:
                app.os.environ["FASIHI_ADMIN_TOKEN"] = prev2





class PremiumLadderMappingTests(unittest.TestCase):
    def test_map_policy_rows_exposes_initial_premium_and_adj(self):
        rows = app.map_policy_rows(
            [
                {
                    "id": "P-ul",
                    "computer_code": "712599",
                    "policy_number": "1",
                    "holder_national_id": "001",
                    "holder_name": "A",
                    "holder_code": "99",
                    "status": "active",
                    "kind": "universal_life",
                    "company": "کارآفرین",
                    "premium": 50_000_000,
                    "initial_premium": 2_000_000,
                    "premium_adj_pct": 10,
                    "start_date": "1388/01/01",
                    "end_date": "1405/01/01",
                    "issue_date": "1388/01/01",
                    "installment_count": 1,
                }
            ],
            {"C-001"},
            {"001": "C-001"},
            {},
        )
        self.assertEqual(len(rows), 1)
        item = rows[0]
        self.assertEqual(item["initialPremium"], 2_000_000.0)
        self.assertEqual(item["premiumAdjPct"], 10.0)
        self.assertEqual(item["premium"], 50_000_000.0)
        self.assertEqual(item["startDate"], "1388/01/01")
        extras = item.get("extras") or {}
        self.assertNotIn("initialPremium", extras)
        self.assertNotIn("premiumAdjPct", extras)


    def test_map_policy_rows_exposes_initial_premium_start(self):
        """Amir LOCK: start P0 separate from latest endorsement IP."""
        rows = app.map_policy_rows(
            [
                {
                    "id": "P-ul-1838500",
                    "computer_code": "1568",
                    "policy_number": "1568",
                    "holder_national_id": "3051774243",
                    "holder_name": "سیدعلی اصغر حسینی سیریزی",
                    "holder_code": "1838500",
                    "status": "active",
                    "kind": "universal_life",
                    "company": "کارآفرین",
                    "premium": 50_000_000,
                    "initial_premium": 20_000_000,
                    "initial_premium_start": 4_000_000,
                    "premium_adj_pct": 10,
                    "start_date": "1388/01/01",
                    "end_date": "1405/01/01",
                    "issue_date": "1388/01/01",
                    "installment_count": 1,
                }
            ],
            {"C-3051774243"},
            {"3051774243": "C-3051774243"},
            {},
        )
        item = rows[0]
        self.assertEqual(item["initialPremium"], 20_000_000.0)
        self.assertEqual(item["initialPremiumStart"], 4_000_000.0)
        extras = item.get("extras") or {}
        self.assertNotIn("initialPremiumStart", extras)

    def test_map_policy_rows_parses_initial_premium_start_text(self):
        """Live column is TEXT — same as initial_premium; to_float must accept strings."""
        rows = app.map_policy_rows(
            [
                {
                    "id": "P-ul-text",
                    "computer_code": "3590146",
                    "policy_number": "3590146",
                    "holder_national_id": "3051774243",
                    "holder_code": "1838500",
                    "status": "active",
                    "kind": "universal_life",
                    "premium": 0,
                    "initial_premium": "20000000",
                    "initial_premium_start": "4000000",
                    "premium_adj_pct": "10",
                    "start_date": "1388/01/01",
                    "end_date": "1405/01/01",
                    "issue_date": "1388/01/01",
                    "installment_count": 1,
                }
            ],
            {"C-3051774243"},
            {"3051774243": "C-3051774243"},
            {},
        )
        item = rows[0]
        self.assertEqual(item["initialPremiumStart"], 4_000_000.0)
        self.assertEqual(item["initialPremium"], 20_000_000.0)

    def test_amir_sample_1405(self):
        rows = app.premium_adjustment_schedule(2_000_000, 0.1, 18, start_year=1388)
        self.assertEqual(rows[0]["jalaliYear"], 1388)
        self.assertEqual(rows[0]["premiumRial"], 2_000_000)
        row1405 = next(r for r in rows if r["jalaliYear"] == 1405)
        self.assertEqual(row1405["year"], 18)
        self.assertEqual(row1405["premiumRial"], 10_108_941)


if __name__ == "__main__":
    unittest.main()


class DiyaAndPremiumEndpointPathTests(unittest.TestCase):
    """Smoke: Handler path branches exist for locked calc + aliases (no live listen)."""

    def test_diya_constant_matches_endpoint_contract(self):
        d = dict(app.DIYA_1405_VERIFIED)
        self.assertEqual(d["ordinaryRial"], 21_000_000_000)
        self.assertEqual(d["haramRial"], 28_000_000_000)
        self.assertEqual(d["status"], "VERIFIED")

    def test_handler_source_mentions_aliases(self):
        src = Path(app.__file__).read_text(encoding="utf-8")
        self.assertIn('"/api/calc/diya"', src)
        self.assertIn('"/api/diya"', src)
        self.assertIn('"/api/calc/premium-adjustment"', src)
        self.assertIn('"/api/premium-adjustment"', src)
        self.assertIn('"/api/sms/test-connection"', src)


class DebtHistoryTests(unittest.TestCase):
    def test_history_not_mapped_to_overdue(self):
        today = date(2026, 9, 24)
        self.assertEqual(
            app.derive_installment_status(1e9, 0, "1399/01/01", today, "history"),
            "history",
        )
        self.assertEqual(
            app.derive_installment_status(100, 0, "1404/01/01", today, "unpaid"),
            "overdue",
        )

    def test_map_installment_preserves_history_and_unpaid_amount(self):
        rows = [
            {
                "id": "I-HIST-universal_life-1",
                "computer_code": "3590157",
                "amount": 1237464000,
                "unpaid_amount": 0,
                "due_date": "1399/01/01",
                "seq": 1,
                "holder_code": "1838500",
                "status": "history",
                "kind": "HIST:universal_life",
                "paid_amount": 0,
            },
            {
                "id": "I-unpaid-1",
                "computer_code": "cc1",
                "policy_id": "P-omid-1",
                "amount": 78559453,
                "unpaid_amount": 78559453,
                "due_date": "1403/01/01",
                "seq": 1,
                "holder_code": "1838500",
                "status": "unpaid",
                "kind": "unpaid_due",
                "paid_amount": 0,
            },
        ]
        mapped = app.map_installment_rows(
            rows, {"1838500"}, {}, {}, {"1838500": "1838500"}
        )
        self.assertEqual(mapped[0]["status"], "history")
        self.assertEqual(mapped[0]["unpaidAmount"], 0)
        self.assertEqual(mapped[1]["status"], "overdue")
        self.assertEqual(mapped[1]["unpaidAmount"], 78559453)
        self.assertEqual(mapped[1]["kind"], "unpaid_due")

    def test_overdue_days_only_for_overdue(self):
        today = date(2026, 9, 24)
        self.assertEqual(app.overdue_days("2026-09-01", "overdue", today, 100, 0), 23)
        self.assertIsNone(app.overdue_days("1399/05/13", "history", today, 1e12, 0))
        self.assertIsNone(app.overdue_days("2026-12-01", "due", today, 100, 0))

    def test_customer_aliases_include_holder(self):
        aliases = app.customer_id_aliases(
            {"id": "1838500", "nationalId": "3051774243", "holderCode": "1838500"}
        )
        self.assertIn("1838500", aliases)
        self.assertIn("3051774243", aliases)
