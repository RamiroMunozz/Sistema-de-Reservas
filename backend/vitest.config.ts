import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["tests/**/*.test.ts"],
    testTimeout: 10000,
    // Los archivos que usan la base descartable comparten datos: correrlos en serie evita interferencias.
    fileParallelism: false,
  },
});
