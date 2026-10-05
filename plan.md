# AgriLens AI — Roadmap: Advanced Features & Visual Overhaul

> Status: proposal. Nothing here is implemented yet.
> Current baseline: Next.js 16 App Router, next-auth (Google), MongoDB/Mongoose, Gemini 2.5 Flash text chat, Tailwind v4, dark slate + emerald theme.

---

## Guiding principles

1. **Farmer-first** — every feature must work on a mid-range Android phone on a weak 3G connection.
2. **Image is the hero** — the system prompt already expects leaf/field images and model predictions; the product doesn't support them yet. That gap is the #1 priority.
3. **Visual polish with purpose** — motion should communicate state (thinking, scanning, healthy vs. diseased), not decorate.
4. **Ship in phases** — each phase is independently deployable.

---

## Phase 0 — Foundations (prerequisite, ~2–3 days)

Fix what later phases will build on.

| # | Task | Files |
|---|------|-------|
| 0.1 | Use the **latest** 10 messages as Gemini history (`sort({createdAt:-1}).limit(10)` then reverse) | `src/app/api/chats/[chatId]/messages/route.ts` |
| 0.2 | Null-guard `user` in all API routes; extract a shared `requireUser()` helper | `src/lib/auth.ts`, `src/app/api/**` |
| 0.3 | Typed session (`next-auth.d.ts` module augmentation) — remove `as any` | `src/types/next-auth.d.ts`, `src/lib/auth.ts` |
| 0.4 | Typed global mongoose cache — remove `@ts-ignore` | `src/lib/mongodb.ts` |
| 0.5 | Migrate `@google/generative-ai` → `@google/genai` (new official SDK) | `src/lib/gemini.ts` |
| 0.6 | Add `/api/stats` endpoint (aggregation) to replace N+1 fetches in profile/settings | `src/app/api/stats/route.ts`, `profile/page.tsx`, `settings/page.tsx` |
| 0.7 | Enforce credits: decrement per AI call, block at 0, show balance in UI | messages route, `Navbar.tsx` |
| 0.8 | Fix `example.env` labels, rewrite `README.md` | — |
| 0.9 | Add Vitest + Playwright smoke tests for API routes and chat flow | `tests/` |

---

## Phase 1 — Visual Overhaul: "Living Field" design system (~1 week)

### 1.1 Design tokens
Replace the unused create-next-app tokens in `globals.css` with a real theme:

```css
@theme {
  --color-soil-950: #0b0f0c;     /* background */
  --color-leaf-400: #4ade80;     /* primary */
  --color-chlorophyll: #22c55e;
  --color-harvest: #f59e0b;      /* warnings / nutrient deficiency */
  --color-blight: #ef4444;       /* disease severity */
  --color-sky: #38bdf8;          /* water / irrigation */
  --font-display: "Space Grotesk"; /* via next/font */
  --font-sans: "Inter";
}
```
- Load fonts with `next/font` (body currently falls back to Arial).
- Add a light theme ("daylight mode" for outdoor sun readability) with a toggle in Settings — high contrast, not just inverted.

### 1.2 Motion system
- Add **`motion`** (Framer Motion) for layout + presence animations.
- Shared primitives in `src/components/ui/`: `FadeIn`, `Stagger`, `GlowCard`, `Shimmer`.
- Respect `prefers-reduced-motion` everywhere.

### 1.3 Landing page (`src/app/page.tsx`)
- **Animated hero background**: slow-moving gradient mesh / aurora in emerald + amber, rendered in CSS (no WebGL needed) — replaces the two pulsing blobs.
- **"Scan line" effect** over the hero image: a glowing horizontal line sweeps the leaf photo and bounding boxes fade in with labels ("Early blight · 92%") — sells the core value in 3 seconds.
- Scroll-triggered feature sections with staggered reveal.
- Animated counters (diseases covered, languages, crops).
- Optional (stretch): a `react-three-fiber` rotating 3D leaf/globe with particles — lazy-loaded, disabled on low-end devices.

### 1.4 Chat experience (`ChatWindow`, `MessageBubble`, `ChatSidebar`)
- **Streaming text** with a soft caret and token fade-in (pairs with Phase 2.2).
- **"Thinking" state**: replace `LoadingDots` with a growing-sprout / pulse-ring animation.
- **Glassmorphism** composer bar with drag-and-drop image zone and glowing focus ring.
- Structured answers rendered as **cards**: Summary · Causes · Immediate actions · Treatment · Prevention (the system prompt already produces these 6 sections — parse headings into collapsible cards with icons).
- **Severity meter** chip (green → amber → red) when the AI returns a diagnosis.
- Sidebar: animated reorder on new message (`layout` animation), date grouping (Today / Last 7 days), search.
- Skeleton loaders instead of "Loading..." text.

### 1.5 Micro-interactions
- Toasts (`sonner`) instead of modals for non-destructive feedback.
- Copy / regenerate / thumbs up-down actions on hover.
- Haptic feedback via `navigator.vibrate` on mobile for send/complete.
- Custom 404 with an animated "lost in the field" illustration.

**Acceptance:** Lighthouse performance ≥ 90 on mobile, CLS < 0.1, all animations disabled under reduced-motion.

---

## Phase 2 — Core AI upgrades (~1–2 weeks)

### 2.1 Image-based crop diagnosis ⭐ (highest value)
- Upload / camera capture (`<input capture="environment">`) in the composer.
- Client-side compression (max 1600px, WebP) before upload.
- Storage: Vercel Blob or Cloudinary; store URLs on `Message.attachments[]`.
- Send image + text to Gemini multimodal.
- Ask Gemini for **structured JSON** (`responseSchema`): `{ crop, condition, confidence, severity, affectedArea%, boundingBoxes[] }` alongside the markdown answer.
- UI: image with **animated bounding-box overlay** + confidence ring.

