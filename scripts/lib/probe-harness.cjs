/*
 * Shared probe infrastructure (TODO-023). Business-logic-neutral: this module
 * only lets a Node probe require the project's real TypeScript modules; every
 * domain assertion stays inside the individual probe.
 *
 * What installProbeHarness() does:
 *   1. optionally loads .env.local then .env from the project root (dotenv);
 *   2. resolves the "server-only" marker package to scripts/stubs/server-only.cjs
 *      so server modules can be exercised in-process;
 *   3. resolves the "@/" path alias against the project root (.ts, .tsx,
 *      directory index.ts);
 *   4. registers require.extensions for .ts/.tsx that transpile with the same
 *      compiler options every probe historically used (CommonJS, ES2020,
 *      ReactJSX, esModuleInterop) and rewrite import.meta.url to a CJS
 *      equivalent (the generated Prisma client needs this).
 *
 * DELIBERATELY NOT USED by the client-boundary probes
 * (persistence-boundary, migration-export, server-persistence): those probes
 * omit the server-only stub on purpose — a client module importing
 * "server-only" must FAIL there, that failure is the assertion.
 *
 * Usage:
 *   const { installProbeHarness } = require("./lib/probe-harness.cjs");
 *   const { root } = installProbeHarness();                  // with dotenv
 *   const { root } = installProbeHarness({ loadEnv: false }); // deterministic probes
 */
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");

const root = path.resolve(__dirname, "..", "..");

let installed = false;

function installProbeHarness({ loadEnv = true } = {}) {
  if (loadEnv) {
    require("dotenv").config({ path: path.join(root, ".env.local") });
    require("dotenv").config({ path: path.join(root, ".env") });
  }
  if (installed) return { root };
  installed = true;

  const originalResolveFilename = Module._resolveFilename;
  Module._resolveFilename = function resolveProjectAlias(request, parent, isMain, options) {
    if (request === "server-only") {
      return path.join(__dirname, "..", "stubs", "server-only.cjs");
    }
    if (request.startsWith("@/")) {
      const mapped = path.join(root, request.slice(2));
      if (fs.existsSync(`${mapped}.ts`)) return `${mapped}.ts`;
      if (fs.existsSync(`${mapped}.tsx`)) return `${mapped}.tsx`;
      if (fs.existsSync(path.join(mapped, "index.ts"))) return path.join(mapped, "index.ts");
    }
    return originalResolveFilename.call(this, request, parent, isMain, options);
  };

  for (const extension of [".ts", ".tsx"]) {
    require.extensions[extension] = function transpileTypeScript(module, filename) {
      const source = fs.readFileSync(filename, "utf8");
      const output = ts.transpileModule(source, {
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          target: ts.ScriptTarget.ES2020,
          jsx: ts.JsxEmit.ReactJSX,
          esModuleInterop: true
        },
        fileName: filename
      });
      // The generated Prisma client references import.meta.url, which
      // transpileModule cannot lower to CommonJS; rewrite it so Node does not
      // misdetect the transpiled output as an ES module.
      const compiled = output.outputText.replace(
        /import\.meta\.url/g,
        "require('node:url').pathToFileURL(__filename).href"
      );
      module._compile(compiled, filename);
    };
  }

  return { root };
}

module.exports = { root, installProbeHarness };
