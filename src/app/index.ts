import { Application } from 'express'
import { dbConnect } from './dbConnect'
import appSetup from './appSetup'
import appStart from './appStart'
import * as mongoDB from 'mongodb'


export default async (app: Application) => {
  await dbConnect()
  appSetup(app)
  appStart(app)
}