import type { Metadata } from 'next'
import ProductDetail from '@/pages-src/store/ProductDetail'
import { SITE_URL } from '@/lib/config'
import { jsonLdScript, productJsonLd } from '@/lib/seo'

export const dynamic = 'force-dynamic'

interface Props {
  params: Promise<{ slug: string }>
}

function backendBaseUrl(): string {
  if (process.env.INTERNAL_API_URL) return process.env.INTERNAL_API_URL.replace(/\/+$/, '')
  const pub = process.env.NEXT_PUBLIC_API_URL
  if (pub && !/^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(pub)) {
    return pub.replace(/\/+$/, '')
  }
  return ''
}

// Best-effort server fetch for SEO only — the client component below still
// owns all interactive behavior and error states.
async function getProduct(slug: string) {
  if (!/^[a-z0-9-]{1,128}$/i.test(slug)) return null
  const base = backendBaseUrl()
  if (!base) return null
  try {
    const res = await fetch(`${base}/api/store/products/${encodeURIComponent(slug)}`, {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    })
    if (!res.ok) return null
    const data = await res.json()
    return (data?.product ?? data ?? null) as {
      id?: string | number
      name?: string
      description?: string
      price?: number
      image_url?: string
      slug?: string
    } | null
  } catch {
    return null
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const canonical = `/fivem/store/product/${slug}`
  try {
    const p = await getProduct(slug)
    if (!p?.name) {
      return { title: 'Product', alternates: { canonical } }
    }
    const title = p.name
    const description = (p.description || p.name).slice(0, 160)
    return {
      title,
      description,
      alternates: { canonical },
      openGraph: {
        title,
        description,
        url: `${SITE_URL}${canonical}`,
        type: 'website',
        images: p.image_url ? [p.image_url] : [],
      },
      twitter: { card: 'summary_large_image', title, description },
    }
  } catch {
    return { title: 'Product', alternates: { canonical } }
  }
}

export default async function Page({ params }: Props) {
  const { slug } = await params
  const url = `${SITE_URL}/fivem/store/product/${slug}`
  let ld: Record<string, unknown> | null = null
  try {
    const p = await getProduct(slug)
    if (p?.name) {
      // F2: escaped Product JSON-LD (lib/seo jsonLdScript neutralizes `<`).
      ld = productJsonLd({
        name: p.name,
        description: p.description || '',
        image: p.image_url,
        url,
        price: p.price,
      }) as unknown as Record<string, unknown>
    }
  } catch {
    ld = null
  }
  return (
    <>
      {ld ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: jsonLdScript(ld) }}
        />
      ) : null}
      <ProductDetail />
    </>
  )
}
