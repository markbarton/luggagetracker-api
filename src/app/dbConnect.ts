import * as mongoDB from 'mongodb'
import logger from '../logger'
const { env: { CUSTOM_MONGO_CONNECTION, APP_NAME } } = process

let client: mongoDB.MongoClient | null = null;
let db: mongoDB.Db | null = null;

export function returnClient() {
  return client;
}
export function returnDB() {
  return db;
}
export const dbConnect = async () => {
  // Create mongo client instance
  if (!client) {
    if (!CUSTOM_MONGO_CONNECTION) {
      throw new Error('CUSTOM_MONGO_CONNECTION is not set')
    }
    client = new mongoDB.MongoClient(CUSTOM_MONGO_CONNECTION);
    await client.connect();

    // If using a single database set it here and use ther returnDB function to access it / else use the returnClient
    db = client.db()

    logger.info(`${APP_NAME}: Connected to mongoDB ${CUSTOM_MONGO_CONNECTION}`)
  }

}