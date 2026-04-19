import dotenv from 'dotenv'
const { NODE_ENV } = process.env

// Load env file based on NODE_ENV
const dotEnvPath = NODE_ENV === 'production' ? '.env' : `.env.${NODE_ENV}`

dotenv.config({
  path: dotEnvPath
})

// Initiate application
import express from 'express'
const app = express()
import application from './app/index'
application(app)
