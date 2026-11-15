/** Pure manual usage ledger. Balances are estimates from the records provided. */
const COLLECTIONS = {
  purchase: "purchases",
  usage: "usage",
  call: "calls",
  sim: "sims",
};
const isNumber = (value) => typeof value === "number" && Number.isFinite(value);
const positive = (value) => isNumber(value) && value > 0;
const nonnegative = (value) => isNumber(value) && value >= 0;
const validName = (value) =>
  typeof value === "string" &&
  value.trim().length > 0 &&
  value.trim().length <= 80;
const round = (value, digits = 2) => {
  const scale = 10 ** digits;
  return (
    (Math.sign(value) *
      Math.round((Math.abs(value) + Number.EPSILON) * scale)) /
    scale
  );
};
const sum = (records, key) =>
  records.reduce((total, record) => total + record[key], 0);

function timestampValue(value) {
  if (typeof value !== "string") return NaN;
  const parts =
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/.exec(
      value,
    );
  if (!parts) return NaN;
  const [, year, month, day, hour, minute, second, zone] = parts;
  const daysInMonth = new Date(
    Date.UTC(Number(year), Number(month), 0),
  ).getUTCDate();
  if (
    +month < 1 ||
    +month > 12 ||
    +day < 1 ||
    +day > daysInMonth ||
    +hour > 23 ||
    +minute > 59 ||
    +second > 59
  )
    return NaN;
  if (zone !== "Z" && (+zone.slice(1, 3) > 23 || +zone.slice(4, 6) > 59))
    return NaN;
  return Date.parse(value);
}

function validClock(now) {
  const value = now instanceof Date ? now.getTime() : now;
  if (!isNumber(value) || !Number.isFinite(new Date(value).getTime()))
    throw new Error("A valid current time is required.");
  return value;
}

function dayCount(days) {
  return Number.isInteger(days) && days > 0 ? days : 7;
}

function dayKey(value) {
  const date = new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function firstDay(now, days) {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - dayCount(days) + 1);
  return start;
}

export function createEmpty() {
  return {
    version: 1,
    sims: [
      {
        id: "mtn",
        carrier: "MTN",
        label: "Personal",
        slot: 1,
        color: "#FFCC00",
        rate: 0.25,
        dailyLimitMB: 1500,
      },
      {
        id: "telecel",
        carrier: "Telecel",
        label: "Work",
        slot: 2,
        color: "#E60000",
        rate: 0.2,
        dailyLimitMB: 750,
      },
    ],
    purchases: [],
    usage: [],
    calls: [],
  };
}

export function createDemo(now = Date.now()) {
  now = validClock(now);
  const state = createEmpty();
  const at = (offset, hour, minute = 0) => {
    const date = new Date(now);
    date.setDate(date.getDate() + offset);
    date.setHours(hour, minute, 0, 0);
    return new Date(Math.min(date.getTime(), now)).toISOString();
  };
  state.purchases = [
    {
      id: "demo-p1",
      simId: "mtn",
      type: "data",
      amount: 10000,
      cost: 60,
      timestamp: at(-6, 6),
    },
    {
      id: "demo-p2",
      simId: "telecel",
      type: "data",
      amount: 5000,
      cost: 35,
      timestamp: at(-6, 6, 5),
    },
    {
      id: "demo-p3",
      simId: "mtn",
      type: "airtime",
      amount: 30,
      cost: 30,
      timestamp: at(-6, 6, 10),
    },
    {
      id: "demo-p4",
      simId: "telecel",
      type: "airtime",
      amount: 20,
      cost: 20,
      timestamp: at(-6, 6, 15),
    },
    {
      id: "demo-p5",
      simId: "mtn",
      type: "airtime",
      amount: 10,
      cost: 10,
      timestamp: at(-2, 9),
    },
  ];
  const apps = [
    "YouTube",
    "WhatsApp",
    "Instagram",
    "TikTok",
    "Chrome",
    "Spotify",
    "Other",
  ];
  const shares = [0.34, 0.08, 0.19, 0.2, 0.08, 0.07, 0.04];
  const dailyTotals = [980, 1260, 880, 1740, 1320, 1680, 1140];
  dailyTotals.forEach((total, day) => {
    apps.forEach((app, index) => {
      state.usage.push({
        id: `demo-u${day}-${index}`,
        simId: (day + index) % 3 === 0 ? "telecel" : "mtn",
        app,
        mb: round(total * shares[index], 1),
        background: app === "Other" || (app === "WhatsApp" && day % 2 === 0),
        timestamp: at(day - 6, 9 + index, index * 3),
      });
    });
    const simId = day % 3 === 0 ? "telecel" : "mtn";
    const duration = [184, 420, 87, 253, 138, 312, 146][day];
    const rate = state.sims.find((sim) => sim.id === simId).rate;
    state.calls.push({
      id: `demo-c${day}`,
      simId,
      contact: [
        "Ama Mensah",
        "Mum",
        "Kwame",
        "Office",
        "Kofi",
        "Ama Mensah",
        "Mum",
      ][day],
      duration,
      cost: callCharge(duration, rate),
      estimated: true,
      timestamp: at(day - 6, 11, 20),
    });
  });
  return state;
}

