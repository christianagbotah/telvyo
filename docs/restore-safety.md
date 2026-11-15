# Reviewed local backup restoration

Telvyo's public tracker is offline-first. This feature does **not** use a cloud account or send a backup to our servers. It improves the existing JSON backup **restore** workflow on web, PWA and the Android WebView shell.

## User workflow

1. Open **Settings → Your records → Restore a backup**.
2. Choose a Telvyo JSON backup for the current workspace (personal or demo). Backup mode labels must match; unknown or incorrect workspace labels are rejected. The file must be below 10 MB and contain a valid Telvyo v1 ledger with at most 2 SIM profiles and valid, unique records.
3. Review the **Local vs Backup** comparison table. For each category (SIM profiles, purchases, data usage and calls), the screen shows counts on device and in the backup, and counts of **added (+), removed (−) and changed (~)** entries. Differences are based on record IDs and record contents.
4. The operation is deliberately **Replace, not Merge**. It is never an automatic cloud merge and does not identify which individual edits should win. The user must type `RESTORE` exactly before choosing **Replace my local data**. Cancel leaves the original records untouched.
5. Telvyo verifies that it is still the same workspace and state that was displayed during preview. If records changed before confirmation, the user must select and review the backup again.
6. The app writes the replacement to local storage **before changing in-memory data** and checks the stored value. A storage failure leaves the active in-memory records unchanged and reports an error. If storage accepted a write but readback failed, the app attempts to restore the previously saved value; if rollback cannot be verified, it warns the user to export current records before closing or reloading.

The independent demo workspace is never replaced when restoring a personal backup, or vice versa. Existing exported files, Android OS permissions, carrier accounts and other devices are not changed by a local restore.

## Important limitations and next steps

This preview shows counts and record IDs only; it does not inspect carrier-authoritative data, prove that a backup is genuine, or provide a merge of two conflicting devices. Changes are local and irreversible unless the user retained an earlier backup. Do not claim that backup contents were validated by the mobile operator.

This UX is a prerequisite for eventual explicit cloud-sync conflict resolution, but it is **not** the cloud sync interface. The private, signed-JWT, consent-gated encrypted sync backend is not currently connected to the public tracker. Real account sign-in, a compliant consent flow and user-controlled cloud conflict decisions remain separate release gates.

Tests: `tests/restore-review.test.mjs` checks the preview counts, invalid typing, persistent storage failure, readback verification rollback, personal/demo isolation, and unknown or mismatched workspace handling. Test browser file-picker accessibility, large fonts, real Android WebView behavior, offline restoration and file-sharing permissions on physical devices before broad release.
