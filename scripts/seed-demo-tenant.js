/* eslint-disable no-console */
const path = require("path");
const crypto = require("crypto");
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

require("ts-node").register({
  project: path.join(__dirname, "..", "src", "tsconfig.json"),
  transpileOnly: true,
});

const Company = require("../Models/Company");
const Template = require("../Models/Template");
const { DatasetModel } = require("../src/models/dataset");
const { DatasetRowModel } = require("../src/models/datasetRow");
const { GenerationRunModel } = require("../src/models/generationRun");
const { upsertDraftPage } = require("../src/services/draftService");
const { renderPage } = require("../src/services/renderer");
const { getCompanySettingsSnapshot } = require("../src/services/companySettings.ts");

const SEED_TENANT_ID = process.env.SEED_TENANT_ID || "devTenant";
const SEED_DEMO_EMAIL = (process.env.SEED_DEMO_EMAIL || "demo@papercraft.dev").toLowerCase();
const DEFAULT_HOST = process.env.SEED_HOST || "demo.localhost:3044";
const BASE_PATH = process.env.BASE_PATH || "/blog";
const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI;

if (!mongoUri) {
  console.error("MONGODB_URI (or MONGO_URI) is required to seed demo data.");
  process.exit(1);
}

const SAMPLE_DATASET = {
  name: "Tech Talent Cities",
  slug: "tech-talent-cities",
  description: "Ranked locations for hiring React developers across US tech hubs.",
};

const SAMPLE_ROWS = [
  {
    entityId: "react-devs-austin",
    slug: "react-developers-austin-tx",
    locale: "en",
    data: {
      city: "Austin",
      state: "TX",
      country: "USA",
      skill: "React Developers",
      avgSalary: 142000,
      demandIndex: 92,
      talentPool: 4700,
      hiringSpeedDays: 32,
    },
  },
  {
    entityId: "react-devs-denver",
    slug: "react-developers-denver-co",
    locale: "en",
    data: {
      city: "Denver",
      state: "CO",
      country: "USA",
      skill: "React Developers",
      avgSalary: 134000,
      demandIndex: 84,
      talentPool: 3100,
      hiringSpeedDays: 29,
    },
  },
  {
    entityId: "react-devs-miami",
    slug: "react-developers-miami-fl",
    locale: "en",
    data: {
      city: "Miami",
      state: "FL",
      country: "USA",
      skill: "React Developers",
      avgSalary: 129000,
      demandIndex: 76,
      talentPool: 2600,
      hiringSpeedDays: 35,
    },
  },
];

async function connectMongo() {
  mongoose.set("strictQuery", true);
  return mongoose.connect(mongoUri, {
    serverSelectionTimeoutMS: 10000,
  });
}

async function ensureCompany() {
  let company = await Company.findOne();
  if (company) return company;

  company = new Company({
    name: "Demo Company",
    owner: SEED_DEMO_EMAIL,
  });
  await company.save();
  return company;
}

async function ensureTemplate(companyId) {
  const slug = "tech-talent-guide";
  let template = await Template.findOne({ companyId, slug });
  if (template) return template;

  template = new Template({
    companyId,
    name: "Tech Talent Hiring Guide",
    slug,
    description: "Programmatic hiring guide for React talent across US cities.",
    variables: [
      { key: "city", label: "City Name", required: true },
      { key: "skill", label: "Skill Focus", required: true },
      { key: "avgSalary", label: "Average Salary" },
      { key: "demandIndex", label: "Demand Index" },
    ],
    placements: {
      h1: ["skill", "city"],
      intro: ["city", "avgSalary"],
    },
    structure: {
      hero: {
        h1: "{{skill}} hiring in {{city}}",
        intro:
          "{{city}} has a deep {{skill}} talent pool. Review salaries, demand signals, and hiring timelines.",
      },
      sections: [
        {
          id: "overview",
          heading: "{{city}} snapshot",
          body: "Average salary: {{avgSalary}}. Demand index: {{demandIndex}}/100.",
        },
      ],
    },
    createdBy: SEED_DEMO_EMAIL,
    updatedBy: SEED_DEMO_EMAIL,
  });
  await template.save();
  return template;
}

