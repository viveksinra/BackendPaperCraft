export interface AccessGrantedParams {
  studentName: string;
  buyerName: string;
  orgName: string;
  productTitle: string;
  contentUrl?: string;
}

export function accessGrantedEmail(params: AccessGrantedParams) {
  const {
    studentName,
    buyerName,
    orgName,
    productTitle,
    contentUrl = "#",
  } = params;

  const subject = `You now have access to: ${productTitle}`;

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #1a1a2e;">Access Granted</h2>
      <p>Dear ${studentName},</p>
      <p><strong>${buyerName}</strong> has purchased <strong>${productTitle}</strong> for you from <strong>${orgName}</strong>.</p>
      <p>You can now access this content in your portal.</p>
      <a href="${contentUrl}" style="display: inline-block; background: #4361ee; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin-top: 16px;">Access Now</a>
      <p style="color: #999; font-size: 12px; margin-top: 32px;">— ${orgName} via PaperCraft</p>
    </div>
  `;

  const text = `Dear ${studentName},\n\n${buyerName} has purchased ${productTitle} for you from ${orgName}.\n\nYou can now access this content in your portal.\n\nAccess: ${contentUrl}\n\n— ${orgName} via PaperCraft`;

  return { subject, html, text };
}
