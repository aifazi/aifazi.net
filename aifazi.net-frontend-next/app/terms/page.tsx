import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Terms of Service',
  description: 'The rules for using aifazi.net — accounts, community, FiveM, store, VPN, and acceptable use.',
}

// Project-specific terms for aifazi.net (portfolio, blog, forum, chat,
// helpdesk, store, FiveM community server, VPN access, developer tools).
const SECTIONS: Array<[string, string]> = [
  [
    'Scope',
    'These terms cover the aifazi.net website, community forum, chat, helpdesk, ' +
      'store, FiveM game server, VPN access, and developer tools (together, the ' +
      '"service"). By creating an account or using any part of the service you ' +
      'agree to these terms.',
  ],
  [
    'Accounts & identity',
    'You may register with an email address and password, sign in through the ' +
      'site directory (Authentik/LDAP), or use a linked OAuth account (Discord, ' +
      'GitHub, Steam). Keep one account per person and keep your credentials ' +
      'secret — you are responsible for everything done under your account. ' +
      'Tell us promptly if you believe your account is compromised. Staff may ' +
      'suspend or remove accounts that violate these terms. If you are under 13, ' +
      'use the service only with a parent or guardian\u2019s permission.',
  ],
  [
    'Community conduct',
    'Forum threads, chat messages, comments, and support tickets must stay lawful ' +
      'and respectful. No spam, harassment, hate speech, malware, cheating or ' +
      'game exploits, doxxing, or unlawful content. Staff moderate at their ' +
      'discretion — warnings, mutes, content removal, whitelist revocation, or ' +
      'bans. Ban and moderation appeals go through the helpdesk.',
  ],
  [
    'FiveM server',
    'Access to the FiveM server requires a whitelisted account with a linked ' +
      'Discord identity. In-game rules are posted on the server and forum; ' +
      'breaking them can cost you whitelist status or bring a ban. Game bans ' +
      'may also restrict linked site features. Appeal through a helpdesk ticket.',
  ],
  [
    'Store & payments',
    'Payments are processed securely by Stripe — we never see or store card ' +
      'numbers. Prices are shown at checkout; digital goods, VIP roles, and ' +
      'subscriptions are provisioned after successful payment to your linked ' +
      'accounts. Refunds are handled case by case — contact support with your ' +
      'order number. Fraud or chargeback abuse leads to suspension and revoked goods.',
  ],
  [
    'VPN access',
    'WireGuard peers are a per-user perk tied to your account and devices. Do ' +
      'not share access with others, route unlawful traffic, or abuse bandwidth. ' +
      'Peers that harm the network or break these terms may be revoked at any time.',
  ],
  [
    'Acceptable technical use',
    'Do not attack, probe, or degrade the platform; do not scrape at a rate ' +
      'that harms the service; do not bypass access controls, rate limits, or ' +
      'IP bans. Automation is welcome only through offered endpoints and documented flows.',
  ],
  [
    'Your content',
    'You keep ownership of what you post. By posting you grant the site a ' +
      'license to host, display, and distribute that content within the service. ' +
      'Post only content you have the right to share. We may remove content ' +
      'that violates these terms or the law.',
  ],
  [
    'Availability & liability',
    'The service is provided as-is, without warranties of any kind. We aim for ' +
      'high availability, but maintenance, outages, and beta features happen. To ' +
      'the maximum extent permitted by law, we are not liable for indirect or ' +
      'consequential damages arising from use of the service.',
  ],
  [
    'Changes & contact',
    'We may update these terms; continued use of the service after changes take ' +
      'effect means you accept them. Questions about these terms? Reach out via ' +
      'the contact page.',
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
