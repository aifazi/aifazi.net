from pathlib import Path

p = Path(r"E:\aifazi Neon city\aifazi.net\aifazi.net-frontend-next\core\dialog.jsx")
t = p.read_text(encoding="utf-8")

repls = [
    (
        "background: '#0a0f0a', border: `1px solid ${v.color}`, borderRadius: 6, boxShadow: `0 0 40px ${v.glow}, 0 0 80px rgba(0,0,0,0.8)`",
        "background: 'var(--comp-dialog-bg, var(--bg2))', color: 'var(--text)', border: `1px solid ${v.color}`, borderRadius: 6, boxShadow: `0 0 40px ${v.glow}, 0 0 80px color-mix(in srgb, var(--text) 25%, transparent)`",
    ),
    (
        "background: 'rgba(10,20,30,0.8)', border: `1px solid ${v.color}44`, borderRadius: 14, backdropFilter: 'blur(24px)', boxShadow: `0 8px 40px rgba(0,0,0,0.6), 0 0 1px ${v.color}55`",
        "background: 'color-mix(in srgb, var(--bg2) 88%, transparent)', color: 'var(--text)', border: `1px solid ${v.color}44`, borderRadius: 14, backdropFilter: 'blur(24px)', boxShadow: `0 8px 40px color-mix(in srgb, var(--text) 18%, transparent), 0 0 1px ${v.color}55`",
    ),
    (
        "background: '#070b12', border: '1px solid rgba(56,189,248,0.38)', borderRadius: 14, boxShadow: '0 24px 80px rgba(0,0,0,0.65)'",
        "background: 'var(--comp-dialog-bg, var(--bg2))', color: 'var(--text)', border: '1px solid color-mix(in srgb, var(--cyan) 40%, transparent)', borderRadius: 14, boxShadow: '0 24px 80px color-mix(in srgb, var(--text) 22%, transparent)'",
    ),
    (
        "background: '#fbf5ea', color: '#1f2937', border: '1px solid #d8c7b3', borderRadius: 2, boxShadow: '0 18px 50px rgba(40,25,10,0.26)'",
        "background: 'var(--comp-dialog-bg, #fbf5ea)', color: 'var(--comp-dialog-text, #1f2937)', border: '1px solid var(--comp-dialog-border, #d8c7b3)', borderRadius: 2, boxShadow: '0 18px 50px color-mix(in srgb, var(--text) 18%, transparent)'",
    ),
    (
        "background: 'rgba(8,20,32,0.8)', border: '1px solid rgba(0,229,255,0.45)', borderRadius: 16, backdropFilter: 'blur(24px)', boxShadow: '0 0 40px rgba(0,229,255,0.18), inset 0 0 32px rgba(0,229,255,0.06), 0 12px 48px rgba(0,0,0,0.6)'",
        "background: 'color-mix(in srgb, var(--bg2) 88%, transparent)', color: 'var(--text)', border: '1px solid color-mix(in srgb, var(--cyan) 50%, transparent)', borderRadius: 16, backdropFilter: 'blur(24px)', boxShadow: `0 0 40px ${v.glow}, 0 12px 48px color-mix(in srgb, var(--text) 18%, transparent)`",
    ),
    (
        "background: '#020604', border: `1px solid ${v.color}66`, borderRadius: 4, boxShadow: `0 0 30px ${v.glow}, 0 0 60px rgba(0,0,0,0.8)`",
        "background: 'var(--comp-dialog-bg, var(--bg2))', color: 'var(--text)', border: `1px solid ${v.color}66`, borderRadius: 4, boxShadow: `0 0 30px ${v.glow}, 0 0 60px color-mix(in srgb, var(--text) 25%, transparent)`",
    ),
]

n = 0
for a, b in repls:
    if a not in t:
        print("MISS:", a[:70])
        continue
    t = t.replace(a, b, 1)
    n += 1

p.write_text(t, encoding="utf-8")
print("dialog.jsx panel surfaces updated", n, "of", len(repls))
