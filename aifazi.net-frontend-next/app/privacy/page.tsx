import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description: 'How aifazi.net collects, uses, and protects your data.',
}

// Project-specific policy: what the platform (accounts, OAuth/directory,
// forum, store, FiveM, VPN, mail) actually stores and why.
const SECTIONS: Array<[string, string]> = [
  [
    'Data we collect',
    'Account identifiers you provide (username, email, password hash — never ' +
      'plaintext passwords); profile data from login providers (Discord, GitHub, ' +
      'Steam, Authentik user IDs, avatars, and email addresses; LDAP uid, mail, ' +
      'and group memberships); content you create (forum posts, chat messages, ' +
      'support tickets, store orders, uploaded files); payment metadata such as ' +
      'order records and totals (card details stay with Stripe — we never see ' +
      'them); and technical/security data (IP addresses, user agents, device push ' +
      'tokens, VPN peer metadata, and audit logs kept for abuse prevention).',
  ],
  [
    'How we use it',
    'To operate and secure the service: sign-in (including directory and OAuth ' +
      'flows), forum and chat participation, store checkout and order delivery, ' +
      'FiveM whitelist checks, VPN peer mapping, and support. We also use it to ' +
      'prevent abuse (rate limiting, IP bans, malware scanning of uploads) and ' +
      'to send service messages you asked for, such as order updates, password ' +
      'resets, and security notices. We do not sell personal data.',
  ],
  [
    'Login providers & directory',
    'When you sign in with Discord, GitHub, Steam, or Authentik, that provider ' +
      'shares your basic profile (identifier, username, avatar, email) so we can ' +
      'recognise you and link your site account. Directory (LDAP) logins read ' +
      'your uid, mail, and groups for the same purpose. FiveM whitelist checks ' +
      'read your linked Discord identity; WireGuard login maps your VPN address ' +
      'to your account.',
  ],
  [
    'Processors & infrastructure',
    'The platform runs on self-managed infrastructure plus a small set of ' +
      'processors, each receiving only what it needs: Supabase (database), ' +
      'Stripe (payments), Sentry (error reports), Cloudflare (security and ' +
      'delivery), Resend (transactional email), Expo push services (mobile and ' +
      'web notifications), and our CDN proxy for media. There are no ' +
      'advertising trackers.',
  ],
  [
    'Cookies & local storage',
    'We use strictly-necessary cookies and browser storage for sessions and ' +
      'security, plus local preferences such as theme choice and dismissed ' +
      'announcements. No third-party advertising cookies.',
  ],
  [
    'Sharing & disclosure',
    'We do not sell or rent personal data. Staff may access account and content ' +
      'data for support, moderation, and safety purposes. We disclose data when ' +
      'required by law or to prevent fraud, abuse, or harm to the service or others.',
  ],
  [
    'Retention & your rights',
    'Account and content data is kept while your account is active. Order and ' +
      'financial records are retained as required for legal and tax obligations. ' +
      'Security and audit logs are time-limited. You may request access, ' +
      'correction, or deletion of your data at any time via the contact page or ' +
      'your profile settings; deletion removes your account and content where ' +
      'feasible (anonymised remnants may persist in backups and audit logs).',
  ],
  [
    'Contact & changes',
    'Questions about this policy? Reach out via the contact page and we will ' +
      'respond. We may update this policy as the service evolves; material ' +
      'changes will be noted here with a new revision date.',
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
          Last updated: October 2026
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
