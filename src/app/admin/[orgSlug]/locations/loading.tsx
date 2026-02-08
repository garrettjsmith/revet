export default function LocationsLoading() {
  return (
    <div className="animate-pulse">
      <div className="flex items-center justify-between mb-6">
        <div className="h-8 w-28 bg-warm-border/50 rounded" />
        <div className="h-10 w-36 bg-warm-border/50 rounded-full" />
      </div>
      <div className="border border-warm-border/50 rounded-xl overflow-hidden">
        <div className="border-b border-warm-border/50 px-5 py-3 flex gap-16">
          {['w-24', 'w-16', 'w-16', 'w-14', 'w-20', 'w-10'].map((w, i) => (
            <div key={i} className={`h-3 ${w} bg-warm-border/40 rounded`} />
          ))}
        </div>
        {[...Array(5)].map((_, i) => (
          <div key={i} className="border-b border-warm-border/30 px-5 py-4 flex gap-16">
            <div className="w-32 h-4 bg-warm-border/30 rounded" />
            <div className="w-16 h-4 bg-warm-border/20 rounded" />
            <div className="w-10 h-4 bg-warm-border/20 rounded" />
            <div className="w-10 h-4 bg-warm-border/20 rounded" />
            <div className="w-16 h-4 bg-warm-border/20 rounded" />
            <div className="w-10 h-4 bg-warm-border/20 rounded" />
          </div>
        ))}
      </div>
    </div>
  )
}
