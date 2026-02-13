import { createAdminClient } from '@/lib/supabase/admin'
import type { MetadataRoute } from 'next'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://use.revet.app'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const supabase = createAdminClient()

  const { data: landers } = await supabase
    .from('local_landers')
    .select('slug, updated_at')
    .eq('active', true)
    .order('updated_at', { ascending: false })

  if (!landers) return []

  return landers.map((lander) => ({
    url: `${APP_URL}/l/${lander.slug}`,
    lastModified: new Date(lander.updated_at),
    changeFrequency: 'weekly' as const,
    priority: 0.8,
  }))
}
