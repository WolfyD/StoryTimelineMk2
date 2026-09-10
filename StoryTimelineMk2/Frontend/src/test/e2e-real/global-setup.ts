/**
 * Global setup — runs once before any real E2E tests.
 * Verifies that the WinForms app is running with CDP enabled.
 */
export default async function globalSetup() {
  const port = process.env.STORYTIMELINE_REMOTE_DEBUG_PORT ?? '9222'
  const url  = `http://localhost:${port}/json/version`

  const MAX_ATTEMPTS = 20
  const DELAY_MS     = 500

  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    try {
      const res = await fetch(url)
      if (res.ok) return  // app is up
    } catch { /* not ready yet */ }
    await new Promise(r => setTimeout(r, DELAY_MS))
  }

  throw new Error(
    `\n\nStoryTimeline app is not running with CDP enabled on port ${port}.\n\n` +
    `Start it first:\n` +
    `  powershell ..\\scripts\\Start-E2EApp.ps1\n\n` +
    `Then re-run:\n` +
    `  npm run test:e2e:real\n`
  )
}
