/**
 * MTN application-only OAuth smoke check. Never prints credentials or token.
 *
 * Run only on the private VPS after filling the protected env file:
 * node --env-file=/home/lightworld/.config/telvyo/mtn.env scripts/check-mtn-token.mjs
 *
 * This proves app authentication only, NOT subscriber access/consent.
 */
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { requestMtnAccessToken } from "../server/mtn.js";

export async function checkMtnAppCredentials({
  env = process.env,
  authorize = requestMtnAccessToken,
  log = console.log,
  error = console.error,
} = {}) {
  const clientId = env.MTN_CLIENT_ID?.trim();
  const clientSecret = env.MTN_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) {
    error("MTN app authentication: not configured. Set credentials in the private VPS env file.");
    return 2;
  }
  try {
    const result = await authorize({ clientId, clientSecret });
    if (typeof result?.token !== "string" ||
        !Number.isFinite(result.expiresAt) ||
        result.expiresAt <= Date.now()) throw Error("Invalid provider result");
    log("MTN app authentication: successful. No token or secret has been printed.");
    log("Token expires within " +
      Math.ceil((result.expiresAt - Date.now()) / 60000) +
      " minutes.");
    log("Subscriber access: NOT tested; requires MTN-approved authorization and test data.");
    return 0;
  } catch {
    error("MTN app authentication: unsuccessful. Check approved credentials/product access; no secret details are shown.");
    return 1;
  }
}

if (process.argv[1] &&
    import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  process.exitCode = await checkMtnAppCredentials();
}
