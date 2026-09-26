from pathlib import Path

# Map fixed neon rgba to theme-aware color-mix (same percentages as VARIANTS)
REPL = [
    ("rgba(255,107,53,0.08)", "color-mix(in srgb, var(--orange) 10%, transparent)"),
    ("rgba(255,71,87,0.06)", "color-mix(in srgb, var(--red) 8%, transparent)"),
    ("rgba(255,71,87,0.4)", "color-mix(in srgb, var(--red) 40%, transparent)"),
    ("rgba(0,255,136,0.06)", "color-mix(in srgb, var(--green) 8%, transparent)"),
    ("rgba(0,255,136,0.1)", "color-mix(in srgb, var(--green) 10%, transparent)"),
    ("rgba(0,212,255,0.06)", "color-mix(in srgb, var(--cyan) 8%, transparent)"),
    ("rgba(0,212,255,0.1)", "color-mix(in srgb, var(--cyan) 10%, transparent)"),
    # hex accents used next to those rgba tints
    ("#ff475730", "color-mix(in srgb, var(--red) 25%, transparent)"),
    ("#ff6b35", "var(--orange)"),
    ("#ff4757", "var(--red)"),
    ("#00ff88", "var(--green)"),
    ("#00d4ff", "var(--cyan)"),
]

files = [
    Path(r"E:\aifazi Neon city\aifazi.net\aifazi.net-frontend-next\pages-src\DatabaseGUI.jsx"),
    Path(r"E:\aifazi Neon city\aifazi.net\aifazi.net-frontend-next\components\Navbar.jsx"),
    Path(r"E:\aifazi Neon city\aifazi.net\aifazi.net-frontend-next\pages-src\filetools\PDFEditor.jsx"),
    Path(r"E:\aifazi Neon city\aifazi.net\aifazi.net-frontend-next\pages-src\ForumThread.jsx"),
    Path(r"E:\aifazi Neon city\aifazi.net\aifazi.net-frontend-next\components\MaintenanceScreen.jsx"),
]

for f in files:
    if not f.exists():
        print("skip missing", f.name)
        continue
    t = f.read_text(encoding="utf-8")
    orig = t
    n = 0
    for a, b in REPL:
        c = t.count(a)
        if c:
            t = t.replace(a, b)
            n += c
    if t != orig:
        f.write_text(t, encoding="utf-8")
    print(f.name, "replacements", n)
