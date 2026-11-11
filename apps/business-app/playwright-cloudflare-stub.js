/**
 * Preview-only Playwright shim. PDF endpoints return their existing safe
 * failure response; Node deployments do not import this module.
 */
export const chromium = {
  async launch() {
    throw new Error("PDF rendering is unavailable in the Cloudflare Workers preview.");
  },
};
