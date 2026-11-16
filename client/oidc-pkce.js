/**
 * Dormant WEB-ONLY authorization-code + PKCE sign-in foundation.
 *
 * IMPORTANT: This is not wired to the public app. The configured OIDC provider
 * must issue a signed JWT access token for Telvyo's server-side API audience.
 * The private API verifies that token; this browser module never claims to
 * verify token signatures or identity by decoding client-side JWT fields.
 */
const STORAGE_KEY = "telvyo.oidc.pending.v1";
const LOGIN_TTL_MS = 5 * 60 * 1000;
const MIN_TOKEN_BYTES = 16;
const MAX_TOKEN_BYTES = 8192;

export class SignInError extends Error {
  constructor(message) {
    super(message);
    this.name = "SignInError";
  }
}
function error(message) { return new SignInError(message); }

function httpsURL(value, label, {allowPath=true}={}) {
  if (typeof value !== "string" || !value || value.length > 2048)
    throw error(`A registered HTTPS ${label} is required.`);
  let url;
  try { url = new URL(value); } catch { throw error(`Invalid ${label}.`); }
  if (url.protocol !== "https:" || url.username || url.password ||
      url.search || url.hash || !url.hostname || url.href !== value ||
      (!allowPath && url.pathname !== "/"))
    throw error(`Invalid registered HTTPS ${label}.`);
  return url;
}

const onlyKeys = (obj, permitted) => !!obj &&
  typeof obj === "object" && !Array.isArray(obj) &&
  Object.keys(obj).every(key => permitted.includes(key));

const encode = bytes => {
  // No btoa dependency: both browser and Node have a standard pure encoding.
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  let output = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i], b = bytes[i + 1], c = bytes[i + 2];
    output += alphabet[a >> 2];
    output += alphabet[((a & 3) << 4) | (b === undefined ? 0 : b >> 4)];
    if (b !== undefined)
      output += alphabet[((b & 15) << 2) | (c === undefined ? 0 : c >> 6)];
    if (c !== undefined) output += alphabet[c & 63];
  }
  return output;
};

function readPending(storage) {
  let raw;
  try { raw = storage.getItem(STORAGE_KEY); }
  catch { throw error("Private sign-in state is not available in this browser."); }
  if (typeof raw !== "string" || raw.length > 2048) return null;
  try {
    const pending = JSON.parse(raw);
    if (!onlyKeys(pending, ["state","verifier","nonce","createdAt","issuer","redirect"]) ||
        !/^[A-Za-z0-9_-]{43}$/.test(pending?.state) ||
        !/^[A-Za-z0-9_-]{86}$/.test(pending?.verifier) ||
        !/^[A-Za-z0-9_-]{43}$/.test(pending?.nonce) ||
        !Number.isSafeInteger(pending?.createdAt) ||
        typeof pending.issuer !== "string" ||
        typeof pending.redirect !== "string")
      return null;
    return pending;
  } catch { return null; }
}

