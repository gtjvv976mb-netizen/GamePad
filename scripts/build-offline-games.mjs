import { build } from "esbuild";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
const metadata = await build({ entryPoints: [resolve(root, "src/games/campaigns/index.ts")], bundle: true, write: false, format: "esm", platform: "node" });
const { CAMPAIGNS } = await import(`data:text/javascript;base64,${Buffer.from(metadata.outputFiles[0].text).toString("base64")}`);
if (CAMPAIGNS.length !== 16 || new Set(CAMPAIGNS.map(c => c.slug)).size !== 16) throw new Error("The offline catalog must contain 16 unique campaigns.");
const runtime = await build({ entryPoints: [resolve(root, "src/games/standalone.ts")], bundle: true, write: false, format: "iife", platform: "browser", target: "es2022", minify: true, legalComments: "none" });
const script = runtime.outputFiles[0].text.replace(/<\/script/gi, "<\\/script");
const css = await readFile(resolve(root, "src/games/standalone.css"), "utf8");
const out = resolve(root, "public/games");
await mkdir(out, { recursive: true });
const manifest = [];
for (const c of CAMPAIGNS) {
  if (!/^[a-z]{3}$/.test(c.slug) || c.chapters.length < 5 || !c.ending) throw new Error(`Incomplete campaign: ${c.slug}`);
  const title = c.title.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll('"', "&quot;");
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="description" content="${title}: original offline campaign from GamePad"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; connect-src 'none'; form-action 'none'; base-uri 'none'"><title>${title} | GamePad Offline</title><style>${css}</style></head><body data-game="${c.slug}"><div id="game"></div><script>${script}</script></body></html>`;
  await writeFile(resolve(out, `${c.slug}.html`), html);
  manifest.push({ slug: c.slug, title: c.title, family: c.family, chapters: c.chapters.length, bytes: Buffer.byteLength(html), file: `${c.slug}.html` });
}
await writeFile(resolve(out, "manifest.json"), JSON.stringify({ version: 1, games: manifest }, null, 2) + "\n");
await writeFile(resolve(out, "README.txt"), `GamePad Originals: 16 offline campaigns\n\nOpen any .html file in a modern browser. Each file includes its complete game, art and story. No server, wallet, installation or internet connection is needed. Keyboard, standard controller and touch controls are included.\n\nProgress saves in your browser when storage is available. Use Controls and save files > Export save for a portable backup, and Import save to resume on another browser/device. Browser storage for files can vary, so export before moving a game or clearing browser data.\n\n${manifest.map(c => `${c.file}: ${c.title} (${c.chapters} chapters)`).join("\n")}\n\nOriginal compact single-player games; no multiplayer or online services.\n`);
console.log(`Built ${manifest.length} self-contained offline games (${manifest.reduce((n, g) => n + g.chapters, 0)} campaign chapters).`);