export function validateRecord(kind, record, state, now = Date.now()) {
  if (!Object.hasOwn(COLLECTIONS, kind)) return "Choose a valid record type.";
  if (!record || typeof record !== "object" || Array.isArray(record))
    return "A record is required.";
  if (!validName(record.id))
    return "A record ID is required and must be at most 80 characters.";
  const sims = Array.isArray(state?.sims) ? state.sims : [];
  if (kind === "sim") {
    if (!validName(record.carrier))
      return "Enter a carrier name of up to 80 characters.";
    if (!validName(record.label))
      return "Enter a SIM label of up to 80 characters.";
    if (record.slot !== 1 && record.slot !== 2)
      return "Choose SIM slot 1 or 2.";
    if (sims.some((sim) => sim.id !== record.id && sim.slot === record.slot))
      return "That SIM slot is already in use.";
    if (
      typeof record.color !== "string" ||
      !/^#[0-9a-f]{6}$/i.test(record.color)
    )
      return "Choose a valid SIM color.";
    if (!nonnegative(record.rate))
      return "The call rate must be a finite number of zero or more.";
    if (!positive(record.dailyLimitMB))
      return "The daily data limit must be greater than zero.";
    return null;
  }
  if (!sims.some((sim) => sim.id === record.simId))
    return "Choose an existing SIM.";
  const timestamp = timestampValue(record.timestamp);
  const clock = now instanceof Date ? now.getTime() : now;
  if (!Number.isFinite(timestamp)) return "Enter a valid date and time.";
  if (!isNumber(clock) || timestamp > clock)
    return "The date and time cannot be in the future.";
  if (kind === "purchase") {
    if (record.type !== "data" && record.type !== "airtime")
      return "Choose data or airtime.";
    if (!positive(record.amount))
      return "The purchased amount must be greater than zero.";
    if (!nonnegative(record.cost))
      return "The purchase cost must be a finite number of zero or more.";
  } else if (kind === "usage") {
    if (!validName(record.app))
      return "Enter an app name of up to 80 characters.";
    if (!positive(record.mb)) return "Data used must be greater than zero.";
    if (typeof record.background !== "boolean")
      return "Choose whether this was background usage.";
  } else if (kind === "call") {
    if (!validName(record.contact))
      return "Enter a contact or number of up to 80 characters.";
    if (!positive(record.duration))
      return "The call duration must be greater than zero.";
    if (!nonnegative(record.cost))
      return "The call cost must be a finite number of zero or more.";
    if (typeof record.estimated !== "boolean")
      return "Specify whether the call cost is estimated.";
  }
  return null;
}

export function addRecord(state, kind, record, now = Date.now()) {
  const error = validateRecord(kind, record, state, now);
  if (error) throw new Error(error);
  const collection = COLLECTIONS[kind];
  if (kind !== "sim" && state[collection].some((item) => item.id === record.id))
    throw new Error("A record with this ID already exists.");
  const next = {
    version: state.version,
    sims: state.sims.map((item) => ({ ...item })),
    purchases: state.purchases.map((item) => ({ ...item })),
    usage: state.usage.map((item) => ({ ...item })),
    calls: state.calls.map((item) => ({ ...item })),
  };
  const clean = { ...record };
  for (const key of ["app", "contact", "carrier", "label"]) {
    if (typeof clean[key] === "string") clean[key] = clean[key].trim();
  }
  const index =
    kind === "sim" ? next.sims.findIndex((sim) => sim.id === record.id) : -1;
  if (index >= 0) next.sims[index] = clean;
  else next[collection].push(clean);
  return next;
}

export function filterRecords(
  records,
  { simId = "all", days = 7, now = Date.now() } = {},
) {
  now = validClock(now);
  const start = firstDay(now, days).getTime();
  return (Array.isArray(records) ? records : []).filter((record) => {
    const timestamp = timestampValue(record?.timestamp);
    return (
      (simId === "all" || record?.simId === simId) &&
      timestamp >= start &&
      timestamp <= now
    );
  });
}

