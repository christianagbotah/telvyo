import { createServer } from "node:http";
import { createGateway } from "./gateway.js";
import { Pool } from "pg";
import {
  accountKeyFor, createPrivacyAPI, CURRENT_AI_CONSENT_VERSION,
} from "./privacy-api.js";
import { createPgPrivacyStore } from "./privacy-store.js";

const pool = process.env.ACCOUNT_DATABASE_URL
  ? new Pool({
      connectionString: process.env.ACCOUNT_DATABASE_URL,
      max: 4,
      idleTimeoutMillis: 20000,
      connectionTimeoutMillis: 5000,
    })
  : null;
const repository = pool ? createPgPrivacyStore(pool) : null;
const consentCheck = repository ? async (identity) => {
  const key = accountKeyFor(identity, process.env);
  const saved = await repository.latest(key, "ai-advisor");
  return saved?.granted === true &&
    saved.policyVersion === CURRENT_AI_CONSENT_VERSION;
} : null;
const gateway = createGateway({ consentCheck });
const privacy = createPrivacyAPI({ repository });
const handler = request => new URL(request.url).pathname.startsWith("/v1/privacy")
  ? privacy(request) : gateway(request);

const server = createServer(async (req, res) => {
  try {
    const controller = new AbortController();
    req.once("aborted", () => controller.abort());
    const request = new Request(new URL(req.url, "http://localhost"), {
      method: req.method,
      headers: req.headers,
      ...(["GET", "HEAD"].includes(req.method)
        ? {}
        : { body: req, duplex: "half" }),
      signal: controller.signal,
    });
    const response = await handler(request);
    res.writeHead(response.status, Object.fromEntries(response.headers));
    res.end(Buffer.from(await response.arrayBuffer()));
  } catch {
    if (!res.headersSent)
      res.writeHead(500, { "content-type": "application/json" });
    res.end('{"error":"Request could not be completed."}');
  }
});
server.requestTimeout = 30000;
server.headersTimeout = 10000;
server.maxHeadersCount = 50;
server.listen(
  Number(process.env.PORT) || 3001,
  process.env.HOST || "127.0.0.1",
  () =>
    console.log(
      "Telvyo API listening; provider services require secure configuration.",
    ),
);
