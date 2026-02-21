import mongoose from "mongoose";
import archiver from "archiver";
import { Readable } from "stream";
import { PaperSetModel, PaperSetDocument, PaperSetStatus } from "../models/paperSet";
import { PaperModel } from "../models/paper";
import { uploadPdfToS3, getPresignedDownloadUrl, deleteS3Object } from "../utils/s3";
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { env } from "../shared/config/env";

function toObjectId(id: string): mongoose.Types.ObjectId {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new Error("Invalid ObjectId");
  }
  return new mongoose.Types.ObjectId(id);
}

// ─── Create ──────────────────────────────────────────────────────────────────

export async function createPaperSet(
  companyId: string,
  tenantId: string,
  input: Record<string, unknown>,
  userEmail: string
): Promise<PaperSetDocument> {
  const doc = await PaperSetModel.create({
    tenantId,
    companyId: toObjectId(companyId),
    title: input.title,
    shortDescription: input.shortDescription || "",
    fullDescription: input.fullDescription || "",
    examType: input.examType || "Custom",
    yearGroup: input.yearGroup || "",
    subjectCategory: input.subjectCategory || "",
    papers: input.papers || [],
    pricing: input.pricing || {},
    status: "draft",
    sortDate: new Date(),
    createdBy: userEmail,
    updatedBy: userEmail,
  });
  return doc;
}

// ─── List ────────────────────────────────────────────────────────────────────

interface ListFilters {
  status?: PaperSetStatus;
  examType?: string;
  search?: string;
}

interface PaginationOpts {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortDir?: "asc" | "desc";
}

export async function listPaperSets(
  companyId: string,
  filters?: ListFilters,
  pagination?: PaginationOpts
): Promise<{ paperSets: PaperSetDocument[]; total: number }> {
  const query: Record<string, unknown> = {
    companyId: toObjectId(companyId),
  };

  if (filters?.status) query.status = filters.status;
  if (filters?.examType) query.examType = filters.examType;
  if (filters?.search) {
    query.title = { $regex: filters.search, $options: "i" };
  }

  const page = pagination?.page ?? 1;
  const limit = pagination?.limit ?? 20;
  const sortBy = pagination?.sortBy ?? "sortDate";
  const sortDir = pagination?.sortDir === "asc" ? 1 : -1;

  const [paperSets, total] = await Promise.all([
    PaperSetModel.find(query)
      .sort({ [sortBy]: sortDir })
      .skip((page - 1) * limit)
      .limit(limit),
    PaperSetModel.countDocuments(query),
  ]);

  return { paperSets, total };
}

// ─── Get by ID ───────────────────────────────────────────────────────────────

export async function getPaperSetById(
  companyId: string,
  paperSetId: string
): Promise<PaperSetDocument> {
  const doc = await PaperSetModel.findOne({
    _id: toObjectId(paperSetId),
    companyId: toObjectId(companyId),
  }).populate("papers.paperId", "title status pdfs");

  if (!doc) {
    throw Object.assign(new Error("Paper set not found"), { status: 404 });
  }
  return doc;
}

// ─── Update ──────────────────────────────────────────────────────────────────

export async function updatePaperSet(
  companyId: string,
  paperSetId: string,
  input: Record<string, unknown>,
  userEmail: string
): Promise<PaperSetDocument> {
  const doc = await PaperSetModel.findOne({
    _id: toObjectId(paperSetId),
    companyId: toObjectId(companyId),
  });
  if (!doc) throw Object.assign(new Error("Paper set not found"), { status: 404 });

  if (input.title !== undefined) doc.title = input.title as string;
  if (input.shortDescription !== undefined) doc.shortDescription = input.shortDescription as string;
  if (input.fullDescription !== undefined) doc.fullDescription = input.fullDescription as string;
  if (input.examType !== undefined) doc.examType = input.examType as string;
  if (input.yearGroup !== undefined) doc.yearGroup = input.yearGroup as string;
  if (input.subjectCategory !== undefined) doc.subjectCategory = input.subjectCategory as string;
  if (input.papers !== undefined) doc.papers = input.papers as typeof doc.papers;
  if (input.imageUrls !== undefined) doc.imageUrls = input.imageUrls as string[];
  if (input.sortDate !== undefined) doc.sortDate = new Date(input.sortDate as string);
  if (input.pricing !== undefined) {
    const existing = JSON.parse(JSON.stringify(doc.pricing ?? {}));
    doc.pricing = { ...existing, ...(input.pricing as object) } as typeof doc.pricing;
  }
  doc.updatedBy = userEmail;

  await doc.save();
  return doc;
}

