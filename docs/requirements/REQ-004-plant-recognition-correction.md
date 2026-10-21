# REQ-004 · Plant Recognition Correction — "识别错了，我来纠正"

> Status: delivered (v0.4.0, 69 unit tests green)
> Registered: 2026-10-20 · Delivered: 2026-10-20
> Related: REQ-001 (photo registration & recognition)

---

## 1. Requirement Description

User can correct a plant's species after the model recognized it wrong, and the
system must use the corrected name to **re-query all information and regenerate
the archive** (species, care plan, health, issues, tips) — not just relabel the name.

The corrected name may not be the most precise, but it is always a correct direction;
the model must resolve it into a proper species and a full care plan.

## 2. Key Decisions (confirmed by user)

| # | Decision | Choice |
|---|---|---|
| D1 | Info source for re-query | **Model re-query** (send corrected name back to plantAI; not the local 24-species library) |
| D2 | Send original photo along? | **Yes** — corrected name + original photo together |
| D3 | Correction entry point | **Both** — during-registration confirm modal AND plant detail page |

## 3. Flow Design

### 3.1 Correction flow (shared backend)

```
corrected name (from user)
  → plantAI cloud function, action: 'correct'
      input: { correctedName, fileID? }   // fileID optional; has photo → re-recognize image too
  → model re-queries the species by name (and re-reads photo when present)
  → returns a full, normalized analysis
  → client writes it back into the archive (preserving name / photo / id)
```

### 3.2 Two entry points

**A. During registration (confirm modal)** — `pages/plants/index.js`
- When AI returns a wrong species, user taps "选别的" today → currently opens the
  manual species drawer. New: in the drawer, when user types a **custom name**
  (the `其他…`/`自定义名称` option), we take that name and call `correct` (with the
  photo), then rebuild the archive from the corrected analysis instead of a blank
  manual entry.

**B. Plant detail page** — `pages/plant-detail/index.js`
- New "识别不对？纠正品种" action. User enters the correct name → `correct` (with
  the archived photo's fileID) → archive regenerated in place.

## 4. Backend — cloud function plantAI, action `correct`

```
input   { action: 'correct', correctedName: string, fileID?: string }
output  { code: 0, data: {species, confidence, health, care, issues, tips}, provider, model }
        { code: 4xx/5xx, message }
```

Rules:
- `correctedName` required, trimmed non-empty; else `400`.
- `fileID` optional: when provided and downloadable, download → base64 → include as
  an image part (same size guard, `413` on oversize). When absent or download fails,
  degrade to a text-only re-query (still succeed — never block the correction).
- Reuse the existing `analyze` prompt, but with a **name-anchored system prompt**:
  "The user says this plant is `{correctedName}`. Identify/confirm the species using
  this name as the authoritative direction, and return the full care plan."
- Same parse + normalize pipeline (`analyze.parseModelJson` / `normalizeAnalysis`).
- Confidence: when the model is confident the corrected name maps to a species, set
  high; when it must guess, reflect a lower value. Still normalized 0~1.

### 4.1 New pure functions (in `lib/analyze.js`, unit-testable)

- `buildCorrectionMessages(base64|null, correctedName)` → messages array
  (name-anchored system prompt; image part only when base64 present).
- `normalizeAnalysis` reused unchanged (already handles dirty JSON).

## 5. Client — service layer (`miniprogram/services/plant.js`)

- `analyzeCorrection(correctedName, photo)` → Promise, mirrors `analyzePhoto`:
  - no cloud / not initialized → resolve `{ analysis: null, reason: 'no-cloud' }`
    (page falls back to local knowledge base / manual).
  - upload not needed for a **name-only** correction when there is no photo; but when
    a photo is provided, reuse the existing upload path or pass the archived fileID
    directly.
  - call `plantAI` with `action: 'correct'`.
  - never rejects; failures degrade to `analysis: null`.

- `applyCorrection(id, correctedName, photo)` → regenerate archive in place:
  - preserve `id`, `name` (user's nickname, unless empty → fall back to species),
    `photo`, `createdAt`.
  - replace `species`, `speciesKey`, `emoji`, `care`, `health`, `issues`, `tips`,
    `confidence`, `source: 'ai'`, `updatedAt`.
  - uses the corrected analysis (AI) first, local knowledge base as backfill —
    same merge discipline as `createFromAnalysis`.

## 6. Data Model

No schema change. Reuses the existing plant record. `source` becomes `'ai'` after a
successful correction; `confidence` reflects the corrected recognition.

## 7. Acceptance Criteria

1. `node tests/run.js` green — new group covering
   `buildCorrectionMessages` (name-anchored, with/without image) and
   `applyCorrection` (preserves id/name/photo/createdAt, replaces the rest).
2. During registration: wrong species → custom-name correction → archive regenerated
   from the corrected analysis (not a blank manual entry).
3. Detail page: "识别不对？纠正品种" → enter name → archive regenerated in place;
   photo/name/id preserved.
4. No cloud / key missing / model timeout → correction degrades gracefully to local
   knowledge base, never blocks.
5. `node --check` all JS passes; README / design / requirements-ledger synced.

## 8. Compliance & Notes

- Correction sends the photo to the user's own cloud env + model provider only; already
  covered by REQ-001's privacy-guide declaration ("photograph plants to identify species").
- No new sensitive capability (no payment / phone / location); no new privacy permission.

## 9. Out of Scope

- Species encyclopedia / marketplace / community (unchanged).
- Editing the care plan field-by-field manually (unchanged).
