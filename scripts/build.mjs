import { copyFile, cp, mkdir, rm } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

const files = [
  ["index.html", "index.html"],
  ["src/styles.css", "styles.css"],
  ["src/core.js", "core.js"],
  ["src/demo.js", "demo.js"],
  ["src/app.js", "app.js"],
  ["src/sw.js", "sw.js"],
  ["src/analise-entrada.js", "analise-entrada.js"],
  ["manifest.json", "manifest.json"],
  ["icon-192.png", "icon-192.png"],
  ["icon-512.png", "icon-512.png"]
];
const outputDirectory = resolve("public");

for (const file of ["src/core.js", "src/demo.js", "src/app.js", "src/sw.js"]) {
  execFileSync(process.execPath, ["--check", file], { stdio: "inherit" });
}

await rm(outputDirectory, { recursive: true, force: true });
await mkdir(outputDirectory, { recursive: true });
await Promise.all(files.map(function ([source, output]) {
  return copyFile(resolve(source), resolve(outputDirectory, output));
}));
// Módulos da aba Análise, copiados com as subpastas.
await cp(resolve("src/analise"), resolve(outputDirectory, "analise"), {
  recursive: true,
  filter: function (source) { return !source.endsWith("LEIA-ME.md"); }
});
