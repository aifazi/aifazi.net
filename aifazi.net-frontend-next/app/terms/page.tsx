import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Terms of Service',
  description: 'The rules for using aifazi.net — accounts, content, store, and acceptable use.',
}

// Generic placeholder terms — the site owner should review and adapt each
// section before relying on it.
const SECTIONS: Array<[string, string]> = [
  [
    'Acceptable use',
    'Use the site lawfully and respectfully. No spam, abuse, harassment, ' +
      'malware, scraping that harms the service, or attempts to bypass access controls.',
  ],
  [
    'Accounts',
    'You are responsible for activity under your account. Staff may suspend ' +
      'accounts that violate these terms or threaten the platform.',
  ],
  [
    'Your content',
    'You keep ownership of what you post, and you grant the site a license to ' +
      'host and display it. Do not post content you have no right to share.',
  ],
  [
    'Store & payments',
    'Digital goods and VIP subscriptions are delivered after successful payment ' +
      'via Stripe. Refunds are handled case by case — contact support with your order details.',
  ],
  [
    'Availability',
    'The service is provided as-is, without warranties. We aim for high ' +
      'availability but maintenance and outages may occur.',
  ],
  [
    'Contact',
    'Questions about these terms? Reach out via the contact page.',
  ],
]

export default function Page() {
  return (
    <div className="page-container" style={{ paddingTop: 96, paddingBottom: 80 }}>
      <div style={{ maxWidth: 760, margin: '0 auto', padding: '0 20px' }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: 3, color: 'var(--green)', marginBottom: 10 }}>
          LEGAL
        </div>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(28px, 4vw, 42px)', color: 'var(--text)', margin: '0 0 8px' }}>
          Terms of Service
        </h1>
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)', margin: '0 0 32px' }}>
          Last updated: {new Date().getFullYear()} · Generic template — edit before relying on it.
        </p>
        {SECTIONS.map(([heading, body]) => (
          <section key={heading} style={{ marginBottom: 28 }}>
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 19, color: 'var(--text)', margin: '0 0 8px' }}>
              {heading}
            </h2>
            <p style={{ fontSize: 14, lineHeight: 1.8, color: 'var(--muted)', margin: 0 }}>{body}</p>
          </section>
        ))}
      </div>
    </div>
  )
}
