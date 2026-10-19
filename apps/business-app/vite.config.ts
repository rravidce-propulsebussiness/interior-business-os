import path from "node:path";
import { fileURLToPath } from "node:url";
import vinext from "vinext";
import { defineConfig } from "vite";

const appRoot = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [vinext()],
  resolve: {
    alias: {
      // Chromium cannot be bundled into a Cloudflare Worker. The shim only
      // applies to the Cloudflare/Vite build; Next.js Node builds keep Playwright.
      playwright: path.resolve(appRoot, "playwright-cloudflare-stub.js"),
    },
  },
});
