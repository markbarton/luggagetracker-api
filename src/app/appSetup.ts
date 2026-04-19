import { Application } from 'express'
import healthRoute from '../routes/healthRoute'
import landRegistryDocumentsRoute from '../routes/landRegistryDocumentsRoute'

import express from 'express'
import cors from 'cors'

export default (app: Application): void => {
  app.use(cors())
  app.use(express.json())
  app.use(express.urlencoded({ limit: '50mb', extended: true }))


  // Init routes
  app.use('/health', healthRoute)
  app.use('/land-registry-documents', landRegistryDocumentsRoute)
}