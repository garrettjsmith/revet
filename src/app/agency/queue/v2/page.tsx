import { requireAgencyAdmin } from '@/lib/locations'
import { WorkQueueV2 } from '@/components/work-queue-v2'

export const dynamic = 'force-dynamic'

export default async function WorkQueueV2Page() {
  await requireAgencyAdmin()

  return (
    <div className="-m-8">
      <WorkQueueV2 />
    </div>
  )
}
