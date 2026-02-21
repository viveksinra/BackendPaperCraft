import nodemailer from "nodemailer";
import { logger } from "../shared/logger";

// SMTP configuration from environment variables
const smtpConfig = {
  host: process.env.SMTP_HOST || "smtp.gmail.com",
  port: parseInt(process.env.SMTP_PORT || "587", 10),
  secure: process.env.SMTP_SECURE === "true",
  auth: {
    user: process.env.SMTP_USER || "",
    pass: process.env.SMTP_PASS || "",
  },
};

const defaultFrom = process.env.EMAIL_DEFAULT_FROM || process.env.SMTP_USER || "noreply@example.com";
const appName = process.env.APP_NAME || "PaperCraft";
const frontendUrl = process.env.FRONTEND_URL || "http://localhost:3039";

// Create reusable transporter
const transporter = nodemailer.createTransport(smtpConfig);

/**
 * Verify SMTP connection on startup
 */
export async function verifyEmailConnection(): Promise<boolean> {
  try {
    if (!smtpConfig.auth.user || !smtpConfig.auth.pass) {
      logger.warn({ msg: "Email service not configured - missing SMTP credentials" });
      return false;
    }
    await transporter.verify();
    logger.info({ msg: "Email service connected successfully" });
    return true;
  } catch (error) {
    logger.error({
      msg: "Email service connection failed",
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

interface SendEmailOptions {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

/**
 * Send an email
 */
export async function sendEmail(options: SendEmailOptions): Promise<boolean> {
  try {
    if (!smtpConfig.auth.user || !smtpConfig.auth.pass) {
      logger.warn({ msg: "Email not sent - SMTP not configured", to: options.to });
      return false;
    }

    const mailOptions = {
      from: `"${appName}" <${defaultFrom}>`,
      to: options.to,
      subject: options.subject,
      text: options.text,
      html: options.html || options.text,
    };

    const info = await transporter.sendMail(mailOptions);
    logger.info({
      msg: "Email sent successfully",
      to: options.to,
      messageId: info.messageId,
    });
    return true;
  } catch (error) {
    logger.error({
      msg: "Failed to send email",
      to: options.to,
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

interface InviteEmailParams {
  inviteeEmail: string;
  inviterEmail: string;
  companyName: string;
  role: string;
  inviteCode: string;
}

/**
 * Send team invitation email
 */
export async function sendInviteEmail(params: InviteEmailParams): Promise<boolean> {
  const { inviteeEmail, inviterEmail, companyName, role, inviteCode } = params;
  const inviteUrl = `${frontendUrl}/invite/${inviteCode}`;

  const subject = `You're invited to join ${companyName} on ${appName}`;

  const text = `
Hello,

${inviterEmail} has invited you to join "${companyName}" as a ${role} on ${appName}.

Click the link below to accept the invitation:
${inviteUrl}

This invitation will expire in 7 days.

If you did not expect this invitation, you can safely ignore this email.

Best regards,
The ${appName} Team
`.trim();

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; background-color: #f4f4f4; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .card { background: #ffffff; border-radius: 12px; padding: 40px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
    .header { text-align: center; margin-bottom: 30px; }
    .header h1 { color: #1976d2; margin: 0; font-size: 24px; }
    .content { margin-bottom: 30px; }
    .invite-box { background: #f5f5f5; border-radius: 8px; padding: 20px; text-align: center; margin: 20px 0; }
    .invite-box .company { font-size: 20px; font-weight: 600; color: #333; }
    .invite-box .role { display: inline-block; background: #e3f2fd; color: #1976d2; padding: 4px 12px; border-radius: 16px; font-size: 14px; margin-top: 8px; }
    .btn { display: inline-block; background: #1976d2; color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 600; font-size: 16px; }
    .btn:hover { background: #1565c0; }
    .btn-container { text-align: center; margin: 30px 0; }
    .footer { text-align: center; color: #666; font-size: 14px; margin-top: 30px; }
    .note { font-size: 13px; color: #888; margin-top: 20px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="card">
      <div class="header">
        <h1>${appName}</h1>
      </div>
      <div class="content">
        <p>Hello,</p>
        <p><strong>${inviterEmail}</strong> has invited you to join their team:</p>
        <div class="invite-box">
          <div class="company">${companyName}</div>
          <div class="role">${role}</div>
        </div>
        <div class="btn-container">
          <a href="${inviteUrl}" class="btn">Accept Invitation</a>
        </div>
        <p class="note">This invitation will expire in 7 days. If you did not expect this invitation, you can safely ignore this email.</p>
      </div>
      <div class="footer">
        <p>Best regards,<br>The ${appName} Team</p>
      </div>
    </div>
  </div>
</body>
</html>
`.trim();

  return sendEmail({
    to: inviteeEmail,
    subject,
    text,
    html,
  });
}

