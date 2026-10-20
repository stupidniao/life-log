# Riji · Personal Life-Log Assistant — Design v0.1

> One-line positioning: **a unified recording engine + several pluggable recording modules**, to log the things in life worth remembering (money, body, input) into one timeline.

📍 Stage: design complete + M1 skeleton implemented (compiles and runs)

---

## 1. Conclusion First: Why Not "a Bookkeeping Mini Program + a Few Features"

The requirements you listed — "expenses, exercise, weight, reading, alcohol" — look like 5 features. But their **data structures are the same thing**:

| Scenario | What to log | Common structure |
|---|---|---|
| Expenses | Amount, category, payment method | time + several fields + one primary value |
| Exercise | Item, duration, distance | time + several fields + one primary value |
| Weight | Weight, body fat | time + several fields + one primary value |
| Reading | Book title, duration, pages | time + several fields + one primary value |
| Alcohol | Type, ml, state | time + several fields + one primary value |

Three routes compared:

| Approach | How | Result |
|---|---|---|
| A. Assembly | One table for expenses, one for exercise, one for weight | Each new module needs changes in **4 places**: data table, entry form, list rendering, stats metric. Inevitable refactor by the 5th module |
| **B. Registry engine (this design)** | One record structure + one type config | New module = **+20 lines of config**, pages/stats/charts all auto-adapt |
| C. Pure free JSON | Log anything, fill fields freely | No unified metric, stats impossible, degenerates into a memo |

Choose B. The cost is one layer of abstraction (~200 lines of service code); the payoff is **no page changes needed to add any new module in the next three years**.

---

## 2. Core Design: Type Registry

### 2.1 Two Record Shapes

Understanding this makes everything downstream easy:

- **Event type (event)**: something happens once, multiple per day, stats metric is **sum + count**
  → expenses, income, exercise, alcohol, reading
- **Metric type (metric)**: one state value per day, stats metric is **latest value + delta**
  → weight, sleep

If mixed together, weight would be "summed" into 700kg — the most common failure point of this kind of app.

### 2.2 Config Structure

```js
{
  key: 'weight',                    // unique id, stored in the record
  name: '体重', icon: '⚖️',
  color: '#8B5CF6', soft: 'rgba(...)',  // theme color + light background
  kind: 'metric',                   // event | metric
  primary: {                        // primary value: trend chart & summary both read it
    field: 'weight',                // key in fields
    agg: 'last',                    // sum | last
    fmt: 'kg',                      // formatter: money|duration|kg|hours|ml|count
    chartBase: 'auto'               // bar chart baseline: auto = start from min (required for weight)
  },
  fields: [                         // dynamic form, page renders per this
    { key:'weight', label:'体重', type:'decimal', unit:'kg', required:true },
    { key:'bodyFat', label:'体脂率', type:'decimal', unit:'%' }
  ],
  titleField: '',                   // which field the list title takes
  subFields: ['bodyFat']            // which fields the list subtitle takes
}
```

Supported field `type`: `money` / `number` / `decimal` / `picker` / `text`.
**Adding a new field type only requires adding a branch in `record/index.wxml`**, existing types unchanged.

### 2.3 Adding a "Tea" Module — What Needs to Change

Only edit `config/recordTypes.js`, add a block:

```js
{
  key: 'tea',
  name: '喝茶',
  icon: '🍵',
  color: '#8C6239',
  soft: 'rgba(140, 98, 57, 0.10)',
  kind: 'event',
  primary: { field: 'ml', agg: 'sum', fmt: 'ml' },
  fields: [
    { key: 'kind', label: '茶种', type: 'picker', options: ['绿茶','红茶','乌龙','普洱'], default: '绿茶' },
    { key: 'ml', label: '茶水量', type: 'number', unit: 'ml', required: true, placeholder: '300' }
  ],
  titleField: 'kind',
  subFields: []
}
```

After saving: a "Tea" card appears on home, a tea-type picker appears in the entry form, a new tab in stats, a new filter item in list.
**Zero page-code changes.** This is why the architecture is worth it.

---

## 3. Information Architecture & Page Inventory

```
Tab 1 Today ──── dashboard (6 module numbers) + recent records + floating "log"
Tab 2 Records ──── month-grouped timeline, type filter / month switch
Tab 3 Stats ──── single-module trend bars + composition distribution
Tab 4 Me ──── budget, module toggles, export, clear, privacy notes
                └─ log / edit page (not a tab, entered from any entry point)
```

