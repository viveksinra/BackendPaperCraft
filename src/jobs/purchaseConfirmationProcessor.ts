import { Worker, Job } from "bullmq";
import path from "path";
import { getRedis, isRedisAvailable } from "../queue/redisClient";
import { PurchaseModel } from "../models/purchase";
import { ProductModel } from "../models/product";
import { sendEmail } from "../services/emailService";
import { purchaseConfirmationEmail } from "../shared/email/templates/purchaseConfirmation";
import { accessGrantedEmail } from "../shared/email/templates/accessGranted";
import { addNotificationJob } from "../queue/queues";
import { logger } from "../shared/logger";

const User = require(path.join(__dirname, "..", "..", "Models", "User"));
const Company = require(path.join(__dirname, "..", "..", "Models", "Company"));

const QUEUE_NAME = "purchase_confirmation";

export interface PurchaseConfirmationJobData {
  purchaseId: string;
}

export function startPurchaseConfirmationWorker(): Worker | null {
  if (!isRedisAvailable()) {
    logger.warn({ msg: "Redis not available; skipping purchase confirmation worker" });
    return null;
  }

  const connection = getRedis();

  const worker = new Worker(
    QUEUE_NAME,
    async (job: Job<PurchaseConfirmationJobData>) => {
      const { purchaseId } = job.data;

      logger.info({ msg: "Processing purchase confirmation", purchaseId, jobId: job.id });

      const purchase = await PurchaseModel.findById(purchaseId);
      if (!purchase) {
        logger.warn({ msg: "Purchase not found for confirmation", purchaseId });
        return;
      }

      const product = await ProductModel.findById(purchase.productId);
      const buyer = await User.findById(purchase.buyerUserId);
      const company = await Company.findById(purchase.companyId);

      if (!buyer) {
        logger.warn({ msg: "Buyer not found for confirmation", purchaseId });
        return;
      }

      const buyerName = `${buyer.firstName || ""} ${buyer.lastName || ""}`.trim() || buyer.email;
      const orgName = company?.name || "Your Institute";

      // Send confirmation email to buyer
      const emailData = purchaseConfirmationEmail({
        buyerName,
        orgName,
        productTitle: purchase.productTitle,
        amount: purchase.amount,
        currency: purchase.currency,
        addOns: purchase.addOns?.map((a) => ({ title: a.title, price: a.price })) || [],
        receiptUrl: purchase.receiptUrl || undefined,
        isParentPurchase: purchase.buyerRole === "parent",
        studentName: undefined, // Resolved below if parent
      });

      // If parent purchase, resolve student name
      if (purchase.buyerRole === "parent") {
        const student = await User.findById(purchase.studentUserId);
        if (student) {
          const studentName = `${student.firstName || ""} ${student.lastName || ""}`.trim() || student.email;
          emailData.html = emailData.html.replace(
            "Access has been granted to <strong></strong>.",
            `Access has been granted to <strong>${studentName}</strong>.`
          );

          // Send access granted email to student
          const accessEmail = accessGrantedEmail({
            studentName,
            buyerName,
            orgName,
            productTitle: purchase.productTitle,
          });

          try {
            await sendEmail({
              to: student.email,
              subject: accessEmail.subject,
              text: accessEmail.text,
              html: accessEmail.html,
            });
          } catch (err) {
            logger.warn({ msg: "Failed to send access granted email", error: (err as Error).message });
          }

          // Also send notification to student
          try {
            await addNotificationJob({
              type: "purchase_access_granted",
              recipientUserIds: [purchase.studentUserId.toString()],
              title: "New Content Available",
              body: `${buyerName} purchased ${purchase.productTitle} for you.`,
              referenceType: "purchase",
              referenceId: purchaseId,
            });
          } catch (err) {
            logger.warn({ msg: "Failed to queue student notification", error: (err as Error).message });
          }
        }
      }

      try {
        await sendEmail({
          to: buyer.email,
          subject: emailData.subject,
          text: emailData.text,
          html: emailData.html,
        });
      } catch (err) {
        logger.warn({ msg: "Failed to send purchase confirmation email", error: (err as Error).message });
      }

      logger.info({
        msg: "Purchase confirmation processed",
        purchaseId,
        productTitle: purchase.productTitle,
      });
    },
    {
      connection,
      concurrency: 3,
    }
  );

  worker.on("failed", (job, error) => {
    logger.error({
      msg: "Purchase confirmation job failed",
      jobId: job?.id,
      error: error.message,
    });
  });

  logger.info({ msg: "Purchase confirmation worker started", queue: QUEUE_NAME });
  return worker;
}
