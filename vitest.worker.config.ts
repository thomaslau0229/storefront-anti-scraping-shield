import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

const migrations = await readD1Migrations("./migrations");

export default defineConfig({
  plugins: [
    cloudflareTest({
      miniflare: { bindings: { TEST_MIGRATIONS: migrations } },
      wrangler: { configPath: "./wrangler.test.jsonc" },
    }),
  ],
  test: {
    include: ["tests/**/*.worker.test.ts"],
    maxWorkers: 1,
    isolate: false,
  },
});
