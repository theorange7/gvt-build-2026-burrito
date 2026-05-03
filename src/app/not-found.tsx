/*
 * Design philosophy: Editorial brutalism softened by institutional modernism.
 * File role: Keep missing-route handling inside the same authored visual system as the dashboard and wrap viewer.
 * Guardrail: Error states should feel intentional and calm, not like a framework default.
 */
import Link from 'next/link';

const INK = '#0A0A0A';
const CREAM = '#FFF4DE';
const PAPER = '#FBF5E5';
const HOT = '#FF4D2E';

export default function NotFound() {
  return (
    <main
      style={{ backgroundColor: CREAM }}
      className="flex min-h-screen items-center justify-center px-4 text-center"
    >
      <div
        style={{
          backgroundColor: PAPER,
          border: `2px solid ${INK}`,
          boxShadow: `6px 6px 0 ${INK}`,
          borderRadius: '24px',
          padding: '48px 40px',
          maxWidth: '480px',
          width: '100%',
        }}
      >
        {/* 404 badge */}
        <p
          style={{
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: '10px',
            textTransform: 'uppercase',
            letterSpacing: '0.12em',
            color: INK,
            opacity: 0.5,
          }}
        >
          Error · Not found
        </p>

        {/* Big 404 */}
        <h1
          style={{
            fontFamily: 'Space Grotesk, sans-serif',
            fontSize: '96px',
            fontWeight: 800,
            color: HOT,
            lineHeight: 1,
            marginTop: '8px',
            letterSpacing: '-0.03em',
          }}
        >
          404
        </h1>

        {/* Subtitle */}
        <h2
          style={{
            fontFamily: 'Space Grotesk, sans-serif',
            fontSize: '24px',
            fontWeight: 700,
            color: INK,
            marginTop: '12px',
          }}
        >
          Page not found.
        </h2>

        {/* Body */}
        <p
          style={{
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: '12px',
            lineHeight: 1.7,
            color: INK,
            opacity: 0.65,
            marginTop: '16px',
          }}
        >
          Head back to the dashboard to review contributions or open a generated
          wrap. This route isn&apos;t in the record.
        </p>

        {/* Back link */}
        <Link
          href="/dashboard"
          style={{
            display: 'inline-block',
            marginTop: '28px',
            backgroundColor: PAPER,
            border: `2px solid ${INK}`,
            boxShadow: `3px 3px 0 ${INK}`,
            borderRadius: '10px',
            padding: '12px 24px',
            fontFamily: 'Space Grotesk, sans-serif',
            fontSize: '15px',
            fontWeight: 700,
            color: INK,
            textDecoration: 'none',
            transition: 'transform 0.1s, box-shadow 0.1s',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'translate(-1px,-1px)';
            e.currentTarget.style.boxShadow = `4px 4px 0 ${INK}`;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'translate(0,0)';
            e.currentTarget.style.boxShadow = `3px 3px 0 ${INK}`;
          }}
        >
          Return to dashboard
        </Link>
      </div>
    </main>
  );
}
