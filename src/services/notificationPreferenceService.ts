import { Types } from "mongoose";
import {
  NotificationPreferenceModel,
  NotificationPreferenceDocument,
} from "../models/notificationPreference";
import type { NotificationCategory } from "../models/notification";
import type { DeliveryChannel } from "../models/notificationPreference";
import { logger } from "../shared/logger";

// ─── Helpers ───────────────────────────────────────────────────────────────

function toObjectId(id: string): Types.ObjectId {
  if (!Types.ObjectId.isValid(id)) {
    throw Object.assign(new Error("Invalid ObjectId"), { status: 400 });
  }
  return new Types.ObjectId(id);
}

// ─── 1. Get or Create Preferences ─────────────────────────────────────────

export async function getOrCreatePreferences(
  tenantId: string,
  companyId: string,
  userId: string
): Promise<NotificationPreferenceDocument> {
  const companyOid = toObjectId(companyId);
  const userOid = toObjectId(userId);

  let prefs = await NotificationPreferenceModel.findOne({
    tenantId,
    companyId: companyOid,
    userId: userOid,
  });

  if (!prefs) {
    prefs = await NotificationPreferenceModel.create({
      tenantId,
      companyId: companyOid,
      userId: userOid,
    });
    logger.info({
      msg: "Created default notification preferences",
      userId,
      companyId,
    });
  }

  return prefs;
}

// ─── 2. Update Preferences ────────────────────────────────────────────────

export async function updatePreferences(
  tenantId: string,
  companyId: string,
  userId: string,
  updates: {
    globalEnabled?: boolean;
    emailDigestFrequency?: string;
    quietHoursEnabled?: boolean;
    quietHoursStart?: string;
    quietHoursEnd?: string;
    categories?: Array<{
      category: string;
      enabled?: boolean;
      channels?: string[];
    }>;
  }
): Promise<NotificationPreferenceDocument> {
  const prefs = await getOrCreatePreferences(tenantId, companyId, userId);

  if (updates.globalEnabled !== undefined) prefs.globalEnabled = updates.globalEnabled;
  if (updates.emailDigestFrequency) {
    prefs.emailDigestFrequency = updates.emailDigestFrequency as any;
  }
  if (updates.quietHoursEnabled !== undefined) prefs.quietHoursEnabled = updates.quietHoursEnabled;
  if (updates.quietHoursStart) prefs.quietHoursStart = updates.quietHoursStart;
  if (updates.quietHoursEnd) prefs.quietHoursEnd = updates.quietHoursEnd;

  if (updates.categories) {
    for (const catUpdate of updates.categories) {
      const existing = prefs.categories.find(
        (c) => c.category === catUpdate.category
      );
      if (existing) {
        if (catUpdate.enabled !== undefined) existing.enabled = catUpdate.enabled;
        if (catUpdate.channels) existing.channels = catUpdate.channels as DeliveryChannel[];
      }
    }
  }

  await prefs.save();
  return prefs;
}

// ─── 3. Check if category is enabled + channels ───────────────────────────

export async function getCategoryChannels(
  tenantId: string,
  companyId: string,
  userId: string,
  category: NotificationCategory
): Promise<{ enabled: boolean; channels: DeliveryChannel[] }> {
  const prefs = await getOrCreatePreferences(tenantId, companyId, userId);

  if (!prefs.globalEnabled) {
    return { enabled: false, channels: [] };
  }

  const catPref = prefs.categories.find((c) => c.category === category);
  if (!catPref || !catPref.enabled) {
    return { enabled: false, channels: [] };
  }

  return { enabled: true, channels: catPref.channels };
}

// ─── 4. Check quiet hours ─────────────────────────────────────────────────

export async function isInQuietHours(
  tenantId: string,
  companyId: string,
  userId: string
): Promise<boolean> {
  const prefs = await getOrCreatePreferences(tenantId, companyId, userId);

  if (!prefs.quietHoursEnabled) return false;

  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  const [startH, startM] = prefs.quietHoursStart.split(":").map(Number);
  const [endH, endM] = prefs.quietHoursEnd.split(":").map(Number);
  const startMinutes = startH * 60 + startM;
  const endMinutes = endH * 60 + endM;

  if (startMinutes <= endMinutes) {
    return currentMinutes >= startMinutes && currentMinutes < endMinutes;
  }
  // Overnight quiet hours (e.g. 22:00 - 07:00)
  return currentMinutes >= startMinutes || currentMinutes < endMinutes;
}
