import path from "path";
import mongoose from "mongoose";
import { AnnouncementModel, AnnouncementDocument } from "../models/announcement";
import { ClassModel } from "../models/class";

// ─── Helpers ────────────────────────────────────────────────────────────────

function toObjectId(id: string): mongoose.Types.ObjectId {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw Object.assign(new Error("Invalid ObjectId"), { status: 400 });
  }
  return new mongoose.Types.ObjectId(id);
}

// ─── 1. Create Announcement ────────────────────────────────────────────────

export async function createAnnouncement(
  companyId: string,
  tenantId: string,
  input: Record<string, unknown>,
  creatorEmail: string
): Promise<AnnouncementDocument> {
  const companyOid = toObjectId(companyId);

  if (input.audience === "class" && input.classId) {
    const cls = await ClassModel.findOne({
      _id: toObjectId(input.classId as string),
      companyId: companyOid,
    });
    if (!cls) {
      throw Object.assign(new Error("Class not found"), { status: 404 });
    }
  }

  const doc = await AnnouncementModel.create({
    tenantId,
    companyId: companyOid,
    classId: input.classId ? toObjectId(input.classId as string) : null,
    audience: input.audience,
    title: input.title,
    body: input.body,
    isPinned: Boolean(input.isPinned),
    publishedAt: new Date(),
    expiresAt: input.expiresAt ? new Date(input.expiresAt as string) : null,
    createdBy: creatorEmail.toLowerCase(),
    updatedBy: creatorEmail.toLowerCase(),
  });

  return doc;
}

// ─── 2. List Announcements ─────────────────────────────────────────────────

interface AnnouncementFilters {
  audience?: string;
  classId?: string;
  isPinned?: boolean;
}

interface PaginationOpts {
  page?: number;
  limit?: number;
}

export async function listAnnouncements(
  companyId: string,
  filters?: AnnouncementFilters,
  pagination?: PaginationOpts
): Promise<{ items: AnnouncementDocument[]; total: number }> {
  const now = new Date();
  const query: Record<string, unknown> = {
    companyId: toObjectId(companyId),
    $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }],
  };

  if (filters?.audience) query.audience = filters.audience;
  if (filters?.classId) query.classId = toObjectId(filters.classId);
  if (filters?.isPinned !== undefined) query.isPinned = filters.isPinned;

  const page = pagination?.page || 1;
  const limit = pagination?.limit || 20;

  const [items, total] = await Promise.all([
    AnnouncementModel.find(query)
      .sort({ isPinned: -1, publishedAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate("classId", "name")
      .lean(),
    AnnouncementModel.countDocuments(query),
  ]);

  return { items: items as unknown as AnnouncementDocument[], total };
}

// ─── 3. Get Student Announcements ──────────────────────────────────────────

export async function getStudentAnnouncements(
  studentUserId: string,
  companyId: string,
  pagination?: PaginationOpts
): Promise<{ items: AnnouncementDocument[]; total: number }> {
  const companyOid = toObjectId(companyId);
  const studentOid = toObjectId(studentUserId);
  const now = new Date();

  // Find classes the student is enrolled in
  const studentClasses = await ClassModel.find({
    companyId: companyOid,
    students: studentOid,
    status: "active",
  }).select("_id");

  const classIds = studentClasses.map((c: any) => c._id);

  const query = {
    companyId: companyOid,
    $or: [
      { audience: "organization" },
      { audience: "class", classId: { $in: classIds } },
    ],
    $and: [{ $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }] }],
  };

  const page = pagination?.page || 1;
  const limit = pagination?.limit || 20;

  const [items, total] = await Promise.all([
    AnnouncementModel.find(query)
      .sort({ isPinned: -1, publishedAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate("classId", "name")
      .lean(),
    AnnouncementModel.countDocuments(query),
  ]);

  return { items: items as unknown as AnnouncementDocument[], total };
}

// ─── 4. Delete Announcement ────────────────────────────────────────────────

export async function deleteAnnouncement(
  companyId: string,
  announcementId: string
): Promise<void> {
  const result = await AnnouncementModel.deleteOne({
    _id: toObjectId(announcementId),
    companyId: toObjectId(companyId),
  });

  if (result.deletedCount === 0) {
    throw Object.assign(new Error("Announcement not found"), { status: 404 });
  }
}

// ─── 5. Pin/Unpin Announcement ─────────────────────────────────────────────

export async function pinAnnouncement(
  companyId: string,
  announcementId: string,
  isPinned: boolean,
  updaterEmail: string
): Promise<AnnouncementDocument> {
  const doc = await AnnouncementModel.findOneAndUpdate(
    {
      _id: toObjectId(announcementId),
      companyId: toObjectId(companyId),
    },
    {
      $set: {
        isPinned,
        updatedBy: updaterEmail.toLowerCase(),
      },
    },
    { new: true }
  );

  if (!doc) {
    throw Object.assign(new Error("Announcement not found"), { status: 404 });
  }

  return doc;
}
