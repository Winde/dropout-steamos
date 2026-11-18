import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    restoreMocks: true,
    clearMocks: true,
    setupFiles: ["tests/setup.ts"],
    environmentOptions: {
      jsdom: {
        url: "https://watch.dropout.tv/browse",
        pretendToBeVisual: true,
      },
    },
  },
});
