import { readFile, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";

const REQUIRE_SHA = /^[a-f0-9]{40}$/i;
const changes = {
  "index.html": [
    ['href="./styles.css"', 'href="./styles.css?v=@RELEASE@"'],
    ['src="./app.js"', 'src="./app.js?v=@RELEASE@"'],
    ['href="./manifest.webmanifest"', 'href="./manifest.webmanifest?v=@RELEASE@"'],
  ],
  "app.js": [
    ['from "./model.js"', 'from "./model.js?v=@RELEASE@"'],
    ['from "./connected-views.js"', 'from "./connected-views.js?v=@RELEASE@"'],
  ],
  "connected-views.js": [
    ['from "./insights.js"', 'from "./insights.js?v=@RELEASE@"'],
    ['from "./device.js"', 'from "./device.js?v=@RELEASE@"'],
  ],
  "insights.js": [
    ['from "./model.js"', 'from "./model.js?v=@RELEASE@"'],
  ],
  "service-worker.js": [
    ['const VERSION = "dev";', 'const VERSION = "@RELEASE@";'],
  ],
};

export async function stampAssets(root, sha) {
  if (!REQUIRE_SHA.test(sha)) throw new Error("Expected a 40-character Git SHA.");
  const version = sha.slice(0, 12).toLowerCase();
  for (const [file, changesForFile] of Object.entries(changes)) {
    const path = join(resolve(root), file);
    let source = await readFile(path, "utf8");
    for (const [from, to] of changesForFile) {
      if (source.split(from).length !== 2) {
        throw new Error("Expected one release-stamp anchor in " + file + ": " + from);
      }
      source = source.replace(from, to.replace("@RELEASE@", version));
    }
    await writeFile(path, source);
  }
  return version;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [root, sha] = process.argv.slice(2);
  stampAssets(root, sha).then(version => {
    console.log("Stamped Telvyo static assets with release " + version);
  }).catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
