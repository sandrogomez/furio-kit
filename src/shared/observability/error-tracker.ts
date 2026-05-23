interface ErrorContext {
  requestId?: string
  userId?: string
  [key: string]: unknown
}

// No-op adapter — replace with your provider SDK (Sentry, Datadog, Bugsnag, etc.)
// Example Sentry swap: Sentry.captureException(error, { extra: context })
export const errorTracker = {
  captureException: (error: unknown, context: ErrorContext = {}): void => {
    if (process.env.NODE_ENV !== 'production') {
      console.error('[error-tracker]', error, context)
    }
    // TODO: errorTracker.captureException = (e, ctx) => Sentry.captureException(e, { extra: ctx })
  },

  captureMessage: (message: string, context: ErrorContext = {}): void => {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[error-tracker]', message, context)
    }
  },
}
