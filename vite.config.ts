import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import { benchPlugin } from "./server/bench.mjs"

// BASE_PATH is set by the GitHub Pages build (/ai-model-compare/); local runs serve from /.
// Read through globalThis: the config is type-checked without Node's typings.
const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {}

export default defineConfig({
  base: env.BASE_PATH ?? "/",
  plugins: [react(), benchPlugin()],
})
