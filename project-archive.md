# Mini Program Project Archive · Riji (Personal Life-Log Assistant)

> Read this archive to restore context before each development session; update it after each delivery.
> Last updated: 2026-10-20 (v0.3.0 plant care shipped)

---

## 1. Project Overview

| Item | Detail |
|---|---|
| Name | Riji (life-log) |
| Positioning | Personal life-log assistant: expenses + exercise + weight + sleep + alcohol + reading + plant care, unified record model |
| Account type | Individual account (tools category, personal use only) |
| AppID | **Production environment configured** (since 2026-10-20, value in `project.config.json`, not stored in plaintext here); deploy path: trial version (not submitted for review) |
| Current version | v0.3.0 (REQ-001 plant care: photo registration + AI recognition + care advice; requirement-management mechanism established) |
| Code location | `riji-life-log/` |

## 2. Tech Stack

| Item | Choice |
|---|---|
| Framework | WeChat native (WXML / WXSS / JS), no uni-app / Taro |
| Backend | **M2 connected to WeChat Cloud Development** (cloud function `cloudfunctions/records`, bidirectional incremental sync); **REQ-001 added cloud function `cloudfunctions/plantAI`** (plant photo recognition, requires `AI_PROVIDER`/`AI_API_KEY` env vars). Off by default, local Storage remains the working copy |
| Testing | Zero-dependency Node unit tests: `node tests/run.js` (plant knowledge base / parsing normalization / archive service, 53 cases) |
| Charts | Pure WXSS bar charts / progress bars, no ECharts |
| Base library | Uses common APIs (`wx.getStorageSync`, `picker`, `scroll-view`), no high-version features; **exact minimum base library version must be verified in DevTools** |
| Subpackaging | None (main package source ~120KB, far below 2MB limit) |

## 3. Page Inventory & Progress

| Page | Path | Function | Status | Notes |
|---|---|---|---|---|
| Today | `pages/home/index` | 6-7 module cards + monthly spend + budget progress + last 5 entries | Done | Pull-to-refresh; long-press to edit/delete |
| Log | `pages/record/index` | Dynamic form rendered per schema, supports add & edit | Done | Type switching disabled in edit mode |
| Records | `pages/list/index` | Month-grouped timeline + type filter + month switch | Done | Cannot navigate to future months |
| Stats | `pages/stats/index` | 7/30-day trend bars + metric cards + composition | Done | Metric chart baseline adaptive |
| Me | `pages/mine/index` | Monthly budget, module toggles, **cloud sync (env ID/toggle/manual sync)**, **My Plants entry**, export JSON, clear, privacy notes | Done | Export via clipboard; cloud sync off by default |
| My Plants | `pages/plants/index` | Photo registration (AI recognition → confirm / manual fallback), species picker drawer, archive list, long-press delete | Done | REQ-001 |
| Plant Detail | `pages/plant-detail/index` | Photo, health status, current issues, seven care items, tips, rename, change species, delete | Done | REQ-001 |
| Custom type editor | Not created | User-defined modules | Not started | M3 |

## 4. Components & APIs Used

### Custom Components

| Component | Path | Interface |
|---|---|---|
| record-card | `components/record-card/` | props: `record` (decorated record object), `showTime`; events: `itemtap`, `itemlong` (deliberately avoiding native `tap`/`longpress` to prevent double triggers) |

### Mini Program APIs

| API | Purpose | Notes |
|---|---|---|
| `wx.getStorageSync` / `wx.setStorageSync` | Local record & config persistence | Single-key limit 10MB |
| `wx.showToast` / `wx.showModal` / `wx.showActionSheet` | Feedback & confirmation | — |
| `wx.setClipboardData` | Export data | M1 backup approach |
| `wx.chooseMedia` (camera/album) | Plant photo registration | REQ-001; privacy guide must declare camera/album |
| `wx.compressImage` | Photo compression (quality 70) | REQ-001; falls back to original on failure |
| `wx.saveFile` | Local persistent photo copy | REQ-001; tempFilePath invalid after restart, offline display relies on this |
| `wx.cloud.uploadFile / downloadFile` | Photo to cloud storage / fetch image in cloud function | REQ-001; client does not send binary, avoids callFunction 1MB limit |
| `wx.showModal({editable})` | Plant rename, custom species input | REQ-001; requires base library ≥ 2.17.1 |
| `wx.cloud.init` | Init cloud dev (only when user filled env ID) | wx.cloud requires base library support, exact minimum per official docs |
| `wx.cloud.callFunction` | Call cloud function `records` for incremental sync | Cloud function protocol: `{action:'sync', pushes, lastSyncAt}` → `{code, serverTime, pushed, pulls}` |
| `wx.navigateTo` / `wx.navigateBack` / `wx.switchTab` | Routing | — |
| `wx.setNavigationBarTitle` | Dynamic title on entry page | — |

