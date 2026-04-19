const lodash = require("lodash");
const winston = require("winston");
const { default: stringify } = require("fast-safe-stringify");
const { NODE_ENV } = process.env
// pretty formatting
const PrettyError = require("pretty-error");
const pe = new PrettyError();
pe.withoutColors()
  .appendStyle({
    'pretty-error > trace':
    {
      display: 'inline'
    },
    'pretty-error > trace > item':
    {
      marginBottom: 0,
      bullet: '"*"'
    }
  })
  // @ts-ignore
  .alias(/.*[\\\/]CelebrityQuery/i, "<project>")
  .alias(/\[CelebrityQuery\][\\\/]?/i, "")
  .skip(/** @type {(_:any) => boolean} */((traceline: { dir: { toString: () => string; }; }) => {
    if (traceline && traceline.dir) {
      return traceline.dir.toString().startsWith("internal");
    }
    return false;
  }))
  .skipNodeFiles();

const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({
    format: 'DD MMM HH:mm:ss'
  }),
  // @ts-ignore
  winston.format.printf(info => {
    if (!lodash.isEmpty(info.metadata) && info.metadata.hasOwnProperty("stack")) {
      let dup = lodash.clone(info.metadata);
      delete dup.stack;
      const errBody = stringify(dup, undefined, 4);
      const stack = pe.render({ stack: info.metadata.stack });
      return `${info.timestamp} ${info.level} ${info.message}${errBody}\n${stack}`;
    } else if (lodash.isString(info.message)) {
      return `${info.timestamp} ${info.level} ${info.message}`;
    } else {
      return `${info.timestamp} ${info.level} ${stringify(info.message, undefined, 4)}`;
    }
  })
);



const logger = winston.createLogger({
  level: 'debug',
  format: winston.format.combine(
    winston.format.errors({ stack: true }),
    winston.format.metadata()
  ),
  transports: [
    new winston.transports.Console({
      format: consoleFormat,
      level: 'info',
    }),

  ]
});

if (process.env.NODE_ENV === 'production') {
  logger.configure({
    level: 'info',
    transports: [new winston.transports.Console({ format: consoleFormat, handleExceptions: true, handleRejections: true })]
  })
}

if (process.env.NODE_ENV === 'development') {
  logger.configure({
    level: 'debug',
    transports: [new winston.transports.Console({ format: consoleFormat, handleExceptions: true, handleRejections: true })]
  })
}

if (process.env.NODE_ENV === 'local') {
  logger.configure({
    level: 'debug',
    transports: [new winston.transports.Console({ format: consoleFormat, handleExceptions: true, handleRejections: true })]
  })
}

logger.exitOnError = false

export default logger