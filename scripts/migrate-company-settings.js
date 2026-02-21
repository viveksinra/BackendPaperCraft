/* eslint-disable no-console */
const path = require("path");
const mongoose = require("mongoose");

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
const CompanySettings = require("../Models/CompanySettings");

const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI;
const DEFAULT_TENANT_ID = process.env.DEFAULT_TENANT_ID || "devTenant";

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

const mergeBranding = (value) => CompanySettings.mergeBranding(value || {});
const mergeSeoDefaults = (value) => CompanySettings.mergeSeoDefaults(value);

async function migrateCompany(company) {
  const tenantId = company.tenantId || DEFAULT_TENANT_ID;
  const current = await CompanySettings.findOne({ companyId: company._id });

  if (!current) {
    await CompanySettings.create({
      companyId: company._id,
      tenantId,
      branding: mergeBranding(company.brandSettings),
      seoDefaults: mergeSeoDefaults(),
      qa: { warnings: [], updatedBy: company.owner },
    });
    return "created";
  }

  let mutated = false;

  if (!current.tenantId) {
    current.tenantId = tenantId;
    mutated = true;
  }

  const currentBranding = current.branding ? current.branding.toObject?.() ?? current.branding : {};
  const mergedBranding = mergeBranding({
    ...currentBranding,
    ...(company.brandSettings || {}),
  });
  const brandingChanged = JSON.stringify(mergedBranding) !== JSON.stringify(current.branding || {});
  if (brandingChanged) {
    current.branding = mergedBranding;
    mutated = true;
  }

  if (!current.seoDefaults || Object.keys(current.seoDefaults).length === 0) {
    current.seoDefaults = mergeSeoDefaults();
    mutated = true;
  }

  if (mutated) {
    await current.save();
    return "updated";
  }

  return "skipped";
}

async function main() {
  await connectMongo();
  const companies = await Company.find({});
  if (!companies.length) {
    console.log("No companies found. Nothing to migrate.");
    return;
  }

  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const company of companies) {
    try {
      const result = await migrateCompany(company);
      if (result === "created") created += 1;
      else if (result === "updated") updated += 1;
      else skipped += 1;
    } catch (err) {
      console.error(`Failed to migrate company ${company._id}:`, err.message);
    }
  }

  console.log("Company settings migration complete.");
  console.log(`  Created: ${created}`);
  console.log(`  Updated: ${updated}`);
  console.log(`  Skipped: ${skipped}`);
}

main()
  .then(() => mongoose.disconnect())
  .catch((err) => {
    console.error("Migration failed:", err);
    mongoose.disconnect().finally(() => process.exit(1));
  });


