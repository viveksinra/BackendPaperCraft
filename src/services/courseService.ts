import mongoose, { Types } from "mongoose";
import { CourseModel, CourseDocument } from "../models/course";
import { CourseEnrollmentModel } from "../models/courseEnrollment";
import { logger } from "../shared/logger";

const Product =
  mongoose.models.Product ||
  mongoose.model("Product", new mongoose.Schema({}, { strict: false }));

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

function randomSuffix(): string {
  return Math.random().toString(36).substring(2, 7);
}

// ─── 1. Create Course ──────────────────────────────────────────────────────

export async function createCourse(
  tenantId: string,
  companyId: string,
  input: {
    title: string;
    teacherId: string;
    description?: string;
    shortDescription?: string;
    category?: string;
    tags?: string[];
    level?: string;
    targetExamType?: string;
    pricing?: { isFree?: boolean; price?: number; currency?: string };
    welcomeMessage?: string;
    completionMessage?: string;
    certificateEnabled?: boolean;
  },
  createdBy: string
): Promise<CourseDocument> {
  const companyOid = toObjectId(companyId);
  const teacherOid = toObjectId(input.teacherId);

  // Generate slug with collision handling
  let slug = slugify(input.title);
  if (!slug) slug = randomSuffix();
  let exists = await CourseModel.findOne({ tenantId, companyId: companyOid, slug });
  while (exists) {
    slug = `${slugify(input.title)}-${randomSuffix()}`;
    exists = await CourseModel.findOne({ tenantId, companyId: companyOid, slug });
  }

  const course = await CourseModel.create({
    tenantId,
    companyId: companyOid,
    title: input.title,
    slug,
    description: input.description || "",
    shortDescription: input.shortDescription || "",
    teacherId: teacherOid,
    category: input.category || "",
    tags: input.tags || [],
    level: input.level || "all_levels",
    targetExamType: input.targetExamType || "",
    pricing: {
      isFree: input.pricing?.isFree ?? true,
      price: input.pricing?.price ?? 0,
      currency: input.pricing?.currency || "GBP",
      productId: null,
    },
    welcomeMessage: input.welcomeMessage || "",
    completionMessage: input.completionMessage || "",
    certificateEnabled: input.certificateEnabled ?? false,
    status: "draft",
    createdBy: createdBy.toLowerCase(),
    updatedBy: createdBy.toLowerCase(),
  });

  logger.info({ msg: "Course created", courseId: String(course._id), slug });
  return course;
}

// ─── 2. Get Course By ID ───────────────────────────────────────────────────

