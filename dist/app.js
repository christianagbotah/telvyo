import {
  createDemo,
  createEmpty,
  validateRecord,
  addRecord,
  filterRecords,
  summarize,
  dailyBudgetAlerts,
  monthlySpending,
  compareBundlePurchases,
  bundleExpiryWatch,
  callCharge,
  toCSV,
} from "./model.js";
import { createConnectedFeatures } from "./connected-views.js";

const paths = {
  grid: "M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z",
  data: "M5 20V10 M12 20V4 M19 20v-7",
  phone: "M6 3H3v3c0 8.3 6.7 15 15 15h3v-5l-5-2-2 3a15 15 0 0 1-7-7l3-2-2-5H6z",
  wallet:
    "M20 7V5a2 2 0 0 0-2-2H5a3 3 0 0 0 0 6h16v11H5a3 3 0 0 1-3-3V6 M21 12h-6v5h6 M17 14.5h.01",
  sim: "M8 3h8l4 4v14H4V7z M8 10h8v7H8z M12 10v7 M8 13.5h8",
  settings:
    "M9 3h6l1 4 4 1 1 6-3 3-2 4h-6l-2-4-4-1-1-6 3-3z M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0",
  help: "M9 9a3 3 0 0 1 6 0c0 2-3 2-3 5 M12 17h.01 M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0",
  shield: "M12 3l8 3v6c0 5-8 9-8 9s-8-4-8-9V6z M8 12l3 3 5-6",
  arrow: "M5 12h14 M14 7l5 5-5 5",
  chevron: "M9 5l7 7-7 7",
  down: "M6 9l6 6 6-6",
  plus: "M12 5v14 M5 12h14",
  download: "M12 3v12 M7 10l5 5 5-5 M4 16v5h16v-5",
  bell: "M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9 M10 21h4",
  calendar: "M4 5h16v16H4z M7 3v4 M17 3v4 M4 10h16",
  up: "M6 16l10-10 M6 6h10v10",
  bolt: "M13 2L5 13h6l-1 9 9-13h-6z",
  info: "M12 11v6 M12 7h.01 M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0",
  close: "M6 6l12 12 M18 6L6 18",
  play: "M9 6l10 6-10 6z",
  message:
    "M21 11a9 9 0 0 1-9 9 10 10 0 0 1-4-1l-5 2 1-5a9 9 0 1 1 17-5z M8 8c0 5 3 7 7 7",
  camera:
    "M7 3h10a4 4 0 0 1 4 4v10a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V7a4 4 0 0 1 4-4z M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0 M17 7h.01",
  music: "M9 18V5l10-2v13 M9 18a3 3 0 1 1-3-3h3 M19 16a3 3 0 1 1-3-3h3",
  globe:
    "M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0 M2 12h20 M12 2c6 5 6 15 0 20-6-5-6-15 0-20",
  headphones: "M4 14v-3a8 8 0 0 1 16 0v3 M4 12h3v8H4z M17 12h3v8h-3z",
  check: "M5 12l4 4L19 6",
  trash: "M4 6h16 M9 3h6 M6 6l1 15h10l1-15 M10 10v7 M14 10v7",
  clock: "M12 6v6l4 2 M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0",
  refresh:
    "M20 7V2 M20 7h-5 M4 17v5 M4 17h5 M20 7a9 9 0 0 0-15-3 M4 17a9 9 0 0 0 15 3",
  edit: "M14 5l5 5 M4 20l5-1L21 7l-5-5L4 14z",
  spark: "M12 3l2 6 7 3-7 2-2 7-3-7-6-2 6-3z",
  receipt: "M5 3l3 2 4-2 4 2 3-2v18l-3-2-4 2-4-2-3 2z M8 9h8 M8 13h8",
  lock: "M6 10h12v11H6z M8 10V6a4 4 0 0 1 8 0v4 M12 14v3",
};
const icon = (name, cls = "") =>
  `<svg class="icon ${cls}" aria-hidden="true" viewBox="0 0 24 24"><path d="${paths[name] || paths.data}"/></svg>`;
const esc = (v) =>
  String(v ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const moneyNumber = (n) => Number(n || 0).toLocaleString("en-GH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const money = (n) => `₵ ${moneyNumber(n)}`;
const amount = (n) =>
  n >= 1000 ? `${(n / 1000).toFixed(2)} GB` : `${Math.round(n)} MB`;
const numericAmount = (n) =>
  n >= 1000
    ? `${(n / 1000).toFixed(2)} <small>GB</small>`
    : `${Math.round(n)} <small>MB</small>`;
const dateFmt = (t) =>
  new Date(t).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
const expiryFmt = (t) =>
  new Date(t).toLocaleString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
const timeFmt = (t) =>
  new Date(t).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  });
const durationFmt = (n) => `${Math.floor(n / 60)}m ${Math.round(n % 60)}s`;
const uid = () =>
  globalThis.crypto?.randomUUID?.() ||
  `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const navItems = [
  ["overview", "grid", "Overview"],
  ["data", "data", "Data usage"],
  ["airtime", "phone", "Airtime & calls"],
  ["purchases", "wallet", "Purchases"],
  ["sims", "sim", "My SIMs"],
  ["insights", "spark", "Insights"],
  ["device", "bolt", "Connections"],
];
const categories = {
  YouTube: "Video streaming",
  WhatsApp: "Messaging & calls",
  Instagram: "Social media",
  TikTok: "Video & social",
  Chrome: "Web browsing",
  Spotify: "Music streaming",
  Other: "Other apps",
};
const appIcons = {
  YouTube: "play",
  WhatsApp: "message",
  Instagram: "camera",
  TikTok: "music",
  Chrome: "globe",
  Spotify: "headphones",
  Other: "grid",
};
let storageIssue = false;
function readStorage(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    storageIssue = true;
    return null;
  }
}
function writeStorage(key, value) {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    storageIssue = true;
    return false;
  }
}
const memoryStates = {};
let mode = readStorage("telco.mode") === "demo" ? "demo" : "personal";
function loadState() {
  if (memoryStates[mode]) return memoryStates[mode];
  const raw = readStorage(`telco.${mode}.v1`);
  if (raw) {
    try {
      return (memoryStates[mode] = validatedBackup(JSON.parse(raw)));
    } catch {
      storageIssue = true;
    }
  }
  return (memoryStates[mode] =
    mode === "demo" ? createDemo() : { ...createEmpty(), sims: [] });
}
let state = loadState(),
  page = "overview",
  simId = "all",
  days = 7;
let returnFocus = null,
  toastTimer;
let moreOpen = false;
const root = document.querySelector("#app"),
  modal = document.querySelector("#modal");
const connected = createConnectedFeatures({
  getState: () => state,
  getMode: () => mode,
  getSimId: () => simId,
  save,
  toast,
  render,
  icon,
  esc,
  amount,
  money,
  openModal,
  modalHeader,
});
function save(next) {
  connected.clearAnswer();
  state = next;
  memoryStates[mode] = next;
  const ok = writeStorage(`telco.${mode}.v1`, JSON.stringify(state));
  if (!ok) toast("Storage unavailable. Export your records before closing.");
  return ok;
}
function toast(message) {
  const el = document.querySelector("#toast");
  el.textContent = message;
  el.classList.add("toast-visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("toast-visible"), 4000);
}
const simFor = (id) =>
  state.sims.find((s) => s.id === id) || {
    carrier: "Unknown SIM",
    label: "",
    color: "#a9b6a0",
    slot: "?",
  };
const simDot = (s) =>
  `<span class="carrier-dot" style="--carrier:${esc(/^#[0-9a-fA-F]{3,8}$/.test(s.color) ? s.color : "#a9b6a0")}"></span>`;
