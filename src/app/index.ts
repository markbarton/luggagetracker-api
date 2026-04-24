import { Application } from 'express'
import { dbConnect } from './dbConnect'
import appSetup from './appSetup'
import appStart from './appStart'
import { ensureIndexes } from './ensureIndexes'


export default async (app: Application) => {
  await dbConnect()
  await ensureIndexes()
  appSetup(app)
  appStart(app)
}