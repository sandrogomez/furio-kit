export async function register() {
  // Validate required environment variables at server startup.
  // Throws immediately if configuration is missing — prevents runtime surprises.
  await import('@/shared/env')
}
