'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import type { Organization, OrgMember } from '@/lib/types'

interface SidebarLocation {
  id: string
  name: string
  city: string | null
  state: string | null
  type: string
}

interface SidebarProps {
  currentOrg: Organization
  memberships: (OrgMember & { org: Organization })[]
  userEmail: string
  isAgencyAdmin?: boolean
  locations?: SidebarLocation[]
}

type Scope = 'agency' | string // 'agency' or org ID

export function Sidebar({ currentOrg, memberships, userEmail, isAgencyAdmin, locations = [] }: SidebarProps) {
  const router = useRouter()
  const pathname = usePathname()
  const supabase = createClient()
  const [scopeSelectorOpen, setScopeSelectorOpen] = useState(false)
  const [locationSelectorOpen, setLocationSelectorOpen] = useState(false)

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/admin/login')
    router.refresh()
  }

  // Determine current scope from pathname
  const currentScope: Scope = pathname.startsWith('/agency') ? 'agency' : currentOrg.id
  const isAgencyScope = currentScope === 'agency'

  const basePath = `/admin/${currentOrg.slug}`

  // Detect current location from pathname
  const locationMatch = pathname.match(/\/locations\/([a-f0-9-]{36})/)
  const currentLocationId = locationMatch ? locationMatch[1] : null
  const currentLocation = currentLocationId ? locations.find((l) => l.id === currentLocationId) : null

  // Switch scope and navigate
  const handleScopeSwitch = (scope: Scope) => {
    setScopeSelectorOpen(false)
    if (scope === 'agency') {
      router.push('/agency')
    } else {
      const org = memberships.find((m) => m.org.id === scope)?.org
      if (org) {
        router.push(`/admin/${org.slug}`)
      }
    }
  }

  // Switch location
  const handleLocationSwitch = (locationId: string | null) => {
    setLocationSelectorOpen(false)
    if (locationId) {
      router.push(`${basePath}/locations/${locationId}`)
    } else {
      router.push(basePath)
    }
  }

  // Nav items for agency scope
  const agencyNavGroups = [
    {
      label: null,
      items: [
        { href: '/agency', label: 'Overview', icon: OverviewIcon },
        { href: '/agency/organizations', label: 'Organizations', icon: OrganizationsIcon },
        { href: '/agency/locations', label: 'All Locations', icon: LocationIcon },
        { href: '/agency/landers', label: 'Landers', icon: LanderIcon },
        { href: '/agency/integrations', label: 'Integrations', icon: IntegrationsIcon },
        { href: '/agency/notifications', label: 'Notifications', icon: BellIcon },
      ],
    },
  ]

  const locationBasePath = currentLocationId ? `${basePath}/locations/${currentLocationId}` : null

  // Nav items for org scope — with optional location scoping
  const orgNavGroups = currentLocation && locationBasePath ? [
    {
      label: null,
      items: [
        { href: locationBasePath, label: 'Overview', icon: DashboardIcon },
      ],
    },
    {
      label: 'Manage',
      items: [
        { href: `${locationBasePath}/reviews`, label: 'Reviews', icon: ReviewIcon },
        { href: `${locationBasePath}/review-funnels`, label: 'Review Funnels', icon: FunnelIcon },
        { href: `${locationBasePath}/forms`, label: 'Forms', icon: FormIcon },
        { href: `${locationBasePath}/lander`, label: 'Lander', icon: LanderIcon },
        { href: `${locationBasePath}/gbp-profile`, label: 'GBP Profile', icon: IntegrationsIcon },
        { href: `${locationBasePath}/notifications`, label: 'Notifications', icon: BellIcon },
      ],
    },
  ] : [
    {
      label: null,
      items: [
        { href: basePath, label: 'Dashboard', icon: DashboardIcon },
      ],
    },
    {
      label: 'Manage',
      items: [
        { href: `${basePath}/locations`, label: 'Locations', icon: LocationIcon },
        { href: `${basePath}/reviews`, label: 'Reviews', icon: ReviewIcon },
        { href: `${basePath}/forms`, label: 'Forms', icon: FormIcon },
      ],
    },
  ]

  const navGroups = isAgencyScope ? agencyNavGroups : orgNavGroups

  const isActive = (href: string) => {
    if (href === basePath && !currentLocation) return pathname === basePath
    if (href === '/agency') return pathname === '/agency'
    if (locationBasePath && href === locationBasePath) return pathname === locationBasePath
    return pathname.startsWith(href)
  }

  // Get display info for current scope
  const scopeDisplayName = isAgencyScope ? 'Agency' : currentOrg.name
  const scopeIcon = isAgencyScope ? (
    <div className="w-8 h-8 rounded-lg bg-ink/10 flex items-center justify-center text-ink shrink-0">
      <BuildingIcon className="w-4 h-4" />
    </div>
  ) : currentOrg.logo_url ? (
    <img src={currentOrg.logo_url} alt="" className="w-8 h-8 rounded-lg object-contain" />
  ) : (
    <div className="w-8 h-8 rounded-lg bg-ink flex items-center justify-center text-cream text-xs font-bold font-mono shrink-0">
      {currentOrg.name[0]}
    </div>
  )

  return (
    <aside className="w-60 border-r border-warm-border h-screen flex flex-col bg-cream sticky top-0">
      {/* Scope selector */}
      <div className="p-4 border-b border-warm-border">
        <button
          onClick={() => setScopeSelectorOpen(!scopeSelectorOpen)}
          className="w-full flex items-center gap-3 px-2 py-1.5 rounded-lg hover:bg-warm-light transition-colors text-left"
        >
          {scopeIcon}
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium text-ink truncate">{scopeDisplayName}</div>
          </div>
          <ChevronIcon className={`w-4 h-4 text-warm-gray transition-transform ${scopeSelectorOpen ? 'rotate-180' : ''}`} />
        </button>

        {/* Scope dropdown */}
        {scopeSelectorOpen && (
          <div className="mt-2 border border-warm-border rounded-lg bg-cream overflow-hidden">
            {/* Agency option */}
            {isAgencyAdmin && (
              <>
                <button
                  onClick={() => handleScopeSwitch('agency')}
                  className={`w-full flex items-center gap-3 px-3 py-2 text-sm text-left transition-colors ${
                    currentScope === 'agency'
                      ? 'bg-warm-light text-ink font-medium'
                      : 'text-warm-gray hover:bg-warm-light hover:text-ink'
                  }`}
                >
                  <div className="w-6 h-6 rounded bg-ink/10 flex items-center justify-center text-ink shrink-0">
                    <BuildingIcon className="w-3.5 h-3.5" />
                  </div>
                  <span>Agency</span>
                </button>
                <div className="border-t border-warm-border" />
              </>
            )}

            {/* Organization options */}
            {memberships.map((m) => (
              <button
                key={m.org.id}
                onClick={() => handleScopeSwitch(m.org.id)}
                className={`w-full flex items-center gap-3 px-3 py-2 text-sm text-left transition-colors ${
                  m.org.id === currentScope
                    ? 'bg-warm-light text-ink font-medium'
                    : 'text-warm-gray hover:bg-warm-light hover:text-ink'
                }`}
              >
                <div className="w-6 h-6 rounded bg-ink flex items-center justify-center text-cream text-[10px] font-bold font-mono shrink-0">
                  {m.org.name[0]}
                </div>
                <span className="truncate">{m.org.name}</span>
              </button>
            ))}

            {/* New organization */}
            <Link
              href="/admin/orgs/new"
              onClick={() => setScopeSelectorOpen(false)}
              className="flex items-center gap-3 px-3 py-2 text-sm text-warm-gray hover:bg-warm-light hover:text-ink no-underline border-t border-warm-border transition-colors"
            >
              <div className="w-6 h-6 rounded border border-dashed border-warm-border flex items-center justify-center text-warm-gray text-xs">
                +
              </div>
              <span>New Organization</span>
            </Link>
          </div>
        )}
      </div>

      {/* Location selector (org scope only, when locations exist) */}
      {!isAgencyScope && locations.length > 0 && (
        <div className="px-4 py-2 border-b border-warm-border">
          <button
            onClick={() => setLocationSelectorOpen(!locationSelectorOpen)}
            className="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-warm-light transition-colors text-left"
          >
            <LocationIcon className="w-4 h-4 text-warm-gray shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="text-xs text-warm-gray truncate">
                {currentLocation ? currentLocation.name : 'All locations'}
              </div>
            </div>
            <ChevronIcon className={`w-3.5 h-3.5 text-warm-gray transition-transform ${locationSelectorOpen ? 'rotate-180' : ''}`} />
          </button>

          {locationSelectorOpen && (
            <div className="mt-1.5 border border-warm-border rounded-lg bg-cream overflow-hidden max-h-64 overflow-y-auto">
              {/* All locations option */}
              <button
                onClick={() => handleLocationSwitch(null)}
                className={`w-full flex items-center gap-2.5 px-3 py-1.5 text-xs text-left transition-colors ${
                  !currentLocationId
                    ? 'bg-warm-light text-ink font-medium'
                    : 'text-warm-gray hover:bg-warm-light hover:text-ink'
                }`}
              >
                All locations
              </button>
              <div className="border-t border-warm-border" />
              {locations.map((loc) => (
                <button
                  key={loc.id}
                  onClick={() => handleLocationSwitch(loc.id)}
                  className={`w-full flex items-center gap-2.5 px-3 py-1.5 text-xs text-left transition-colors ${
                    loc.id === currentLocationId
                      ? 'bg-warm-light text-ink font-medium'
                      : 'text-warm-gray hover:bg-warm-light hover:text-ink'
                  }`}
                >
                  <span className="truncate">{loc.name}</span>
                  {loc.city && (
                    <span className="text-[10px] text-warm-gray/60 shrink-0">{loc.city}</span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-4 px-3">
        {navGroups.map((group, gi) => (
          <div key={gi} className={gi > 0 ? 'mt-6' : ''}>
            {group.label && (
              <div className="px-2 mb-1.5 text-[10px] font-medium text-warm-gray uppercase tracking-wider">
                {group.label}
              </div>
            )}
            <div className="space-y-0.5">
              {group.items.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-2.5 px-2 py-1.5 rounded-md text-sm no-underline transition-colors ${
                    isActive(item.href)
                      ? 'bg-warm-light text-ink font-medium'
                      : 'text-warm-gray hover:text-ink hover:bg-warm-light/50'
                  }`}
                >
                  <item.icon className="w-4 h-4 shrink-0" />
                  {item.label}
                </Link>
              ))}
            </div>
          </div>
        ))}
      </nav>

      {/* Team + Notifications + Settings + User (only for org scope) */}
      <div className="border-t border-warm-border p-3 space-y-1">
        {!isAgencyScope && !currentLocation && (
          <Link
            href={`${basePath}/team`}
            className={`flex items-center gap-2.5 px-2 py-1.5 rounded-md text-sm no-underline transition-colors ${
              pathname.includes('/team')
                ? 'bg-warm-light text-ink font-medium'
                : 'text-warm-gray hover:text-ink hover:bg-warm-light/50'
            }`}
          >
            <TeamIcon className="w-4 h-4 shrink-0" />
            Team
          </Link>
        )}
        {!isAgencyScope && !currentLocation && (
          <Link
            href={`${basePath}/notifications`}
            className={`flex items-center gap-2.5 px-2 py-1.5 rounded-md text-sm no-underline transition-colors ${
              pathname.includes('/notifications')
                ? 'bg-warm-light text-ink font-medium'
                : 'text-warm-gray hover:text-ink hover:bg-warm-light/50'
            }`}
          >
            <BellIcon className="w-4 h-4 shrink-0" />
            Notifications
          </Link>
        )}
        {!isAgencyScope && (
          <Link
            href={currentLocation && locationBasePath ? `${locationBasePath}/settings` : `${basePath}/settings`}
            className={`flex items-center gap-2.5 px-2 py-1.5 rounded-md text-sm no-underline transition-colors ${
              pathname.includes('/settings')
                ? 'bg-warm-light text-ink font-medium'
                : 'text-warm-gray hover:text-ink hover:bg-warm-light/50'
            }`}
          >
            <SettingsIcon className="w-4 h-4 shrink-0" />
            Settings
          </Link>
        )}
        <div className="flex items-center justify-between px-2 py-1.5">
          <span className="text-[11px] text-warm-gray font-mono truncate">{userEmail}</span>
          <button
            onClick={handleLogout}
            className="text-[11px] text-warm-gray hover:text-ink transition-colors shrink-0 ml-2"
          >
            Sign out
          </button>
        </div>
      </div>
    </aside>
  )
}

// Simple inline SVG icons
function DashboardIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="9" rx="1" />
      <rect x="14" y="3" width="7" height="5" rx="1" />
      <rect x="14" y="12" width="7" height="9" rx="1" />
      <rect x="3" y="16" width="7" height="5" rx="1" />
    </svg>
  )
}

function LocationIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  )
}

function SettingsIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
    </svg>
  )
}

function AgencyIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  )
}

function ReviewIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  )
}

function FunnelIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z" />
    </svg>
  )
}

function FormIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <polyline points="10 9 9 9 8 9" />
    </svg>
  )
}

function IntegrationsIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <polyline points="15 3 21 3 21 9" />
      <line x1="10" y1="14" x2="21" y2="3" />
    </svg>
  )
}

function ChevronIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="6 9 12 15 18 9" />
    </svg>
  )
}

function BuildingIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="2" width="16" height="20" rx="1" />
      <path d="M9 22v-4h6v4" />
      <path d="M8 6h.01M16 6h.01M12 6h.01M8 10h.01M16 10h.01M12 10h.01M8 14h.01M16 14h.01M12 14h.01" />
    </svg>
  )
}

function OverviewIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 3v18h18" />
      <path d="M18 17V9" />
      <path d="M13 17V5" />
      <path d="M8 17v-3" />
    </svg>
  )
}

function LanderIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M3 9h18" />
      <path d="M9 21V9" />
    </svg>
  )
}

function BellIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  )
}

function TeamIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="7" r="4" />
      <path d="M5.5 21v-2a6.5 6.5 0 0 1 13 0v2" />
    </svg>
  )
}

function OrganizationsIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  )
}
