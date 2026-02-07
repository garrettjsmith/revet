'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const NAV_ITEMS = [
  { href: '/agency', label: 'Overview', exact: true },
  { href: '/agency/organizations', label: 'Organizations', exact: false },
  { href: '/agency/integrations', label: 'Integrations', exact: false },
]

export function AgencyNav() {
  const pathname = usePathname()

  const isActive = (href: string, exact: boolean) => {
    if (exact) return pathname === href
    return pathname.startsWith(href)
  }

  return (
    <nav className="flex items-center gap-4">
      {NAV_ITEMS.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className={`text-sm no-underline transition-colors ${
            isActive(item.href, item.exact)
              ? 'text-cream font-medium'
              : 'text-warm-gray hover:text-cream'
          }`}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  )
}
