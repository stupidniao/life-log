# Riji (日迹) · Personal Life-Log Assistant

A personal life-logging tool built as a WeChat Mini Program: expenses, exercise, weight, sleep, alcohol, reading... all recorded into one unified timeline. Since v0.3.0 it can also **register houseplants by photo, identify the species via AI, and generate care advice**.

**Core design**: driven by a type registry. Adding a new recording module only requires adding a config block in `miniprogram/config/recordTypes.js` — home cards, entry forms, lists, and stats charts all adapt automatically with zero page-code changes.

**Requirement management**: every feature request is registered in [docs/requirements-ledger.md](docs/requirements-ledger.md) with a dedicated design document (`docs/requirements/REQ-XXX-*.md`), mapped one-to-one to a version number — to know what a version delivered, just check the ledger.

**Run tests**: `node tests/run.js` (zero-dependency, covers the plant knowledge base, model-response normalization, and archive service).

---

## Quick Start

1. Open **WeChat DevTools** → Import project
2. Choose this folder (the one containing `project.config.json`)
3. Pick "Tourist AppID" for AppID (already set to `touristappid` in `project.config.json`)
4. Compile and run

No cloud development, no server, no key configuration needed — runs out of the box.

**Want to publish it for others to use in WeChat?** See [docs/deployment-guide.md](docs/deployment-guide.md) (register AppID → trial version → cloud dev → submit for review, with pitfalls covered).

---

## Directory Structure

```
riji-life-log/
├── project.config.json          Project config (miniprogramRoot / cloudfunctionRoot)
├── docs/
│   ├── requirements-ledger.md   ★ Requirement index: ID → design doc → version
│   ├── requirements/            One design doc per requirement (REQ-XXX)
│   ├── design.md                Architecture, data model, milestones, compliance notes
│   └── deployment-guide.md      From local run to review & release, full workflow
├── project-archive.md           Development progress archive (for cross-session continuity)
├── tests/                       Zero-dependency Node unit tests (node tests/run.js)
├── cloudfunctions/
│   ├── records/                 Cloud function: bidirectional incremental sync (M2, optional deploy)
│   └── plantAI/                 Cloud function: plant photo recognition (REQ-001, optional deploy)
└── miniprogram/
    ├── app.js / app.json / app.wxss
    ├── config/recordTypes.js    ★ Type registry: the single source of truth for all modules
    ├── utils/
    │   ├── date.js              Date utils (unified YYYY-MM-DD string)
    │   ├── store.js             Storage layer (local Storage + cloud sync watermark + plant archive)
    │   └── plantCare.js         Plant knowledge base (24 common indoor plants) & care normalization
    ├── services/
    │   ├── record.js            Record service: CRUD + board + trend + distribution (auto-triggers cloud sync on write)
    │   ├── sync.js              Cloud sync: dual-watermark incremental sync, debounce, conflict merge
    │   └── plant.js             Plant service: archive CRUD + photo recognition flow
    ├── components/
    │   └── record-card/         Record card (pure display, no business logic)
    └── pages/
        ├── home/                Today's dashboard
        ├── record/              Log an entry / edit (dynamic form)
        ├── list/                Timeline (grouped by month + type filter)
        ├── stats/               Stats (trend bars + composition distribution)
        ├── mine/                Budget, module toggles, cloud sync, My Plants entry, export, clear
        ├── plants/              My Plants (photo registration + archive list + species picker drawer)
        └── plant-detail/        Plant detail (care advice + issue diagnosis + change species)
```

---

## Plant Care (v0.3.0, REQ-001)

"Me → My Plants" → photograph a new plant: species, health status, current issues, and seven care items (light/water/temperature/humidity/fertilizer/soil/toxicity) all returned at once. Design details in [docs/requirements/REQ-001](docs/requirements/REQ-001-plant-care-photo-registration-and-advice.md).

