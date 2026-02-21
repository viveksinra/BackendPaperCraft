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

const Company = require("../Models/Company");
const { DomainConfigModel } = require("../src/models/domainConfig");
const { generateCompanySlug } = require("../utils/companySlug");

const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI;
const DEFAULT_PREVIEW_HOST =
  process.env.PREVIEW_HOST || process.env.DELIVERY_HOST || process.env.PUBLIC_HOST || "localhost:3000";
const DEFAULT_PREVIEW_PATH = process.env.PREVIEW_BASE_PATH || "/preview";

if (!mongoUri) {
  console.error("MONGODB_URI (or MONGO_URI) is required to run this migration.");
  process.exit(1);
}

function buildPreviewDefaults() {
  return {
    enabled: true,
    host: DEFAULT_PREVIEW_HOST,
    path: DEFAULT_PREVIEW_PATH,
    token: Math.random().toString(36).slice(2),
    lastSyncedAt: new Date(),
  };
}

async function connectMongo() {
  mongoose.set("strictQuery", true);
  return mongoose.connect(mongoUri, {
    serverSelectionTimeoutMS: 10000,
  });
}

async function migrateCompany(company) {
  if (company.slug) {
    return false;
  }
  company.slug = await generateCompanySlug(Company, company.name, company._id);
  await company.save();
  return true;
}

async function migrateDomainConfig(companyId) {
  const config = await DomainConfigModel.findOne({ companyId });
  if (!config) return false;

  let mutated = false;
  if (!config.preview || !config.preview.token) {
    config.preview = buildPreviewDefaults();
    mutated = true;
  }
  if (!config.previewHostname) {
    config.previewHostname = DEFAULT_PREVIEW_HOST;
    mutated = true;
  }
  if (!config.previewPath) {
    config.previewPath = DEFAULT_PREVIEW_PATH;
    mutated = true;
  }
  if (!config.previewToken) {
    config.previewToken = Math.random().toString(36).slice(2);
    mutated = true;
  }
  if (mutated) {
    await config.save();
  }
  return mutated;
}

async function main() {
  await connectMongo();
  const companies = await Company.find({});
  if (!companies.length) {
    console.log("No companies found. Nothing to migrate.");
    return;
  }

  let slugged = 0;
  let previewUpdated = 0;

  for (const company of companies) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const changed = await migrateCompany(company);
      if (changed) slugged += 1;

      // eslint-disable-next-line no-await-in-loop
      const updatedPreview = await migrateDomainConfig(company._id);
      if (updatedPreview) previewUpdated += 1;
    } catch (err) {
      console.error(`Failed to migrate company ${company._id}:`, err.message);
    }
  }

  console.log("Company slug and domain preview migration complete.");
  console.log(`  Companies slugged: ${slugged}`);
  console.log(`  Domain configs updated: ${previewUpdated}`);
}

main()
  .then(() => mongoose.disconnect())
  .catch((err) => {
    console.error("Migration failed:", err);
    mongoose.disconnect().finally(() => process.exit(1));
  });

