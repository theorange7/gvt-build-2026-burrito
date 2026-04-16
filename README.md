# Wrapped for Work — Local Prototype

A local high-fidelity prototype of **Wrapped for Work**, built as a Next.js App Router app with mocked contribution data, SQLite via Prisma, and real narrative generation through the Anthropic Messages API.

## Setup

1. `cp .env.local.example .env.local`
2. Add your `ANTHROPIC_API_KEY` to `.env.local`
3. `pnpm install`
4. `pnpm setup`
5. `pnpm dev`

The app then runs at [http://localhost:3000](http://localhost:3000).

## Included flows

- A populated dashboard at `/dashboard`
- Manual contribution creation at `/api/contributions`
- Synchronous wrap generation at `/api/jobs`
- A wrap microsite at `/wrap/[id]`
- AI smoke testing via `pnpm ai:test`
