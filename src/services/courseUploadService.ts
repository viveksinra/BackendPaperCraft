import { Types } from "mongoose";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { headS3Object, deleteS3Object } from "../utils/s3";
import { env } from "../shared/config/env";
import { logger } from "../shared/logger";
import { v4 as uuidv4 } from "uuid";

// ─── Types ─────────────────────────────────────────────────────────────────

type UploadType = "video" | "pdf" | "resource" | "thumbnail";

interface UploadConfig {
  allowedMimeTypes: string[];
  maxSizeBytes: number;
  s3Prefix: string;
}

// ─── Constants ─────────────────────────────────────────────────────────────

const UPLOAD_CONFIGS: Record<UploadType, UploadConfig> = {
  video: {
    allowedMimeTypes: ["video/mp4", "video/webm", "video/quicktime"],
    maxSizeBytes: 2147483648, // 2GB
    s3Prefix: "videos",
  },
  pdf: {
    allowedMimeTypes: ["application/pdf"],
    maxSizeBytes: 104857600, // 100MB
    s3Prefix: "pdfs",
  },
  resource: {
    allowedMimeTypes: [
      "application/pdf", "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-powerpoint",
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "application/zip", "image/png", "image/jpeg",
    ],
    maxSizeBytes: 524288000, // 500MB
    s3Prefix: "resources",
  },
  thumbnail: {
    allowedMimeTypes: ["image/jpeg", "image/png", "image/webp"],
    maxSizeBytes: 5242880, // 5MB
    s3Prefix: "thumbnails",
  },
};

// ─── S3 Client ─────────────────────────────────────────────────────────────

let s3Client: S3Client | null = null;

function getS3Client(): S3Client {
  if (!s3Client) {
    s3Client = new S3Client({
      region: env.AWS_S3_REGION,
      ...(env.AWS_ACCESS_KEY_ID && env.AWS_SECRET_ACCESS_KEY
        ? {
            credentials: {
              accessKeyId: env.AWS_ACCESS_KEY_ID,
              secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
            },
          }
        : {}),
    });
  }
  return s3Client;
}

function getBucket(): string {
  const bucket = env.COURSE_UPLOAD_BUCKET || env.AWS_S3_BUCKET;
  if (!bucket) throw new Error("S3 bucket not configured");
  return bucket;
}

// ─── 1. Get Presigned Upload URL ───────────────────────────────────────────

export async function getPresignedUploadUrl(data: {
  companyId: string;
  courseId: string;
  uploadType: UploadType;
  fileName: string;
  fileType: string;
  fileSize: number;
}): Promise<{ uploadUrl: string; fileKey: string; cdnUrl: string }> {
  const config = UPLOAD_CONFIGS[data.uploadType];
  if (!config) {
    throw Object.assign(new Error("Invalid upload type"), { status: 400 });
  }

  // Validate file type
  if (!config.allowedMimeTypes.includes(data.fileType)) {
    throw Object.assign(
      new Error(`File type ${data.fileType} not allowed for ${data.uploadType}`),
      { status: 400 }
    );
  }

  // Validate file size
  if (data.fileSize > config.maxSizeBytes) {
    throw Object.assign(
      new Error(`File exceeds maximum size of ${config.maxSizeBytes} bytes`),
      { status: 400 }
    );
  }

  // Generate S3 key
  const ext = data.fileName.split(".").pop() || "";
  const fileKey = `courses/${data.companyId}/${data.courseId}/${config.s3Prefix}/${uuidv4()}.${ext}`;

  // Generate presigned PUT URL (15-min expiry)
  const client = getS3Client();
  const command = new PutObjectCommand({
    Bucket: getBucket(),
    Key: fileKey,
    ContentType: data.fileType,
  });
  const uploadUrl = await getSignedUrl(client, command, { expiresIn: 900 });

  // CDN URL (use CloudFront if configured, otherwise S3 URL)
  const cloudfrontDomain = env.CLOUDFRONT_DOMAIN;
  const cdnUrl = cloudfrontDomain
    ? `https://${cloudfrontDomain}/${fileKey}`
    : `https://${getBucket()}.s3.${env.AWS_S3_REGION}.amazonaws.com/${fileKey}`;

  return { uploadUrl, fileKey, cdnUrl };
}

// ─── 2. Confirm Upload ─────────────────────────────────────────────────────

export async function confirmUpload(data: {
  fileKey: string;
  uploadType: UploadType;
}): Promise<{ verified: boolean }> {
  // Verify file exists in S3
  const exists = await headS3Object(data.fileKey);
  if (!exists) {
    throw Object.assign(new Error("File not found in S3"), { status: 400 });
  }

  // If video, queue video processing job
  if (data.uploadType === "video") {
    try {
      const { addVideoProcessingJob } = await import("../queue/queues");
      await addVideoProcessingJob({ fileKey: data.fileKey });
    } catch (err) {
      logger.warn({ msg: "Failed to queue video processing", error: (err as Error).message });
    }
  }

  return { verified: true };
}

// ─── 3. Delete File ────────────────────────────────────────────────────────

export async function deleteFile(fileKey: string): Promise<void> {
  await deleteS3Object(fileKey);
  logger.info({ msg: "S3 file deleted", fileKey });
}

// ─── 4. Get Presigned Download URL ─────────────────────────────────────────

export async function getCourseFileDownloadUrl(fileKey: string): Promise<string> {
  const { getPresignedDownloadUrl } = await import("../utils/s3");
  return getPresignedDownloadUrl(fileKey, 3600);
}
