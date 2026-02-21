const mongoose = require("mongoose");

const { Schema } = mongoose;

const BRANDING_DEFAULTS = {
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

const SEO_DEFAULTS = {
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

function mergeWithDefaults(defaults, value) {
  const next = { ...defaults };
  if (!value) return next;
  Object.keys(defaults).forEach((key) => {
    if (value[key] !== undefined && value[key] !== null) {
      if (Array.isArray(defaults[key])) {
        next[key] = Array.isArray(value[key]) ? [...value[key]] : [...defaults[key]];
      } else if (typeof defaults[key] === "object" && defaults[key] !== null) {
        next[key] = { ...defaults[key], ...(value[key] || {}) };
      } else {
        next[key] = value[key];
      }
    }
  });
  return next;
}

const BrandingSchema = new Schema(
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

const CustomMetaTagSchema = new Schema(
  {
    name: { type: String, trim: true },
    property: { type: String, trim: true },
    content: { type: String, trim: true },
  },
  { _id: false }
);

const SeoDefaultsSchema = new Schema(
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

const QaSnapshotSchema = new Schema(
  {
    warnings: { type: [String], default: [] },
    lastAuditAt: { type: Date },
    lastAuditScore: { type: Number, min: 0, max: 100 },
    updatedBy: { type: String, lowercase: true, trim: true },
  },
  { _id: false }
);

const CompanySettingsSchema = new Schema(
  {
    companyId: { type: Schema.Types.ObjectId, ref: "Company", required: true, unique: true },
    tenantId: { type: String, required: true, index: true },
    branding: { type: BrandingSchema, default: () => ({}) },
    seoDefaults: { type: SeoDefaultsSchema, default: () => ({}) },
    qa: { type: QaSnapshotSchema, default: () => ({ warnings: [] }) },
  },
  { timestamps: true }
);

CompanySettingsSchema.index({ tenantId: 1, companyId: 1 }, { unique: true });

CompanySettingsSchema.statics.mergeBranding = function mergeBranding(value) {
  return mergeWithDefaults(BRANDING_DEFAULTS, value);
};

CompanySettingsSchema.statics.mergeSeoDefaults = function mergeSeoDefaults(value) {
  return mergeWithDefaults(SEO_DEFAULTS, value);
};

const CompanySettings =
  mongoose.models.CompanySettings || mongoose.model("CompanySettings", CompanySettingsSchema);

module.exports = CompanySettings;
module.exports.BRANDING_DEFAULTS = BRANDING_DEFAULTS;
module.exports.SEO_DEFAULTS = SEO_DEFAULTS;
module.exports.mergeBranding = (value) => mergeWithDefaults(BRANDING_DEFAULTS, value);
module.exports.mergeSeoDefaults = (value) => mergeWithDefaults(SEO_DEFAULTS, value);





