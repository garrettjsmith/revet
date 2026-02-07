'use client'

import { createClient } from '@/lib/supabase/client'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'

export function AdminNav({ userEmail }: { userEmail: string }) {
  const router = useRouter()
  const pathname = usePathname()
  const supabase = createClient()

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/admin/login')
    router.refresh()
  }

  const links = [
    { href: '/admin', label: 'Dashboard' },
    { href: '/admin/profiles', label: 'Review Funnels' },
  ]

  return (
    <nav className="border-b border-warm-border px-6">
      <div className="max-w-6xl mx-auto flex items-center justify-between h-14">
        <div className="flex items-center gap-8">
          <Link href="/admin" className="flex items-center gap-2 no-underline">
            <div className="w-8 h-8 rounded-lg bg-ink flex items-center justify-center font-bold text-xs text-cream font-mono">
              LS
            </div>
            <span className="text-sm font-serif text-ink tracking-tight">lseo.app</span>
          </Link>
          <div className="flex items-center gap-1">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`px-3 py-1.5 rounded-md text-sm no-underline transition-colors ${
                  pathname === link.href
                    ? 'bg-warm-light text-ink font-medium'
                    : 'text-warm-gray hover:text-ink'
                }`}
              >
                {link.label}
              </Link>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-xs text-warm-gray font-mono">{userEmail}</span>
          <button
            onClick={handleLogout}
            className="text-xs text-warm-gray hover:text-ink transition-colors"
          >
            Sign out
          </button>
        </div>
      </div>
    </nav>
  )
}
