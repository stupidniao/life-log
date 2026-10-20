# REQ-003 · Plant archive cloud sync

> Status: Delivered (v0.3.1)
> Registered: 2026-10-20
> Target version: v0.3.1
> Depends on: REQ-001 (plant archive exists locally)

## Problem

Plant archives (`life_log_plants_v1`) are stored only in local Storage. The
existing cloud sync (`services/sync.js` + cloud function `records`) only
syncs "records", never plants. Result: a plant created on the devtools
simulator is invisible on the real phone, and vice versa.

Two gaps compound this:

1. **Metadata is not synced** — species, care plan, health, issues, tips and
   the photo `fileID` never leave the local device.
2. **Photo cross-device display is broken** — the archive stores
   `photo.fileID` (a `cloud://...` ID) and `photo.localPath` (a local temp
   path). The detail page currently sets
   `photoSrc = fileID || localPath`, but a `cloud://` ID is NOT a URL the
   `<image>` tag can render. On the origin device the photo shows only
   because `onPhotoError` falls back to `localPath`; on another device
   `localPath` is invalid and `fileID` is never converted, so the photo is
   blank.

## Goal

Sync plant archives across devices (same WeChat account), including photos,
reusing the existing `records` sync mechanism (Scheme A).

## Design decisions

### D1 · Reuse `records` cloud function (Scheme A)

Plants are just another "entity" to sync. Extend the existing cloud function
with a separate collection + action branch instead of building a new cloud
function. Keeps the "local is the working copy, cloud is backup + sharing"
model consistent with records.

### D2 · Photos need no file transfer — only the `fileID` string syncs

The photo file is already in cloud storage (`cloud://...`). Syncing only the
`fileID` string (a few dozen bytes of text) is enough; any device can convert
it to a temporary `https://` URL via `wx.cloud.getTempFileURL()`.

### D3 · `localPath` is device-local and is NOT synced

`localPath` is a temp path valid only on the origin device. It is stripped
before upload and never pulled down. The detail page uses `fileID` (converted
to URL) as the primary photo source and keeps `localPath` only as a local
offline fallback on the origin device.

## Data model

### Cloud collection `plants`

One document per plant, keyed by `_id = plant.id` (same upsert-by-id model as
`records`). Each document:

```js
{
  _id: plant.id,        // same id as local
  openid: OPENID,       // isolation, same as records
  // synced fields (whitelist):
  id, name, species, speciesKey, emoji,
  photoFileID,           // cloud:// fileID only; localPath stripped
  care, health, issues, tips, confidence, source,
  createdAt, updatedAt, deleted
}
```

Whitelist keys (analogous to `SAFE_KEYS` in records):

```
id, name, species, speciesKey, emoji, photoFileID, care, health, issues,
tips, confidence, source, createdAt, updatedAt, deleted
```

Note `photoFileID` (renamed from `photo.fileID`) so the cloud doc carries a
flat field; the local archive keeps `photo: { fileID, localPath }`. Mapping
happens at the sync boundary.

## Implementation plan

### 1. `services/sync.js` — add plant sync

- Add `computePlantPushes(allPlants, lastPushAt)` and
  `mergePlantPulls(localPlants, pulls)` (mirror the record versions; mapping
  `photo.fileID` <-> `photoFileID` at the boundary).
- Extend `syncNow()` to also push/pull plants. Two options evaluated:
  - **Preferred**: reuse the same `records` call with an added payload
    `plants: [...]` and return `plants: [...]`; keeps one round-trip, one
    waterline pair.
  - The records cloud function gets a new branch for plants inside the same
    `sync` action (avoids a second action and a second waterline).
- Add `lastPlantSyncAt` / `lastPlantPushAt` waterlines to settings (or reuse
  a single pair — see open question below).
- `scheduleSync()` is already triggered by record writes; extend the plant
  service (`services/plant.js`) to call `sync.scheduleSync()` after
  add/update/remove/create* so plant changes also sync.

### 2. `cloudfunctions/records/index.js` — add `plants` branch

- Add `PLANT_COL = 'plants'` and `PLANT_SAFE_KEYS` whitelist.
- In the same `sync` action, after records: upsert pushed plants into the
  `plants` collection (doc set by `plant.id`, with `openid`), then pull
  plants where `updatedAt > lastPlantSyncAt`, clean to whitelist, and return
  as `plants` array.

### 3. `miniprogram/pages/plant-detail/index.js` — fix photo display

- On load, if `photo.fileID` exists, call `wx.cloud.getTempFileURL({ fileList:
  [fileID] })` to get an `https://` URL, use it as `photoSrc`; keep
  `localPath` as `photoFallback`.
- Fallback to `localPath` if fileID conversion fails or offline.

### 4. Tests (TDD, `tests/`)

- `computePlantPushes` / `mergePlantPulls` pure functions.
- `photo.fileID` <-> `photoFileID` mapping correctness.
- Cloud function plant branch: hard to unit-test without wx-server-sdk mock;
  at minimum test the whitelist/mapping helpers if extracted.

## Acceptance criteria

- Create a plant on devtools → pull on phone shows the same plant (species,
  care plan, issues).
- Photo displays on the phone (converted from fileID, not localPath).
- Plant edits (rename, change species) propagate to the other device.
- Soft-delete (remove) propagates.
- Records sync behavior is unchanged (existing tests stay green).

## Out of scope

- Subscription-message watering/sunlight reminders (REQ-002, deferred).
- Cross-account sharing (single-user multi-device only, same openid).
- Photo compression/re-encoding on the cloud side.

## Decisions (approved 2026-10-20)

- **Scheme A** — reuse the `records` cloud function; plants sync in the same
  `sync` action via a separate `plants` collection + whitelist.
- **Photos** — sync only the `fileID` string; the file already lives in cloud
  storage. The detail page converts `fileID` to a temp `https://` URL via
  `wx.cloud.getTempFileURL()`. `localPath` is device-local and never synced.
- **Waterline** — a separate pair `lastPlantSyncAt` / `lastPlantPushAt` in
  settings, independent of the records pair, to avoid coupling the two data
  types.

## Deployment notes

- After deploying the updated `records` cloud function, create the `plants`
  collection in the cloud console and add a compound index
  `openid` (asc) + `updatedAt` (asc) (same as the `records` collection).