**No privacy APIs called** (no `getLocation` / `getUserProfile` / `getPhoneNumber`), `app.json`'s `requiredPrivateInfos` is empty. Note: REQ-001's `wx.chooseMedia` involves camera/album, must be declared in the Mini Program backend's "User Privacy Protection Guide" (required before review).

### Data Conventions

Record structure (unified, type-agnostic):

```js
{ id, type, date: 'YYYY-MM-DD', time: 'HH:mm', value, fields: {}, note, deleted, createdAt, updatedAt }
```

- `value` = the numeric redundancy of `fields[type.primary.field]`, stats and charts read only this
- Event-type `agg: 'sum'` sums; metric-type `agg: 'last'` takes the last entry of the day
- Storage keys: `life_log_records_v1` (record array), `life_log_settings_v1` (config, including cloud sync dual watermarks `lastSyncAt`/`lastPushAt`), `life_log_plants_v1` (plant archives, REQ-001)

Plant archive structure (REQ-001, same soft-delete discipline):

```js
{ id, name, species, speciesKey, emoji, photo: {fileID, localPath},
  care: {light, water, waterDays, temp, humidity, fertilizer, soil, toxicity},
  health, issues: [{title, detail}], tips: [], confidence, source: 'ai|library|manual',
  createdAt, updatedAt, deleted }
```

- `care.waterDays` is the data reservation for REQ-002 (due reminders)
- Three archive sources: `createFromAnalysis` (AI, plan AI-first with knowledge-base fallback) / `createManual` (manual pick, plan entirely from knowledge base) / custom name (default 7-day cycle)
- Photo dual address: cloud fileID preferred, `binderror` falls back to localPath