async function upsertDataset(company, template) {
  const dataset = await DatasetModel.findOneAndUpdate(
    {
      companyId: company._id,
      slug: SAMPLE_DATASET.slug,
    },
    {
      tenantId: SEED_TENANT_ID,
      name: SAMPLE_DATASET.name,
      description: SAMPLE_DATASET.description,
      source: "csv",
      status: "active",
      createdBy: SEED_DEMO_EMAIL,
      updatedBy: SEED_DEMO_EMAIL,
      tags: ["demo", "react"],
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  const rows = [];
  for (const row of SAMPLE_ROWS) {
    const hash = crypto.createHash("sha1").update(JSON.stringify(row.data)).digest("hex");
    const doc = await DatasetRowModel.findOneAndUpdate(
      {
        datasetId: dataset._id,
        entityId: row.entityId,
      },
      {
        tenantId: SEED_TENANT_ID,
        companyId: company._id,
        datasetId: dataset._id,
        entityId: row.entityId,
        slug: row.slug,
        locale: row.locale,
        data: row.data,
        hash,
        status: "ready",
        qaStatus: "unknown",
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    rows.push(doc);
  }

  dataset.rowCount = rows.length;
  await dataset.save();

  const generationRun = await GenerationRunModel.create({
    tenantId: SEED_TENANT_ID,
    companyId: company._id,
    datasetId: dataset._id,
    templateId: template._id,
    status: "completed",
    requestedBy: SEED_DEMO_EMAIL,
    requestedCount: rows.length,
    generatedCount: rows.length,
    failedCount: 0,
    params: { locale: "en", tone: "confident" },
    qaSummary: { averageScore: 82, reviewCount: 0, passCount: rows.length },
    startedAt: new Date(),
    completedAt: new Date(),
  });

  const settingsSnapshot = await getCompanySettingsSnapshot(company._id.toString(), SEED_TENANT_ID);

  for (const row of rows) {
    const title = `${row.data.skill} hiring in ${row.data.city}, ${row.data.state}`;
    const description = `Benchmark salaries (${row.data.avgSalary.toLocaleString("en-US", {
      style: "currency",
      currency: "USD",
    })}) and demand index (${row.data.demandIndex}/100) for ${row.data.skill} in ${row.data.city}.`;

    const render = renderPage({
      tenantId: SEED_TENANT_ID,
      companyId: company._id.toString(),
      slug: row.slug,
      locale: row.locale,
      basePath: BASE_PATH,
      host: DEFAULT_HOST,
      template: {
        title,
        description,
        schemaType: "Article",
      },
      datasetRow: row.data,
      branding: settingsSnapshot.branding,
      seoDefaults: settingsSnapshot.seoDefaults,
    });

    await upsertDraftPage({
      tenantId: SEED_TENANT_ID,
      companyId: company._id.toString(),
      datasetId: dataset._id.toString(),
      datasetRowId: row._id.toString(),
      templateId: template._id.toString(),
      generationRunId: generationRun._id.toString(),
      slug: row.slug,
      locale: row.locale,
      title,
      description,
      body: render.html,
      jsonLd: render.jsonLd,
      links: render.links,
      qa: render.qa,
      overrides: row.data,
      diff: [],
      etag: render.etag,
      note: "Seed draft",
      createdBy: SEED_DEMO_EMAIL,
    });
  }

  return { dataset };
}

async function main() {
  console.log("🌱 Seeding demo tenant data...");
  await connectMongo();
  const company = await ensureCompany();
  const template = await ensureTemplate(company._id);
  const { dataset } = await upsertDataset(company, template);

  console.log("\n✅ Demo data ready:");
  console.log(`   Company: ${company.name} (${company._id.toString()})`);
  console.log(`   Template: ${template.name} (${template.slug})`);
  console.log(`   Dataset: ${dataset.name} (${dataset.slug}) with ${dataset.rowCount} rows`);
  console.log("   Drafts available under /dashboard/templates once you log in.\n");
}

main()
  .then(() => mongoose.disconnect())
  .catch((err) => {
    console.error("Seed script failed:", err);
    mongoose.disconnect().finally(() => process.exit(1));
  });
