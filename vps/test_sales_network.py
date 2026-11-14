"""Unit tests for M1 sales network commission preview math — no network, no Postgres."""
from __future__ import annotations

import unittest

import sales_network as sn


class CommissionPreviewMathTests(unittest.TestCase):
    def setUp(self):
        sn.reset_store_for_tests()
        sn._ensure_seeded()

    def test_seed_tree_has_five_agents(self):
        data = sn.list_agents()
        self.assertTrue(data["ok"])
        self.assertEqual(len(data["items"]), 5)
        roles = {a["role"] for a in data["items"]}
        self.assertEqual(roles, set(sn.AGENT_ROLES))

    def test_preview_year1_marketer_splits(self):
        # MK-01 id=5, premium 10_000_000, year 1
        # issuance 20% = 2_000_000, collection 5% = 500_000
        # parents: DM depth1 2%, BR depth2 1%, A96 depth3 0.5%, G depth4 0.25%
        # tax 10% on each gross
        result = sn.preview_commission(
            premium_rial=10_000_000,
            policy_year=1,
            agent_id=5,
        )
        self.assertTrue(result["ok"], result)
        self.assertEqual(result["premiumRial"], 10_000_000)
        kinds = [(s["kind"], s["ratePct"], s["grossRial"], s["taxRial"], s["netRial"]) for s in result["splits"]]
        # seller
        self.assertEqual(kinds[0][:3], ("issuance", 20.0, 2_000_000))
        self.assertEqual(kinds[0][3], 200_000)
        self.assertEqual(kinds[0][4], 1_800_000)
        self.assertEqual(kinds[1][:3], ("collection", 5.0, 500_000))
        # supervisory chain
        self.assertEqual(kinds[2][:3], ("supervisory", 2.0, 200_000))
        self.assertEqual(kinds[3][:3], ("supervisory", 1.0, 100_000))
        self.assertEqual(kinds[4][:3], ("supervisory", 0.5, 50_000))
        self.assertEqual(kinds[5][:3], ("supervisory", 0.25, 25_000))
        self.assertEqual(len(kinds), 6)
        self.assertEqual(result["totals"]["grossRial"], 2_000_000 + 500_000 + 200_000 + 100_000 + 50_000 + 25_000)
        self.assertEqual(result["totals"]["taxRial"], result["totals"]["grossRial"] // 10)
        self.assertEqual(
            result["totals"]["netRial"],
            result["totals"]["grossRial"] - result["totals"]["taxRial"],
        )
        self.assertTrue(result["demoDefaults"])

    def test_preview_year5_declining_issuance(self):
        result = sn.preview_commission(premium_rial=1_000_000, policy_year=5, agent_id=5)
        self.assertTrue(result["ok"])
        issuance = next(s for s in result["splits"] if s["kind"] == "issuance")
        collection = next(s for s in result["splits"] if s["kind"] == "collection")
        self.assertEqual(issuance["ratePct"], 8.0)
        self.assertEqual(issuance["grossRial"], 80_000)
        self.assertEqual(collection["ratePct"], 1.0)
        self.assertEqual(collection["grossRial"], 10_000)

    def test_preview_rejects_bad_year(self):
        bad = sn.preview_commission(premium_rial=100, policy_year=6, agent_id=5)
        self.assertFalse(bad["ok"])

    def test_preview_root_no_supervisory(self):
        result = sn.preview_commission(premium_rial=1_000_000, policy_year=1, agent_id=1)
        self.assertTrue(result["ok"])
        kinds = [s["kind"] for s in result["splits"]]
        self.assertEqual(kinds, ["issuance", "collection"])

    def test_round_rial(self):
        self.assertEqual(sn.round_rial(10.4), 10)
        self.assertEqual(sn.round_rial(10.5), 10)  # banker's? Python round half-even
        # actually round(10.5)=10, round(11.5)=12 — use known values
        self.assertEqual(sn.round_rial(10.6), 11)

    def test_handle_request_preview(self):
        code, payload = sn.handle_request(
            "POST",
            "/api/sales-network/commission/preview",
            {"premiumRial": 1_000_000, "policyYear": 1, "agentId": 5},
        )
        self.assertEqual(code, 200)
        self.assertTrue(payload["ok"])
        self.assertGreater(payload["totals"]["grossRial"], 0)

    def test_tree_structure(self):
        data = sn.build_tree()
        self.assertTrue(data["ok"])
        self.assertEqual(len(data["tree"]), 1)
        root = data["tree"][0]
        self.assertEqual(root["role"], "general")
        self.assertEqual(root["children"][0]["role"], "ayeen96")
        self.assertEqual(data["stats"]["totalAgents"], 5)

    def test_create_and_patch_agent(self):
        created = sn.create_agent(
            {
                "code": "MK-02",
                "fullName": "بازاریاب دوم",
                "role": "marketer",
                "parentId": 4,
            }
        )
        self.assertTrue(created["ok"], created)
        aid = created["item"]["id"]
        patched = sn.patch_agent(aid, {"active": False, "notes": "غیرفعال دمو"})
        self.assertTrue(patched["ok"])
        self.assertFalse(patched["item"]["active"])
        self.assertEqual(patched["item"]["notes"], "غیرفعال دمو")


class DemoDefaultsDocumentedTests(unittest.TestCase):
    def test_defaults_match_module_constants(self):
        self.assertEqual(sn.DEMO_ISSUANCE_PCT[1], 20.0)
        self.assertEqual(sn.DEMO_COLLECTION_PCT[1], 5.0)
        self.assertEqual(sn.DEMO_SUPERVISORY_PCT[1], 2.0)
        self.assertEqual(sn.DEMO_WITHHOLDING_TAX_PCT, 10.0)


if __name__ == "__main__":
    unittest.main()
