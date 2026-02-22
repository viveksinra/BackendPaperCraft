import mongoose, { Types } from "mongoose";
import { CourseModel, CourseDocument } from "../models/course";
import { deleteS3Object } from "../utils/s3";
import { logger } from "../shared/logger";

// ─── Helpers ───────────────────────────────────────────────────────────────

function toObjectId(id: string): Types.ObjectId {
  if (!Types.ObjectId.isValid(id)) {
    throw Object.assign(new Error("Invalid ObjectId"), { status: 400 });
  }
  return new Types.ObjectId(id);
}

function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

async function getCourse(tenantId: string, companyId: string, courseId: string): Promise<CourseDocument> {
  const course = await CourseModel.findOne({
    _id: toObjectId(courseId),
    tenantId,
    companyId: toObjectId(companyId),
  });
  if (!course) {
    throw Object.assign(new Error("Course not found"), { status: 404 });
  }
  return course;
}

// ─── Section Management ────────────────────────────────────────────────────

export async function addSection(
  tenantId: string,
  companyId: string,
  courseId: string,
  title: string,
  updatedBy: string
): Promise<CourseDocument> {
  const course = await getCourse(tenantId, companyId, courseId);
  const order = course.sections.length;

  course.sections.push({
    _id: new Types.ObjectId(),
    title,
    order,
    lessons: [],
  } as never);
  course.updatedBy = updatedBy.toLowerCase();
  await course.save();
  return course;
}

export async function updateSection(
  tenantId: string,
  companyId: string,
  courseId: string,
  sectionId: string,
  title: string,
  updatedBy: string
): Promise<CourseDocument> {
  const course = await getCourse(tenantId, companyId, courseId);
  const section = course.sections.find((s) => String(s._id) === sectionId);
  if (!section) {
    throw Object.assign(new Error("Section not found"), { status: 404 });
  }
  section.title = title;
  course.updatedBy = updatedBy.toLowerCase();
  await course.save();
  return course;
}

export async function deleteSection(
  tenantId: string,
  companyId: string,
  courseId: string,
  sectionId: string,
  updatedBy: string
): Promise<CourseDocument> {
  const course = await getCourse(tenantId, companyId, courseId);
  const idx = course.sections.findIndex((s) => String(s._id) === sectionId);
  if (idx === -1) {
    throw Object.assign(new Error("Section not found"), { status: 404 });
  }

  // Cleanup S3 files for all lessons in the section
  const section = course.sections[idx];
  for (const lesson of section.lessons) {
    await cleanupLessonFiles(lesson as unknown as Record<string, unknown>);
  }

  course.sections.splice(idx, 1);
  // Re-order remaining sections
  course.sections.forEach((s, i) => { s.order = i; });
  course.updatedBy = updatedBy.toLowerCase();
  await course.save();
  return course;
}

export async function reorderSections(
  tenantId: string,
  companyId: string,
  courseId: string,
  sectionOrder: string[],
  updatedBy: string
): Promise<CourseDocument> {
  const course = await getCourse(tenantId, companyId, courseId);

  // Validate all IDs exist
  const existingIds = new Set(course.sections.map((s) => String(s._id)));
  for (const id of sectionOrder) {
    if (!existingIds.has(id)) {
      throw Object.assign(new Error(`Section ${id} not found`), { status: 400 });
    }
  }

  // Reorder
  const sectionMap = new Map(course.sections.map((s) => [String(s._id), s]));
  course.sections = sectionOrder.map((id, i) => {
    const section = sectionMap.get(id)!;
    section.order = i;
    return section;
  }) as typeof course.sections;

  course.updatedBy = updatedBy.toLowerCase();
  await course.save();
  return course;
}

// ─── Lesson Management ─────────────────────────────────────────────────────

export async function addLesson(
  tenantId: string,
  companyId: string,
  courseId: string,
  sectionId: string,
  input: { title: string; type: string; isFree?: boolean; dripDate?: string; estimatedMinutes?: number },
  updatedBy: string
): Promise<CourseDocument> {
  const course = await getCourse(tenantId, companyId, courseId);
  const section = course.sections.find((s) => String(s._id) === sectionId);
  if (!section) {
    throw Object.assign(new Error("Section not found"), { status: 404 });
  }

  const order = section.lessons.length;
  const slug = slugify(input.title) || `lesson-${order}`;

  section.lessons.push({
    _id: new Types.ObjectId(),
    title: input.title,
    slug,
    type: input.type,
    order,
    content: {
      videoUrl: "",
      videoDuration: 0,
      videoThumbnailUrl: "",
      pdfUrl: "",
      pdfPageCount: 0,
      textContent: "",
      testId: null,
      resourceFiles: [],
    },
    isFree: input.isFree ?? false,
    dripDate: input.dripDate ? new Date(input.dripDate) : null,
    estimatedMinutes: input.estimatedMinutes || 0,
    isPublished: true,
  } as never);

  course.updatedBy = updatedBy.toLowerCase();
  await course.save();
  return course;
}

