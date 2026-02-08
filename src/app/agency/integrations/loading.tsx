export default function IntegrationsLoading() {
  return (
    <div className="animate-pulse">
      <div className="flex items-center justify-between mb-8">
        <div>
          <div className="h-8 w-36 bg-warm-border/50 rounded" />
          <div className="h-3 w-64 bg-warm-border/30 rounded mt-2" />
        </div>
        <div className="h-4 w-24 bg-warm-border/30 rounded" />
      </div>
      <div className="grid gap-6">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="border border-warm-border/50 rounded-xl p-6 h-24" />
        ))}
      </div>
    </div>
  )
}
