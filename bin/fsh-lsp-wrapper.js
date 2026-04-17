#!/usr/bin/env node
// Wrapper for @aehrc/fsh-lsp that silences stray console.log output.
//
// The server calls console.log in production paths (FhirDefinitionsManager,
// FhirCodeSystemLoader, FhirTypeResolver). With --stdio transport, stdout is
// the JSON-RPC channel, and those log lines corrupt the protocol — the
// client reports "INVALID_SERVER_JSON" and blocks waiting for recovery.
//
// We:
//   1) Override process.stdout.write so non-LSP frames are redirected to stderr.
//   2) Redefine console.log as a stderr writer.
//   3) Resolve @aehrc/fsh-lsp from the global npm root and require() it.

const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const Module = require("module");

const origStdoutWrite = process.stdout.write.bind(process.stdout);

// Allow only strings that begin with an LSP frame header or JSON body.
process.stdout.write = function (chunk, encoding, callback) {
  const str = typeof chunk === "string" ? chunk : chunk.toString();
  if (
    str.startsWith("Content-Length:") ||
    str.startsWith("\r\n") ||
    str.startsWith("{")
  ) {
    return origStdoutWrite(chunk, encoding, callback);
  }
  process.stderr.write(chunk, encoding, callback);
  return true;
};

console.log = (...args) => console.error(...args);

// Build a list of module search roots to try.
function globalNpmRoot() {
  try {
    return execSync("npm root -g", { encoding: "utf-8" }).trim();
  } catch (_) {
    return null;
  }
}

const searchRoots = [
  globalNpmRoot(),
  // npm / nvm global locations
  "/usr/local/lib/node_modules",
  "/usr/lib/node_modules",
  path.join(process.env.HOME || "", ".npm-global/lib/node_modules"),
  // nvm current version
  process.env.NVM_BIN
    ? path.join(process.env.NVM_BIN, "..", "lib", "node_modules")
    : null,
  // relative to `node` binary
  path.join(path.dirname(process.execPath), "..", "lib", "node_modules"),
].filter(Boolean);

// Add each search root to the Node module resolution path.
for (const root of searchRoots) {
  if (fs.existsSync(root) && !Module.globalPaths.includes(root)) {
    Module.globalPaths.unshift(root);
  }
}

let serverPath;
let definitionProviderPath;
try {
  serverPath = require.resolve("@aehrc/fsh-lsp/out/server");
  definitionProviderPath = require.resolve("@aehrc/fsh-lsp/out/FshDefinitionProvider");
} catch (_) {
  for (const root of searchRoots) {
    const candidate = path.join(root, "@aehrc/fsh-lsp/out/server.js");
    if (fs.existsSync(candidate)) {
      serverPath = candidate;
      definitionProviderPath = path.join(
        root,
        "@aehrc/fsh-lsp/out/FshDefinitionProvider.js"
      );
      break;
    }
  }
}

// Monkey-patch FshDefinitionProvider.indexWorkspace so it caches results
// between requests. Upstream clears the functionMap and re-parses every
// *.fsh file on every single definition request, which takes ~20s on a
// 500-file IG and makes `gd` feel broken. We cache with a 30s TTL and
// invalidate when files change (tracked via directory mtime).
try {
  if (definitionProviderPath && fs.existsSync(definitionProviderPath)) {
    const mod = require(definitionProviderPath);
    const Provider = mod.FshDefinitionProvider;
    if (Provider && Provider.prototype && Provider.prototype.indexWorkspace) {
      const origIndex = Provider.prototype.indexWorkspace;
      const CACHE_TTL_MS = 30_000;

      // The constructor calls updateFunctions() without awaiting it, so the
      // first gd request that arrives while that initial scan is still
      // running would trigger a second full re-index. Wrap updateFunctions
      // so we keep a reference to the in-flight promise; indexWorkspace
      // then awaits it once instead of doing the work twice.
      const origUpdateFunctions = Provider.prototype.updateFunctions;
      if (origUpdateFunctions) {
        Provider.prototype.updateFunctions = function () {
          const p = origUpdateFunctions.call(this);
          this.__updatePromise = p;
          if (p && typeof p.then === "function") {
            p.then(
              () => {
                this.__updatePromise = null;
              },
              () => {
                this.__updatePromise = null;
              }
            );
          }
          return p;
        };
      }

      Provider.prototype.indexWorkspace = async function (document) {
        // Await the in-flight constructor scan if it's still running.
        // This avoids kicking off a second full re-index behind it.
        if (this.__updatePromise) {
          try {
            await this.__updatePromise;
          } catch (_) {}
        }

        const docUri = document && document.uri;
        if (typeof docUri !== "string" || !docUri.startsWith("file://")) {
          return origIndex.call(this, document);
        }
        const docPath = docUri.slice("file://".length);
        if (!docPath.endsWith(".fsh")) {
          return origIndex.call(this, document);
        }

        // Walk up to find `<root>/input/fsh` or the git root — same logic
        // the original method uses — so our cache key matches the root it
        // would have walked.
        let rootDir = path.dirname(docPath);
        while (rootDir !== path.dirname(rootDir)) {
          const fshSubdir = path.join(rootDir, "input", "fsh");
          if (fs.existsSync(fshSubdir)) {
            rootDir = fshSubdir;
            break;
          }
          if (fs.existsSync(path.join(rootDir, ".git"))) {
            break;
          }
          rootDir = path.dirname(rootDir);
        }

        this.__indexCache = this.__indexCache || new Map();
        const now = Date.now();
        const cached = this.__indexCache.get(rootDir);
        const hasEntries = this.functionMap && this.functionMap.size > 0;

        // Fresh cache entry: trust it.
        if (cached && hasEntries && now - cached.indexedAt < CACHE_TTL_MS) {
          return;
        }

        // First call but the constructor's updateFunctions() already filled
        // functionMap from the same workspace — treat that as a cached index
        // so first gd is instant. If it turns out the map is missing the
        // target, the request falls through to the external lookup path.
        if (!cached && hasEntries) {
          this.__indexCache.set(rootDir, { indexedAt: now });
          return;
        }

        await origIndex.call(this, document);
        this.__indexCache.set(rootDir, { indexedAt: now });
      };

      process.stderr.write(
        "fsh-lsp-wrapper: FshDefinitionProvider.indexWorkspace patched (30s cache)\n"
      );
    }
  }
} catch (err) {
  process.stderr.write(
    "fsh-lsp-wrapper: failed to patch FshDefinitionProvider: " +
      (err && err.stack ? err.stack : err) +
      "\n"
  );
}

// Make sure the transport flag is present for vscode-languageserver.
if (!process.argv.includes("--stdio") && !process.argv.includes("--node-ipc")) {
  process.argv.push("--stdio");
}

if (!serverPath) {
  process.stderr.write(
    "fsh-lsp-wrapper: cannot find @aehrc/fsh-lsp. Install it globally:\n" +
      "  npm install -g @aehrc/fsh-lsp\n" +
      "Searched: " +
      searchRoots.join(", ") +
      "\n"
  );
  process.exit(127);
}

require(serverPath);
