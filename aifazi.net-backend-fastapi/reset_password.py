#!/usr/bin/env python3
"""
reset_password.py — Generate a bcrypt hash for ADMIN_PASSWORD
Run:  python reset_password.py
Then copy the BCRYPT HASH into Render dashboard → ADMIN_PASSWORD env var.
"""
import getpass
import sys

import bcrypt


def main():
    print("=" * 55)
    print("  AIFAZI — Admin Password Reset Helper")
    print("=" * 55)
    print()

    pw  = getpass.getpass("Enter your NEW admin password: ")
    pw2 = getpass.getpass("Confirm password: ")

    if pw != pw2:
        print("\n❌ Passwords do not match. Aborted.")
        sys.exit(1)

    if len(pw) < 8:
        print("\n❌ Password must be at least 8 characters.")
        sys.exit(1)

    hashed = bcrypt.hashpw(pw.encode("utf-8"), bcrypt.gensalt(rounds=12)).decode("utf-8")

    print()
    print("=" * 55)
    print("✅ Paste this into Render → Environment Variables:")
    print()
    print("  Key:   ADMIN_PASSWORD")
    print(f"  Value: {hashed}")
    print()
    print("Then click 'Save Changes' and redeploy (or 'Manual Deploy').")
    print("=" * 55)

if __name__ == "__main__":
    main()
