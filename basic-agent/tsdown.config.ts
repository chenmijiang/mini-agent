import { defineConfig } from "tsdown";

export default defineConfig({
  exports: false,
  platform: "node",
  fixedExtension: false,
  minify: true,
  outDir: "bin",
  dts: false,
  entry: {
    cli: "./src/index",
  },
  target: "node22",
  copy: [
    {
      from: "src/prompt/**/*.md",
      to: "bin/prompt",
    },
  ],
  deps: {
    alwaysBundle: [/.*/],
    onlyBundle: false,
  },
});
