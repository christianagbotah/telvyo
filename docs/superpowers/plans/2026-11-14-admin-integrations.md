# Telvyo Admin Integration Setup Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development or superpowers:executing-plans.

**Goal:** Publish an owner admin page for secure runtime-secret setup and MTN connection readiness.
**Architecture:** Sites sign-in plus owner allowlist protects Worker routes; native Sites Settings owns credential storage, R2 holds only check metadata; ASSETS preserves static tracker and downloads.
**Tech Stack:** ES modules, Web APIs, Vite/Cloudflare/Sites plugin, R2, Node tests and jsdom.
**Spec:** `docs/superpowers/specs/2026-11-14-admin-integrations-design.md`

## Global Constraints
- Same Site ID, current audience, URL, saved tracker records and native IDs.
- No credentials in browser requests/storage, downloads, responses or logs.
- Fail closed on missing owner configuration or storage.
- Authentication checks do not establish subscriber/product approval.

## Review Focus
- Wrong-owner and service-only callers rejected on every admin path.
- Cross-origin and simultaneous test requests cannot cause duplicate provider checks.
- Failed or changed credentials cannot display stale successful authentication.
- Sandbox/API-key configurations remain unverified until their exact API is supported.
- Static app and download routes retain their prior behavior.

### Task 1: Protected status and test API
Files: worker/admin.js, tests/admin.test.mjs.
- [x] Write failing tests for identity, missing config, secret redaction, CSRF, cooldown and provider failures.
- [x] Implement createAdminHandler and authorizeAdmin; R2 stores only check metadata.
- [x] Verify targeted tests and independent review.

### Task 2: Owner dashboard
Files: admin/index.html, admin/admin.css, admin/admin.js, tests/admin-ui.test.mjs.
- [x] Write UI tests for loading, sign-in, configuration flags and honest test outcomes.
- [x] Implement responsive status dashboard and Sites Settings instructions; no secret-input fields.
- [x] Verify targeted tests.

### Task 3: Hosting and publication
Files: worker/index.js, vite.config.js, scripts, .openai/hosting.json, docs.
- [x] Build Worker with ASSETS and preserved static files; configure owner email as a runtime secret.
- [x] Run full tests, asset preservation checks and security review.
- [ ] Push exact commit, package, publish same Site and report admin URL plus live-testing limits.
