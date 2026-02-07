export default function Home() {
  return (
    <div className="min-h-screen bg-cream text-ink flex items-center justify-center relative">
      {/* Blueprint grid overlay */}
      <div className="absolute inset-0 blueprint-grid pointer-events-none" />

      <div className="text-center relative z-10">
        <div className="inline-flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-lg bg-ink flex items-center justify-center font-bold text-sm font-mono text-cream">
            LS
          </div>
          <span className="text-2xl font-serif tracking-tight">lseo.app</span>
        </div>
        <p className="text-warm-gray text-sm">Local SEO tools — coming soon</p>
      </div>
    </div>
  )
}
