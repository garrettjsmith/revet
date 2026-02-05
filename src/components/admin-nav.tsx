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
    <nav className="border-b border-gray-800 px-6">
      <div className="max-w-6xl mx-auto flex items-center justify-between h-14">
        <div className="flex items-center gap-8">
          <Link href="/admin" className="flex items-center gap-2 no-underline">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-sky-400 to-blue-900 flex items-center justify-center font-bold text-xs text-white font-mono">
              LS
            </div>
            <span className="text-sm font-semibold text-white tracking-tight">lseo.app</span>
          </Link>
          <div className="flex items-center gap-1">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`px-3 py-1.5 rounded-md text-sm no-underline transition-colors ${
                  pathname === link.href
                    ? 'bg-gray-800 text-white font-medium'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                {link.label}
              </Link>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-xs text-gray-500 font-mono">{userEmail}</span>
          <button
            onClick={handleLogout}
            className="text-xs text-gray-500 hover:text-white transition-colors"
          >
            Sign out
          </button>
        </div>
      </div>
    </nav>
  )
}
