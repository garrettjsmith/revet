import { createServerSupabase } from '@/lib/supabase/server'
import { ProfileForm } from '@/components/profile-form'
import { notFound } from 'next/navigation'
import type { ReviewProfile, Organization } from '@/lib/types'

export const dynamic = 'force-dynamic'

export default async function EditProfilePage({ params }: { params: { id: string } }) {
  const supabase = createServerSupabase()

  const [profileRes, orgsRes] = await Promise.all([
    supabase.from('review_profiles').select('*').eq('id', params.id).single(),
    supabase.from('organizations').select('*').order('name'),
  ])

  if (!profileRes.data) notFound()

  return (
    <div>
      <h1 className="text-2xl font-serif text-ink mb-6">
        Edit: {profileRes.data.name}
      </h1>
      <ProfileForm
        profile={profileRes.data as ReviewProfile}
        organizations={(orgsRes.data || []) as Organization[]}
      />
    </div>
  )
}
