'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useParams } from 'next/navigation'
import { TeamSettings } from '@/components/team-settings'

export default function TeamPage() {
  const params = useParams()
  const orgSlug = params.orgSlug as string
  const supabase = createClient()

  const [orgId, setOrgId] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      const { data: org } = await supabase
        .from('organizations')
        .select('id')
        .eq('slug', orgSlug)
        .single()

      if (org) setOrgId(org.id)
    }
    load()
  }, [orgSlug, supabase])

  if (!orgId) {
    return <div className="text-warm-gray text-sm">Loading...</div>
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-serif text-ink">Team</h1>
      <TeamSettings orgId={orgId} />
    </div>
  )
}
