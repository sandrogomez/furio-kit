import { z } from 'zod'

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']),
  AUTH_PROVIDER: z.enum(['auth0', 'ping', 'mock']).default('mock'),
})

// Throws at import time if required variables are missing or invalid.
// Imported by instrumentation.ts so the error surfaces at server startup.
export const env = EnvSchema.parse({
  NODE_ENV: process.env.NODE_ENV,
  AUTH_PROVIDER: process.env.AUTH_PROVIDER,
})
