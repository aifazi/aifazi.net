from pathlib import Path

p = Path(r"E:\aifazi Neon city\aifazi.net\aifazi.net-frontend-next\app\layout.tsx")
t = p.read_text(encoding="utf-8")

if "organizationJsonLd" in t:
    print("already injected")
    raise SystemExit(0)

# 1) import seo helpers after SITE_URL import
t = t.replace(
    "import { SITE_URL } from '@/lib/config'",
    "import { SITE_URL } from '@/lib/config'\nimport { jsonLdScript, organizationJsonLd, websiteJsonLd } from '@/lib/seo'",
    1,
)

# 2) extend metadata with alternates/canonical (metadataBase already set)
if "alternates:" not in t:
    t = t.replace(
        "metadataBase: new URL(SITE_URL),",
        "metadataBase: new URL(SITE_URL),\n  alternates: { canonical: '/' },",
        1,
    )

# 3) inject JSON-LD scripts in <head> after site-config-data script block
needle = """        <script
          id="site-config-data"
          type="application/json"
          dangerouslySetInnerHTML={{ __html: escapeJsonForInline(siteConfig) }}
        />
"""
inject = needle + """        {/* SEO: Organization + WebSite JSON-LD */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: jsonLdScript(organizationJsonLd(SITE_URL)) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: jsonLdScript(websiteJsonLd(SITE_URL)) }}
        />
"""
if needle not in t:
    raise SystemExit("head inject point not found")
t = t.replace(needle, inject, 1)

p.write_text(t, encoding="utf-8")
print("layout.tsx SEO JSON-LD + canonical injected")
