import mongoose, { Types } from "mongoose";
import { TestAttemptModel } from "../models/testAttempt";
import { StudentAnalyticsSnapshotModel } from "../models/studentAnalyticsSnapshot";
import { logger } from "../shared/logger";

const OnlineTest =
  mongoose.models.OnlineTest ||
  mongoose.model("OnlineTest", new mongoose.Schema({}, { strict: false }));
const Company =
  mongoose.models.Company ||
  mongoose.model("Company", new mongoose.Schema({}, { strict: false }));

function toObjectId(id: string): Types.ObjectId {
  return new Types.ObjectId(id);
}

// ─── Default configuration ──────────────────────────────────────────────────

const DEFAULT_BAND_THRESHOLDS = {
  strongPass: 85,
  pass: 70,
  borderline: 60,
};

const DEFAULT_COMPONENT_MAPPINGS: Record<string, string> = {
  // English
  Comprehension: "English",
  "English Comprehension": "English",
  Reading: "English",
  Grammar: "English",
  "Creative Writing": "English",
  Writing: "English",
  English: "English",
  // Mathematics
  Mathematics: "Mathematics",
  Maths: "Mathematics",
  Arithmetic: "Mathematics",
  "Problem Solving": "Mathematics",
  "Data Interpretation": "Mathematics",
  // Verbal Reasoning
  Antonyms: "Verbal Reasoning",
  Synonyms: "Verbal Reasoning",
  "Missing Letters": "Verbal Reasoning",
  "Verbal Reasoning": "Verbal Reasoning",
  "Word Definition": "Verbal Reasoning",
  Vocabulary: "Verbal Reasoning",
  // Non-Verbal Reasoning
  "Non-Verbal Reasoning": "Non-Verbal Reasoning",
  NVR: "Non-Verbal Reasoning",
  Patterns: "Non-Verbal Reasoning",
};

// ─── computeQualificationBand ───────────────────────────────────────────────

export async function computeQualificationBand(
  studentUserId: string,
  companyId: string
): Promise<{
  band: string | null;
  avgScore: number;
  confidence: string;
  testCount: number;
}> {
  const companyOid = toObjectId(companyId);
  const studentOid = toObjectId(studentUserId);

  // Fetch last 3 mock test results
  const mockAttempts = await TestAttemptModel.find({
    companyId: companyOid,
    studentId: studentOid,
    status: { $in: ["submitted", "auto_submitted", "graded"] },
    result: { $ne: null },
  })
    .sort({ submittedAt: -1 })
    .limit(10)
    .lean();

  // Filter to mock modes only
  const testIds = [...new Set(mockAttempts.map((a) => a.testId.toString()))];
  const tests = await OnlineTest.find({
    _id: { $in: testIds.map(toObjectId) },
    mode: { $in: ["live_mock", "anytime_mock"] },
  })
    .select("_id mode")
    .lean();
  const mockTestIds = new Set(
    (tests as Array<Record<string, unknown>>).map((t) =>
      (t._id as Types.ObjectId).toString()
    )
  );

  const mockResults = mockAttempts
    .filter((a) => mockTestIds.has(a.testId.toString()))
    .slice(0, 3);

  if (mockResults.length === 0) {
    return { band: null, avgScore: 0, confidence: "none", testCount: 0 };
  }

  const percentages = mockResults.map(
    (a) => (a.result as Record<string, unknown>)?.percentage as number || 0
  );
  const avgScore =
    Math.round(
      (percentages.reduce((a, b) => a + b, 0) / percentages.length) * 10
    ) / 10;

  // Get thresholds
  const thresholds = await getQualificationBandConfig(companyId);

  let band: string;
  if (avgScore >= thresholds.strongPass) band = "Strong Pass";
  else if (avgScore >= thresholds.pass) band = "Pass";
  else if (avgScore >= thresholds.borderline) band = "Borderline";
  else band = "Below";

  const confidence =
    mockResults.length >= 3
      ? "high"
      : mockResults.length >= 2
        ? "medium"
        : "low";

  return { band, avgScore, confidence, testCount: mockResults.length };
}

// ─── computeComponentScores ─────────────────────────────────────────────────

export async function computeComponentScores(
  studentUserId: string,
  companyId: string
): Promise<
  Array<{
    component: string;
    avgPercentage: number;
    testCount: number;
    trend: number;
    sections: Array<{ sectionName: string; avgPercentage: number }>;
  }>