| Page | Path | Purpose | Key interaction |
|---|---|---|---|
| Today | `pages/home/index` | Today's full picture | Tapping a module card enters that type's entry form; shows monthly spend & budget progress |
| Records | `pages/list/index` | Timeline query | Month switch, type filter, day grouping, long-press edit/delete |
| Stats | `pages/stats/index` | Single-dimension analysis | Switch type, switch 7/30 days, trend bars, category share |
| Me | `pages/mine/index` | Config & data | Budget, module toggles, export JSON, clear |
| Log | `pages/record/index` | Entry / edit | **Same schema dynamically renders form**, switching type swaps form instantly |

Main package size: all pages + code ~120KB source, far from the 2MB limit, **M1 needs no subpackaging**.
`lazyCodeLoading: requiredComponents` is on, injecting components on demand.

---

## 4. Data Model

### 4.1 Record Structure (unified, type-agnostic)

```js
{
  id: 'r_mg2k1a_x9f2',      // locally unique id (timestamp base36 + random)
  type: 'expense',           // key linking to recordTypes
  date: '2026-10-19',        // owning date, stats aggregate by this (string, avoids timezone pitfalls)
  time: '12:30',
  value: 38.5,               // primary value extracted from fields[primary.field], null means no value
  fields: {                  // type-specific fields, schema defined by recordTypes
    amount: 38.5, category: '餐饮', pay: '微信', note: '外卖'
  },
  note: '',
  deleted: false,            // soft delete, for M2 cloud sync incrementals
  createdAt: 1760000000000,
  updatedAt: 1760000000000
}
```

**Why redundantly store `value`**: stats and charts only read `value`, no need to hunt the primary field in `fields` per type each time. This is the key of the "unified record model" — **type differences are normalized at write time, the read side faces only one structure**.

### 4.2 Local Storage

| Key | Content | Notes |
|---|---|---|
| `life_log_records_v1` | Record array | Single-key limit 10MB, no pressure under ~50k records |
| `life_log_settings_v1` | Config object | Enabled modules, monthly budget, cloud sync toggle |

Beyond **3000 records**, recommend enabling cloud sync (M2), because `wx.getStorageSync` full deserialization starts to show perceptible latency.

### 4.3 D2 Cloud Dev Migration Mapping (M2 landed)

| Local | Cloud dev |
|---|---|
| `life_log_records_v1` array | Collection `records`, one doc per record (`_id` = record `id`) |
| Internal read/write in `services/record.js` | Still local write; after write, `services/sync.js` calls cloud function `records` to push incrementally |
| `life_log_settings_v1` | Not on cloud yet (re-enter env ID after device switch to restore sync) |
| No index | `records` compound index `openid` (asc) + `updatedAt` (asc), incremental pulls use this query |

Service layer public signatures (`add/update/remove/query/series`) unchanged, no page code changes — that's the point of layering.

### 4.4 Cloud Sync Protocol (v0.2.0)

```
client → cloud function records: { action:'sync', pushes:[...], lastSyncAt:Number }
cloud function → client:        { code:0, serverTime:Number, pushed:Number, pulls:[...] }
```

Four key designs:

1. **Dual watermark**: pull watermark uses **server time** (`lastSyncAt`), push watermark uses **client time** (`lastPushAt`). If merged into one, when the phone clock is slower than the server, new records would be permanently skipped (because `updatedAt < watermark`) and never pushed.
2. **Upsert natural dedup**: the cloud function uses record `id` as `_id` to write, records just pushed are merged back locally in the echo pull without duplication.
3. **Conflict last-write-wins**: single-user multi-device, larger `updatedAt` wins; keep local version when there are unpushed local updates ("push then pull" order guarantees this).
4. **Client never hits DB directly**: all reads/writes go through the cloud function + field whitelist, avoiding permission misconfigs that leak others' data.

---

## 5. Key Interaction Design

### 5.1 Three-Second Logging (core experience)

The pain point isn't "can I log it", it's "am I willing to log it". So:

1. Home module cards **enter that type's entry form directly on tap**, not "choose type" then "choose category"
2. The form has only **1-2 required fields** (expense: amount required, category has default; weight: just weight)
3. Date defaults to today, time to now, **saves without filling**
4. Return immediately after save, home `onShow` auto-refreshes

Measured path: open Mini Program → tap "Expense" → enter amount → save, **4 taps**.

### 5.2 Home Dashboard

Six cards, each answers one question:

- Expenses: how much today / how many today
- Weight: latest value / ↑↓ vs last time (the number you most want to see)
- Exercise: how long today / how many entries
- The rest similar

The metric card's subtitle is the **delta**, not the count — because weight's information is in "how much it changed", not "how many times logged".

### 5.3 Stats

- Event type: total / daily average / count / days with records
- Metric type: average / max / min / recorded days
- Bar chart: pure WXSS, **no ECharts** (ECharts mini-program build ~500KB compressed, not worth it for one trend chart)
- Distribution: uses the type's first picker field as dimension (expense=category, alcohol=type, exercise=item)

