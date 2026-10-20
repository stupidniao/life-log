# REQ-002 · Watering / Sunlight Due Reminders

> Status: shelved (decided at v0.3.0 review to split out of REQ-001, implementation deferred)
> Registered: 2026-10-20
> Prerequisite: REQ-001 delivered (plant archives & care plans in place)

---

## 1. Requirement Description

Remind the owner to water or move plants into the sun, per each plant's own cycle.

## 2. Why Deferred

WeChat's hard constraints cap what "timed reminders" can do:

- **Subscription messages are one-shot**: each user authorization only sends one message, quota runs out
- **Long-term subscription templates are not open to individual accounts**
- Templates must be chosen from the public template library in the backend; individual-account templates are limited, whether it's approved is uncertain

So most of the reminder value is in "see it as soon as you open the Mini Program", which depends on REQ-001's archives running first to build usage habit — no rush for the first version.

## 3. Design Memo (use directly on restart)

### Three Reminder Tiers

| Tier | Capability | Dependency |
|---|---|---|
| L1 | Due calculation: `next date = lastWateredAt + care.waterDays` | Pure local |
| L2 | Visible on open: home banner "N plants due for water", list highlights, detail todo bar | Pure local |
| L3 | Subscription-message push: cloud function timer trigger (daily 9:00) scans due plants, aggregates by openid and sends | Template ID + subscription quota, silently skip without quota |

Missing any tier doesn't affect the ones above; L3 is a bonus, not a prerequisite.

### Data Reservation (already buried in REQ-001)

- `care.waterDays` already exists in the archive (both AI and knowledge base give a value)
- Incremental additions needed at startup: `lastWateredAt`, `lastSunAt`, `care.sunDays` (0 = no direct-sun reminder), `reminder: {water, sun}` (per-plant toggle)

### Check-in Loop

Water/sunlight check-in → update archive date + write a `type: 'plant'` record (enters home card/timeline/stats, registry auto-adapts) → recompute next due date.

### Due Levels

```
remaining days d = next date - today
d > 1   ok       "N days until watering"
d = 1   soon     "water tomorrow"
d = 0   due      "water today"
d < 0   overdue  "N days overdue"
never   never    "no watering logged"
```

### Deployment Increment

- New cloud function `plantReminder` + timer trigger
- Env var `PLANT_TEMPLATE_ID`
- On check-in, call `wx.requestSubscribeMessage` to bank quota (must declare in privacy guide)

## 4. Restart Condition

After REQ-001 is used for two weeks and the archive data structure is confirmed stable (no field migration needed), start from "L1 + L2"; L3 depends on the template application result.
