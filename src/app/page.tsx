import { RecoveryRedirect } from '@/components/recovery-redirect'

export default function Home() {
  return (
    <div className="min-h-screen bg-cream text-ink flex items-center justify-center relative">
      <RecoveryRedirect />
      {/* Blueprint grid overlay */}
      <div className="absolute inset-0 blueprint-grid pointer-events-none" />

      <div className="text-center relative z-10">
        <div className="inline-flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-lg bg-ink flex items-center justify-center font-bold text-sm font-mono text-cream">
            R
          </div>
          <span className="text-2xl font-serif tracking-tight">revet.app</span>
        </div>
        <p className="text-warm-gray text-sm">Review management tools</p>
      </div>
    </div>
  )
}
