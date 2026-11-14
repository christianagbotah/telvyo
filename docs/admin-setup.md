# Telvyo owner administration

Open `/admin` on the deployed Site. Use the ChatGPT account configured in the server's `ADMIN_OWNER_EMAIL` allowlist; there is no shared/default admin password. Sites handles sign-in. Every admin page and API independently requires trusted platform identity and the configured owner email. If the owner changes email, update the allowlist through Sites Settings. Do not deploy behind a host that accepts forged `oai-authenticated-user-*` headers from callers.

## Enter credentials securely

1. Open https://chatgpt.com/sites, find Telvyo, then More actions → Settings.
2. In hosted environment variables/secrets, add `MTN_AUTH_METHOD` as `oauth` or `apiKey`, matching the specific product documentation. Set `MTN_ENVIRONMENT` to `sandbox` or `production` only when MTN confirms it; otherwise use `unknown`.
3. Set `MTN_PRODUCTS` to a comma-separated subset of `usage,plans,profiles` that is approved for your application. These are local configuration labels; entering them does not grant MTN access.
4. For OAuth, set `MTN_CLIENT_ID` and `MTN_CLIENT_SECRET`. For API-key products, set `MTN_API_KEY`. Mark all credential values as secrets. Do not enter credentials in chat, source, mobile code or public issue reports.
5. Follow Sites Settings instructions to apply the environment revision and redeploy when required. Refresh status in `/admin`.
6. Production OAuth configurations support an explicit application-authentication check against the documented fixed MTN token endpoint. Sandbox and API-key configurations remain untested until their specific approved endpoint and authentication contract are confirmed.

Official configuration instructions: https://learn.chatgpt.com/docs/sites/managing-a-site#configure-runtime-environment-values

## What a successful check means

The server obtained a syntactically valid OAuth token, which is discarded without being returned or persisted. This does not verify product approval, the permissions in the token, Ghana-specific data fields, subscriber consent, or any subscriber balance/call history. Those remain separate integration work. The page never presents authentication success as a connected subscriber account.

Credentials are runtime secrets managed by Sites, not app-managed database entries. The `BUCKET` binding stores only a bounded check result, timestamp, and one-way configuration fingerprint. Conditional writes enforce a shared 30-second check cooldown. A changed configuration hides stale check results. Requests are same-origin, bounded, owner-authorized, and use a fixed provider endpoint; there is no subscriber lookup or arbitrary URL proxy.

The Node AI/MTN resource service under `server/` remains separate. This administration deployment does not enable its advisor or expose subscriber routes. Android/iOS source and existing APK downloads are retained unchanged for this web administration update.
