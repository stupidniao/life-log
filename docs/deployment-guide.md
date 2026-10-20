# Deployment Guide · Riji

> From "runs locally" to "others can find it in WeChat", four stages in total.
> WeChat platform rules change, anything involving specific entry paths or qualification requirements **defers to the latest official pages**.

---

## Choose a Route First

| Route | What you get | What you need | Time |
|---|---|---|---|
| **A. Local personal use** | Visible only in DevTools + your own phone | None (tourist AppID is enough) | 10 min, done |
| **B. Trial version** | You and up to a dozen friends can use long-term | Register a Mini Program to get a production AppID | Half a day |
| **C. Official release** | Searchable in WeChat, usable by anyone | B + pass review | 1-3 days (review time varies) |

**Cloud sync is an independent toggle**, any route can choose to enable or disable it, doesn't affect whether you can deploy.

---

## Route A: Local Personal Use (already executable)

1. WeChat DevTools → Import project → choose the `riji-life-log/` directory
2. At AppID, click "Tourist AppID" (`project.config.json` already has `touristappid`)
3. Compile → usable in the simulator
4. To use on phone: click "Preview" in toolbar → scan with phone WeChat → opens a **temporary preview**

**Limits**: the preview disappears once closed, and the tourist AppID **cannot enable cloud dev**, cannot upload versions. Good for "log a few days to see if it fits".

---

## Route B: Trial Version (recommended first)

### B1. Register a Mini Program account, get AppID

