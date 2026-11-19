# Health calculation rules

This document is the reference for how the Client Health and Project Risk Monitor decides
whether a project is **Healthy**, **At Risk** or **Critical**, and why.

- Thresholds live in [`server/src/config/rules.js`](../server/src/config/rules.js).
- The logic lives in [`server/src/engine/health.js`](../server/src/engine/health.js).
- Every rule below has unit tests in [`server/test/health.test.js`](../server/test/health.test.js).

If you change a threshold, update this document and the matching test.

## How it works

1. Each active project is checked against seven **rules** (R1–R7).
2. Each rule that triggers produces one or more **findings**. A finding has a **level** and a
   plain-English message. That message is the "reason" shown in the UI and in the weekly summary.

   | Level        | Meaning                                                     |
   | ------------ | ----------------------------------------------------------- |
   | **Watch**    | Worth knowing about; doesn't change the status by itself     |
   | **At Risk**  | Needs attention this week                                    |
   | **Critical** | Needs intervention now                                       |

3. The findings are **rolled up** into one status (see [Status roll-up](#status-roll-up)).
4. A **risk score** is calculated for ranking projects within a status.

Statuses are recalculated on every request from the current data. Nothing is cached, so a
status changes as soon as the underlying data changes.

### Conventions

- All date comparisons use **whole calendar days** (UTC). "Overdue by 1 day" means the due date
  was yesterday. An item due **today is not overdue**.
- "Incomplete" means `completedAt` is empty for milestones, `done` is false for checklist items,
  and `resolvedAt` is empty for blockers.
- Only **active** projects are assessed. Projects with `closed: true` or `status: "closed"` are excluded.

## Rules

### R1 — Overdue milestones

*One finding per incomplete milestone whose due date has passed.*

| Condition                                        | Level    |
| ------------------------------------------------ | -------- |
| Overdue by 1–7 days                              | At Risk  |
| Overdue by **8+ days**                           | Critical |
| **Key milestone** (`isKey`) overdue by **4+ days** | Critical |

Example: *Key milestone "Integration build complete" is 10 days overdue (due 2026-11-02, 70% complete)*

### R2 — Overdue checklist items

*One combined finding for all open checklist items past their due date.*

| Overdue items | Level    |
| ------------- | -------- |
| 1–2           | Watch    |
| 3–7           | At Risk  |
| 8+            | Critical |

Example: *3 checklist items overdue (oldest 9 days late)*

### R3 — Unresolved blockers

*One finding per open blocker.* The level starts from the blocker's severity. It goes up one
level (Watch → At Risk → Critical) once the blocker has been open for the escalation period.

| Severity | Starting level | Escalates after | Escalated level |
| -------- | -------------- | --------------- | --------------- |
| Low      | Watch          | 14 days         | At Risk         |
| Medium   | At Risk        | 10 days         | Critical        |
| High     | At Risk        | 5 days          | Critical        |

An unrecognised severity is treated as **medium**. Resolved blockers are ignored.

Example: *High-severity blocker "Carrier API sandbox credentials not provided" open for 8 days — exceeds escalation window*

### R4 — Missed activities

*One combined finding for activities (client meetings, status calls, workshops) with status
`missed` that were scheduled in the last **30 days**.*

| Missed in window | Level    |
| ---------------- | -------- |
| 1                | Watch    |
| 2–3              | At Risk  |
| 4+               | Critical |

### R5 — Rescheduled activities

*One combined finding for activities rescheduled in the last **30 days**.* The rule adds up
`rescheduleCount` across those activities. A reschedule falls in the window if
`lastRescheduledAt` is in the last 30 days. If that field is missing, `scheduledFor` is used instead.

| Condition                                         | Level   |
| ------------------------------------------------- | ------- |
| 2–3 reschedules in total                          | Watch   |
| 4+ reschedules in total                           | At Risk |
| Any single activity moved **3+ times**            | At Risk |

A single reschedule on its own doesn't trigger this rule. R5 never reaches Critical by itself.

### R6 — Upcoming deadlines

*One finding per incomplete milestone due in the next 14 days, including today.* Already-overdue
milestones are handled by R1 instead.

| Condition                                              | Level   |
| ------------------------------------------------------ | ------- |
| Due within 14 days                                     | Watch   |
| Due within **7 days** and less than **60%** complete   | At Risk |

### R7 — Time since last update

*Days since the most recent project update.* The last update is whichever is later: the newest
entry in the update log or the project's `lastUpdateAt` field.

| Days without an update | Level    |
| ---------------------- | -------- |
| 0–7                    | —        |
| 8–14                   | Watch    |
| 15–30                  | At Risk  |
| 31+                    | Critical |
| No update ever         | Critical |

## Status roll-up

Rules are applied in this order. The first one that matches decides the status:

| # | Condition                                    | Status       |
| - | -------------------------------------------- | ------------ |
| 1 | Any **Critical** finding                     | **Critical** |
| 2 | **3 or more** At Risk findings                | **Critical** |
| 3 | Any **At Risk** finding                      | **At Risk**  |
| 4 | **5 or more** Watch findings                  | **At Risk**  |
| 5 | Otherwise                                    | **Healthy**  |

Rows 2 and 4 cover projects with many smaller problems, which together warrant the higher status.
The status explanation always states which row applied. For example: *"3 At Risk findings
combined (threshold 3) escalate to Critical"*.

A Healthy project can still list Watch items. The UI shows them so the account owner can deal
with them early.

## Risk score

The risk score ranks projects within the same status. It never changes the status.

```
score = 3 × watch findings + 15 × at-risk findings + 45 × critical findings   (maximum 100)
```

Lists are sorted by status (Critical → At Risk → Healthy), then by risk score from highest to lowest.

## Account (client) health

An account's status is the **worst status among its active projects**. The account card lists
the projects behind that status and the top reason for each.

Account health is calculated only from the projects the viewer is allowed to see. A user with
access to only one of a client's projects sees an account status based on that project alone.

## Weekly summary

- **Period:** the Monday–Sunday week (UTC) that contains the generation date.
- **Movement:** each project's status is compared with the most recent earlier weekly snapshot.
  - **Escalated:** the status got worse.
  - **Improved:** the status got better.
  - **New:** the project wasn't in the earlier snapshot.

  A snapshot of every project's status is saved each time the scheduled weekly distribution runs.
- **Projects needing attention:** every At Risk or Critical project, each with up to three
  non-Watch reasons.
- **Most common risk drivers:** the number of projects with at least one At Risk or Critical
  finding from each indicator.

## Tuning without code changes

Set `HEALTH_RULES_FILE` to a JSON file containing only the values you want to change. The file
is deep-merged over the defaults. Example:

```json
{
  "staleUpdates": { "watchAfterDays": 6, "riskAfterDays": 11 },
  "status": { "criticalIfRiskFindingsAtLeast": 4 }
}
```
