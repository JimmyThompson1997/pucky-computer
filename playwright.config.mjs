import fs from "node:fs";
import path from "node:path";
import { defineConfig } from "@playwright/test";

const baseURL = process.env.LANDING_BASE_URL || "http://127.0.0.1:4173";
const useLocalServer = !process.env.LANDING_BASE_URL;
const chromiumExecutable = path.join(
  process.env.LOCALAPPDATA || "",
  "ms-playwright",
  "chromium-1223",
  "chrome-win64",
  "chrome.exe"
);
const launchOptions = fs.existsSync(chromiumExecutable)
  ? { executablePath: chromiumExecutable }
  : {};

export default defineConfig({
  testDir: "./tests/browser",
  outputDir: "./test-results",
  fullyParallel: false,
  workers: 1,
  timeout: 45_000,
  expect: {
    timeout: 15_000
  },
  reporter: [
    ["line"],
    ["html", { open: "never", outputFolder: "playwright-report" }]
  ],
  use: {
    baseURL,
    trace: "on",
    screenshot: "off",
    video: "retain-on-failure",
    launchOptions
  },
  projects: [
    {
      name: "laptop-1440x1100",
      use: { viewport: { width: 1440, height: 1100 } }
    },
    {
      name: "tablet-1024x1366",
      use: { viewport: { width: 1024, height: 1366 } }
    },
    {
      name: "phone-390x844",
      use: { viewport: { width: 390, height: 844 } }
    },
    {
      name: "phone-360x800",
      use: { viewport: { width: 360, height: 800 } }
    }
  ],
  webServer: useLocalServer
    ? {
        command: "npm run preview:local",
        url: baseURL,
        reuseExistingServer: true,
        timeout: 120_000
      }
    : undefined
});