export async function updateLesson(
  tenantId: string,
  companyId: string,
  courseId: string,
  sectionId: string,
  lessonId: string,
  updates: { title?: string; type?: string; isFree?: boolean; dripDate?: string | null; estimatedMinutes?: number; isPublished?: boolean },
  updatedBy: string
): Promise<CourseDocument> {
  const course = await getCourse(tenantId, companyId, courseId);
  const section = course.sections.find((s) => String(s._id) === sectionId);
  if (!section) throw Object.assign(new Error("Section not found"), { status: 404 });
  const lesson = section.lessons.find((l) => String(l._id) === lessonId);
  if (!lesson) throw Object.assign(new Error("Lesson not found"), { status: 404 });

  if (updates.title !== undefined) lesson.title = updates.title;
  if (updates.type !== undefined) lesson.type = updates.type as never;
  if (updates.isFree !== undefined) lesson.isFree = updates.isFree;
  if (updates.dripDate !== undefined) lesson.dripDate = updates.dripDate ? new Date(updates.dripDate) : null;
  if (updates.estimatedMinutes !== undefined) lesson.estimatedMinutes = updates.estimatedMinutes;
  if (updates.isPublished !== undefined) lesson.isPublished = updates.isPublished;

  course.updatedBy = updatedBy.toLowerCase();
  await course.save();
  return course;
}

export async function deleteLesson(
  tenantId: string,
  companyId: string,
  courseId: string,
  sectionId: string,
  lessonId: string,
  updatedBy: string
): Promise<CourseDocument> {
  const course = await getCourse(tenantId, companyId, courseId);
  const section = course.sections.find((s) => String(s._id) === sectionId);
  if (!section) throw Object.assign(new Error("Section not found"), { status: 404 });

  const idx = section.lessons.findIndex((l) => String(l._id) === lessonId);
  if (idx === -1) throw Object.assign(new Error("Lesson not found"), { status: 404 });

  await cleanupLessonFiles(section.lessons[idx] as unknown as Record<string, unknown>);
  section.lessons.splice(idx, 1);
  section.lessons.forEach((l, i) => { l.order = i; });

  course.updatedBy = updatedBy.toLowerCase();
  await course.save();
  return course;
}

export async function reorderLessons(
  tenantId: string,
  companyId: string,
  courseId: string,
  sectionId: string,
  lessonOrder: string[],
  updatedBy: string
): Promise<CourseDocument> {
  const course = await getCourse(tenantId, companyId, courseId);
  const section = course.sections.find((s) => String(s._id) === sectionId);
  if (!section) throw Object.assign(new Error("Section not found"), { status: 404 });

  const lessonMap = new Map(section.lessons.map((l) => [String(l._id), l]));
  for (const id of lessonOrder) {
    if (!lessonMap.has(id)) {
      throw Object.assign(new Error(`Lesson ${id} not found`), { status: 400 });
    }
  }

  section.lessons = lessonOrder.map((id, i) => {
    const lesson = lessonMap.get(id)!;
    lesson.order = i;
    return lesson;
  }) as typeof section.lessons;

  course.updatedBy = updatedBy.toLowerCase();
  await course.save();
  return course;
}

export async function moveLessonToSection(
  tenantId: string,
  companyId: string,
  courseId: string,
  lessonId: string,
  fromSectionId: string,
  toSectionId: string,
  newOrder: number,
  updatedBy: string
): Promise<CourseDocument> {
  const course = await getCourse(tenantId, companyId, courseId);

  const fromSection = course.sections.find((s) => String(s._id) === fromSectionId);
  const toSection = course.sections.find((s) => String(s._id) === toSectionId);
  if (!fromSection || !toSection) {
    throw Object.assign(new Error("Section not found"), { status: 404 });
  }

  const lessonIdx = fromSection.lessons.findIndex((l) => String(l._id) === lessonId);
  if (lessonIdx === -1) throw Object.assign(new Error("Lesson not found"), { status: 404 });

  const [lesson] = fromSection.lessons.splice(lessonIdx, 1);
  fromSection.lessons.forEach((l, i) => { l.order = i; });

  const insertAt = Math.min(newOrder, toSection.lessons.length);
  toSection.lessons.splice(insertAt, 0, lesson);
  toSection.lessons.forEach((l, i) => { l.order = i; });

  course.updatedBy = updatedBy.toLowerCase();
  await course.save();
  return course;
}

// ─── Content Setters ───────────────────────────────────────────────────────

