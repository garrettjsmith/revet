export default function LocationDetailLoading() {
  return (
    <div className="animate-pulse">
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="h-3 w-16 bg-warm-border/40 rounded mb-2" />
          <div className="h-7 w-48 bg-warm-border/50 rounded" />
          <div className="h-3 w-32 bg-warm-border/30 rounded mt-2" />
        </div>
        <div className="h-10 w-28 bg-warm-border/50 rounded-full" />
      </div>
      <div className="grid grid-cols-4 gap-4 mb-8">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="bg-ink/10 rounded-xl p-5 h-20" />
        ))}
      </div>
      <div className="border border-warm-border/50 rounded-xl h-32 mb-8" />
      <div className="border border-warm-border/50 rounded-xl h-48 mb-8" />
      <div className="border border-warm-border/50 rounded-xl h-32" />
    </div>
  )
}