export function summarize(
  state,
  { simId = "all", days = 7, now = Date.now() } = {},
) {
  now = validClock(now);
  days = dayCount(days);
  const selected = state.sims.filter(
    (sim) => simId === "all" || sim.id === simId,
  );
  const valid = (kind) =>
    state[COLLECTIONS[kind]].filter(
      (record) =>
        (simId === "all" || record.simId === simId) &&
        validateRecord(kind, record, state, now) === null,
    );
  const allPurchases = valid("purchase");
  const allUsage = valid("usage");
  const allCalls = valid("call");
  const options = { simId, days, now };
  const purchases = filterRecords(allPurchases, options);
  const usage = filterRecords(allUsage, options);
  const calls = filterRecords(allCalls, options);
  let dataRemainingMB = 0;
  let airtimeBalance = 0;
  for (const sim of selected) {
    const ownPurchases = allPurchases.filter(
      (record) => record.simId === sim.id,
    );
    const dataBought = sum(
      ownPurchases.filter((record) => record.type === "data"),
      "amount",
    );
    const dataUsed = sum(
      allUsage.filter((record) => record.simId === sim.id),
      "mb",
    );
    dataRemainingMB += Math.max(0, dataBought - dataUsed);
    airtimeBalance +=
      sum(
        ownPurchases.filter((record) => record.type === "airtime"),
        "amount",
      ) -
      sum(
        allCalls.filter((record) => record.simId === sim.id),
        "cost",
      );
  }
  const dataUsedMB = round(sum(usage, "mb"), 6);
  const appTotals = new Map();
  for (const record of usage) {
    const app = record.app.trim();
    const total = appTotals.get(app) ?? { app, mb: 0, backgroundMB: 0 };
    total.mb += record.mb;
    if (record.background) total.backgroundMB += record.mb;
    appTotals.set(app, total);
  }
  const appUsage = [...appTotals.values()]
    .map((item) => ({
      ...item,
      mb: round(item.mb, 6),
      backgroundMB: round(item.backgroundMB, 6),
      percent: dataUsedMB ? round((item.mb / dataUsedMB) * 100, 2) : 0,
    }))
    .sort((a, b) => b.mb - a.mb || a.app.localeCompare(b.app));
  const byDay = new Map();
  usage.forEach((record) => {
    const key = dayKey(record.timestamp);
    byDay.set(key, (byDay.get(key) ?? 0) + record.mb);
  });
  const daily = [];
  const day = firstDay(now, days);
  for (let i = 0; i < days; i += 1) {
    const date = dayKey(day);
    daily.push({
      date,
      label: day.toLocaleDateString("en-GB", { weekday: "short" }),
      mb: round(byDay.get(date) ?? 0, 6),
    });
    day.setDate(day.getDate() + 1);
  }
  return {
    dataUsedMB,
    dataRemainingMB: round(dataRemainingMB, 6),
    airtimeBalance: round(airtimeBalance),
    purchaseSpend: round(sum(purchases, "cost")),
    callSpend: round(sum(calls, "cost")),
    callCount: calls.length,
    callSeconds: round(sum(calls, "duration"), 6),
    appUsage,
    daily,
    usage,
    calls,
    purchases,
  };
}

/**
 * In-app daily budget check based ONLY on validated, manually logged usage.
 * This is not carrier-rated consumption, a push notification or a SIM-specific
 * Android network measurement.
 */
/**
 * Compare the amounts this user recorded paying for data bundles on each SIM.
 * This is a historical purchase-ledger calculation, not a current network
 * price quote, bundle validity check, or recommendation to switch networks.
 * Complimentary purchases are kept in the allowance count but EXCLUDED
 * from the paid-price-per-GB metric to avoid misleading dilution.
 */
export function compareBundlePurchases(
  state,
  { days = 30, simId = "all", now = Date.now() } = {},
) {
  now = validClock(now);
  const chosenDays = dayCount(days);
  const sims = (Array.isArray(state?.sims) ? state.sims : [])
    .filter((sim) => simId === "all" || sim.id === simId);
  const ledger = {
    ...state,
    sims: Array.isArray(state?.sims) ? state.sims : [],
    purchases: Array.isArray(state?.purchases) ? state.purchases : [],
    usage: Array.isArray(state?.usage) ? state.usage : [],
    calls: Array.isArray(state?.calls) ? state.calls : [],
  };
  const start = firstDay(now, chosenDays).getTime();
  const purchases = ledger.purchases.filter((record) => {
    const timestamp = timestampValue(record?.timestamp);
    return record?.type === "data" &&
      timestamp >= start && timestamp <= now &&
      (simId === "all" || record.simId === simId) &&
      validateRecord("purchase", record, ledger, now) === null;
  });
  const rows = sims.map((sim) => {
    const own = purchases.filter((record) => record.simId === sim.id);
    const paid = own.filter((record) => record.cost > 0);
    const complimentary = own.filter((record) => record.cost === 0);
    const paidMB = sum(paid, "amount");
    const freeMB = sum(complimentary, "amount");
    const spent = sum(paid, "cost");
    return {
      simId: sim.id,
      carrier: sim.carrier,
      slot: sim.slot,
      label: sim.label,
      purchases: own.length,
      paidPurchases: paid.length,
      complimentaryPurchases: complimentary.length,
      purchasedMB: round(paidMB + freeMB, 6),
      paidMB: round(paidMB, 6),
      complimentaryMB: round(freeMB, 6),
      spent: round(spent),
      costPerGB: paidMB > 0 && spent > 0
        ? round(spent * 1000 / paidMB)
        : null,
    };
  });
  const comparable = rows.filter((row) => row.costPerGB !== null);
  const lowest = comparable.length >= 2
    ? Math.min(...comparable.map((row) => row.costPerGB))
    : null;
  return {
    days: chosenDays,
    rows: rows.map((row) => ({
      ...row,
      lowestRecorded: lowest !== null && row.costPerGB === lowest,
    })),
    totalSpent: round(rows.reduce((total, row) => total + row.spent, 0)),
    totalPurchasedMB: round(rows.reduce((total, row) => total + row.purchasedMB, 0), 6),
    comparableSimCount: comparable.length,
  };
}

