export interface HomeworkAssignedParams {
  studentName: string;
  className: string;
  title: string;
  dueDate: string;
  description?: string;
  lateSubmissionNote?: string;
  portalUrl?: string;
}

export function homeworkAssignedEmail(params: HomeworkAssignedParams) {
  const {
    studentName,
    className,
    title,
    dueDate,
    description,
    lateSubmissionNote,
    portalUrl = "#",
  } = params;

  const truncatedDesc = description
    ? description.length > 200
      ? description.slice(0, 200) + "..."
      : description
    : "";

  const subject = `New Homework: ${title} — Due ${dueDate}`;

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #1a1a2e;">New Homework Assigned</h2>
      <p>Hi ${studentName},</p>
      <p>You have new homework assigned in <strong>${className}</strong>:</p>
      <div style="background: #f8f9fa; border-left: 4px solid #4361ee; padding: 16px; margin: 16px 0;">
        <h3 style="margin: 0 0 8px;">${title}</h3>
        <p style="margin: 0 0 8px; color: #666;"><strong>Due:</strong> ${dueDate}</p>
        ${truncatedDesc ? `<p style="margin: 0; color: #666;">${truncatedDesc}</p>` : ""}
      </div>
      ${lateSubmissionNote ? `<p style="color: #e67e22;"><em>${lateSubmissionNote}</em></p>` : ""}
      <a href="${portalUrl}" style="display: inline-block; background: #4361ee; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin-top: 16px;">View Homework</a>
      <p style="color: #999; font-size: 12px; margin-top: 32px;">— PaperCraft</p>
    </div>
  `;

  const text = `Hi ${studentName},\n\nYou have new homework "${title}" in ${className}.\nDue: ${dueDate}\n${truncatedDesc ? `\n${truncatedDesc}\n` : ""}${lateSubmissionNote ? `\n${lateSubmissionNote}\n` : ""}\nView it at: ${portalUrl}\n\n— PaperCraft`;

  return { subject, html, text };
}
