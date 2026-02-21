try {
  require("dotenv").config();
} catch {
  // ignore missing dotenv
}

require("ts-node").register({
  project: __dirname + "/src/tsconfig.json",
  transpileOnly: true,
});

require("./src/worker");


