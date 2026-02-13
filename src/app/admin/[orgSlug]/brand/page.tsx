import { getOrgBySlug } from '@/lib/org'
import { checkAgencyAdmin } from '@/lib/locations'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { BrandConfigForm } from '@/components/brand-config-form'

export const dynamic = 'force-dynamic'

export default async function BrandConfigPage({
  params,
}: {
  params: { orgSlug: string }
}) {
  const isAdmin = await checkAgencyAdmin()
  if (!isAdmin) redirect(`/admin/${params.orgSlug}`)

  const org = await getOrgBySlug(params.orgSlug)

  const supabase = createAdminClient()
  const { data: config } = await supabase
    .from('brand_config')
    .select('*')
    .eq('org_id', org.id)
    .single()

  return (
    <div>
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-1">
          <Link
            href={`/admin/${params.orgSlug}`}
            className="text-xs text-warm-gray hover:text-ink no-underline transition-colors"
          >
            {org.name}
          </Link>
          <span className="text-xs text-warm-gray">/</span>
        </div>
        <h1 className="text-2xl font-serif text-ink">Brand Config</h1>
        <p className="text-sm text-warm-gray mt-1">
          Configure brand voice, colors, and design style for AI-generated post content and images.
        </p>
      </div>

      <div className="border border-warm-border rounded-xl p-6 max-w-2xl">
        <BrandConfigForm
          orgId={org.id}
          config={config ? {
            brand_voice: config.brand_voice,
            design_style: config.design_style,
            primary_color: config.primary_color,
            secondary_color: config.secondary_color,
            font_style: config.font_style,
            sample_image_urls: config.sample_image_urls || [],
          } : null}
        />
      </div>
    </div>
  )
}
