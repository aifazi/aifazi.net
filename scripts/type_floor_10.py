from pathlib import Path
import re

root = Path(r"E:\aifazi Neon city\aifazi.net\aifazi.net-frontend-next")
pat = re.compile(r"fontSize:\s*10\b")
changed = 0
files = 0
for p in list(root.rglob("*.jsx")) + list(root.rglob("*.tsx")):
    s = str(p)
    if "node_modules" in s or ".next" in s or p.name.endswith(".d.ts"):
        continue
    t = p.read_text(encoding="utf-8", errors="ignore")
    n = len(pat.findall(t))
    if not n:
        continue
    p.write_text(pat.sub("fontSize: 11", t), encoding="utf-8")
    changed += n
    files += 1
print("files", files, "replacements", changed)
