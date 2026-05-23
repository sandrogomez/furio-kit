import { z } from 'zod'
import { logger } from '@/shared/observability'
import { UserSchema } from '../model/types'

const UsersResponseSchema = z.array(UserSchema)

// DEV fallback — used when NEXT_PUBLIC_API_URL is not configured
const DEV_MOCK = [
  { id: '1', name: 'Alex Rivera', email: 'alex@example.com', role: 'admin' },
  { id: '2', name: 'Sam Okoro', email: 'sam@example.com', role: 'member' },
  { id: '3', name: 'Jamie Chen', email: 'jamie@example.com', role: 'viewer' },
]

export async function getUsers() {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL

  if (!apiUrl) {
    logger.debug('users.fetch.mock', { reason: 'NEXT_PUBLIC_API_URL not set' })
    return UsersResponseSchema.parse(DEV_MOCK)
  }

  const res = await fetch(`${apiUrl}/users`, { next: { revalidate: 60 } })
  if (!res.ok) {
    logger.error('users.fetch.failed', { status: res.status, url: `${apiUrl}/users` })
    throw new Error(`Failed to fetch users: ${res.status}`)
  }
  const data = UsersResponseSchema.parse(await res.json())
  logger.info('users.fetch.success', { count: data.length })
  return data
}
