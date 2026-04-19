import { Application } from 'express'
import { createServer } from 'http'
const { env: { CUSTOM_PORT, APP_NAME, NODE_ENV } } = process
import logger from '../logger'
import { returnEnvValues, returnRoutes } from './appInfo'

export default async (app: Application): Promise<void> => {
  try {
    const httpServer = createServer(app)

    httpServer.listen(CUSTOM_PORT, () => {
      logger.info(`${APP_NAME}: Magic happens on Port ${CUSTOM_PORT}`)
      logger.info(`${APP_NAME}: App running in ${NODE_ENV} mode`)
      logger.info(`${APP_NAME}: Started with the following environment variables \n${returnEnvValues().join('\n')}`)
      logger.info(`${APP_NAME}: Started with the following routes \n${returnRoutes(app).join('\n')}`)
    })
  } catch (err) {
    logger.error(`Unable to create app: ${err}`)
  }

}