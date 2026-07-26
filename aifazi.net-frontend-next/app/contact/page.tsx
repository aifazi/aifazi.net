export const dynamic = 'force-dynamic'
import type { Metadata }  from 'next'
import ContactClient from '@/pages-src/ContactPage'
export const metadata: Metadata = { title: 'Contact', description: 'Get in touch with Tanvir.' }
export default function Page() { return <ContactClient /> }
