export default function DashboardLoading() {
  return (
    <div className="animate-pulse">
      <div className="flex items-center justify-between mb-8">
        <div className="h-8 w-32 bg-warm-border/50 rounded" />
        <div className="h-10 w-36 bg-warm-border/50 rounded-full" />
      </div>
      <div className="grid grid-cols-4 gap-4 mb-8">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="bg-ink/10 rounded-xl p-5 h-20" />
        ))}
      </div>
      <div className="border border-warm-border/50 rounded-xl h-64" />
    </div>
  )
}
