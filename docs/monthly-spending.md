# Optional monthly mobile spending budgets

Telvyo now supports a **monthly spending target per SIM** in Ghana cedis (₵). This is an optional budgeting tool based on **purchases recorded by the user**, not real-time carrier billing or a payment account.

## User workflow

1. Open **My SIMs**, select a SIM and click **Edit SIM**.
2. Enter a positive amount in **Monthly spending budget (₵, optional)**; leave it blank to disable the target. Legacy SIM profiles without this field remain valid.
3. Save. The Overview screen displays a **Monthly spending** panel when any selected SIM has a configured budget; the Purchases page always shows the monthly breakdown for the selected SIM(s), including a prompt when no target is configured.
4. View per-SIM progress. At **80%** of the configured limit, a caution appears; at **100%**, it indicates that the recorded budget was reached. In the personal workspace, the existing bell indicator reports spending warnings alongside daily data and manually recorded expiry reminders. Demo records never trigger a personal warning.
5. View the previous calendar month's recorded spending beside the current month's value. Monthly limits reset by **calendar month in the device's local timezone**, not by a rolling 30-day window; the Purchases page's day-range selector does not affect calendar-month totals.

## What is counted

- The **amount actually paid as entered in each valid, current-month data-bundle purchase**.
- The **amount paid as entered in each valid, current-month airtime top-up**.
- Complimentary purchases with a zero cost increase purchase count but not spending.
- **Calls are deliberately not added**, because prepaid call charges usually draw on airtime that was already counted when the user logged the top-up. Including both would double-count. Estimated call charges are also excluded.
- Invalid, stale, future-dated or nonmatching-SIM records are excluded. Previous-month totals are calculated independently from valid entries in the preceding local calendar month.
- No network purchases are imported without consent. Missing purchases and credits/refunds that have not been recorded make these figures incomplete; this release does not implement refund adjustments.

This is **not** a bank statement, carrier invoice, financial reconciliation, automatic payment restriction or officially verified expenditure. It does not block spending, send background push notifications, deduct purchases from a live wallet, or change MTN/Telecel/AT accounts.

## Data safety and compatibility

The optional `monthlySpendLimit` field is stored in the existing local SIM profile, validated before persistence, and survives the JSON backup/restore workflow. Unconfigured legacy SIMs and existing purchase records remain readable. Clearing the field disables that SIM's monthly target without deleting any purchases. Erasing local personal data also erases the target as part of the SIM profile.

Source is offline-first, with no additional external services, telemetry, carrier API calls or secrets. Customer cloud sync and official carrier-rated usage remain separately gated.

## Tests and release requirements

- `tests/monthly-spending.test.mjs`: legacy SIMs, validation, per-SIM spending, calendar-month rollover, 80/100% thresholds, previous month, invalid records, and no double counting.
- `tests/monthly-spending-ui.test.mjs`: Overview/Purchases views, alert bell, labelled progress, SIM filter, editing/clearing a target, demo isolation and retaining personal purchase history.
- Before general release: physical Android and browser UX at small screen sizes, large fonts, local timezones, accessibility, offline reload, and an opt-in pilot with users who understand that budget numbers are only as accurate as their manually entered purchases.

See [market validation pilot](market-validation-pilot.md), [bundle value comparison](market-validation-pilot.md) and [production readiness](production-readiness.md).
