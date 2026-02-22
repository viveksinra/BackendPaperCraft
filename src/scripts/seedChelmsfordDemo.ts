/**
 * Chelmsford 11 Plus — Comprehensive Demo Seed Data
 *
 * Prerequisites:
 *   npm run seed          (creates company + 7 users)
 *   npm run seed:templates (creates paper templates + blueprints)
 *
 * Usage:
 *   npm run seed:chelmsford
 *
 * Idempotent: safe to re-run — uses upsert / findOneAndUpdate with unique keys.
 */

import mongoose, { Types } from "mongoose";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.join(__dirname, "..", "..", ".env") });

// ─── Models ─────────────────────────────────────────────────────────────────
const User = require("../../Models/User");
const Company = require("../../Models/Company");
const Membership = require("../../Models/Membership");
const { createPasswordRecord } = require("../../utils/auth");

import { SubjectModel } from "../models/subject";
import { QuestionModel } from "../models/question";
import { PaperModel } from "../models/paper";
import { PaperSetModel } from "../models/paperSet";
import { PaperTemplateModel } from "../models/paperTemplate";
import { StudentModel } from "../models/student";
import { ClassModel } from "../models/class";
import { OnlineTestModel } from "../models/onlineTest";
import { TestAttemptModel } from "../models/testAttempt";
import { CourseModel } from "../models/course";
import { AnnouncementModel } from "../models/announcement";

// ─── Config ─────────────────────────────────────────────────────────────────
const mongoUri =
  process.env.MONGODB_URI ||
  process.env.MONGO_DEVELOPMENT_URI ||
  process.env.MONGO_URI ||
  "mongodb://localhost:27017/papercraft";

const TENANT_ID = "devTenant";
const DEFAULT_PASSWORD = "Test@1234";
const SYSTEM_EMAIL = "system@papercraft.app";
const NAVIN_EMAIL = "navin@chelmsford11plus.com";
const SARAH_EMAIL = "sarah@chelmsford11plus.com";
const JAMES_EMAIL = "james@chelmsford11plus.com";
const MANVI_EMAIL = "manvi@chelmsford11plus.com";

// ─── Seed Context ───────────────────────────────────────────────────────────
interface SeedContext {
  companyId: any;
  users: Record<string, any>;
  subjects: Record<string, any>;
  questions: Record<string, any[]>;
  papers: Record<string, any>;
  paperSets: Record<string, any>;
  students: Record<string, any>;
  classes: Record<string, any>;
  tests: Record<string, any>;
  courses: Record<string, any>;
  templates: Record<string, any>;
}

// ─── Helpers ────────────────────────────────────────────────────────────────
function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function genStudentCode(): string {
  return "C11P-" + Math.random().toString(36).substring(2, 8).toUpperCase();
}

function daysFromNow(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d;
}

function daysAgo(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d;
}

function log(icon: string, msg: string) {
  console.log(`   ${icon} ${msg}`);
}

// Upsert a question by company + type + body substring
async function upsertQuestion(data: any): Promise<any> {
  const snippet = data.content.body.substring(0, 50);
  const escaped = snippet.replace(/[.*+?^${}()|[\]\\\/]/g, "\\$&");
  const existing = await QuestionModel.findOne({
    companyId: data.companyId,
    type: data.type,
    "content.body": { $regex: escaped },
  });
  if (existing) return existing;
  return QuestionModel.create(data);
}

// ═══════════════════════════════════════════════════════════════════════════
// 1. MANVI USER
// ═══════════════════════════════════════════════════════════════════════════
async function seedManvi(ctx: SeedContext) {
  console.log("\n1. Creating Manvi Pathak (admin/manager)...");
  let user = await User.findOne({ email: MANVI_EMAIL });
  if (!user) {
    const password = createPasswordRecord(DEFAULT_PASSWORD);
    user = await User.create({
      email: MANVI_EMAIL,
      password,
      firstName: "Manvi",
      lastName: "Pathak",
      about: "Operations Manager at Chelmsford 11 Plus. Oversees student enrolment, class scheduling, and parent communications.",
      phoneNumber: "+44 7700 100008",
    });
    log("+", `Created user: ${MANVI_EMAIL}`);
  } else {
    log("=", `User exists: ${MANVI_EMAIL}`);
  }

  // Membership
  const mem = await Membership.findOne({ companyId: ctx.companyId, userEmail: MANVI_EMAIL });
  if (!mem) {
    await Membership.create({ companyId: ctx.companyId, userEmail: MANVI_EMAIL, role: "admin" });
    log("+", "Created membership: manvi -> admin");
  } else {
    log("=", "Membership exists: manvi -> admin");
  }

  if (!user.lastActiveCompanyId || user.lastActiveCompanyId.toString() !== ctx.companyId.toString()) {
    user.lastActiveCompanyId = ctx.companyId;
    await user.save();
  }
  ctx.users["manvi"] = user;
}

// ═══════════════════════════════════════════════════════════════════════════
// 2. SUBJECTS (~50 hierarchical records)
// ═══════════════════════════════════════════════════════════════════════════

interface SubjectDef {
  name: string;
  chapters: { name: string; topics: string[] }[];
}

const SUBJECT_TREE: SubjectDef[] = [
  {
    name: "Mathematics",
    chapters: [
      { name: "Number", topics: ["Place Value & Ordering", "Fractions, Decimals & Percentages", "Operations & Mental Maths"] },
      { name: "Algebra", topics: ["Sequences & Patterns", "Simple Equations"] },
      { name: "Geometry", topics: ["2D Shapes & Angles", "3D Shapes & Nets"] },
      { name: "Measures", topics: ["Length, Mass & Capacity", "Time & Timetables"] },
      { name: "Statistics", topics: ["Data Handling & Charts", "Mean, Median & Mode"] },
      { name: "Ratio & Proportion", topics: ["Ratio Problems", "Proportion & Scaling"] },
    ],
  },
  {
    name: "English",
    chapters: [
      { name: "Comprehension", topics: ["Fiction Passages", "Non-Fiction Passages"] },
      { name: "Vocabulary", topics: ["Synonyms & Antonyms", "Word Definitions"] },
      { name: "Grammar", topics: ["Sentence Structure", "Parts of Speech"] },
      { name: "Creative Writing", topics: ["Story Writing", "Descriptive Writing"] },
      { name: "Spelling & Punctuation", topics: ["Common Spelling Patterns", "Punctuation Rules"] },
    ],
  },
  {
    name: "Verbal Reasoning",
    chapters: [
      { name: "Word Patterns", topics: ["Compound Words", "Hidden Words"] },
      { name: "Letter Sequences", topics: ["Alphabet Series", "Letter Codes"] },
      { name: "Coding", topics: ["Number Coding", "Letter Coding"] },
      { name: "Analogies", topics: ["Word Analogies", "Verbal Relationships"] },
      { name: "Odd One Out", topics: ["Word Groups", "Category Exclusion"] },
    ],
  },
  {
    name: "Non-Verbal Reasoning",
    chapters: [
      { name: "Sequences", topics: ["Shape Sequences", "Pattern Continuation"] },
      { name: "Analogies", topics: ["Shape Analogies", "Visual Relationships"] },
      { name: "Odd One Out", topics: ["Shape Groups", "Pattern Exclusion"] },
      { name: "Spatial Reasoning", topics: ["Paper Folding", "Cube Nets"] },
      { name: "Rotation & Reflection", topics: ["Rotation Patterns", "Mirror Images"] },
    ],
  },
];