---

## 6. Tech Choices

| Item | Choice | Rationale |
|---|---|---|
| Framework | WeChat native | Single-person app, no cross-platform need; native has shortest debug path, smallest package |
| Storage | Local Storage first | Zero cost, zero filing, offline-capable, no privacy upload risk |
| Backend | Cloud dev (**M2 connected**, off by default) | No server, no filing, individual accounts eligible; M1 skips it to first validate "are you willing to log"; M2 connects it but off by default, local remains the only working copy |
| Charts | Pure WXSS | Saves 500KB package |
| tabBar | Text version (4 items) | iconPath not required, get it running first then add icons |

**Why M1 skips cloud**: a bookkeeping app's cause of death is never "no sync", it's "logged three days then stopped". First validate the habit with the lightest approach, then pay for cloud dev for the habit.

---

## 7. Milestones

| Stage | Content | Status |
|---|---|---|
| **M1** | 7 modules, dynamic form, home dashboard, timeline, stats, budget, export, clear | ✅ Done (runnable) |
| **M2 (cloud sync part)** | Cloud dev bidirectional incremental sync (cloud function `records` + `services/sync.js` dual watermark + Me page toggle) | ✅ Done (v0.2.0, off by default, needs env ID to enable) |
| M2 remainder | Subscription-message reminder (log at 21:30 daily) | Pending (needs user proactive subscription) |
| M3 | Custom types (user adds modules, registry already designed for it), Excel export, streak days, weekly report | Pending |
| M4 | Multiple ledgers / family sharing (needs permission model, architecture already reserved `ledgerId` extension in `records`) | Long-term |

---

## 8. Compliance Preconditions (must read before review)

> The following are design-stage predictions. **WeChat platform rules change, always defer to the latest official docs.**

| Item | Conclusion | Basis / official doc |
|---|---|---|
| Category | "Tools - Efficiency / Recording" category, individual accounts eligible, no extra qualification | [Category qualification](https://developers.weixin.qq.com/miniprogram/product/material/category.html) |
| Health data (weight/sleep) | Can do **recording & display**, but **must not output medical advice, diagnosis, or health risk scoring** (e.g. "your weight has reached obesity standard", "see a doctor"). Once health judgment is provided, medical qualification may be required | [Operation rules](https://developers.weixin.qq.com/miniprogram/product/reject.html) |
| Alcohol records | Personal recording only. **No alcohol product recommendations, purchase links, or brand promotion** — alcohol sales is a special category requiring qualification | Same as above |
| Bookkeeping | Pure personal bookkeeping tool (recording + stats) doesn't involve payment license. **Do not do**: multi-user shared accounts, fund pooling, escrow, lending matchmaking, split settlement — these touch the finance category | Same as above |
| Privacy | M1 collects no personal info (no phone, no location, no contacts), data stays on device. M2 if adding phone login + cloud sync, **must** configure the "User Privacy Protection Guide" and prompt for authorization before calling | [Privacy interfaces](https://developers.weixin.qq.com/miniprogram/dev/framework/open-ability/privacy.html) |
| Induced sharing | Sharing entry doesn't gate "share to see data / get reward" | Operation rules |

This project's M1 **calls no privacy APIs** (no `getLocation` / `getUserProfile` / `getPhoneNumber`), `app.json`'s `requiredPrivateInfos` is empty — the easiest form for review.

---

## 9. Known Trade-offs

| Trade-off | Impact | When to resolve |
|---|---|---|
| ~~Data local only~~ | ~~lost on device switch / cache clear~~ | ✅ M2 cloud sync resolved (off by default, manual enable) |
| No account system | Isolated automatically by WeChat `_openid`, no registration/login; but **cannot recover across WeChat accounts** | Expected, no fix |
| Metric type takes "last of the day" | Log weight twice a day, only the later counts | Expected, no fix |
| Cross-day backfill affects trend | Backfilling yesterday's weight makes yesterday's bar appear | Expected |
| Stats single-module dimension only | Can't see "is this month's exercise related to expenses" | M3 cross-analysis |
| No custom types | To log "medication" only via "Other" for now | M3 (registry reserved, only editor UI missing) |

---

## 10. Next Steps

1. Import this project in WeChat DevTools, **run with a test account first**, log for 3 days for real
2. Tell me after 3 days: which card you never look at, which field you always skip → cut it
3. Cloud sync is ready but **you must enable it manually**: switch to production AppID → enable cloud dev → deploy cloud function `records` → fill env ID in the Mini Program (steps in README "Cloud Sync Deployment Guide")
4. After that: M2's remaining subscription-message reminder, and M3's custom type editor UI
