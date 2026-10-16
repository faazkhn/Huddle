import { defineConfig } from "vite";
// The relay serves the build at / and /r/CODE, so assets use absolute paths.
export default defineConfig({ base: "/", build: { target: "es2022" } });
