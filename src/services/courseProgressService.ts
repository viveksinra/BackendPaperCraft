import { Types } from "mongoose";
import { CourseModel, CourseDocument } from "../models/course";
import { CourseEnrollmentModel, CourseEnrollmentDocument } from "../models/courseEnrollment";
import { logger } from "../shared/logger";

// ─── Helpers ───────────────────────────────────────────────────────────────

function toObjectId(id: string): Types.ObjectId {
  if (!Types.ObjectId.isValid(id)) {
    throw Object.assign(new Error("Invalid ObjectId"), { status: 400 });
  }
  return new Types.ObjectId(id);
}

async function getActiveEnrollment(
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
  return enrollment;
}

function getTotalLessons(course: CourseDocument): number {
  let total = 0;
  for (const section of course.sections) {
    total += section.lessons.length;
  }
  return total;
}

// ─── 1. Mark Lesson Complete ───────────────────────────────────────────────

export async function markLessonComplete(data: {
  tenantId: string;
  companyId: string;
  courseId: string;
  studentUserId: string;
  lessonId: string;
  sectionId: string;
  quizScore?: number;
}): Promise<CourseEnrollmentDocument> {
  const enrollment = await getActiveEnrollment(
    data.tenantId, data.companyId, data.courseId, data.studentUserId
  );

  const course = await CourseModel.findById(toObjectId(data.courseId));
  if (!course) throw Object.assign(new Error("Course not found"), { status: 404 });

  // Validate lesson exists
  const section = course.sections.find((s) => String(s._id) === data.sectionId);
  if (!section) throw Object.assign(new Error("Section not found"), { status: 404 });
  const lesson = section.lessons.find((l) => String(l._id) === data.lessonId);
  if (!lesson) throw Object.assign(new Error("Lesson not found"), { status: 404 });

  // Check drip date
  if (lesson.dripDate && new Date(lesson.dripDate) > new Date()) {
    throw Object.assign(new Error("Lesson is not yet available"), { status: 403 });
  }

  // Idempotent: skip if already completed
  const alreadyCompleted = enrollment.progress.completedLessons.some(
    (cl) => String(cl.lessonId) === data.lessonId
  );
  if (alreadyCompleted) {
    return enrollment;
  }

  enrollment.progress.completedLessons.push({
    lessonId: toObjectId(data.lessonId),
    sectionId: toObjectId(data.sectionId),
    completedAt: new Date(),
    timeSpentSeconds: 0,
    quizScore: data.quizScore ?? null,
  });

  // Recalculate percent
  const totalLessons = getTotalLessons(course);
  enrollment.progress.percentComplete = totalLessons > 0
    ? Math.round((enrollment.progress.completedLessons.length / totalLessons) * 100)
    : 0;

  enrollment.progress.lastAccessedAt = new Date();
  await enrollment.save();

  // Phase 9: Queue gamification event for lesson completion
  try {
    const { addGamificationEventJob } = await import("../queue/queues");
    await addGamificationEventJob({
      tenantId: data.tenantId,
      companyId: data.companyId,
      studentUserId: data.studentUserId,
      action: "lesson_completed",
      description: `Lesson completed in course`,
      referenceType: "course",
      referenceId: data.courseId,
    });
  } catch (err) {
    logger.warn({ msg: "Failed to queue gamification event for lesson completion", error: (err as Error).message });
  }

  // Check for 100% completion
  if (enrollment.progress.percentComplete >= 100) {
    await handleCourseCompletion(enrollment, course);
  }

  return enrollment;
}

// ─── 2. Mark Lesson Incomplete ─────────────────────────────────────────────

export async function markLessonIncomplete(data: {
  tenantId: string;
  companyId: string;
  courseId: string;
  studentUserId: string;
  lessonId: string;
}): Promise<CourseEnrollmentDocument> {
  const enrollment = await getActiveEnrollment(
    data.tenantId, data.companyId, data.courseId, data.studentUserId
  );

  // Cannot un-complete if certificate already issued
  if (enrollment.certificate.issued) {
    throw Object.assign(new Error("Cannot un-complete lesson after certificate is issued"), { status: 400 });
  }

  const idx = enrollment.progress.completedLessons.findIndex(
    (cl) => String(cl.lessonId) === data.lessonId
  );
  if (idx === -1) return enrollment;

  enrollment.progress.completedLessons.splice(idx, 1);

  // Recalculate percent
  const course = await CourseModel.findById(toObjectId(data.courseId));
  const totalLessons = course ? getTotalLessons(course) : 0;
  enrollment.progress.percentComplete = totalLessons > 0
    ? Math.round((enrollment.progress.completedLessons.length / totalLessons) * 100)
    : 0;

  await enrollment.save();
  return enrollment;
}

// ─── 3. Update Current Lesson ──────────────────────────────────────────────

export async function updateCurrentLesson(data: {
  tenantId: string;
  companyId: string;
  courseId: string;
  studentUserId: string;
  sectionId: string;
  lessonId: string;
}): Promise<CourseEnrollmentDocument> {
  const enrollment = await getActiveEnrollment(
    data.tenantId, data.companyId, data.courseId, data.studentUserId
  );

  enrollment.progress.currentSectionId = toObjectId(data.sectionId);
  enrollment.progress.currentLessonId = toObjectId(data.lessonId);
  enrollment.progress.lastAccessedAt = new Date();
  await enrollment.save();
  return enrollment;
}

