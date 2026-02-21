try {
  require("dotenv").config();
} catch {
  // no-op
}

// Boot the new TypeScript-based multi-tenant API.
// We use ts-node with an explicit project config so TypeScript
// uses our CommonJS settings instead of the NodeNext defaults
// that were causing TS5109 (moduleResolution vs module).
require("ts-node").register({
  project: __dirname + "/src/tsconfig.json",
  transpileOnly: true,
});

// All actual app logic (Mongo connection, Sentry, routes, metrics, SEO logic)
// now lives in the TypeScript entrypoint.
require("./src/index");

