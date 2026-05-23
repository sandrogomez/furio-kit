type LogLevel = 'debug' | 'info' | 'warn' | 'error'

interface LogContext {
  requestId?: string
  userId?: string
  [key: string]: unknown
}

function log(level: LogLevel, message: string, context: LogContext = {}): void {
  if (process.env.NODE_ENV === 'development') {
    console[level](`[${level.toUpperCase()}] ${message}`, Object.keys(context).length ? context : '')
    return
  }
  console[level](JSON.stringify({ level, message, ...context, timestamp: new Date().toISOString() }))
}

export const logger = {
  debug: (msg: string, ctx?: LogContext) => log('debug', msg, ctx),
  info: (msg: string, ctx?: LogContext) => log('info', msg, ctx),
  warn: (msg: string, ctx?: LogContext) => log('warn', msg, ctx),
  error: (msg: string, ctx?: LogContext) => log('error', msg, ctx),
}
