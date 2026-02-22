export interface FeeReminderParams {
  recipientName: string;
  orgName: string;
  className: string;
  amount: number;
  amountPaid: number;
  currency: string;
  dueDate?: string;
  portalUrl?: string;
}

export function feeReminderEmail(params: FeeReminderParams) {
  const {
    recipientName,
    orgName,
    className,
    amount,
    amountPaid,
    currency,
    dueDate,
    portalUrl = "#",
  } = params;

  const outstanding = amount - amountPaid;
  const currencySymbol = currency === "GBP" ? "£" : "₹";

  const subject = `Payment Reminder: ${className} — ${currencySymbol}${outstanding.toFixed(2)} due`;

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #1a1a2e;">Payment Reminder</h2>
      <p>Hi ${recipientName},</p>
      <p>This is a reminder about an outstanding fee for <strong>${className}</strong> at <strong>${orgName}</strong>:</p>
      <div style="background: #fff3cd; border-left: 4px solid #ffc107; padding: 16px; margin: 16px 0;">
        <p style="margin: 0 0 8px;"><strong>Outstanding:</strong> ${currencySymbol}${outstanding.toFixed(2)}</p>
        <p style="margin: 0 0 8px;"><strong>Total Fee:</strong> ${currencySymbol}${amount.toFixed(2)}</p>
        ${amountPaid > 0 ? `<p style="margin: 0 0 8px;"><strong>Paid:</strong> ${currencySymbol}${amountPaid.toFixed(2)}</p>` : ""}
        ${dueDate ? `<p style="margin: 0;"><strong>Due:</strong> ${dueDate}</p>` : ""}
      </div>
      <a href="${portalUrl}" style="display: inline-block; background: #4361ee; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin-top: 16px;">View Fee Details</a>
      <p style="color: #999; font-size: 12px; margin-top: 32px;">This is an automated reminder. If you have already made this payment, please disregard this message.</p>
      <p style="color: #999; font-size: 12px;">— ${orgName} via PaperCraft</p>
    </div>
  `;

  const text = `Hi ${recipientName},\n\nPayment reminder for ${className} at ${orgName}.\nOutstanding: ${currencySymbol}${outstanding.toFixed(2)}\nTotal: ${currencySymbol}${amount.toFixed(2)}${amountPaid > 0 ? `\nPaid: ${currencySymbol}${amountPaid.toFixed(2)}` : ""}${dueDate ? `\nDue: ${dueDate}` : ""}\n\nView at: ${portalUrl}\n\n— ${orgName} via PaperCraft`;

  return { subject, html, text };
}
