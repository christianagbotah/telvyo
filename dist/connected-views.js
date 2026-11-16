import { analyzeUsage, generateAnswer } from "./insights.js";
import { createDeviceClient, mergeDetectedSims } from "./device.js";

/** UI for device measurements, local analysis, and explicit integration states. */
export function createConnectedFeatures(ctx) {
  const {
    esc,
    icon,
    amount,
    money,
    toast,
    render,
    getState,
    getMode,
    save,
    openModal,
    modalHeader,
  } = ctx;
  const client = createDeviceClient();
  let capabilities = null,
    detected = null,
    snapshot = null,
    busy = "",
    error = "",
    answer = "",
    deviceDays = 7,
    lastRefresh = 0,
    lastPermissionCheck = 0;
  const actions = new Set([
    "detect-sims",
    "use-detected",
    "usage-settings",
    "refresh-device",
    "carrier-details",
    "advisor-prompt",
    "clear-device",
    "check-device",
  ]);
  const carrierInfo = {
    mtn: {
      name: "MTN",
      color: "#FFCD00",
      url: "https://developers.mtn.com/products/usage-management",
      detail:
        "Telvyo has production approval for MTN Usage Management. Customer access remains disabled while application authentication, MTN-approved subscriber consent, Ghana routing values and billing-field mapping are verified.",
    },
    telecel: {
      name: "Telecel",
      color: "#D82135",
      url: "https://telecel.com.gh/contact-us/",
      detail:
        "A public Ghana subscriber billing API has not been verified. Telecel must provide partner documentation, customer-consent requirements and production access before this connection can be enabled.",
    },
    at: {
      name: "AT",
      color: "#0068BF",
      url: "https://www.at.com.gh/personal/customer-care",
      detail:
        "AT partner documentation and production access are required for subscriber balances and rated usage. Airtime reseller access alone does not provide a subscriber’s balance or full call history.",
    },
  };
  const sourceLabel = () =>
    getMode() === "demo" ? "Sample records" : "Recorded entries";
  const analysis = () =>
    analyzeUsage(getState(), {
      simId: ctx.getSimId(),
      source: getMode() === "demo" ? "demo" : "manual",
    });
  function setup() {
    const native = client.supported;
    return `<section class="setup-empty"><div class="source-badge">${icon("bolt")} READY WHEN YOU ARE</div><h2>${native ? "Connect your phone.<br>Understand every megabyte." : "Start with your SIMs.<br>Make usage visible."}</h2><p>${native ? "Discover your SIMs and measure mobile data in the Android app. Carrier-verified balances require approved access and consent." : "Add a SIM profile, then log bundle purchases, data usage and calls. Automatic phone measurements require the Android app; official carrier balances are not connected."}</p><div class="record-actions">${native ? `<button class="primary-btn" data-page="device">${icon("sim")}Connect my phone</button><button class="secondary-btn" data-action="add-sim">Add a SIM profile</button>` : `<button class="primary-btn" data-action="add-sim">${icon("sim")}Add my first SIM</button><button class="secondary-btn" data-page="device">About connections</button>`}<button class="quiet-btn" data-action="switch-mode">Explore sample data ${icon("arrow")}</button></div><div class="carrier-stripe"><span style="--carrier:#FFCD00">MTN</span><span style="--carrier:#D82135">Telecel</span><span style="--carrier:#0068BF">AT</span></div></section><div class="connection-grid section-gap">${[
      [
        "sim",
        "Your networks",
        "Active SIM discovery on Android, after your permission.",
      ],
      [
        "data",
        "Your consumption",
        "Device-measured app usage, with clear collection timestamps.",
      ],
      [
        "spark",
        "Your next move",
        "Usage trends, unusual days and evidence-based recommendations.",
      ],
    ]
      .map(
        ([i, t, p]) =>
          `<section class="card"><h2>${icon(i)} ${t}</h2><p class="card-sub">${p}</p></section>`,
      )
      .join("")}</div>`;
  }
  function renderReadiness() {
    const native = client.supported;
    const apiLevel = capabilities?.androidApiLevel;
    const phone = !native ? "Android native app required"
      : !capabilities ? "Not checked"
      : capabilities.simDetection === false ? "Device has no supported telephony"
      : capabilities.phonePermission === "granted" ? "Permission granted"
      : capabilities.phonePermission === "denied" ? "Permission denied"
      : "Permission not yet granted";
    const mobile = !native ? "Android native app required"
      : !capabilities ? "Not checked"
      : capabilities.mobileUsageSupported === false ? "Android 10+ required"
      : capabilities.usageAccess ? "Usage access granted"
      : "Usage access not granted";
    const phoneReady = native && capabilities?.simDetection !== false &&
      capabilities?.phonePermission === "granted";
    const usageReady = native && capabilities?.mobileUsageSupported !== false &&
      capabilities?.usageAccess === true;
    return `<section class="card device-readiness" aria-label="Device readiness checks">
      <div class="card-heading"><h2>${icon("shield")} Device readiness</h2>
        <button class="secondary-btn" type="button" data-action="check-device"
          ${busy || !native || getMode() === "demo" ? "disabled" : ""}>
          ${icon("refresh")}${busy === "check" ? "Checking…" : "Check permissions"}
        </button></div>
      <p class="card-sub">Checks your phone's permission status without requesting access, scanning SIMs or measuring data. Nothing is uploaded.</p>
      <div class="device-readiness-grid">
        <div class="device-readiness-item"><strong>SIM discovery</strong>
          <span class="status-chip ${phoneReady ? "connected" : "pending"}">${esc(phone)}</span>
          <small>${phoneReady ? "You can choose Detect my SIMs below." : "Choose Detect my SIMs to request Phone permission only when needed."}</small></div>
        <div class="device-readiness-item"><strong>Mobile usage</strong>
          <span class="status-chip ${usageReady ? "connected" : "pending"}">${esc(mobile)}</span>
          <small>${capabilities?.mobileUsageSupported === false && native ? "This Android version cannot use Telvyo's all-mobile NetworkStats query." : "Use Android Usage access settings below; returning here will recheck access."}</small></div>
      </div>
      <p class="metric-evidence">Platform: ${native ? "Android" : "Browser / unsupported native platform"}${Number.isInteger(apiLevel) ? " · API " + apiLevel : ""} · ${lastPermissionCheck ? "Last checked: " + esc(new Date(lastPermissionCheck).toLocaleString()) : "Not checked yet"}.</p>
      <p class="metric-evidence">This is an app capability check, not a carrier connection test or proof of correct usage totals. Android permission changes can invalidate earlier measurements.</p>
    </section>`;
  }
  async function recheckPermissions({ refreshExistingUsage = false } = {}) {
    const next = await client.capabilities();
    capabilities = next;
    lastPermissionCheck = Date.now();
    if (next.phonePermission !== "granted" || next.simDetection === false)
      detected = null;
    if (!next.usageAccess || next.mobileUsageSupported === false) {
      snapshot = null;
      lastRefresh = 0;
      return;
    }
    if (refreshExistingUsage && snapshot &&
        Date.now() - lastRefresh > 60000 && getMode() === "personal") {
      const updated = await client.usage(deviceDays);
      const verified = await client.capabilities();
      capabilities = verified;
      lastPermissionCheck = Date.now();
      if (!verified.usageAccess || verified.mobileUsageSupported === false) {
        snapshot = null;
        lastRefresh = 0;
      } else {
        snapshot = updated;
        lastRefresh = Date.now();
      }
    }
  }
  function renderDevice() {
    const native = client.supported;
    const platform =
      capabilities?.platform || globalThis.Capacitor?.getPlatform?.() || "web";
    return `<div class="device-page">${renderReadiness()}<section class="connection-banner"><div><span class="source-badge">${icon("shield")} DEVICE & CARRIER CONNECTIONS</span><h2>Your phone knows the usage.<br>Your network knows the bill.</h2><p>Keep both sources clear. A detected SIM does not automatically authorize access to its carrier account.</p></div><span class="status-chip">${native ? "Android app" : platform === "ios" ? "iPhone app" : "Browser preview"}</span></section><div class="connection-grid section-gap"><section class="card connection-card"><div class="card-heading"><h2>${icon("sim")} SIM discovery</h2><span class="status-chip ${detected ? "connected" : ""}">${detected ? "Scanned" : native ? "Available" : "Android required"}</span></div><p>${native ? "Allow phone-state access to read your active carriers and SIM slots. No phone number, IMSI, messages or contacts are requested." : platform === "ios" ? "iOS does not expose reliable automatic SIM discovery to ordinary apps. Use a manual profile or an approved carrier connection." : "Install the Android build to discover physical SIMs. A browser cannot read the SIMs in your phone."}</p><button class="primary-btn" data-action="detect-sims" ${busy || !native ? "disabled" : ""}>${icon("sim")}${busy === "detect" ? "Detecting…" : "Detect my SIMs"}</button>${detected ? `<div class="support-grid">${detected.sims.length ? detected.sims.map((s) => `<div class="support-item"><strong>${esc(s.carrier)} · SIM ${s.slot}</strong><p>${s.isDefaultData ? "Default mobile data line" : ""}${s.isDefaultData && s.isDefaultVoice ? " · " : ""}${s.isDefaultVoice ? "Default voice line" : ""}${!s.isDefaultData && !s.isDefaultVoice ? "Active subscription" : ""}</p></div>`).join("") : "<p>No accessible active SIMs were reported. Check your phone’s SIM settings and permission.</p>"}</div>${detected.sims.length ? '<button class="secondary-btn section-gap" data-action="use-detected">Save detected SIM profiles</button>' : ""}` : ""}</section><section class="card connection-card"><div class="card-heading"><h2>${icon("data")} Device usage</h2><span class="status-chip ${capabilities?.usageAccess ? "connected" : ""}">${capabilities?.mobileUsageSupported === false && native ? "Android 10+ required" : capabilities?.usageAccess ? "Access granted" : native ? "Permission needed" : "Android required"}</span></div><p>Android 10+ can report mobile data by app after Usage Access is enabled. These measurements combine mobile networks; they are not a remaining bundle balance.</p><div class="record-actions"><button class="secondary-btn" data-action="usage-settings" ${busy || !native || capabilities?.mobileUsageSupported === false ? "disabled" : ""}>${icon("settings")}Enable Usage Access</button><button class="primary-btn" data-action="refresh-device" ${busy || !native || capabilities?.mobileUsageSupported === false ? "disabled" : ""}>${icon("refresh")}${busy === "usage" ? "Reading…" : "Read device usage"}</button></div><p class="metric-evidence">${snapshot ? "Last read: " + esc(new Date(snapshot.queriedAt).toLocaleString()) : "No device measurement has been read."} Reads update while this screen is open or when you refresh. This is not continuous background monitoring.</p></section></div>${getMode() === "demo" ? '<div class="info-box">You are viewing the sample workspace. Switch to your personal tracker before detecting real SIMs or reading device usage.</div>' : ""}${error ? `<div class="form-error" role="alert">${esc(error)}</div>` : ""}${snapshot ? renderSnapshot() : ""}<section class="card section-gap"><div class="card-heading"><h2>Carrier billing connections</h2><span class="status-chip">Not connected</span></div><p class="card-sub">Official balances, purchases and rated call costs require verified subscriber authorization. No live carrier billing connection is enabled for customers.</p><div class="connection-grid section-gap">${Object.entries(
      carrierInfo,
    )
      .map(
        ([id, c]) =>
          `<article class="connection-card"><div class="card-heading"><h3><span class="carrier-dot" style="--carrier:${c.color}"></span> ${c.name}</h3><span class="source-badge">Access required</span></div><p>${id === "mtn" ? "MTN Usage Management product approved; verified customer access is not active." : "Partner documentation and approved production access required."}</p><button class="quiet-btn" data-action="carrier-details" data-carrier="${id}">Connection details ${icon("arrow")}</button></article>`,
      )
      .join(
        "",
      )}</div></section><div class="record-actions section-gap"><button class="secondary-btn" data-page="sims">${icon("sim")}Manage SIM profiles</button><button class="secondary-btn" data-page="purchases">${icon("wallet")}Recorded purchases</button>${snapshot ? '<button class="quiet-btn" data-action="clear-device">Clear device snapshot</button>' : ""}</div></div>`;
  }
  function renderSnapshot() {
    const s = snapshot;
    return `<section class="card section-gap"><div class="card-heading"><div><h2>Measured mobile data</h2><p class="card-sub">${esc(new Date(s.startTime).toLocaleDateString())} – ${esc(new Date(s.endTime).toLocaleDateString())} · all mobile networks combined</p></div><select id="device-period" class="period-select" aria-label="Device usage period"><option value="1" ${deviceDays === 1 ? "selected" : ""}>Today</option><option value="7" ${deviceDays === 7 ? "selected" : ""}>7 days</option><option value="30" ${deviceDays === 30 ? "selected" : ""}>30 days</option></select></div><div class="detail-stats"><div><span>Device total · all mobile</span><strong>${amount(s.totalBytes / 1e6)}</strong></div><div><span>Reported app groups</span><strong>${s.apps.length}</strong></div></div><p class="metric-evidence">Android measures traffic, not carrier charges. OS buckets may lag and span hours. UID totals can differ from the whole-device total because of system traffic and reporting boundaries.</p>${s.daily.length ? `<details class="info-box"><summary>Daily mobile usage · ${s.daily.length} days</summary><div class="table-scroll"><table class="data-table"><thead><tr><th>LOCAL DATE</th><th>MEASURED MOBILE DATA</th></tr></thead><tbody>${s.daily.map((d) => `<tr><td>${esc(d.date)}</td><td>${amount(d.bytes / 1e6)}</td></tr>`).join("")}</tbody></table></div></details>` : ""}<div class="app-list">${
      s.apps
        .slice(0, 30)
        .map(
          (a) =>
            `<div class="device-app-row"><div class="app-icon other">${icon("grid")}</div><div class="app-text"><div class="app-name">${esc(a.app)}</div><div class="app-category">${esc(a.packageName || `UID ${a.uid}`)} · ${a.foregroundBytes + a.backgroundBytes === a.bytes ? "background " + amount(a.backgroundBytes / 1e6) : "Activity split unavailable"}</div></div><strong>${amount(a.bytes / 1e6)}</strong></div>`,
        )
        .join("") ||
      '<div class="empty">No app traffic was reported for this window.</div>'
    }</div>${s.apps.length > 30 ? `<p class="metric-evidence">Showing the 30 largest of ${s.apps.length} app groups.</p>` : ""}${s.warnings.length ? `<details class="info-box"><summary>Measurement notes</summary>${s.warnings.map((w) => `<p>${esc(w)}</p>`).join("")}</details>` : ""}</section>`;
  }
  function renderInsights() {
    const a = analysis();
    const sims = getState().sims;
    return `<div class="insights-page"><div class="sim-filters" aria-label="Insights SIM"><button class="chip ${ctx.getSimId() === "all" ? "active" : ""}" data-sim="all">All SIMs</button>${sims.map((s) => `<button class="chip ${ctx.getSimId() === s.id ? "active" : ""}" data-sim="${esc(s.id)}">${esc(s.carrier)}</button>`).join("")}</div><section class="insights-hero section-gap"><div><span class="source-badge">${icon("spark")} ON-DEVICE INSIGHTS</span><h2>A clearer pattern.<br>A smarter next step.</h2><p>Forecasts and unusual-usage checks grounded in your records.</p></div><span class="confidence">${a.confidence === "moderate" ? "Some history available" : "More history needed"}</span></section><p class="metric-evidence">${sourceLabel()} · last 7 completed local days · ${a.daysObserved} days with records. Device snapshots are shown separately in Connections.</p><div class="detail-stats"><div><span>Average per recorded day</span><strong>${amount(a.averageDailyMB)}</strong></div><div><span>Recorded balance could last</span><strong>${a.projectedDaysRemaining === null ? "Not enough data" : a.projectedDaysRemaining.toFixed(1) + " days"}</strong></div></div><div class="connection-grid">${a.recommendations.map((r) => `<article class="card insight-card"><span class="source-badge">${icon(r.id === "review-spike" ? "bolt" : "spark")} ${r.id === "review-spike" ? "UNUSUAL DAY" : "INSIGHT"}</span><h3>${esc(r.title)}</h3><p>${esc(r.detail)}</p><div class="metric-evidence">${esc(r.evidence)}</div></article>`).join("")}</div><details class="info-box section-gap"><summary>How these insights are calculated</summary><p>${esc(a.coverageNote)}</p><p>These are local statistical calculations, not a generative AI model. They cannot verify carrier balances, tariffs or causes of traffic.</p></details><section class="card advisor-panel section-gap"><div class="card-heading"><h2>${icon("spark")} Your usage advisor</h2><span class="source-badge">Local analysis</span></div><p class="card-sub">Ask about your recorded usage. Answers stay on this device and identify gaps in the data.</p><div class="quick-prompts">${["Where did my data go?", "How long will my data last?", "Why did usage increase?", "How can I save data?"].map((q) => `<button class="chip" data-action="advisor-prompt" data-question="${esc(q)}">${q}</button>`).join("")}</div><form id="advisor-form"><label for="advisor-question" class="field-note">Your question</label><div class="record-actions"><input id="advisor-question" name="question" maxlength="1000" placeholder="Ask about data usage…" required><button class="primary-btn" type="submit">Ask ${icon("arrow")}</button></div></form>${answer ? `<div class="advisor-answer" role="status">${esc(answer)}</div>` : ""}<p class="metric-evidence">Cloud AI is not connected. The secure AI service is prepared in the source package and requires configured authentication and an AI provider account.</p></section></div>`;
  }
  async function run(task, fn) {
    if (busy) return;
    busy = task;
    error = "";
    render();
    try {
      await fn();
    } catch (e) {
      error = e?.message || "The device could not complete this request.";
      toast(error);
    } finally {
      busy = "";
      render();
    }
  }
  function requirePersonal() {
    if (getMode() === "demo") {
      toast("Switch to your personal tracker before connecting your phone.");
      return false;
    }
    return true;
  }
  async function handleAction(action, b) {
    if (action === "check-device") {
      if (!requirePersonal()) return;
      await run("check", () => recheckPermissions());
    } else if (action === "detect-sims") {
      if (!requirePersonal()) return;
      await run("detect", async () => {
        detected = await client.detect();
        await recheckPermissions();
        if (!detected) throw Error("Phone access is no longer granted. Check permissions and retry.");
        if (!getState().sims.length && detected.sims.length)
          save(mergeDetectedSims(getState(), detected.sims).state);
        toast(
          `${detected.sims.length} active SIM${detected.sims.length === 1 ? "" : "s"} detected.`,
        );
      });
    } else if (action === "use-detected") {
      if (!requirePersonal() || !detected) return;
      const result = mergeDetectedSims(getState(), detected.sims);
      if (result.added || result.matched) save(result.state);
      render();
      if (result.conflicts.length) {
        error = result.conflicts
          .map(
            (c) =>
              `SIM ${c.slot} already has a ${c.existing} profile. Detected ${c.detected} was not assigned to existing history.`,
          )
          .join(" ");
        render();
      }
      toast(
        result.added
          ? `${result.added} SIM profile${result.added === 1 ? "" : "s"} saved. No carrier tariff is configured.`
          : result.matched
            ? "Detected profiles are up to date."
            : "Existing profiles were preserved. Manage SIM profiles to review them.",
      );
    } else if (action === "usage-settings") {
      if (!requirePersonal()) return;
      await run("permission", async () => {
        await client.openUsageSettings();
        toast(
          "Enable Telvyo in Usage Access, then return and read device usage.",
        );
      });
    } else if (action === "refresh-device") {
      if (!requirePersonal()) return;
      await run("usage", async () => {
        await recheckPermissions();
        if (capabilities.mobileUsageSupported === false)
          throw Error("Mobile usage measurement requires Android 10 or newer.");
        if (!capabilities.usageAccess)
          throw Error("Usage access is not granted. Enable it in Android Settings and check again.");
        const measured = await client.usage(deviceDays);
        await recheckPermissions();
        if (!capabilities.usageAccess)
          throw Error("Usage access was revoked during measurement. Nothing was retained.");
        snapshot = measured;
        lastRefresh = Date.now();
      });
    } else if (action === "clear-device") {
      snapshot = null;
      lastRefresh = 0;
      render();
      toast("Device snapshot cleared from this session.");
    } else if (action === "carrier-details") {
      const c = carrierInfo[b.dataset.carrier];
      if (!c) return;
      openModal(
        `${modalHeader(`${c.name} connection`, "Carrier access is not configured.")}<p class="modal-sub">${esc(c.detail)}</p><div class="info-box">Device SIM detection does not prove ownership of a carrier account. Live access requires an approved customer authorization and consent flow. API secrets must stay on the server.</div><div class="modal-footer"><a class="secondary-btn" href="${c.url}" target="_blank" rel="noopener noreferrer">Official information ${icon("arrow")}</a></div>`,
      );
    } else if (action === "advisor-prompt") {
      answer = generateAnswer(b.dataset.question, analysis());
      render();
    }
  }
  document.addEventListener("submit", (e) => {
    if (e.target.id !== "advisor-form") return;
    e.preventDefault();
    const q = e.target.querySelector('[name="question"]').value.trim();
    if (!q) return;
    answer = generateAnswer(q, analysis());
    render();
  });
  document.addEventListener("change", (e) => {
    if (e.target.id === "device-period") {
      deviceDays = Number(e.target.value);
      handleAction("refresh-device", e.target);
    }
  });
  // Returning from Android Settings is NOT proof permission was granted.
  // Recheck even when no previous usage snapshot exists, and clear previous
  // measurements promptly when the user revokes Usage Access.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && client.supported &&
        getMode() === "personal" && !busy)
      void run("check", () => recheckPermissions({ refreshExistingUsage: true }));
  });
  return {
    setup,
    renderDevice,
    renderInsights,
    renderHomeMeasurements() {
      return snapshot
        ? `<section class="connection-banner"><div><span class="source-badge">ANDROID · MEASURED</span><h2>${amount(snapshot.totalBytes / 1e6)} mobile data</h2><p>${deviceDays} day window · all mobile networks combined. Recorded balances below are separate from device measurements.</p></div><button class="primary-btn" data-page="device">View measured apps ${icon("arrow")}</button></section>`
        : "";
    },
    handles: (a) => actions.has(a),
    handleAction,
    clearAnswer() {
      answer = "";
    },
    clearSession() {
      answer = "";
      snapshot = null;
      detected = null;
      error = "";
      lastRefresh = 0;
      lastPermissionCheck = 0;
    },
    async initialize() {
      if (!client.supported) return;
      busy = "initializing";
      try {
        await recheckPermissions();
        if (getMode() === "personal") {
          if (capabilities.phonePermission === "granted") {
            try {
              detected = await client.detect();
              if (!getState().sims.length && detected.sims.length)
                save(mergeDetectedSims(getState(), detected.sims).state);
            } catch (e) {
              error = e.message;
            }
          }
          if (capabilities.usageAccess && capabilities.mobileUsageSupported !== false) {
            try {
              snapshot = await client.usage(deviceDays);
              lastRefresh = Date.now();
            } catch (e) {
              error = e.message;
            }
          }
        }
      } catch {
        capabilities = null;
      } finally {
        busy = "";
        render();
      }
    },
  };
}
