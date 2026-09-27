# Irfan & Elena Voice AI

Voice-first mobile companion with two distinct personas, live Gemini chat, spoken responses, and locally persisted conversation history.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required secret: `GOOGLE_GEMINI_API_KEY` — server-side key for the official Gemini generateContent endpoint

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)
- Mobile: Expo SDK 57, Expo Router, AsyncStorage, Expo Speech

## Where things live

- `artifacts/irfan-elena-voice-ai/app/index.tsx` — primary mobile voice workspace
- `artifacts/irfan-elena-voice-ai/lib/assistant.ts` — conversation state, persistence, Gemini client, speech helpers
- `artifacts/api-server/src/routes/gemini.ts` — secure Gemini proxy with retries and response parsing
- `lib/api-spec/openapi.yaml` — API contract source of truth

## Architecture decisions

- Gemini calls stay server-side so the API key is never shipped in the mobile bundle.
- Conversation history is local-first through AsyncStorage; no database is required for the first build.
- The app uses a routed `/api/gemini/chat` endpoint so Expo web and device previews share one request path.

## Product

Users can switch between Irfan, Elena, or both; send text or browser voice input; hear spoken replies with distinct voice parameters; clear history; and keep conversations across launches.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- Update `lib/api-spec/openapi.yaml` before changing the Gemini endpoint, then run API codegen.
- Do not expose `GOOGLE_GEMINI_API_KEY` as an `EXPO_PUBLIC_*` variable.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
