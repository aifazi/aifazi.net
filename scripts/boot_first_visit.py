from pathlib import Path

p = Path(r"E:\aifazi Neon city\aifazi.net\aifazi.net-frontend-next\components\LoadingScreen.jsx")
t = p.read_text(encoding="utf-8")

old = """export default function LoadingScreen({ onComplete, style }) {"""
new = """const BOOT_SEEN_KEY = "aifazi_boot_seen"

export default function LoadingScreen({ onComplete, style }) {
  // Repeat visits skip the theatrical boot (still call onComplete so the veil never sticks).
  const [skipBoot, setSkipBoot] = useState(false)
  useEffect(() => {
    try {
      if (localStorage.getItem(BOOT_SEEN_KEY)) {
        setSkipBoot(true)
        onComplete?.()
        return
      }
      localStorage.setItem(BOOT_SEEN_KEY, "1")
    } catch { /* private mode */ }
  }, [onComplete])
  if (skipBoot) return null
"""

if old not in t:
    raise SystemExit("LoadingScreen export not found")
# ensure useEffect/useState imported
if "useEffect" not in t.split("\n", 30)[0:30].__str__() and "useEffect" not in t[:800]:
    t = t.replace("import { useState", "import { useEffect, useState", 1)
    if "useEffect" not in t[:800]:
        t = "import { useEffect, useState } from 'react'\n" + t

t = t.replace(old, new, 1)
p.write_text(t, encoding="utf-8")
print("LoadingScreen first-visit gate added")
print("has useEffect import", "useEffect" in t[:900])
