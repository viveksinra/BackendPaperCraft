/* eslint-disable no-console */
/**
 * Master Seed Script — creates users, company, memberships, and test data.
 *
 * Usage:
 *   node scripts/seed-all.js
 *
 * What it creates:
 *   Organisation: Chelmsford 11 Plus (username: chelmsford11plus)
 *   7 users (one per role) — all with password "Test@1234"
 *
 *   Role            Name                  Email
 *   ─────────────── ───────────────────── ──────────────────────────────
 *   owner           Navin Pathak          navin@chelmsford11plus.com
 *   admin           Vivek Kumar           vivek@chelmsford11plus.com
 *   senior_teacher  Sarah Williams        sarah@chelmsford11plus.com
 *   teacher         James Anderson        james@chelmsford11plus.com
 *   content_reviewer Priya Sharma         priya@chelmsford11plus.com
 *   student         Oliver Brown          oliver@chelmsford11plus.com
 *   parent          Emma Johnson          emma@chelmsford11plus.com
 *
 * Idempotent: safe to run multiple times — skips existing records.
 */

const path = require("path");
const mongoose = require("mongoose");

// ─── Load .env ──────────────────────────────────────────────────────────────
try {
  require("dotenv-safe").config({
    allowEmptyValues: true,
    example: path.join(__dirname, "..", ".env.example"),
  });
} catch (_) {
  require("dotenv").config();
}

// ─── Models ─────────────────────────────────────────────────────────────────
const User = require("../Models/User");
const Company = require("../Models/Company");
const Membership = require("../Models/Membership");
const CompanySettings = require("../Models/CompanySettings");
const { createPasswordRecord } = require("../utils/auth");

// ─── Config ─────────────────────────────────────────────────────────────────
const mongoUri =
  process.env.MONGODB_URI ||
  process.env.MONGO_DEVELOPMENT_URI ||
  process.env.MONGO_URI ||
  "mongodb://localhost:27017/papercraft";

const TENANT_ID = "devTenant";
const DEFAULT_PASSWORD = "Test@1234";

const COMPANY = {
  name: "Chelmsford 11 Plus",
  username: "chelmsford11plus",
  description: "Premier 11+ exam preparation centre in Chelmsford, Essex. Specialising in FSCE, CSSE, and grammar school entrance exams.",
  contactEmail: "info@chelmsford11plus.com",
  websiteUrl: "https://chelmsford11plus.com",
  brandSettings: {
    displayName: "Chelmsford 11+",
    tagline: "Unlock your child's potential",
    primaryColor: "#1e40af",
    secondaryColor: "#3b82f6",
    accentColor: "#f59e0b",
    backgroundColor: "#ffffff",
    surfaceColor: "#f8fafc",
    textColor: "#1e293b",
    fontFamily: "Inter, sans-serif",
    headingFont: "Inter, sans-serif",
  },
};

const USERS = [
  {
    email: "navin@chelmsford11plus.com",
    firstName: "Navin",
    lastName: "Pathak",
    role: "owner",
    about: "Director of Chelmsford 11 Plus. Education professional with 15+ years experience in entrance exam preparation.",
    phoneNumber: "+44 7700 100001",
  },
  {
    email: "vivek@chelmsford11plus.com",
    firstName: "Vivek",
    lastName: "Kumar",
    role: "admin",
    isSuperAdmin: true,
    about: "Full-stack developer and platform administrator. Building the PaperCraft platform.",
    phoneNumber: "+44 7700 100002",
  },
  {
    email: "sarah@chelmsford11plus.com",
    firstName: "Sarah",
    lastName: "Williams",
    role: "senior_teacher",
    about: "Head of Mathematics. 12 years of experience teaching 11+ maths preparation and verbal reasoning.",
    phoneNumber: "+44 7700 100003",
  },
  {
    email: "james@chelmsford11plus.com",
    firstName: "James",
    lastName: "Anderson",
    role: "teacher",
    about: "English and Verbal Reasoning tutor. Specialises in creative writing and comprehension for 11+ exams.",
    phoneNumber: "+44 7700 100004",
  },
  {
    email: "priya@chelmsford11plus.com",
    firstName: "Priya",
    lastName: "Sharma",
    role: "content_reviewer",
    about: "Quality assurance lead. Reviews and approves all question bank content before publication.",
    phoneNumber: "+44 7700 100005",
  },
  {
    email: "oliver@chelmsford11plus.com",
    firstName: "Oliver",
    lastName: "Brown",
    role: "student",
    about: "Year 5 student preparing for grammar school entrance exams.",
  },
  {
    email: "emma@chelmsford11plus.com",
    firstName: "Emma",
    lastName: "Johnson",
    role: "parent",
    about: "Parent of Oliver. Monitors progress and accesses practice papers.",
    phoneNumber: "+44 7700 100007",
  },
];

// ─── Helpers ────────────────────────────────────────────────────────────────

async function connectMongo() {
  mongoose.set("strictQuery", true);
  await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 10000 });
  console.log(`   Connected to MongoDB: ${mongoUri.replace(/\/\/.*@/, "//***@")}`);
}

async function upsertUser(userData) {
  let user = await User.findOne({ email: userData.email });
  if (user) {
    if (userData.isSuperAdmin && !user.isSuperAdmin) {
      user.isSuperAdmin = true;
      await user.save();
      console.log(`   ~ Updated user: ${userData.email} → isSuperAdmin: true`);
    } else {
      console.log(`   ✓ User exists: ${userData.email} (${userData.firstName} ${userData.lastName})`);
    }
    return user;
  }

  const password = createPasswordRecord(DEFAULT_PASSWORD);
  user = await User.create({
    email: userData.email,
    password,
    firstName: userData.firstName,
    lastName: userData.lastName,
    about: userData.about || "",
    phoneNumber: userData.phoneNumber || "",
    ...(userData.isSuperAdmin ? { isSuperAdmin: true } : {}),
  });
  console.log(`   + Created user: ${userData.email} (${userData.firstName} ${userData.lastName})`);
  return user;
}

