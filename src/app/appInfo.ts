import listEndPoints = require('express-list-endpoints')

const returnEnvValues = (): string[] => {
  const constantsOutput = []
  for (const key of Object.keys(process.env)) {
    if (key.substring(0, 6) === 'CUSTOM') {
      constantsOutput.push(`${key.substring(7)} : ${process.env[key]}`)
    }
    if (key === 'NODE_ENV') {
      constantsOutput.push(`${key} : ${process.env[key]}`)
    }
  }
  return constantsOutput
}

const routeInfo: string[] = []
const returnRoutes = (app: any): string[] => {
  if (routeInfo.length > 0) {
    return routeInfo
  }

  for (const obj of listEndPoints(app)) {
    routeInfo.push(`http://localhost:${process.env.CUSTOM_PORT}${obj.path}  [${obj.methods.join(' ')}]`)
  }

  return routeInfo
}

export {
  returnEnvValues,
  returnRoutes
}