export interface DripContentAvailableParams {
  studentName: string;
  courseName: string;
  sectionTitle: string;
  lessonTitle: string;
  lessonType: string;
  continueUrl: string;
}

export function dripContentAvailableEmail(params: DripContentAvailableParams) {
  const {
    studentName,
    courseName,
    sectionTitle,
    lessonTitle,
    lessonType,
    continueUrl = "#",
  } = params;

  const subject = `New lesson available: ${lessonTitle}`;

  const typeLabel: Record<string, string> = {
    video: "Video Lesson",
    pdf: "PDF Lesson",
    text: "Text Lesson",
    quiz: "Quiz",
    resource: "Resource",
  };

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: #1e40af; padding: 32px; text-align: center; border-radius: 8px 8px 0 0;">
        <h1 style="color: #fff; margin: 0; font-size: 24px;">New Lesson Available!</h1>
      </div>
      <div style="padding: 32px; background: #fff; border: 1px solid #e2e8f0;">
        <p style="color: #334155;">Hi ${studentName},</p>
        <p style="color: #334155;">A new lesson is now available in your course <strong>${courseName}</strong>:</p>
        <div style="background: #f8fafc; border-radius: 8px; padding: 20px; margin: 20px 0;">
          <p style="margin: 0 0 4px; font-size: 12px; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px;">${sectionTitle}</p>
          <p style="margin: 0 0 8px; font-size: 18px; font-weight: 600; color: #1e293b;">${lessonTitle}</p>
          <span style="display: inline-block; background: #dbeafe; color: #1d4ed8; padding: 4px 10px; border-radius: 4px; font-size: 12px; font-weight: 600;">${typeLabel[lessonType] || lessonType}</span>
        </div>
        <div style="text-align: center; margin: 24px 0;">
          <a href="${continueUrl}" style="display: inline-block; background: #2563eb; color: #fff; padding: 12px 32px; border-radius: 6px; text-decoration: none; font-weight: 600;">Continue Learning</a>
        </div>
      </div>
    </div>
  `;

  return { subject, html };
}
