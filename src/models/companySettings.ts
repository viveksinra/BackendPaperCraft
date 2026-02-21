import { Document, Model, Schema, Types, model, models } from "mongoose";

export interface BrandingSettings {
  logo: string | null;
  favicon: string | null;
  displayName: string | null;
  tagline: string | null;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  backgroundColor: string;
  surfaceColor: string;
  textColor: string;
  fontFamily: string;
  headingFont: string;
  customCss: string | null;
}

export interface CustomMetaTag {
  name?: string;
  property?: string;
  content: string;
}

export interface SeoDefaults {
  metaTitleTemplate: string;
  metaDescriptionTemplate: string;
  schemaType: string;
  robotsMode: "standard" | "custom";
  robotsRules: string;
  canonicalMode: "base-path" | "custom-domain" | "dataset-field";
  canonicalPattern: string;
  ogTitleTemplate: string;
  ogDescriptionTemplate: string;
  ogImage: string;
  twitterCard: "summary" | "summary_large_image";
  twitterHandle: string;
  noindexBelowScore: number;
  sitemapPriority: number;
  sitemapChangeFreq: "always" | "hourly" | "daily" | "weekly" | "monthly" | "yearly" | "never";
  injectFaqSchema: boolean;
  customMetaTags: CustomMetaTag[];
}

export interface QaSnapshot {
  warnings: string[];
  lastAuditAt?: Date;
  lastAuditScore?: number;
  updatedBy?: string;
}

export interface CompanySettingsDocument extends Document {
  companyId: Types.ObjectId;
  tenantId: string;
  branding: BrandingSettings;
  seoDefaults: SeoDefaults;
  qa: QaSnapshot;
  createdAt: Date;
  updatedAt: Date;
}

export const BRANDING_DEFAULTS: BrandingSettings = {
  logo: null,
  favicon: null,
  displayName: null,
  tagline: null,
  primaryColor: "#1976d2",
  secondaryColor: "#455a64",
  accentColor: "#ff9800",
  backgroundColor: "#ffffff",
  surfaceColor: "#f5f5f5",
  textColor: "#1e293b",
  fontFamily: "Inter, sans-serif",
  headingFont: "Inter, sans-serif",
  customCss: null,
};

export const SEO_DEFAULTS: SeoDefaults = {
  metaTitleTemplate: "{page_title} | {company_name}",
  metaDescriptionTemplate: "{summary}",
  schemaType: "Article",
  robotsMode: "standard",
  robotsRules: "User-agent: *\nAllow: /",
  canonicalMode: "base-path",
  canonicalPattern: "{base_url}/{slug}",
  ogTitleTemplate: "{page_title} | {company_name}",
  ogDescriptionTemplate: "{summary}",
  ogImage: "",
  twitterCard: "summary_large_image",
  twitterHandle: "",
  noindexBelowScore: 80,
  sitemapPriority: 0.6,
  sitemapChangeFreq: "weekly",
  injectFaqSchema: false,
  customMetaTags: [],
};

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

export function mergeBrandingSettings(value?: Partial<BrandingSettings>): BrandingSettings {
  return { ...clone(BRANDING_DEFAULTS), ...(value || {}) };
}

export function mergeSeoDefaults(value?: Partial<SeoDefaults>): SeoDefaults {
  const base = clone(SEO_DEFAULTS);
  if (!value) return base;
  return {
    ...base,
    ...value,
    customMetaTags: value.customMetaTags ? [...value.customMetaTags] : base.customMetaTags,
  };
}

const BrandingSchema = new Schema<BrandingSettings>(
  {
    logo: { type: String, default: BRANDING_DEFAULTS.logo },
    favicon: { type: String, default: BRANDING_DEFAULTS.favicon },
    displayName: { type: String, default: BRANDING_DEFAULTS.displayName },
    tagline: { type: String, default: BRANDING_DEFAULTS.tagline },
    primaryColor: { type: String, default: BRANDING_DEFAULTS.primaryColor },
    secondaryColor: { type: String, default: BRANDING_DEFAULTS.secondaryColor },
    accentColor: { type: String, default: BRANDING_DEFAULTS.accentColor },
    backgroundColor: { type: String, default: BRANDING_DEFAULTS.backgroundColor },
    surfaceColor: { type: String, default: BRANDING_DEFAULTS.surfaceColor },
    textColor: { type: String, default: BRANDING_DEFAULTS.textColor },
    fontFamily: { type: String, default: BRANDING_DEFAULTS.fontFamily },
    headingFont: { type: String, default: BRANDING_DEFAULTS.headingFont },
    customCss: { type: String, default: BRANDING_DEFAULTS.customCss },
  },
  { _id: false }
);

