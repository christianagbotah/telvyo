/** Local, rules-based insights. No model, carrier API, telemetry or network calls. */
import { summarize, validateRecord } from "./model.js";

const round = (value, digits = 6) => Number(value.toFixed(digits));
const number = (value) =>
  new Intl.NumberFormat("en", { maximumFractionDigits: 1 }).format(value);
const dayKey = (value) => {
  const date = new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
};
const startOfDay = (value) => {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
};
const sourceLabel = (source) =>
  source === "demo"
    ? "Demo sample data"
    : source === "manual"
      ? "Manually entered records"
      : `Recorded usage (${String(source)})`;
const rankedApps = (records) => {
  const totals = new Map();
  for (const record of records) {
    const name = record.app.trim();
    totals.set(name, (totals.get(name) ?? 0) + record.mb);
  }
  return [...totals]
    .map(([name, mb]) => ({ name, mb }))
    .sort((a, b) => b.mb - a.mb || a.name.localeCompare(b.name));
};

/**
 * Analyze the last seven completed LOCAL calendar days. daysObserved counts
 * days with records, not elapsed or verified-complete days. Missing dates are
 * unknown. Today's activity affects remaining balance only, never the baseline.
 * backgroundShare and topApp.percent are percentages from 0 to 100.
 * projectedDate is a local YYYY-MM-DD estimate, never a carrier expiry date.
 */
export function analyzeUsage(
  state,
  { simId = "all", now = Date.now(), source = "manual" } = {},
) {
  now = now instanceof Date ? now.getTime() : now;
  if (!Number.isFinite(now) || !Number.isFinite(new Date(now).getTime())) {
    throw new Error("A valid current time is required.");
  }
  const ledger = {
    ...state,
    sims: Array.isArray(state?.sims) ? state.sims : [],
    purchases: Array.isArray(state?.purchases) ? state.purchases : [],
    usage: Array.isArray(state?.usage) ? state.usage : [],
    calls: Array.isArray(state?.calls) ? state.calls : [],
  };
  const validUsage = ledger.usage.filter(
    (record) =>
      (simId === "all" || record?.simId === simId) &&
      validateRecord("usage", record, ledger, now) === null,
  );
  const today = startOfDay(now);
  const windowStart = new Date(today);
  windowStart.setDate(windowStart.getDate() - 7);
  const completed = validUsage.filter((record) => {
    const time = Date.parse(record.timestamp);
    return time >= windowStart.getTime() && time < today.getTime();
  });
  const byDay = new Map();
  for (const record of completed) {
    const key = dayKey(record.timestamp);
    const day = byDay.get(key) ?? { date: key, mb: 0, records: [] };
    day.mb += record.mb;
    day.records.push(record);
    byDay.set(key, day);
  }
  const days = [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date));
  const daysObserved = days.length;
  const hasEnoughHistory = daysObserved >= 3;
  const totalMB = completed.reduce((total, record) => total + record.mb, 0);
  const average = daysObserved ? totalMB / daysObserved : 0;
  const top = rankedApps(completed)[0];
  const topApp = top
    ? {
        name: top.name,
        mb: round(top.mb),
        percent: round((top.mb / totalMB) * 100, 2),
      }
    : null;
  const backgroundMB = completed.reduce(
    (total, record) => total + (record.background ? record.mb : 0),
    0,
  );
  const backgroundShare = totalMB
    ? round((backgroundMB / totalMB) * 100, 2)
    : 0;

  // Count only calendar dates since the earliest observed usage. Purchase dates
  // do not establish a usage observation, and gaps never enter the mean as zero.
  const earliest = validUsage.reduce(
    (first, record) => Math.min(first, Date.parse(record.timestamp)),
    Infinity,
  );
  let eligibleDays = 0;
  if (Number.isFinite(earliest)) {
    const first = startOfDay(Math.max(earliest, windowStart.getTime()));
    for (
      const day = new Date(first);
      day < today;
      day.setDate(day.getDate() + 1)
    )
      eligibleDays += 1;
  }
  const sortedTotals = days.map((day) => day.mb).sort((a, b) => a - b);
  const middle = Math.floor(sortedTotals.length / 2);
  const median = sortedTotals.length
    ? sortedTotals.length % 2
      ? sortedTotals[middle]
      : (sortedTotals[middle - 1] + sortedTotals[middle]) / 2
    : 0;
  const anomalies = hasEnoughHistory
    ? days
        .filter((day) => day.mb > 2 * median && day.mb - median > 100)
        .map((day) => ({
          date: day.date,
          mb: round(day.mb),
          baselineMB: round(median),
          ratio: round(day.mb / median, 2),
          app: rankedApps(day.records)[0]?.name ?? null,
        }))
    : [];

  const remaining = summarize(ledger, { simId, now }).dataRemainingMB;
  const forecast =
    hasEnoughHistory && average > 0 && remaining > 0
      ? remaining / average
      : null;
  const predictedTime = forecast === null ? NaN : now + forecast * 86400000;
  const canProject =
    Number.isFinite(predictedTime) &&
    Number.isFinite(new Date(predictedTime).getTime());
  const projectedDaysRemaining = canProject ? round(forecast) : null;
  const projectedDate = canProject ? dayKey(predictedTime) : null;
  const coverage = daysObserved
    ? `${daysObserved} of ${eligibleDays} completed local days have usage records`
    : `No completed local days have usage records (0 of ${eligibleDays})`;
  const coverageNote = `${sourceLabel(source)}. ${coverage} within the last 7 completed days, starting no earlier than the first usage entry. Today's partial day is excluded from the usage baseline. Missing days are unknown, not verified zero usage; even recorded days may be incomplete. Averages describe recorded days only. Forecasts use the ledger balance and assume the same recorded rate; they do not account for carrier expiry, billing rules or unrecorded activity.${simId === "all" && ledger.sims.length > 1 ? " Combined SIM forecasts are aggregate estimates; balances are not transferable between SIMs." : ""}`;
  const recommendations = [];
  if (!hasEnoughHistory || daysObserved < eligibleDays) {
    recommendations.push({
      id: "record-history",
      title: "Build a clearer usage history",
      detail:
        "Add complete daily usage records and compare them with your device settings. Missing entries cannot establish zero usage.",
      evidence: `${daysObserved} recorded completed ${daysObserved === 1 ? "day" : "days"} of ${eligibleDays} eligible days; at least 3 recorded completed days are needed for an estimate.`,
    });
  }
  if (topApp) {
    recommendations.push({
      id: "top-app",
      title: `Review ${topApp.name} data settings`,
      detail:
        "Try its data saver or lower media quality, and download on Wi-Fi when available. Savings depend on how you use the app.",
      evidence: `${topApp.name}: ${number(topApp.mb)} MB, ${number(topApp.percent)}% of recorded usage across ${daysObserved} completed days.`,
    });
  }
  if (backgroundMB > 0) {
    recommendations.push({
      id: "background",
      title: "Review background data permissions",
      detail:
        "Consider restricting background data for nonessential apps. This can delay messages and sync; the records alone cannot show which setting caused usage.",
      evidence: `${number(backgroundMB)} MB (${number(backgroundShare)}%) was marked as background usage in your records.`,
    });
  }
  if (anomalies.length) {
    const largest = [...anomalies].sort((a, b) => b.mb - a.mb)[0];
    recommendations.push({
      id: "review-spike",
      title: `Review the spike on ${largest.date}`,
      detail: `${largest.app ?? "The leading app"} had the largest recorded app total that day. Check downloads, streams and updates; these records cannot establish the cause.`,
      evidence: `${number(largest.mb)} MB was ${number(largest.ratio)}× the ${number(largest.baselineMB)} MB median across recorded completed days.`,
    });
  }
  if (projectedDaysRemaining !== null) {
    recommendations.push({
      id: "forecast",
      title: "Plan around your recorded usage rate",
      detail: `About ${number(projectedDaysRemaining)} days of data at this recorded pace. This is an estimate and does not establish when a carrier bundle expires.`,
      evidence: `${number(remaining)} MB ledger remainder ÷ ${number(average)} MB per recorded completed day.`,
    });
  }
  return {
    source,
    daysObserved,
    hasEnoughHistory,
    averageDailyMB: round(average),
    projectedDaysRemaining,
    projectedDate,
    topApp,
    backgroundShare,
    anomalies,
    recommendations,
    confidence: hasEnoughHistory ? "moderate" : "limited",
    coverageNote,
  };
}

