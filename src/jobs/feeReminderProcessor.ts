import { Worker, Job } from "bullmq";
import path from "path";
import { getRedis, isRedisAvailable } from "../queue/redisClient";
import { logger } from "../shared/logger";
import { FeeRecordModel } from "../models/feeRecord";
import { ParentLinkModel } from "../models/parentLink";
import { feeReminderEmail } from "../shared/email/templates/feeReminder";

const User = require(path.join(__dirname, "..", "..", "Models", "User"));

const QUEUE_NAME = "fee_reminder";

export interface FeeReminderJobData {
  companyId: string;
  classId: string;
  studentUserIds: string[];
  senderEmail: string;
  orgName: string;
  className: string;
}

export function startFeeReminderWorker(): Worker | null {
  if (!isRedisAvailable()) {
    logger.warn({ msg: "Redis not available; skipping fee reminder worker" });
    return null;
  }

  const connection = getRedis();

  const worker = new Worker(
    QUEUE_NAME,
    async (job: Job<FeeReminderJobData>) => {
      const { companyId, classId, studentUserIds, orgName, className } = job.data;
      logger.info({ msg: "Processing fee reminder", jobId: job.id, studentCount: studentUserIds.length });

      let sentCount = 0;
      let failedCount = 0;

      for (const studentUserId of studentUserIds) {
        try {
          const student = await User.findById(studentUserId, "name email").lean();
          if (!student) continue;

          const feeRecord = await FeeRecordModel.findOne({
            classId,
            studentUserId,
          }).lean();
          if (!feeRecord) continue;

          // Generate email for student
          const emailData = feeReminderEmail({
            recipientName: student.name || "Student",
            orgName,
            className,
            amount: feeRecord.amount,
            amountPaid: feeRecord.amountPaid,
            currency: feeRecord.currency,
            dueDate: feeRecord.dueDate
              ? new Date(feeRecord.dueDate).toLocaleDateString("en-GB")
              : undefined,
          });

          // In production, send via email service
          logger.info({ msg: "Fee reminder email prepared", to: student.email, subject: emailData.subject });
          sentCount++;

          // Also send to linked parents
          const parentLinks = await ParentLinkModel.find({
            studentUserId,
            status: "active",
          }).lean();

          for (const link of parentLinks) {
            const parent = await User.findById(link.parentUserId, "name email").lean();
            if (parent) {
              const parentEmail = feeReminderEmail({
                recipientName: parent.name || "Parent",
                orgName,
                className,
                amount: feeRecord.amount,
                amountPaid: feeRecord.amountPaid,
                currency: feeRecord.currency,
                dueDate: feeRecord.dueDate
                  ? new Date(feeRecord.dueDate).toLocaleDateString("en-GB")
                  : undefined,
              });
              logger.info({ msg: "Fee reminder email to parent", to: parent.email, subject: parentEmail.subject });
              sentCount++;
            }
          }

          // Update fee record tracking
          await FeeRecordModel.updateOne(
            { _id: feeRecord._id },
            {
              $set: { lastReminderSentAt: new Date() },
              $inc: { reminderCount: 1 },
            }
          );
        } catch (error: any) {
          logger.error({
            msg: "Fee reminder failed for student",
            studentUserId,
            error: error.message,
          });
          failedCount++;
        }
      }

      return { sentCount, failedCount };
    },
    {
      connection,
      concurrency: 2,
    }
  );

  worker.on("failed", (job, error) => {
    logger.error({
      msg: "Fee reminder job failed",
      jobId: job?.id,
      error: error.message,
    });
  });

  logger.info({ msg: "Fee reminder worker started", queue: QUEUE_NAME });
  return worker;
}
