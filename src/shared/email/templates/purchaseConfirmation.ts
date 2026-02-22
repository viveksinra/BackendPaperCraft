export interface PurchaseConfirmationParams {
  buyerName: string;
  orgName: string;
  productTitle: string;
  amount: number;
  currency: string;
  addOns?: Array<{ title: string; price: number }>;
  receiptUrl?: string;
  isParentPurchase?: boolean;
  studentName?: string;
  contentUrl?: string;
}

export function purchaseConfirmationEmail(params: PurchaseConfirmationParams) {
  const {
    buyerName,
    orgName,
    productTitle,
    amount,
    currency,
    addOns = [],
    receiptUrl,
    isParentPurchase = false,
    studentName,
    contentUrl = "#",
  } = params;

  const currencySymbol = currency === "GBP" ? "£" : "₹";

  const subject = `Purchase Confirmed: ${productTitle}`;

  const addOnRows = addOns
    .map(
      (a) =>
        `<tr><td style="padding: 4px 0;">${a.title}</td><td style="padding: 4px 0; text-align: right;">${currencySymbol}${a.price.toFixed(2)}</td></tr>`
    )
    .join("");

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #1a1a2e;">Purchase Confirmed</h2>
      <p>Dear ${buyerName},</p>
      <p>Thank you for your purchase from <strong>${orgName}</strong>.</p>
      <div style="background: #e8f5e9; border-left: 4px solid #4caf50; padding: 16px; margin: 16px 0;">
        <p style="margin: 0 0 8px;"><strong>Product:</strong> ${productTitle}</p>
        <p style="margin: 0 0 8px;"><strong>Amount:</strong> ${currencySymbol}${amount.toFixed(2)}</p>
        ${addOns.length > 0 ? `
          <table style="width: 100%; margin-top: 8px; border-top: 1px solid #ccc; padding-top: 8px;">
            <tr><td colspan="2" style="font-weight: bold; padding-bottom: 4px;">Add-ons:</td></tr>
            ${addOnRows}
          </table>
        ` : ""}
      </div>
      ${isParentPurchase && studentName ? `<p>Access has been granted to <strong>${studentName}</strong>.</p>` : ""}
      ${receiptUrl ? `<p><a href="${receiptUrl}" style="color: #4361ee;">View Receipt</a></p>` : ""}
      <a href="${contentUrl}" style="display: inline-block; background: #4361ee; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin-top: 16px;">Access Now</a>
      <p style="color: #999; font-size: 12px; margin-top: 32px;">For questions, contact ${orgName}.</p>
      <p style="color: #999; font-size: 12px;">— ${orgName} via PaperCraft</p>
    </div>
  `;

  const text = `Dear ${buyerName},\n\nThank you for your purchase from ${orgName}.\n\nProduct: ${productTitle}\nAmount: ${currencySymbol}${amount.toFixed(2)}${addOns.length > 0 ? `\nAdd-ons: ${addOns.map((a) => `${a.title} (${currencySymbol}${a.price.toFixed(2)})`).join(", ")}` : ""}${isParentPurchase && studentName ? `\n\nAccess has been granted to ${studentName}.` : ""}${receiptUrl ? `\n\nReceipt: ${receiptUrl}` : ""}\n\nAccess your content: ${contentUrl}\n\nFor questions, contact ${orgName}.\n— ${orgName} via PaperCraft`;

  return { subject, html, text };
}
