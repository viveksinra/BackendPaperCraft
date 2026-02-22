import mongoose, { Types } from "mongoose";
import { CourseModel } from "../models/course";
import { CourseEnrollmentModel, CourseEnrollmentDocument } from "../models/courseEnrollment";
import { logger } from "../shared/logger";

const Purchase =
  mongoose.models.Purchase ||
  mongoose.model("Purchase", new mongoose.Schema({}, { strict: false }));

// ─── Helpers ───────────────────────────────────────────────────────────────

function toObjectId(id: string): Types.ObjectId {
  if (!Types.ObjectId.isValid(id)) {
    throw Object.assign(new Error("Invalid ObjectId"), { status: 400 });
  }
  return new Types.ObjectId(id);
}

// ─── 1. Enroll Student ─────────────────────────────────────────────────────

export async function enrollStudent(data: {
  tenantId: string;
  companyId: string;
  courseId: string;
  studentUserId: string;
  enrolledByUserId: string;
  purchaseId?: string;
}): Promise<CourseEnrollmentDocument> {
  const companyOid = toObjectId(data.companyId);
  const courseOid = toObjectId(data.courseId);
  const studentOid = toObjectId(data.studentUserId);
  const enrolledByOid = toObjectId(data.enrolledByUserId);

  // Validate course is published
  const course = await CourseModel.findOne({
    _id: courseOid,
    tenantId: data.tenantId,
    companyId: companyOid,
  });
  if (!course) {
    throw Object.assign(new Error("Course not found"), { status: 404 });
  }
  if (course.status !== "published") {
    throw Object.assign(new Error("Cannot enroll in unpublished course"), { status: 400 });
  }

  // Validate purchase for paid courses
  if (!course.pricing.isFree) {
    if (!data.purchaseId) {
      throw Object.assign(new Error("Purchase required for paid course"), { status: 402 });
    }
    const purchase = await Purchase.findOne({
      _id: toObjectId(data.purchaseId),
      studentUserId: studentOid,
      status: "completed",
    });
    if (!purchase) {
      throw Object.assign(new Error("Valid purchase not found"), { status: 402 });
    }
  }

  // Determine first lesson for current position
  let currentSectionId: Types.ObjectId | null = null;
  let currentLessonId: Types.ObjectId | null = null;
  if (course.sections.length > 0) {
    const firstSection = course.sections.sort((a, b) => a.order - b.order)[0];
    currentSectionId = firstSection._id;
    if (firstSection.lessons.length > 0) {
      currentLessonId = firstSection.lessons.sort((a, b) => a.order - b.order)[0]._id;
    }
  }

  const enrollment = await CourseEnrollmentModel.create({
    tenantId: data.tenantId,
    companyId: companyOid,
    courseId: courseOid,
    studentUserId: studentOid,
    enrolledByUserId: enrolledByOid,
    purchaseId: data.purchaseId ? toObjectId(data.purchaseId) : null,
    status: "active",
    progress: {
      completedLessons: [],
      currentSectionId,
      currentLessonId,
      percentComplete: 0,
      lastAccessedAt: new Date(),
      totalTimeSpentSeconds: 0,
    },
    enrolledAt: new Date(),
  });

  // Increment enrollment count atomically
  await CourseModel.updateOne(
    { _id: courseOid },
    { $inc: { "stats.enrollmentCount": 1 } }
  );

  // Queue welcome email (fire-and-forget)
  try {
    const { addNotificationJob } = await import("../queue/queues");
    await addNotificationJob({
      type: "course_enrollment_welcome",
      courseId: data.courseId,
      studentUserId: data.studentUserId,
      companyId: data.companyId,
    });
  } catch (err) {
    logger.warn({ msg: "Failed to queue enrollment welcome", error: (err as Error).message });
  }

  logger.info({
    msg: "Student enrolled",
    courseId: data.courseId,
    studentUserId: data.studentUserId,
  });

  return enrollment;
}

// ─── 2. Is Enrolled ────────────────────────────────────────────────────────

