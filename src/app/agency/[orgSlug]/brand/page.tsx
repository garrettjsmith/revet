import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { BrandConfigForm } from '@/components/brand-config-form'

export const dynamic = 'force-dynamic'

export default async function OrgBrandConfigPage({
  params,
}: {
  params: { orgSlug: string }
}) {
  const supabase = createAdminClient()

  const { data: org } = await supabase
    .from('organizations')
    .select('id')
    .eq('slug', params.orgSlug)
    .single()

  if (!org) redirect('/agency/organizations')

  const { data: config } = await supabase
    .from('brand_config')
    .select('*')
    .eq('org_id', org.id)
    .single()

  return (
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
  )
}
