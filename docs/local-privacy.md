# Local data privacy and erasure

Telvyo's present public tracker operates in **device-local mode**. Browser and native manual records are stored in the current browser/app's local storage, with demo records kept under a separate key. No customer sync, cloud account, live carrier balance or cloud AI endpoint is available in the public release.

## Erasing personal local data

In the **Personal workspace**, open **Settings → Privacy & local data → Erase my data**. Type `DELETE` exactly and submit. On success, the app removes its personal ledger storage key and clears personal data in memory and in-session device measurements. The view returns to empty SIM setup.

This operation removes from the *current browser/app workspace*:

- Personal SIM labels and profiles
- Manual purchases, usage entries and call records
- In-memory Android usage snapshots and scanned SIM information held by the Telvyo UI session

It does **not** delete:

- The separate sample/demo workspace
- Files exported or shared before deletion (CSV, JSON, email or system share copies)
- Android Phone permission and Usage Access (revoke those in Android Settings)
- Underlying mobile-network or MTN account records
- An external identity-provider account or cloud consent records, should those services become available in a future release
- Browser/operating-system archival copies or physical flash remnants, which are outside the app's control

On next launch, Android may detect permitted SIMs again if phone permissions remain enabled. The app should not claim to securely overwrite storage, revoke OS permissions, or delete external carrier data.

## Safety and verification

The delete action is distinct from **Reset records**, which intentionally leaves SIM profiles in place. It requires exact typed confirmation. An unsuccessful storage operation leaves the personal workspace intact, keeps the dialog open and displays an error instead of falsely reporting deletion.

Regression test: `tests/local-privacy.test.mjs` covers wrong confirmation, storage failure, successful deletion, demo isolation and disabled erasure in the demo workspace. Before external launch, manually confirm erasure and reload on Chrome, Safari, Android WebView and physical phones; ensure backups can restore after deletion.

Never automatically invoke this operation after a failed login, a carrier integration error, or a change in authentication state. User approval must precede removal.