/** Deterministic local replies to a small set of usage questions; never an LLM. */
export function generateAnswer(question, analysis) {
  const query = String(question ?? "")
    .trim()
    .toLowerCase();
  const prefix = `${sourceLabel(analysis.source)}: `;
  const limits =
    "This covers recorded completed days only; missing entries and partial records can change the result.";
  const top = analysis.topApp;
  const topSummary = top
    ? `${top.name} accounts for ${number(top.mb)} MB (${number(top.percent)}%) of recorded data across ${analysis.daysObserved} completed days.`
    : "There are no recorded completed-day usage entries in the last seven days to identify where data went.";

  if (/expir|billing|renew/.test(query)) {
    return `${prefix}I cannot determine carrier expiry dates or billing rules. A carrier API is not connected. Any remaining-days estimate describes the ledger balance at the recorded usage rate only.`;
  }
  if (/carrier|\bapi\b|\bmtn\b|telecel|\bcall\b|airtime|tariff/.test(query)) {
    return `${prefix}A carrier API is not connected, so I cannot verify current call rates, official balances or carrier charges. Your SIM settings may contain a manually entered call rate; check your carrier for the actual tariff.`;
  }
  if (/\bremaining\b|\bleft\b|how (many|long)|run out|last me/.test(query)) {
    if (analysis.projectedDaysRemaining === null) {
      return `${prefix}I cannot estimate remaining days without at least 3 recorded completed days, a positive recorded usage rate and a positive ledger balance. There are ${analysis.daysObserved} recorded completed days. Missing records do not mean zero usage.`;
    }
    return `${prefix}About ${number(analysis.projectedDaysRemaining)} days remain at ${number(analysis.averageDailyMB)} MB per recorded completed day, suggesting ${analysis.projectedDate}. This is a ledger estimate, not a carrier expiry date. ${limits}`;
  }
  if (/why|fast|quick|drain|spike|unusual/.test(query)) {
    const spike = analysis.anomalies[0];
    return `${prefix}${topSummary} The recorded daily average is ${number(analysis.averageDailyMB)} MB; ${number(analysis.backgroundShare)}% was marked as background usage.${spike ? ` On ${spike.date}, ${number(spike.mb)} MB was ${number(spike.ratio)}× the recorded-day median.` : ""} These records cannot establish the cause of faster usage. ${limits}`;
  }
  if (/save|reduce|less|conserv|recommend|advice|help/.test(query)) {
    const actionable = analysis.recommendations.filter(
      (item) => item.id !== "forecast",
    );
    return `${prefix}${actionable.map((item) => `${item.title}. ${item.detail} Evidence: ${item.evidence}`).join(" ")} ${limits}`;
  }
  if (
    /where|which.*app|top.*app|most.*data|data.*go|usage|data used/.test(query)
  ) {
    return `${prefix}${topSummary} ${limits}`;
  }
  return "I cannot answer that with this local, rules-based advisor. No generative AI model or API is configured. Ask where recorded data went, why the records show faster usage, how many days may remain, or how to save data.";
}
