import { Worker, Job } from "bullmq";
import { getRedis, isRedisAvailable } from "../queue/redisClient";
import { sendEmail } from "../services/emailService";
import { logger } from "../shared/logger";

const QUEUE_NAME = "notification_email";

export interface NotificationEmailJobData {
  recipientEmail: string;
  recipientName: string;
  type: string;
  subject: string;
  title: string;
  body: string;
  actionUrl?: string;
  companyName?: string;
}

export function startNotificationEmailDispatcherWorker(): Worker | null {
  if (!isRedisAvailable()) {
    logger.warn({ msg: "Redis not available; skipping notification email dispatcher worker" });
    return null;
  }

  const connection = getRedis();

  const worker = new Worker(
    QUEUE_NAME,
    async (job: Job<NotificationEmailJobData>) => {
      const { recipientEmail, recipientName, type, subject, title, body, actionUrl, companyName } = job.data;

      logger.info({
        msg: "Sending notification email",
        type,
        recipientEmail,
        jobId: job.id,
      });

      const appName = process.env.APP_NAME || "PaperCraft";
      const frontendUrl = process.env.FRONTEND_URL || "http://localhost:3039";
      const fullActionUrl = actionUrl ? `${frontendUrl}${actionUrl}` : frontendUrl;

      const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; background-color: #f4f4f4; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .card { background: #fff; border-radius: 12px; padding: 32px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
    .header { text-align: center; margin-bottom: 24px; }
    .header h1 { color: #1976d2; font-size: 20px; margin: 0; }
    .title { font-size: 18px; font-weight: 600; margin-bottom: 12px; }
    .body { color: #555; margin-bottom: 24px; }
    .btn { display: inline-block; background: #1976d2; color: #fff; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-weight: 600; }
    .btn-container { text-align: center; margin: 24px 0; }
    .footer { text-align: center; color: #999; font-size: 12px; margin-top: 24px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="card">
      <div class="header"><h1>${companyName || appName}</h1></div>
      <p>Hi ${recipientName},</p>
      <div class="title">${title}</div>
      <div class="body">${body}</div>
      ${actionUrl ? `<div class="btn-container"><a href="${fullActionUrl}" class="btn">View Details</a></div>` : ""}
      <div class="footer">
        <p>You received this because you have notifications enabled on ${appName}.</p>
      </div>
    </div>
  </div>
</body>
</html>`.trim();

      await sendEmail({
        to: recipientEmail,
        subject,
        text: `${title}\n\n${body}${actionUrl ? `\n\nView: ${fullActionUrl}` : ""}`,
        html,
      });

      return { type, recipientEmail, sent: true };
    },
    { connection, concurrency: 3 }
  );

  worker.on("failed", (job, error) => {
    logger.error({
      msg: "Notification email job failed",
      jobId: job?.id,
      error: error.message,
    });
  });

  logger.info({ msg: "Notification email dispatcher worker started", queue: QUEUE_NAME });
  return worker;
}