// ─── 4. Track Time Spent ───────────────────────────────────────────────────

export async function trackTimeSpent(data: {
  tenantId: string;
  companyId: string;
  courseId: string;
  studentUserId: string;
  lessonId: string;
  additionalSeconds: number;
}): Promise<CourseEnrollmentDocument> {
  const enrollment = await getActiveEnrollment(
    data.tenantId, data.companyId, data.courseId, data.studentUserId
  );

  enrollment.progress.totalTimeSpentSeconds += data.additionalSeconds;

  // Also update per-lesson time if the lesson is in completedLessons
  const lessonProgress = enrollment.progress.completedLessons.find(
    (cl) => String(cl.lessonId) === data.lessonId
  );
  if (lessonProgress) {
    lessonProgress.timeSpentSeconds += data.additionalSeconds;
  }

  enrollment.progress.lastAccessedAt = new Date();
  await enrollment.save();
  return enrollment;
}

// ─── 5. Handle Course Completion ───────────────────────────────────────────

async function handleCourseCompletion(
  enrollment: CourseEnrollmentDocument,
  course: CourseDocument
): Promise<void> {
  if (enrollment.status === "completed") return;

  enrollment.status = "completed";
  enrollment.completedAt = new Date();
  await enrollment.save();

  // Update completion rate on course
  const [total, completed] = await Promise.all([
    CourseEnrollmentModel.countDocuments({ courseId: course._id }),
    CourseEnrollmentModel.countDocuments({ courseId: course._id, status: "completed" }),
  ]);
  const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;
  await CourseModel.updateOne(
    { _id: course._id },
    { $set: { "stats.completionRate": completionRate } }
  );

  // Queue certificate generation if enabled
  if (course.certificateEnabled) {
    try {
      const { addCertificateGenerationJob } = await import("../queue/queues");
      await addCertificateGenerationJob({
        tenantId: enrollment.tenantId,
        companyId: enrollment.companyId.toString(),
        courseId: String(course._id),
        studentUserId: enrollment.studentUserId.toString(),
        enrollmentId: String(enrollment._id),
      });
    } catch (err) {
      logger.warn({ msg: "Failed to queue certificate generation", error: (err as Error).message });
    }
  }

  // Queue completion email
  try {
    const { addNotificationJob } = await import("../queue/queues");
    await addNotificationJob({
      type: "course_completion",
      courseId: String(course._id),
      studentUserId: enrollment.studentUserId.toString(),
      companyId: enrollment.companyId.toString(),
    });
  } catch (err) {
    logger.warn({ msg: "Failed to queue completion notification", error: (err as Error).message });
  }

  // Phase 9: Queue gamification event for course completion
  try {
    const { addGamificationEventJob } = await import("../queue/queues");
    await addGamificationEventJob({
      tenantId: enrollment.tenantId,
      companyId: enrollment.companyId.toString(),
      studentUserId: enrollment.studentUserId.toString(),
      action: "course_completed",
      description: `Course "${course.title}" completed`,
      referenceType: "course",
      referenceId: String(course._id),
    });
  } catch (err) {
    logger.warn({ msg: "Failed to queue gamification event for course completion", error: (err as Error).message });
  }

  try {
    const { onCourseCompleted } = await import("./notificationEventHandlers");
    await onCourseCompleted({
      tenantId: enrollment.tenantId,
      companyId: enrollment.companyId.toString(),
      recipientId: enrollment.studentUserId.toString(),
      courseTitle: course.title,
      courseId: String(course._id),
    });
  } catch (err) {
    logger.warn({ msg: "Failed to create course completion notification", error: (err as Error).message });
  }

  logger.info({
    msg: "Course completed",
    courseId: String(course._id),
    studentUserId: enrollment.studentUserId.toString(),
  });
}

// ─── 6. Get Next Lesson ────────────────────────────────────────────────────

export async function getNextLesson(
  tenantId: string,
  companyId: string,
  courseId: string,
  studentUserId: string
): Promise<{ sectionId: string; lessonId: string; title: string } | null> {
  const enrollment = await CourseEnrollmentModel.findOne({
    tenantId,
    companyId: toObjectId(companyId),
    courseId: toObjectId(courseId),
    studentUserId: toObjectId(studentUserId),
    status: { $in: ["active", "completed"] },
  });
  if (!enrollment) return null;

  const course = await CourseModel.findById(toObjectId(courseId));
  if (!course) return null;

  const completedIds = new Set(
    enrollment.progress.completedLessons.map((cl) => String(cl.lessonId))
  );
  const now = new Date();

  const sortedSections = [...course.sections].sort((a, b) => a.order - b.order);
  for (const section of sortedSections) {
    const sortedLessons = [...section.lessons].sort((a, b) => a.order - b.order);
    for (const lesson of sortedLessons) {
      if (completedIds.has(String(lesson._id))) continue;
      // Respect drip dates
      if (lesson.dripDate && new Date(lesson.dripDate) > now) continue;
      return {
        sectionId: String(section._id),
        lessonId: String(lesson._id),
        title: lesson.title,
      };
    }
  }

  return null;
}
