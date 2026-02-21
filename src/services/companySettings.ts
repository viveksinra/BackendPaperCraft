import { Types } from "mongoose";
import {
  CompanySettingsModel,
  CompanySettingsDocument,
  BrandingSettings,
  SeoDefaults,
  mergeBrandingSettings,
  mergeSeoDefaults,
} from "../models/companySettings";

const CACHE_TTL_MS = Number(process.env.COMPANY_SETTINGS_CACHE_MS || 60_000);
const DEFAULT_TENANT_ID = process.env.DEFAULT_TENANT_ID || "devTenant";

type CacheEntry = {
  expiresAt: number;
  branding: BrandingSettings;
  seoDefaults: SeoDefaults;
};

const cache = new Map<string, CacheEntry>();

function cacheKey(companyId: string | Types.ObjectId) {
  return companyId.toString();
}

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

export async function ensureCompanySettingsDocument(
  companyId: string,
  tenantId: string
): Promise<CompanySettingsDocument> {
  let doc = await CompanySettingsModel.findOne({ companyId });
  if (!doc) {
    doc = await CompanySettingsModel.create({
      companyId,
      tenantId: tenantId || DEFAULT_TENANT_ID,
      branding: mergeBrandingSettings(),
      seoDefaults: mergeSeoDefaults(),
      qa: { warnings: [] },
    });
    return doc;
  }
  if (!doc.tenantId && tenantId) {
    doc.tenantId = tenantId;
    await doc.save();
  }
  return doc;
}

export async function getCompanySettingsSnapshot(
  companyId: string,
  tenantId: string,
  options?: { force?: boolean }
): Promise<{ branding: BrandingSettings; seoDefaults: SeoDefaults }> {
  const key = cacheKey(companyId);
  const now = Date.now();
  if (!options?.force) {
    const hit = cache.get(key);
    if (hit && hit.expiresAt > now) {
      return {
        branding: deepClone(hit.branding),
        seoDefaults: deepClone(hit.seoDefaults),
      };
    }
  }

  const doc = await ensureCompanySettingsDocument(companyId, tenantId);
  const plain = doc.toObject();
  const snapshot = {
    branding: mergeBrandingSettings(plain.branding),
    seoDefaults: mergeSeoDefaults(plain.seoDefaults),
  };

  cache.set(key, {
    branding: deepClone(snapshot.branding),
    seoDefaults: deepClone(snapshot.seoDefaults),
    expiresAt: now + CACHE_TTL_MS,
  });

  return snapshot;
}

export async function getCompanyBranding(
  companyId: string,
  tenantId: string
): Promise<BrandingSettings> {
  const snapshot = await getCompanySettingsSnapshot(companyId, tenantId);
  return snapshot.branding;
}

export async function getCompanySeoDefaults(
  companyId: string,
  tenantId: string
): Promise<SeoDefaults> {
  const snapshot = await getCompanySettingsSnapshot(companyId, tenantId);
  return snapshot.seoDefaults;
}

export function invalidateCompanySettingsCache(companyId: string | Types.ObjectId) {
  cache.delete(cacheKey(companyId));
}

export { mergeBrandingSettings, mergeSeoDefaults };


