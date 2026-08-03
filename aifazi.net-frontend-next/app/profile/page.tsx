export const metadata = {
  title: 'My Profile — AIFAZI RP',
  description: 'Unified profile: whitelist, orders, activity, and account settings.',
}

export const dynamic = 'force-dynamic'

import UnifiedProfile from '@/pages-src/UnifiedProfile'

export default function ProfilePage() {
  return <UnifiedProfile />
}