> {
  const companyOid = toObjectId(companyId);
  const studentOid = toObjectId(studentUserId);

  // Fetch mock test attempts with section scores
  const attempts = await TestAttemptModel.find({
    companyId: companyOid,
    studentId: studentOid,
    status: { $in: ["submitted", "auto_submitted", "graded"] },
    result: { $ne: null },
  })
    .sort({ submittedAt: 1 })
    .lean();

  // Get component mappings
  const mappings = await getComponentMappings(companyId);

  // Aggregate by component
  interface ComponentEntry {
    percentages: number[];
    sections: Map<string, number[]>;
  }
  const componentData = new Map<string, ComponentEntry>();

  for (const attempt of attempts) {
    const result = attempt.result as Record<string, unknown>;
    const sectionScores =
      (result?.sectionScores as Array<Record<string, unknown>>) || [];

    for (const ss of sectionScores) {
      const sectionName = (ss.sectionName as string) || "";
      const component = mappings[sectionName] || null;
      if (!component) continue;

      const pct = (ss.percentage as number) || 0;
      const existing: ComponentEntry = componentData.get(component) || {
        percentages: [] as number[],
        sections: new Map<string, number[]>(),
      };
      existing.percentages.push(pct);

      const sectionPcts = existing.sections.get(sectionName) || [];
      sectionPcts.push(pct);
      existing.sections.set(sectionName, sectionPcts);

      componentData.set(component, existing);
    }
  }

  return [...componentData.entries()].map(([component, data]) => {
    const avg =
      data.percentages.length > 0
        ? Math.round(
            (data.percentages.reduce((a, b) => a + b, 0) /
              data.percentages.length) *
              10
          ) / 10
        : 0;

    // Trend: compare first half to second half
    const mid = Math.ceil(data.percentages.length / 2);
    const firstHalf = data.percentages.slice(0, mid);
    const secondHalf = data.percentages.slice(mid);
    const avgFirst =
      firstHalf.length > 0
        ? firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length
        : 0;
    const avgSecond =
      secondHalf.length > 0
        ? secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length
        : 0;
    const trend = Math.round((avgSecond - avgFirst) * 10) / 10;

    const sections = [...data.sections.entries()].map(([name, pcts]) => ({
      sectionName: name,
      avgPercentage:
        pcts.length > 0
          ? Math.round(
              (pcts.reduce((a, b) => a + b, 0) / pcts.length) * 10
            ) / 10
          : 0,
    }));

    return {
      component,
      avgPercentage: avg,
      testCount: data.percentages.length,
      trend,
      sections,
    };
  });
}

// ─── computeCohortPercentile ────────────────────────────────────────────────

export async function computeCohortPercentile(
  studentUserId: string,
  companyId: string
): Promise<{ percentile: number; cohortSize: number }> {
  const companyOid = toObjectId(companyId);
  const studentOid = toObjectId(studentUserId);

  // Find all students in org with >= 2 mock tests
  const allStudentAttempts = await TestAttemptModel.aggregate([
    {
      $match: {
        companyId: companyOid,
        status: { $in: ["submitted", "auto_submitted", "graded"] },
        result: { $ne: null },
      },
    },
    {
      $group: {
        _id: "$studentId",
        avgPercentage: { $avg: "$result.percentage" },
        testCount: { $sum: 1 },
      },
    },
    { $match: { testCount: { $gte: 2 } } },
  ]);

  const cohortSize = allStudentAttempts.length;
  if (cohortSize === 0) return { percentile: 0, cohortSize: 0 };

  const studentData = allStudentAttempts.find(
    (s: Record<string, unknown>) =>
      (s._id as Types.ObjectId).toString() === studentUserId
  );
  if (!studentData) return { percentile: 0, cohortSize };

  const studentAvg = (studentData as Record<string, unknown>)
    .avgPercentage as number;
  const allAvgs = allStudentAttempts.map(
    (s: Record<string, unknown>) => s.avgPercentage as number
  );
  const below = allAvgs.filter((a) => a < studentAvg).length;
  const percentile = Math.round((below / cohortSize) * 100);

  return { percentile, cohortSize };
}

// ─── getQualificationBandConfig ─────────────────────────────────────────────

export async function getQualificationBandConfig(
  companyId: string
): Promise<{ strongPass: number; pass: number; borderline: number }> {
  const company = await Company.findById(toObjectId(companyId))
    .select("elevenPlusConfig")
    .lean();

  const config = (company as Record<string, unknown>)
    ?.elevenPlusConfig as Record<string, unknown> | undefined;

  return {
    strongPass:
      (config?.strongPassThreshold as number) ||
      DEFAULT_BAND_THRESHOLDS.strongPass,
    pass:
      (config?.passThreshold as number) || DEFAULT_BAND_THRESHOLDS.pass,
    borderline:
      (config?.borderlineThreshold as number) ||
      DEFAULT_BAND_THRESHOLDS.borderline,
  };
}

// ─── updateQualificationBandConfig ──────────────────────────────────────────

export async function updateQualificationBandConfig(
  companyId: string,
  thresholds: { strongPass?: number; pass?: number; borderline?: number },
  updaterEmail: string
): Promise<{ strongPass: number; pass: number; borderline: number }> {
  const current = await getQualificationBandConfig(companyId);
  const updated = {
    strongPassThreshold: thresholds.strongPass ?? current.strongPass,
    passThreshold: thresholds.pass ?? current.pass,
    borderlineThreshold: thresholds.borderline ?? current.borderline,
    updatedBy: updaterEmail,
    updatedAt: new Date(),
  };

  await Company.findByIdAndUpdate(toObjectId(companyId), {
    elevenPlusConfig: updated,
  });

  logger.info({
    msg: "11+ band thresholds updated",
    companyId,
    thresholds: updated,
    updatedBy: updaterEmail,
  });

  return {
    strongPass: updated.strongPassThreshold,
    pass: updated.passThreshold,
    borderline: updated.borderlineThreshold,
  };
}

// ─── getComponentMappings ───────────────────────────────────────────────────

async function getComponentMappings(
  companyId: string
): Promise<Record<string, string>> {
  const company = await Company.findById(toObjectId(companyId))
    .select("elevenPlusConfig")
    .lean();

  const config = (company as Record<string, unknown>)
    ?.elevenPlusConfig as Record<string, unknown> | undefined;
  const customMappings = config?.componentMappings as
    | Record<string, string>
    | undefined;

  return customMappings || DEFAULT_COMPONENT_MAPPINGS;
}
