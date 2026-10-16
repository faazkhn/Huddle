import { defineConfig } from "vitest/config";
// TV app UI specs run under the Vega template's Jest; Vitest covers pure logic (*.test.ts).
export default defineConfig({ test: { include: ["**/*.test.ts"], exclude: ["**/node_modules/**"] } });
