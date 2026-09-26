import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  platform: "node",
  target: "node22",
  outDir: "dist",
  clean: true,
  // @mdiw/shared exports raw .ts, so it must be bundled.
  noExternal: [/^@mdiw\//],
});