const options = () => ({ simId, days });
const summary = () => summarize(state, options());
function navButton([id, ic, label], mobile = false) {
  return `<button class="${mobile ? "" : "nav-btn "}${page === id ? "active" : ""}" data-page="${id}" ${page === id ? 'aria-current="page"' : ""}>${icon(ic)}<span>${mobile ? { overview: "Home", data: "Data", airtime: "Calls", purchases: "Purchases", sims: "SIMs", insights: "Insights", device: "Connect" }[id] || label : label}</span></button>`;
}
function render() {
  if (!state.sims.some((s) => s.id === simId)) simId = "all";
  const s = summary();
  const hasBudgetWarning = mode !== "demo" && dailyBudgetAlerts(state).some(a => a.status === "approaching" || a.status === "reached");
  const expiryAlerts = mode !== "demo" ? bundleExpiryWatch(state) : { soon: [], recentlyExpired: [] };
  const hasExpiryWarning = expiryAlerts.soon.length + expiryAlerts.recentlyExpired.length > 0;
  const hasSpendingWarning = mode !== "demo" && monthlySpending(state).rows.some(a => a.status === "approaching" || a.status === "reached");
  const titles = {
    overview: [
      "Your usage, understood.",
      "A clear picture of your data and airtime. All in one place.",
    ],
    data: [
      "Every megabyte, accounted for.",
      "See which apps use your data, and when.",
    ],
    airtime: [
      "Make every minute count.",
      "Your calls, airtime and spending, clearly connected.",
    ],
    purchases: [
      "Know what you bought.",
      "Your data bundles and airtime top-ups, in one timeline.",
    ],
    sims: [
      "Two SIMs. One clear picture.",
      "Keep your mobile networks organized in one place.",
    ],
    device: [
      "Connect to the source.",
      "Real device measurements. Carrier billing with your authorization.",
    ],
    insights: [
      "Understand what happens next.",
      "Patterns, forecasts and recommendations grounded in evidence.",
    ],
    settings: [
      "Make Telvyo yours.",
      "Your records, your settings, your control.",
    ],
  };
  const title = titles[page] || titles.overview;
  const needsSim = mode !== "demo" && state.sims.length === 0;
  root.innerHTML = `<div class="shell"><aside class="sidebar"><a href="#overview" data-page="overview" class="brand"><img src="./icon.svg" alt="">telvyo<span class="brand-dot">.</span></a><div class="sidebar-tag">YOUR WORKSPACE</div><nav class="nav" aria-label="Main navigation">${navItems.map((n) => navButton(n)).join("")}</nav><div class="sidebar-tag" style="margin-top:34px">PREFERENCES</div><nav class="nav" aria-label="Preferences">${navButton(["settings", "settings", "Settings"])}<button class="nav-btn" data-action="help">${icon("help")}<span>Help & support</span></button></nav><div class="side-bottom"><div class="side-tip"><div class="tip-icon">${icon("spark")}Small habits. Big savings.</div><p>Switch app updates to Wi-Fi and make your next bundle go further.</p><button data-action="tips">Explore data-saving tips ${icon("arrow")}</button></div><div class="local-note">${icon("shield")}Your records stay on this device</div></div></aside><div class="main-wrap"><header class="topbar"><div class="breadcrumb">Workspace <span>/</span><strong>${page === "settings" ? "Settings" : navItems.find((n) => n[0] === page)?.[2] || "Overview"}</strong></div><div class="mobile-brand"><img src="./icon.svg" alt="">telvyo<span class="brand-dot">.</span></div><div class="top-actions"><span class="top-date">${icon("calendar")}${new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}</span><button class="icon-btn" data-action="alerts" aria-label="Usage alerts${hasBudgetWarning ? " — budget warning" : hasExpiryWarning ? " — bundle expiry reminder" : hasSpendingWarning ? " — spending warning" : ""}">${icon("bell")}${hasBudgetWarning || hasExpiryWarning || hasSpendingWarning ? '<span class="notice-dot"></span>' : ""}</button><button class="avatar" data-page="settings" aria-label="Open settings">${mode === "demo" ? "D" : "ME"}</button></div></header><main class="content" id="main-content" tabindex="-1"><div class="heading"><div><div class="eyebrow">${page === "overview" ? "A LITTLE CLARITY. A LOT MORE CONTROL." : "YOUR USAGE, YOUR WAY"}</div><h1>${title[0]}</h1><p>${title[1]}</p></div><div class="heading-actions"><button class="secondary-btn" data-action="export">${icon("download")}Export</button><button class="primary-btn" data-action="${page === "sims" || needsSim ? "add-sim" : "add"}">${icon("plus")}<span>${needsSim ? "Add SIM" : page === "sims" ? (state.sims.length < 2 ? "Add SIM" : "Edit SIMs") : "Add record"}</span></button></div></div><div class="demo-strip"><span>${icon(mode === "demo" ? "info" : "shield")}<strong>${mode === "demo" ? "Demo workspace" : "Personal workspace"}</strong><span class="strip-detail">${mode === "demo" ? "· Sample data. Your phone is not connected." : `· ${storageIssue ? "Storage unavailable — export before closing." : "Recorded entries stay on this device."}`}</span></span><button data-action="switch-mode">${mode === "demo" ? "Start my tracker" : "View demo"} ${icon("arrow")}</button></div>${["sims", "settings", "device", "insights"].includes(page) ? "" : renderFilters()}${page === "overview" ? renderOverview(s) : page === "data" ? renderData(s) : page === "airtime" ? renderAirtime(s) : page === "purchases" ? renderPurchases(s) : page === "sims" ? renderSims() : page === "device" ? connected.renderDevice() : page === "insights" ? connected.renderInsights() : renderSettings()}<footer class="page-footer"><span>${icon("lock")}${mode === "demo" ? "Sample records · Explore freely" : "Device-local records · Export to keep a backup"}</span><span>${mode === "demo" ? "Made for a little more peace of mind." : "Balances reflect the records you enter."}</span></footer></main></div><nav class="mobile-nav" aria-label="Mobile navigation">${[
    "overview",
    "data",
    "insights",
    "airtime",
    "device",
  ]
    .map((id) =>
      navButton(
        navItems.find((n) => n[0] === id),
        true,
      ),
    )
    .join("")}<button class="more-nav-button ${moreOpen || ["purchases","sims","settings"].includes(page) ? "active" : ""}" type="button" data-action="more" aria-controls="mobile-more-sheet" aria-expanded="${moreOpen}">${icon("grid")}<span>More</span></button></nav><section id="mobile-more-sheet" class="mobile-more-sheet" aria-label="More navigation" ${moreOpen ? "" : "hidden"}><div class="mobile-more-title"><strong>More in Telvyo</strong><button type="button" class="icon-btn" data-action="more" aria-label="Close more menu">${icon("close")}</button></div><div class="mobile-more-grid">${navButton(["purchases","wallet","Purchases"])}${navButton(["sims","sim","My SIMs"])}${navButton(["settings","settings","Settings"])}<button type="button" class="nav-btn" data-action="help">${icon("help")}<span>Help & support</span></button><button type="button" class="nav-btn" data-action="export">${icon("download")}<span>Export CSV</span></button><button type="button" class="nav-btn" data-action="backup">${icon("shield")}<span>Back up records</span></button></div></section></div>`;
}
function renderFilters() {
  return `<div class="filters"><div class="sim-filters" aria-label="Filter by SIM"><button class="chip ${simId === "all" ? "active" : ""}" data-sim="all" aria-pressed="${simId === "all"}">All SIMs</button>${state.sims.map((s) => `<button class="chip ${simId === s.id ? "active" : ""}" data-sim="${esc(s.id)}" aria-pressed="${simId === s.id}">${simDot(s)}${esc(s.carrier)} <small>SIM ${s.slot}</small></button>`).join("")}</div><div class="filter-right"><select class="period-select" id="period" aria-label="Date range"><option value="1" ${days === 1 ? "selected" : ""}>Today</option><option value="7" ${days === 7 ? "selected" : ""}>Last 7 days</option><option value="30" ${days === 30 ? "selected" : ""}>Last 30 days</option><option value="90" ${days === 90 ? "selected" : ""}>Last 90 days</option></select></div></div>`;
}
function stat(label, value, sub, ic, featured = false) {
  return `<article class="stat-card ${featured ? "featured" : ""}"><div class="stat-head"><span>${label}</span>${icon(ic)}</div><div class="stat-number">${value}</div><div class="stat-bottom">${sub}</div>${featured ? '<svg class="stat-decoration" aria-hidden="true" viewBox="0 0 110 50" fill="none"><path d="M2 46L15 33L27 38L41 20L53 27L67 15L80 20L94 7L108 2" stroke="#202A35" stroke-width="2.5" stroke-linecap="round"/><path d="M2 46L15 33L27 38L41 20L53 27L67 15L80 20L94 7L108 2V50H2Z" fill="url(#spark-fill)"/><defs><linearGradient id="spark-fill" x1="55" y1="0" x2="55" y2="50" gradientUnits="userSpaceOnUse"><stop stop-color="#202A35" stop-opacity=".16"/><stop offset="1" stop-color="#202A35" stop-opacity="0"/></linearGradient></defs></svg>' : ""}</article>`;
}
function renderOverview(s) {
  if (mode !== "demo" && !state.sims.length)
    return connected.renderHomeMeasurements() + connected.setup();
  return `${connected.renderHomeMeasurements()}<section class="stats-grid" aria-label="Usage summary">${stat(`Data used ${days === 1 ? "today" : `in ${days} days`}`, numericAmount(s.dataUsedMB), `<span class="tiny-pill">${days === 1 ? "Today" : `Last ${days} days`}</span> Across ${simId === "all" ? state.sims.length + " SIMs" : esc(simFor(simId).carrier)}`, "data", true)}${stat("Data remaining", numericAmount(s.dataRemainingMB), `${icon("sim")} <strong>Recorded balance</strong> · all time`, "data")}${stat("Airtime balance", `<small style="margin-left:0">₵</small> ${moneyNumber(s.airtimeBalance)}`, `<strong>${money(s.callSpend)}</strong> in calls this period`, "wallet")}</section>${renderBudgetPanel()}${renderSpendingPanel(true)}${renderExpiryPanel()}<div class="overview-grid">${renderChart(s)}<section class="card sim-card"><div class="card-heading"><h2>Your SIMs</h2><button class="quiet-btn" data-page="sims">Manage ${icon("arrow")}</button></div><p class="card-sub">Separate networks. One simple view.</p>${state.sims.map((sim) => simCard(sim)).join("")}</section></div><div class="bottom-grid"><section class="card"><div class="card-heading"><h2>Where your data goes</h2><button class="quiet-btn" data-page="data">View all ${icon("arrow")}</button></div><p class="card-sub">Your most data-hungry apps this period</p>${renderAppList(s.appUsage, 4)}</section><section class="card"><div class="card-heading"><h2>Recent activity</h2><button class="quiet-btn" data-page="purchases">View purchases ${icon("arrow")}</button></div><p class="card-sub">The little details, all in one place</p>${renderActivity(s)}</section></div>${insight(s)}`;
}
function renderBudgetPanel() {
  const alerts = dailyBudgetAlerts(state);
  if (!alerts.length) return "";
  return `<section class="card budget-panel" aria-label="Daily data budgets"><div class="card-heading"><h2>${icon("bell")} Today's data budgets</h2><button class="quiet-btn" data-action="alerts">Budget details ${icon("arrow")}</button></div><p class="card-sub">${mode === "demo" ? "Sample entries" : "Your manually logged usage"} today, not a carrier balance or background phone measurement. Warnings begin at 80%.</p><div class="budget-items">${alerts.map(a => `<div class="budget-item ${a.status}"><div class="budget-item-top"><span><strong>${esc(a.carrier)}</strong> · SIM ${esc(a.slot)}</span><strong>${a.percentUsed === null ? "Not configured" : a.percentUsed + "% used"}</strong></div><div class="budget-track" role="progressbar" aria-label="${esc(a.carrier)} logged daily data budget" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.min(100, Math.round(a.percentUsed || 0))}"><span style="width:${Math.min(100, a.percentUsed || 0)}%"></span></div><p>${amount(a.usedMB)} logged of ${a.limitMB === null ? "unconfigured budget" : amount(a.limitMB)} · ${a.status === "reached" ? a.exceededMB > 0 ? amount(a.exceededMB) + " above budget" : "Daily budget reached" : a.status === "approaching" ? "Approaching the daily budget" : a.status === "within" ? amount(a.remainingMB) + " remaining" : "Set a daily budget in My SIMs"}</p></div>`).join("")}</div></section>`;
}
function renderSpendingPanel(compact = false) {
  const report = monthlySpending(state, { simId });
  if (!report.rows.length || (compact && report.configuredCount === 0)) return "";
  return `<section class="card monthly-spending-panel" aria-label="Monthly spending budgets">
    <div class="card-heading"><h2>${icon("wallet")} Monthly spending · ${esc(report.month)}</h2><button class="quiet-btn" data-page="sims">Set budgets ${icon("arrow")}</button></div>
    <p class="card-sub">${mode === "demo" ? "Sample purchases" : "Manually recorded purchases"} · Calendar month, not the selected day range. Data bundles and airtime top-ups only; call charges are excluded to prevent double counting.</p>
    <div class="monthly-spending-list">${report.rows.map(a => `<article class="monthly-spending-row ${a.status}">
      <div class="monthly-spending-heading"><strong>${esc(a.carrier)} · SIM ${esc(a.slot)}</strong><span>${a.limit === null ? "No spending target" : a.status === "reached" ? "Budget reached" : a.status === "approaching" ? "Approaching budget" : "Within budget"}</span></div>
      <div class="monthly-spending-amount"><strong>${money(a.spent)}</strong><span>of ${a.limit === null ? "no limit configured" : money(a.limit)}</span></div>
      ${a.limit === null ? "" : `<div class="monthly-spending-track" role="progressbar" aria-label="${esc(a.carrier)} monthly cash spending" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.min(100, Math.round(a.percentUsed))}"><span style="width:${Math.min(100, a.percentUsed)}%"></span></div>`}
      <p>Data: ${money(a.dataSpent)} · Airtime: ${money(a.airtimeSpent)} · ${a.purchaseCount} purchases</p>
      <p>${a.limit === null ? "Configure a monthly spending target in My SIMs." : a.status === "reached" ? a.overBudget > 0 ? money(a.overBudget) + " above your budget" : "You reached your budget" : money(a.remaining) + " remaining"} · Previous calendar month: ${money(a.previousSpent)}</p>
    </article>`).join("")}</div>
    <p class="metric-evidence">Only amounts paid that you logged are counted. This is not a bank statement, carrier invoice or live credit balance. Missing purchases and refunds are not included.</p>
  </section>`;
}
function renderExpiryPanel() {
  const { soon, recentlyExpired } = bundleExpiryWatch(state, { simId });
  if (!soon.length && !recentlyExpired.length) return "";
  const items = [...soon, ...recentlyExpired].slice(0, 6);
  return `<section class="card expiry-panel" aria-label="Recorded bundle expiry reminders"><div class="card-heading"><h2>${icon("clock")} Bundle expiry watch</h2><button class="quiet-btn" data-page="purchases">Manage bundles ${icon("arrow")}</button></div><p class="card-sub">Only times you entered yourself. Reminders appear when opening Telvyo, not as push notifications.</p><div class="expiry-list">${items.map(item => `<div class="expiry-row"><span class="expiry-status ${item.status}">${item.status === "soon" ? "Expires soon" : "Expiry passed"}</span><strong>${esc(item.carrier)} · SIM ${esc(item.slot)} · ${amount(item.amountMB)}</strong><span>${esc(expiryFmt(item.expiresAt))}</span></div>`).join("")}</div><p class="metric-evidence">Your recorded data balance is not adjusted for bundle expiry, bonus rules or carrier usage. Confirm available data with your network.</p></section>`;
}
function renderChart(s) {
  const daily = s.daily;
  const display =
    daily.length > 14
      ? daily
          .filter((_, i) => i % Math.ceil(daily.length / 14) === 0)
          .map((d, i) => {
            const n = Math.ceil(daily.length / 14);
            return {
              ...d,
              label: dateFmt(d.date + "T12:00:00"),
              mb: daily.slice(i * n, i * n + n).reduce((a, v) => a + v.mb, 0),
            };
          })
      : daily;
  const max = Math.max(250, ...display.map((d) => d.mb));
  const ceil = Math.ceil(max / 250) * 250;
  return `<section class="card chart-card"><div class="card-heading"><h2>Data usage over time</h2><span class="chart-title-right"><span class="legend-dot"></span>Mobile data <span class="legend-dot light"></span><span class="comparison">Daily totals</span></span></div><p class="card-sub">${daily.length ? dateFmt(daily[0].date + "T12:00:00") + " – " + dateFmt(daily.at(-1).date + "T12:00:00") : "No data"}${display.length < daily.length ? " · grouped days" : ""}</p><div class="chart" role="img" aria-label="Data usage: ${display.map((d) => `${d.label}, ${amount(d.mb)}`).join("; ")}"><div class="y-axis"><span>${amount(ceil)}</span><span>${amount(ceil * 0.75)}</span><span>${amount(ceil * 0.5)}</span><span>${amount(ceil * 0.25)}</span><span>0</span></div><div class="chart-plot"><div class="chart-lines"><i></i><i></i><i></i><i></i><i></i></div>${display.map((d, i) => `<div class="bar-wrap"><div class="chart-bar ${i === display.length - 1 ? "latest" : ""}" tabindex="0" aria-label="${esc(d.label)}: ${amount(d.mb)}" data-tip="${esc(d.label)} · ${amount(d.mb)}" style="height:${Math.max(d.mb > 0 ? 2 : 0, (d.mb / ceil) * 100)}%"></div></div>`).join("")}</div><div class="x-axis">${display.map((d) => `<span>${esc(d.label)}</span>`).join("")}</div></div><div class="chart-note">${icon("info")} ${mode === "demo" ? "Illustrative usage from sample records" : "Totals from the usage you have logged"} · 1 GB = 1,000 MB</div></section>`;
}
function simCard(sim, full = false) {
  const s = summarize(state, { simId: sim.id, days: 1 });
  const bought = state.purchases
    .filter((p) => p.simId === sim.id && p.type === "data")
    .reduce((a, p) => a + p.amount, 0);
  const pct = bought
    ? Math.max(0, Math.min(100, (s.dataRemainingMB / bought) * 100))
    : 0;
  return `<article class="sim-item"><div class="sim-item-top"><div class="carrier-icon" style="--carrier:${esc(sim.color)};--carrier-text:${sim.carrier === "MTN" ? "#524309" : "#fff"}">${sim.carrier === "MTN" ? "MTN" : icon("sim")}</div><div><div class="sim-name">${esc(sim.carrier)}</div><div class="sim-label">SIM ${sim.slot} · ${esc(sim.label)}</div></div><span class="pill ${sim.carrier === "MTN" ? "amber" : "gray"}">${mode === "demo" ? "Sample" : sim.source === "device" ? "Detected" : "Manual"}</span></div><div class="sim-meter-label"><span>Data remaining</span><strong>${amount(s.dataRemainingMB)}</strong></div><div class="progress"><span style="width:${pct}%"></span></div><div class="sim-details"><span>Recorded allowance</span><strong>${amount(bought)}</strong></div>${full ? `<div class="sim-details"><span>Airtime balance</span><strong>${money(s.airtimeBalance)}</strong></div><div class="sim-details"><span>Daily data budget</span><strong>${amount(sim.dailyLimitMB)}</strong></div><div class="sim-details"><span>Monthly spending budget</span><strong>${sim.monthlySpendLimit == null ? "Not configured" : money(sim.monthlySpendLimit)}</strong></div><div class="sim-details"><span>Manual call estimate · per minute</span><strong>${sim.rateSource === "unset" ? "Not configured" : money(sim.rate)}</strong></div><div class="sim-actions"><span>Usage today: ${amount(s.dataUsedMB)}</span><button class="secondary-btn" data-action="edit-sim" data-id="${esc(sim.id)}">${icon("edit")}Edit SIM</button></div>` : ""}</article>`;
}
function appIcon(app) {
  return `<span class="app-icon ${esc(app.toLowerCase() in { youtube: 1, whatsapp: 1, instagram: 1, tiktok: 1, chrome: 1, spotify: 1 } ? app.toLowerCase() : "other")}">${icon(appIcons[app] || "grid")}</span>`;
}
function renderAppList(apps, limit = 99) {
  return apps.length
    ? `<div class="app-list">${apps
        .slice(0, limit)
        .map(
          (a) =>
            `<button class="app-row" data-action="app-detail" data-app="${esc(a.app)}">${appIcon(a.app)}<div class="app-text"><div class="app-name">${esc(a.app)}</div><div class="app-category">${categories[a.app] || "Logged app usage"}</div></div><div class="app-meter"><span style="width:${a.percent}%"></span></div><div class="app-value">${amount(a.mb)}<small>${a.percent.toFixed(1)}%</small></div></button>`,
        )
        .join("")}</div>`
    : empty(
        "No usage logged yet",
        "Add a usage record to see your app breakdown.",
        "Log data usage",
        "usage",
      );
}
function renderActivity(s) {
  const records = [
    ...s.purchases.map((r) => ({ ...r, kind: "purchase" })),
    ...s.calls.map((r) => ({ ...r, kind: "call" })),
  ]
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
    .slice(0, 4);
  return records.length
    ? `<div class="activity-list">${records
        .map((r) => {
          const sim = simFor(r.simId),
            call = r.kind === "call";
          return `<div class="activity-row"><div class="activity-icon">${icon(call ? "phone" : r.type === "data" ? "data" : "wallet")}</div><div class="activity-text"><div class="activity-title">${call ? `Call · ${esc(r.contact)}` : r.type === "data" ? `${amount(r.amount)} data bundle` : "Airtime top-up"}</div><div class="activity-meta">${simDot(sim)}${esc(sim.carrier)}<span>·</span>${dateFmt(r.timestamp)}, ${timeFmt(r.timestamp)}</div></div><div class="activity-value">${money(r.cost)}<small>${call ? (r.estimated ? "Estimated" : "Entered charge") : "Purchased"}</small></div></div>`;
        })
        .join("")}</div>`
    : empty(
        "Your story starts here",
        "Purchases and calls you log will appear here.",
      );
}
function insight(s) {
  const top = s.appUsage[0];
  return `<aside class="insight">${icon("spark")}<p><strong>${top ? `${esc(top.app)} uses ${top.percent.toFixed(0)}% of your recorded data.` : "A small habit can make a big difference."}</strong> ${top ? "Try lowering streaming quality or saving downloads for Wi-Fi." : "Log your next bundle and keep an eye on where it goes."}</p><button class="quiet-btn" data-action="tips">A little more control ${icon("arrow")}</button></aside>`;
}
function empty(title, desc, cta, tab) {
  return `<div class="empty">${icon("data")}<strong>${title}</strong>${desc}${cta ? `<button class="secondary-btn" data-action="add" data-tab="${tab}">${icon("plus")}${cta}</button>` : ""}</div>`;
}
function renderData(s) {
  const bg = s.usage.filter((r) => r.background).reduce((a, r) => a + r.mb, 0);
  return `<section class="stats-grid">${stat("Total data used", numericAmount(s.dataUsedMB), `<strong>${s.appUsage.length} apps</strong> in this period`, "data", true)}${stat("Foreground usage", numericAmount(s.dataUsedMB - bg), "While you were using the app", "globe")}${stat("Background usage", numericAmount(bg), "Updates, syncs and background tasks", "refresh")}</section><div class="full-grid">${renderChart(s)}<section class="card"><div class="card-heading"><h2>Usage by app</h2><button class="quiet-btn" data-action="add" data-tab="usage">Log usage ${icon("plus")}</button></div><p class="card-sub">Tap an app to explore its timeline</p>${renderAppList(s.appUsage)}</section></div><section class="card section-gap"><div class="card-heading"><h2>Usage timeline</h2><span class="pill gray">${s.usage.length} records</span></div><p class="card-sub">Timestamped records, assigned to the SIM you choose</p>${usageTable(s.usage)}</section>${insight(s)}`;
}
function usageTable(records) {
  return records.length
    ? `<div class="table-scroll"><table class="data-table"><thead><tr><th>APP</th><th>SIM</th><th>USAGE</th><th>ACTIVITY</th><th>TIME</th><th></th></tr></thead><tbody>${[
        ...records,
      ]
        .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
        .map(
          (r) =>
            `<tr><td><strong>${esc(r.app)}</strong></td><td><span class="table-carrier">${simDot(simFor(r.simId))}${esc(simFor(r.simId).carrier)}</span></td><td>${amount(r.mb)}</td><td><span class="pill gray">${r.background ? "Background" : "Foreground"}</span></td><td>${dateFmt(r.timestamp)}<span class="record-date">${timeFmt(r.timestamp)}</span></td><td><button class="quiet-btn small-icon" data-action="edit-record" data-kind="usage" data-id="${esc(r.id)}" aria-label="Edit ${esc(r.app)} usage">${icon("edit")}</button> <button class="quiet-btn small-icon" data-action="delete-record" data-kind="usage" data-id="${esc(r.id)}" aria-label="Delete ${esc(r.app)} usage">${icon("trash")}</button></td></tr>`,
        )
        .join("")}</tbody></table></div>`
    : empty(
        "No data in this period",
        "Try a different date range or log usage.",
      );
}
function renderAirtime(s) {
  return `<section class="stats-grid">${stat("Airtime balance", `<small style="margin-left:0">₵</small> ${moneyNumber(s.airtimeBalance)}`, "Recorded top-ups, less recorded call costs", "wallet", true)}${stat("Spent on calls", `<small style="margin-left:0">₵</small> ${moneyNumber(s.callSpend)}`, `<strong>${s.callCount} calls</strong> in this period`, "phone")}${stat("Time on calls", `${Math.floor(s.callSeconds / 60)} <small>min</small>`, `${s.callSeconds % 60} seconds more · ${days === 1 ? "today" : `last ${days} days`}`, "clock")}</section><section class="card"><div class="card-heading"><h2>Your call history</h2><div class="record-actions"><button class="secondary-btn" data-action="add" data-tab="airtime">${icon("plus")}Top up</button><button class="secondary-btn" data-action="add" data-tab="call">${icon("phone")}Log call</button></div></div><p class="card-sub">Each call is linked to a SIM. Estimates use your saved rate per started minute.</p>${
    s.calls.length
      ? `<div class="table-scroll"><table class="data-table"><thead><tr><th>CONTACT / NUMBER</th><th>SIM</th><th>DURATION</th><th>COST</th><th>TIME</th><th></th></tr></thead><tbody>${[
          ...s.calls,
        ]
          .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
          .map(
            (r) =>
              `<tr><td><strong>${esc(r.contact)}</strong></td><td><span class="table-carrier">${simDot(simFor(r.simId))}${esc(simFor(r.simId).carrier)}</span></td><td>${durationFmt(r.duration)}</td><td><strong>${money(r.cost)}</strong><span class="record-date">${r.estimated ? "Estimated" : "Entered charge"}</span></td><td>${dateFmt(r.timestamp)}<span class="record-date">${timeFmt(r.timestamp)}</span></td><td><button class="quiet-btn small-icon" data-action="edit-record" data-kind="call" data-id="${esc(r.id)}" aria-label="Edit call to ${esc(r.contact)}">${icon("edit")}</button> <button class="quiet-btn small-icon" data-action="delete-record" data-kind="call" data-id="${esc(r.id)}" aria-label="Delete call to ${esc(r.contact)}">${icon("trash")}</button></td></tr>`,
          )
          .join("")}</tbody></table></div>`
      : empty(
          "No calls logged yet",
          "Keep track of each call and what it costs.",
          "Log a call",
          "call",
        )
  }</section><aside class="insight">${icon("info")}<p><strong>A clearer picture of your spending.</strong> A tariff estimate may differ from your bill. Enter the actual charge from your carrier when available. Balances do not include unlogged charges or bonus credit.</p></aside>`;
}
function renderPurchaseValue() {
  const comparison = compareBundlePurchases(state, { simId, days });
  const period = days === 1 ? "Today" : `Last ${days} days`;
  return `<section class="card bundle-value-card" aria-label="Historical data bundle value comparison"><div class="card-heading"><h2>${icon("wallet")} What your bundles cost</h2><span class="pill gray">${period}</span></div><p class="card-sub">Compare the amount you recorded paying per 1 GB of data allowance on each SIM. This is your purchase history, <strong>not today's network prices</strong>.</p><div class="bundle-value-list">${comparison.rows.map(row => `<article class="bundle-value-item"><div class="bundle-value-top"><strong>${esc(row.carrier)} · SIM ${esc(row.slot)}</strong>${row.lowestRecorded ? '<span class="pill amber">Lowest recorded ₵/GB</span>' : ""}</div><div class="bundle-value-metric">${row.costPerGB === null ? '<strong>—</strong><span>No paid bundle recorded</span>' : `<strong>₵ ${moneyNumber(row.costPerGB)}</strong><span>per 1 GB purchased</span>`}</div><p>${row.purchases} ${row.purchases === 1 ? "data purchase" : "data purchases"} · ${amount(row.purchasedMB)} total allowance · ${money(row.spent)} paid</p>${row.complimentaryPurchases ? `<p class="bundle-value-note">${amount(row.complimentaryMB)} complimentary allowance excluded from the paid-price calculation.</p>` : ""}</article>`).join("") || '<p>No SIM profiles found. Add a SIM to compare your own data purchases.</p>'}</div><p class="metric-evidence">Calculated only from valid purchases you entered within the selected period. Bundles can have different validity, speed, bonuses and eligibility. A lower historical cost per GB is not proof of the best current offer or actual savings.</p></section>`;
}
function renderPurchases(s) {
  const totalData = s.purchases
      .filter((r) => r.type === "data")
      .reduce((a, r) => a + r.amount, 0),
    airtime = s.purchases
      .filter((r) => r.type === "airtime")
      .reduce((a, r) => a + r.amount, 0);
  return `<section class="stats-grid">${stat("Total purchase spending", `<small style="margin-left:0">₵</small> ${moneyNumber(s.purchaseSpend)}`, `<strong>${s.purchases.length} purchases</strong> in this period`, "wallet", true)}${stat("Data purchased", numericAmount(totalData), "Bundle allowances you have recorded", "data")}${stat("Airtime added", `<small style="margin-left:0">₵</small> ${moneyNumber(airtime)}`, "Credit added across selected SIMs", "phone")}</section>${renderSpendingPanel(false)}${renderPurchaseValue()}<section class="card"><div class="card-heading"><h2>Purchase history</h2><div class="record-actions"><button class="secondary-btn" data-action="add" data-tab="data">${icon("plus")}Data bundle</button><button class="secondary-btn" data-action="add" data-tab="airtime">${icon("plus")}Airtime</button></div></div><p class="card-sub">The amount, the time, the SIM. Every purchase in one place.</p>${
    s.purchases.length
      ? `<div class="table-scroll"><table class="data-table"><thead><tr><th>PURCHASE</th><th>SIM</th><th>ALLOWANCE / CREDIT</th><th>PAID</th><th>PURCHASED AT</th><th></th></tr></thead><tbody>${[
          ...s.purchases,
        ]
          .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
          .map(
            (r) =>
              `<tr><td><strong>${r.type === "data" ? "Data bundle" : "Airtime top-up"}</strong></td><td><span class="table-carrier">${simDot(simFor(r.simId))}${esc(simFor(r.simId).carrier)}</span></td><td>${r.type === "data" ? amount(r.amount) : money(r.amount)}${r.type === "data" && r.expiresAt ? `<span class="record-date">Recorded expiry: ${esc(expiryFmt(r.expiresAt))}${Date.parse(r.expiresAt) <= Date.now() ? " · Passed" : ""}</span>` : ""}</td><td>${money(r.cost)}</td><td>${dateFmt(r.timestamp)}<span class="record-date">${timeFmt(r.timestamp)}</span></td><td><button class="quiet-btn small-icon" data-action="edit-record" data-kind="purchase" data-id="${esc(r.id)}" aria-label="Edit purchase">${icon("edit")}</button> <button class="quiet-btn small-icon" data-action="delete-record" data-kind="purchase" data-id="${esc(r.id)}" aria-label="Delete purchase">${icon("trash")}</button></td></tr>`,
          )
          .join("")}</tbody></table></div>`
      : empty(
          "Your next bundle starts here",
          "Log a purchase to establish your recorded balance.",
          "Add a purchase",
          "data",
        )
  }</section><aside class="insight">${icon("clock")}<p><strong>Know when your bundle started.</strong> Compare purchase times with the data usage timeline. Recorded balances do not account for bundle expiry, rollover rules or carrier adjustments. You can now record an optional expiry on each data purchase to see in-app reminders.</p></aside>`;
}
function renderSims() {
  return `<div class="sim-page-grid">${state.sims.map((s) => simCard(s, true)).join("")}</div><aside class="insight">${icon("sim")}<p><strong>Choose the right SIM for each record.</strong> Manage recorded profiles here, or use Connections to detect active SIMs in the Android app. Detection does not authorize carrier billing or change your phone’s selected SIM.</p></aside>`;
}
function renderSettings() {
  return `<div class="settings-grid"><section class="card settings-card"><h3>Your workspace</h3><p>Keep your personal records separate from the demo.</p><div class="setting-row"><span>Current workspace<small>${mode === "demo" ? "Sample records you can explore and change" : "Your manually entered usage records"}</small></span><span class="pill">${mode === "demo" ? "Demo" : "Personal"}</span></div><div class="setting-row"><span>${mode === "demo" ? "Start tracking your usage" : "Explore the demo"}<small>Your other workspace will be preserved.</small></span><button class="secondary-btn" data-action="switch-mode">Switch ${icon("arrow")}</button></div><div class="setting-row"><span>Currency<small>All costs and rates use Ghana cedis.</small></span><strong>₵</strong></div><div class="setting-row"><span>Data units<small>Decimal units used by mobile operators.</small></span><strong>1 GB = 1,000 MB</strong></div><div class="setting-row"><span>SIM rates & budgets<small>Configure daily data and monthly spending separately for each SIM.</small></span><button class="quiet-btn" data-page="sims">Manage ${icon("arrow")}</button></div></section><section class="card settings-card"><h3>Your records</h3><p>Records are stored on this device. Clearing browser storage or uninstalling the native app removes them.</p><div class="setting-row"><span>Download a report<small>CSV of the current SIM and date range.</small></span><button class="secondary-btn" data-action="export">${icon("download")}Export CSV</button></div><div class="setting-row"><span>Back up all records<small>JSON backup for your current workspace.</small></span><button class="secondary-btn" data-action="backup">${icon("download")}Backup</button></div><div class="setting-row"><span>Restore a backup<small>Preview before replacing this workspace.</small></span><button class="secondary-btn" data-action="import">${icon("up")}Restore</button></div><div class="setting-row"><span>${mode === "demo" ? "Reset demo data" : "Clear personal records"}<small>${mode === "demo" ? "Restore the original sample week." : "Remove usage, purchases and calls from this workspace."}</small></span><button class="secondary-btn danger-btn" data-action="reset">${icon("refresh")}Reset</button></div></section><section class="card settings-card"><h3>On your phone</h3><p>Use Telvyo in your mobile browser or add it to your Home Screen for quick access.</p><div class="support-grid"><div class="support-item"><strong>${icon("sim")}Android</strong><p>Browser menu → Install app or Add to Home screen. The native Android app supports active SIM discovery and mobile usage queries after permission. Open Connections to enable them. Browser access cannot read phone statistics.</p></div><div class="support-item"><strong>${icon("globe")}iPhone</strong><p>Safari → Share → Add to Home Screen. iOS does not expose other apps’ cellular usage or cellular call history to ordinary apps.</p></div></div></section><section class="card settings-card"><h3>Clear numbers. Honest sources.</h3><p>Telvyo’s current version helps you understand the records you add. Android device measurements are available in Connections. Carrier-reported balances and charges remain unavailable until an approved carrier integration is configured.</p><div class="support-grid"><div class="support-item"><strong>${icon("shield")}Stored on this device</strong><p>Your usage and call records are not sent to a Telvyo server. Export a backup before changing devices.</p></div><div class="support-item"><strong>${icon("phone")}Estimates are labeled</strong><p>Call estimates round up to the next full minute at your configured rate. Carrier bundles, promotions and billing increments may differ.</p></div></div></section><section class="card settings-card" id="privacy-controls"><h3>Privacy & local data</h3><p>You control the records saved on this device. No account or carrier sync is enabled in this preview.</p><div class="setting-row"><span>Local personal data<small>SIM profiles, recorded usage, purchases and calls. Demo samples are separate.</small></span><span class="pill">Device only</span></div><div class="setting-row"><span>Erase all personal data<small>Completely removes your personal SIM profiles and tracking records from this device. Download a backup first. Existing downloaded files and Android system permissions are not affected.</small></span><button class="secondary-btn danger-btn" data-action="erase-local" ${mode === "demo" ? "disabled" : ""}>${icon("trash")}Erase my data</button></div><p class="metric-evidence">This action does not delete any external carrier records, downloaded exports, or future cloud accounts. To revoke Android access, change permissions in your phone settings.</p></section></div>`;
}
function openModal(content, wide = false) {
  returnFocus = document.activeElement;
  modal.className = wide ? "wide-modal" : "";
  modal.innerHTML = content;
  if (!modal.open) modal.showModal();
}
function closeModal() {
  modal.close();
  returnFocus?.focus?.();
}
function modalHeader(title, sub = "") {
  return `<div class="modal-top"><h2 id="modal-title">${title}</h2><button class="icon-btn" data-action="close" aria-label="Close dialog">${icon("close")}</button></div>${sub ? `<p class="modal-sub">${sub}</p>` : ""}`;
}
function localInputDate(t = Date.now()) {
  const d = new Date(t);
  return new Date(d - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}
function field(
  label,
  name,
  type = "text",
  value = "",
  extra = "",
  full = false,
) {
  return `<div class="field ${full ? "full" : ""}"><label for="f-${name}">${label}</label><input id="f-${name}" name="${name}" type="${type}" value="${esc(value)}" ${extra}></div>`;
}
function simSelect(value) {
  return `<div class="field full"><label for="f-sim">SIM</label><select id="f-sim" name="simId" required>${state.sims.map((s) => `<option value="${esc(s.id)}" ${s.id === value ? "selected" : ""}>${esc(s.carrier)} · SIM ${s.slot} · ${esc(s.label)}</option>`).join("")}</select></div>`;
}
let formTab = "data",
  editing = null;
function showRecordForm(tab = "data", record = null) {
  if (!state.sims.length) {
    showSimForm();
    toast("Detect your SIMs in Connections, or add a profile first.");
    return;
  }
  formTab = tab;
  editing = record;
  const id = record?.simId || (simId !== "all" ? simId : state.sims[0]?.id),
    sim = simFor(id),
    knownRate = sim.rateSource !== "unset";
  const tabs = [
    ["data", "Data bundle"],
    ["airtime", "Airtime"],
    ["usage", "Data usage"],
    ["call", "Call"],
  ];
  let body = "";
  if (tab === "data")
    body = `${field("Data allowance (GB)", "amount", "number", record ? record.amount / 1000 : "", 'min="0.001" step="0.001" required placeholder="e.g. 5"')}${field("Amount paid (₵)", "cost", "number", record?.cost ?? "", 'min="0" step="0.01" required placeholder="e.g. 30.00"')}${field("Recorded expiry (optional)", "expiresAt", "datetime-local", record?.expiresAt ? localInputDate(record.expiresAt) : "", "", true)}<p class="field-note full">Only enter an expiry you know from the carrier or purchase details. We will remind you in the app, but cannot verify validity or subtract expired data from your recorded balance.</p>`;
  else if (tab === "airtime")
    body = `${field("Airtime credit (₵)", "amount", "number", record?.amount ?? "", 'min="0.01" step="0.01" required placeholder="e.g. 20.00"')}${field("Amount paid (₵)", "cost", "number", record?.cost ?? "", 'min="0" step="0.01" required placeholder="e.g. 20.00"')}`;
  else if (tab === "usage")
    body = `<div class="field full"><label for="f-app">App name</label><input id="f-app" name="app" list="app-names" maxlength="80" value="${esc(record?.app ?? "")}" placeholder="e.g. WhatsApp" required><datalist id="app-names">${Object.keys(
      categories,
    )
      .map((a) => `<option value="${a}">`)
      .join(
        "",
      )}</datalist></div>${field("Data used (MB)", "mb", "number", record?.mb ?? "", 'min="0.01" step="0.01" required placeholder="e.g. 250"', true)}<div class="field full"><label class="checkbox-label"><input type="checkbox" name="background" ${record?.background ? "checked" : ""}>This was background data usage</label></div>`;
  else
    body = `${field("Contact or number", "contact", "text", record?.contact ?? "", 'maxlength="80" required placeholder="e.g. Mum"', true)}${field("Minutes", "minutes", "number", record ? Math.floor(record.duration / 60) : "", 'min="0" max="99999" step="1" required placeholder="e.g. 5"')}${field("Seconds", "seconds", "number", record ? Math.round(record.duration % 60) : 0, 'min="0" max="59" step="1" required')}<div class="field full"><label for="f-costmode">How should this call be charged?</label><select name="costMode" id="f-costmode"><option value="estimate" ${record?.estimated !== false && knownRate ? "selected" : ""} ${!knownRate ? "disabled" : ""}>Estimate from my SIM rate</option><option value="actual" ${record?.estimated === false || !knownRate ? "selected" : ""}>I know the actual charge</option></select></div><div class="field full" id="actual-cost-field" ${record?.estimated === false || !knownRate ? "" : "hidden"}><label for="f-cost">Actual charge (₵)</label><input id="f-cost" name="cost" type="number" min="0" step="0.01" value="${record?.estimated === false || !knownRate ? esc(record?.cost ?? "") : ""}" ${record?.estimated === false || !knownRate ? "required" : ""}></div><div class="field full"><p class="field-note" id="call-estimate">${knownRate ? money(sim.rate) + " per started minute · manual estimate. Carrier charges may differ." : "No rate is configured. Enter the actual charge, or set your own estimate in My SIMs."}</p></div>`;
  openModal(
    `${modalHeader(record ? "Edit record" : "Add a little clarity.", record ? "Update the details below. Your totals will recalculate." : "Record a purchase, data usage or call for the right SIM.")}<div class="modal-tabs" role="tablist" aria-label="Record type">${tabs.map(([id, label]) => `<button role="tab" aria-selected="${tab === id}" data-action="record-tab" data-tab="${id}" class="${tab === id ? "active" : ""}" ${record ? "disabled" : ""}>${label}</button>`).join("")}</div><form id="record-form" data-edit-id="${esc(record?.id || "")}"><div class="form-grid">${simSelect(id)}${body}${field("Date & time", "timestamp", "datetime-local", localInputDate(record?.timestamp), "required", true)}</div><div class="info-box">${mode === "demo" ? "You are editing sample records. Switch to your personal tracker to log real usage." : tab === "usage" ? "Enter usage from your phone settings or carrier records. Use Connections in the Android app for measured usage; entries in this form are manual." : "This record is saved on this device. It does not change your carrier balance."}</div><div id="form-error" class="form-error" role="alert"></div><div class="modal-footer"><button type="button" class="secondary-btn" data-action="close">Cancel</button><button type="submit" class="primary-btn">${icon("check")}${record ? "Save changes" : "Save record"}</button></div></form>`,
  );
}
function showSimForm(id) {
  const sim = state.sims.find((s) => s.id === id);
  if (!sim && state.sims.length >= 2) {
    openModal(
      `${modalHeader("Manage your SIMs", "You can track two SIMs. Edit a profile to match your carrier.")}<div class="support-grid">${state.sims.map((s) => `<button class="secondary-btn" data-action="edit-sim" data-id="${esc(s.id)}">${simDot(s)}${esc(s.carrier)} · SIM ${s.slot} ${icon("edit")}</button>`).join("")}</div>`,
    );
    return;
  }
  openModal(
    `${modalHeader(sim ? "Edit your SIM" : "Add a SIM", "Set a label, daily budget and rate for call estimates.")}<form id="sim-form" data-id="${esc(sim?.id || "")}"><div class="form-grid">${field("Carrier", "carrier", "text", sim?.carrier ?? "", 'required maxlength="80" placeholder="e.g. MTN"')}${field("Label", "label", "text", sim?.label ?? "", 'required maxlength="80" placeholder="e.g. Personal"')}<div class="field"><label for="f-slot">SIM slot</label><select name="slot" id="f-slot"><option value="1" ${sim?.slot === 1 ? "selected" : ""}>SIM 1</option><option value="2" ${sim?.slot === 2 ? "selected" : ""}>SIM 2</option></select></div>${field("Color", "color", "color", sim?.color ?? "#8da86c")}${field("Call rate (₵ / min)", "rate", "number", sim?.rateSource === "unset" ? "" : (sim?.rate ?? ""), 'min="0" step="0.01" placeholder="Not configured"')}${field("Daily data budget (MB)", "dailyLimitMB", "number", sim?.dailyLimitMB ?? 1000, 'required min="1" step="1"')}${field("Monthly spending budget (₵, optional)", "monthlySpendLimit", "number", sim?.monthlySpendLimit ?? "", 'min="0.01" max="10000000" step="0.01" placeholder="e.g. 150.00"', true)}</div><div class="info-box">Daily usage is a data-volume target. The optional monthly spending budget tracks the cash paid for recorded data and airtime purchases. Call charges are excluded to avoid counting a top-up twice. Telvyo cannot block purchases or send push alerts.</div><div id="form-error" class="form-error" role="alert"></div><div class="modal-footer"><button type="button" class="secondary-btn" data-action="close">Cancel</button><button type="submit" class="primary-btn">Save SIM</button></div></form>`,
  );
}
function showAppDetail(app) {
  const s = summary(),
    a = s.appUsage.find((v) => v.app === app);
  if (!a) return;
  openModal(
    `${modalHeader(esc(app), `${days === 1 ? "Today" : `Last ${days} days`} · ${simId === "all" ? "All SIMs" : esc(simFor(simId).carrier)} · ${mode === "demo" ? "Sample records" : "Manual records"}`)}<div class="detail-stats"><div><span>Total data</span><strong>${amount(a.mb)}</strong></div><div><span>Background data</span><strong>${amount(a.backgroundMB)}</strong></div></div><div class="modal-records">${usageTable(s.usage.filter((r) => r.app.trim() === app))}</div><div class="info-box">${a.percent.toFixed(1)}% of all recorded data in this period. Activity is labeled from each record; it is not detected automatically.</div>`,
    true,
  );
}
function showHelp() {
  openModal(
    `${modalHeader("A clearer view starts here.", "Telvyo is your mobile data and airtime ledger.")}<div class="support-grid"><div class="support-item"><strong>${icon("sim")}1. Set up your SIMs</strong><p>Match each SIM profile to your carrier. Set a daily budget and optional call rate.</p></div><div class="support-item"><strong>${icon("wallet")}2. Log your next purchase</strong><p>Record your data allowance or airtime credit, what you paid, and the exact purchase time.</p></div><div class="support-item"><strong>${icon("data")}3. Track where it goes</strong><p>Add usage from your phone’s cellular settings and calls from your records. Enter incremental usage amounts to avoid double counting.</p></div></div><div class="info-box"><strong>About automatic tracking</strong><br>The Android app can detect active SIMs and read aggregate mobile app usage after permission. Open Connections to enable access. Per-SIM byte attribution is restricted; iOS does not expose equivalent other-app usage. Carrier feeds are needed for verified charges.</div>`,
  );
}
function showTips() {
  openModal(
    `${modalHeader("A little data goes a long way.", "Small changes that can help your next bundle last.")}<div class="support-grid">${[
      [
        "play",
        "Choose a lower video quality",
        "Set streaming apps to data saver. Download videos on Wi-Fi before you go out.",
      ],
      [
        "refresh",
        "Keep updates on Wi-Fi",
        "In your app store, turn off app updates and automatic downloads over mobile data.",
      ],
      [
        "message",
        "Limit automatic media downloads",
        "In WhatsApp, choose which photos and videos may download on mobile data.",
      ],
      [
        "shield",
        "Check background activity",
        "Review your phone’s cellular settings. Disable background mobile data for apps that do not need it.",
      ],
    ]
      .map(
        ([i, t, p]) =>
          `<div class="support-item"><strong>${icon(i)}${t}</strong><p>${p}</p></div>`,
      )
      .join("")}</div>`,
  );
}
function showAlerts() {
  const alerts = dailyBudgetAlerts(state);
  const expiry = bundleExpiryWatch(state);
  const spending = monthlySpending(state).rows.filter(a => a.limit !== null);
  openModal(
    `${modalHeader("Your daily data budget", "Based on today's manually logged data. No carrier feed or background notifications are active.")}<div>${alerts.length ? alerts.map(a => `<div class="notice-row"><strong>${esc(a.carrier)} · SIM ${esc(a.slot)} · ${amount(a.usedMB)} of ${a.limitMB === null ? "unconfigured" : amount(a.limitMB)} budget</strong>${a.status === "reached" ? a.exceededMB > 0 ? amount(a.exceededMB) + " above your daily budget. Review usage or switch to Wi-Fi." : "Your logged usage reached today's budget." : a.status === "approaching" ? "Approaching your budget: 80% or more used. Consider Wi-Fi." : a.status === "within" ? amount(a.remainingMB) + " left in your manually configured daily budget." : "Set a daily budget in My SIMs."}</div>`).join("") : "<p>No SIM profiles yet. Set up your first SIM to track a daily budget.</p>"}</div>${expiry.soon.length || expiry.recentlyExpired.length ? `<h3 class="modal-section-title">Bundle expiry reminders</h3><div>${[...expiry.soon, ...expiry.recentlyExpired].slice(0, 8).map(item => `<div class="notice-row"><strong>${esc(item.carrier)} · SIM ${esc(item.slot)} · ${amount(item.amountMB)}</strong>${item.status === "soon" ? "Recorded expiry approaching" : "Recorded expiry passed"}: ${esc(expiryFmt(item.expiresAt))}. Confirm the actual balance with your network.</div>`).join("")}</div>` : ""}${spending.length ? `<h3 class="modal-section-title">Monthly spending budgets</h3><div>${spending.map(a => `<div class="notice-row"><strong>${esc(a.carrier)} · SIM ${esc(a.slot)} · ${money(a.spent)} of ${money(a.limit)}</strong>${a.status === "reached" ? "Monthly spending budget reached" : a.status === "approaching" ? "Approaching monthly spending budget" : money(a.remaining) + " left in your recorded spending budget"}.</div>`).join("")}</div>` : ""}<div class="info-box">Budget checks update when you open the app or save a usage record. Android OS measurements and official MTN, Telecel or AT consumption are not included in these totals.</div>`,
  );
}
function showEraseLocalForm() {
  if (mode !== "personal") {
    toast("Switch to the personal workspace to erase your own records.");
    return;
  }
  openModal(
    `${modalHeader("Erase all personal data?", "This action cannot be undone on this device.")}<form id="erase-local-form"><p class="modal-sub">This removes all personal SIM profiles, purchases, usage entries and calls from this browser or app. The demo workspace stays unchanged. Export your backup first if you need it.</p><div class="field full"><label for="erase-local-confirm">Type DELETE to confirm</label><input id="erase-local-confirm" name="confirmation" type="text" maxlength="6" autocapitalize="characters" autocomplete="off" spellcheck="false" placeholder="DELETE" aria-describedby="erase-local-warning" required></div><p id="erase-local-warning" class="field-note">Downloaded backups and Android system permissions are not erased.</p><p id="erase-local-error" class="form-error" role="alert" aria-live="polite"></p><div class="modal-footer"><button class="secondary-btn" data-action="close" type="button">Cancel</button><button class="primary-btn danger-btn" type="submit">Erase my local data</button></div></form>`,
  );
  modal.querySelector("#erase-local-confirm")?.focus();
}
function eraseLocalData(confirmation) {
  const report = modal.querySelector("#erase-local-error");
  if (mode !== "personal" || confirmation !== "DELETE") {
    if (report) report.textContent = "Type DELETE exactly to confirm.";
    return false;
  }
  try {
    localStorage.removeItem("telco.personal.v1");
    if (localStorage.getItem("telco.personal.v1") !== null)
      throw Error("Local data remains in storage.");
  } catch {
    if (report)
      report.textContent = "This device could not erase saved records. Your personal workspace was not cleared. Check storage permissions and try again.";
    return false;
  }
  // Update in-memory data only after persistent removal is confirmed.
  memoryStates.personal = { ...createEmpty(), sims: [] };
  state = memoryStates.personal;
  simId = "all";
  page = "sims";
  connected.clearSession();
  closeModal();
  render();
  toast("Personal SIMs and recorded data erased from this device.");
  return true;
}
function confirmAction(title, body, button, action, danger = false) {
  openModal(
    `${modalHeader(title)}<p class="modal-sub">${body}</p><div class="modal-footer"><button class="secondary-btn" data-action="close">Cancel</button><button class="primary-btn ${danger ? "danger-btn" : ""}" data-action="${action}">${button}</button></div>`,
  );
}
let pendingDelete = null,
  pendingRestore = null;
async function download(data, filename, mime) {
  const cap = globalThis.Capacitor;
  if (cap?.isNativePlatform?.()) {
    if (!cap.Plugins?.Filesystem || !cap.Plugins?.Share) {
      toast("Sharing is unavailable in this native build.");
      return;
    }
    try {
      const file = await cap.Plugins.Filesystem.writeFile({
        path: filename,
        data,
        directory: "CACHE",
        encoding: "utf8",
      });
      await cap.Plugins.Share.share({
        title: "Telvyo usage report",
        url: file.uri,
        dialogTitle: "Export report",
      });
      toast("Report shared.");
    } catch (e) {
      if (!/cancel|dismiss|not shared|aborted/i.test(e.message || ""))
        toast("Could not share the report. Your records are unchanged.");
    }
    return;
  }
  const url = URL.createObjectURL(new Blob([data], { type: mime }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
  toast("Your export is ready.");
}
function validatedBackup(value) {
  const x = value?.data || value;
  if (
    !x ||
    x.version !== 1 ||
    !["sims", "usage", "purchases", "calls"].every((k) =>
      Array.isArray(x[k]),
    ) ||
    x.sims.length > 2
  )
    throw Error("This is not a valid Telvyo backup.");
  for (const [kind, key] of [
    ["sim", "sims"],
    ["usage", "usage"],
    ["purchase", "purchases"],
    ["call", "calls"],
  ]) {
    const ids = new Set();
    if (x[key].length > 50000)
      throw Error("This backup contains too many records.");
    for (const r of x[key]) {
      const error = validateRecord(kind, r, x);
      if (error) throw Error(error);
      if (ids.has(r.id)) throw Error("This backup contains duplicate records.");
      ids.add(r.id);
    }
  }
  return x;
}
function compareBackupToLocal(current, incoming) {
  const groups = [
    ["sims", "SIM profiles"], ["purchases", "Purchases"],
    ["usage", "Data usage"], ["calls", "Calls"],
  ];
  return groups.map(([key, label]) => {
    const before = new Map(current[key].map(item => [item.id, item]));
    const after = new Map(incoming[key].map(item => [item.id, item]));
    const added = incoming[key].filter(item => !before.has(item.id)).length;
    const removed = current[key].filter(item => !after.has(item.id)).length;
    const changed = incoming[key].filter(item => before.has(item.id) &&
      JSON.stringify(before.get(item.id)) !== JSON.stringify(item)).length;
    return { label, existing: before.size, incoming: after.size,
      added, removed, changed };
  });
}

function showRestoreReview(preview) {
  const rows = compareBackupToLocal(state, preview.ledger);
  const totals = rows.reduce((sum, item) => ({
    added:sum.added+item.added, removed:sum.removed+item.removed,
    changed:sum.changed+item.changed,
  }), {added:0,removed:0,changed:0});
  openModal(
    `${modalHeader("Review backup replacement", "Nothing has been changed yet. Check the differences before choosing to replace local data.")}
    <form id="restore-form">
      <div class="restore-review" role="table" aria-label="Local and backup record comparison">
        <div class="restore-review-row restore-review-heading" role="row">
          <span role="columnheader">Record type</span><span role="columnheader">On device</span><span role="columnheader">Backup</span><span role="columnheader">Will change</span>
        </div>
        ${rows.map(row => `<div class="restore-review-row" role="row">
          <strong role="cell">${row.label}</strong><span role="cell">${row.existing}</span>
          <span role="cell">${row.incoming}</span>
          <span role="cell">+${row.added} / −${row.removed} / ~${row.changed}</span>
        </div>`).join("")}
      </div>
      <div class="info-box"><strong>Replacing, not merging.</strong>
        ${totals.removed} existing entries will be removed, ${totals.changed} will be changed, and ${totals.added} backup-only entries will be added.
        Your current SIM settings and personal history will be replaced in this workspace.
        The other workspace stays unchanged. Export a fresh backup of your current records before continuing.
      </div>
      <div class="field full"><label for="restore-confirmation">Type RESTORE to confirm replacement</label>
        <input name="confirmation" id="restore-confirmation" type="text" maxlength="7" autocomplete="off"
          autocapitalize="characters" spellcheck="false" placeholder="RESTORE"
          aria-describedby="restore-safety" required>
      </div>
      <p class="field-note" id="restore-safety">A backup is not a verified carrier record. This action cannot automatically undo replacements.</p>
      <p id="restore-error" class="form-error" role="alert" aria-live="polite"></p>
      <div class="modal-footer"><button type="button" class="secondary-btn" data-action="close">Cancel</button>
        <button type="submit" class="primary-btn danger-btn">Replace my local data</button></div>
    </form>`,
    true,
  );
  modal.querySelector("#restore-confirmation")?.focus();
}

function applyReviewedRestore(confirmation) {
  const error = modal.querySelector("#restore-error");
  if (!pendingRestore || confirmation !== "RESTORE") {
    if (error) error.textContent = "Type RESTORE exactly to confirm.";
    return false;
  }
  if (pendingRestore.workspace !== mode || pendingRestore.previousState !== state) {
    if (error) error.textContent = "Your workspace has changed since the preview. Choose the backup again.";
    return false;
  }
  // Persist FIRST. A storage failure never silently overwrites in-memory
  // personal records or announces that the restore succeeded.
  const key = `telco.${mode}.v1`;
  const serialized = JSON.stringify(pendingRestore.ledger);
  try {
    localStorage.setItem(key, serialized);
    if (localStorage.getItem(key) !== serialized)
      throw Error("The restored data could not be verified in device storage.");
  } catch {
    storageIssue = true;
    if (error) error.textContent = "Device storage could not save this backup. Your current in-app records have not been replaced. Check storage permissions before retrying.";
    return false;
  }
  state = pendingRestore.ledger;
  memoryStates[mode] = state;
  simId = "all";
  connected.clearSession();
  pendingRestore = null;
  closeModal();
  render();
  toast("Backup restored to this device.");
  return true;
}

function importBackup() {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".json,application/json";
  input.addEventListener("change", async () => {
    const file = input.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      toast("Choose a backup smaller than 10 MB.");
      return;
    }
    try {
      const parsed = JSON.parse(await file.text());
      const backupMode = parsed.workspace;
      if (backupMode && !["personal", "demo"].includes(backupMode))
        throw Error("This backup has an unknown workspace label.");
      if (backupMode && backupMode !== mode)
        throw Error(
          `Switch to the ${backupMode} workspace before restoring this backup.`,
        );
      const ledger = validatedBackup(parsed);
      pendingRestore = { ledger, workspace: mode, previousState: state };
      showRestoreReview(pendingRestore);
    } catch (e) {
      toast(e.message || "The backup could not be read.");
    }
  });
  input.click();
}
root.addEventListener("change", (e) => {
  if (e.target.id === "period") {
    days = Number(e.target.value);
    render();
  }
});
document.addEventListener("click", async (e) => {
  const b = e.target.closest("[data-action],[data-page],[data-sim]");
  if (!b) return;
  e.preventDefault();
  if (b.dataset.page) {
    moreOpen = false;
    page = b.dataset.page;
    render();
    window.scrollTo?.({ top: 0, behavior: "instant" });
    return;
  }
  if (b.dataset.sim) {
    simId = b.dataset.sim;
    connected.clearAnswer();
    render();
    return;
  }
  const action = b.dataset.action;
  if (action === "more") {
    moreOpen = !moreOpen;
    render();
    root.querySelector(".more-nav-button")?.focus();
    return;
  }
  if (moreOpen && b.closest(".mobile-more-sheet")) {
    moreOpen = false;
    render();
  }
  if (connected.handles(action)) {
    void connected.handleAction(action, b);
    return;
  }
  if (action === "close") closeModal();
  else if (action === "add")
    showRecordForm(
      b.dataset.tab ||
        (["airtime", "purchases"].includes(page)
          ? page === "airtime"
            ? "call"
            : "data"
          : page === "data"
            ? "usage"
            : "data"),
    );
  else if (action === "record-tab") showRecordForm(b.dataset.tab);
  else if (action === "add-sim" || action === "manage-sims") showSimForm();
  else if (action === "edit-sim") showSimForm(b.dataset.id);
  else if (action === "app-detail") showAppDetail(b.dataset.app);
  else if (action === "help") showHelp();
  else if (action === "tips") showTips();
  else if (action === "alerts") showAlerts();
  else if (action === "erase-local") showEraseLocalForm();
  else if (action === "switch-mode")
    confirmAction(
      mode === "demo"
        ? "Start your personal tracker?"
        : "Open the demo workspace?",
      mode === "demo"
        ? memoryStates.personal || readStorage("telco.personal.v1")
          ? "Your personal records will be reopened. Your demo stays separate."
          : "Your personal tracker starts with no usage records. Set up the SIM profiles to match your phone, then log your first purchase. Your demo stays separate."
        : "Your personal records will stay saved on this device. You can switch back any time.",
      mode === "demo" ? "Start tracking" : "Open demo",
      "confirm-switch",
    );
  else if (action === "confirm-switch") {
    connected.clearSession();
    mode = mode === "demo" ? "personal" : "demo";
    writeStorage("telco.mode", mode);
    state = loadState();
    simId = "all";
    page = mode === "personal" ? "sims" : "overview";
    closeModal();
    render();
    toast(
      mode === "personal"
        ? "Your tracker is ready. Set up your SIMs first."
        : "Welcome back to the demo.",
    );
  } else if (action === "export")
    await download(
      toCSV(state, { ...options(), demo: mode === "demo" }),
      `telvyo-${mode}-${days}-day-report.csv`,
      "text/csv;charset=utf-8",
    );
  else if (action === "backup")
    await download(
      JSON.stringify(
        {
          app: "Telvyo",
          workspace: mode,
          exportedAt: new Date().toISOString(),
          data: state,
        },
        null,
        2,
      ),
      `telvyo-${mode}-backup.json`,
      "application/json",
    );
  else if (action === "import") importBackup();
  else if (action === "reset")
    confirmAction(
      mode === "demo"
        ? "Reset the sample workspace?"
        : "Clear your personal records?",
      mode === "demo"
        ? "Your demo edits will be replaced with the original sample records. Personal records will stay saved."
        : "This removes all purchases, usage entries and calls in your personal workspace. Your SIM settings stay. Download a backup first if you need these records.",
      "Reset records",
      "confirm-reset",
      true,
    );
  else if (action === "confirm-reset") {
    const next =
      mode === "demo"
        ? createDemo()
        : { ...state, purchases: [], usage: [], calls: [] };
    const persisted = save(next);
    closeModal();
    render();
    toast(
      persisted
        ? "Records reset."
        : "Reset in memory only. Storage unavailable.",
    );
  } else if (action === "delete-record") {
    pendingDelete = { kind: b.dataset.kind, id: b.dataset.id };
    confirmAction(
      "Remove this record?",
      "The record will be removed from this workspace and your totals will update.",
      "Remove record",
      "confirm-delete",
      true,
    );
  } else if (action === "confirm-delete") {
    const key = { usage: "usage", purchase: "purchases", call: "calls" }[
      pendingDelete.kind
    ];
    const persisted = save({
      ...state,
      [key]: state[key].filter((r) => r.id !== pendingDelete.id),
    });
    pendingDelete = null;
    closeModal();
    render();
    toast(
      persisted
        ? "Record removed."
        : "Removed in memory only. Storage unavailable.",
    );
  } else if (action === "edit-record") {
    const kind = b.dataset.kind,
      key = { usage: "usage", purchase: "purchases", call: "calls" }[kind],
      record = state[key].find((r) => r.id === b.dataset.id);
    if (record)
      showRecordForm(kind === "purchase" ? record.type : kind, record);
  }
});
modal.addEventListener("click", (e) => {
  if (e.target === modal) {
    const rect = modal.getBoundingClientRect();
    if (
      e.clientX < rect.left ||
      e.clientX > rect.right ||
      e.clientY < rect.top ||
      e.clientY > rect.bottom
    )
      closeModal();
  }
});
modal.addEventListener("cancel", () => {
  returnFocus?.focus?.();
});
modal.addEventListener("change", (e) => {
  if (e.target.id === "f-costmode") {
    const actual = e.target.value === "actual";
    const el = document.querySelector("#actual-cost-field");
    el.hidden = !actual;
    document.querySelector("#f-cost").required = actual;
  }
  updateEstimate();
});
modal.addEventListener("input", () => updateEstimate());
function updateEstimate() {
  const form = document.querySelector("#record-form"),
    el = document.querySelector("#call-estimate");
  if (!form || !el) return;
  const fd = new FormData(form),
    sim = simFor(fd.get("simId"));
  const secs = Number(fd.get("minutes")) * 60 + Number(fd.get("seconds"));
  if (sim.rateSource === "unset") {
    el.textContent =
      "No call rate is configured. Enter the actual charge from your carrier.";
    return;
  }
  el.textContent = `${money(sim.rate)} per started minute${secs > 0 ? ` · Estimated cost: ${money(callCharge(secs, sim.rate))}` : ""}. Carrier charges may differ.`;
}
modal.addEventListener("submit", (e) => {
  e.preventDefault();
  const form = e.target,
    fd = new FormData(form);
  if (form.id === "erase-local-form") {
    eraseLocalData(fd.get("confirmation"));
    return;
  }
  if (form.id === "restore-form") {
    applyReviewedRestore(fd.get("confirmation"));
    return;
  }
  let kind, record;
  try {
    if (form.id === "sim-form") {
      kind = "sim";
      record = {
        ...state.sims.find((s) => s.id === form.dataset.id),
        id: form.dataset.id || uid(),
        carrier: fd.get("carrier"),
        label: fd.get("label"),
        slot: Number(fd.get("slot")),
        color: fd.get("color"),
        rate: Number(fd.get("rate")),
        rateSource: String(fd.get("rate") || "").trim() ? "manual" : "unset",
        dailyLimitMB: Number(fd.get("dailyLimitMB")),
        monthlySpendLimit: String(fd.get("monthlySpendLimit") ?? "").trim() === "" ? null : Number(fd.get("monthlySpendLimit")),
      };
    } else if (form.id === "record-form") {
      const timestamp = new Date(fd.get("timestamp"));
      if (!Number.isFinite(timestamp.getTime()))
        throw Error("Choose a valid date and time.");
      record = {
        id: editing?.id || uid(),
        simId: fd.get("simId"),
        timestamp: timestamp.toISOString(),
      };
      if (formTab === "data" || formTab === "airtime") {
        kind = "purchase";
        record = {
          ...record,
          type: formTab,
          amount: Number(fd.get("amount")) * (formTab === "data" ? 1000 : 1),
          cost: Number(fd.get("cost")),
        };
        if (formTab === "data" && String(fd.get("expiresAt") || "").trim()) {
          const expiry = new Date(fd.get("expiresAt"));
          if (!Number.isFinite(expiry.getTime()))
            throw Error("Choose a valid optional bundle expiry date and time.");
          record.expiresAt = expiry.toISOString();
        }
      } else if (formTab === "usage") {
        kind = "usage";
        record = {
          ...record,
          app: fd.get("app"),
          mb: Number(fd.get("mb")),
          background: fd.get("background") === "on",
        };
      } else {
        kind = "call";
        const duration =
          Number(fd.get("minutes")) * 60 + Number(fd.get("seconds"));
        const estimated = fd.get("costMode") === "estimate";
        if (estimated && simFor(record.simId).rateSource === "unset")
          throw Error(
            "No call rate is configured. Enter the actual charge or set a manual estimate.",
          );
        record = {
          ...record,
          contact: fd.get("contact"),
          duration,
          estimated,
          cost: estimated
            ? callCharge(duration, simFor(record.simId).rate)
            : Number(fd.get("cost")),
        };
      }
    } else return;
    let base = state;
    if (editing && form.id === "record-form") {
      const key = { purchase: "purchases", usage: "usage", call: "calls" }[
        kind
      ];
      base = { ...state, [key]: state[key].filter((r) => r.id !== editing.id) };
    }
    const next = addRecord(base, kind, record);
    const persisted = save(next);
    editing = null;
    closeModal();
    render();
    toast(
      persisted
        ? `${kind === "sim" ? "SIM settings" : "Record"} saved${mode === "demo" ? " to the demo" : ""}.`
        : "Record kept in memory. Storage unavailable — export before closing.",
    );
  } catch (error) {
    const el = document.querySelector("#form-error");
    if (el)
      el.textContent = error.message || "Check the details and try again.";
  }
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && moreOpen) {
    moreOpen = false;
    render();
    root.querySelector(".more-nav-button")?.focus();
  }
});
render();
void connected.initialize();
// Browser-only offline shell. Native Capacitor assets are already packaged
// and must not be shadowed by a browser service-worker cache.
if (globalThis.window?.navigator?.serviceWorker &&
    globalThis.window.location?.protocol === "https:" &&
    !globalThis.Capacitor?.isNativePlatform?.()) {
  window.addEventListener("load", () => {
    void window.navigator.serviceWorker.register("./service-worker.js").catch(() => {
      // The tracker still works online and in the native wrapper without SW.
    });
  }, { once: true });
}
if (storageIssue)
  setTimeout(
    () =>
      toast(
        "Saved records could not be loaded or storage is unavailable. Export before closing.",
      ),
    500,
  );
