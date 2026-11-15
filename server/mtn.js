import { randomUUID } from "node:crypto";
const BASE = "https://api.mtn.com/v1";
// Usage Management v3.0.0, 2026-11-11. Customer Plans is a separate MTN product.
const OPERATIONS = {
  usage: (id) => `/usage/${id}`,
  usageCharge: (id) => `/usageCharge/${id}`,
  recharge: (id) => `/recharge/${id}`,
};
const identifier = (value) =>
  typeof value === "string" && /^[a-zA-Z0-9+][a-zA-Z0-9+_-]{0,79}$/.test(value);
async function providerJSON(url, options, fetchImpl) {
  try {
    const response = await fetchImpl(url, {
      ...options,
      redirect: "error",
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw Error();
    const value = await response.json();
    if (!value || typeof value !== "object") throw Error();
    return value;
  } catch {
    throw new Error(
      "MTN could not complete the approved request. Check product access and provider status.",
    );
  }
}
export async function requestMtnAccessToken(
  { clientId, clientSecret },
  fetchImpl = fetch,
) {
  if (!clientId || !clientSecret)
    throw Error("MTN server credentials are required.");
  const value = await providerJSON(
    `${BASE}/oauth/access_token?grant_type=client_credentials`,
    {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
      }).toString(),
    },
    fetchImpl,
  );
  const seconds = Number(value.expires_in);
  if (
    typeof value.access_token !== "string" ||
    !Number.isFinite(seconds) ||
    seconds <= 0
  )
    throw Error("MTN returned an invalid token response.");
  return { token: value.access_token, expiresAt: Date.now() + seconds * 1000 };
}
/** Internal adapter only. Consent must come from a verified server-side account mapping, never a request body. */
export async function fetchMtnResource(
  {
    operation,
    customerId,
    accessToken,
    consent,
    countryCode,
    usageType,
    startTime,
    endTime,
    pageNumber = 1,
    pageSize = 50,
    historyType,
  },
  fetchImpl = fetch,
) {
  if (!Object.hasOwn(OPERATIONS, operation) || !identifier(customerId))
    throw Error("Invalid MTN resource or customer identifier.");
  if (
    !consent?.subject ||
    consent.customerId !== customerId ||
    !Number.isFinite(consent.expiresAt) ||
    consent.expiresAt <= Date.now() ||
    !consent.scopes?.includes(operation)
  )
    throw Error(
      "Verified subscriber authorization for this resource is required.",
    );
  if (
    !accessToken ||
    typeof accessToken !== "string" ||
    /[\r\n]/.test(accessToken)
  )
    throw Error("An approved MTN access token is required.");
  const usage = operation === "usage" || operation === "usageCharge";
  if (
    usage &&
    (!countryCode || typeof countryCode !== "string" || countryCode.length > 40)
  )
    throw Error("An MTN-approved countryCode value is required.");
  if (
    usage &&
    (!usageType || typeof usageType !== "string" || usageType.length > 80)
  )
    throw Error("An MTN-approved usageType value is required.");
  const url = new URL(
    BASE + OPERATIONS[operation](encodeURIComponent(customerId)),
  );
  {
    if (
      !Number.isInteger(pageNumber) ||
      pageNumber < 1 ||
      !Number.isInteger(pageSize) ||
      pageSize < 1 ||
      pageSize > 100
    )
      throw Error("Invalid page bounds.");
    for (const [key, value] of Object.entries({
      usageType: usage ? usageType : undefined,
      startTime,
      endTime,
      // v3 Swagger: recharge uses pageNum; usage/charges use pageNumber.
      ...(operation === "recharge"
        ? { pageNum: pageNumber, historyType }
        : { pageNumber }),
      pageSize,
    })) {
      if (value === undefined) continue;
      if (
        typeof value === "string" &&
        (value.length > 100 || /[\r\n]/.test(value))
      )
        throw Error("Invalid query value.");
      url.searchParams.set(key, String(value));
    }
  }
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    Accept: "application/json",
    transactionId: randomUUID(),
  };
  if (countryCode) {
    if (
      typeof countryCode !== "string" ||
      /[\r\n]/.test(countryCode) ||
      countryCode.length > 40
    )
      throw Error("Invalid countryCode.");
    headers.countryCode = countryCode;
  }
  const payload = await providerJSON(
    url.toString(),
    { method: "GET", headers },
    fetchImpl,
  );
  return {
    provider: "MTN",
    source: "carrier-response",
    operation,
    fetchedAt: new Date().toISOString(),
    mapped: false,
    payload,
  };
}
