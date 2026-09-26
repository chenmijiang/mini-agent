import { defineConfig } from "tsdown";

export default defineConfig({
  exports: true,
  platform: "node",
  fixedExtension: false,
  minify: true,
  target: "node22",
});
