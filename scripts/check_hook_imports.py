#!/usr/bin/env python3
"""Fail if a source file calls useRouter/useNavigate/useSearchParams without importing it."""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / "aifazi.net-frontend-next"
SKIP = {"node_modules", ".next", "test-results", "e2e"}
HOOKS = {
    "useRouter": r"useRouter\s*\(",
    "useNavigate": r"useNavigate\s*\(",
    "useSearchParams": r"useSearchParams\s*\(",
}
failed = 0
for p in ROOT.rglob("*"):
    if p.suffix not in {".js", ".jsx", ".ts", ".tsx"}:
        continue
    if any(s in p.parts for s in SKIP):
        continue
    text = p.read_text(encoding="utf-8", errors="replace")
    # strip line comments so docs mentioning hooks do not count
    text = "\n".join(re.sub(r"//.*$", "", ln) for ln in text.splitlines())
    for name, call in HOOKS.items():
        if not re.search(call, text):
            continue
        if re.search(r"import\s*\{[^}]*\b" + name + r"\b", text) or re.search(r"import\s+" + name + r"\b", text):
            continue
        print(f"MISSING IMPORT: {p.relative_to(ROOT)} uses {name}()")
        failed += 1
if failed:
    sys.exit(1)
print(f"hook-import-check: ok ({HOOKS.keys()})")
