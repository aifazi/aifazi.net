from pathlib import Path

p = Path(r"E:\aifazi Neon city\aifazi.net\aifazi.net-frontend-next\app\globals.css")
t = p.read_text(encoding="utf-8")
block = """

/* ══════════════════════════════════════════
   A11Y — keyboard parity for hover cards
   ══════════════════════════════════════════ */
[role="button"]:focus-visible,
button:focus-visible,
a:focus-visible,
.ec-cat-card:focus-visible,
.clickable-card:focus-visible {
  outline: 2px solid var(--green);
  outline-offset: 2px;
}
/* Cards that only change on :hover also show focus state */
[role="button"]:focus-visible {
  filter: brightness(1.08);
}
"""
if "A11Y — keyboard parity" not in t:
    p.write_text(t.rstrip() + "\n" + block, encoding="utf-8")
    print("added focus-visible parity CSS")
else:
    print("already present")
