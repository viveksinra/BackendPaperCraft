/* eslint-disable no-console */
const path = require("path");
const mongoose = require("mongoose");

require("ts-node/register");

try {
  require("dotenv-safe").config({
    allowEmptyValues: true,
    example: path.join(__dirname, "..", ".env.example"),
  });
} catch (err) {
  require("dotenv").config();
  console.warn("dotenv-safe not configured, continuing with dotenv only");
}

const User = require("../Models/User");
const { ParentLinkModel } = require("../src/models/parentLink");

const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI;

if (!mongoUri) {
  console.error("MONGODB_URI (or MONGO_URI) is required to run this migration.");
  process.exit(1);
}

async function main() {
  mongoose.set("strictQuery", true);
  await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 10000 });

  // Find all distinct parentUserIds from ParentLink collection
  const parentUserIds = await ParentLinkModel.distinct("parentUserId");

  if (!parentUserIds.length) {
    console.log("No parent links found. Nothing to backfill.");
    return;
  }

  console.log(`Found ${parentUserIds.length} users with ParentLinks.`);

  // Update all these users to have registeredAs: 'parent' (only if not already set)
  const result = await User.updateMany(
    {
      _id: { $in: parentUserIds },
      $or: [
        { registeredAs: null },
        { registeredAs: { $exists: false } },
      ],
    },
    { $set: { registeredAs: "parent" } }
  );

  console.log("Backfill complete.");
  console.log(`  Users updated: ${result.modifiedCount}`);
  console.log(`  Users already set: ${parentUserIds.length - result.modifiedCount}`);
}

main()
  .then(() => mongoose.disconnect())
  .catch((err) => {
    console.error("Backfill failed:", err);
    mongoose.disconnect().finally(() => process.exit(1));
  });
