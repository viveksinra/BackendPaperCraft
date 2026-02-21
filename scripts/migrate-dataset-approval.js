/* eslint-disable no-console */
const path = require("path");
const mongoose = require("mongoose");

require("ts-node").register({
  transpileOnly: true,
  compilerOptions: {
    module: "commonjs",
    moduleResolution: "node",
    esModuleInterop: true,
  },
});

try {
  require("dotenv-safe").config({
    allowEmptyValues: true,
    example: path.join(__dirname, "..", ".env.example"),
  });
} catch (err) {
  require("dotenv").config();
  console.warn("dotenv-safe not configured, continuing with dotenv only");
}

const { DatasetRowModel } = require("../src/models/datasetRow");

const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI;

if (!mongoUri) {
  console.error("MONGODB_URI (or MONGO_URI) is required to run this migration.");
  process.exit(1);
}

async function connectMongo() {
  mongoose.set("strictQuery", true);
  return mongoose.connect(mongoUri, {
    serverSelectionTimeoutMS: 10000,
  });
}

async function migrateApprovals() {
  const result = await DatasetRowModel.updateMany(
    { approvalStatus: { $exists: false } },
    { $set: { approvalStatus: "approved" } }
  );
  console.log(`Updated ${result.modifiedCount || 0} dataset rows with approvalStatus=approved`);
}

async function main() {
  await connectMongo();
  await migrateApprovals();
}

main()
  .then(() => mongoose.disconnect())
  .catch((err) => {
    console.error("Migration failed:", err);
    mongoose.disconnect().finally(() => process.exit(1));
  });