const CustomMetaTagSchema = new Schema<CustomMetaTag>(
  {
    name: { type: String, trim: true },
    property: { type: String, trim: true },
    content: { type: String, trim: true, required: true },
  },
  { _id: false }
);

const SeoDefaultsSchema = new Schema<SeoDefaults>(
  {
    metaTitleTemplate: { type: String, default: SEO_DEFAULTS.metaTitleTemplate },
    metaDescriptionTemplate: { type: String, default: SEO_DEFAULTS.metaDescriptionTemplate },
    schemaType: { type: String, default: SEO_DEFAULTS.schemaType },
    robotsMode: {
      type: String,
      enum: ["standard", "custom"],
      default: SEO_DEFAULTS.robotsMode,
    },
    robotsRules: { type: String, default: SEO_DEFAULTS.robotsRules },
    canonicalMode: {
      type: String,
      enum: ["base-path", "custom-domain", "dataset-field"],
      default: SEO_DEFAULTS.canonicalMode,
    },
    canonicalPattern: { type: String, default: SEO_DEFAULTS.canonicalPattern },
    ogTitleTemplate: { type: String, default: SEO_DEFAULTS.ogTitleTemplate },
    ogDescriptionTemplate: { type: String, default: SEO_DEFAULTS.ogDescriptionTemplate },
    ogImage: { type: String, default: SEO_DEFAULTS.ogImage },
    twitterCard: {
      type: String,
      enum: ["summary", "summary_large_image"],
      default: SEO_DEFAULTS.twitterCard,
    },
    twitterHandle: { type: String, default: SEO_DEFAULTS.twitterHandle },
    noindexBelowScore: {
      type: Number,
      default: SEO_DEFAULTS.noindexBelowScore,
      min: 0,
      max: 100,
    },
    sitemapPriority: {
      type: Number,
      default: SEO_DEFAULTS.sitemapPriority,
      min: 0,
      max: 1,
    },
    sitemapChangeFreq: {
      type: String,
      enum: ["always", "hourly", "daily", "weekly", "monthly", "yearly", "never"],
      default: SEO_DEFAULTS.sitemapChangeFreq,
    },
    injectFaqSchema: { type: Boolean, default: SEO_DEFAULTS.injectFaqSchema },
    customMetaTags: { type: [CustomMetaTagSchema], default: SEO_DEFAULTS.customMetaTags },
  },
  { _id: false }
);

const QaSchema = new Schema<QaSnapshot>(
  {
    warnings: { type: [String], default: [] },
    lastAuditAt: { type: Date },
    lastAuditScore: { type: Number, min: 0, max: 100 },
    updatedBy: { type: String, lowercase: true, trim: true },
  },
  { _id: false }
);

const CompanySettingsSchema = new Schema<CompanySettingsDocument>(
  {
    companyId: { type: Schema.Types.ObjectId, ref: "Company", required: true, unique: true },
    tenantId: { type: String, required: true, index: true },
    branding: { type: BrandingSchema, default: () => ({}) },
    seoDefaults: { type: SeoDefaultsSchema, default: () => ({}) },
    qa: { type: QaSchema, default: () => ({ warnings: [] }) },
  },
  { timestamps: true }
);

CompanySettingsSchema.index({ tenantId: 1, companyId: 1 }, { unique: true });

interface CompanySettingsModelType extends Model<CompanySettingsDocument> {
  mergeBranding(value?: Partial<BrandingSettings>): BrandingSettings;
  mergeSeoDefaults(value?: Partial<SeoDefaults>): SeoDefaults;
}

CompanySettingsSchema.statics.mergeBranding = mergeBrandingSettings;
CompanySettingsSchema.statics.mergeSeoDefaults = mergeSeoDefaults;

export const CompanySettingsModel =
  (models.CompanySettings as CompanySettingsModelType) ||
  model<CompanySettingsDocument, CompanySettingsModelType>(
    "CompanySettings",
    CompanySettingsSchema
  );


