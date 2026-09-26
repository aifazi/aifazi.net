from pathlib import Path
import re

p = Path(r"E:\aifazi Neon city\aifazi.net\aifazi.net-frontend-next\components\LoadingScreen.jsx")
t = p.read_text(encoding="utf-8")

# Collapse any duplicated first-visit gates into one clean block.
# Remove all existing BOOT_SEEN_KEY / skipBoot scaffolding first.
t = re.sub(r"const BOOT_SEEN_KEY = \"aifazi_boot_seen\"\s*", "", t)
t = re.sub(
    r"// Repeat visits skip the theatrical boot \(still call onComplete so the veil never sticks\)\.\s*"
    r"const \[skipBoot, setSkipBoot\] = useState\(false\)\s*"
    r"useEffect\(\(\) => \{.*?\}, \[onComplete\]\)\s*"
    r"if \(skipBoot\) return null\s*",
    "",
    t,
    flags=re.S,
)
# Also drop leftover duplicate useEffect blocks that reference skipBoot
t = re.sub(
    r"const \[skipBoot, setSkipBoot\] = useState\(false\)\s*"
    r"useEffect\(\(\) => \{.*?\}, \[onComplete\]\)\s*"
    r"if \(skipBoot\) return null\s*",
    "",
    t,
    flags=re.S,
)

gate = '''const BOOT_SEEN_KEY = "aifazi_boot_seen"

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
'''

if "export default function LoadingScreen" not in t:
    raise SystemExit("export missing")
t = t.replace("export default function LoadingScreen({ onComplete, style }) {", gate.rstrip() + "\n", 1)
# ensure single export remains
if t.count("export default function LoadingScreen") != 1:
    raise SystemExit("export not unique after replace: %s" % t.count("export default function LoadingScreen"))

# ensure useEffect/useState imports
head = t[:400]
if "useEffect" not in head:
    if "from 'react'" in t[:400] or 'from "react"' in t[:400]:
        t = re.sub(r"import \{([^}]+)\} from 'react'", lambda m: "import {" + ("useEffect, " if "useEffect" not in m.group(1) else "") + m.group(1).strip() + "} from 'react'", t, count=1)
    else:
        t = "import { useEffect, useState } from 'react'\n" + t

p.write_text(t, encoding="utf-8")
print("cleaned LoadingScreen")
print("BOOT_SEEN_KEY", t.count("BOOT_SEEN_KEY"))
print("skipBoot decls", t.count("const [skipBoot"))
print("export", t.count("export default function LoadingScreen"))
