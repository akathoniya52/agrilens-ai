# Phase 4 environment variables

All optional. Each feature degrades to a clear "not configured" state when its variables are missing.

| Variable | Feature | Description |
|---|---|---|
| `SENTINEL_HUB_CLIENT_ID` | NDVI (a) | OAuth client id (Copernicus Data Space or Sentinel Hub). Without it `/api/fields/[id]/ndvi` returns `{ status: "not_configured" }`. |
| `SENTINEL_HUB_CLIENT_SECRET` | NDVI (a) | OAuth client secret. |
| `SENTINEL_HUB_BASE_URL` | NDVI (a) | API base. Default `https://sh.dataspace.copernicus.eu` (CDSE). For commercial Sentinel Hub use `https://services.sentinel-hub.com`. |
| `SENTINEL_HUB_TOKEN_URL` | NDVI (a) | OAuth token endpoint. Default CDSE: `https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token`. Sentinel Hub: `https://services.sentinel-hub.com/auth/realms/main/protocol/openid-connect/token`. |
| `NEXT_PUBLIC_TFJS_MODEL_URL` | On-device model (b, c) | URL of a TF.js `model.json` (layers or graph model, PlantVillage-style classifier). Unset = the on-device hint and live scan detection are hidden. |
| `NEXT_PUBLIC_TFJS_LABELS_URL` | On-device model | JSON array (or `{ "0": "...", ... }`) of class labels. Default: `labels.json` next to the model. |
| `NEXT_PUBLIC_TFJS_MODEL_FORMAT` | On-device model | `layers` \| `graph`. Default: try layers, then graph. |
| `NEXT_PUBLIC_TFJS_INPUT_SIZE` | On-device model | Square input size in px. Default `224`. |
| `NEXT_PUBLIC_TFJS_NORMALIZE` | On-device model | Pixel scaling: `0,1` (default), `-1,1` (MobileNetV2-style) or `none`. |
| `DATA_GOV_IN_API_KEY` | Market prices (f) | data.gov.in API key for the Agmarknet daily mandi price resource `9ef84268-d588-465a-a308-a864a43d0070`. Used by `/api/market` and the `getMarketPrice` agent tool. |
| `GEMINI_EMBEDDING_MODEL` | RAG (g) | Embedding model. Default `gemini-embedding-001` (768 dims via `outputDimensionality`). Uses the existing `GOOGLE_API_KEY`. |
| `ATLAS_VECTOR_INDEX` | RAG (g) | Name of the Atlas Vector Search index on `knowledges.embedding` (768 dims, cosine). Unset or failing = in-memory cosine fallback. |
| `RAG_FALLBACK_LIMIT` | RAG (g) | Max chunks loaded for the in-memory fallback. Default `2000`. |
| `EXPERT_EMAILS` | Expert cases (i) | Comma/space-separated emails of agronomists who can see, assign and resolve all cases. |
| `WHATSAPP_VERIFY_TOKEN` | WhatsApp (j) | Arbitrary string you also enter in the Meta webhook settings (GET verification). |
| `WHATSAPP_APP_SECRET` | WhatsApp (j) | Meta app secret used to verify `X-Hub-Signature-256`. |
| `WHATSAPP_TOKEN` | WhatsApp (j) | Cloud API access token (system-user token recommended). |
| `WHATSAPP_PHONE_NUMBER_ID` | WhatsApp (j) | Sending phone number id. |
| `WHATSAPP_GRAPH_VERSION` | WhatsApp (j) | Graph API version. Default `v21.0`. |

All four `WHATSAPP_*` (except the version) must be set, or `/api/whatsapp` returns 503.

IoT (h) needs no env vars. Each field gets its own device token from `POST /api/fields/[fieldId]/iot-token`; only the SHA-256 hash is stored. Note: README's planned `IOT_WEBHOOK_SECRET` is **not** used.

## Atlas vector index definition (g)

```json
{
  "fields": [
    { "type": "vector", "path": "embedding", "numDimensions": 768, "similarity": "cosine" }
  ]
}
```

Ingest docs: `npx tsx scripts/ingest-knowledge.ts ./knowledge` (`tsx` is not a project dependency; it runs via npx). Inputs are `.md` and `.txt` files. An optional first line `url: https://…` sets the citation link.
