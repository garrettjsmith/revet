import { requireAgencyAdmin } from '@/lib/locations'
import { WorkQueue } from '@/components/work-queue'

export const dynamic = 'force-dynamic'

export default async function WorkQueuePage() {
  await requireAgencyAdmin()

  return (
    <div className="-m-8">
      <WorkQueue />
    </div>
  )
}
