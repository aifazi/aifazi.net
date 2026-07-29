export const metadata = {
  title: 'My Profile — AIFAZI RP',
  description: 'View your whitelist application status and player profile on AIFAZI RP.',
}

export const dynamic = 'force-dynamic'

import ForumProfileClient from '@/pages-src/ForumProfile'

export default function ProfilePage() {
  return <ForumProfileClient />
}
