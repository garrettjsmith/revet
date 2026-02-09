import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Revet',
  description: 'Review management tools',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased bg-cream text-ink">{children}</body>
    </html>
  )
}
