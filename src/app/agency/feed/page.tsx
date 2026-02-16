import { requireAgencyAdmin } from '@/lib/locations'
import { FeedView } from '@/components/feed/feed-view'

export const dynamic = 'force-dynamic'

export default async function FeedPage() {
  await requireAgencyAdmin()

  return (
    <div className="-m-8">
      <FeedView />
    </div>
  )
}
