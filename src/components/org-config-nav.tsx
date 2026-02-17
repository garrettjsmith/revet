'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const tabs = [
  { label: 'Overview', href: '' },
  { label: 'Brand', href: '/brand' },
]

export function OrgConfigNav({ orgSlug }: { orgSlug: string }) {
  const pathname = usePathname()
  const base = `/agency/${orgSlug}`

  return (
    <div className="flex gap-1 border-b border-warm-border">
      {tabs.map((tab) => {
        const href = `${base}${tab.href}`
        const isActive = tab.href === ''
          ? pathname === base
          : pathname.startsWith(href)

        return (
          <Link
            key={tab.href}
            href={href}
            className={`px-4 py-2 text-sm no-underline transition-colors border-b-2 -mb-px ${
              isActive
                ? 'border-ink text-ink font-medium'
                : 'border-transparent text-warm-gray hover:text-ink'
            }`}
          >
            {tab.label}
          </Link>
        )
      })}
    </div>
  )
}
