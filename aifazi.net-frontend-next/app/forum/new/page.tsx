export const dynamic = 'force-dynamic'
import { Suspense } from 'react'
import ForumNewThreadClient from '@/pages-src/ForumNewThread'
// ForumNewThread directly calls useSearchParams() — requires Suspense in App Router
export default function Page() { return <Suspense fallback={null}><ForumNewThreadClient /></Suspense> }
