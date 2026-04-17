A local high-fidelity prototype of **Wrapped for Work**, built as a Next.js App Router app with mocked contribution data, SQLite via Prisma, and real narrative generation through configurable model providers.

## Setup

1. `cp .env.local.example .env.local`
2. Choose a model provider in `.env.local`.
3. Fill in either the Anthropic settings or the Azure Foundry settings.
4. `pnpm install`
5. `pnpm setup`
6. `pnpm dev`

The app then runs at [http://localhost:3000](http://localhost:3000).

## AI provider configuration

The app supports two provider modes:

- `AI_PROVIDER=anthropic` uses the Anthropic Messages API with `ANTHROPIC_API_KEY` and optional `ANTHROPIC_MODEL`.
- `AI_PROVIDER=azure-foundry` uses the Azure AI Foundry chat completions endpoint with `AZURE_FOUNDRY_API_KEY`, `AZURE_FOUNDRY_ENDPOINT`, and optional `AZURE_FOUNDRY_MODEL`.

If `AI_PROVIDER` is omitted, the app keeps the Anthropic default unless only Azure Foundry credentials are present.

## Included flows

- A populated dashboard at `/dashboard`
- Manual contribution creation at `/api/contributions`
- Synchronous wrap generation at `/api/jobs`
- A wrap microsite at `/wrap/[id]`
- AI smoke testing via `pnpm ai:test`