1. Open https://mp.weixin.qq.com → register now → choose "Mini Program"
2. Prepare:
   - **An email never used for an official account / Mini Program** (the most common blocker; used emails won't work)
   - ID info + your own WeChat scan verification
   - Phone number
3. After registration: backend left side "Settings → Basic Settings" shows the **AppID**, copy it
4. One ID can register up to 5 Mini Programs; individual accounts **cannot** enable WeChat Pay

> If the name "Riji" is taken, the backend will prompt, just change it. The name can be modified later (limited times per year).

### B2. Fill the AppID into the project

Two ways, either works:

- **Way one (recommended)**: DevTools → top-right "Details" → "Basic Info" → change AppID to yours → the tool writes to `project.private.config.json` (this file is ignored by `.gitignore`, won't pollute the repo)
- **Way two**: directly edit the `"appid"` field in `project.config.json` (committed to repo; when the repo is public the AppID is visible — AppID is not a secret, low risk)

### ⚠️ Switching AppID loses old data

`wx.setStorageSync` data is **isolated by AppID**. Records logged under the tourist `touristappid` are invisible after switching to the production AppID.

**So: if you logged real data during testing, back up before switching.**

Currently the app only has "export to clipboard", **no import feature** — the exported JSON can't be re-imported after switching AppID. Two options:

- Simple: only log test data before official release, don't log real ones
- Or tell me, and I'll add an "import JSON from clipboard" button to the Me page (~half an hour)

### B3. Upload the trial version

1. DevTools → top-right "Upload" → fill version number (e.g. `0.2.0`) and project notes
2. Mini Program backend → "Manage → Version Management" → find the uploaded dev version → click "Set as trial version"
3. Same page "Member Management" → add trial members (WeChat IDs), they can use it by scanning
4. The trial version **doesn't expire**, good for long-term personal use, also good for friends to try

**The trial version needs no review**, but only trial members can use it, not searchable in WeChat.

---

## Cloud Dev Deployment (optional, works with trial version)

**Fully usable without enabling cloud sync**, data stored locally. After enabling, switching phones syncs, deleting the Mini Program doesn't lose data.

Prerequisite: must be a **production AppID** (tourist AppID can't enable cloud dev).

1. DevTools top toolbar click "Cloud Dev" → enable → create environment (any name, e.g. `life-log-prod`) → note the **environment ID** (like `life-log-3gk2xxxxxx`)
2. Cloud dev console → "Database" → create collection **`records`**, keep default "creator read/write only" permission
3. Same page "Index Management" → add index: `openid` asc + `updatedAt` asc (two fields, compound index)
4. Back in DevTools, find `cloudfunctions/records` in the left file tree → **right-click → "Upload and Deploy: Cloud Install Dependencies"**
5. Wait for deployment (console shows `records` function, status normal)
6. Open the Mini Program → "Me → Cloud Sync" → fill environment ID → toggle on

First enable pushes all historical records up, the bottom shows the pushed count.

**Verify**: cloud dev console → Database → your records should appear in the `records` collection, each with `_openid`.

**Cost**: free quota, beyond that bills by usage. A personal scale of a few dozen records a day normally won't exceed it. Defer to the official pricing page.

---

## Route C: Submit Review, Release

### C1. Must configure before review

| Item | Location | Notes |
|---|---|---|
| Service category | Backend "Settings → Basic Settings → Service Category" | Choose **Tools → Efficiency/Office**. Individual accounts eligible, no qualification. **Don't** choose finance or medical/health, those require qualification |
| User privacy protection guide | Backend "Settings → Service Content Declaration → User Privacy Protection Guide" | This project calls no privacy APIs, choose "collects no user info", but **must fill it**, can't submit without it |
| Server domain | Backend "Dev → Dev Management → Server Domain" | This project uses no external requests, **leave empty**. Cloud dev needs no config either (goes through WeChat internal channel) |

### C2. Upload and submit

1. DevTools "Upload" → version `1.0.0`, notes clearly state the update content
2. Backend "Version Management" → dev version → "Submit for Review"
3. Review form:
   - Feature pages: check all 5 pages
   - Test account: this project needs no login, choose "no login needed"
   - Supplementary notes: write "Personal life-logging tool, all data stored only on the user's phone / user's own cloud dev environment, no transactions, no personal info collected"
4. Review usually takes hours to days, rejection explains the reason, fix and resubmit

### C3. Release

Review passed → backend "Version Management" → "Release" → full release. Then searchable in WeChat by name.

---

## Review Checklist (checked against this project)

- [x] No payment, no fund pooling, no multi-party split
- [x] Weight/sleep only recording & numeric display, **no output** of health judgments like "you're overweight" or "see a doctor"
- [x] Alcohol module has no alcohol product recommendations, purchase links, or brand promotion
- [x] No privacy APIs (no location, no phone, no contacts)
- [ ] Service category set to "Tools → Efficiency"
- [ ] User privacy protection guide filled
- [ ] Every page has an empty state, no white screen (home empty state is currently just one line, plain but acceptable)
- [ ] tabBar is currently **text-only** (`iconPath` empty). Passes review, but recommend adding icons, big visual difference

## Common Rejection Reasons (ranked by this project's risk)

| Rejection reason | Trigger | How to fix |
|---|---|---|
| Category doesn't match function | Chose finance / medical-health category | Change back to "Tools → Efficiency" |
| Provided health advice | Weight page shows wording like "overweight" or "watch your diet" | Keep only numbers, delete all evaluative wording |
| Involves alcohol business | Purchase entry or brand name appears | Only record categories like "beer/red wine", no products |
| Privacy guide not filled | Backend missed it | Fill it |
| Incomplete function / white screen | No first-launch onboarding, empty page with no data | Empty state exists, if rejected add first-launch onboarding |
| Induced sharing | Share for reward | This project has no sharing feature |

---

## One Diagram to Remember the Order

```
Run locally (tourist AppID)
   ↓
Register Mini Program → get AppID → fill into project
   ↓                    ↘
(optional) enable cloud dev → deploy cloud function → fill env ID, enable sync
   ↓
Upload → set as trial version → use yourself & friends
   ↓
Submit review → pass → release → searchable in WeChat
```

## Current Only Technical Debt

**No JSON import feature** — switching AppID makes old data unreadable, and the exported JSON can't be re-imported. Recommend adding it before logging real data (half an hour's work).
