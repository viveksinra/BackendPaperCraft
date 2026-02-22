export interface CourseCompletionCertificateParams {
  studentName: string;
  courseName: string;
  instituteName: string;
  completionMessage?: string;
  certificateEnabled: boolean;
  certificateNumber?: string;
  downloadUrl?: string;
  myCoursesUrl: string;
  rateUrl: string;
}

export function courseCompletionCertificateEmail(params: CourseCompletionCertificateParams) {
  const {
    studentName,
    courseName,
    instituteName,
    completionMessage,
    certificateEnabled,
    certificateNumber,
    downloadUrl,
    myCoursesUrl = "#",
    rateUrl = "#",
  } = params;

  const subject = `Congratulations! You've completed ${courseName}`;

  const completionSection = completionMessage
    ? `<div style="background: #f0fdf4; border-left: 4px solid #16a34a; padding: 16px; margin: 20px 0; border-radius: 4px;">
        <p style="margin: 0; color: #166534;">${completionMessage}</p>
      </div>`
    : "";

  const certificateSection = certificateEnabled && certificateNumber
    ? `<div style="background: #fffbeb; border: 2px solid #f59e0b; border-radius: 8px; padding: 20px; margin: 20px 0; text-align: center;">
        <p style="margin: 0 0 4px; font-size: 14px; color: #92400e;">Certificate Number</p>
        <p style="margin: 0 0 16px; font-size: 20px; font-weight: 700; color: #78350f; letter-spacing: 1px;">${certificateNumber}</p>
        ${downloadUrl ? `<a href="${downloadUrl}" style="display: inline-block; background: #f59e0b; color: #78350f; padding: 10px 24px; border-radius: 6px; text-decoration: none; font-weight: 600;">Download Certificate</a>` : ""}
      </div>`
    : "";

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: linear-gradient(135deg, #059669, #0284c7); padding: 32px; text-align: center; border-radius: 8px 8px 0 0;">
        <h1 style="color: #fff; margin: 0; font-size: 24px;">Course Completed!</h1>
        <p style="color: #d1fae5; margin: 8px 0 0; font-size: 16px;">${courseName}</p>
      </div>
      <div style="padding: 32px; background: #fff; border: 1px solid #e2e8f0;">
        <p style="color: #334155;">Hi ${studentName},</p>
        <p style="color: #334155;">Congratulations on completing <strong>${courseName}</strong>! This is a great achievement.</p>
        ${completionSection}
        ${certificateSection}
        <div style="margin: 24px 0; padding: 16px; background: #f8fafc; border-radius: 8px; text-align: center;">
          <p style="margin: 0 0 12px; color: #475569; font-size: 14px;">How was your experience?</p>
          <a href="${rateUrl}" style="display: inline-block; background: #7c3aed; color: #fff; padding: 10px 24px; border-radius: 6px; text-decoration: none; font-weight: 600;">Rate This Course</a>
        </div>
        <div style="text-align: center; margin: 16px 0;">
          <a href="${myCoursesUrl}" style="color: #2563eb; text-decoration: underline; font-size: 14px;">View My Courses</a>
        </div>
        <p style="color: #64748b; font-size: 13px;">Keep learning!<br/>${instituteName}</p>
      </div>
    </div>
  `;

  return { subject, html };
}
