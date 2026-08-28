import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

const rootAlias = {
  "@": fileURLToPath(new URL(".", import.meta.url)),
};

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "unit",
          environment: "node",
          include: ["**/*.test.ts"],
          exclude: ["tests/integration/**/*.test.ts", "node_modules/**"],
        },
      },
      {
        resolve: { alias: rootAlias },
        test: {
          name: "integration",
          environment: "node",
          include: ["tests/integration/**/*.test.ts"],
          fileParallelism: false,
        },
      },
    ],
  },
});
