# Manual data-bundle expiry watch

Telvyo supports an **optional, manually entered expiry date/time** for each data-bundle purchase. Users should copy this information from the relevant carrier SMS, USSD receipt or official app rather than rely on Telvyo to infer it.

## User workflow

1. In **Purchases**, add a **Data bundle**, choose the SIM, enter allowance, amount paid and purchase date/time.
2. Optionally set **Recorded expiry** (local date/time) if the carrier provides it. The expiry must be strictly after the purchase date/time.
3. Save. The Purchases table shows the recorded expiry for that entry, and users can edit or clear it.
4. The Overview page displays an **in-app Bundle expiry watch** panel when an entered expiry is upcoming within **72 hours** or passed within the last **7 days**. The bell check-in also includes these notices. Alerts are evaluated when the app renders; there are **no background push notifications**.

The expiry timestamp is stored as ISO 8601 with a timezone and displayed using the device's local time in dd/mm/yyyy format. Existing purchases and old JSON backups without this field remain valid. CSV reports include a new `recorded_expiry` column immediately before the existing `source` column.

## Crucial source and balance limitations

- **These expiry values are supplied by the user, not MTN, Telecel or AT.** They do not establish a verified remaining balance, exact expiry, rollover policy, promotional bonus, eligibility or billing rate.
- The **recorded balance is deliberately not adjusted when a purchase expires**. A simple deduction would be misleading when customers hold overlapping bundles, bonus pools or different carrier consumption priorities. The app explicitly says this and tells users to confirm their balance with the network.
- Telvyo does not send a scheduled notification, read a network SMS, contact a network API or transmit the user-entered expiry to a Telvyo server.
- Airtime top-ups cannot have a recorded data-bundle expiry; the API model rejects it.
- Future carrier-linked expiry and authoritative balances require operator approval, verified subscriber authorization and reconciliation of real provider fields.

## Verification

`tests/expiry.test.mjs` covers missing/legacy expiry, input validation, purchase chronology, 72-hour and 7-day thresholds, SIM isolation, unchanged recorded balances and CSV compatibility. `tests/expiry-ui.test.mjs` covers UI reminders, alert visibility, editing/removing expiry, purchase preservation and disclaimers.

Before general release, test local timezone transitions, date display, keyboard/large-font accessibility, installed PWA updates and the Android WebView with real (consenting) test users. These tests are not a substitute for carrier access or physical-device QA.
