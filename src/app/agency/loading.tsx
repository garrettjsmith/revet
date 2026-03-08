export default function Loading() {
  return (
    <div className="p-8">
      <div className="animate-pulse space-y-4">
        <div className="h-8 w-48 bg-warm-border rounded" />
        <div className="h-4 w-96 bg-warm-border rounded" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
          {[1,2,3,4].map(i => <div key={i} className="h-24 bg-warm-border rounded-xl" />)}
        </div>
      </div>
    </div>
  )
}
