/**
 * Cloudflare Workers preview shim for native Node image tooling.
 * The Business App's image processing endpoints fail closed when invoked.
 * Node deployments continue to use the real sharp package through Next.js.
 */
export default function sharpUnavailableInWorkers() {
  throw new Error('Image processing is unavailable in the Cloudflare preview.');
}
