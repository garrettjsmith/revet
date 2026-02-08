import { createAdminClient } from '@/lib/supabase/admin'
import Link from 'next/link'
import { Suspense } from 'react'
import type { AgencyIntegration, AgencyIntegrationMapping } from '@/lib/types'
import { IntegrationStatusBanner } from './status-banner'
import { MappingsTable } from './mappings-table'
import { SyncButton } from './sync-button'
import { DisconnectButton } from './disconnect-button'

export const dynamic = 'force-dynamic'

// Integration provider definitions
const PROVIDERS = [
  {
    id: 'google',
    name: 'Google',
    description: 'Access Google Business Profile, Search Console, Analytics, and Ads through a single connection.',
    resourceTypes: [
      { type: 'gbp_location', label: 'GBP Locations', scope: 'location' },
      { type: 'gsc_property', label: 'Search Console Properties', scope: 'org' },
      { type: 'ga_property', label: 'Analytics Properties', scope: 'org' },
      { type: 'ads_account', label: 'Ads Accounts', scope: 'org' },
    ],
    icon: GoogleIcon,
  },
  {
    id: 'local_falcon',
    name: 'Local Falcon',
    description: 'Geo-grid rank tracking for local search visibility across map results.',
    resourceTypes: [
      { type: 'lf_campaign', label: 'Campaigns', scope: 'location' },
    ],
    icon: LocalFalconIcon,
  },
  {
    id: 'yelp',
    name: 'Yelp',
    description: 'Monitor reviews and business information on Yelp.',
    resourceTypes: [
      { type: 'yelp_business', label: 'Business Listings', scope: 'location' },
    ],
    icon: DirectoryIcon,
  },
  {
    id: 'facebook',
    name: 'Facebook',
    description: 'Manage Facebook business pages and monitor reviews.',
    resourceTypes: [
      { type: 'fb_page', label: 'Pages', scope: 'location' },
    ],
    icon: DirectoryIcon,
  },
]

