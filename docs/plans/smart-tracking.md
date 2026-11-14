# Telvyo connected tracking upgrade

User requests a yellow-led MTN-inspired theme with Telecel and AT accents, automatic SIM detection, real carrier billing and advanced AI readiness. User confirmed no carrier or AI access yet: prepare integrations and access requirements.

Implementation:
- Theme: warm ivory, charcoal, signal yellow, restrained red/blue. Accessible copy and responsive navigation.
- Android: runtime phone permission for active SIM metadata; Usage Access for NetworkStatsManager snapshots (Android 10+). Never infer per-SIM bytes from all-mobile measurements. No SMS/call log/IMSI/phone-number access.
- Web/native UI: Device connections page, honest capability states, detect SIMs after explicit permission action, OS measurement view separate from manual ledger, read on demand/foreground with freshness metadata.
- Insights: completed-day coverage, robust unusual-day detection, conditional depletion projections and on-device factual question responses. Clearly distinguish local analysis from generative AI.
- Server: approved MTN API adapter, JWT-authenticated and consent-gated aggregate-only AI endpoint, limits/timeouts, no public subscriber API without consent-to-account binding. Unconfigured services return unavailable status.
- Preserve existing records and exports. No real tariff defaults presented as carrier data.
- Verify unit/DOM/source contracts, compile Android if SDK available, native sync, secure source package, private Sites deployment.

Production release gates: provider approval and live contract tests, subscriber authorization/consent mapping, identity integration, signed builds and real-device testing, privacy/store review, operational monitoring. This work must not be described as production-certified while these are outstanding.
