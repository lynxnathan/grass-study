import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 60000,
  expect: { timeout: 15000 },
  workers: 1,
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
    { name: 'firefox-render', testMatch: /(force-view|ground-cover|highlight|grass-lod|wind-patches|weather|grass|narration|baseline)\.spec\.ts/, use: { browserName: 'firefox', launchOptions: { args: [] } } },
    { name: 'firefox-input', testMatch: /(mouse|keyboard)\.spec\.ts/, use: { browserName: 'firefox', launchOptions: { args: [], firefoxUserPrefs: { 'dom.event.contextmenu.shift_suppresses_event': false } } } },
  ],
  use: {
    baseURL: 'http://127.0.0.1:5173',
    viewport: { width: 1280, height: 800 },
    launchOptions: { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] },
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'npm run dev -- --port 5173 --strictPort',
    url: 'http://127.0.0.1:5173',
    reuseExistingServer: !process.env.CI,
  },
});