**Works with zero cloud deployment**: after taking a photo, manually pick from 24 common indoor plants and the plan comes from the built-in knowledge base. AI auto-recognition requires:

1. In DevTools, right-click `cloudfunctions/plantAI` → **Upload and Deploy: Cloud Install Dependencies**
2. Cloud dev console → cloud function plantAI → Config → environment variables: `AI_PROVIDER=zhipu`, `AI_API_KEY=<key from Zhipu open platform>` (free tier GLM-4V-Flash)
3. To switch to Alibaba Bailian: `AI_PROVIDER=dashscope` + a Bailian key (default model qwen3-vl-plus)

Photos are only stored in your own cloud dev environment + the model provider; recognition failure automatically falls back to manual selection, so archive creation never breaks.

---

## Cloud Sync Deployment Guide (optional, v0.2.0+)

**Without cloud sync, the app is fully usable locally — none of the steps below are required.**

Prerequisite: a registered Mini Program AppID (**individual account is fine**; the touristappid cannot enable cloud dev).

1. In WeChat DevTools top bar, "Cloud Dev" → enable and create an environment, note the **environment ID** (like `life-log-3gxxxxxx`)
2. Cloud dev console → Database → create collection **`records`** (keep default "creator read/write only" permission — the client never hits the DB directly, all access goes through the cloud function)
3. Index management → add a compound index on `records`: `openid` (asc) + `updatedAt` (asc); incremental pulls use this query
4. In DevTools, right-click `cloudfunctions/records` → **"Upload and Deploy: Cloud Install Dependencies"**
5. In the Mini Program, "Me → Cloud Sync" → fill environment ID → toggle on. First enable pushes all historical records up

Verification: cloud dev console → Database → your records should appear in `records`.

Note: cloud dev has a free quota, beyond which it bills by usage, **pricing subject to WeChat's latest official policy**; data is isolated by `_openid`, only your own WeChat account can read it.

---

## How to Add a New Module (e.g. "Medication")

Only edit `miniprogram/config/recordTypes.js`, append to the `TYPES` array:

```js
{
  key: 'medicine',
  name: '服药',
  icon: '💊',
  color: '#4C7CE0',
  soft: 'rgba(76, 124, 224, 0.10)',
  kind: 'event',
  primary: { field: 'dose', agg: 'sum', fmt: 'count' },
  fields: [
    { key: 'drug', label: '药品', type: 'text', required: true, placeholder: '例如：维生素 D' },
    { key: 'dose', label: '剂量', type: 'number', unit: '次', required: true, placeholder: '1' },
    { key: 'note', label: '备注', type: 'text', placeholder: '选填' }
  ],
  titleField: 'drug',
  subFields: ['note']
}
```

Save → a new card appears on home, a new type in the entry form, a new tab in stats, a new item in the list filter. **No page code changes needed.**

---

## Data Notes

- **Default**: all records stored locally via `wx.setStorageSync`, key `life_log_records_v1`, not uploaded to any server
- Plant archives are stored under `life_log_plants_v1` (also local-first); after enabling AI recognition, photos are uploaded to **your own** cloud dev environment
- After enabling cloud sync: local remains the working copy, cloud serves as backup + multi-device sharing, synced incrementally by `updatedAt`
- No phone number / location / contacts collected; photos are used only for species recognition (processed by the model provider), the privacy guide must declare camera/album usage
- "Me → Export all records" copies JSON to the clipboard, paste into a note app to back up
- Clearing the Mini Program cache or uninstalling wipes local data; **always export before switching devices when cloud sync is off**

---

## Current Version

v0.4.0 — Plant recognition correction (REQ-004): correct a wrong AI species by entering the right name; the system re-queries all info by that name (with the original photo when available) and regenerates the full archive. Entry points: the registration species picker's custom-name option and the plant detail "change species" picker. Falls back to the local knowledge base when cloud/AI is unavailable. Cloud sync (v0.3.1) unaffected.
