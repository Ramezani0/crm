#!/usr/bin/env python3
"""One-shot: backfill customers.holder_code from «کد N» in full_name.

Default is dry-run. Never overwrites non-empty holder_code. Never deletes rows.

Usage (on VPS / with DATABASE_URL):
  python3 vps/backfill_holder_code.py              # dry-run
  python3 vps/backfill_holder_code.py --apply       # write (needs DB)
  python3 vps/backfill_holder_code.py --apply --yes # skip confirm

Env: DATABASE_URL (same as vps/app.py).
"""
from __future__ import annotations

import argparse
import json
import os
import sys

# Allow `python3 vps/backfill_holder_code.py` from repo root or vps/.
HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)

import app  # noqa: E402


def main() -> int:
    parser = argparse.ArgumentParser(description="Backfill customers.holder_code from full_name «کد N»")
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Write updates (default: dry-run only)",
    )
    parser.add_argument(
        "--yes",
        action="store_true",
        help="Skip interactive confirm when --apply",
    )
    parser.add_argument(
        "--json",
        action="store_true",
        help="Print full JSON report",
    )
    args = parser.parse_args()
    dry_run = not args.apply

    with app.get_conn() as conn:
        report = app.apply_holder_code_backfill(conn, dry_run=True)
        print(
            f"scanned={report['scanned']} wouldUpdate={report['wouldUpdate']} "
            f"alreadySet={report['alreadySet']} emptyNoCode={report['emptyNoCode']}",
            flush=True,
        )
        for sample in report.get("samples") or []:
            print(f"  {sample.get('id')} → {sample.get('holderCode')}  ({sample.get('fullName')})", flush=True)

        if dry_run:
            if args.json:
                print(json.dumps(report, ensure_ascii=False, indent=2))
            print("dry-run only — pass --apply to write (WHERE holder_code IS NULL OR '')", flush=True)
            return 0

        if not args.yes:
            answer = input(
                f"Apply UPDATE for {report['wouldUpdate']} rows? Type YES to continue: "
            ).strip()
            if answer != "YES":
                print("aborted", flush=True)
                return 2

        applied = app.apply_holder_code_backfill(conn, dry_run=False)
        print(
            f"updated={applied['updated']} (requested wouldUpdate={applied['wouldUpdate']})",
            flush=True,
        )
        if args.json:
            print(json.dumps(applied, ensure_ascii=False, indent=2))
        return 0


if __name__ == "__main__":
    raise SystemExit(main())
