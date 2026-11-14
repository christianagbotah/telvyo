import test from "node:test";
import assert from "node:assert/strict";
import { copyFile, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { stampAssets } from "../scripts/stamp-assets.mjs";

test("VPS asset stamp versions all module dependencies and the offline cache", async () => {
  const dir = await mkdtemp(join(tmpdir(), "telvyo-stamp-"));
  const files = ["index.html", "app.js", "connected-views.js", "insights.js", "service-worker.js"];
  try {
    for (const file of files) await copyFile(new URL("../dist/" + file, import.meta.url), join(dir, file));
    const sha = "0123456789ab".padEnd(40, "c");
    const version = await stampAssets(dir, sha);
    assert.equal(version, "0123456789ab");
    for (const [file, fragments] of Object.entries({
      "index.html": ["./app.js?v=" + version, "./styles.css?v=" + version, "./manifest.webmanifest?v=" + version],
      "app.js": ["./model.js?v=" + version, "./connected-views.js?v=" + version],
      "connected-views.js": ["./insights.js?v=" + version, "./device.js?v=" + version],
      "insights.js": ["./model.js?v=" + version],
      "service-worker.js": ['const VERSION = "' + version + '";'],
    })) {
      const content = await readFile(join(dir, file), "utf8");
      for (const expected of fragments) assert.ok(content.includes(expected), file + " missing " + expected);
    }
    await assert.rejects(stampAssets(dir, sha), /release-stamp anchor/);
    await assert.rejects(stampAssets(dir, "invalid"), /40-character/);
  } finally {
    await rm(dir, {recursive:true, force:true});
  }
});