export default async function AgencyIntegrationsPage() {
  const supabase = createAdminClient()

  // Fetch connected integrations
  const { data: integrations } = await supabase
    .from('agency_integrations')
    .select('*')
    .order('created_at')

  // Fetch all mappings with org and location names
  const { data: mappings } = await supabase
    .from('agency_integration_mappings')
    .select('*, organizations(name, slug), locations(name)')
    .order('created_at')

  const connectedIntegrations = (integrations || []) as AgencyIntegration[]
  const allMappings = (mappings || []) as (AgencyIntegrationMapping & {
    organizations?: { name: string; slug: string } | null
    locations?: { name: string } | null
  })[]

  // Map connected status by provider
  const integrationByProvider: Record<string, AgencyIntegration> = {}
  connectedIntegrations.forEach((i) => {
    integrationByProvider[i.provider] = i
  })

  // Map mappings by integration ID
  const mappingsByIntegration: Record<string, typeof allMappings> = {}
  allMappings.forEach((m) => {
    if (!mappingsByIntegration[m.integration_id]) {
      mappingsByIntegration[m.integration_id] = []
    }
    mappingsByIntegration[m.integration_id].push(m)
  })

  const connectedCount = connectedIntegrations.filter((i) => i.status === 'connected').length

  return (
    <div>
      <Suspense fallback={null}>
        <IntegrationStatusBanner />
      </Suspense>

      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-serif text-ink">Integrations</h1>
          <p className="text-sm text-warm-gray mt-1">
            Connect your accounts once and map resources to organizations and locations.
          </p>
        </div>
        <div className="text-xs text-warm-gray">
          {connectedCount} of {PROVIDERS.length} connected
        </div>
      </div>

      {/* Integration cards */}
      <div className="grid gap-6">
        {PROVIDERS.map((provider) => {
          const integration = integrationByProvider[provider.id]
          const isConnected = integration?.status === 'connected'
          const isError = integration?.status === 'error'
          const integrationMappings = integration ? (mappingsByIntegration[integration.id] || []) : []

          return (
            <div
              key={provider.id}
              className="border border-warm-border rounded-xl overflow-hidden"
            >
              {/* Provider header */}
              <div className="px-6 py-5 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-lg bg-ink flex items-center justify-center shrink-0">
                    <provider.icon className="w-5 h-5 text-cream" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-semibold text-ink">{provider.name}</h3>
                      {isConnected ? (
                        <span className="inline-flex items-center gap-1 text-[10px] text-emerald-600 font-medium">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                          Connected
                        </span>
                      ) : isError ? (
                        <span className="inline-flex items-center gap-1 text-[10px] text-amber-600 font-medium">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                          Reconnect needed
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[10px] text-warm-gray">
                          <span className="w-1.5 h-1.5 rounded-full bg-warm-border" />
                          Not connected
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-warm-gray mt-0.5">{provider.description}</p>
                    {(isConnected || isError) && integration!.account_email && (
                      <p className="text-xs text-ink font-mono mt-1">{integration!.account_email}</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {isConnected ? (
                    /* Connected state — sync + manage mappings + disconnect */
                    <>
                      {provider.id === 'google' && (
                        <>
                          <SyncButton endpoint="/api/google/profiles/sync" label="Sync Profiles" />
                          <SyncButton endpoint="/api/google/reviews/sync" label="Sync Reviews" />
                          <Link
                            href="/agency/integrations/google/setup"
                            className="px-4 py-2 border border-warm-border text-ink text-xs rounded-full hover:bg-warm-light transition-colors"
                          >
                            Manage Mappings
                          </Link>
                        </>
                      )}
                      {provider.id === 'google' ? (
                        <DisconnectButton provider="google" />
                      ) : (
                        <button
                          className="px-4 py-2 border border-warm-border text-warm-gray text-xs rounded-full cursor-not-allowed opacity-50"
                          disabled
                        >
                          Disconnect
                        </button>
                      )}
                    </>
                  ) : isError && provider.id === 'google' ? (
                    /* Error state — reconnect button */
                    <a
                      href="/api/integrations/google/connect"
                      className="px-5 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-medium rounded-full transition-colors"
                    >
                      Reconnect Google
                    </a>
                  ) : provider.id === 'google' ? (
                    /* Not connected — live connect button for Google */
                    <a
                      href="/api/integrations/google/connect"
                      className="px-5 py-2 bg-ink hover:bg-ink/90 text-cream text-xs font-medium rounded-full transition-colors"
                    >
                      Connect Google
                    </a>
                  ) : (
                    /* Not connected — disabled for other providers */
                    <button
                      className="px-5 py-2 bg-ink text-cream text-xs font-medium rounded-full cursor-not-allowed opacity-50"
                      disabled
                      title="Coming soon"
                    >
                      Connect {provider.name}
                    </button>
                  )}
                </div>
              </div>

              {/* Resource types + mappings */}
              {isConnected && (
                <div className="border-t border-warm-border">
                  <div className="px-6 py-4">
                    <div className="text-[10px] text-warm-gray uppercase tracking-wider font-medium mb-3">
                      Resource Mappings
                    </div>

                    {provider.resourceTypes.map((rt) => {
                      const rtMappings = integrationMappings.filter((m) => m.resource_type === rt.type)

                      return (
                        <div key={rt.type} className="mb-4 last:mb-0">
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-medium text-ink">{rt.label}</span>
                              <span className="text-[10px] text-warm-gray px-1.5 py-0.5 border border-warm-border rounded">
                                {rt.scope === 'org' ? 'Org-level' : 'Location-level'}
                              </span>
                            </div>
                            <span className="text-xs text-warm-gray font-mono">{rtMappings.length} mapped</span>
                          </div>

                          {rtMappings.length > 0 ? (
                            <MappingsTable mappings={rtMappings} scope={rt.scope} />
                          ) : (
                            <div className="text-xs text-warm-gray py-2 px-3 border border-dashed border-warm-border rounded-lg text-center">
                              No {rt.label.toLowerCase()} mapped yet. Connect resources after setting up organizations and locations.
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Not connected — show what you'd get */}
              {!isConnected && (
                <div className="border-t border-warm-border bg-warm-light/30 px-6 py-4">
                  <div className="text-[10px] text-warm-gray uppercase tracking-wider font-medium mb-2">
                    Available Resources
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {provider.resourceTypes.map((rt) => (
                      <span
                        key={rt.type}
                        className="text-xs text-warm-gray px-2.5 py-1 border border-warm-border rounded-full"
                      >
                        {rt.label}
                        <span className="text-[10px] text-warm-gray/60 ml-1">
                          ({rt.scope === 'org' ? 'org' : 'location'})
                        </span>
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Architecture note */}
      <div className="mt-8 border border-warm-border rounded-xl p-6 bg-warm-light/30">
        <h3 className="text-sm font-semibold text-ink mb-2">How integrations work</h3>
        <div className="space-y-2 text-xs text-warm-gray">
          <p>
            <strong className="text-ink">Connect once at the agency level.</strong>{' '}
            Your agency&apos;s Google account (or other provider account) connects here. This is the account clients grant manager/admin access to.
          </p>
          <p>
            <strong className="text-ink">Map resources to orgs and locations.</strong>{' '}
            After connecting, the API returns all properties and locations your account has access to. You map each resource to the appropriate organization (for GSC, GA) or location (for GBP, Local Falcon).
          </p>
          <p>
            <strong className="text-ink">Data flows automatically.</strong>{' '}
            Once mapped, each org/location dashboard pulls data from its connected resources. When a client grants access to new properties, they appear here for mapping.
          </p>
        </div>
      </div>
    </div>
  )
}

// SVG Icons
function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
  )
}

function LocalFalconIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
    </svg>
  )
}

function DirectoryIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
    </svg>
  )
}
