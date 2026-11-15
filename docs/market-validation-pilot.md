# Telvyo market validation and purchase-value pilot (15 November 2026)

## Demand hypothesis and evidence

The Ghana National Communications Authority reports **30,800,194 mobile data subscriptions in July 2026** (90.23% penetration). These are **subscriptions, not distinct people**: users can have more than one SIM. Source: https://nca.org.gh/ (accessed 15 Nov 2026).

The NCA's Q3 2025 statistical bulletin recorded roughly 99% of mobile data subscriptions as prepaid. This suggests repeated purchase decisions, but **does not prove demand for Telvyo**. Source: https://nca.org.gh/wp-content/uploads/2026/01/Q3-2025-Statistical-Bulletin.pdf.

Competitors exist. The official **myMTN Ghana** Android app already advertises balances, account history, bundle purchases and airtime management. Independent Ghanaian bundle comparison services also exist. A manual balance tracker alone is not a defensible positioning. Source: https://play.google.com/store/apps/details?id=com.mtngh.mymtn.

**Hypothesis:** Ghanaian dual-SIM users with regular data purchases will keep using Telvyo if it shows where mobile money goes, compares *their actual historical purchase value* by SIM, highlights budget risk and delivers useful recommendations, with accurate separation of manual records, Android device measurement and officially verified carrier information.

**Unproven:** repeat engagement, actual savings, trust, willingness to pay, feasibility of all three carrier APIs, price accuracy/permissions and sustainable acquisition cost.

## Next pilot: human research, not speculative DAU claims

Recruit **50–100 voluntary Ghana-based participants** across MTN, Telecel, AT and dual-SIM Android phones, including students, workers and small business owners. Explain precisely what is recorded locally, and do **not** collect personal usage records or phone numbers without an appropriate consent process. Avoid implementing undisclosed analytics.

- Record opt-in, participant counts, SIM mix, Android versions and whether the user already checks network balances in official apps.
- Ask participants to complete SIM setup and log one historical purchase in under two minutes.
- Over a **14-day** pilot, observe voluntarily reported successful setup, week-two repeat usage, useful decisions and problems interpreting data. Do not infer missing usage equals zero.
- For people reporting savings, request **non-identifying** explanation of a specific choice, comparing previous and alternative bundle prices/validity at the time. Do not claim proven monetary savings from a forecast alone.
- Test value comparison, data alerts and clarity around the boundary between locally entered amounts and carrier-authoritative balances.
- Ask whether they would use Telvyo free, recommend it, buy bundles through an approved merchant, or pay for optional premium features. Record answers; do not assume positive responses imply actual payments.

### Internal decision thresholds (proposed, not industry benchmarks)

Proceed to wider **free beta** only if at least 50 users complete the pilot, **60%** of those can finish first-time setup independently, **30%** report voluntarily returning during the second week, and at least **20 specific useful decisions** are documented across the group. These are decision rules proposed for our pilot, **not results**. Evaluate complaint severity and Android permission failures as release blockers even if those thresholds pass.

Do not introduce a subscription price until at least one clear paid feature has been tested against users making real purchase decisions. Start with a free useful core and evaluate merchant/bundle transaction commissions only with approved partner terms; never promise savings or special carrier rates that are not verified.

## New feature in this iteration: historical bundle value

The Purchases screen calculates **amount paid per 1,000 MB of paid data allowance** per SIM, solely from locally logged, valid, in-period purchases. Zero-cost/complimentary data counts toward the user's recorded allowance but does not dilute paid unit prices. "Lowest recorded ₵/GB" appears only when two or more SIMs have paid bundles in the selected timeframe. The tracker never claims to show the current cheapest offer, carrier-verifiable price, expiry or monetary savings.

Before distribution, verify large-font and physical-phone layout, keyboard accessibility, date boundaries, refunds/bonus records, SIM switch behavior, and make sure the apparent "lowest cost" isn't mistaken for best validity, coverage, speed or offer eligibility.

## Next engineering priorities

1. Validate the native Android usage-consent experience across devices, with clear coverage of device measurement vs official SIM balances.
2. Complete secure customer sign-in and (later) independently authorized carrier-linked subscriber mapping before enabling cloud sync.
3. Obtain MTN's correction for the `401 invalid_client` production OAuth response; do not query subscribers until customer authorization is verified.
4. Investigate Telecel and AT access, and explore merchant APIs independently from subscriber data APIs.
5. Only after user validation, add opt-in bundle purchase optimization with **verified timestamped offer sources**, expiry, merchant fees, coverage notes and transaction safeguards.
