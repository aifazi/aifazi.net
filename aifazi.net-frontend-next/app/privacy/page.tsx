import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description: 'How aifazi.net collects, uses, and protects your data.',
}

// Generic placeholder policy — the site owner should review and adapt each
// section (data collected, processors, retention, contact) before relying on it.
const SECTIONS: Array<[string, string]> = [
  [
    'Data we collect',
    'Account details you provide (such as username and email), content you post ' +
      '(forum threads, support tickets, store orders), and basic technical logs ' +
      '(IP address, user agent) used for security and abuse prevention.',
  ],
  [
    'How we use it',
    'To operate the site (auth, forum, store checkout, support), to keep the ' +
      'platform secure, and to send service messages you asked for (order updates, ' +
      'password resets). We do not sell personal data.',
  ],
  [
    'Third-party processors',
    'Payments are handled by Stripe; realtime features use Supabase; media is ' +
      'served via our CDN proxy; error reports go to Sentry; push notifications ' +
      'use Expo/VAPID. Each processor handles only the data it needs.',
  ],
  [
    'Cookies & storage',
    'We use strictly-necessary cookies and local storage for sessions, theme ' +
      'preferences, and dismissed announcements. No advertising trackers.',
  ],
  [
    'Retention & your rights',
    'Account and order records are kept as long as needed for the service and ' +
      'legal obligations. You may request access, correction, or deletion of ' +
      'your data at any time via the contact page.',
  ],
  [
    'Contact',
    'Questions about this policy? Reach out via the contact page and we will respond.',
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
          Privacy Policy
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
