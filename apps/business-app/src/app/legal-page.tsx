import type { ReactNode } from 'react';

export function LegalPage({
  title,
  updated,
  children,
}: {
  title: string;
  updated: string;
  children: ReactNode;
}) {
  return (
    <main
      style={{
        minHeight: '100vh',
        background: 'linear-gradient(180deg, #fff8f5 0%, #ffffff 30rem)',
        color: '#211a18',
        padding: '32px 20px 72px',
      }}
    >
      <div style={{ maxWidth: 860, margin: '0 auto' }}>
        <a
          href="/"
          style={{
            color: '#88352b',
            fontWeight: 700,
            textDecoration: 'none',
          }}
        >
          ← ProPulse Business OS
        </a>
        <article
          style={{
            marginTop: 28,
            padding: 'clamp(24px, 5vw, 56px)',
            border: '1px solid #eadbd6',
            borderRadius: 24,
            background: '#fff',
            boxShadow: '0 20px 60px rgba(88, 43, 32, 0.08)',
            lineHeight: 1.7,
          }}
        >
          <p
            style={{
              margin: 0,
              color: '#9b5142',
              fontSize: 12,
              fontWeight: 800,
              letterSpacing: '.14em',
              textTransform: 'uppercase',
            }}
          >
            ProPulse Business OS
          </p>
          <h1
            style={{
              margin: '10px 0 4px',
              color: '#40211c',
              fontSize: 'clamp(32px, 5vw, 48px)',
              lineHeight: 1.12,
            }}
          >
            {title}
          </h1>
          <p style={{ margin: '0 0 32px', color: '#756762', fontSize: 14 }}>
            Last updated {updated}
          </p>
          <div>{children}</div>
          <footer
            style={{
              marginTop: 40,
              paddingTop: 20,
              borderTop: '1px solid #eee3df',
              color: '#62534e',
              fontSize: 14,
            }}
          >
            Questions? Contact{' '}
            <a
              href="mailto:info@propulsetechnologies.online"
              style={{ color: '#88352b', fontWeight: 700 }}
            >
              info@propulsetechnologies.online
            </a>
            .
          </footer>
        </article>
      </div>
    </main>
  );
}
