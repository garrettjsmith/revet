import { createAdminClient } from '@/lib/supabase/admin'
import { PublicForm } from '@/components/public-form'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import type { FormTemplate } from '@/lib/types'

// ISR: regenerate every 5 minutes so form edits propagate fast
export const revalidate = 300

interface Props {
  params: { slug: string }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('form_templates')
    .select('name, heading')
    .eq('slug', params.slug)
    .eq('active', true)
    .single()

  if (!data) return { title: 'Not Found' }

  return {
    title: data.heading || data.name,
    robots: { index: false, follow: false },
  }
}

export default async function FormPage({ params }: Props) {
  const supabase = createAdminClient()

  const { data: form } = await supabase
    .from('form_templates')
    .select('*')
    .eq('slug', params.slug)
    .eq('active', true)
    .single()

  if (!form) notFound()

  return <PublicForm form={form as FormTemplate} />
}
