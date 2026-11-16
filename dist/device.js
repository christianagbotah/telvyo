/** Native measurements are snapshots, never silently converted to carrier billing. */
export function createDeviceClient(cap = globalThis.Capacitor) {
  const supported =
    cap?.isNativePlatform?.() === true &&
    cap?.getPlatform?.() === "android" &&
    !!cap?.Plugins?.TelcoDevice;
  const plugin = supported ? cap.Plugins.TelcoDevice : null;
  const requireNative = () => {
    if (!plugin)
      throw new Error(
        "Open the Android app to detect SIMs and read device usage. Browsers and iOS cannot grant this access.",
      );
  };
  return {
    supported,
    async capabilities() {
      const info = plugin
        ? await plugin.getCapabilities()
        : {
            platform: cap?.getPlatform?.() || "web",
            simDetection: false,
            usageAccess: false,
            phonePermission: "unavailable",
            mobileUsageSupported: false,
            androidApiLevel: null,
          };
      if (!info || typeof info !== "object")
        throw new Error("Device permission status is unavailable.");
      return {
        ...info,
        // Older installed builds may omit this field; do not mistake an
        // unknown capability for an explicit unsupported-version response.
        mobileUsageSupported: info.mobileUsageSupported !== false && supported,
        androidApiLevel: Number.isInteger(info.androidApiLevel)
          ? info.androidApiLevel : null,
      };
    },
    async detect() {
      requireNative();
      const result = await plugin.detectSims();
      if (!Array.isArray(result?.sims))
        throw new Error("The device returned an invalid SIM list.");
      return {
        ...result,
        sims: result.sims
          .filter(
            (s) =>
              Number.isInteger(s.subscriptionId) &&
              s.subscriptionId >= 0 &&
              Number.isInteger(s.slot) &&
              s.slot >= 1 &&
              s.slot <= 2,
          )
          .map((s) => ({
            ...s,
            carrier: String(s.carrier || "Unknown network").slice(0, 80),
            label: String(s.label || `SIM ${s.slot}`).slice(0, 80),
          })),
      };
    },
    async openUsageSettings() {
      requireNative();
      return plugin.openUsageSettings();
    },
    async usage(days = 7) {
      requireNative();
      if (!Number.isInteger(days) || days < 1 || days > 30)
        throw new Error("Choose a period of 1 to 30 days.");
      const endTime = Date.now(),
        start = new Date(endTime);
      start.setHours(0, 0, 0, 0);
      start.setDate(start.getDate() - days + 1);
      return normalizeSnapshot(
        await plugin.queryMobileUsage({ startTime: start.getTime(), endTime }),
      );
    },
  };
}
export function normalizeSnapshot(raw) {
  if (raw?.scope !== "all-mobile")
    throw new Error("Unrecognized device usage scope.");
  const validBytes = (n) =>
    Number.isFinite(n) && n >= 0 && n <= Number.MAX_SAFE_INTEGER;
  if (!validBytes(raw.totalBytes))
    throw new Error("Invalid device byte count.");
  if (
    !Number.isFinite(raw.startTime) ||
    !Number.isFinite(raw.endTime) ||
    raw.startTime >= raw.endTime
  )
    throw new Error("Invalid device measurement window.");
  const apps = (Array.isArray(raw.apps) ? raw.apps : [])
    .filter((a) => validBytes(a.bytes))
    .map((a) => ({
      uid: a.uid,
      packageName: typeof a.packageName === "string" ? a.packageName : null,
      app: String(a.app || `App UID ${a.uid}`).slice(0, 100),
      bytes: a.bytes,
      foregroundBytes: validBytes(a.foregroundBytes) ? a.foregroundBytes : 0,
      backgroundBytes: validBytes(a.backgroundBytes) ? a.backgroundBytes : 0,
    }))
    .sort((a, b) => b.bytes - a.bytes);
  const daily = (Array.isArray(raw.daily) ? raw.daily : [])
    .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d.date) && validBytes(d.bytes))
    .map((d) => ({ date: d.date, bytes: d.bytes }));
  return {
    scope: "all-mobile",
    source: "android-network-stats",
    startTime: raw.startTime,
    endTime: raw.endTime,
    queriedAt:
      typeof raw.queriedAt === "string"
        ? raw.queriedAt
        : new Date().toISOString(),
    totalBytes: raw.totalBytes,
    apps,
    daily,
    warnings: (Array.isArray(raw.warnings) ? raw.warnings : []).map((w) =>
      String(w).slice(0, 500),
    ),
  };
}
export function mergeDetectedSims(state, detected) {
  const next = { ...state, sims: state.sims.map((s) => ({ ...s })) },
    conflicts = [];
  let added = 0,
    matched = 0;
  for (const s of detected) {
    const id = `android-${s.subscriptionId}`;
    const same = next.sims.find(
      (x) => x.deviceSubscriptionId === s.subscriptionId,
    );
    if (same) {
      Object.assign(same, {
        lastDetectedAt: new Date().toISOString(),
        isDefaultData: !!s.isDefaultData,
        isDefaultVoice: !!s.isDefaultVoice,
      });
      matched++;
      continue;
    }
    const occupied = next.sims.find((x) => x.slot === s.slot);
    if (occupied) {
      conflicts.push({
        slot: s.slot,
        existing: occupied.carrier,
        detected: s.carrier,
      });
      continue;
    }
    if (![1, 2].includes(s.slot) || next.sims.length >= 2) continue;
    const carrier =
      String(s.carrier || "Unknown network")
        .trim()
        .slice(0, 80) || "Unknown network";
    const color = /mtn/i.test(carrier)
      ? "#FFCD00"
      : /telecel|vodafone/i.test(carrier)
        ? "#D82135"
        : "#0068BF";
    next.sims.push({
      id,
      slot: s.slot,
      carrier,
      label:
        String(s.label || `SIM ${s.slot}`)
          .trim()
          .slice(0, 80) || `SIM ${s.slot}`,
      color,
      rate: 0,
      rateSource: "unset",
      dailyLimitMB: 1000,
      source: "device",
      deviceSubscriptionId: s.subscriptionId,
      isDefaultData: !!s.isDefaultData,
      isDefaultVoice: !!s.isDefaultVoice,
      lastDetectedAt: new Date().toISOString(),
    });
    added++;
  }
  return { state: next, added, matched, conflicts };
}
