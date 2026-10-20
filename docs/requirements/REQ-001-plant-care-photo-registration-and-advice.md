# REQ-001 · Plant Care — Photo Registration & Care Advice

> Status: delivered (v0.3.0, 53 unit tests green)
> Registered: 2026-10-20 · Delivered: 2026-10-20
> Related: REQ-002 (due reminders, not in this version, see its doc's "Data Reservation" section)

---

## 1. Requirement Description

Manage houseplants inside the Mini Program:

1. **Photo registration** — one photo creates a plant's archive, photo and species auto-filled
2. **Recognition & parsing** — a multimodal model parses the photo: species, confidence, health status, current issues
3. **Care advice** — one plan per plant: light, watering, temperature, humidity, fertilizer, soil, toxicity notes, plus diagnosis tailored to the photo

**Explicitly out of scope this version** (to prevent scope creep): watering/sunlight check-ins and due reminders (REQ-002), subscription-message push, species encyclopedia, marketplace categories.

## 2. Key Decision Log (review conclusions)

| # | Decision | Rationale |
|---|---|---|
| D1 | Default model **Zhipu GLM-4V-Flash** (free tier), keep Alibaba qwen-vl adapter in the cloud function | Free to use; both OpenAI-compatible protocol, switching only changes env var |
| D2 | Plant archives **stored independently** (`life_log_plants_v1`), not stuffed into records timeline | Plants are long-lived entities with photos & plans, not isomorphic to the "something happened" timeline model |
| D3 | API key only in **cloud function env vars**, zero secrets on client | Mini Program package can be unpacked |
| D4 | No cloud dev / no key / recognition failure → **fall back to manual species pick** (built-in 24-species knowledge base), archive still created | Continues the project's "runs without cloud" DNA; AI is an upgrade, not a gate |
| D5 | Two pages: plant list + plant detail; entry on "Me" page, tabBar untouched | Minimal viable; tabBar slots are precious |
| D6 | Confirm before archiving (popup shows species & confidence, can switch to manual pick) | Models make mistakes, let the user gatekeep |
| D7 | Detail page supports **changing species**: recomputes plan from knowledge base | Covers D1's recognition error |
| D8 | All parsing & normalization as **pure functions**, with Node unit tests | TDD; model response is a dirty-data minefield |

## 3. Flow Design

```
wx.chooseMedia (camera/album)
  → wx.compressImage (quality 70, fallback to original on failure)
  → with cloud env: wx.cloud.uploadFile to get fileID
              → cloud function plantAI: downloadFile → base64 → multimodal model → structured JSON
  → without cloud env: skip recognition
  → wx.saveFile to store a local persistent copy (photos viewable offline)
  → user confirms species (AI result / manual pick)
  → archive written to life_log_plants_v1 → jump to detail
```

Failure branch: cloud function error / key not set / model timeout → toast "Recognition failed, pick a species manually" → manual pick, `source: 'library'`. **No failure ever blocks archive creation.**

## 4. Data Model

Storage key: `life_log_plants_v1` (array, soft delete, same discipline as records).

```js
{
  id: 'p' + time-base36 + random,   // archive primary key
  name: '窗台那盆',                   // user name, default = species name
  species: '绿萝',                    // species (AI-recognized or manual)
  speciesKey: 'pothos',               // knowledge-base key hit, '' if miss
  photo: {
    fileID: 'cloud://...',            // cloud storage address (when cloud)
    localPath: 'wxfile://...'         // local persistent copy (fallback display)
  },
  care: {                             // care plan, fields nullable, page skips empties
    light: '', water: '', waterDays: 0,   // waterDays reserved for REQ-002
    temp: '', humidity: '', fertilizer: '', soil: '', toxicity: ''
  },
  health: '健康',                     // healthy / fair / needs-attention
  issues: [{ title: '', detail: '' }],    // diagnosis for this photo
  tips: [],                           // supplementary advice from the model
  confidence: 0.86,                   // recognition confidence, 0 for manual
  source: 'ai',                       // ai | library | manual
  createdAt: 0, updatedAt: 0,
  deleted: false
}
```

## 5. Cloud Function plantAI

```
input  { action: 'analyze', fileID }
output { code: 0, data: {species, confidence, health, care, issues, tips}, provider, model }
       { code: 4xx/5xx, message }
```

- Size guard: base64 > 4MB returns 413 (prompt to re-shoot)
- Env vars: `AI_PROVIDER` (zhipu default / dashscope), `AI_API_KEY` (required), `AI_MODEL` (optional)
- Output constraint: system prompt gives a field dictionary and requires JSON-only return; parsing layer strips markdown fences, truncates to first/last braces, supports `{analysis:{...}}` wrapping
- Normalization: numeric clamping (confidence 0~1, waterDays 1~60), string array → object for issues, health enum fallback
- No third-party deps (`wx-server-sdk` + Node built-in `https`), fast cloud install

## 6. Local Knowledge Base (utils/plantCare.js)

24 common indoor plants: name, aliases (incl. Latin/common names), light, watering, cycle, temperature, humidity, fertilizer, soil, toxicity.

Responsibilities:
1. Full plan source for manual species pick (`source: 'library'`)
2. Field backfill & numeric clamping for AI plans (AI often misses structured fields)

## 7. Pages

| Page | Path | Content |
|---|---|---|
| My Plants | `pages/plants/index` | Archive card list (photo, name, species, health status), photo button, manual add, long-press delete, empty-state onboarding |
| Plant Detail | `pages/plant-detail/index` | Large photo, name/species/confidence/source, seven care items, current issues, tips, change species, rename, delete |

Entry: new "My Plants" row on the "Me" page.

## 8. Acceptance Criteria

1. `node tests/run.js` all green (knowledge base / parsing normalization / archive service, three groups)
2. No cloud env: photo → manual pick → archive → detail fully shows knowledge-base plan
3. With cloud env (after deploying plantAI + setting key): photo → recognize → confirm → archive; recognition failure auto-falls to manual pick
4. Kill and reopen the Mini Program after archiving, photo still displays (local copy fallback)
5. `node --check` all JS passes; README / design / project archive three places synced

## 9. Deployment Steps (user side)

1. DevTools right-click `cloudfunctions/plantAI` → upload and deploy: cloud install dependencies
2. Cloud dev console → cloud function plantAI → config → env vars: `AI_PROVIDER=zhipu`, `AI_API_KEY=<open platform key>`
3. (optional) `AI_MODEL` overrides the default model
4. Mini Program backend → settings → user privacy protection guide: declare "camera" "album (write-only)", purpose "photograph plants to identify species and generate care advice"

**Base library requirement**: rename/custom species uses `wx.showModal({ editable: true })`, needs base library ≥ 2.17.1 (2021 version, sufficient coverage); if real device misbehaves, check the base library version first.

## 10. Compliance

- Plant care advice doesn't touch human health, doesn't hit the "weight/sleep must not output health advice" review red line
- Knowledge base & model prompts contain no "treat illness" / "medicinal" / "edible" wording; the toxicity field only says "avoid ingestion"
- Photos used only for recognition, sent to the user's own cloud dev environment & model provider, must be declared in the privacy guide
