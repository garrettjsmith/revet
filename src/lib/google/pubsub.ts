import { googleFetch } from './auth'
import { listGBPAccounts } from './accounts'

const NOTIFICATIONS_API = 'https://mybusinessnotifications.googleapis.com/v1'

/** Notification types we care about */
const NOTIFICATION_TYPES = [
  'NEW_REVIEW',
  'UPDATED_REVIEW',
  'GOOGLE_UPDATE',
] as const

interface NotificationSetting {
  name: string               // "accounts/123/notificationSetting"
  pubsubTopic?: string       // "projects/{project}/topics/{topic}"
  notificationTypes?: string[]
}

/**
 * Get current notification settings for a GBP account.
 */
export async function getNotificationSettings(
  accountId: string
): Promise<NotificationSetting> {
  const response = await googleFetch(
    `${NOTIFICATIONS_API}/accounts/${accountId}/notificationSetting`
  )

  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    throw new Error(`Failed to get notification settings: ${response.status} ${JSON.stringify(err)}`)
  }

  return response.json()
}

/**
 * Configure Pub/Sub notifications for a GBP account.
 *
 * Prerequisites:
 * - Pub/Sub topic must already exist in your Google Cloud project
 * - mybusiness-api-pubsub@system.gserviceaccount.com must have pubsub.topics.publish on the topic
 *
 * @param accountId - The GBP account ID (just the numeric part, not "accounts/123")
 * @param pubsubTopic - Full topic resource name: "projects/{project}/topics/{topic}"
 */
export async function setupNotifications(
  accountId: string,
  pubsubTopic: string
): Promise<NotificationSetting> {
  const response = await googleFetch(
    `${NOTIFICATIONS_API}/accounts/${accountId}/notificationSetting?updateMask=pubsubTopic,notificationTypes`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: `accounts/${accountId}/notificationSetting`,
        pubsubTopic,
        notificationTypes: [...NOTIFICATION_TYPES],
      }),
    }
  )

  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    throw new Error(`Failed to setup notifications for account ${accountId}: ${response.status} ${JSON.stringify(err)}`)
  }

  return response.json()
}

/**
 * Disable notifications for a GBP account.
 */
export async function disableNotifications(accountId: string): Promise<void> {
  const response = await googleFetch(
    `${NOTIFICATIONS_API}/accounts/${accountId}/notificationSetting?updateMask=notificationTypes`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: `accounts/${accountId}/notificationSetting`,
        notificationTypes: [],
      }),
    }
  )

  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    throw new Error(`Failed to disable notifications for account ${accountId}: ${response.status} ${JSON.stringify(err)}`)
  }
}

/**
 * Set up Pub/Sub notifications for ALL accessible GBP accounts.
 * This is typically called once after OAuth connect.
 *
 * Uses GOOGLE_PUBSUB_TOPIC env var for the topic name.
 *
 * @returns Results for each account
 */
export async function setupNotificationsForAllAccounts(): Promise<
  Array<{ accountId: string; accountName: string; ok: boolean; error?: string }>
> {
  const pubsubTopic = process.env.GOOGLE_PUBSUB_TOPIC
  if (!pubsubTopic) {
    throw new Error('GOOGLE_PUBSUB_TOPIC environment variable is not set')
  }

  const accounts = await listGBPAccounts()
  const results: Array<{ accountId: string; accountName: string; ok: boolean; error?: string }> = []

  for (const account of accounts) {
    const accountId = account.name.replace('accounts/', '')
    try {
      await setupNotifications(accountId, pubsubTopic)
      results.push({ accountId, accountName: account.accountName, ok: true })
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error'
      console.error(`[pubsub] Failed to setup for ${account.name}:`, errorMessage)
      results.push({ accountId, accountName: account.accountName, ok: false, error: errorMessage })
    }
  }

  return results
}
