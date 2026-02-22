export interface PaymentFailedParams {
  buyerName: string;
  productTitle: string;
  failureReason: string;
  productUrl?: string;
}

export function paymentFailedEmail(params: PaymentFailedParams) {
  const {
    buyerName,
    productTitle,
    failureReason,
    productUrl = "#",
  } = params;

  const subject = `Payment Failed: ${productTitle}`;

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #1a1a2e;">Payment Failed</h2>
      <p>Dear ${buyerName},</p>
      <p>Unfortunately, your payment for <strong>${productTitle}</strong> could not be processed.</p>
      <div style="background: #ffebee; border-left: 4px solid #f44336; padding: 16px; margin: 16px 0;">
        <p style="margin: 0;"><strong>Reason:</strong> ${failureReason}</p>
      </div>
      <a href="${productUrl}" style="display: inline-block; background: #4361ee; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin-top: 16px;">Try Again</a>
      <p style="color: #999; font-size: 12px; margin-top: 32px;">If this problem persists, please contact your bank or try a different card.</p>
      <p style="color: #999; font-size: 12px;">— PaperCraft</p>
    </div>
  `;

  const text = `Dear ${buyerName},\n\nUnfortunately, your payment for ${productTitle} could not be processed.\n\nReason: ${failureReason}\n\nTry again: ${productUrl}\n\nIf this problem persists, please contact your bank or try a different card.\n— PaperCraft`;

  return { subject, html, text };
}
