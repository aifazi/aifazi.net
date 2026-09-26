export const dynamic = 'force-dynamic'
import StorePage from '@/pages-src/Store'
import { storeMetadata } from '@/lib/routeMeta'

export const metadata = storeMetadata

export default function Page() {
  return <StorePage />
}
