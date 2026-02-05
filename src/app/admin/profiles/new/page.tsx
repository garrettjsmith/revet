import { createServerSupabase } from '@/lib/supabase/server'
import { ProfileForm } from '@/components/profile-form'
import type { Organization } from '@/lib/types'

export const dynamic = 'force-dynamic'

export default async function NewProfilePage() {
  const supabase = createServerSupabase()

  const { data: orgs } = await supabase
    .from('organizations')
    .select('*')
    .order('name')
    .returns<Organization[]>()

  return (
    <div>
      <h1 className="text-xl font-semibold text-white mb-6">New Review Funnel</h1>
      {(!orgs || orgs.length === 0) ? (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 text-center">
          <p className="text-gray-400 text-sm mb-4">
            You need to create an organization first before adding review funnels.
          </p>
          <p className="text-xs text-gray-600">
            Run in Supabase SQL Editor:<br />
            <code className="text-sky-400 font-mono">
              INSERT INTO organizations (name, slug) VALUES (&apos;Sturdy Health&apos;, &apos;sturdy-health&apos;);
            </code>
          </p>
        </div>
      ) : (
        <ProfileForm organizations={orgs} />
      )}
    </div>
  )
}
