import { readFile } from "node:fs/promises"
import { createRequire } from "node:module"
import { runInNewContext } from "node:vm"
import ts from "typescript"

const require = createRequire(import.meta.url)
const source = await readFile(new URL("../src/language.ts", import.meta.url), "utf8")
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText
const english = JSON.parse(await readFile(new URL("../src/locales/en.json", import.meta.url), "utf8"))
const chinese = JSON.parse(await readFile(new URL("../src/locales/zh-TW.json", import.meta.url), "utf8"))

export function languageScope(globals = {}) {
  const scope = { exports: {}, require: (id) => {
    if (id.endsWith("/en.json")) return { default: english }
    if (id.endsWith("/zh-TW.json")) return { default: chinese }
    return require(id)
  }, ...globals }
  runInNewContext(code, scope)
  return scope
}
