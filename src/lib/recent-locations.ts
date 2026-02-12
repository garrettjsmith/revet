const STORAGE_KEY = 'revet:recent-locations'
const MAX_RECENT = 8

export interface RecentLocation {
  id: string
  name: string
  city: string | null
  state: string | null
  orgSlug: string
  orgName: string
  visitedAt: number
}

export function getRecentLocations(): RecentLocation[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    return JSON.parse(raw) as RecentLocation[]
  } catch {
    return []
  }
}

export function addRecentLocation(loc: Omit<RecentLocation, 'visitedAt'>): void {
  if (typeof window === 'undefined') return
  try {
    const existing = getRecentLocations().filter((r) => r.id !== loc.id)
    const updated: RecentLocation[] = [
      { ...loc, visitedAt: Date.now() },
      ...existing,
    ].slice(0, MAX_RECENT)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))
  } catch {
    // localStorage might be full or disabled
  }
}

export function clearRecentLocations(): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // ignore
  }
}
