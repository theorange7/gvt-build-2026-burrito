/*
 * Design philosophy: Editorial brutalism softened by institutional modernism.
 * File role: Keep missing-route handling inside the same authored visual system as the dashboard and wrap viewer.
 * Guardrail: Error states should feel intentional and calm, not like a framework default.
 */
import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#0a0a0f] px-4 text-center text-white">
      <div className="rounded-[28px] border border-white/10 bg-[#111118] px-8 py-10 shadow-[0_30px_100px_rgba(0,0,0,0.45)]">
        <p className="text-xs uppercase tracking-[0.36em] text-white/45">Not found</p>
        <h1 className="mt-4 font-display text-4xl">That page is outside the record.</h1>
        <p className="mt-4 max-w-md text-sm leading-7 text-white/56">
          Head back to the dashboard to review contributions or open a generated wrap.
        </p>
        <Link
          href="/dashboard"
          className="mt-6 inline-flex rounded-full bg-[color:var(--accent)] px-5 py-3 text-sm font-medium text-black"
        >
          Return to dashboard
        </Link>
      </div>
    </main>
  );
}