export async function setLessonVideoContent(
  tenantId: string,
  companyId: string,
  courseId: string,
  sectionId: string,
  lessonId: string,
  data: { videoUrl: string; videoDuration?: number; videoThumbnailUrl?: string },
  updatedBy: string
): Promise<CourseDocument> {
  const course = await getCourse(tenantId, companyId, courseId);
  const lesson = findLesson(course, sectionId, lessonId);

  lesson.content.videoUrl = data.videoUrl;
  if (data.videoDuration !== undefined) lesson.content.videoDuration = data.videoDuration;
  if (data.videoThumbnailUrl !== undefined) lesson.content.videoThumbnailUrl = data.videoThumbnailUrl;

  course.updatedBy = updatedBy.toLowerCase();
  await course.save();
  return course;
}

export async function setLessonPdfContent(
  tenantId: string,
  companyId: string,
  courseId: string,
  sectionId: string,
  lessonId: string,
  data: { pdfUrl: string; pdfPageCount?: number },
  updatedBy: string
): Promise<CourseDocument> {
  const course = await getCourse(tenantId, companyId, courseId);
  const lesson = findLesson(course, sectionId, lessonId);

  lesson.content.pdfUrl = data.pdfUrl;
  if (data.pdfPageCount !== undefined) lesson.content.pdfPageCount = data.pdfPageCount;

  course.updatedBy = updatedBy.toLowerCase();
  await course.save();
  return course;
}

export async function setLessonTextContent(
  tenantId: string,
  companyId: string,
  courseId: string,
  sectionId: string,
  lessonId: string,
  textContent: string,
  updatedBy: string
): Promise<CourseDocument> {
  const course = await getCourse(tenantId, companyId, courseId);
  const lesson = findLesson(course, sectionId, lessonId);

  lesson.content.textContent = textContent;

  course.updatedBy = updatedBy.toLowerCase();
  await course.save();
  return course;
}

export async function setLessonQuizContent(
  tenantId: string,
  companyId: string,
  courseId: string,
  sectionId: string,
  lessonId: string,
  testId: string,
  updatedBy: string
): Promise<CourseDocument> {
  const course = await getCourse(tenantId, companyId, courseId);
  const lesson = findLesson(course, sectionId, lessonId);

  // Validate the test belongs to the same company
  const OnlineTest =
    mongoose.models.OnlineTest ||
    mongoose.model("OnlineTest", new mongoose.Schema({}, { strict: false }));

  const test = await OnlineTest.findOne({
    _id: toObjectId(testId),
    companyId: toObjectId(companyId),
  });
  if (!test) {
    throw Object.assign(new Error("Test not found or belongs to different company"), { status: 400 });
  }

  lesson.content.testId = toObjectId(testId);

  course.updatedBy = updatedBy.toLowerCase();
  await course.save();
  return course;
}

export async function setLessonResourceContent(
  tenantId: string,
  companyId: string,
  courseId: string,
  sectionId: string,
  lessonId: string,
  resourceFiles: { name: string; url: string; fileSize: number; mimeType: string }[],
  updatedBy: string
): Promise<CourseDocument> {
  const course = await getCourse(tenantId, companyId, courseId);
  const lesson = findLesson(course, sectionId, lessonId);

  lesson.content.resourceFiles = resourceFiles;

  course.updatedBy = updatedBy.toLowerCase();
  await course.save();
  return course;
}

// ─── Internal Helpers ──────────────────────────────────────────────────────

function findLesson(course: CourseDocument, sectionId: string, lessonId: string) {
  const section = course.sections.find((s) => String(s._id) === sectionId);
  if (!section) throw Object.assign(new Error("Section not found"), { status: 404 });
  const lesson = section.lessons.find((l) => String(l._id) === lessonId);
  if (!lesson) throw Object.assign(new Error("Lesson not found"), { status: 404 });
  return lesson;
}

async function cleanupLessonFiles(lesson: Record<string, unknown>): Promise<void> {
  const content = lesson.content as Record<string, unknown> | undefined;
  if (!content) return;

  const filesToDelete: string[] = [];
  if (content.videoUrl) filesToDelete.push(content.videoUrl as string);
  if (content.videoThumbnailUrl) filesToDelete.push(content.videoThumbnailUrl as string);
  if (content.pdfUrl) filesToDelete.push(content.pdfUrl as string);
  if (content.resourceFiles) {
    for (const f of content.resourceFiles as { url: string }[]) {
      if (f.url) filesToDelete.push(f.url);
    }
  }

  for (const key of filesToDelete) {
    try {
      await deleteS3Object(key);
    } catch (err) {
      logger.warn({ msg: "Failed to delete S3 file during cleanup", key, error: (err as Error).message });
    }
  }
}