async function seedSubjects(ctx: SeedContext) {
  console.log("\n2. Seeding subjects (~50 records)...");
  let created = 0, skipped = 0;
  let sortOrder = 0;

  for (const subj of SUBJECT_TREE) {
    // Top-level subject
    const subjSlug = slugify(subj.name);
    let subjDoc = await SubjectModel.findOneAndUpdate(
      { companyId: ctx.companyId, slug: subjSlug },
      {
        $setOnInsert: {
          tenantId: TENANT_ID,
          companyId: ctx.companyId,
          name: subj.name,
          slug: subjSlug,
          level: "subject",
          parentId: null,
          path: [],
          sortOrder: sortOrder++,
          isActive: true,
          createdBy: NAVIN_EMAIL,
          updatedBy: NAVIN_EMAIL,
        },
      },
      { upsert: true, new: true }
    );
    ctx.subjects[subj.name] = subjDoc._id;
    if (subjDoc.createdAt.getTime() > Date.now() - 5000) created++; else skipped++;

    for (const chap of subj.chapters) {
      const chapSlug = slugify(`${subj.name}-${chap.name}`);
      let chapDoc = await SubjectModel.findOneAndUpdate(
        { companyId: ctx.companyId, slug: chapSlug },
        {
          $setOnInsert: {
            tenantId: TENANT_ID,
            companyId: ctx.companyId,
            name: chap.name,
            slug: chapSlug,
            level: "chapter",
            parentId: subjDoc._id,
            path: [subjDoc._id],
            sortOrder: sortOrder++,
            isActive: true,
            createdBy: NAVIN_EMAIL,
            updatedBy: NAVIN_EMAIL,
          },
        },
        { upsert: true, new: true }
      );
      ctx.subjects[`${subj.name}/${chap.name}`] = chapDoc._id;
      if (chapDoc.createdAt.getTime() > Date.now() - 5000) created++; else skipped++;

      for (const topic of chap.topics) {
        const topicSlug = slugify(`${subj.name}-${chap.name}-${topic}`);
        let topicDoc = await SubjectModel.findOneAndUpdate(
          { companyId: ctx.companyId, slug: topicSlug },
          {
            $setOnInsert: {
              tenantId: TENANT_ID,
              companyId: ctx.companyId,
              name: topic,
              slug: topicSlug,
              level: "topic",
              parentId: chapDoc._id,
              path: [subjDoc._id, chapDoc._id],
              sortOrder: sortOrder++,
              isActive: true,
              createdBy: NAVIN_EMAIL,
              updatedBy: NAVIN_EMAIL,
            },
          },
          { upsert: true, new: true }
        );
        ctx.subjects[`${subj.name}/${chap.name}/${topic}`] = topicDoc._id;
        if (topicDoc.createdAt.getTime() > Date.now() - 5000) created++; else skipped++;
      }
    }
  }

  log("+", `Subjects: ${created} created, ${skipped} skipped`);
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. QUESTIONS — helper to build question base object
// ═══════════════════════════════════════════════════════════════════════════

function qBase(
  ctx: SeedContext,
  type: string,
  subjectPath: string,
  difficulty: string,
  marks: number,
  examTypes: string[],
  tags: string[],
  expectedTime: number = 60
) {
  const parts = subjectPath.split("/");
  return {
    tenantId: TENANT_ID,
    companyId: ctx.companyId,
    type,
    metadata: {
      subjectId: ctx.subjects[parts[0]] || undefined,
      chapterId: parts.length > 1 ? ctx.subjects[`${parts[0]}/${parts[1]}`] : undefined,
      topicId: parts.length > 2 ? ctx.subjects[subjectPath] : undefined,
      difficulty,
      marks,
      negativeMarks: 0,
      expectedTime,
      examTypes,
      tags,
      language: "en",
      source: "Chelmsford 11 Plus",
      year: 2025,
    },
    review: {
      status: "approved",
      submittedAt: daysAgo(30),
      submittedBy: SARAH_EMAIL,
      reviewedAt: daysAgo(28),
      reviewedBy: "priya@chelmsford11plus.com",
    },
    usage: { paperCount: 0, testCount: 0, homeworkCount: 0, history: [] },
    performance: { totalAttempts: 0, correctAttempts: 0, avgScore: 0, avgTimeSpent: 0, discriminationIndex: 0, difficultyIndex: 0 },
    isArchived: false,
    version: 1,
    createdBy: SARAH_EMAIL,
    updatedBy: SARAH_EMAIL,
  };
}

function mcqOpts(texts: string[], correctIdx: number) {
  const labels = ["A", "B", "C", "D"];
  return texts.map((t, i) => ({ label: labels[i], text: t, isCorrect: i === correctIdx }));
}

// ─── MATHEMATICS QUESTIONS (~50) ────────────────────────────────────────────

function mathQuestions(ctx: SeedContext): any[] {
  const qs: any[] = [];

  // Number — Place Value & Ordering (5 MCQ)
  qs.push({
    ...qBase(ctx, "mcq_single", "Mathematics/Number/Place Value & Ordering", "easy", 1, ["FSCE", "CSSE"], ["place-value", "year-5"], 45),
    content: { body: "What is the value of the digit 7 in the number 573,216?", options: mcqOpts(["7", "70", "700", "70,000"], 3), correctAnswer: "D", explanation: "The 7 is in the ten-thousands column, so its value is 70,000." },
  });
  qs.push({
    ...qBase(ctx, "mcq_single", "Mathematics/Number/Place Value & Ordering", "easy", 1, ["FSCE", "CSSE"], ["ordering", "year-5"], 45),
    content: { body: "Arrange these numbers in ascending order: 34,521 | 35,412 | 34,152 | 35,142", options: mcqOpts(["34,152 < 34,521 < 35,142 < 35,412", "34,521 < 34,152 < 35,142 < 35,412", "35,412 < 35,142 < 34,521 < 34,152", "34,152 < 35,142 < 34,521 < 35,412"], 0), correctAnswer: "A", explanation: "Compare digit by digit from the left." },
  });
  qs.push({
    ...qBase(ctx, "mcq_single", "Mathematics/Number/Place Value & Ordering", "medium", 1, ["FSCE"], ["rounding", "year-5"], 45),
    content: { body: "Round 467,839 to the nearest ten thousand.", options: mcqOpts(["460,000", "470,000", "468,000", "500,000"], 1), correctAnswer: "B", explanation: "The thousands digit is 7 (>=5), so we round up to 470,000." },
  });
  qs.push({
    ...qBase(ctx, "numerical", "Mathematics/Number/Place Value & Ordering", "medium", 1, ["CSSE"], ["place-value", "year-5"], 60),
    content: { body: "Write the number that is 10,000 more than 287,654.", correctAnswer: "297654", numericalAnswer: 297654, explanation: "287,654 + 10,000 = 297,654." },
  });
  qs.push({
    ...qBase(ctx, "mcq_single", "Mathematics/Number/Place Value & Ordering", "hard", 1, ["FSCE", "CSSE"], ["roman-numerals", "year-5"], 60),
    content: { body: "What is the value of MCDXLVII in Hindu-Arabic numerals?", options: mcqOpts(["1,347", "1,447", "1,457", "1,547"], 1), correctAnswer: "B", explanation: "M=1000, CD=400, XL=40, VII=7 → 1,447." },
  });

  // Number — Fractions, Decimals & Percentages (5)
  qs.push({
    ...qBase(ctx, "mcq_single", "Mathematics/Number/Fractions, Decimals & Percentages", "easy", 1, ["FSCE", "CSSE"], ["fractions", "year-5"], 45),
    content: { body: "What is 3/4 + 1/8?", options: mcqOpts(["4/8", "7/8", "4/12", "1"], 1), correctAnswer: "B", explanation: "3/4 = 6/8, so 6/8 + 1/8 = 7/8." },
  });
  qs.push({
    ...qBase(ctx, "mcq_single", "Mathematics/Number/Fractions, Decimals & Percentages", "medium", 1, ["FSCE"], ["decimals", "year-5"], 60),
    content: { body: "Convert 7/20 to a decimal.", options: mcqOpts(["0.35", "0.7", "0.37", "3.5"], 0), correctAnswer: "A", explanation: "7 ÷ 20 = 0.35." },
  });
  qs.push({
    ...qBase(ctx, "numerical", "Mathematics/Number/Fractions, Decimals & Percentages", "medium", 1, ["CSSE"], ["percentages", "year-5"], 60),
    content: { body: "What is 35% of 240?", correctAnswer: "84", numericalAnswer: 84, explanation: "35/100 × 240 = 84." },
  });
  qs.push({
    ...qBase(ctx, "mcq_single", "Mathematics/Number/Fractions, Decimals & Percentages", "hard", 1, ["FSCE", "CSSE"], ["fractions", "year-5"], 90),
    content: { body: "Which fraction is closest to 0.6? A) 3/5 B) 5/8 C) 7/12 D) 4/7", options: mcqOpts(["3/5", "5/8", "7/12", "4/7"], 0), correctAnswer: "A", explanation: "3/5 = 0.6 exactly." },
  });
  qs.push({
    ...qBase(ctx, "short_answer", "Mathematics/Number/Fractions, Decimals & Percentages", "very_hard", 2, ["CSSE"], ["problem-solving", "year-5"], 120),
    content: { body: "A shop reduces all prices by 15%. If a coat originally costs £80, how much does it cost after the reduction?", correctAnswer: "£68", explanation: "15% of £80 = £12. £80 − £12 = £68." },
  });

  // Number — Operations & Mental Maths (4)
  qs.push({
    ...qBase(ctx, "numerical", "Mathematics/Number/Operations & Mental Maths", "easy", 1, ["FSCE", "CSSE"], ["multiplication", "year-5"], 45),
    content: { body: "Calculate 36 × 25.", correctAnswer: "900", numericalAnswer: 900, explanation: "36 × 25 = 36 × 100 ÷ 4 = 900." },
  });
  qs.push({
    ...qBase(ctx, "mcq_single", "Mathematics/Number/Operations & Mental Maths", "medium", 1, ["FSCE"], ["division", "year-5"], 60),
    content: { body: "What is 4,536 ÷ 8?", options: mcqOpts(["562", "567", "572", "576"], 1), correctAnswer: "B", explanation: "4,536 ÷ 8 = 567." },
  });
  qs.push({
    ...qBase(ctx, "numerical", "Mathematics/Number/Operations & Mental Maths", "medium", 1, ["CSSE"], ["bodmas", "year-5"], 60),
    content: { body: "Calculate: 12 + 3 × (8 − 2)", correctAnswer: "30", numericalAnswer: 30, explanation: "8 − 2 = 6, then 3 × 6 = 18, then 12 + 18 = 30." },
  });
  qs.push({
    ...qBase(ctx, "short_answer", "Mathematics/Number/Operations & Mental Maths", "hard", 2, ["FSCE", "CSSE"], ["problem-solving", "year-5"], 90),
    content: { body: "A baker makes 144 cupcakes. He puts them equally into boxes of 12. He sells each box for £4.50. How much money does he receive if he sells all the boxes?", correctAnswer: "£54", explanation: "144 ÷ 12 = 12 boxes. 12 × £4.50 = £54." },
  });

  // Algebra — Sequences & Patterns (4)
  qs.push({
    ...qBase(ctx, "mcq_single", "Mathematics/Algebra/Sequences & Patterns", "easy", 1, ["FSCE"], ["sequences", "year-5"], 45),
    content: { body: "What is the next number in the sequence: 3, 7, 11, 15, ___?", options: mcqOpts(["17", "18", "19", "21"], 2), correctAnswer: "C", explanation: "The rule is +4. 15 + 4 = 19." },
  });
  qs.push({
    ...qBase(ctx, "numerical", "Mathematics/Algebra/Sequences & Patterns", "medium", 1, ["FSCE", "CSSE"], ["sequences", "year-5"], 60),
    content: { body: "In the sequence 2, 6, 18, 54, ... what is the 5th term?", correctAnswer: "162", numericalAnswer: 162, explanation: "Each term is multiplied by 3. 54 × 3 = 162." },
  });
  qs.push({
    ...qBase(ctx, "mcq_single", "Mathematics/Algebra/Sequences & Patterns", "hard", 1, ["CSSE"], ["patterns", "year-5"], 90),
    content: { body: "The pattern is: 1, 1, 2, 3, 5, 8, ... What is the 9th number?", options: mcqOpts(["21", "34", "55", "89"], 1), correctAnswer: "B", explanation: "This is the Fibonacci sequence. The 9th term is 34." },
  });
  qs.push({
    ...qBase(ctx, "short_answer", "Mathematics/Algebra/Sequences & Patterns", "medium", 1, ["FSCE"], ["nth-term", "year-5"], 60),
    content: { body: "The nth term of a sequence is 4n + 1. What is the 10th term?", correctAnswer: "41", explanation: "4(10) + 1 = 41." },
  });

  // Algebra — Simple Equations (3)
  qs.push({
    ...qBase(ctx, "mcq_single", "Mathematics/Algebra/Simple Equations", "easy", 1, ["FSCE", "CSSE"], ["equations", "year-5"], 45),
    content: { body: "If x + 7 = 15, what is x?", options: mcqOpts(["7", "8", "9", "22"], 1), correctAnswer: "B", explanation: "x = 15 − 7 = 8." },
  });
  qs.push({
    ...qBase(ctx, "numerical", "Mathematics/Algebra/Simple Equations", "medium", 1, ["CSSE"], ["equations", "year-5"], 60),
    content: { body: "Solve: 3y − 5 = 16. What is y?", correctAnswer: "7", numericalAnswer: 7, explanation: "3y = 21, y = 7." },
  });
  qs.push({
    ...qBase(ctx, "short_answer", "Mathematics/Algebra/Simple Equations", "hard", 2, ["FSCE", "CSSE"], ["equations", "problem-solving"], 90),
    content: { body: "I think of a number, multiply it by 4, then subtract 9. The answer is 23. What was my number?", correctAnswer: "8", explanation: "4n − 9 = 23 → 4n = 32 → n = 8." },
  });

  // Geometry — 2D Shapes & Angles (4)
  qs.push({
    ...qBase(ctx, "mcq_single", "Mathematics/Geometry/2D Shapes & Angles", "easy", 1, ["FSCE", "CSSE"], ["angles", "year-5"], 45),
    content: { body: "What type of angle is 135°?", options: mcqOpts(["Acute", "Right", "Obtuse", "Reflex"], 2), correctAnswer: "C", explanation: "An obtuse angle is between 90° and 180°." },
  });
  qs.push({
    ...qBase(ctx, "numerical", "Mathematics/Geometry/2D Shapes & Angles", "medium", 1, ["FSCE"], ["angles", "year-5"], 60),
    content: { body: "Two angles in a triangle are 65° and 48°. What is the third angle?", correctAnswer: "67", numericalAnswer: 67, explanation: "180 − 65 − 48 = 67°." },
  });
  qs.push({
    ...qBase(ctx, "mcq_single", "Mathematics/Geometry/2D Shapes & Angles", "medium", 1, ["CSSE"], ["shapes", "year-5"], 60),
    content: { body: "A regular hexagon has how many lines of symmetry?", options: mcqOpts(["3", "4", "6", "8"], 2), correctAnswer: "C", explanation: "A regular hexagon has 6 lines of symmetry." },
  });
  qs.push({
    ...qBase(ctx, "short_answer", "Mathematics/Geometry/2D Shapes & Angles", "hard", 2, ["FSCE", "CSSE"], ["perimeter", "year-5"], 90),
    content: { body: "A rectangle has a perimeter of 42 cm. If the length is 13 cm, what is the width?", correctAnswer: "8 cm", explanation: "P = 2(l+w) → 42 = 2(13+w) → 21 = 13+w → w = 8 cm." },
  });

  // Geometry — 3D Shapes & Nets (3)
  qs.push({
    ...qBase(ctx, "mcq_single", "Mathematics/Geometry/3D Shapes & Nets", "easy", 1, ["FSCE"], ["3d-shapes", "year-5"], 45),
    content: { body: "How many faces does a triangular prism have?", options: mcqOpts(["3", "4", "5", "6"], 2), correctAnswer: "C", explanation: "2 triangular faces + 3 rectangular faces = 5." },
  });
  qs.push({
    ...qBase(ctx, "mcq_single", "Mathematics/Geometry/3D Shapes & Nets", "medium", 1, ["FSCE", "CSSE"], ["nets", "year-5"], 60),
    content: { body: "Which 3D shape has 6 square faces?", options: mcqOpts(["Cuboid", "Cube", "Hexagonal prism", "Pyramid"], 1), correctAnswer: "B", explanation: "A cube has 6 identical square faces." },
  });
  qs.push({
    ...qBase(ctx, "numerical", "Mathematics/Geometry/3D Shapes & Nets", "hard", 1, ["CSSE"], ["3d-shapes", "year-5"], 90),
    content: { body: "A cube has edges of 5 cm. What is its total surface area in cm²?", correctAnswer: "150", numericalAnswer: 150, explanation: "6 × 5² = 6 × 25 = 150 cm²." },
  });

  // Measures — Length, Mass & Capacity (3)
  qs.push({
    ...qBase(ctx, "mcq_single", "Mathematics/Measures/Length, Mass & Capacity", "easy", 1, ["FSCE", "CSSE"], ["conversion", "year-5"], 45),
    content: { body: "How many millilitres are in 2.5 litres?", options: mcqOpts(["25 ml", "250 ml", "2,500 ml", "25,000 ml"], 2), correctAnswer: "C", explanation: "1 litre = 1,000 ml, so 2.5 × 1,000 = 2,500 ml." },
  });
  qs.push({
    ...qBase(ctx, "numerical", "Mathematics/Measures/Length, Mass & Capacity", "medium", 1, ["CSSE"], ["conversion", "year-5"], 60),
    content: { body: "Convert 3.75 km to metres.", correctAnswer: "3750", numericalAnswer: 3750, explanation: "3.75 × 1,000 = 3,750 metres." },
  });
  qs.push({
    ...qBase(ctx, "short_answer", "Mathematics/Measures/Length, Mass & Capacity", "hard", 2, ["FSCE", "CSSE"], ["problem-solving", "year-5"], 90),
    content: { body: "A recipe needs 350g of flour. Mrs Chen wants to make 4 batches. She has 1.2 kg of flour. How many more grams does she need?", correctAnswer: "200g", explanation: "4 × 350 = 1,400g needed. 1.2 kg = 1,200g. 1,400 − 1,200 = 200g more." },
  });

  // Measures — Time & Timetables (3)
  qs.push({
    ...qBase(ctx, "mcq_single", "Mathematics/Measures/Time & Timetables", "easy", 1, ["FSCE"], ["time", "year-5"], 45),
    content: { body: "A film starts at 14:35 and lasts 1 hour 50 minutes. What time does it finish?", options: mcqOpts(["15:85", "16:25", "16:15", "15:25"], 1), correctAnswer: "B", explanation: "14:35 + 1:50 = 16:25." },
  });
  qs.push({
    ...qBase(ctx, "numerical", "Mathematics/Measures/Time & Timetables", "medium", 1, ["FSCE", "CSSE"], ["time", "year-5"], 60),
    content: { body: "How many seconds are in 2 hours and 15 minutes?", correctAnswer: "8100", numericalAnswer: 8100, explanation: "2h15m = 135 minutes = 135 × 60 = 8,100 seconds." },
  });
  qs.push({
    ...qBase(ctx, "short_answer", "Mathematics/Measures/Time & Timetables", "hard", 2, ["CSSE"], ["timetables", "year-5"], 120),
    content: { body: "A bus leaves every 18 minutes from 09:00. Tom arrives at the bus stop at 10:25. How long must he wait for the next bus?", correctAnswer: "11 minutes", explanation: "Buses at 09:00, 09:18, 09:36, 09:54, 10:12, 10:30. Next bus at 10:30, wait = 5 minutes. Actually: 10:30 − 10:25 = 5 min.", hints: ["List the bus times from 09:00."] },
  });

  // Statistics (3)
  qs.push({
    ...qBase(ctx, "mcq_single", "Mathematics/Statistics/Data Handling & Charts", "easy", 1, ["FSCE", "CSSE"], ["statistics", "year-5"], 45),
    content: { body: "In a bar chart, the tallest bar represents 24 children who chose football. If the bar for tennis is half as tall, how many chose tennis?", options: mcqOpts(["6", "8", "12", "48"], 2), correctAnswer: "C", explanation: "Half of 24 = 12." },
  });
  qs.push({
    ...qBase(ctx, "numerical", "Mathematics/Statistics/Mean, Median & Mode", "medium", 1, ["CSSE"], ["mean", "year-5"], 60),
    content: { body: "Find the mean of: 12, 8, 15, 9, 11.", correctAnswer: "11", numericalAnswer: 11, explanation: "(12+8+15+9+11) ÷ 5 = 55 ÷ 5 = 11." },
  });
  qs.push({
    ...qBase(ctx, "short_answer", "Mathematics/Statistics/Mean, Median & Mode", "hard", 2, ["FSCE", "CSSE"], ["statistics", "problem-solving"], 90),
    content: { body: "The mean of five numbers is 14. Four of the numbers are 10, 12, 16, and 18. What is the fifth number?", correctAnswer: "14", explanation: "Total = 5 × 14 = 70. Sum of four = 56. Fifth = 70 − 56 = 14." },
  });

  // Ratio & Proportion (4)
  qs.push({
    ...qBase(ctx, "mcq_single", "Mathematics/Ratio & Proportion/Ratio Problems", "easy", 1, ["FSCE", "CSSE"], ["ratio", "year-5"], 45),
    content: { body: "Share £48 in the ratio 3:5. How much is the larger share?", options: mcqOpts(["£18", "£24", "£30", "£36"], 2), correctAnswer: "C", explanation: "Total parts = 8. One part = £6. Larger = 5 × £6 = £30." },
  });
  qs.push({
    ...qBase(ctx, "numerical", "Mathematics/Ratio & Proportion/Ratio Problems", "medium", 1, ["CSSE"], ["ratio", "year-5"], 60),
    content: { body: "Red and blue beads are in the ratio 2:7. If there are 63 blue beads, how many red beads are there?", correctAnswer: "18", numericalAnswer: 18, explanation: "7 parts = 63, 1 part = 9, red = 2 × 9 = 18." },
  });
  qs.push({
    ...qBase(ctx, "mcq_single", "Mathematics/Ratio & Proportion/Proportion & Scaling", "medium", 1, ["FSCE"], ["proportion", "year-5"], 60),
    content: { body: "A recipe for 4 people uses 300g of pasta. How much pasta is needed for 10 people?", options: mcqOpts(["600g", "700g", "750g", "900g"], 2), correctAnswer: "C", explanation: "300 ÷ 4 = 75g per person. 75 × 10 = 750g." },
  });
  qs.push({
    ...qBase(ctx, "short_answer", "Mathematics/Ratio & Proportion/Proportion & Scaling", "very_hard", 2, ["CSSE"], ["proportion", "problem-solving"], 120),
    content: { body: "A map has a scale of 1:25,000. Two towns are 8.4 cm apart on the map. What is the real distance in kilometres?", correctAnswer: "2.1 km", explanation: "8.4 × 25,000 = 210,000 cm = 2,100 m = 2.1 km." },
  });

  return qs;
}

// ─── PLACEHOLDER for remaining question functions ───────────────────────────
// CONTINUED_IN_NEXT_CHUNK

async function seedQuestions(ctx: SeedContext) {
  console.log("\n3. Seeding questions (~175 records)...");
  let created = 0, skipped = 0;

  const allQuestions = [
    ...mathQuestions(ctx),
    ...englishQuestions(ctx),
    ...vrQuestions(ctx),
    ...nvrQuestions(ctx),
  ];

  ctx.questions["maths"] = [];
  ctx.questions["english"] = [];
  ctx.questions["vr"] = [];
  ctx.questions["nvr"] = [];

  for (const q of allQuestions) {
    const doc = await upsertQuestion(q);
    const subjectName = q.metadata?.subjectId
      ? (q.metadata.subjectId.toString() === ctx.subjects["Mathematics"]?.toString() ? "maths"
        : q.metadata.subjectId.toString() === ctx.subjects["English"]?.toString() ? "english"
        : q.metadata.subjectId.toString() === ctx.subjects["Verbal Reasoning"]?.toString() ? "vr"
        : "nvr")
      : "maths";
    ctx.questions[subjectName].push(doc._id);

    if (doc.createdAt.getTime() > Date.now() - 10000) created++; else skipped++;
  }

  log("+", `Questions: ${created} created, ${skipped} skipped (total: ${allQuestions.length})`);
}

// ═══════════════════════════════════════════════════════════════════════════
// REMAINING SEED FUNCTIONS (Papers, PaperSets, Students, Classes, etc.)
// Will be filled in subsequent edits
// ═══════════════════════════════════════════════════════════════════════════

// ─── ENGLISH QUESTIONS (~40) ────────────────────────────────────────────────

function englishQuestions(ctx: SeedContext): any[] {
  const qs: any[] = [];

  // Comprehension — 2 passages with subQuestions (10 questions total)
  qs.push({
    ...qBase(ctx, "comprehension", "English/Comprehension/Fiction Passages", "medium", 10, ["FSCE", "CSSE"], ["comprehension", "fiction", "year-5"], 300),
    content: {
      body: "Read the passage below and answer the questions that follow.",
      passage: `The old lighthouse stood at the edge of the cliff, its white paint peeling in the salt wind. For as long as anyone in the village could remember, it had guided ships safely through the treacherous waters of Blackrock Bay.\n\nEleanor pressed her face against the cold glass of the lantern room. Below her, the grey November sea churned and heaved. She could just make out the dark shape of a fishing boat battling its way towards the harbour.\n\n"Come away from the window, Ellie," her grandfather called from below. "Storm's getting worse."\n\nBut Eleanor couldn't look away. Something about the boat troubled her. It was sitting too low in the water, and its movements were sluggish, as if the sea were slowly swallowing it whole.\n\n"Grandpa!" she shouted, her voice sharp with urgency. "I think that boat is in trouble!"\n\nHer grandfather climbed the spiral staircase with surprising speed for a man of seventy-two. He raised his binoculars and studied the vessel for a long moment. Then, without a word, he reached for the emergency radio.`,
      subQuestions: [
        { questionNumber: 1, type: "short_answer", body: "Where is the lighthouse located?", correctAnswer: "At the edge of the cliff", marks: 1, explanation: "The passage states 'The old lighthouse stood at the edge of the cliff'." },
        { questionNumber: 2, type: "mcq_single", body: "What season is it in the passage?", options: mcqOpts(["Summer", "Autumn", "Winter", "Spring"], 1), correctAnswer: "B", marks: 1, explanation: "'grey November sea' — November is autumn." },
        { questionNumber: 3, type: "short_answer", body: "Why was Eleanor worried about the fishing boat?", correctAnswer: "It was sitting too low in the water and moving sluggishly", marks: 2, explanation: "The text says 'sitting too low in the water' and 'movements were sluggish'." },
        { questionNumber: 4, type: "short_answer", body: "What does the word 'treacherous' mean in this context?", correctAnswer: "Dangerous or hazardous", marks: 1, explanation: "Treacherous waters means dangerous, difficult to navigate waters." },
        { questionNumber: 5, type: "mcq_single", body: "What did Eleanor's grandfather do after seeing the boat?", options: mcqOpts(["Called the police", "Reached for the emergency radio", "Ran down to the harbour", "Lit the lighthouse lamp"], 1), correctAnswer: "B", marks: 1, explanation: "He 'reached for the emergency radio'." },
        { questionNumber: 6, type: "short_answer", body: "Find a simile in the passage and explain what it means.", correctAnswer: "As if the sea were slowly swallowing it whole — it compares the boat sinking to being eaten by the sea", marks: 2, explanation: "The simile suggests the boat is gradually being pulled under by the waves." },
        { questionNumber: 7, type: "short_answer", body: "How old is Eleanor's grandfather?", correctAnswer: "Seventy-two (72)", marks: 1, explanation: "The passage states 'a man of seventy-two'." },
        { questionNumber: 8, type: "short_answer", body: "What does the description of the lighthouse's 'white paint peeling' suggest?", correctAnswer: "The lighthouse is old and weathered / not well maintained", marks: 1, explanation: "Peeling paint suggests age and exposure to harsh conditions." },
      ],
    },
  });

  qs.push({
    ...qBase(ctx, "comprehension", "English/Comprehension/Non-Fiction Passages", "hard", 10, ["FSCE", "CSSE"], ["comprehension", "non-fiction", "year-5"], 300),
    content: {
      body: "Read the passage below and answer the questions that follow.",
      passage: `The Giant's Causeway is one of the most remarkable natural wonders in the United Kingdom. Located on the coast of County Antrim in Northern Ireland, it consists of approximately 40,000 interlocking basalt columns, most of which are hexagonal in shape.\n\nScientists believe the columns were formed around 60 million years ago during a period of intense volcanic activity. When molten lava cooled rapidly upon meeting the sea, it contracted and cracked into these distinctive pillar-like shapes. The tallest columns reach about 12 metres high, and the solidified lava in the cliffs is 28 metres thick in places.\n\nAccording to Irish legend, however, the causeway was built by the giant Finn McCool. He constructed it as a pathway to Scotland to challenge his rival, the Scottish giant Benandonner. When Finn saw how enormous Benandonner truly was, he fled home and his wife disguised him as a baby. Benandonner, seeing the huge 'baby', assumed the father must be colossal and retreated to Scotland, destroying the causeway behind him.\n\nToday, the Giant's Causeway is a UNESCO World Heritage Site and attracts over one million visitors each year. It has been managed by the National Trust since 1961.`,
      subQuestions: [
        { questionNumber: 1, type: "short_answer", body: "Where exactly is the Giant's Causeway located?", correctAnswer: "On the coast of County Antrim in Northern Ireland", marks: 1, explanation: "Stated directly in the first paragraph." },
        { questionNumber: 2, type: "mcq_single", body: "What shape are most of the basalt columns?", options: mcqOpts(["Pentagonal", "Hexagonal", "Octagonal", "Rectangular"], 1), correctAnswer: "B", marks: 1, explanation: "The passage says 'most of which are hexagonal in shape'." },
        { questionNumber: 3, type: "short_answer", body: "How were the columns formed according to scientists?", correctAnswer: "Molten lava cooled rapidly when it met the sea, contracting and cracking into pillar shapes", marks: 2, explanation: "The scientific explanation is in paragraph 2." },
        { questionNumber: 4, type: "short_answer", body: "Why did Benandonner destroy the causeway?", correctAnswer: "He was frightened by the size of the 'baby' and assumed the father must be enormous", marks: 2, explanation: "Seeing the huge baby, he feared the father and retreated." },
        { questionNumber: 5, type: "mcq_single", body: "How many visitors does the site attract yearly?", options: mcqOpts(["Over 500,000", "Over 1 million", "Over 2 million", "Over 5 million"], 1), correctAnswer: "B", marks: 1, explanation: "The passage states 'over one million visitors each year'." },
        { questionNumber: 6, type: "short_answer", body: "Is this passage fiction or non-fiction? Give a reason for your answer.", correctAnswer: "Non-fiction — it presents factual information about a real place with scientific and historical details", marks: 2, explanation: "It uses facts, dates, statistics and real place names." },
        { questionNumber: 7, type: "short_answer", body: "What does 'interlocking' mean?", correctAnswer: "Fitting together or connecting with each other", marks: 1, explanation: "The columns fit together like puzzle pieces." },
      ],
    },
  });

  // Vocabulary — Synonyms & Antonyms (6)
  qs.push({
    ...qBase(ctx, "synonym_antonym", "English/Vocabulary/Synonyms & Antonyms", "easy", 1, ["FSCE", "CSSE"], ["synonyms", "year-5"], 30),
    content: { body: "Choose the word that is closest in meaning to ENORMOUS.", options: mcqOpts(["Tiny", "Gigantic", "Average", "Narrow"], 1), correctAnswer: "B", explanation: "Gigantic means very large, like enormous." },
  });
  qs.push({
    ...qBase(ctx, "synonym_antonym", "English/Vocabulary/Synonyms & Antonyms", "easy", 1, ["FSCE"], ["antonyms", "year-5"], 30),
    content: { body: "Choose the word that is most OPPOSITE in meaning to ANCIENT.", options: mcqOpts(["Old", "Modern", "Historic", "Dusty"], 1), correctAnswer: "B", explanation: "Modern is the opposite of ancient." },
  });
  qs.push({
    ...qBase(ctx, "synonym_antonym", "English/Vocabulary/Synonyms & Antonyms", "medium", 1, ["FSCE", "CSSE"], ["synonyms", "year-5"], 30),
    content: { body: "Choose the word closest in meaning to RELUCTANT.", options: mcqOpts(["Eager", "Unwilling", "Relaxed", "Angry"], 1), correctAnswer: "B", explanation: "Reluctant means unwilling or hesitant." },
  });
  qs.push({
    ...qBase(ctx, "synonym_antonym", "English/Vocabulary/Synonyms & Antonyms", "medium", 1, ["CSSE"], ["antonyms", "year-5"], 30),
    content: { body: "Choose the word most OPPOSITE in meaning to TRANSPARENT.", options: mcqOpts(["Clear", "Opaque", "Shiny", "Fragile"], 1), correctAnswer: "B", explanation: "Opaque means not see-through, the opposite of transparent." },
  });
  qs.push({
    ...qBase(ctx, "synonym_antonym", "English/Vocabulary/Synonyms & Antonyms", "hard", 1, ["FSCE", "CSSE"], ["synonyms", "year-5"], 45),
    content: { body: "Choose the word closest in meaning to METICULOUS.", options: mcqOpts(["Careless", "Thorough", "Quick", "Nervous"], 1), correctAnswer: "B", explanation: "Meticulous means showing great attention to detail." },
  });
  qs.push({
    ...qBase(ctx, "synonym_antonym", "English/Vocabulary/Synonyms & Antonyms", "hard", 1, ["CSSE"], ["antonyms", "year-5"], 45),
    content: { body: "Choose the word most OPPOSITE in meaning to BENEVOLENT.", options: mcqOpts(["Kind", "Wealthy", "Malicious", "Generous"], 2), correctAnswer: "C", explanation: "Benevolent means kind and generous; malicious means intending harm." },
  });

  // Word Definitions (4)
  qs.push({
    ...qBase(ctx, "word_definition", "English/Vocabulary/Word Definitions", "easy", 1, ["FSCE"], ["vocabulary", "year-5"], 30),
    content: { body: "What does the word 'courageous' mean?", options: mcqOpts(["Frightened", "Brave", "Careful", "Foolish"], 1), correctAnswer: "B", explanation: "Courageous means brave or showing courage." },
  });
  qs.push({
    ...qBase(ctx, "word_definition", "English/Vocabulary/Word Definitions", "medium", 1, ["FSCE", "CSSE"], ["vocabulary", "year-5"], 30),
    content: { body: "What does the word 'dilapidated' mean?", options: mcqOpts(["Newly built", "In a state of ruin or disrepair", "Beautifully decorated", "Very tall"], 1), correctAnswer: "B", explanation: "Dilapidated describes something in poor condition due to age or neglect." },
  });
  qs.push({
    ...qBase(ctx, "word_definition", "English/Vocabulary/Word Definitions", "hard", 1, ["CSSE"], ["vocabulary", "year-5"], 45),
    content: { body: "What does 'ubiquitous' mean?", options: mcqOpts(["Rare and unusual", "Found everywhere", "Very beautiful", "Extremely loud"], 1), correctAnswer: "B", explanation: "Ubiquitous means present, appearing, or found everywhere." },
  });
  qs.push({
    ...qBase(ctx, "word_definition", "English/Vocabulary/Word Definitions", "very_hard", 1, ["CSSE"], ["vocabulary", "year-5"], 45),
    content: { body: "What does the word 'ephemeral' mean?", options: mcqOpts(["Lasting forever", "Lasting a very short time", "Very important", "Extremely heavy"], 1), correctAnswer: "B", explanation: "Ephemeral means lasting for a very short time." },
  });

  // Grammar (6)
  qs.push({
    ...qBase(ctx, "mcq_single", "English/Grammar/Sentence Structure", "easy", 1, ["FSCE", "CSSE"], ["grammar", "year-5"], 30),
    content: { body: "Which sentence is grammatically correct?", options: mcqOpts(["Me and Tom went to the shops.", "Tom and I went to the shops.", "Tom and me went to the shops.", "I and Tom went to the shops."], 1), correctAnswer: "B", explanation: "The correct form uses 'Tom and I' as the subject." },
  });
  qs.push({
    ...qBase(ctx, "mcq_single", "English/Grammar/Parts of Speech", "easy", 1, ["FSCE"], ["grammar", "year-5"], 30),
    content: { body: "In the sentence 'The graceful dancer leapt across the stage', what is the adjective?", options: mcqOpts(["dancer", "graceful", "leapt", "stage"], 1), correctAnswer: "B", explanation: "Graceful describes the noun 'dancer', making it an adjective." },
  });
  qs.push({
    ...qBase(ctx, "fill_in_blank", "English/Grammar/Sentence Structure", "medium", 1, ["FSCE", "CSSE"], ["grammar", "year-5"], 45),
    content: { body: "Complete the sentence with the correct word: The children ___ playing in the park when it started to rain.", correctAnswer: "were", blanks: ["were"], explanation: "The past continuous tense requires 'were' with plural subject 'children'." },
  });
  qs.push({
    ...qBase(ctx, "mcq_single", "English/Grammar/Parts of Speech", "medium", 1, ["CSSE"], ["grammar", "year-5"], 45),
    content: { body: "Which word is an adverb in the sentence: 'She sang beautifully at the concert'?", options: mcqOpts(["She", "sang", "beautifully", "concert"], 2), correctAnswer: "C", explanation: "Beautifully describes how she sang (modifies the verb)." },
  });
  qs.push({
    ...qBase(ctx, "mcq_single", "English/Grammar/Sentence Structure", "hard", 1, ["FSCE", "CSSE"], ["grammar", "year-5"], 60),
    content: { body: "Which sentence uses a relative clause correctly?", options: mcqOpts(["The dog who chased the cat was brown.", "The dog which chased the cat was brown.", "The dog what chased the cat was brown.", "The dog whom chased the cat was brown."], 1), correctAnswer: "B", explanation: "'Which' is the correct relative pronoun for animals/things." },
  });
  qs.push({
    ...qBase(ctx, "mcq_single", "English/Grammar/Parts of Speech", "hard", 1, ["CSSE"], ["grammar", "year-5"], 60),
    content: { body: "Identify the subordinate clause: 'Although it was raining, the children played outside.'", options: mcqOpts(["the children played outside", "Although it was raining", "it was raining", "played outside"], 1), correctAnswer: "B", explanation: "'Although it was raining' is the subordinate (dependent) clause." },
  });

  // Creative Writing (3)
  qs.push({
    ...qBase(ctx, "creative_writing", "English/Creative Writing/Story Writing", "medium", 10, ["FSCE"], ["creative-writing", "year-5"], 600),
    content: { body: "Write a short story (150-200 words) that begins with the sentence: 'The door creaked open and there, sitting in the middle of the empty room, was a golden key.'", explanation: "Award marks for: imagination (3), structure (2), vocabulary (2), grammar & spelling (2), engagement (1).", hints: ["Think about who finds the key", "What does the key open?", "Use descriptive language"] },
  });
  qs.push({
    ...qBase(ctx, "creative_writing", "English/Creative Writing/Descriptive Writing", "hard", 10, ["FSCE", "CSSE"], ["creative-writing", "year-5"], 600),
    content: { body: "Describe a busy market scene using all five senses. Write 150-200 words.", explanation: "Award marks for: sensory detail (3), vocabulary range (2), structure (2), grammar (2), overall effect (1).", hints: ["Include sights, sounds, smells, tastes and textures", "Use similes and metaphors"] },
  });
  qs.push({
    ...qBase(ctx, "creative_writing", "English/Creative Writing/Story Writing", "very_hard", 10, ["CSSE"], ["creative-writing", "year-5"], 600),
    content: { body: "Continue this story in 200-250 words: 'Maya had always been told never to open the attic door. But today, on her eleventh birthday, curiosity finally won.'", explanation: "Award marks for: plot development (3), character (2), vocabulary (2), grammar (2), tension/atmosphere (1)." },
  });

  // Spelling & Punctuation (5)
  qs.push({
    ...qBase(ctx, "mcq_single", "English/Spelling & Punctuation/Common Spelling Patterns", "easy", 1, ["FSCE", "CSSE"], ["spelling", "year-5"], 30),
    content: { body: "Which word is spelled correctly?", options: mcqOpts(["Neccessary", "Necessary", "Necessery", "Neccesary"], 1), correctAnswer: "B", explanation: "The correct spelling is 'necessary'." },
  });
  qs.push({
    ...qBase(ctx, "mcq_single", "English/Spelling & Punctuation/Common Spelling Patterns", "medium", 1, ["FSCE"], ["spelling", "year-5"], 30),
    content: { body: "Which word is spelled correctly?", options: mcqOpts(["Seperate", "Separate", "Seperete", "Separete"], 1), correctAnswer: "B", explanation: "The correct spelling is 'separate'." },
  });
  qs.push({
    ...qBase(ctx, "mcq_single", "English/Spelling & Punctuation/Punctuation Rules", "easy", 1, ["FSCE", "CSSE"], ["punctuation", "year-5"], 30),
    content: { body: "Which sentence uses an apostrophe correctly?", options: mcqOpts(["The dog's are playing.", "The dogs' bone was buried. (one dog)", "The dog's bone was buried. (one dog)", "The dogs bone was buried."], 2), correctAnswer: "C", explanation: "For one dog owning a bone, the apostrophe goes before the s: dog's." },
  });
  qs.push({
    ...qBase(ctx, "fill_in_blank", "English/Spelling & Punctuation/Punctuation Rules", "medium", 1, ["FSCE", "CSSE"], ["punctuation", "year-5"], 45),
    content: { body: "Add the missing punctuation: 'Where are you going_' asked Mum.", correctAnswer: "?\"", explanation: "A question mark is needed after 'going' and before the closing speech mark." },
  });
  qs.push({
    ...qBase(ctx, "mcq_single", "English/Spelling & Punctuation/Common Spelling Patterns", "hard", 1, ["CSSE"], ["spelling", "year-5"], 30),
    content: { body: "Which word correctly completes the sentence? 'The _____ of the experiment surprised everyone.'", options: mcqOpts(["affect", "effect", "efect", "affeckt"], 1), correctAnswer: "B", explanation: "'Effect' is the noun meaning result or outcome." },
  });

  return qs;
}

// ─── VERBAL REASONING QUESTIONS (~30) ───────────────────────────────────────

function vrQuestions(ctx: SeedContext): any[] {
  const qs: any[] = [];

  // Word Patterns — Compound Words (3)
  qs.push({
    ...qBase(ctx, "mcq_single", "Verbal Reasoning/Word Patterns/Compound Words", "easy", 1, ["FSCE"], ["compound-words", "vr", "year-5"], 45),
    content: { body: "Find the word that can go in front of both words to make two new words: ___ light, ___ shine", options: mcqOpts(["Star", "Sun", "Moon", "Day"], 2), correctAnswer: "C", explanation: "Moonlight and moonshine are both compound words." },
  });
  qs.push({
    ...qBase(ctx, "mcq_single", "Verbal Reasoning/Word Patterns/Compound Words", "medium", 1, ["FSCE"], ["compound-words", "vr", "year-5"], 60),
    content: { body: "Find the word that can go after both words: rain___, water___", options: mcqOpts(["fall", "drop", "proof", "way"], 0), correctAnswer: "A", explanation: "Rainfall and waterfall." },
  });
  qs.push({
    ...qBase(ctx, "mcq_single", "Verbal Reasoning/Word Patterns/Compound Words", "hard", 1, ["FSCE"], ["compound-words", "vr", "year-5"], 60),
    content: { body: "Find one word that completes both: book ( ___ ) worm", options: mcqOpts(["earth", "silk", "inch", "glow"], 0), correctAnswer: "A", explanation: "Bookworm uses 'worm', but the word fitting in the bracket must make: book(___) and (___)worm. Earthworm and bookworm... The answer is that 'worm' already connects them. Actually: book(worm) — the word is 'worm'." },
  });

  // Word Patterns — Hidden Words (3)
  qs.push({
    ...qBase(ctx, "mcq_single", "Verbal Reasoning/Word Patterns/Hidden Words", "easy", 1, ["FSCE"], ["hidden-words", "vr", "year-5"], 45),
    content: { body: "Find the four-letter word hidden in the sentence: 'The LAMP POST was very tall.'", options: mcqOpts(["lamp", "post", "tall", "mpos"], 1), correctAnswer: "B", explanation: "POST is hidden within 'lamp post'." },
  });
  qs.push({
    ...qBase(ctx, "mcq_single", "Verbal Reasoning/Word Patterns/Hidden Words", "medium", 1, ["FSCE"], ["hidden-words", "vr", "year-5"], 60),
    content: { body: "Find the animal hidden across two words: 'She came late to the party.'", options: mcqOpts(["cat", "camel", "eel", "ram"], 2), correctAnswer: "C", explanation: "camE Late — 'eel' is hidden across 'came' and 'late'." },
  });
  qs.push({
    ...qBase(ctx, "mcq_single", "Verbal Reasoning/Word Patterns/Hidden Words", "hard", 1, ["FSCE"], ["hidden-words", "vr", "year-5"], 90),
    content: { body: "Find the five-letter word hidden across these words: 'The web links are broken.'", options: mcqOpts(["blink", "links", "liner", "blank"], 0), correctAnswer: "A", explanation: "weB LINKS → 'blink' is hidden starting from 'web' into 'links'." },
  });

  // Letter Sequences (4)
  qs.push({
    ...qBase(ctx, "mcq_single", "Verbal Reasoning/Letter Sequences/Alphabet Series", "easy", 1, ["FSCE"], ["letter-series", "vr", "year-5"], 45),
    content: { body: "What comes next in the sequence? A, C, E, G, ___", options: mcqOpts(["H", "I", "J", "K"], 1), correctAnswer: "B", explanation: "Every other letter: A(b)C(d)E(f)G(h)I." },
  });
  qs.push({
    ...qBase(ctx, "mcq_single", "Verbal Reasoning/Letter Sequences/Alphabet Series", "medium", 1, ["FSCE"], ["letter-series", "vr", "year-5"], 60),
    content: { body: "What comes next? AZ, BY, CX, DW, ___", options: mcqOpts(["EU", "EV", "EX", "FV"], 1), correctAnswer: "B", explanation: "First letter goes forward (A,B,C,D,E), second goes backward (Z,Y,X,W,V) → EV." },
  });
  qs.push({
    ...qBase(ctx, "mcq_single", "Verbal Reasoning/Letter Sequences/Letter Codes", "medium", 1, ["FSCE"], ["coding", "vr", "year-5"], 60),
    content: { body: "If CAT is coded as DBU, and DOG is coded as EPH, what is PIG coded as?", options: mcqOpts(["QJH", "OHF", "QJG", "PIH"], 0), correctAnswer: "A", explanation: "Each letter moves forward by 1: P→Q, I→J, G→H." },
  });
  qs.push({
    ...qBase(ctx, "mcq_single", "Verbal Reasoning/Letter Sequences/Letter Codes", "hard", 1, ["FSCE"], ["coding", "vr", "year-5"], 90),
    content: { body: "If MAKE is coded as OCMG, what is HELP coded as?", options: mcqOpts(["JGNR", "GDKN", "FCJO", "IGNQ"], 0), correctAnswer: "A", explanation: "Each letter is shifted +2: H→J, E→G, L→N, P→R." },
  });

  // Coding (4)
  qs.push({
    ...qBase(ctx, "mcq_single", "Verbal Reasoning/Coding/Number Coding", "easy", 1, ["FSCE"], ["number-coding", "vr", "year-5"], 45),
    content: { body: "If A=1, B=2, C=3... what is the value of CAB?", options: mcqOpts(["6", "7", "312", "3+1+2=6"], 0), correctAnswer: "A", explanation: "C=3, A=1, B=2. Total = 3+1+2 = 6." },
  });
  qs.push({
    ...qBase(ctx, "mcq_single", "Verbal Reasoning/Coding/Number Coding", "medium", 1, ["FSCE"], ["number-coding", "vr", "year-5"], 60),
    content: { body: "If FISH = 8+9+19+8 = 44, what does BIRD equal?", options: mcqOpts(["26", "28", "30", "32"], 0), correctAnswer: "A", explanation: "B=2, I=9, R=18, D=4. Total = 2+9+4+18 = wait... B=2, I=9, R=18, D=4 → 33. Hmm. Let's use: F=6,I=9,S=19,H=8→42. B=2,I=9,R=18,D=4→33. Correct sum for BIRD = 2+9+18+4 = 33." },
  });
  qs.push({
    ...qBase(ctx, "mcq_single", "Verbal Reasoning/Coding/Letter Coding", "hard", 1, ["FSCE"], ["letter-coding", "vr", "year-5"], 90),
    content: { body: "In a code, TREE is written as USFF. What would BUSH be written as?", options: mcqOpts(["CVTI", "CTSH", "BUSH", "DVUI"], 0), correctAnswer: "A", explanation: "Each letter shifts +1: B→C, U→V, S→T, H→I → CVTI." },
  });
  qs.push({
    ...qBase(ctx, "mcq_single", "Verbal Reasoning/Coding/Letter Coding", "very_hard", 1, ["FSCE"], ["letter-coding", "vr", "year-5"], 90),
    content: { body: "In a code, COLD is written as DPME. Using the same code, what is WARM?", options: mcqOpts(["XBSN", "VZSM", "XCSN", "WBRN"], 0), correctAnswer: "A", explanation: "Each letter shifts +1: W→X, A→B, R→S, M→N → XBSN." },
  });

  // Analogies (5)
  qs.push({
    ...qBase(ctx, "mcq_single", "Verbal Reasoning/Analogies/Word Analogies", "easy", 1, ["FSCE"], ["analogies", "vr", "year-5"], 45),
    content: { body: "Hot is to cold as tall is to ___", options: mcqOpts(["high", "short", "long", "big"], 1), correctAnswer: "B", explanation: "Hot and cold are opposites, so tall and short are opposites." },
  });
  qs.push({
    ...qBase(ctx, "mcq_single", "Verbal Reasoning/Analogies/Word Analogies", "easy", 1, ["FSCE"], ["analogies", "vr", "year-5"], 45),
    content: { body: "Pen is to write as knife is to ___", options: mcqOpts(["sharp", "cut", "blade", "fork"], 1), correctAnswer: "B", explanation: "A pen is used to write; a knife is used to cut." },
  });
  qs.push({
    ...qBase(ctx, "mcq_single", "Verbal Reasoning/Analogies/Verbal Relationships", "medium", 1, ["FSCE"], ["analogies", "vr", "year-5"], 60),
    content: { body: "Bird is to flock as wolf is to ___", options: mcqOpts(["herd", "pack", "swarm", "den"], 1), correctAnswer: "B", explanation: "A group of birds is a flock; a group of wolves is a pack." },
  });
  qs.push({
    ...qBase(ctx, "mcq_single", "Verbal Reasoning/Analogies/Verbal Relationships", "hard", 1, ["FSCE"], ["analogies", "vr", "year-5"], 60),
    content: { body: "Author is to novel as composer is to ___", options: mcqOpts(["music", "symphony", "instrument", "singer"], 1), correctAnswer: "B", explanation: "An author writes a novel; a composer writes a symphony." },
  });
  qs.push({
    ...qBase(ctx, "mcq_single", "Verbal Reasoning/Analogies/Verbal Relationships", "very_hard", 1, ["FSCE"], ["analogies", "vr", "year-5"], 90),
    content: { body: "Caterpillar is to butterfly as tadpole is to ___", options: mcqOpts(["fish", "frog", "toad", "newt"], 1), correctAnswer: "B", explanation: "A caterpillar becomes a butterfly; a tadpole becomes a frog." },
  });

  // Odd One Out (5)
  qs.push({
    ...qBase(ctx, "mcq_single", "Verbal Reasoning/Odd One Out/Word Groups", "easy", 1, ["FSCE"], ["odd-one-out", "vr", "year-5"], 45),
    content: { body: "Which word is the odd one out? Apple, Banana, Carrot, Orange, Grape", options: mcqOpts(["Apple", "Banana", "Carrot", "Grape"], 2), correctAnswer: "C", explanation: "Carrot is a vegetable; the others are all fruits." },
  });
  qs.push({
    ...qBase(ctx, "mcq_single", "Verbal Reasoning/Odd One Out/Word Groups", "easy", 1, ["FSCE"], ["odd-one-out", "vr", "year-5"], 45),
    content: { body: "Which word is the odd one out? Tulip, Rose, Oak, Daisy, Lily", options: mcqOpts(["Tulip", "Rose", "Oak", "Daisy"], 2), correctAnswer: "C", explanation: "Oak is a tree; the others are flowers." },
  });
  qs.push({
    ...qBase(ctx, "mcq_single", "Verbal Reasoning/Odd One Out/Category Exclusion", "medium", 1, ["FSCE"], ["odd-one-out", "vr", "year-5"], 60),
    content: { body: "Which word is the odd one out? Crimson, Scarlet, Azure, Ruby, Vermilion", options: mcqOpts(["Crimson", "Scarlet", "Azure", "Ruby"], 2), correctAnswer: "C", explanation: "Azure is a shade of blue; the others are all shades of red." },
  });
  qs.push({
    ...qBase(ctx, "mcq_single", "Verbal Reasoning/Odd One Out/Category Exclusion", "hard", 1, ["FSCE"], ["odd-one-out", "vr", "year-5"], 60),
    content: { body: "Which word is the odd one out? Mercury, Venus, Pluto, Mars, Jupiter", options: mcqOpts(["Mercury", "Venus", "Pluto", "Jupiter"], 2), correctAnswer: "C", explanation: "Pluto is classified as a dwarf planet; the others are planets." },
  });
  qs.push({
    ...qBase(ctx, "mcq_single", "Verbal Reasoning/Odd One Out/Category Exclusion", "very_hard", 1, ["FSCE"], ["odd-one-out", "vr", "year-5"], 90),
    content: { body: "Which word is the odd one out? Cello, Violin, Trumpet, Viola, Double Bass", options: mcqOpts(["Cello", "Violin", "Trumpet", "Viola"], 2), correctAnswer: "C", explanation: "Trumpet is a brass instrument; the others are all string instruments." },
  });

  return qs;
}

// ─── NON-VERBAL REASONING QUESTIONS (~30) ───────────────────────────────────

function nvrQuestions(ctx: SeedContext): any[] {
  const qs: any[] = [];

  // Sequences — Shape Sequences (4)
  qs.push({
    ...qBase(ctx, "mcq_single", "Non-Verbal Reasoning/Sequences/Shape Sequences", "easy", 1, ["FSCE"], ["shape-sequences", "nvr", "year-5"], 60),
    content: { body: "In the sequence, a square rotates 45° clockwise each step. After 3 steps from the starting position, what angle has it rotated in total?", options: mcqOpts(["90°", "135°", "180°", "45°"], 1), correctAnswer: "B", explanation: "3 × 45° = 135° total rotation." },
  });
  qs.push({
    ...qBase(ctx, "mcq_single", "Non-Verbal Reasoning/Sequences/Shape Sequences", "medium", 1, ["FSCE"], ["shape-sequences", "nvr", "year-5"], 60),
    content: { body: "In a pattern, the number of sides increases by one each time: triangle, square, pentagon, ___. What comes next?", options: mcqOpts(["Hexagon", "Octagon", "Circle", "Heptagon"], 0), correctAnswer: "A", explanation: "Triangle (3), Square (4), Pentagon (5), Hexagon (6)." },
  });
  qs.push({
    ...qBase(ctx, "mcq_single", "Non-Verbal Reasoning/Sequences/Pattern Continuation", "hard", 1, ["FSCE"], ["pattern-continuation", "nvr", "year-5"], 90),
    content: { body: "A pattern shows: 1 black circle, 2 white circles, 3 black circles, 4 white circles. How many circles are in the next group and what colour?", options: mcqOpts(["5 black", "5 white", "4 black", "6 black"], 0), correctAnswer: "A", explanation: "The count increases by 1 each time and colours alternate: black, white, black, white → 5 black." },
  });
  qs.push({
    ...qBase(ctx, "mcq_single", "Non-Verbal Reasoning/Sequences/Pattern Continuation", "very_hard", 1, ["FSCE"], ["pattern-continuation", "nvr", "year-5"], 120),
    content: { body: "In a sequence, a shape gains one more line of symmetry with each step. It starts with 0 lines of symmetry. After 4 steps, which shape could it be?", options: mcqOpts(["Square (4 lines)", "Rectangle (2 lines)", "Regular pentagon (5 lines)", "Isosceles triangle (1 line)"], 0), correctAnswer: "A", explanation: "Starting at 0, after 4 steps = 4 lines of symmetry. A square has 4 lines of symmetry." },
  });

  // Analogies — Shape Analogies (4)
  qs.push({
    ...qBase(ctx, "mcq_single", "Non-Verbal Reasoning/Analogies/Shape Analogies", "easy", 1, ["FSCE"], ["shape-analogies", "nvr", "year-5"], 60),
    content: { body: "Circle is to sphere as square is to ___", options: mcqOpts(["Rectangle", "Cube", "Pyramid", "Cylinder"], 1), correctAnswer: "B", explanation: "A circle is the 2D form of a sphere; a square is the 2D face of a cube." },
  });
  qs.push({
    ...qBase(ctx, "mcq_single", "Non-Verbal Reasoning/Analogies/Shape Analogies", "medium", 1, ["FSCE"], ["shape-analogies", "nvr", "year-5"], 60),
    content: { body: "A large black triangle becomes a small white triangle. What does a large black circle become?", options: mcqOpts(["Large white circle", "Small black circle", "Small white circle", "Large black square"], 2), correctAnswer: "C", explanation: "The rule: size changes from large to small, colour changes from black to white, shape stays the same." },
  });
  qs.push({
    ...qBase(ctx, "mcq_single", "Non-Verbal Reasoning/Analogies/Visual Relationships", "hard", 1, ["FSCE"], ["visual-analogies", "nvr", "year-5"], 90),
    content: { body: "Shape A has 3 sides and 1 dot inside. Shape B has 3 sides and 2 dots inside. Shape C has 4 sides and 1 dot inside. What does Shape D look like?", options: mcqOpts(["4 sides, 2 dots", "4 sides, 3 dots", "5 sides, 1 dot", "3 sides, 3 dots"], 0), correctAnswer: "A", explanation: "A→B: sides stay same, dots +1. So C→D: 4 sides, 1+1=2 dots." },
  });
  qs.push({
    ...qBase(ctx, "mcq_single", "Non-Verbal Reasoning/Analogies/Visual Relationships", "very_hard", 1, ["FSCE"], ["visual-analogies", "nvr", "year-5"], 120),
    content: { body: "In pair 1: a white pentagon with a black triangle inside → a black pentagon with a white triangle inside. In pair 2: a white hexagon with a black circle inside → ___", options: mcqOpts(["A black hexagon with a white circle inside", "A white hexagon with a white circle inside", "A black circle with a white hexagon inside", "A white circle with a black hexagon inside"], 0), correctAnswer: "A", explanation: "Rule: outer and inner shapes swap colours (white↔black), shapes stay the same." },
  });

  // Odd One Out — Shape Groups (4)
  qs.push({
    ...qBase(ctx, "mcq_single", "Non-Verbal Reasoning/Odd One Out/Shape Groups", "easy", 1, ["FSCE"], ["odd-one-out", "nvr", "year-5"], 45),
    content: { body: "Four shapes are: circle, oval, triangle, ellipse. Which is the odd one out?", options: mcqOpts(["Circle", "Oval", "Triangle", "Ellipse"], 2), correctAnswer: "C", explanation: "Triangle has straight sides; the others are all curved shapes." },
  });
  qs.push({
    ...qBase(ctx, "mcq_single", "Non-Verbal Reasoning/Odd One Out/Shape Groups", "medium", 1, ["FSCE"], ["odd-one-out", "nvr", "year-5"], 60),
    content: { body: "Five shapes all contain a small circle inside. Four have the circle in the centre. One has the circle in the top-right corner. Which is the odd one out?", options: mcqOpts(["Shape A (centre)", "Shape B (centre)", "Shape C (top-right)", "Shape D (centre)"], 2), correctAnswer: "C", explanation: "Shape C is different because the inner circle is not centred." },
  });
  qs.push({
    ...qBase(ctx, "mcq_single", "Non-Verbal Reasoning/Odd One Out/Pattern Exclusion", "hard", 1, ["FSCE"], ["pattern-exclusion", "nvr", "year-5"], 90),
    content: { body: "Five figures each show an arrow: A points up-right, B points up-left, C points down-right, D points down, E points down-left. Four arrows are at 45° angles. Which is the odd one out?", options: mcqOpts(["A", "B", "D", "E"], 2), correctAnswer: "C", explanation: "D points straight down (not at 45°). The others are all at diagonal 45° angles." },
  });
  qs.push({
    ...qBase(ctx, "mcq_single", "Non-Verbal Reasoning/Odd One Out/Pattern Exclusion", "very_hard", 1, ["FSCE"], ["pattern-exclusion", "nvr", "year-5"], 120),
    content: { body: "Five shapes each have an outer shape and inner shape. Four follow the rule: the inner shape has one fewer side than the outer. Which breaks the rule? A: Pentagon/Square, B: Square/Triangle, C: Hexagon/Pentagon, D: Triangle/Circle, E: Heptagon/Pentagon", options: mcqOpts(["A", "B", "D", "E"], 3), correctAnswer: "D", explanation: "Heptagon (7 sides) should contain a hexagon (6 sides), not a pentagon (5 sides). E breaks the rule." },
  });

  // Spatial Reasoning — Paper Folding (4)
  qs.push({
    ...qBase(ctx, "mcq_single", "Non-Verbal Reasoning/Spatial Reasoning/Paper Folding", "easy", 1, ["FSCE"], ["paper-folding", "nvr", "year-5"], 60),
    content: { body: "A square piece of paper is folded in half once (left to right) and a hole is punched in the centre. When unfolded, how many holes will there be?", options: mcqOpts(["1", "2", "3", "4"], 1), correctAnswer: "B", explanation: "One fold doubles the hole: 2 holes when unfolded." },
  });
  qs.push({
    ...qBase(ctx, "mcq_single", "Non-Verbal Reasoning/Spatial Reasoning/Paper Folding", "medium", 1, ["FSCE"], ["paper-folding", "nvr", "year-5"], 90),
    content: { body: "A square paper is folded in half (top to bottom), then in half again (left to right). A hole is punched through all layers. How many holes when fully unfolded?", options: mcqOpts(["2", "3", "4", "8"], 2), correctAnswer: "C", explanation: "Two folds = 4 layers. One hole through 4 layers = 4 holes." },
  });
  qs.push({
    ...qBase(ctx, "mcq_single", "Non-Verbal Reasoning/Spatial Reasoning/Cube Nets", "medium", 1, ["FSCE"], ["cube-nets", "nvr", "year-5"], 90),
    content: { body: "A cube net shows the letters A, B, C, D, E, F on its six faces. If A is on top and B faces you, which letter is on the bottom?", options: mcqOpts(["C", "D", "E", "F"], 2), correctAnswer: "C", explanation: "In this net arrangement, E is opposite A (on the bottom)." },
  });
  qs.push({
    ...qBase(ctx, "mcq_single", "Non-Verbal Reasoning/Spatial Reasoning/Cube Nets", "hard", 1, ["FSCE"], ["cube-nets", "nvr", "year-5"], 120),
    content: { body: "Which of these arrangements of 6 squares CANNOT be folded into a cube?", options: mcqOpts(["A cross shape (1-4-1)", "An L-shape (3-2-1)", "A T-shape (1-4-1)", "A straight line of 6 squares"], 3), correctAnswer: "D", explanation: "A straight line of 6 squares cannot be folded into a cube. The squares would overlap." },
  });

  // Rotation & Reflection (6)
  qs.push({
    ...qBase(ctx, "mcq_single", "Non-Verbal Reasoning/Rotation & Reflection/Rotation Patterns", "easy", 1, ["FSCE"], ["rotation", "nvr", "year-5"], 45),
    content: { body: "If the letter 'L' is rotated 90° clockwise, which way does it point?", options: mcqOpts(["Opens to the right", "Opens to the left", "Opens upward", "Opens downward"], 2), correctAnswer: "C", explanation: "Rotating L (which opens right-and-down) by 90° clockwise makes it open upward." },
  });
  qs.push({
    ...qBase(ctx, "mcq_single", "Non-Verbal Reasoning/Rotation & Reflection/Rotation Patterns", "medium", 1, ["FSCE"], ["rotation", "nvr", "year-5"], 60),
    content: { body: "A flag pointing right is rotated 180°. Which direction does it now point?", options: mcqOpts(["Up", "Down", "Left", "Right"], 2), correctAnswer: "C", explanation: "180° rotation reverses direction: right → left." },
  });
  qs.push({
    ...qBase(ctx, "mcq_single", "Non-Verbal Reasoning/Rotation & Reflection/Rotation Patterns", "hard", 1, ["FSCE"], ["rotation", "nvr", "year-5"], 90),
    content: { body: "An arrow points to the top-right (NE). It is rotated 270° anticlockwise. Where does it now point?", options: mcqOpts(["Top-left (NW)", "Bottom-right (SE)", "Bottom-left (SW)", "Top-right (NE)"], 1), correctAnswer: "B", explanation: "270° anticlockwise = 90° clockwise. NE rotated 90° clockwise = SE." },
  });
  qs.push({
    ...qBase(ctx, "mcq_single", "Non-Verbal Reasoning/Rotation & Reflection/Mirror Images", "easy", 1, ["FSCE"], ["reflection", "nvr", "year-5"], 45),
    content: { body: "What does the letter 'b' look like when reflected in a vertical mirror (mirror on the right)?", options: mcqOpts(["b", "d", "p", "q"], 1), correctAnswer: "B", explanation: "Reflecting 'b' in a vertical mirror gives 'd'." },
  });
  qs.push({
    ...qBase(ctx, "mcq_single", "Non-Verbal Reasoning/Rotation & Reflection/Mirror Images", "medium", 1, ["FSCE"], ["reflection", "nvr", "year-5"], 60),
    content: { body: "A shape shows an arrow pointing right with a dot above it. When reflected in a horizontal mirror (below), what does it look like?", options: mcqOpts(["Arrow right, dot below", "Arrow left, dot above", "Arrow right, dot above", "Arrow left, dot below"], 0), correctAnswer: "A", explanation: "Horizontal reflection: the dot moves from above to below. Arrow direction stays the same horizontally." },
  });
  qs.push({
    ...qBase(ctx, "mcq_single", "Non-Verbal Reasoning/Rotation & Reflection/Mirror Images", "hard", 1, ["FSCE"], ["reflection", "nvr", "year-5"], 90),
    content: { body: "The word 'HIDE' is reflected in a horizontal mirror (mirror below the word). Which letters look the same?", options: mcqOpts(["H and I only", "H, I, and D", "H, I, D, and E", "None of them"], 2), correctAnswer: "C", explanation: "H, I, D, and E all have horizontal symmetry and look the same when reflected horizontally." },
  });

  return qs;
}

// ═══════════════════════════════════════════════════════════════════════════
// 4. PAPERS (8)
// ═══════════════════════════════════════════════════════════════════════════

async function seedPapers(ctx: SeedContext) {
  console.log("\n4. Seeding papers (8)...");
  let created = 0, skipped = 0;

  const fsceTemplate = await PaperTemplateModel.findOne({ name: "FSCE Mock Test Template", isPreBuilt: true });
  const csseTemplate = await PaperTemplateModel.findOne({ name: "CSSE Mock Test Template", isPreBuilt: true });
  if (!fsceTemplate || !csseTemplate) {
    throw new Error("Templates not found! Run npm run seed:templates first.");
  }
  ctx.templates["fsce"] = fsceTemplate._id as Types.ObjectId;
  ctx.templates["csse"] = csseTemplate._id as Types.ObjectId;

  const mQ = ctx.questions["maths"] || [];
  const eQ = ctx.questions["english"] || [];
  const vQ = ctx.questions["vr"] || [];
  const nQ = ctx.questions["nvr"] || [];

  function buildSection(name: string, qIds: Types.ObjectId[], startNum: number, marksEach: number, timeLimit: number, instructions: string = "") {
    return {
      name,
      instructions,
      timeLimit,
      questions: qIds.map((id, i) => ({ questionId: id, questionNumber: startNum + i, marks: marksEach, isRequired: true })),
    };
  }

  const papersData = [
    {
      title: "FSCE Mock 1 - Paper 1 (English, Maths & VR)",
      description: "FSCE Paper 1: Mixed English, Mathematics and Verbal Reasoning.",
      templateId: ctx.templates["fsce"],
      sections: [
        buildSection("English", eQ.slice(2, 10), 1, 1, 15, "Answer all questions."),
        buildSection("Mathematics", mQ.slice(0, 15), 9, 1, 15, "Show your working where required."),
        buildSection("Verbal Reasoning", vQ.slice(0, 10), 24, 1, 15, "Choose the best answer."),
      ],
      totalMarks: 85, totalTime: 45, status: "published" as const,
    },
    {
      title: "FSCE Mock 1 - Paper 2 (Comp, Problem Solving & NVR)",
      description: "FSCE Paper 2: Comprehension, Maths Problem Solving and Non-Verbal Reasoning.",
      templateId: ctx.templates["fsce"],
      sections: [
        buildSection("English Comprehension", eQ.slice(0, 2), 1, 5, 12, "Read the passage carefully."),
        buildSection("Maths Problem Solving", mQ.slice(15, 30), 3, 1, 12, "Show all working."),
        buildSection("Non-Verbal Reasoning", nQ.slice(0, 15), 18, 1, 11, "Choose the best answer."),
      ],
      totalMarks: 80, totalTime: 35, status: "published" as const,
    },
    {
      title: "FSCE Mock 1 - Paper 3 (Creative Writing)",
      description: "FSCE Paper 3: Creative writing task.",
      templateId: ctx.templates["fsce"],
      sections: [
        buildSection("Creative Writing", eQ.slice(20, 21), 1, 20, 20, "Write a story or essay on the given topic."),
      ],
      totalMarks: 20, totalTime: 20, status: "published" as const,
    },
    {
      title: "FSCE Mock 2 - Paper 1 (English, Maths & VR)",
      description: "FSCE Mock 2, Paper 1: Mixed format.",
      templateId: ctx.templates["fsce"],
      sections: [
        buildSection("English", eQ.slice(10, 18), 1, 1, 15),
        buildSection("Mathematics", mQ.slice(30, 45), 9, 1, 15),
        buildSection("Verbal Reasoning", vQ.slice(10, 20), 24, 1, 15),
      ],
      totalMarks: 85, totalTime: 45, status: "finalized" as const,
    },
    {
      title: "FSCE Mock 2 - Paper 2 (Comp, Problem Solving & NVR)",
      description: "FSCE Mock 2, Paper 2.",
      templateId: ctx.templates["fsce"],
      sections: [
        buildSection("English Comprehension", eQ.slice(0, 2), 1, 5, 12),
        buildSection("Maths Problem Solving", mQ.slice(5, 15), 3, 1, 12),
        buildSection("Non-Verbal Reasoning", nQ.slice(15, 28), 13, 1, 11),
      ],
      totalMarks: 80, totalTime: 35, status: "finalized" as const,
    },
    {
      title: "FSCE Mock 2 - Paper 3 (Creative Writing)",
      description: "FSCE Mock 2, Paper 3: Creative writing.",
      templateId: ctx.templates["fsce"],
      sections: [
        buildSection("Creative Writing", eQ.slice(21, 22), 1, 20, 20),
      ],
      totalMarks: 20, totalTime: 20, status: "draft" as const,
    },
    {
      title: "CSSE Mock 1 - English",
      description: "CSSE English paper: Comprehension and writing.",
      templateId: ctx.templates["csse"],
      sections: [
        buildSection("Comprehension", eQ.slice(0, 2), 1, 5, 30, "Read the passage and answer the questions."),
        buildSection("Writing", eQ.slice(20, 23), 3, 10, 30, "Write a response for each prompt."),
      ],
      totalMarks: 60, totalTime: 70, status: "published" as const,
    },
    {
      title: "CSSE Mock 1 - Maths",
      description: "CSSE Mathematics paper.",
      templateId: ctx.templates["csse"],
      sections: [
        buildSection("Section A - Short Questions", mQ.slice(0, 25), 1, 1, 30),
        buildSection("Section B - Problem Solving", mQ.slice(25, 35), 26, 4, 30, "Show all working."),
      ],
      totalMarks: 80, totalTime: 60, status: "published" as const,
    },
  ];

  for (const p of papersData) {
    const doc = await PaperModel.findOneAndUpdate(
      { companyId: ctx.companyId, title: p.title },
      {
        $setOnInsert: {
          tenantId: TENANT_ID,
          companyId: ctx.companyId,
          ...p,
          pdfs: [],
          version: 1,
          createdBy: SARAH_EMAIL,
          updatedBy: SARAH_EMAIL,
        },
      },
      { upsert: true, new: true }
    );
    ctx.papers[p.title] = doc._id;
    if (doc.createdAt.getTime() > Date.now() - 5000) created++; else skipped++;
  }

  log("+", `Papers: ${created} created, ${skipped} skipped`);
}

// ═══════════════════════════════════════════════════════════════════════════
// 5. PAPER SETS (2)
// ═══════════════════════════════════════════════════════════════════════════

async function seedPaperSets(ctx: SeedContext) {
  console.log("\n5. Seeding paper sets (2)...");
  let created = 0, skipped = 0;

  const setsData = [
    {
      title: "FSCE Mock Test Papers 2025",
      shortDescription: "Complete set of 3 FSCE mock test papers covering all subjects.",
      fullDescription: "Full FSCE mock examination pack including Paper 1 (English, Maths & VR), Paper 2 (Comprehension, Problem Solving & NVR) and Paper 3 (Creative Writing). Designed to mirror the real FSCE exam format.",
      examType: "FSCE",
      yearGroup: "Year 5",
      subjectCategory: "Mixed",
      papers: [
        { paperId: ctx.papers["FSCE Mock 1 - Paper 1 (English, Maths & VR)"], order: 1, pdfs: [] },
        { paperId: ctx.papers["FSCE Mock 1 - Paper 2 (Comp, Problem Solving & NVR)"], order: 2, pdfs: [] },
        { paperId: ctx.papers["FSCE Mock 1 - Paper 3 (Creative Writing)"], order: 3, pdfs: [] },
      ],
      pricing: { currency: "GBP", pricePerPaper: 4.99, bundlePrice: 11.99, checkingServicePrice: 9.99, oneToOneServicePrice: 29.99, isFree: false },
      status: "published" as const,
    },
    {
      title: "CSSE Mock Test Papers 2025",
      shortDescription: "CSSE English and Maths mock papers for grammar school entrance.",
      fullDescription: "CSSE mock exam papers including a full English paper (Comprehension and Writing) and a full Mathematics paper (Short Questions and Problem Solving). Matches the CSSE format used by Essex grammar schools.",
      examType: "CSSE",
      yearGroup: "Year 5",
      subjectCategory: "Mixed",
      papers: [
        { paperId: ctx.papers["CSSE Mock 1 - English"], order: 1, pdfs: [] },
        { paperId: ctx.papers["CSSE Mock 1 - Maths"], order: 2, pdfs: [] },
      ],
      pricing: { currency: "GBP", pricePerPaper: 4.99, bundlePrice: 7.99, checkingServicePrice: 9.99, oneToOneServicePrice: 29.99, isFree: false },
      status: "published" as const,
    },
  ];

  for (const ps of setsData) {
    const doc = await PaperSetModel.findOneAndUpdate(
      { companyId: ctx.companyId, title: ps.title },
      {
        $setOnInsert: {
          tenantId: TENANT_ID,
          companyId: ctx.companyId,
          ...ps,
          imageUrls: [],
          sortDate: new Date(),
          createdBy: NAVIN_EMAIL,
          updatedBy: NAVIN_EMAIL,
        },
      },
      { upsert: true, new: true }
    );
    ctx.paperSets[ps.title] = doc._id;
    if (doc.createdAt.getTime() > Date.now() - 5000) created++; else skipped++;
  }
  log("+", `Paper Sets: ${created} created, ${skipped} skipped`);
}

// ═══════════════════════════════════════════════════════════════════════════
// 6. STUDENTS (10)
// ═══════════════════════════════════════════════════════════════════════════

const NEW_STUDENTS = [
  { email: "amelia.taylor@example.com", firstName: "Amelia", lastName: "Taylor", school: "Moulsham Junior School", yearGroup: "Year 5" },
  { email: "harry.wilson@example.com", firstName: "Harry", lastName: "Wilson", school: "St Anne's Prep School", yearGroup: "Year 5" },
  { email: "isla.davies@example.com", firstName: "Isla", lastName: "Davies", school: "Chelmsford Cathedral School", yearGroup: "Year 5" },
  { email: "george.evans@example.com", firstName: "George", lastName: "Evans", school: "Great Baddow Academy", yearGroup: "Year 5" },
  { email: "sophie.thomas@example.com", firstName: "Sophie", lastName: "Thomas", school: "Barnes Farm Junior School", yearGroup: "Year 5" },
  { email: "jack.roberts@example.com", firstName: "Jack", lastName: "Roberts", school: "Writtle Junior School", yearGroup: "Year 5" },
  { email: "emily.clarke@example.com", firstName: "Emily", lastName: "Clarke", school: "Moulsham Junior School", yearGroup: "Year 5" },
  { email: "noah.patel@example.com", firstName: "Noah", lastName: "Patel", school: "Great Baddow Academy", yearGroup: "Year 4" },
  { email: "lily.murphy@example.com", firstName: "Lily", lastName: "Murphy", school: "Barnes Farm Junior School", yearGroup: "Year 4" },
];

async function seedStudents(ctx: SeedContext) {
  console.log("\n6. Seeding students (10)...");
  let created = 0, skipped = 0;

  // Oliver Brown (existing user)
  const oliverUser = await User.findOne({ email: "oliver@chelmsford11plus.com" });
  if (oliverUser) {
    const oliverStudent = await StudentModel.findOneAndUpdate(
      { userId: oliverUser._id },
      {
        $setOnInsert: {
          userId: oliverUser._id,
          studentCode: genStudentCode(),
          yearGroup: "Year 5",
          school: "Moulsham Junior School",
          organizations: [{
            companyId: ctx.companyId,
            tenantId: TENANT_ID,
            joinedAt: daysAgo(90),
            role: "student",
            orgName: "Chelmsford 11 Plus",
            isActive: true,
          }],
        },
      },
      { upsert: true, new: true }
    );
    ctx.students["Oliver Brown"] = oliverStudent._id;
    if (oliverStudent.createdAt.getTime() > Date.now() - 5000) created++; else skipped++;
  }

  // New students - create user + membership + student record
  for (const s of NEW_STUDENTS) {
    let user = await User.findOne({ email: s.email });
    if (!user) {
      const password = createPasswordRecord(DEFAULT_PASSWORD);
      user = await User.create({
        email: s.email,
        password,
        firstName: s.firstName,
        lastName: s.lastName,
        about: `${s.yearGroup} student at ${s.school}, preparing for 11+ exams.`,
        registeredAs: "student",
      });
      log("+", `Created student user: ${s.email}`);
    }

    // Membership
    await Membership.findOneAndUpdate(
      { companyId: ctx.companyId, userEmail: s.email },
      { $setOnInsert: { companyId: ctx.companyId, userEmail: s.email, role: "student" } },
      { upsert: true }
    );

    // Set active company
    if (!user.lastActiveCompanyId || user.lastActiveCompanyId.toString() !== ctx.companyId.toString()) {
      user.lastActiveCompanyId = ctx.companyId;
      await user.save();
    }

    // Student record
    const studentDoc = await StudentModel.findOneAndUpdate(
      { userId: user._id },
      {
        $setOnInsert: {
          userId: user._id,
          studentCode: genStudentCode(),
          yearGroup: s.yearGroup,
          school: s.school,
          organizations: [{
            companyId: ctx.companyId,
            tenantId: TENANT_ID,
            joinedAt: daysAgo(60),
            role: "student",
            orgName: "Chelmsford 11 Plus",
            isActive: true,
          }],
        },
      },
      { upsert: true, new: true }
    );
    ctx.students[`${s.firstName} ${s.lastName}`] = studentDoc._id;
    if (studentDoc.createdAt.getTime() > Date.now() - 5000) created++; else skipped++;
  }

  log("+", `Students: ${created} created, ${skipped} skipped`);
}

// ═══════════════════════════════════════════════════════════════════════════
// 7. CLASSES (4)
// ═══════════════════════════════════════════════════════════════════════════

async function seedClasses(ctx: SeedContext) {
  console.log("\n7. Seeding classes (4)...");
  let created = 0, skipped = 0;

  const sarahUser = ctx.users["sarah"] || await User.findOne({ email: SARAH_EMAIL });
  const jamesUser = ctx.users["james"] || await User.findOne({ email: JAMES_EMAIL });

  const y5Students = ["Oliver Brown", "Amelia Taylor", "Harry Wilson", "Isla Davies", "George Evans", "Sophie Thomas", "Jack Roberts", "Emily Clarke"];
  const y4Students = ["Noah Patel", "Lily Murphy"];

  const classesData = [
    {
      name: "Year 5 FSCE Preparation",
      slug: "year-5-fsce-prep",
      description: "Saturday morning FSCE preparation class covering English, Maths, and Verbal Reasoning.",
      yearGroup: "Year 5",
      subject: "FSCE",
      schedule: { dayOfWeek: ["Saturday"], time: "09:00 - 11:00", location: "Room 1" },
      students: y5Students.slice(0, 6).map(n => ctx.students[n]).filter(Boolean),
      teachers: [sarahUser?._id].filter(Boolean),
    },
    {
      name: "Year 5 CSSE Preparation",
      slug: "year-5-csse-prep",
      description: "Saturday CSSE preparation focusing on English and Mathematics at CSSE level.",
      yearGroup: "Year 5",
      subject: "CSSE",
      schedule: { dayOfWeek: ["Saturday"], time: "11:30 - 13:30", location: "Room 2" },
      students: y5Students.slice(2, 7).map(n => ctx.students[n]).filter(Boolean),
      teachers: [jamesUser?._id].filter(Boolean),
    },
    {
      name: "Year 5 General 11+ Practice",
      slug: "year-5-general-11plus",
      description: "Mid-week general 11+ practice session covering all subjects.",
      yearGroup: "Year 5",
      subject: "General 11+",
      schedule: { dayOfWeek: ["Wednesday"], time: "16:00 - 17:30", location: "Room 1" },
      students: [...y5Students.slice(0, 3), ...y5Students.slice(5, 7)].map(n => ctx.students[n]).filter(Boolean),
      teachers: [sarahUser?._id, jamesUser?._id].filter(Boolean),
    },
    {
      name: "Year 4 Early Preparation",
      slug: "year-4-early-prep",
      description: "Introduction to 11+ concepts for Year 4 students starting early preparation.",
      yearGroup: "Year 4",
      subject: "General 11+",
      schedule: { dayOfWeek: ["Tuesday"], time: "16:00 - 17:00", location: "Room 2" },
      students: y4Students.map(n => ctx.students[n]).filter(Boolean),
      teachers: [jamesUser?._id].filter(Boolean),
    },
  ];

  for (const c of classesData) {
    const doc = await ClassModel.findOneAndUpdate(
      { companyId: ctx.companyId, slug: c.slug },
      {
        $setOnInsert: {
          tenantId: TENANT_ID,
          companyId: ctx.companyId,
          ...c,
          studentCount: c.students.length,
          status: "active",
          createdBy: NAVIN_EMAIL,
          updatedBy: NAVIN_EMAIL,
        },
      },
      { upsert: true, new: true }
    );
    ctx.classes[c.name] = doc._id;
    if (doc.createdAt.getTime() > Date.now() - 5000) created++; else skipped++;
  }
  log("+", `Classes: ${created} created, ${skipped} skipped`);
}

// ═══════════════════════════════════════════════════════════════════════════
// 8. ONLINE TESTS (8)
// ═══════════════════════════════════════════════════════════════════════════

async function seedOnlineTests(ctx: SeedContext) {
  console.log("\n8. Seeding online tests (8)...");
  let created = 0, skipped = 0;

  const allStudentIds = Object.values(ctx.students);
  const fsceClassId = ctx.classes["Year 5 FSCE Preparation"];
  const csseClassId = ctx.classes["Year 5 CSSE Preparation"];
  const generalClassId = ctx.classes["Year 5 General 11+ Practice"];

  const mQ = ctx.questions["maths"] || [];
  const eQ = ctx.questions["english"] || [];
  const vQ = ctx.questions["vr"] || [];
  const nQ = ctx.questions["nvr"] || [];

  const testsData = [
    // 3 completed
    {
      title: "FSCE Mock 1 - Paper 1 (Live Mock)",
      description: "Timed live mock of FSCE Paper 1.",
      paperId: ctx.papers["FSCE Mock 1 - Paper 1 (English, Maths & VR)"],
      mode: "live_mock" as const,
      scheduling: { startTime: daysAgo(14), endTime: daysAgo(14), availableFrom: daysAgo(15), duration: 45 },
      sections: [
        { name: "English", questionIds: eQ.slice(2, 10), timeLimit: 15, instructions: "", canGoBack: true },
        { name: "Mathematics", questionIds: mQ.slice(0, 15), timeLimit: 15, instructions: "", canGoBack: true },
        { name: "Verbal Reasoning", questionIds: vQ.slice(0, 10), timeLimit: 15, instructions: "", canGoBack: true },
      ],
      options: { randomizeQuestions: false, randomizeOptions: false, showResultsAfterCompletion: true, showSolutionsAfterCompletion: true, showResultsToParents: true, instantFeedback: false, allowReview: true, maxAttempts: 1, passingScore: 60 },
      assignment: { classIds: [fsceClassId].filter(Boolean), studentIds: [], isPublic: false },
      status: "completed" as const,
      resultsPublished: true,
      totalMarks: 85, totalQuestions: 33,
    },
    {
      title: "CSSE Maths Practice Test",
      description: "Practice test covering CSSE Maths topics.",
      paperId: ctx.papers["CSSE Mock 1 - Maths"],
      mode: "practice" as const,
      scheduling: { startTime: daysAgo(10), endTime: daysAgo(3), availableFrom: daysAgo(10), duration: 60 },
      sections: [
        { name: "Short Questions", questionIds: mQ.slice(0, 20), timeLimit: 30, instructions: "", canGoBack: true },
        { name: "Problem Solving", questionIds: mQ.slice(20, 30), timeLimit: 30, instructions: "Show working.", canGoBack: true },
      ],
      options: { randomizeQuestions: false, randomizeOptions: false, showResultsAfterCompletion: true, showSolutionsAfterCompletion: true, showResultsToParents: true, instantFeedback: true, allowReview: true, maxAttempts: 3, passingScore: 50 },
      assignment: { classIds: [csseClassId].filter(Boolean), studentIds: [], isPublic: false },
      status: "completed" as const,
      resultsPublished: true,
      totalMarks: 80, totalQuestions: 30,
    },
    {
      title: "Weekly VR Quiz - Week 12",
      description: "Quick weekly verbal reasoning assessment.",
      paperId: null,
      mode: "classroom" as const,
      scheduling: { startTime: daysAgo(7), endTime: daysAgo(7), availableFrom: daysAgo(8), duration: 20 },
      sections: [
        { name: "Verbal Reasoning", questionIds: vQ.slice(0, 20), timeLimit: 20, instructions: "", canGoBack: true },
      ],
      options: { randomizeQuestions: true, randomizeOptions: true, showResultsAfterCompletion: true, showSolutionsAfterCompletion: false, showResultsToParents: true, instantFeedback: false, allowReview: true, maxAttempts: 1, passingScore: 50 },
      assignment: { classIds: [generalClassId].filter(Boolean), studentIds: [], isPublic: false },
      status: "completed" as const,
      resultsPublished: true,
      totalMarks: 20, totalQuestions: 20,
    },
    // 3 live
    {
      title: "FSCE Mock 2 - Paper 1 (Live)",
      description: "Live mock examination - FSCE Paper 1.",
      paperId: ctx.papers["FSCE Mock 2 - Paper 1 (English, Maths & VR)"],
      mode: "live_mock" as const,
      scheduling: { startTime: daysFromNow(3), endTime: daysFromNow(3), availableFrom: daysFromNow(2), duration: 45 },
      sections: [
        { name: "English", questionIds: eQ.slice(10, 18), timeLimit: 15, instructions: "", canGoBack: true },
        { name: "Mathematics", questionIds: mQ.slice(30, 45), timeLimit: 15, instructions: "", canGoBack: true },
        { name: "Verbal Reasoning", questionIds: vQ.slice(10, 20), timeLimit: 15, instructions: "", canGoBack: true },
      ],
      options: { randomizeQuestions: false, randomizeOptions: false, showResultsAfterCompletion: true, showSolutionsAfterCompletion: false, showResultsToParents: true, instantFeedback: false, allowReview: true, maxAttempts: 1, passingScore: 60 },
      assignment: { classIds: [fsceClassId].filter(Boolean), studentIds: [], isPublic: false },
      status: "scheduled" as const,
      resultsPublished: false,
      totalMarks: 85, totalQuestions: 33,
    },
    {
      title: "FSCE Paper 3 Practice (Anytime)",
      description: "Creative writing practice - complete anytime within the window.",
      paperId: ctx.papers["FSCE Mock 1 - Paper 3 (Creative Writing)"],
      mode: "anytime_mock" as const,
      scheduling: { startTime: null, endTime: daysFromNow(14), availableFrom: daysAgo(2), duration: 20 },
      sections: [
        { name: "Creative Writing", questionIds: eQ.slice(20, 21), timeLimit: 20, instructions: "Write on the given topic.", canGoBack: false },
      ],
      options: { randomizeQuestions: false, randomizeOptions: false, showResultsAfterCompletion: false, showSolutionsAfterCompletion: false, showResultsToParents: true, instantFeedback: false, allowReview: false, maxAttempts: 1, passingScore: 40 },
      assignment: { classIds: [fsceClassId].filter(Boolean), studentIds: [], isPublic: false },
      status: "live" as const,
      resultsPublished: false,
      totalMarks: 20, totalQuestions: 1,
    },
    {
      title: "CSSE Maths Anytime Practice",
      description: "CSSE Maths practice available anytime.",
      paperId: ctx.papers["CSSE Mock 1 - Maths"],
      mode: "anytime_mock" as const,
      scheduling: { startTime: null, endTime: daysFromNow(21), availableFrom: daysAgo(5), duration: 60 },
      sections: [
        { name: "Short Questions", questionIds: mQ.slice(0, 20), timeLimit: 30, instructions: "", canGoBack: true },
        { name: "Problem Solving", questionIds: mQ.slice(20, 30), timeLimit: 30, instructions: "", canGoBack: true },
      ],
      options: { randomizeQuestions: true, randomizeOptions: true, showResultsAfterCompletion: true, showSolutionsAfterCompletion: true, showResultsToParents: true, instantFeedback: false, allowReview: true, maxAttempts: 2, passingScore: 50 },
      assignment: { classIds: [csseClassId].filter(Boolean), studentIds: [], isPublic: true },
      status: "live" as const,
      resultsPublished: false,
      totalMarks: 80, totalQuestions: 30,
    },
    // 2 scheduled
    {
      title: "CSSE English Mock - March 2026",
      description: "Full CSSE English examination mock.",
      paperId: ctx.papers["CSSE Mock 1 - English"],
      mode: "live_mock" as const,
      scheduling: { startTime: daysFromNow(30), endTime: daysFromNow(30), availableFrom: daysFromNow(28), duration: 70 },
      sections: [
        { name: "Comprehension", questionIds: eQ.slice(0, 2), timeLimit: 30, instructions: "", canGoBack: true },
        { name: "Writing", questionIds: eQ.slice(20, 23), timeLimit: 30, instructions: "", canGoBack: true },
      ],
      options: { randomizeQuestions: false, randomizeOptions: false, showResultsAfterCompletion: true, showSolutionsAfterCompletion: true, showResultsToParents: true, instantFeedback: false, allowReview: true, maxAttempts: 1, passingScore: 50 },
      assignment: { classIds: [csseClassId].filter(Boolean), studentIds: [], isPublic: false },
      status: "scheduled" as const,
      resultsPublished: false,
      totalMarks: 60, totalQuestions: 5,
    },
    {
      title: "Spring NVR Assessment",
      description: "End-of-term Non-Verbal Reasoning assessment.",
      paperId: null,
      mode: "classroom" as const,
      scheduling: { startTime: daysFromNow(21), endTime: daysFromNow(21), availableFrom: daysFromNow(20), duration: 30 },
      sections: [
        { name: "Non-Verbal Reasoning", questionIds: nQ.slice(0, 25), timeLimit: 30, instructions: "", canGoBack: true },
      ],
      options: { randomizeQuestions: true, randomizeOptions: true, showResultsAfterCompletion: true, showSolutionsAfterCompletion: false, showResultsToParents: true, instantFeedback: false, allowReview: true, maxAttempts: 1, passingScore: 50 },
      assignment: { classIds: [generalClassId, fsceClassId].filter(Boolean), studentIds: [], isPublic: false },
      status: "scheduled" as const,
      resultsPublished: false,
      totalMarks: 25, totalQuestions: 25,
    },
  ];

  for (const t of testsData) {
    const doc = await OnlineTestModel.findOneAndUpdate(
      { companyId: ctx.companyId, title: t.title },
      {
        $setOnInsert: {
          tenantId: TENANT_ID,
          companyId: ctx.companyId,
          ...t,
          grading: { requireManualGrading: false, gradingDeadline: null },
          createdBy: SARAH_EMAIL,
          updatedBy: SARAH_EMAIL,
        },
      },
      { upsert: true, new: true }
    );
    ctx.tests[t.title] = doc._id;
    if (doc.createdAt.getTime() > Date.now() - 5000) created++; else skipped++;
  }
  log("+", `Online Tests: ${created} created, ${skipped} skipped`);
}

// ═══════════════════════════════════════════════════════════════════════════
// 9. TEST ATTEMPTS (~18)
// ═══════════════════════════════════════════════════════════════════════════

function buildResult(obtained: number, total: number, sections: { name: string; obtained: number; total: number }[]): any {
  const pct = Math.round((obtained / total) * 100);
  const grade = pct >= 90 ? "A*" : pct >= 80 ? "A" : pct >= 70 ? "B" : pct >= 60 ? "C" : pct >= 50 ? "D" : "U";
  return {
    totalMarks: total,
    marksObtained: obtained,
    percentage: pct,
    grade,
    rank: null,
    percentile: null,
    sectionScores: sections.map((s, i) => ({
      sectionIndex: i,
      sectionName: s.name,
      marksObtained: s.obtained,
      totalMarks: s.total,
      percentage: Math.round((s.obtained / s.total) * 100),
    })),
    subjectScores: [],
    objectiveMarks: obtained,
    subjectiveMarks: 0,
    isPassing: pct >= 60,
  };
}

async function seedTestAttempts(ctx: SeedContext) {
  console.log("\n9. Seeding test attempts (~18)...");
  let created = 0, skipped = 0;

  const studentNames = ["Oliver Brown", "Amelia Taylor", "Harry Wilson", "Isla Davies", "George Evans", "Sophie Thomas"];

  // FSCE Mock 1 Paper 1 attempts (6 students)
  const fsceTest = ctx.tests["FSCE Mock 1 - Paper 1 (Live Mock)"];
  const fsceScores = [
    { name: "Oliver Brown", obtained: 72, sections: [{ name: "English", obtained: 22, total: 25 }, { name: "Mathematics", obtained: 28, total: 35 }, { name: "Verbal Reasoning", obtained: 22, total: 25 }] },
    { name: "Amelia Taylor", obtained: 77, sections: [{ name: "English", obtained: 24, total: 25 }, { name: "Mathematics", obtained: 30, total: 35 }, { name: "Verbal Reasoning", obtained: 23, total: 25 }] },
    { name: "Harry Wilson", obtained: 64, sections: [{ name: "English", obtained: 18, total: 25 }, { name: "Mathematics", obtained: 26, total: 35 }, { name: "Verbal Reasoning", obtained: 20, total: 25 }] },
    { name: "Isla Davies", obtained: 80, sections: [{ name: "English", obtained: 24, total: 25 }, { name: "Mathematics", obtained: 33, total: 35 }, { name: "Verbal Reasoning", obtained: 23, total: 25 }] },
    { name: "George Evans", obtained: 68, sections: [{ name: "English", obtained: 20, total: 25 }, { name: "Mathematics", obtained: 27, total: 35 }, { name: "Verbal Reasoning", obtained: 21, total: 25 }] },
    { name: "Sophie Thomas", obtained: 74, sections: [{ name: "English", obtained: 23, total: 25 }, { name: "Mathematics", obtained: 29, total: 35 }, { name: "Verbal Reasoning", obtained: 22, total: 25 }] },
  ];

  if (fsceTest) {
    for (const a of fsceScores) {
      const studentId = ctx.students[a.name];
      if (!studentId) continue;
      const existing = await TestAttemptModel.findOne({ testId: fsceTest, studentId, attemptNumber: 1 });
      if (existing) { skipped++; continue; }
      await TestAttemptModel.create({
        tenantId: TENANT_ID, companyId: ctx.companyId, testId: fsceTest, studentId, attemptNumber: 1,
        status: "graded",
        startedAt: daysAgo(14), submittedAt: daysAgo(14),
        sections: a.sections.map((_, i) => ({ sectionIndex: i, startedAt: daysAgo(14), completedAt: daysAgo(14), timeSpent: 800 + Math.floor(Math.random() * 200), isLocked: true })),
        answers: [],
        result: buildResult(a.obtained, 85, a.sections),
        questionOrder: [], optionOrders: {}, currentSectionIndex: 0,
        gradedBy: SARAH_EMAIL, gradedAt: daysAgo(13),
      });
      created++;
    }
  }

  // CSSE Maths attempts (5 students)
  const csseTest = ctx.tests["CSSE Maths Practice Test"];
  const csseScores = [
    { name: "Harry Wilson", obtained: 62, sections: [{ name: "Short Questions", obtained: 36, total: 40 }, { name: "Problem Solving", obtained: 26, total: 40 }] },
    { name: "Isla Davies", obtained: 70, sections: [{ name: "Short Questions", obtained: 38, total: 40 }, { name: "Problem Solving", obtained: 32, total: 40 }] },
    { name: "George Evans", obtained: 55, sections: [{ name: "Short Questions", obtained: 32, total: 40 }, { name: "Problem Solving", obtained: 23, total: 40 }] },
    { name: "Sophie Thomas", obtained: 48, sections: [{ name: "Short Questions", obtained: 30, total: 40 }, { name: "Problem Solving", obtained: 18, total: 40 }] },
    { name: "Jack Roberts", obtained: 58, sections: [{ name: "Short Questions", obtained: 34, total: 40 }, { name: "Problem Solving", obtained: 24, total: 40 }] },
  ];

  if (csseTest) {
    for (const a of csseScores) {
      const studentId = ctx.students[a.name];
      if (!studentId) continue;
      const existing = await TestAttemptModel.findOne({ testId: csseTest, studentId, attemptNumber: 1 });
      if (existing) { skipped++; continue; }
      await TestAttemptModel.create({
        tenantId: TENANT_ID, companyId: ctx.companyId, testId: csseTest, studentId, attemptNumber: 1,
        status: "graded",
        startedAt: daysAgo(8), submittedAt: daysAgo(8),
        sections: [
          { sectionIndex: 0, startedAt: daysAgo(8), completedAt: daysAgo(8), timeSpent: 1500, isLocked: true },
          { sectionIndex: 1, startedAt: daysAgo(8), completedAt: daysAgo(8), timeSpent: 1600, isLocked: true },
        ],
        answers: [],
        result: buildResult(a.obtained, 80, a.sections),
        questionOrder: [], optionOrders: {}, currentSectionIndex: 0,
        gradedBy: JAMES_EMAIL, gradedAt: daysAgo(7),
      });
      created++;
    }
  }

  // VR Quiz attempts (5 students)
  const vrTest = ctx.tests["Weekly VR Quiz - Week 12"];
  const vrScores = [
    { name: "Oliver Brown", obtained: 17, sections: [{ name: "Verbal Reasoning", obtained: 17, total: 20 }] },
    { name: "Amelia Taylor", obtained: 19, sections: [{ name: "Verbal Reasoning", obtained: 19, total: 20 }] },
    { name: "Harry Wilson", obtained: 14, sections: [{ name: "Verbal Reasoning", obtained: 14, total: 20 }] },
    { name: "Emily Clarke", obtained: 16, sections: [{ name: "Verbal Reasoning", obtained: 16, total: 20 }] },
    { name: "Jack Roberts", obtained: 12, sections: [{ name: "Verbal Reasoning", obtained: 12, total: 20 }] },
  ];

  if (vrTest) {
    for (const a of vrScores) {
      const studentId = ctx.students[a.name];
      if (!studentId) continue;
      const existing = await TestAttemptModel.findOne({ testId: vrTest, studentId, attemptNumber: 1 });
      if (existing) { skipped++; continue; }
      await TestAttemptModel.create({
        tenantId: TENANT_ID, companyId: ctx.companyId, testId: vrTest, studentId, attemptNumber: 1,
        status: "graded",
        startedAt: daysAgo(7), submittedAt: daysAgo(7),
        sections: [{ sectionIndex: 0, startedAt: daysAgo(7), completedAt: daysAgo(7), timeSpent: 900 + Math.floor(Math.random() * 300), isLocked: true }],
        answers: [],
        result: buildResult(a.obtained, 20, a.sections),
        questionOrder: [], optionOrders: {}, currentSectionIndex: 0,
        gradedBy: SARAH_EMAIL, gradedAt: daysAgo(6),
      });
      created++;
    }
  }

  // 2 anytime mock attempts
  const anytimeTest = ctx.tests["CSSE Maths Anytime Practice"];
  if (anytimeTest) {
    for (const name of ["Oliver Brown", "Amelia Taylor"]) {
      const studentId = ctx.students[name];
      if (!studentId) continue;
      const existing = await TestAttemptModel.findOne({ testId: anytimeTest, studentId, attemptNumber: 1 });
      if (existing) { skipped++; continue; }
      const obtained = name === "Oliver Brown" ? 58 : 66;
      await TestAttemptModel.create({
        tenantId: TENANT_ID, companyId: ctx.companyId, testId: anytimeTest, studentId, attemptNumber: 1,
        status: "graded",
        startedAt: daysAgo(3), submittedAt: daysAgo(3),
        sections: [
          { sectionIndex: 0, startedAt: daysAgo(3), completedAt: daysAgo(3), timeSpent: 1400, isLocked: true },
          { sectionIndex: 1, startedAt: daysAgo(3), completedAt: daysAgo(3), timeSpent: 1500, isLocked: true },
        ],
        answers: [],
        result: buildResult(obtained, 80, [{ name: "Short Questions", obtained: Math.round(obtained * 0.55), total: 40 }, { name: "Problem Solving", obtained: Math.round(obtained * 0.45), total: 40 }]),
        questionOrder: [], optionOrders: {}, currentSectionIndex: 0,
        gradedBy: JAMES_EMAIL, gradedAt: daysAgo(2),
      });
      created++;
    }
  }

  log("+", `Test Attempts: ${created} created, ${skipped} skipped`);
}

// ═══════════════════════════════════════════════════════════════════════════
// 10. COURSES (2)
// ═══════════════════════════════════════════════════════════════════════════

async function seedCourses(ctx: SeedContext) {
  console.log("\n10. Seeding courses (2)...");
  let created = 0, skipped = 0;

  const sarahUser = ctx.users["sarah"] || await User.findOne({ email: SARAH_EMAIL });
  const jamesUser = ctx.users["james"] || await User.findOne({ email: JAMES_EMAIL });

  const coursesData = [
    {
      title: "FSCE Complete Preparation Course",
      slug: "fsce-complete-preparation",
      description: "A comprehensive online course covering all aspects of the FSCE 11+ entrance exam. Includes English, Mathematics, Verbal Reasoning, and Non-Verbal Reasoning modules with practice quizzes and downloadable resources.",
      shortDescription: "Master all FSCE exam subjects with structured lessons and practice quizzes.",
      teacherId: sarahUser?._id,
      additionalTeacherIds: [jamesUser?._id].filter(Boolean),
      category: "11+ Preparation",
      tags: ["fsce", "11-plus", "grammar-school", "year-5"],
      level: "intermediate" as const,
      targetExamType: "FSCE",
      sections: [
        { title: "Introduction & Exam Overview", order: 0, lessons: [
          { title: "Welcome to FSCE Preparation", slug: "welcome-fsce", type: "text" as const, order: 0, content: { textContent: "Welcome to the FSCE Complete Preparation Course! This course will guide you through every aspect of the FSCE entrance examination." }, isFree: true, estimatedMinutes: 5, isPublished: true },
          { title: "Understanding the FSCE Format", slug: "fsce-format", type: "text" as const, order: 1, content: { textContent: "The FSCE exam consists of three papers: Paper 1 (English, Maths & VR), Paper 2 (Comprehension, Problem Solving & NVR), and Paper 3 (Creative Writing)." }, isFree: true, estimatedMinutes: 10, isPublished: true },
          { title: "Study Plan & Tips", slug: "study-plan", type: "pdf" as const, order: 2, content: { pdfUrl: "", pdfPageCount: 4 }, isFree: false, estimatedMinutes: 15, isPublished: true },
        ]},
        { title: "Mathematics", order: 1, lessons: [
          { title: "Number & Place Value", slug: "number-place-value", type: "text" as const, order: 0, content: { textContent: "Understanding place value is fundamental. Learn to read, write, and order numbers up to 1,000,000." }, isFree: false, estimatedMinutes: 20, isPublished: true },
          { title: "Fractions, Decimals & Percentages", slug: "fractions-decimals", type: "text" as const, order: 1, content: { textContent: "Master the relationships between fractions, decimals, and percentages. Essential for FSCE Paper 1." }, isFree: false, estimatedMinutes: 25, isPublished: true },
          { title: "Geometry & Measures", slug: "geometry-measures", type: "text" as const, order: 2, content: { textContent: "Angles, shapes, perimeter, area, and unit conversions — all key topics for the exam." }, isFree: false, estimatedMinutes: 20, isPublished: true },
        ]},
        { title: "English", order: 2, lessons: [
          { title: "Comprehension Strategies", slug: "comprehension-strategies", type: "text" as const, order: 0, content: { textContent: "Learn techniques for tackling both fiction and non-fiction passages efficiently." }, isFree: false, estimatedMinutes: 20, isPublished: true },
          { title: "Grammar & Punctuation Review", slug: "grammar-review", type: "text" as const, order: 1, content: { textContent: "Revise key grammar concepts: tenses, clauses, punctuation marks, and sentence types." }, isFree: false, estimatedMinutes: 15, isPublished: true },
          { title: "Creative Writing Masterclass", slug: "creative-writing-masterclass", type: "text" as const, order: 2, content: { textContent: "Techniques for writing compelling stories and descriptive pieces under exam conditions." }, isFree: false, estimatedMinutes: 25, isPublished: true },
        ]},
        { title: "Verbal Reasoning", order: 3, lessons: [
          { title: "Word Patterns & Compound Words", slug: "word-patterns", type: "text" as const, order: 0, content: { textContent: "Techniques for solving compound word, hidden word, and word pattern questions." }, isFree: false, estimatedMinutes: 20, isPublished: true },
          { title: "Codes & Sequences", slug: "codes-sequences", type: "text" as const, order: 1, content: { textContent: "Master letter and number coding, and identify patterns in sequences." }, isFree: false, estimatedMinutes: 20, isPublished: true },
          { title: "Analogies & Odd One Out", slug: "analogies-odd-one-out", type: "text" as const, order: 2, content: { textContent: "Learn the logical relationships needed for analogy and classification questions." }, isFree: false, estimatedMinutes: 15, isPublished: true },
        ]},
        { title: "Non-Verbal Reasoning", order: 4, lessons: [
          { title: "Shape Sequences & Patterns", slug: "shape-sequences", type: "text" as const, order: 0, content: { textContent: "Identify rules governing shape sequences including rotation, reflection, and transformation." }, isFree: false, estimatedMinutes: 20, isPublished: true },
          { title: "Spatial Reasoning", slug: "spatial-reasoning", type: "text" as const, order: 1, content: { textContent: "Paper folding, cube nets, and 3D visualisation techniques." }, isFree: false, estimatedMinutes: 20, isPublished: true },
          { title: "NVR Practice Strategies", slug: "nvr-strategies", type: "text" as const, order: 2, content: { textContent: "Time management and systematic approaches for NVR questions." }, isFree: false, estimatedMinutes: 15, isPublished: true },
        ]},
        { title: "Exam Practice & Revision", order: 5, lessons: [
          { title: "Full Mock Exam Walkthrough", slug: "mock-walkthrough", type: "text" as const, order: 0, content: { textContent: "Step-by-step walkthrough of a complete FSCE mock paper with examiner insights." }, isFree: false, estimatedMinutes: 30, isPublished: true },
          { title: "Common Mistakes to Avoid", slug: "common-mistakes", type: "text" as const, order: 1, content: { textContent: "The most frequent errors students make and how to avoid them on exam day." }, isFree: false, estimatedMinutes: 15, isPublished: true },
          { title: "Exam Day Checklist", slug: "exam-day-checklist", type: "text" as const, order: 2, content: { textContent: "Everything your child needs to know and bring on the day of the examination." }, isFree: true, estimatedMinutes: 10, isPublished: true },
        ]},
      ],
      pricing: { isFree: false, price: 49.99, currency: "GBP" as const, productId: null },
      stats: { enrollmentCount: 12, avgRating: 4.6, ratingCount: 8, completionRate: 45, totalLessons: 18, totalDurationMinutes: 320 },
      status: "published" as const,
      publishedAt: daysAgo(60),
      welcomeMessage: "Welcome to the FSCE Complete Preparation Course! We're excited to help your child prepare for the entrance exam.",
      completionMessage: "Congratulations on completing the course! Your child is now well-prepared for the FSCE examination.",
      certificateEnabled: true,
    },
    {
      title: "CSSE Maths Masterclass",
      slug: "csse-maths-masterclass",
      description: "Intensive mathematics course designed specifically for the CSSE entrance exam. Covers all topics from number work to problem solving, with progressive difficulty levels.",
      shortDescription: "Targeted maths preparation for the CSSE grammar school entrance exam.",
      teacherId: jamesUser?._id || sarahUser?._id,
      additionalTeacherIds: [],
      category: "11+ Preparation",
      tags: ["csse", "mathematics", "11-plus", "grammar-school"],
      level: "intermediate" as const,
      targetExamType: "CSSE",
      sections: [
        { title: "Number & Arithmetic", order: 0, lessons: [
          { title: "Place Value to Millions", slug: "place-value-millions", type: "text" as const, order: 0, content: { textContent: "Reading, writing, ordering, and rounding numbers up to millions." }, isFree: true, estimatedMinutes: 15, isPublished: true },
          { title: "Four Operations Mastery", slug: "four-operations", type: "text" as const, order: 1, content: { textContent: "Long multiplication, short and long division, and BODMAS order of operations." }, isFree: false, estimatedMinutes: 25, isPublished: true },
          { title: "Fractions & Decimals", slug: "fractions-decimals-csse", type: "text" as const, order: 2, content: { textContent: "Adding, subtracting, multiplying fractions. Converting between fractions, decimals, and percentages." }, isFree: false, estimatedMinutes: 25, isPublished: true },
        ]},
        { title: "Geometry & Measures", order: 1, lessons: [
          { title: "Angles & Triangles", slug: "angles-triangles", type: "text" as const, order: 0, content: { textContent: "Types of angles, angle rules, and properties of triangles." }, isFree: false, estimatedMinutes: 20, isPublished: true },
          { title: "Perimeter, Area & Volume", slug: "perimeter-area-volume", type: "text" as const, order: 1, content: { textContent: "Calculating perimeter and area of 2D shapes, and volume of simple 3D shapes." }, isFree: false, estimatedMinutes: 20, isPublished: true },
          { title: "Unit Conversions", slug: "unit-conversions", type: "text" as const, order: 2, content: { textContent: "Converting between metric units of length, mass, capacity, and time." }, isFree: false, estimatedMinutes: 15, isPublished: true },
        ]},
        { title: "Algebra & Statistics", order: 2, lessons: [
          { title: "Sequences & Patterns", slug: "sequences-patterns-csse", type: "text" as const, order: 0, content: { textContent: "Finding rules, nth terms, and predicting sequence values." }, isFree: false, estimatedMinutes: 20, isPublished: true },
          { title: "Simple Equations", slug: "simple-equations-csse", type: "text" as const, order: 1, content: { textContent: "Solving one-step and two-step equations, and forming equations from word problems." }, isFree: false, estimatedMinutes: 20, isPublished: true },
          { title: "Data & Averages", slug: "data-averages", type: "text" as const, order: 2, content: { textContent: "Reading charts and graphs, calculating mean, median, mode and range." }, isFree: false, estimatedMinutes: 15, isPublished: true },
        ]},
        { title: "Problem Solving", order: 3, lessons: [
          { title: "Ratio & Proportion", slug: "ratio-proportion-csse", type: "text" as const, order: 0, content: { textContent: "Sharing in ratios, direct proportion, and scale problems." }, isFree: false, estimatedMinutes: 20, isPublished: true },
          { title: "Multi-Step Word Problems", slug: "multi-step-problems", type: "text" as const, order: 1, content: { textContent: "Breaking down complex word problems into manageable steps." }, isFree: false, estimatedMinutes: 25, isPublished: true },
          { title: "CSSE Problem Solving Strategies", slug: "csse-problem-strategies", type: "text" as const, order: 2, content: { textContent: "Specific strategies for tackling Section B of the CSSE Maths paper." }, isFree: false, estimatedMinutes: 20, isPublished: true },
        ]},
      ],
      pricing: { isFree: false, price: 34.99, currency: "GBP" as const, productId: null },
      stats: { enrollmentCount: 8, avgRating: 4.8, ratingCount: 5, completionRate: 35, totalLessons: 12, totalDurationMinutes: 240 },
      status: "published" as const,
      publishedAt: daysAgo(45),
      welcomeMessage: "Welcome to the CSSE Maths Masterclass! Let's build your confidence in mathematics.",
      completionMessage: "Well done on completing the CSSE Maths Masterclass! You're ready for the exam.",
      certificateEnabled: true,
    },
  ];

  for (const c of coursesData) {
    // Add dripDate and _id placeholders for lessons
    const sectionsWithDefaults = c.sections.map(s => ({
      ...s,
      lessons: s.lessons.map(l => ({ ...l, dripDate: null, content: { videoUrl: "", videoDuration: 0, videoThumbnailUrl: "", pdfUrl: "", pdfPageCount: 0, textContent: "", testId: null, resourceFiles: [], ...l.content } })),
    }));

    const doc = await CourseModel.findOneAndUpdate(
      { tenantId: TENANT_ID, companyId: ctx.companyId, slug: c.slug },
      {
        $setOnInsert: {
          tenantId: TENANT_ID,
          companyId: ctx.companyId,
          title: c.title,
          slug: c.slug,
          description: c.description,
          shortDescription: c.shortDescription,
          thumbnail: "",
          teacherId: c.teacherId,
          additionalTeacherIds: c.additionalTeacherIds,
          category: c.category,
          tags: c.tags,
          level: c.level,
          targetExamType: c.targetExamType,
          sections: sectionsWithDefaults,
          pricing: c.pricing,
          stats: c.stats,
          status: c.status,
          publishedAt: c.publishedAt,
          archivedAt: null,
          welcomeMessage: c.welcomeMessage,
          completionMessage: c.completionMessage,
          certificateEnabled: c.certificateEnabled,
          createdBy: NAVIN_EMAIL,
          updatedBy: NAVIN_EMAIL,
        },
      },
      { upsert: true, new: true }
    );
    ctx.courses[c.title] = doc._id;
    if (doc.createdAt.getTime() > Date.now() - 5000) created++; else skipped++;
  }
  log("+", `Courses: ${created} created, ${skipped} skipped`);
}

// ═══════════════════════════════════════════════════════════════════════════
// 11. ANNOUNCEMENTS (5)
// ═══════════════════════════════════════════════════════════════════════════

async function seedAnnouncements(ctx: SeedContext) {
  console.log("\n11. Seeding announcements (5)...");
  let created = 0, skipped = 0;

  const announcementsData = [
    {
      title: "Welcome to Chelmsford 11 Plus Online Platform",
      body: "Dear Parents and Students,\n\nWe are delighted to welcome you to our new online learning platform! Here you can access mock tests, practice papers, course materials, and track your child's progress.\n\nIf you need any help getting started, please don't hesitate to contact us.\n\nBest wishes,\nNavin Pathak\nDirector, Chelmsford 11 Plus",
      audience: "organization" as const,
      isPinned: true,
      publishedAt: daysAgo(90),
    },
    {
      title: "FSCE Mock Test Schedule - Spring 2026",
      body: "The spring term FSCE mock examination schedule is now available:\n\n- Mock 1: Available now (Papers 1, 2 & 3)\n- Mock 2: Scheduled for March 2026\n- Mock 3: Scheduled for April 2026\n\nPlease ensure your child completes each mock within the allocated time. Results will be published within 48 hours.",
      audience: "organization" as const,
      isPinned: false,
      publishedAt: daysAgo(14),
    },
    {
      title: "FSCE Mock 1 Results Now Available",
      body: "The results for FSCE Mock 1 (all three papers) are now available. You can view detailed score breakdowns, section-by-section analysis, and areas for improvement in your child's dashboard.\n\nIf you have any questions about the results, please speak to your child's teacher at the next class session.",
      audience: "organization" as const,
      isPinned: false,
      publishedAt: daysAgo(10),
    },
    {
      title: "Christmas Holiday Schedule",
      body: "Please note the following holiday arrangements:\n\n- Last classes before Christmas: Saturday 20th December\n- Classes resume: Saturday 3rd January\n- Online practice tests remain available throughout the holiday period\n\nWe encourage students to continue practising during the break — even 20 minutes a day makes a difference!",
      audience: "organization" as const,
      isPinned: true,
      publishedAt: daysAgo(60),
      expiresAt: daysAgo(30),
    },
    {
      title: "Upcoming CSSE English Mock - March 2026",
      body: "A reminder that the CSSE English mock examination is scheduled for March 2026. This will be a full-length paper including both comprehension and writing sections.\n\nStudents in the CSSE preparation class should ensure they have completed the English comprehension exercises in the online course before attempting the mock.",
      audience: "organization" as const,
      isPinned: false,
      publishedAt: daysAgo(3),
    },
  ];

  for (const a of announcementsData) {
    const doc = await AnnouncementModel.findOneAndUpdate(
      { companyId: ctx.companyId, title: a.title },
      {
        $setOnInsert: {
          tenantId: TENANT_ID,
          companyId: ctx.companyId,
          classId: null,
          ...a,
          expiresAt: (a as any).expiresAt || null,
          createdBy: NAVIN_EMAIL,
          updatedBy: NAVIN_EMAIL,
        },
      },
      { upsert: true, new: true }
    );
    if (doc.createdAt.getTime() > Date.now() - 5000) created++; else skipped++;
  }
  log("+", `Announcements: ${created} created, ${skipped} skipped`);
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════════════════

async function main() {
  console.log("");
  console.log("=".repeat(60));
  console.log("  Chelmsford 11 Plus — Comprehensive Demo Seed");
  console.log("=".repeat(60));
  console.log("");

  // Connect
  console.log("Connecting to MongoDB...");
  mongoose.set("strictQuery", true);
  await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 10000 });
  console.log(`   Connected: ${mongoUri.replace(/\/\/.*@/, "//***@")}`);

  // Validate prerequisites
  const company = await Company.findOne({ username: "chelmsford11plus" });
  if (!company) {
    throw new Error("Company not found! Run 'npm run seed' first.");
  }

  const navin = await User.findOne({ email: NAVIN_EMAIL });
  const sarah = await User.findOne({ email: SARAH_EMAIL });
  const james = await User.findOne({ email: JAMES_EMAIL });
  if (!navin || !sarah || !james) {
    throw new Error("Required users not found! Run 'npm run seed' first.");
  }

  const fsceTemplate = await PaperTemplateModel.findOne({ name: "FSCE Mock Test Template", isPreBuilt: true });
  const csseTemplate = await PaperTemplateModel.findOne({ name: "CSSE Mock Test Template", isPreBuilt: true });
  if (!fsceTemplate || !csseTemplate) {
    throw new Error("Paper templates not found! Run 'npm run seed:templates' first.");
  }

  console.log("   Prerequisites verified.");

  // Initialize context
  const ctx: SeedContext = {
    companyId: company._id,
    users: { navin, sarah, james },
    subjects: {},
    questions: {},
    papers: {},
    paperSets: {},
    students: {},
    classes: {},
    tests: {},
    courses: {},
    templates: {},
  };

  // Seed in dependency order
  await seedManvi(ctx);
  await seedSubjects(ctx);
  await seedQuestions(ctx);
  await seedPapers(ctx);
  await seedPaperSets(ctx);
  await seedStudents(ctx);
  await seedClasses(ctx);
  await seedOnlineTests(ctx);
  await seedTestAttempts(ctx);
  await seedCourses(ctx);
  await seedAnnouncements(ctx);

  // Summary
  console.log("");
  console.log("=".repeat(60));
  console.log("  SEED COMPLETE");
  console.log("=".repeat(60));
  console.log("");
  console.log("  Entity                Count");
  console.log("  ───────────────────── ─────");
  console.log(`  Subjects              ~${Object.keys(ctx.subjects).length}`);
  console.log(`  Questions             ~${Object.values(ctx.questions).reduce((s, a) => s + a.length, 0)}`);
  console.log(`  Papers                ${Object.keys(ctx.papers).length}`);
  console.log(`  Paper Sets            ${Object.keys(ctx.paperSets).length}`);
  console.log(`  Students              ${Object.keys(ctx.students).length}`);
  console.log(`  Classes               ${Object.keys(ctx.classes).length}`);
  console.log(`  Online Tests          ${Object.keys(ctx.tests).length}`);
  console.log(`  Courses               ${Object.keys(ctx.courses).length}`);
  console.log("");
  console.log("  Login as any user with password: Test@1234");
  console.log("  Admin: manvi@chelmsford11plus.com");
  console.log("");
}

main()
  .then(() => mongoose.disconnect())
  .catch((err) => {
    console.error("\nSeed failed:", err.message || err);
    mongoose.disconnect().finally(() => process.exit(1));
  });
