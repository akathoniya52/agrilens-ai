# AgriLens AI

An AI agronomy assistant for farmers. Ask about crop health, pests, diseases, soil and farm management, or upload a crop photo for a structured diagnosis. Powered by Google Gemini.

## Features

- **Streaming chat**: answers stream as NDJSON events. You can stop generation, and the partial answer is kept.
- **Image diagnosis**: upload a crop photo to get the crop, condition, confidence, severity, affected area and bounding boxes.
- **Conversation intelligence**: auto-generated chat titles, 3 suggested follow-up questions per answer, and a rolling summary for long chats.
- **Multilingual**: answers come back in the user's language (en, hi, gu, mr, ta, te, bn, sw, es, pt).
- **Voice input**: Gemini audio transcription endpoint (`/api/transcribe`).
- **Credits**: each AI answer costs 1 credit. The deduction is atomic and refunded if the AI produces no text.
- **Account**: Google sign-in, profile preferences (`/api/me`) and usage stats (`/api/stats`).
- **Farms and fields** (`/farms`): create farms with crops, soil, irrigation and location, then draw field boundaries on a MapLibre map (area is calculated automatically). The active farm, its fields and the local weather are added to the chat prompt so answers fit your farm.
- **Crop calendar**: each field with a crop and sowing date gets a stage timeline and upcoming tasks (irrigation, fertilizer, scouting, harvest). You can turn any task into a reminder.
- **Weather and blight risk**: 7-day Open-Meteo forecast per farm, spray windows (dry, low wind) and a late-blight risk score based on simplified Hutton criteria.
- **Reminders and web push**: per-farm and per-field reminders. A daily Vercel cron (`/api/cron/reminders`) sends web push notifications for reminders due within 24 hours and for weather alerts.
- **Dashboard** (`/dashboard`): totals, diagnoses over time, severity breakdown, most common issues, field health and a before/after photo slider.
- **PWA and offline**: installable app (web manifest plus a hand-written service worker in `public/sw.js`). The app shell, chats and farms are cached. If you send a text message while offline, it goes into an IndexedDB outbox, shows as pending and is sent when you are back online.

### Phase 4 integrations

All Phase 4 features are optional. Each one is disabled when its env vars are not configured, and the UI shows a clear "not configured" state instead of failing.

- **Satellite NDVI**: per-field Sentinel-2 NDVI for the last 90 days (mean series, decline warning and a heatmap via `?format=png`) from `GET /api/fields/[fieldId]/ndvi`. Needs a field boundary. Env: `SENTINEL_HUB_CLIENT_ID`, `SENTINEL_HUB_CLIENT_SECRET` (optional `SENTINEL_HUB_BASE_URL`, `SENTINEL_HUB_TOKEN_URL`; defaults to Copernicus Data Space). Not configured: the route returns `{ status: "not_configured" }`.
- **On-device model**: a TF.js PlantVillage-style classifier gives an instant offline guess for the first attached photo in chat. Env: `NEXT_PUBLIC_TFJS_MODEL_URL` (optional `NEXT_PUBLIC_TFJS_LABELS_URL`, `NEXT_PUBLIC_TFJS_MODEL_FORMAT`, `NEXT_PUBLIC_TFJS_INPUT_SIZE`, `NEXT_PUBLIC_TFJS_NORMALIZE`). Not configured: the hint is hidden.
- **Live scan** (`/scan`): camera viewfinder with live on-device detection, then a full AgriLens diagnosis that continues in chat. Without the TF.js model it still captures a photo and analyses it online.
- **Outbreak radar** (`/radar`, `GET /api/outbreaks`): anonymised disease reports near your active farm or current location (radius 5–500 km, 1–90 days). k-anonymity: a ~11 km grid cell (0.1°) is only shown when at least 5 different farms (accounts older than 7 days) reported the same problem. Whole cells overlapping the radius are queried, report counts are banded (`5–9`, `10–24`, `25+`) and dates are rounded to the week start. No env vars.
- **Agent tools**: Gemini function calling with `getWeather`, `getFieldHistory`, `createReminder` and `getMarketPrice` (the last one needs `DATA_GOV_IN_API_KEY`).
- **RAG knowledge base**: answers are grounded in ingested agronomy docs and show source chips. Ingest `.md`/`.txt` files (an optional first line `url: https://…` sets the citation link) with `npx tsx scripts/ingest-knowledge.ts ./knowledge` (`tsx` runs via npx; it is not a dependency). Embeddings use `GOOGLE_API_KEY` with `GEMINI_EMBEDDING_MODEL` (default `gemini-embedding-001`, 768 dims). Set `ATLAS_VECTOR_INDEX` to use Atlas Vector Search; when it is unset or fails, retrieval falls back to in-memory cosine similarity over at most `RAG_FALLBACK_LIMIT` chunks (default 2000). With no ingested docs, answers have no citations.
- **IoT sensors**: each field gets its own device token (`POST /api/fields/[fieldId]/iot-token`, shown once; only its SHA-256 hash is stored; `DELETE` disconnects). Devices (e.g. ESP32) send readings to `POST /api/iot/[fieldId]/readings` with `Authorization: Bearer agl_…` or `X-Device-Token`. The field insights panel shows soil moisture, temperature and humidity. No env vars.
- **Market prices and yield**: Agmarknet mandi prices with a trend and 7-day linear forecast (`GET /api/market?commodity=…&state=…`), needs `DATA_GOV_IN_API_KEY` (otherwise `{ status: "not_configured" }`). Yield estimate per field (`GET /api/fields/[fieldId]/yield`) from typical crop yields, no env vars.
- **Expert cases** (`/cases`): "Ask an expert" under any AI answer creates a case for agronomist review. Emails listed in `EXPERT_EMAILS` can see all cases, assign them to themselves, add advice and resolve them. Without it, farmers can still create and track their own cases.
- **WhatsApp assistant**: Meta Cloud API webhook at `/api/whatsapp` (GET verification, POST messages signed with `X-Hub-Signature-256`). Users enter their number in Settings and verify it by sending the 6-digit code shown there (valid 10 minutes) to the bot from that number; text and crop photos get AgriLens answers that use their credits. Env: `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_APP_SECRET`, `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID` (optional `WHATSAPP_GRAPH_VERSION`, default `v21.0`). Not configured: the webhook returns 503.

