from pathlib import Path

# 1) HelpDesk loading → SkeletonList
p = Path(r"E:\aifazi Neon city\aifazi.net\aifazi.net-frontend-next\pages-src\HelpDesk.jsx")
t = p.read_text(encoding="utf-8")
if "SkeletonList" not in t:
    t = t.replace(
        "import Clickable from '@/core/Clickable.jsx'",
        "import Clickable from '@/core/Clickable.jsx'\nimport { SkeletonList } from '@/core/Feedback'",
        1,
    )
    old = "{loading && <div style={{ textAlign: 'center', padding: '24px 0', ...mono, fontSize: 11, color: 'var(--m"
    # find full line
    for line in t.splitlines():
        if "loading && <div" in line and "textAlign" in line:
            t = t.replace(line, "      {loading && <SkeletonList rows={4} />}", 1)
            break
    p.write_text(t, encoding="utf-8")
    print("HelpDesk skeleton", "SkeletonList" in t)
else:
    print("HelpDesk already")

# 2) productJsonLd in seo.js
seo = Path(r"E:\aifazi Neon city\aifazi.net\aifazi.net-frontend-next\lib\seo.js")
s = seo.read_text(encoding="utf-8")
if "productJsonLd" not in s:
    s += """
export function productJsonLd(opts) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: opts.name,
    description: opts.description || '',
    image: opts.image ? [opts.image] : undefined,
    url: opts.url,
    brand: { '@type': 'Brand', name: opts.brand || 'AIFAZI RP' },
    offers: opts.price != null ? {
      '@type': 'Offer',
      price: opts.price,
      priceCurrency: opts.currency || 'USD',
      availability: 'https://schema.org/InStock',
      url: opts.url,
    } : undefined,
  }
}

export function serviceJsonLd(opts) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Service',
    name: opts.name,
    description: opts.description || '',
    url: opts.url,
    provider: { '@type': 'Organization', name: 'AIFAZI RP', url: opts.siteUrl },
  }
}
"""
    seo.write_text(s, encoding="utf-8")
    print("seo product/service helpers added")

print("done step1")