export async function getCourseById(
  tenantId: string,
  companyId: string,
  courseId: string
): Promise<CourseDocument> {
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

// ─── 3. Update Course ──────────────────────────────────────────────────────

const UPDATABLE_FIELDS = [
  "title", "description", "shortDescription", "thumbnail",
  "category", "tags", "level", "targetExamType", "pricing",
  "welcomeMessage", "completionMessage", "certificateEnabled",
  "additionalTeacherIds",
] as const;

export async function updateCourse(
  tenantId: string,
  companyId: string,
  courseId: string,
  updates: Record<string, unknown>,
  updatedBy: string
): Promise<CourseDocument> {
  const course = await getCourseById(tenantId, companyId, courseId);

  const filtered: Record<string, unknown> = {};
  for (const key of UPDATABLE_FIELDS) {
    if (updates[key] !== undefined) {
      filtered[key] = updates[key];
    }
  }
  filtered.updatedBy = updatedBy.toLowerCase();

  // Re-generate slug if title changes
  if (filtered.title && filtered.title !== course.title) {
    let slug = slugify(filtered.title as string);
    if (!slug) slug = randomSuffix();
    const companyOid = toObjectId(companyId);
    let exists = await CourseModel.findOne({
      tenantId,
      companyId: companyOid,
      slug,
      _id: { $ne: course._id },
    });
    while (exists) {
      slug = `${slugify(filtered.title as string)}-${randomSuffix()}`;
      exists = await CourseModel.findOne({
        tenantId,
        companyId: companyOid,
        slug,
        _id: { $ne: course._id },
      });
    }
    filtered.slug = slug;
  }

  Object.assign(course, filtered);
  await course.save();
  return course;
}

// ─── 4. Delete Course ──────────────────────────────────────────────────────

export async function deleteCourse(
  tenantId: string,
  companyId: string,
  courseId: string
): Promise<void> {
  const course = await getCourseById(tenantId, companyId, courseId);

  if (course.status !== "draft") {
    throw Object.assign(new Error("Only draft courses can be deleted"), { status: 400 });
  }

  // Delete enrollments
  await CourseEnrollmentModel.deleteMany({ courseId: course._id });

  // Delete the course
  await CourseModel.deleteOne({ _id: course._id });

  logger.info({ msg: "Course deleted", courseId });
}

// ─── 5. List Courses ───────────────────────────────────────────────────────

interface ListParams {
  status?: string;
  teacherId?: string;
  category?: string;
  search?: string;
  page?: number;
  pageSize?: number;
  sortBy?: string;
}

export async function listCourses(
  tenantId: string,
  companyId: string,
  params: ListParams
): Promise<{ courses: CourseDocument[]; total: number; page: number; pageSize: number }> {
  const query: Record<string, unknown> = {
    tenantId,
    companyId: toObjectId(companyId),
  };

  if (params.status) query.status = params.status;
  if (params.teacherId) query.teacherId = toObjectId(params.teacherId);
  if (params.category) query.category = params.category;
  if (params.search) {
    query.title = { $regex: params.search, $options: "i" };
  }

  const page = params.page || 1;
  const pageSize = params.pageSize || 20;
  const skip = (page - 1) * pageSize;

  let sort: Record<string, 1 | -1> = { createdAt: -1 };
  if (params.sortBy === "title") sort = { title: 1 };
  if (params.sortBy === "newest") sort = { createdAt: -1 };
  if (params.sortBy === "popular") sort = { "stats.enrollmentCount": -1 };
  if (params.sortBy === "rating") sort = { "stats.avgRating": -1 };

  const [courses, total] = await Promise.all([
    CourseModel.find(query).sort(sort).skip(skip).limit(pageSize).lean(),
    CourseModel.countDocuments(query),
  ]);

  return {
    courses: courses as unknown as CourseDocument[],
    total,
    page,
    pageSize,
  };
}

// ─── 6. Publish Course ─────────────────────────────────────────────────────

export async function publishCourse(
  tenantId: string,
  companyId: string,
  courseId: string,
  updatedBy: string
): Promise<CourseDocument> {
  const course = await getCourseById(tenantId, companyId, courseId);

  // Validate course structure
  if (course.sections.length === 0) {
    throw Object.assign(new Error("Course must have at least 1 section"), { status: 400 });
  }
  for (const section of course.sections) {
    if (section.lessons.length === 0) {
      throw Object.assign(
        new Error(`Section "${section.title}" must have at least 1 lesson`),
        { status: 400 }
      );
    }
    for (const lesson of section.lessons) {
      const c = lesson.content;
      const hasContent =
        (lesson.type === "video" && !!c.videoUrl) ||
        (lesson.type === "pdf" && !!c.pdfUrl) ||
        (lesson.type === "text" && !!c.textContent) ||
        (lesson.type === "quiz" && !!c.testId) ||
        (lesson.type === "resource" && c.resourceFiles.length > 0);
      if (!hasContent) {
        throw Object.assign(
          new Error(`Lesson "${lesson.title}" has no content`),
          { status: 400 }
        );
      }
    }
  }

  // Recalculate stats
  let totalLessons = 0;
  let totalDuration = 0;
  for (const section of course.sections) {
    totalLessons += section.lessons.length;
    for (const lesson of section.lessons) {
      totalDuration += lesson.estimatedMinutes || 0;
    }
  }
  course.stats.totalLessons = totalLessons;
  course.stats.totalDurationMinutes = totalDuration;

  // If paid course, create/link Phase 6 Product
  if (!course.pricing.isFree && !course.pricing.productId) {
    try {
      const product = await Product.create({
        tenantId,
        companyId: toObjectId(companyId),
        type: "course",
        referenceId: course._id,
        title: course.title,
        description: course.shortDescription || course.description,
        thumbnail: course.thumbnail,
        pricing: {
          currency: course.pricing.currency,
          basePrice: course.pricing.price,
          discountPrice: null,
          discountValidUntil: null,
          isFree: false,
        },
        status: "active",
        publishedAt: new Date(),
        createdBy: updatedBy.toLowerCase(),
        updatedBy: updatedBy.toLowerCase(),
      });
      course.pricing.productId = product._id as Types.ObjectId;
    } catch (err) {
      logger.warn({
        msg: "Failed to create product for paid course",
        courseId,
        error: (err as Error).message,
      });
    }
  }

  course.status = "published";
  course.publishedAt = new Date();
  course.updatedBy = updatedBy.toLowerCase();
  await course.save();

  logger.info({ msg: "Course published", courseId });
  return course;
}

// ─── 7. Unpublish Course ───────────────────────────────────────────────────

export async function unpublishCourse(
  tenantId: string,
  companyId: string,
  courseId: string,
  updatedBy: string
): Promise<CourseDocument> {
  const course = await getCourseById(tenantId, companyId, courseId);
  course.status = "draft";
  course.updatedBy = updatedBy.toLowerCase();
  await course.save();
  return course;
}

// ─── 8. Archive Course ─────────────────────────────────────────────────────

export async function archiveCourse(
  tenantId: string,
  companyId: string,
  courseId: string,
  updatedBy: string
): Promise<CourseDocument> {
  const course = await getCourseById(tenantId, companyId, courseId);
  course.status = "archived";
  course.archivedAt = new Date();
  course.updatedBy = updatedBy.toLowerCase();
  await course.save();
  return course;
}

// ─── 9. Browse Catalog ─────────────────────────────────────────────────────

interface CatalogParams {
  category?: string;
  level?: string;
  examType?: string;
  isFree?: boolean;
  search?: string;
  sortBy?: string;
  page?: number;
  limit?: number;
}

export async function browseCatalog(
  tenantId: string,
  companyId: string,
  params: CatalogParams
): Promise<{ courses: Record<string, unknown>[]; total: number; page: number; limit: number }> {
  const query: Record<string, unknown> = {
    tenantId,
    companyId: toObjectId(companyId),
    status: "published",
  };

  if (params.category) query.category = params.category;
  if (params.level) query.level = params.level;
  if (params.examType) query.targetExamType = params.examType;
  if (params.isFree !== undefined) query["pricing.isFree"] = params.isFree;
  if (params.search) {
    query.$or = [
      { title: { $regex: params.search, $options: "i" } },
      { tags: { $regex: params.search, $options: "i" } },
    ];
  }

  const page = params.page || 1;
  const limit = params.limit || 12;
  const skip = (page - 1) * limit;

  let sort: Record<string, 1 | -1> = { publishedAt: -1 };
  if (params.sortBy === "popular") sort = { "stats.enrollmentCount": -1 };
  if (params.sortBy === "rating") sort = { "stats.avgRating": -1 };
  if (params.sortBy === "price_asc") sort = { "pricing.price": 1 };
  if (params.sortBy === "price_desc") sort = { "pricing.price": -1 };
  if (params.sortBy === "newest") sort = { publishedAt: -1 };

  const projection = {
    title: 1, slug: 1, shortDescription: 1, thumbnail: 1,
    category: 1, level: 1, tags: 1, pricing: 1, stats: 1,
    teacherId: 1, status: 1,
  };

  const [courses, total] = await Promise.all([
    CourseModel.find(query, projection).sort(sort).skip(skip).limit(limit).lean(),
    CourseModel.countDocuments(query),
  ]);

  return { courses, total, page, limit };
}

// ─── 10. Get Course Detail ─────────────────────────────────────────────────

export async function getCourseDetail(
  tenantId: string,
  companyId: string,
  courseSlugOrId: string,
  studentUserId?: string
): Promise<Record<string, unknown>> {
  const query: Record<string, unknown> = {
    tenantId,
    companyId: toObjectId(companyId),
  };

  if (Types.ObjectId.isValid(courseSlugOrId)) {
    query._id = toObjectId(courseSlugOrId);
  } else {
    query.slug = courseSlugOrId;
  }

  const course = await CourseModel.findOne(query).lean();
  if (!course) {
    throw Object.assign(new Error("Course not found"), { status: 404 });
  }

  // Check if student is enrolled
  let isEnrolled = false;
  if (studentUserId) {
    const enrollment = await CourseEnrollmentModel.findOne({
      courseId: course._id,
      studentUserId: toObjectId(studentUserId),
      status: { $in: ["active", "completed"] },
    });
    isEnrolled = !!enrollment;
  }

  // Hide content for non-enrolled users on paid lessons
  const sections = (course as Record<string, unknown>).sections as Record<string, unknown>[];
  if (sections) {
    for (const section of sections) {
      const lessons = section.lessons as Record<string, unknown>[];
      if (lessons) {
        for (const lesson of lessons) {
          if (!isEnrolled && !(lesson.isFree as boolean)) {
            lesson.content = {};
          }
        }
      }
    }
  }

  // Get reviews
  const reviews = await CourseEnrollmentModel.find({
    courseId: course._id,
    review: { $ne: null },
    "review.isVisible": true,
  })
    .select("review studentUserId")
    .sort({ "review.reviewedAt": -1 })
    .limit(10)
    .lean();

  return {
    ...course,
    isEnrolled,
    reviews: reviews.map((e) => e.review),
  };
}

// ─── 11. Duplicate Course ──────────────────────────────────────────────────

export async function duplicateCourse(
  tenantId: string,
  companyId: string,
  courseId: string,
  duplicatedBy: string
): Promise<CourseDocument> {
  const source = await getCourseById(tenantId, companyId, courseId);
  const sourceObj = source.toObject();

  // Remove unique fields
  delete (sourceObj as Record<string, unknown>)._id;
  delete (sourceObj as Record<string, unknown>).createdAt;
  delete (sourceObj as Record<string, unknown>).updatedAt;
  delete (sourceObj as Record<string, unknown>).__v;

  // Generate new slug
  let slug = `${slugify(source.title)}-copy`;
  const companyOid = toObjectId(companyId);
  let exists = await CourseModel.findOne({ tenantId, companyId: companyOid, slug });
  while (exists) {
    slug = `${slugify(source.title)}-copy-${randomSuffix()}`;
    exists = await CourseModel.findOne({ tenantId, companyId: companyOid, slug });
  }

  // Generate new _ids for sections and lessons
  const sections = sourceObj.sections.map((section: Record<string, unknown>) => ({
    ...section,
    _id: new Types.ObjectId(),
    lessons: (section.lessons as Record<string, unknown>[]).map(
      (lesson: Record<string, unknown>) => ({
        ...lesson,
        _id: new Types.ObjectId(),
      })
    ),
  }));

  const duplicate = await CourseModel.create({
    ...sourceObj,
    title: `${source.title} (Copy)`,
    slug,
    sections,
    status: "draft",
    publishedAt: null,
    archivedAt: null,
    stats: {
      enrollmentCount: 0,
      avgRating: 0,
      ratingCount: 0,
      completionRate: 0,
      totalLessons: sourceObj.stats.totalLessons,
      totalDurationMinutes: sourceObj.stats.totalDurationMinutes,
    },
    pricing: {
      ...sourceObj.pricing,
      productId: null,
    },
    createdBy: duplicatedBy.toLowerCase(),
    updatedBy: duplicatedBy.toLowerCase(),
  });

  logger.info({ msg: "Course duplicated", sourceId: courseId, newId: String(duplicate._id) });
  return duplicate;
}