## Stack

Next.js 16 (App Router, React 19, React Compiler) · TypeScript · Tailwind CSS 4 · NextAuth v4 (Google, JWT) · MongoDB/Mongoose · `@google/genai` (`gemini-2.5-flash`) · Vercel Blob · next-intl · zod · Vitest · Playwright

## Setup

```bash
npm install
cp example.env .env.local   # then fill in the values
npm run dev                 # http://localhost:3000
```

`npm run build` works without env vars. Missing keys only throw when they are used at runtime.

## Environment

| Variable | Required | Purpose |
|---|---|---|
| `NEXTAUTH_URL`, `NEXTAUTH_SECRET` | yes | NextAuth base URL and JWT secret |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | yes | Google OAuth sign-in |
| `GOOGLE_API_KEY` | yes | Gemini API key |
| `MONGODB_URI` | yes | MongoDB connection string |
| `BLOB_READ_WRITE_TOKEN` | no | Vercel Blob uploads. Without it, uploads fall back to base64 data URLs (dev only) |
| `BLOB_STORE_HOST` | no | Exact hostname of your Blob store (e.g. `abc123.public.blob.vercel-storage.com`). The server only fetches chat images from this host. Unset: any `*.public.blob.vercel-storage.com` host is accepted. Either way the path must be `/uploads/<userId>/` |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | no | Web push. Generate keys with `npx web-push generate-vapid-keys`. Without them, push is disabled. The public key is served to clients by `/api/push/subscribe` |
| `CRON_SECRET` | no | Required by `/api/cron/reminders` (`Authorization: Bearer <CRON_SECRET>`). Vercel Cron sends it automatically |
| `SENTINEL_HUB_CLIENT_ID`, `SENTINEL_HUB_CLIENT_SECRET`, `SENTINEL_HUB_BASE_URL`, `SENTINEL_HUB_TOKEN_URL` | no | Satellite NDVI |
| `NEXT_PUBLIC_TFJS_MODEL_URL`, `NEXT_PUBLIC_TFJS_LABELS_URL`, `NEXT_PUBLIC_TFJS_MODEL_FORMAT`, `NEXT_PUBLIC_TFJS_INPUT_SIZE`, `NEXT_PUBLIC_TFJS_NORMALIZE` | no | On-device TF.js model |
| `DATA_GOV_IN_API_KEY` | no | Mandi prices (`/api/market`, `getMarketPrice` tool) |
| `GEMINI_EMBEDDING_MODEL`, `ATLAS_VECTOR_INDEX`, `RAG_FALLBACK_LIMIT` | no | RAG embeddings and vector search |
| `EXPERT_EMAILS` | no | Agronomists who can see, assign and resolve all cases |
| `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_APP_SECRET`, `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_GRAPH_VERSION` | no | WhatsApp Cloud API webhook |