export function dailyBudgetAlerts(state, now = Date.now()) {
  now = validClock(now);
  const sims = Array.isArray(state?.sims) ? state.sims : [];
  const priority = { reached: 2, approaching: 1, within: 0, unconfigured: -1 };
  return sims.map((sim) => {
    const limitMB = sim.dailyLimitMB;
    const usedMB = summarize(state, { simId: sim.id, days: 1, now }).dataUsedMB;
    const validLimit = isNumber(limitMB) && limitMB > 0;
    const ratio = validLimit ? usedMB / limitMB : 0;
    const status = !validLimit ? "unconfigured" : ratio >= 1
      ? "reached" : ratio >= 0.8 ? "approaching" : "within";
    return {
      simId: sim.id,
      carrier: sim.carrier,
      label: sim.label,
      slot: sim.slot,
      usedMB,
      limitMB: validLimit ? limitMB : null,
      remainingMB: validLimit ? round(Math.max(0, limitMB - usedMB), 6) : null,
      exceededMB: validLimit ? round(Math.max(0, usedMB - limitMB), 6) : null,
      percentUsed: validLimit ? round(ratio * 100, 1) : null,
      status,
    };
  }).sort((a, b) => priority[b.status] - priority[a.status] ||
    (b.percentUsed ?? 0) - (a.percentUsed ?? 0));
}

export function callCharge(seconds, rate) {
  if (!nonnegative(seconds) || !nonnegative(rate))
    throw new Error(
      "Duration and rate must be finite numbers of zero or more.",
    );
  return round(Math.ceil(seconds / 60) * rate);
}

function csvCell(value) {
  let text = String(value ?? "").trim();
  // Text is quoted for CSV syntax and prefixed before spreadsheet formula markers.
  if (/^[=+\-@\t\r\n]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

export function toCSV(state, options = {}) {
  const summary = summarize(state, options);
  const headers = [
    "kind",
    "id",
    "timestamp",
    "sim",
    "carrier",
    "description",
    "data_mb",
    "airtime_ghs",
    "duration_seconds",
    "cost_ghs",
    "background",
    "source",
  ];
  const entries = [
    ...summary.purchases.map((record) => ({ kind: "purchase", record })),
    ...summary.usage.map((record) => ({ kind: "usage", record })),
    ...summary.calls.map((record) => ({ kind: "call", record })),
  ].sort(
    (a, b) =>
      timestampValue(a.record.timestamp) - timestampValue(b.record.timestamp),
  );
  const rows = entries.map(({ kind, record }) => {
    const sim = state.sims.find((item) => item.id === record.simId);
    const estimated = kind === "call" && record.estimated;
    const source =
      options.demo === true
        ? estimated
          ? "demo-estimated"
          : "demo"
        : estimated
          ? "estimated"
          : "manual";
    return [
      kind,
      record.id,
      record.timestamp,
      sim?.label ?? record.simId,
      sim?.carrier ?? "",
      kind === "purchase"
        ? record.type
        : kind === "usage"
          ? record.app
          : record.contact,
      kind === "usage"
        ? record.mb
        : kind === "purchase" && record.type === "data"
          ? record.amount
          : "",
      kind === "purchase" && record.type === "airtime" ? record.amount : "",
      kind === "call" ? record.duration : "",
      kind === "usage" ? "" : record.cost,
      kind === "usage" ? record.background : "",
      source,
    ];
  });
  return [headers, ...rows]
    .map((row) => row.map(csvCell).join(","))
    .join("\r\n");
}
