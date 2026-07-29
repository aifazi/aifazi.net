import { ApplicationFormPage } from '@/pages-src/ApplicationForms'

export const metadata = {
  title: 'Application — AIFAZI RP',
}

export default async function FormPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  return <ApplicationFormPage slug={slug} />
}
