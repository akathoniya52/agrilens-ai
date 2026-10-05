# AgriLens shared contracts (source of truth for all workstreams)

## Auth helper — `src/lib/auth.ts`
`requireUser(): Promise<{ user: UserDoc } | { error: NextResponse }>` — 401 if no session, 404 if no DB user.
Session typed via `src/types/next-auth.d.ts`: `session.userId: string`, `session.credits: number`.

## Types — `src/types/chat.ts` (client + server shared, no mongoose imports)
```ts
export type Severity = "none" | "low" | "moderate" | "high" | "critical";
export interface BoundingBox { label: string; confidence: number; x: number; y: number; w: number; h: number } // normalized 0–1, top-left origin
export interface Diagnosis { crop: string; condition: string; confidence: number /*0–1*/; severity: Severity; affectedAreaPct: number; boxes: BoundingBox[] }
export interface Attachment { url: string; type: string; width?: number; height?: number }
export interface ChatMessage { _id: string; chatId: string; role: "user"|"assistant"|"system"; content: string;
  attachments?: Attachment[]; diagnosis?: Diagnosis | null; feedback?: "up"|"down"|null; followUps?: string[]; createdAt: string }
export type StreamEvent =
  | { type: "meta"; userMsg: ChatMessage }
  | { type: "delta"; text: string }
  | { type: "diagnosis"; diagnosis: Diagnosis }
  | { type: "done"; assistantMsg: ChatMessage; chat: { _id: string; title: string }; followUps: string[]; credits: number }
  | { type: "error"; error: string };
```

## API
| Method | Path | Body | Response |
|---|---|---|---|
| GET | /api/me | – | `{ _id,name,email,image,credits,language,theme,activeFarmId,notificationPrefs,createdAt }` |
| PATCH | /api/me | `{ language?, theme?: "dark"\|"daylight", activeFarmId?, notificationPrefs? }` | updated me |
| GET | /api/stats | – | `{ totalChats, totalMessages, userMessages, assistantMessages, diagnoses, credits, memberSince, lastActiveAt }` |
| GET | /api/chats?q= | – | chats (title search when q) sorted lastMessageAt desc: `{_id,title,lastMessageAt,createdAt}` |
| POST | /api/chats/[id]/messages | `{ content: string, attachments?: Attachment[], regenerate?: boolean }` | `application/x-ndjson` stream of `StreamEvent` (one JSON per line). 402 JSON `{error}` when credits = 0. Client abort = stop generation (partial text persisted). `regenerate:true` deletes last assistant msg and re-answers last user msg (content ignored). |
| PATCH | /api/messages/[id]/feedback | `{ feedback: "up"\|"down"\|null }` | message |
| POST | /api/upload | multipart `file` (image ≤ 5MB) | `Attachment` (Vercel Blob; data-URL fallback when BLOB_READ_WRITE_TOKEN unset) |
| POST | /api/transcribe | multipart `audio` | `{ text }` (Gemini audio fallback for STT) |

Credits: 1 credit per AI answer (incl. regenerate). Cost constant `AI_CREDIT_COST` in `src/lib/credits.ts`.

## Theme & i18n
- Theme: `data-theme="dark" | "daylight"` on `<html>`, persisted in localStorage `agrilens-theme` + `/api/me`.
- Locale: cookie `NEXT_LOCALE` (en, hi, gu, mr, ta, te, bn, sw, es, pt); messages in `messages/<locale>.json`; next-intl without i18n routing; config `src/i18n/request.ts`.
- Language list exported from `src/lib/languages.ts`: `LANGUAGES: { code, label, nativeLabel }[]`.