export async function isEnrolled(
  tenantId: string,
  companyId: string,
  courseId: string,
  studentUserId: string
): Promise<boolean> {
  const count = await CourseEnrollmentModel.countDocuments({
    tenantId,
    companyId: toObjectId(companyId),
    courseId: toObjectId(courseId),
    studentUserId: toObjectId(studentUserId),
    status: { $in: ["active", "completed"] },
  });
  return count > 0;
}

// ─── 3. Get Enrollment ─────────────────────────────────────────────────────

export async function getEnrollment(
  tenantId: string,
  companyId: string,
  courseId: string,
  studentUserId: string
): Promise<CourseEnrollmentDocument | null> {
  return CourseEnrollmentModel.findOne({
    tenantId,
    companyId: toObjectId(companyId),
    courseId: toObjectId(courseId),
    studentUserId: toObjectId(studentUserId),
  });
}

// ─── 4. Get Student Enrollments ────────────────────────────────────────────

export async function getStudentEnrollments(
  tenantId: string,
  companyId: string,
  studentUserId: string,
  params: { status?: string; page?: number; pageSize?: number }
): Promise<{ enrollments: CourseEnrollmentDocument[]; total: number; page: number; pageSize: number }> {
  const query: Record<string, unknown> = {
    tenantId,
    companyId: toObjectId(companyId),
    studentUserId: toObjectId(studentUserId),
  };
  if (params.status) query.status = params.status;

  const page = params.page || 1;
  const pageSize = params.pageSize || 20;
  const skip = (page - 1) * pageSize;

  const [enrollments, total] = await Promise.all([
    CourseEnrollmentModel.find(query)
      .sort({ enrolledAt: -1 })
      .skip(skip)
      .limit(pageSize)
      .lean(),
    CourseEnrollmentModel.countDocuments(query),
  ]);

  return {
    enrollments: enrollments as unknown as CourseEnrollmentDocument[],
    total,
    page,
    pageSize,
  };
}

// ─── 5. Get Course Enrollments ─────────────────────────────────────────────

export async function getCourseEnrollments(
  tenantId: string,
  companyId: string,
  courseId: string,
  params: { search?: string; status?: string; sortBy?: string; page?: number; pageSize?: number }
): Promise<{ enrollments: CourseEnrollmentDocument[]; total: number; page: number; pageSize: number }> {
  const query: Record<string, unknown> = {
    tenantId,
    companyId: toObjectId(companyId),
    courseId: toObjectId(courseId),
  };
  if (params.status) query.status = params.status;

  const page = params.page || 1;
  const pageSize = params.pageSize || 20;
  const skip = (page - 1) * pageSize;

  let sort: Record<string, 1 | -1> = { enrolledAt: -1 };
  if (params.sortBy === "progress") sort = { "progress.percentComplete": -1 };
  if (params.sortBy === "lastActivity") sort = { "progress.lastAccessedAt": -1 };

  const [enrollments, total] = await Promise.all([
    CourseEnrollmentModel.find(query)
      .sort(sort)
      .skip(skip)
      .limit(pageSize)
      .lean(),
    CourseEnrollmentModel.countDocuments(query),
  ]);

  return {
    enrollments: enrollments as unknown as CourseEnrollmentDocument[],
    total,
    page,
    pageSize,
  };
}

// ─── 6. Drop Enrollment ────────────────────────────────────────────────────

export async function dropEnrollment(
  tenantId: string,
  companyId: string,
  courseId: string,
  studentUserId: string
): Promise<CourseEnrollmentDocument> {
  const enrollment = await CourseEnrollmentModel.findOne({
    tenantId,
    companyId: toObjectId(companyId),
    courseId: toObjectId(courseId),
    studentUserId: toObjectId(studentUserId),
    status: "active",
  });
  if (!enrollment) {
    throw Object.assign(new Error("Active enrollment not found"), { status: 404 });
  }

  enrollment.status = "dropped";
  enrollment.droppedAt = new Date();
  await enrollment.save();

  // Decrement enrollment count
  await CourseModel.updateOne(
    { _id: toObjectId(courseId) },
    { $inc: { "stats.enrollmentCount": -1 } }
  );

  logger.info({ msg: "Enrollment dropped", courseId, studentUserId });
  return enrollment;
}
