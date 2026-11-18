import { build } from "esbuild";
import { mkdir } from "node:fs/promises";

await mkdir("dist", { recursive: true });

const common = {
  bundle: true,
  platform: "node",
  target: "node22",
  format: "cjs",
  external: ["electron"],
  sourcemap: true,
  logLevel: "info",
};

await build({
  ...common,
  entryPoints: ["src/main/index.ts"],
  outfile: "dist/main.cjs",
});

await build({
  ...common,
  entryPoints: ["src/preload/index.ts"],
  outfile: "dist/preload.cjs",
  loader: { ".css": "text" },
});
