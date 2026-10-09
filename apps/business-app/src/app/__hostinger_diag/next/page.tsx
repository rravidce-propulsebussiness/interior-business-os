// Temporary public deployment diagnostic: this route uses the real Next.js
// App Router and root layout, but is excluded from the session-refresh Proxy.
// It reads no environment variables, identity information or business data.
export default function NextRendererProbe() {
  return (
    <main style={{ padding: 24, color: '#ffffff', background: '#07111f' }}>
      <h1>Next.js renderer: OK</h1>
      <p>Server-rendered page reached the browser.</p>
    </main>
  );
}
