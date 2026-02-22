export interface CourseEnrollmentWelcomeParams {
  studentName: string;
  courseName: string;
  teacherName: string;
  instituteName: string;
  welcomeMessage?: string;
  totalLessons: number;
  totalSections: number;
  estimatedDuration: number;
  coursePlayerUrl: string;
}

export function courseEnrollmentWelcomeEmail(params: CourseEnrollmentWelcomeParams) {
  const {
    studentName,
    courseName,
    teacherName,
    instituteName,
    welcomeMessage,
    totalLessons,
    totalSections,
    estimatedDuration,
    coursePlayerUrl = "#",
  } = params;

  const subject = `Welcome to ${courseName}!`;

  const welcomeSection = welcomeMessage
    ? `<div style="background: #f0f9ff; border-left: 4px solid #0284c7; padding: 16px; margin: 20px 0; border-radius: 4px;">
        <p style="margin: 0; font-style: italic; color: #0369a1;">"${welcomeMessage}"</p>
        <p style="margin: 8px 0 0; font-size: 14px; color: #64748b;">— ${teacherName}</p>
      </div>`
    : "";

  const hours = Math.floor(estimatedDuration / 60);
  const mins = estimatedDuration % 60;
  const durationText = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: #0f172a; padding: 32px; text-align: center; border-radius: 8px 8px 0 0;">
        <h1 style="color: #fff; margin: 0; font-size: 24px;">Welcome to Your Course!</h1>
      </div>
      <div style="padding: 32px; background: #fff; border: 1px solid #e2e8f0;">
        <p style="color: #334155;">Hi ${studentName},</p>
        <p style="color: #334155;">You're now enrolled in <strong>${courseName}</strong> at <strong>${instituteName}</strong>.</p>
        ${welcomeSection}
        <div style="background: #f8fafc; border-radius: 8px; padding: 20px; margin: 20px 0;">
          <h3 style="margin: 0 0 12px; color: #1e293b;">Course Overview</h3>
          <table style="width: 100%; font-size: 14px; color: #475569;">
            <tr><td style="padding: 4px 0;">Teacher</td><td style="text-align: right; font-weight: 600;">${teacherName}</td></tr>
            <tr><td style="padding: 4px 0;">Sections</td><td style="text-align: right; font-weight: 600;">${totalSections}</td></tr>
            <tr><td style="padding: 4px 0;">Lessons</td><td style="text-align: right; font-weight: 600;">${totalLessons}</td></tr>
            <tr><td style="padding: 4px 0;">Estimated Duration</td><td style="text-align: right; font-weight: 600;">${durationText}</td></tr>
          </table>
        </div>
        <div style="text-align: center; margin: 24px 0;">
          <a href="${coursePlayerUrl}" style="display: inline-block; background: #2563eb; color: #fff; padding: 12px 32px; border-radius: 6px; text-decoration: none; font-weight: 600;">Start Learning</a>
        </div>
        <p style="color: #64748b; font-size: 13px;">Happy learning!<br/>${instituteName}</p>
      </div>
    </div>
  `;

  return { subject, html };
}
