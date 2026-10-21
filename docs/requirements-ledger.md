# Requirements Ledger

> Mechanism: register each requirement with an ID here first → write the design doc (`docs/requirements/REQ-XXX-*.md`) → start only after review passes → backfill the landing version after delivery.
> Status: pending-review / in-design / in-development / delivered / shelved
> Convention: one requirement maps to one independently-explainable feature loop; scope changes (cut/add) must be written back to that requirement's design doc, no verbal agreements left.

## Registered Requirements

| ID | Registered | Requirement | Status | Landing version | Design doc |
|---|---|---|---|---|---|
| REQ-001 | 2026-10-20 | Plant care · photo registration & care advice | Delivered | v0.3.0 | [REQ-001-plant-care-photo-registration-and-advice](requirements/REQ-001-plant-care-photo-registration-and-advice.md) |
| REQ-002 | 2026-10-20 | Watering / sunlight due reminders | Shelved | — | [REQ-002-watering-and-sunlight-reminders](requirements/REQ-002-watering-and-sunlight-reminders.md) |
| REQ-003 | 2026-10-20 | Plant archive cloud sync (cross-device, incl. photos) | Delivered | v0.3.1 | [REQ-003-plant-archive-cloud-sync](requirements/REQ-003-plant-archive-cloud-sync.md) |
| REQ-004 | 2026-10-20 | Plant recognition correction (re-query by corrected name) | Delivered | v0.4.0 | [REQ-004-plant-recognition-correction](requirements/REQ-004-plant-recognition-correction.md) |

## Historical Requirements (backfilled)

This mechanism was established during v0.3.0 development; previously shipped features are backfilled below, design details in `docs/design.md`:

| ID | Requirement | Landing version |
|---|---|---|
| REQ-000a | Life-logging core: type registry + five pages + local storage | v0.1.0 / v0.1.1 |
| REQ-000b | Cloud dev bidirectional incremental sync (dual watermark + debounce) | v0.2.0 |

## Version ↔ Requirement Mapping

| Version | Date | Requirements |
|---|---|---|
| v0.1.0 | 2026-10-19 | REQ-000a |
| v0.1.1 | 2026-10-19 | REQ-000a (review fixed 6 issues) |
| v0.2.0 | 2026-10-19 | REQ-000b |
| v0.3.0 | 2026-10-20 | REQ-001 (53 unit tests green) |
| v0.3.1 | 2026-10-20 | REQ-003 (plant archive cloud sync, 61 unit tests green) |
| v0.4.0 | 2026-10-20 | REQ-004 (plant recognition correction, 69 unit tests green) |