Service layer interface (`services/record.js`, the page's only dependency):
`add / update / remove / get / query / decorate / decorateMany / groupByDate / buildBoard / series / statsOf / distribution / monthTotal`

Plant service (`services/plant.js`, REQ-001):
`list / get / add / update / remove / createManual / createFromAnalysis / changeSpecies / aiAvailable / analyzePhoto`
- `analyzePhoto`: compress → local copy → cloud storage → cloud function plantAI; any failure does not reject, uniformly `analysis: null` falls to manual selection
- Cloud init reuses `getCloudEnv / ensureInit` exported by `sync.js` (`wx.cloud.init` allowed only once globally)
- Knowledge base & normalization pure functions in `utils/plantCare.js` (24 species, incl. Latin name / alias matching)

Cloud sync (`services/sync.js`):
- Model: local Storage = working copy, cloud = backup + multi-device sharing; `updatedAt` incremental, bidirectional
- **Dual watermark**: pull uses server time (`lastSyncAt`), push uses client time (`lastPushAt`) — prevents missing pushes from phone clock drift
- Conflict: last-write-wins; keep local version when there are unpushed local updates
- Cloud function `_id` = record `id`, upsert naturally dedupes; data isolated by `_openid`, whitelisted field writes
- 2s debounce auto-sync after writes (hooked in `record.js` add/update/remove); sync once on app launch

## 5. Todos & Known Issues

**Todos (by priority)**

1. **REQ-001 real-environment verification** (user side): deploy cloud function plantAI → set `AI_PROVIDER`/`AI_API_KEY` env vars → real-device photo test of recognition quality (steps in README "Plant Care" section)
2. **REQ-002 watering/sunlight due reminders**: filed (docs/requirements/REQ-002), design memo complete, restart condition = REQ-001 used for two weeks
3. **Requirement-management mechanism established** (docs/requirements-ledger.md): register ID before writing design doc, backfill version after delivery
4. Real-device verification: `input type="digit"` keyboard, `picker` layer, `showModal editable` on iOS & Android
5. Add tabBar icons (`iconPath` not required, currently text-only)
6. Empty-data first-launch onboarding (current home empty state is just one line)
7. M2 remainder: subscription-message reminder (remind at 21:30 daily if no entry) — requires user's proactive subscription, cannot push by default; can be merged with REQ-002's subscription-message channel in design
8. M3: custom type editor UI (registry already supports it, only UI missing)
9. M3: Excel export (currently only JSON clipboard)

**Known Issues**

| Issue | Impact | Resolution |
|---|---|---|
| Default data stored locally only | Lost on device switch / cache clear | Enable cloud sync since v0.2.0; otherwise use "Export JSON" backup |
| Beyond ~3000 records, `getStorageSync` full deserialization has perceptible latency | List first-screen slows | Data still fully cached locally after cloud sync; paginate in M3 if volume grows |
| Metric-type multiple entries per day only keeps the last | Weight logged twice a day, last wins | Matches design, no change |
| Sync pull cap 5000 records per call | First sync of huge history needs multiple manual syncs | Defensive cap in cloud function; normal personal use won't hit it |

## 7. Version Iteration Log

| Version | Date | Content |
|---|---|---|
| v0.1.0 | 2026-10-19 | M1: type registry + 5 pages + local storage |
| v0.1.1 | 2026-10-19 | First code review fixed 6 issues (search semantics / write-failure rollback / picker forward compat, etc.) |
| v0.2.0 | 2026-10-19 | M2: cloud dev sync (cloud function records + services/sync.js dual-watermark incremental sync + cloud sync controls on Me page + README deploy guide); sync simulation tests 18/18 passed |
| — | 2026-10-20 | User obtained production AppID and configured it (commit bf7b2ef), chose trial-version path, personal use only; review deferred |
| v0.3.0 | 2026-10-20 | REQ-001 plant care: photo registration (chooseMedia → compress → cloud storage → cloud function plantAI → Zhipu GLM-4V-Flash / qwen-vl multimodal recognition), 24-species knowledge-base fallback, seven care items + issue diagnosis + tips, two new pages, requirement-ledger mechanism, zero-dependency Node unit tests 53 cases. Review process: user cut reminders after review (split into REQ-002), established requirement-management mechanism |

**v0.3.0 development self-review (superpowers flow)**

- TDD: wrote tests first to see red (3 file-load failures) → implemented → 53/53 green; smoke-tested the full chain of "manual archive / AI dirty-data archive / change species / delete"
- Review fixed 2 issues: ① same-millisecond archive ordering instability (genId adds a monotonic per-session sequence as tiebreaker) ② `createFromAnalysis` trusted boundary data (added defensive normalization of issues/tips)
- UX self-check fixed 1: the "go select" popup after recognition failure was a half-finished piece (picker can't be programmatically invoked) → rewrote as a bottom species-selection drawer, reused for manual add

**Code review log (2026-10-19, v0.1.0 → v0.1.1)**

| # | Issue | Severity | Resolution |
|---|---|---|---|
| 1 | `query()` keyword search uses `JSON.stringify(fields)`, searching field names (e.g. "amount") falsely matches all records | Medium | Fixed: concatenate only field values + note + date, regression 5/5 passed |
| 2 | `store.saveRecords` on write failure leaves memory cache updated but not persisted, user thinks it saved, lost on restart | Medium | Fixed: roll back memory state on failure and rethrow, page-level targeted prompt (storage full → guide export/cleanup); storage layer no longer shows UI |
| 3 | Stats page `onLoad` callback + `onShow` each run `load()` once, duplicate compute on first entry | Low | Fixed: `onLoad` only prepares data, loading unified into `onShow` |
| 4 | Stats chart footnote hardcoded "single-day max", semantically wrong for metric types like weight | Low | Fixed: `maxLabel` dynamic per `statsOf` mode |
| 5 | Editing old records, a picker value not in current options is silently reset to first item (certain to appear after M3 custom categories) | Medium (forward-looking) | Fixed: append unknown value to options then select, no data loss |
| 6 | `mine` page typeList contains unused `on: true` dead property | Low | Removed |

**Review leftovers (non-blocking, handle after real-device verification)**

- `wx.setStorageSync` rewrites the whole array every time: imperceptible under 3000 records, naturally resolves after M2 cloud switch, not optimizing for now
- Soft-deleted records persist forever in Storage, only growing: harmless at this scale, do physical cleanup alongside M2 sync
- tabBar still text-only, icons pending

## 8. Review Submission Log

| Time | Event | Feedback | Remediation | Status |
|---|---|---|---|---|
| — | Not yet submitted | — | — | — |

### Pre-Review Checklist (must read before M1 submission)

- [ ] Category "Tools - Efficiency/Recording", individual accounts eligible
- [ ] Name & intro free of forbidden words; avoid phrasing like "bookkeeping/wealth management" or "health management" that steer toward finance/medical categories
- [ ] Weight/sleep only record & display, **no health advice, diagnosis, or risk scoring**
- [ ] Alcohol records contain no alcohol product recommendations, purchase links, or brand promotion
- [ ] No payment, fund pooling, or multi-party split
- [ ] Privacy: M1 collects no personal info, but still fill the "User Privacy Protection Guide" per actual usage in the backend
- [ ] All pages have loading/empty states, no white screen
- [ ] Subject to WeChat's latest official review rules: https://developers.weixin.qq.com/miniprogram/product/reject.html