Details and defaults for the Phase 4 variables are in [Phase 4 integrations](#phase-4-integrations) and `.sisyphus/phase4-env.md`.

## Scripts

| Script | Description |
|---|---|
| `npm run dev` | Start the dev server |
| `npm run build` / `npm start` | Production build / serve |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Vitest unit tests (`tests/unit`) |
| `npm run test:watch` | Vitest in watch mode |
| `npm run test:e2e` | Playwright smoke tests (`tests/e2e`; starts `npm run dev`) |

## API

| Method | Path | Notes |
|---|---|---|
| GET / POST | `/api/chats` | List (with `?q=` title search, sorted by `lastMessageAt`) or create a chat |
| PATCH / DELETE | `/api/chats/[chatId]` | Rename or delete a chat |
| GET / POST | `/api/chats/[chatId]/messages` | List messages, or send one; POST returns an `application/x-ndjson` stream. `regenerate: true` re-answers the last user message. Optional `clientId` (UUID) makes retries idempotent: a duplicate returns 409 and is not charged. Returns 402 when out of credits |
| PATCH | `/api/messages/[messageId]/feedback` | `{ feedback: "up" \| "down" \| null }` |
| POST | `/api/upload` | Multipart `file` (JPEG/PNG/WebP/HEIC, ≤ 5MB) → `Attachment` |
| POST | `/api/transcribe` | Multipart `audio` (≤ 10MB) → `{ text, credits }`. Costs 1 credit (refunded on failure or empty text); 402 when out of credits |
| GET / PATCH | `/api/me` | Profile and preferences (language, theme, notifications) |
| GET | `/api/stats` | Usage aggregates |
| GET / POST | `/api/farms` | List or create farms |
| GET / PATCH / DELETE | `/api/farms/[farmId]` | Read, update or delete a farm (deleting also removes its fields and reminders) |
| GET / POST | `/api/farms/[farmId]/fields` | List or create fields (GeoJSON polygon boundary) |
| GET / PATCH / DELETE | `/api/fields/[fieldId]` | Read, update or delete a field |
| GET | `/api/weather` | Forecast, spray windows and blight risk for a farm |
| GET / POST | `/api/reminders` | List or create reminders |
| PATCH / DELETE | `/api/reminders/[id]` | Complete, edit or delete a reminder |
| GET / POST / DELETE | `/api/push/subscribe` | Push config (`{ enabled, publicKey }`), subscribe or unsubscribe |
| GET | `/api/dashboard` | Dashboard aggregates |
| GET | `/api/cron/reminders` | Daily cron: push for due reminders and weather alerts (needs `CRON_SECRET`) |
| GET | `/api/fields/[fieldId]/ndvi` | NDVI series (`?format=png` for the heatmap) |
| GET | `/api/fields/[fieldId]/yield` | Yield estimate |
| POST / DELETE | `/api/fields/[fieldId]/iot-token` | Create/rotate or revoke the field's device token |
| POST / GET | `/api/iot/[fieldId]/readings` | Device webhook (device token) / readings for the owner (`?hours=`, max 168) |
| GET | `/api/market` | Mandi prices, trend and forecast (`?commodity=` required, `state`, `district`) |
| GET | `/api/outbreaks` | k-anonymous outbreak cells (`lat`, `lon`, `radiusKm`, `days`) |
| GET / POST | `/api/cases` | List cases (`?scope=all` for experts, `?status=`) or escalate a message (`{ messageId, note? }`) |
| GET / PATCH | `/api/cases/[caseId]` | Read a case, add a note, change status or assign to me |
| GET / POST | `/api/whatsapp` | WhatsApp webhook verification and inbound messages |

The full request/response contract is in `.sisyphus/contracts.md`.

## Project structure

```
src/
  app/            pages + API route handlers (app/api/**)
  components/     UI components
  lib/
    auth.ts         NextAuth options + requireUser()
    mongodb.ts      cached, lazily-connected Mongoose client
    gemini.ts       @google/genai client: streaming answer, diagnosis, titles, follow-ups, summary, STT
    prompts.ts      system prompt + buildSystemPrompt({ language, extraContext })
    answer.ts       streaming answer pipeline (credits, persistence, events)
    stream.ts       client-safe NDJSON encode/decode (readEventStream)
    diagnosis.ts    Gemini box_2d → normalized bounding boxes
    credits.ts, history.ts, media.ts, serialize.ts, text.ts, http.ts
    farm-service.ts, farm-schemas.ts, farm-context.ts   farms/fields CRUD, validation, chat grounding
    crop-calendar.ts  crop stage templates and tasks
    weather.ts, weather-rules.ts   Open-Meteo client, spray windows, blight risk
    push.ts         web-push (VAPID) sender
    outbox.ts       IndexedDB offline outbox for chat messages
    models/         User, Chat, Message, Farm, Field, Reminder, Diagnosis, ... (typed Mongoose models)
  types/          shared client/server types (chat.ts, farm.ts, next-auth.d.ts)
public/sw.js      service worker (app shell + runtime caching)
tests/
  unit/           Vitest
  e2e/            Playwright
```