// ─── Delete ──────────────────────────────────────────────────────────────────

export async function deletePaperSet(
  companyId: string,
  paperSetId: string
): Promise<void> {
  const doc = await PaperSetModel.findOne({
    _id: toObjectId(paperSetId),
    companyId: toObjectId(companyId),
  });
  if (!doc) throw Object.assign(new Error("Paper set not found"), { status: 404 });

  if (doc.status === "published") {
    throw Object.assign(
      new Error("Cannot delete a published paper set. Archive it first."),
      { status: 400 }
    );
  }

  // Clean up S3 PDFs
  for (const entry of doc.papers) {
    for (const pdf of entry.pdfs) {
      try {
        await deleteS3Object(pdf.s3Key);
      } catch {
        // best-effort cleanup
      }
    }
  }

  await PaperSetModel.deleteOne({ _id: doc._id });
}

// ─── Add Paper to Set ────────────────────────────────────────────────────────

export async function addPaperToSet(
  companyId: string,
  paperSetId: string,
  paperId: string,
  userEmail: string
): Promise<PaperSetDocument> {
  const doc = await PaperSetModel.findOne({
    _id: toObjectId(paperSetId),
    companyId: toObjectId(companyId),
  });
  if (!doc) throw Object.assign(new Error("Paper set not found"), { status: 404 });

  // Validate paper is finalized or published
  const paper = await PaperModel.findOne({
    _id: toObjectId(paperId),
    companyId: toObjectId(companyId),
  });
  if (!paper) throw Object.assign(new Error("Paper not found"), { status: 404 });

  if (paper.status === "draft") {
    throw Object.assign(
      new Error("Cannot add a draft paper to a set. Finalize it first."),
      { status: 400 }
    );
  }

  const nextOrder = doc.papers.length
    ? Math.max(...doc.papers.map((p) => p.order)) + 1
    : 0;

  doc.papers.push({
    paperId: toObjectId(paperId),
    order: nextOrder,
    pdfs: [],
  });
  doc.updatedBy = userEmail;
  await doc.save();
  return doc;
}

// ─── Remove Paper from Set ───────────────────────────────────────────────────

export async function removePaperFromSet(
  companyId: string,
  paperSetId: string,
  paperId: string,
  userEmail: string
): Promise<PaperSetDocument> {
  const doc = await PaperSetModel.findOne({
    _id: toObjectId(paperSetId),
    companyId: toObjectId(companyId),
  });
  if (!doc) throw Object.assign(new Error("Paper set not found"), { status: 404 });

  const idx = doc.papers.findIndex((p) => p.paperId.toString() === paperId);
  if (idx === -1) {
    throw Object.assign(new Error("Paper not found in set"), { status: 404 });
  }

  // Clean up any uploaded PDFs for this entry
  for (const pdf of doc.papers[idx].pdfs) {
    try {
      await deleteS3Object(pdf.s3Key);
    } catch {
      // best-effort
    }
  }

  doc.papers.splice(idx, 1);

  // Reorder remaining
  doc.papers.forEach((p, i) => {
    p.order = i;
  });

  doc.updatedBy = userEmail;
  await doc.save();
  return doc;
}

// ─── Upload PDF to Paper Set ─────────────────────────────────────────────────

export async function uploadPaperSetPdf(
  companyId: string,
  paperSetId: string,
  paperIndex: number,
  file: { buffer: Buffer; originalname: string; size: number },
  pdfType: string,
  userEmail: string
): Promise<PaperSetDocument> {
  const doc = await PaperSetModel.findOne({
    _id: toObjectId(paperSetId),
    companyId: toObjectId(companyId),
  });
  if (!doc) throw Object.assign(new Error("Paper set not found"), { status: 404 });

  if (paperIndex < 0 || paperIndex >= doc.papers.length) {
    throw Object.assign(new Error("Invalid paper index"), { status: 400 });
  }

  const s3Key = `paper-sets/${companyId}/${paperSetId}/${paperIndex}/${pdfType}_${Date.now()}.pdf`;
  await uploadPdfToS3(file.buffer, s3Key);

  doc.papers[paperIndex].pdfs.push({
    type: pdfType,
    fileName: file.originalname,
    s3Key,
    fileSize: file.size,
  });

  doc.updatedBy = userEmail;
  await doc.save();
  return doc;
}

// ─── Delete PDF from Paper Set ───────────────────────────────────────────────

