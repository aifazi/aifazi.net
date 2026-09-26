/**
 * SEO helpers — JSON-LD + canonical metadata fragments.
 */
export function organizationJsonLd(siteUrl) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'AIFAZI RP',
    url: siteUrl,
    logo: `${siteUrl}/logo.svg`,
    sameAs: [],
  }
}

export function websiteJsonLd(siteUrl) {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'AIFAZI RP',
    url: siteUrl,
    potentialAction: {
      '@type': 'SearchAction',
      target: `${siteUrl}/search?q={search_term_string}`,
      'query-input': 'required name=search_term_string',
    },
  }
}

export function articleJsonLd(opts) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: opts.title,
    description: opts.description || '',
    url: `${opts.siteUrl}${opts.path}`,
    datePublished: opts.datePublished,
    dateModified: opts.dateModified || opts.datePublished,
    publisher: {
      '@type': 'Organization',
      name: 'AIFAZI RP',
      logo: { '@type': 'ImageObject', url: `${opts.siteUrl}/logo.svg` },
    },
  }
}

export function breadcrumbJsonLd(siteUrl, items) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((it, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: it.name,
      item: `${siteUrl}${it.path}`,
    })),
  }
}

export function jsonLdScript(data) {
  return JSON.stringify(data).replace(/</g, '\\u003c')
}

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
