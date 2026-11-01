#!/usr/bin/env python3
"""NIGHTRIDE — remove automated-test residue from the local dev database.

scripts/api-tests.mjs now deletes its own throwaway accounts after every run
(see teardown() there). This utility is the belt-and-suspenders fallback for
runs that crashed before teardown could execute (e.g. the sandbox was recycled
mid-run): it deletes every profile whose username matches the test-suite
pattern (testa*/testb*/testd*/testz*). Reports, comments, confirmations,
abuse flags, rides, sessions and settings cascade with the profile.

Real accounts and real synced data (DeFlock/OSM ALPR inventory, NWS public
safety events) are never touched.

Usage: python3 scripts/clean-test-data.py [--dry-run]
"""
import sqlite3
import sys
from pathlib import Path

DB = Path(__file__).resolve().parent.parent / "db" / "custom.db"
PATTERN = ("testa%", "testb%", "testd%", "testz%")

def main() -> int:
    dry = "--dry-run" in sys.argv
    if not DB.exists():
        print(f"no database at {DB} — nothing to clean")
        return 0
    con = sqlite3.connect(DB)
    cur = con.cursor()
    cur.execute("PRAGMA foreign_keys = ON")
    where = " OR ".join("username LIKE ?" for _ in PATTERN)
    rows = cur.execute(f"SELECT username FROM profiles WHERE {where}", PATTERN).fetchall()
    names = [r[0] for r in rows]
    if not names:
        print("clean — no test accounts found")
        con.close()
        return 0
    print(f"{'would delete' if dry else 'deleting'} {len(names)} test account(s): {', '.join(names)}")
    if not dry:
        cur.execute(f"DELETE FROM profiles WHERE {where}", PATTERN)
        con.commit()
        print("done — reports/rides/comments owned by them cascade-deleted")
    con.close()
    return 0

if __name__ == "__main__":
    sys.exit(main())
