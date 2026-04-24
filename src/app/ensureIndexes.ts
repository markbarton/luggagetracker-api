import logger from '../logger'
import * as users from '../data/users'
import * as trips from '../data/trips'
import * as sessions from '../data/sessions'
import * as emailTokens from '../data/emailTokens'

export async function ensureIndexes(): Promise<void> {
  await users.ensureIndexes()
  await trips.ensureIndexes()
  await sessions.ensureIndexes()
  await emailTokens.ensureIndexes()
  logger.info('Indexes ensured for users, trips, sessions, emailTokens')
}