export async function deletePaperSetPdf(
  companyId: string,
  paperSetId: string,
  paperIndex: number,
  pdfIndex: number,
  userEmail: string
): Promise<PaperSetDocument> {
  const doc = await PaperSetModel.findOne({
    _id: toObjectId(paperSetId),
    companyId: toObjectId(companyId),
  });
  if (!doc) throw Object.assign(new Error("Paper set not found"), { status: 404 });

  if (paperIndex < 0 || paperIndex >= doc.papers.length) {
    throw Object.assign(new Error("Invalid paper index"), { status: 400 });
  }

  const entry = doc.papers[paperIndex];
  if (pdfIndex < 0 || pdfIndex >= entry.pdfs.length) {
    throw Object.assign(new Error("Invalid PDF index"), { status: 400 });
  }

  const removed = entry.pdfs[pdfIndex];
  try {
    await deleteS3Object(removed.s3Key);
  } catch {
    // best-effort
  }

  entry.pdfs.splice(pdfIndex, 1);
  doc.updatedBy = userEmail;
  await doc.save();
  return doc;
}

// ─── Publish ─────────────────────────────────────────────────────────────────

export async function publishPaperSet(
  companyId: string,
  paperSetId: string,
  userEmail: string
): Promise<PaperSetDocument> {
  const doc = await PaperSetModel.findOne({
    _id: toObjectId(paperSetId),
    companyId: toObjectId(companyId),
  });
  if (!doc) throw Object.assign(new Error("Paper set not found"), { status: 404 });

  // Validate all papers are finalized or published
  for (const entry of doc.papers) {
    const paper = await PaperModel.findById(entry.paperId);
    if (!paper || paper.status === "draft") {
      throw Object.assign(
        new Error("All papers in the set must be finalized or published before publishing the set"),
        { status: 400 }
      );
    }
  }

  doc.status = "published";
  doc.updatedBy = userEmail;
  await doc.save();
  return doc;
}

// ─── Archive ─────────────────────────────────────────────────────────────────

export async function archivePaperSet(
  companyId: string,
  paperSetId: string,
  userEmail: string
): Promise<PaperSetDocument> {
  const doc = await PaperSetModel.findOne({
    _id: toObjectId(paperSetId),
    companyId: toObjectId(companyId),
  });
  if (!doc) throw Object.assign(new Error("Paper set not found"), { status: 404 });

  doc.status = "archived";
  doc.updatedBy = userEmail;
  await doc.save();
  return doc;
}

// ─── Download as ZIP ─────────────────────────────────────────────────────────

export async function downloadPaperSetAsZip(
  companyId: string,
  paperSetId: string
): Promise<Readable> {
  const doc = await PaperSetModel.findOne({
    _id: toObjectId(paperSetId),
    companyId: toObjectId(companyId),
  }).populate("papers.paperId", "title pdfs");

  if (!doc) throw Object.assign(new Error("Paper set not found"), { status: 404 });

  const archive = archiver("zip", { zlib: { level: 5 } });

  // Collect PDFs from each paper entry
  for (const entry of doc.papers) {
    const paperTitle = (entry.paperId as unknown as { title?: string })?.title ?? `paper_${entry.order}`;
    const folderName = `${entry.order}_${paperTitle}`.replace(/[^a-zA-Z0-9_-]/g, "_");

    // Paper-level auto-generated PDFs from the Paper model
    const paperDoc = entry.paperId as unknown as { pdfs?: Array<{ s3Key: string; fileName: string; type: string }> };
    if (paperDoc?.pdfs) {
      for (const pdf of paperDoc.pdfs) {
        try {
          const url = await getPresignedDownloadUrl(pdf.s3Key, 300);
          const res = await fetch(url);
          if (res.ok && res.body) {
            archive.append(Readable.fromWeb(res.body as import("stream/web").ReadableStream), {
              name: `${folderName}/${pdf.fileName}`,
            });
          }
        } catch {
          // skip on error
        }
      }
    }

    // Manually uploaded PDFs on this paper set entry
    for (const pdf of entry.pdfs) {
      try {
        const url = await getPresignedDownloadUrl(pdf.s3Key, 300);
        const res = await fetch(url);
        if (res.ok && res.body) {
          archive.append(Readable.fromWeb(res.body as import("stream/web").ReadableStream), {
            name: `${folderName}/${pdf.fileName}`,
          });
        }
      } catch {
        // skip on error
      }
    }
  }

  archive.finalize();
  return archive;
}
