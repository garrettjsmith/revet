'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import type { Organization, OrgMember } from '@/lib/types'

interface SidebarProps {
  currentOrg: Organization
  memberships: (OrgMember & { org: Organization })[]
  userEmail: string
  isAgencyAdmin?: boolean
}

export function Sidebar({ currentOrg, memberships, userEmail, isAgencyAdmin }: SidebarProps) {
  const router = useRouter()
  const pathname = usePathname()
  const supabase = createClient()
  const [orgSwitcherOpen, setOrgSwitcherOpen] = useState(false)

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/admin/login')
    router.refresh()
  }

  const basePath = `/admin/${currentOrg.slug}`

  const toolGroups = [
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
    // Future tool groups:
    // { label: 'Rankings', items: [...] },
    // { label: 'Listings', items: [...] },
    // { label: 'Links', items: [...] },
  ]

  const isActive = (href: string) => {
    if (href === basePath) return pathname === basePath
    return pathname.startsWith(href)
  }

  return (
    <aside className="w-60 border-r border-warm-border h-screen flex flex-col bg-cream sticky top-0">
      {/* Org switcher */}
      <div className="p-4 border-b border-warm-border">
        <button
          onClick={() => setOrgSwitcherOpen(!orgSwitcherOpen)}
          className="w-full flex items-center gap-3 px-2 py-1.5 rounded-lg hover:bg-warm-light transition-colors text-left"
        >
          {currentOrg.logo_url ? (
            <img src={currentOrg.logo_url} alt="" className="w-8 h-8 rounded-lg object-contain" />
          ) : (
            <div className="w-8 h-8 rounded-lg bg-ink flex items-center justify-center text-cream text-xs font-bold font-mono shrink-0">
              {currentOrg.name[0]}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium text-ink truncate">{currentOrg.name}</div>
          </div>
          <ChevronIcon className={`w-4 h-4 text-warm-gray transition-transform ${orgSwitcherOpen ? 'rotate-180' : ''}`} />
        </button>

        {/* Dropdown */}
        {orgSwitcherOpen && (
          <div className="mt-2 border border-warm-border rounded-lg bg-cream overflow-hidden">
            {memberships.map((m) => (
              <Link
                key={m.org.id}
                href={`/admin/${m.org.slug}`}
                onClick={() => setOrgSwitcherOpen(false)}
                className={`flex items-center gap-3 px-3 py-2 text-sm no-underline transition-colors ${
                  m.org.id === currentOrg.id
                    ? 'bg-warm-light text-ink font-medium'
                    : 'text-warm-gray hover:bg-warm-light hover:text-ink'
                }`}
              >
                <div className="w-6 h-6 rounded bg-ink flex items-center justify-center text-cream text-[10px] font-bold font-mono shrink-0">
                  {m.org.name[0]}
                </div>
                <span className="truncate">{m.org.name}</span>
              </Link>
            ))}
            <Link
              href="/admin/orgs/new"
              onClick={() => setOrgSwitcherOpen(false)}
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

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-4 px-3">
        {toolGroups.map((group, gi) => (
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

      {/* Settings + Agency + User */}
      <div className="border-t border-warm-border p-3 space-y-1">
        {isAgencyAdmin && (
          <Link
            href="/agency"
            className={`flex items-center gap-2.5 px-2 py-1.5 rounded-md text-sm no-underline transition-colors ${
              pathname.startsWith('/agency')
                ? 'bg-warm-light text-ink font-medium'
                : 'text-warm-gray hover:text-ink hover:bg-warm-light/50'
            }`}
          >
            <AgencyIcon className="w-4 h-4 shrink-0" />
            Agency
          </Link>
        )}
        <Link
          href={`${basePath}/settings`}
          className={`flex items-center gap-2.5 px-2 py-1.5 rounded-md text-sm no-underline transition-colors ${
            pathname.startsWith(`${basePath}/settings`)
              ? 'bg-warm-light text-ink font-medium'
              : 'text-warm-gray hover:text-ink hover:bg-warm-light/50'
          }`}
        >
          <SettingsIcon className="w-4 h-4 shrink-0" />
          Settings
        </Link>
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

function ChevronIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="6 9 12 15 18 9" />
    </svg>
  )
}