async function upsertCompany(ownerEmail) {
  let company = await Company.findOne({ username: COMPANY.username });
  if (company) {
    console.log(`   ✓ Company exists: ${company.name} (@${company.username})`);
    return company;
  }

  company = await Company.create({
    name: COMPANY.name,
    owner: ownerEmail,
    slug: COMPANY.username,
    username: COMPANY.username,
    description: COMPANY.description,
    contactEmail: COMPANY.contactEmail,
    websiteUrl: COMPANY.websiteUrl,
    brandSettings: COMPANY.brandSettings,
  });
  console.log(`   + Created company: ${company.name} (@${company.username}) — ID: ${company._id}`);
  return company;
}

async function upsertMembership(companyId, userEmail, role) {
  let membership = await Membership.findOne({ companyId, userEmail });
  if (membership) {
    if (membership.role !== role) {
      membership.role = role;
      await membership.save();
      console.log(`   ~ Updated membership: ${userEmail} → ${role}`);
    } else {
      console.log(`   ✓ Membership exists: ${userEmail} → ${role}`);
    }
    return membership;
  }

  membership = await Membership.create({ companyId, userEmail, role });
  console.log(`   + Created membership: ${userEmail} → ${role}`);
  return membership;
}

async function upsertCompanySettings(companyId) {
  let settings = await CompanySettings.findOne({ companyId });
  if (settings) {
    console.log(`   ✓ Company settings exist`);
    return settings;
  }

  settings = await CompanySettings.create({
    companyId,
    tenantId: TENANT_ID,
    branding: COMPANY.brandSettings,
  });
  console.log(`   + Created company settings`);
  return settings;
}

async function setLastActiveCompany(user, companyId) {
  if (!user.lastActiveCompanyId || user.lastActiveCompanyId.toString() !== companyId.toString()) {
    user.lastActiveCompanyId = companyId;
    await user.save();
  }
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log("");
  console.log("╔══════════════════════════════════════════════════════════╗");
  console.log("║       PaperCraft — Master Seed Script                   ║");
  console.log("╚══════════════════════════════════════════════════════════╝");
  console.log("");

  // 1. Connect
  console.log("1. Connecting to MongoDB...");
  await connectMongo();
  console.log("");

  // 2. Create users
  console.log("2. Creating users (password for all: " + DEFAULT_PASSWORD + ")");
  console.log("   ─────────────────────────────────────────────────────");
  const userDocs = {};
  for (const u of USERS) {
    userDocs[u.email] = await upsertUser(u);
  }
  console.log("");

  // 3. Create company
  console.log("3. Creating organisation...");
  console.log("   ─────────────────────────────────────────────────────");
  const ownerEmail = USERS[0].email;
  const company = await upsertCompany(ownerEmail);
  console.log("");

  // 4. Create memberships
  console.log("4. Creating memberships...");
  console.log("   ─────────────────────────────────────────────────────");
  for (const u of USERS) {
    await upsertMembership(company._id, u.email, u.role);
  }
  console.log("");

  // 5. Company settings
  console.log("5. Creating company settings...");
  console.log("   ─────────────────────────────────────────────────────");
  await upsertCompanySettings(company._id);
  console.log("");

  // 6. Set lastActiveCompanyId for all users
  console.log("6. Setting active company for all users...");
  for (const u of USERS) {
    await setLastActiveCompany(userDocs[u.email], company._id);
  }
  console.log("   ✓ Done");
  console.log("");

  // ─── Summary ──────────────────────────────────────────────────────────────
  console.log("╔══════════════════════════════════════════════════════════╗");
  console.log("║  SEED COMPLETE — Login Credentials                      ║");
  console.log("╠══════════════════════════════════════════════════════════╣");
  console.log("║                                                          ║");
  console.log("║  Organisation: Chelmsford 11 Plus                        ║");
  console.log("║  Company ID:   " + company._id.toString().padEnd(41) + " ║");
  console.log("║  Password:     " + DEFAULT_PASSWORD.padEnd(41) + " ║");
  console.log("║                                                          ║");
  console.log("╠──────────────────────────────────────────────────────────╣");

  const roleLabels = {
    owner: "Owner / Director",
    admin: "Admin / Developer",
    senior_teacher: "Senior Teacher",
    teacher: "Teacher",
    content_reviewer: "Content Reviewer",
    student: "Student",
    parent: "Parent",
  };

  for (const u of USERS) {
    const label = (roleLabels[u.role] || u.role).padEnd(18);
    const name = `${u.firstName} ${u.lastName}`.padEnd(20);
    const email = u.email.padEnd(35);
    console.log(`║  ${label} ${name} ${email}║`);
  }

  console.log("║                                                          ║");
  console.log("╠──────────────────────────────────────────────────────────╣");
  console.log("║                                                          ║");
  console.log("║  Login:  POST /api/v2/auth/login                         ║");
  console.log("║  Body:   { \"email\": \"<email>\", \"password\": \"Test@1234\" }  ║");
  console.log("║                                                          ║");
  console.log("╚══════════════════════════════════════════════════════════╝");
  console.log("");
}

main()
  .then(() => mongoose.disconnect())
  .catch((err) => {
    console.error("\n❌ Seed failed:", err.message || err);
    mongoose.disconnect().finally(() => process.exit(1));
  });