### 2.2 Streaming responses
- Switch to `generateContentStream`; return a `ReadableStream` from the route.
- Persist the assistant message after the stream completes.
- Stop-generation button.

### 2.3 Conversation intelligence
- Auto-generated chat titles via a short Gemini call (instead of first 50 chars).
- Suggested follow-up questions as chips after each answer.
- Rolling summary of long chats to keep context within token budget.

### 2.4 Voice
- Speech-to-text input (Web Speech API, fallback Gemini audio input).
- Read-aloud answers (SpeechSynthesis) — critical for low-literacy users.
- Animated waveform while recording.

### 2.5 Multilingual
- Language picker (Hindi, Gujarati, Marathi, Tamil, Telugu, Bengali, Swahili, Spanish, Portuguese…).
- Pass preferred language into the system prompt; UI strings via `next-intl`.

---

## Phase 3 — Farm intelligence (~2–3 weeks)

### 3.1 Farm profiles
- New models: `Farm { userId, name, location(GeoJSON), areaHa, soilType }`, `Field { farmId, crop, variety, sowingDate, polygon }`.
- Inject active farm/field context into every chat automatically ("Tomato, 45 days after sowing, clay loam, Gujarat").

### 3.2 Weather-aware advice
- Open-Meteo API (free, no key) for 7-day forecast at farm location.
- Disease-risk alerts (e.g., late blight risk when humidity > 90% and 10–25°C for 48h).
- Spray-window recommendations (no rain, low wind).
- Animated weather widget in sidebar.

### 3.3 Interactive field map
- `maplibre-gl` with satellite tiles; draw field polygons.
- Pins for each diagnosis photo (geotagged) → see where problems cluster.

### 3.4 Crop calendar & reminders
- Auto-generated timeline per field (irrigation, fertilizer, scouting, harvest).
- Web Push notifications (service worker) for upcoming tasks and weather alerts.

### 3.5 Health history dashboard
- Per-field timeline of diagnoses with before/after photo comparison slider.
- Charts (`recharts`): severity over time, treatments applied, outcomes.

### 3.6 Offline-first PWA
- Installable PWA (manifest + service worker via `serwist`).
- Queue messages/photos offline, sync when connection returns.
- Cache last N chats for offline reading.

---

## Phase 4 — Futuristic (~research-heavy, 1–2 months)

| Feature | Description | Tech |
|---|---|---|
| **Satellite crop health (NDVI)** | Vegetation index heatmap per field from Sentinel-2 imagery, updated every ~5 days; flag zones with declining health before visible symptoms | Sentinel Hub / Copernicus Data Space API, overlaid on MapLibre |
| **On-device disease detection** | Run a lightweight classifier (MobileNet/EfficientNet trained on PlantVillage) in the browser for instant offline predictions; Gemini refines the answer when online — this is the "edge model" the system prompt already references | TensorFlow.js / ONNX Runtime Web, WebGPU |
| **Live AR scan mode** | Point camera at a plant; real-time overlay highlights suspicious leaves with pulsing outlines | `getUserMedia` + on-device model + canvas overlay |
| **Community outbreak radar** | Anonymized, aggregated diagnoses on a regional heatmap; alert farmers when a disease is spreading nearby | MongoDB geospatial queries (`$geoWithin`), privacy thresholds (k-anonymity) |
| **Agentic farm assistant** | Gemini function-calling with tools: `getWeather`, `getFieldHistory`, `createReminder`, `getMarketPrice`, so it can *act*, not just answer | Gemini function calling |
| **RAG over agronomy knowledge** | Ground answers in verified extension-service documents and local pesticide regulations; show citations | MongoDB Atlas Vector Search + Gemini embeddings |
| **IoT sensor integration** | Ingest soil moisture / temperature / humidity from low-cost sensors (ESP32) via webhook; live gauges in dashboard | API route + MQTT bridge, time-series collection |
| **Yield & market forecasting** | Estimate yield from field history + weather; show mandi/market price trends to time the harvest sale | Gov open-data price APIs, simple regression → later ML |
| **Expert escalation** | One-tap "send to agronomist" with the full case file (photos, history, AI diagnosis); credits-based marketplace | New `Case` model, email/WhatsApp integration |
| **WhatsApp / SMS bot** | Same assistant over WhatsApp for users without smartphone app habits | WhatsApp Cloud API webhook → existing chat pipeline |

---

## Suggested data model changes

```ts
Message  += attachments: [{ url, type, width, height }],
            diagnosis?: { crop, condition, confidence, severity, boxes[] },
            feedback?: "up" | "down"
User     += language, theme, activeFarmId, notificationPrefs
Farm     (new) { userId, name, location: GeoJSON Point, areaHa, soilType }
Field    (new) { farmId, crop, variety, sowingDate, polygon: GeoJSON }
Reminder (new) { fieldId, type, dueAt, done }
Diagnosis(new, denormalized for analytics/outbreak map) { userId, fieldId, location, condition, severity, createdAt }
```

---

## Recommended execution order

1. **Phase 0** — foundations (unblocks everything)
2. **Phase 1.1–1.4** visual overhaul **in parallel with** **Phase 2.1–2.2** (image diagnosis + streaming) — they meet in the chat UI
3. Phase 2.3–2.5
4. Phase 3 (farm profiles → weather → map → PWA)
5. Phase 4 items picked by user demand; on-device detection and agentic tools first

## New dependencies (proposed)

`motion`, `sonner`, `@google/genai`, `@vercel/blob`, `next-intl`, `maplibre-gl`, `recharts`, `serwist`, `zod`, `vitest`, `@playwright/test` — and optionally `@react-three/fiber`, `@tensorflow/tfjs`.