export function createOidcPkceSession({
  issuer, authorizationEndpoint, tokenEndpoint, clientId, redirectUri, apiOrigin,
  cryptoProvider=globalThis.crypto,
  storage=globalThis.sessionStorage,
  fetchImpl=globalThis.fetch,
  now=Date.now,
  historyProvider=globalThis.history,
}={}) {
  const issuerUrl = httpsURL(issuer,"identity issuer");
  const authorization = httpsURL(authorizationEndpoint,"authorization endpoint");
  const token = httpsURL(tokenEndpoint,"token endpoint");
  const redirect = httpsURL(redirectUri,"redirect URI");
  const api = httpsURL(apiOrigin,"private API origin",{allowPath:false});
  if (typeof clientId !== "string" || !/^[a-zA-Z0-9_.:-]{3,128}$/.test(clientId))
    throw error("A registered public OAuth client ID is required.");
  if (!cryptoProvider?.getRandomValues || !cryptoProvider?.subtle?.digest ||
      !storage?.getItem || !storage?.setItem || !storage?.removeItem ||
      typeof fetchImpl !== "function" || typeof now !== "function" ||
      !historyProvider?.replaceState)
    throw error("The browser cannot safely start sign-in.");
  // OIDC issuer endpoints are explicitly configured (not supplied by callers).
  // Some real IdPs publish them on different hosts; audit approved endpoints.
  // The registered callback is EXACT: authorization codes never reach a third-party URL.
  let accessToken = null, expiresAt = 0;

  const clearToken = () => { accessToken = null; expiresAt = 0; };
  const clearPending = () => {
    try { storage.removeItem(STORAGE_KEY); }
    catch { throw error("The browser could not clear temporary sign-in state."); }
  };

  function getAccessToken() {
    if (!accessToken || now() + 30000 >= expiresAt) {
      clearToken();
      throw error("The sign-in has expired. Sign in again.");
    }
    return accessToken;
  }

  async function beginAuthorization() {
    clearToken();
    const stateBytes = cryptoProvider.getRandomValues(new Uint8Array(32));
    const verifierBytes = cryptoProvider.getRandomValues(new Uint8Array(64));
    const nonceBytes = cryptoProvider.getRandomValues(new Uint8Array(32));
    const state = encode(stateBytes);
    const verifier = encode(verifierBytes);
    const nonce = encode(nonceBytes);
    const bytes = new TextEncoder().encode(verifier);
    const challenge = encode(new Uint8Array(await cryptoProvider.subtle.digest("SHA-256",bytes)));
    const record = JSON.stringify({
      state,verifier,nonce,createdAt:now(),
      issuer:issuerUrl.href,redirect:redirect.href,
    });
    // Fail closed if browser storage is blocked. Without a persisted verifier
    // and state, a returning callback must NEVER be accepted.
    try {
      storage.setItem(STORAGE_KEY,record);
      if (storage.getItem(STORAGE_KEY) !== record)
        throw Error("Pending request was not persisted.");
    } catch {
      throw error("This browser cannot securely preserve temporary sign-in state.");
    }
    const url = new URL(authorization.href);
    url.searchParams.set("client_id",clientId);
    url.searchParams.set("response_type","code");
    url.searchParams.set("redirect_uri",redirect.href);
    url.searchParams.set("scope","openid");
    url.searchParams.set("state",state);
    url.searchParams.set("nonce",nonce);
    url.searchParams.set("code_challenge",challenge);
    url.searchParams.set("code_challenge_method","S256");
    // No client secret, refresh token, local ledger or phone identifier.
    return url.href;
  }

  async function finishAuthorization(callbackUrl) {
    const url = typeof callbackUrl === "string"
      ? (()=>{try{return new URL(callbackUrl);}catch{throw error("Invalid callback URL.");}})()
      : callbackUrl;
    if (!(url instanceof URL) ||
        url.origin !== redirect.origin || url.pathname !== redirect.pathname)
      throw error("This callback does not match the registered sign-in address.");
    // Strip the authorization code from the visible URL before ANY network
    // operation, including failed/mismatched state or provider error.
    historyProvider.replaceState(null,"",url.pathname);
    const pending = readPending(storage);
    clearPending(); // Consume once even on failure, preventing code replay.
    clearToken();
    if (!pending || pending.issuer !== issuerUrl.href ||
        pending.redirect !== redirect.href || now() < pending.createdAt ||
        now() - pending.createdAt > LOGIN_TTL_MS)
      throw error("Sign-in expired or could not be verified. Start again.");

    const allowed = new Set(["state","code","iss","session_state","error","error_description"]);
    const entries = [...url.searchParams.keys()];
    if (entries.some(key => !allowed.has(key)) ||
        new Set(entries).size !== entries.length ||
        entries.filter(key=>key==="state").length!==1 ||
        url.searchParams.get("state")!==pending.state)
      throw error("Sign-in state mismatch. Start again.");
    const responseIssuer = url.searchParams.get("iss");
    if (responseIssuer && responseIssuer !== issuerUrl.href)
      throw error("Identity issuer mismatch. Start again.");
    if (url.searchParams.has("error"))
      throw error("Sign-in was cancelled or declined by the identity provider.");

    const code = url.searchParams.get("code");
    if (!code || code.length > 2048 || /[\s\x00-\x1f\x7f]/.test(code))
      throw error("The identity provider did not return a valid authorization code.");

    const body = new URLSearchParams({
      grant_type:"authorization_code",code,redirect_uri:redirect.href,
      client_id:clientId,code_verifier:pending.verifier,
    });
    let exchange;
    try {
      exchange = await fetchImpl(token.href,{
        method:"POST",redirect:"error",credentials:"omit",
        cache:"no-store",referrerPolicy:"no-referrer",
        headers:{"content-type":"application/x-www-form-urlencoded","accept":"application/json"},
        body:body.toString(),
      });
    } catch { throw error("The identity provider could not complete sign-in."); }
    if (!exchange?.ok || !exchange.headers.get("content-type")?.toLowerCase().startsWith("application/json"))
      throw error("The identity provider rejected sign-in.");
    let result;
    try {
      const raw = await exchange.text();
      if (new TextEncoder().encode(raw).byteLength > 32768) throw Error();
      result=JSON.parse(raw);
    } catch { throw error("The identity provider returned an invalid token response."); }
    if (!onlyKeys(result,["access_token","token_type","expires_in",
      "id_token","refresh_token","scope","issued_token_type"]) ||
        result.token_type?.toLowerCase()!=="bearer" ||
        typeof result.access_token !== "string" ||
        result.access_token.length < MIN_TOKEN_BYTES ||
        result.access_token.length > MAX_TOKEN_BYTES ||
        /\s/.test(result.access_token) ||
        !Number.isSafeInteger(result.expires_in) ||
        result.expires_in < 60 || result.expires_in > 86400)
      throw error("The identity provider returned an invalid access token.");

    const candidate = result.access_token;
    // Never trust a decoded ID token or merely obtaining an access token.
    // The Telvyo API must independently verify issuer/audience/signature/exp.
    let proof;
    try {
      proof = await fetchImpl(api.origin + "/v1/privacy",{
        method:"GET",redirect:"error",credentials:"omit",
        cache:"no-store",referrerPolicy:"no-referrer",
        headers:{"authorization":`Bearer ${candidate}`,"accept":"application/json"},
      });
    } catch { throw error("Telvyo account verification is unavailable."); }
    if (!proof?.ok || !proof.headers.get("content-type")?.toLowerCase().startsWith("application/json"))
      throw error("Telvyo could not verify this sign-in.");
    let verified;
    try {
      const raw = await proof.text();
      if (new TextEncoder().encode(raw).byteLength > 16384) throw Error();
      verified = JSON.parse(raw);
    } catch { throw error("Telvyo could not verify this sign-in."); }
    if (verified?.accountConnected !== true)
      throw error("Telvyo could not verify this sign-in.");
    accessToken = candidate;
    expiresAt = now() + result.expires_in * 1000;
    if (now() + 30000 >= expiresAt) {clearToken();throw error("The sign-in has expired.");}
    return {authenticated:true,expiresAt,provider:issuerUrl.origin};
  }

  function logout() {
    clearToken();
    clearPending();
    // Provider's SSO/logout cookie and any external mobile session are
    // NOT cleared here. Integrate IdP-specific end-session separately.
    return {signedOutLocally:true,providerSessionMayRemain:true};
  }

  function status() {
    return {signedIn:!!accessToken && now() + 30000 < expiresAt,
      expiresAt:accessToken?expiresAt:null,tokenStoredOnDevice:false};
  }

  return Object.freeze({
    beginAuthorization,finishAuthorization,getAccessToken,logout,status,
  });
}
