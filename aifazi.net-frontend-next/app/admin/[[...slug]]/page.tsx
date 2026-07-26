import type { Metadata }  from 'next'
import AdminClient from '@/pages-src/Admin'
export const metadata: Metadata = { title: 'Admin Portal', robots: { index: false } }
export default function Page() { return <AdminClient /> }
