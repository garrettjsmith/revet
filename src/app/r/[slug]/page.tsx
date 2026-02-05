import { createAdminClient } from '@/lib/supabase/admin'
import { ReviewFunnel } from '@/components/review-funnel'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import type { ReviewProfile } from '@/lib/types'

// ISR: regenerate every 5 minutes so profile edits propagate fast
export const revalidate = 300

interface Props {
  params: { slug: string }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('review_profiles')
    .select('name, heading')
    .eq('slug', params.slug)
    .eq('active', true)
    .single()

  if (!data) return { title: 'Not Found' }

  return {
    title: data.heading || data.name,
    robots: { index: false, follow: false }, // don't index patient pages
  }
}

export default async function ReviewPage({ params }: Props) {
  const supabase = createAdminClient()

  const { data: profile } = await supabase
    .from('review_profiles')
    .select('*')
    .eq('slug', params.slug)
    .eq('active', true)
    .single()

  if (!profile) notFound()

  return <ReviewFunnel profile={profile as ReviewProfile} />
}
