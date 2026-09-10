import { defineConfig } from '@playwright/test'

/**
 * Playwright config for real E2E tests against the running WinForms app.
 *
 * Prerequisites before running:
 *   1. Run: ..\scripts\Start-E2EApp.ps1   (sets env vars, copies seed DB, starts the app)
 *   2. Run: npm run test:e2e:real          (this config)
 *
 * The webServer block auto-starts the Vite dev server (or reuses it if already
 * running).  The WinForms app must already be running with CDP enabled.
 */
export default defineConfig({
  testDir: './src/test/e2e-real',
  fullyParallel: false,   // tests share one live app instance — must be sequential
  retries: 0,
  workers: 1,
  timeout: 30_000,

  globalSetup: './src/test/e2e-real/global-setup.ts',

  use: {
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'on-first-retry',
  },

  // A project is required for Playwright to run tests; browser management is
  // handled inside fixtures.ts via connectOverCDP — we don't launch a browser here.
  projects: [
    { name: 'real-app' },
  ],

  // Auto-start the Vite dev server (the WinForms app navigates to localhost:5173
  // in DEBUG mode).  reuseExistingServer lets manual dev-server runs work too.
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
    timeout: 30_000,
  },
})
