export interface AnnouncementNotificationParams {
  orgName: string;
  title: string;
  body: string;
  portalUrl?: string;
}

export function announcementNotificationEmail(params: AnnouncementNotificationParams) {
  const { orgName, title, body, portalUrl = "#" } = params;

  const truncatedBody = body.length > 500 ? body.slice(0, 500) + "..." : body;

  const subject = `${orgName}: ${title}`;

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #1a1a2e;">${title}</h2>
      <p style="color: #666; font-size: 14px;">From ${orgName}</p>
      <div style="background: #f8f9fa; padding: 16px; margin: 16px 0; border-radius: 8px;">
        <p style="margin: 0; white-space: pre-wrap;">${truncatedBody}</p>
      </div>
      <a href="${portalUrl}" style="display: inline-block; background: #4361ee; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin-top: 16px;">Read Full Announcement</a>
      <p style="color: #999; font-size: 12px; margin-top: 32px;">— ${orgName} via PaperCraft</p>
    </div>
  `;

  const text = `${title}\nFrom ${orgName}\n\n${truncatedBody}\n\nRead more at: ${portalUrl}\n\n— ${orgName} via PaperCraft`;

  return { subject, html, text };
}
