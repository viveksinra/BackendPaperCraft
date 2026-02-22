import { Document, Model, Schema, Types, model, models } from "mongoose";

// ─── Constants & Types ──────────────────────────────────────────────────────

export type ProductType =
  | "paper"
  | "paper_set"
  | "test"
  | "course"
  | "bundle"
  | "add_on_service";

export type ProductStatus = "active" | "inactive" | "draft";

// ─── Sub-document interfaces ────────────────────────────────────────────────

export interface ProductPricing {
  currency: string;
  basePrice: number;
  discountPrice: number | null;
  discountValidUntil: Date | null;
  isFree: boolean;
}

export interface ProductAddOn {
  type: string;
  title: string;
  description: string;
  price: number;
}

export interface BundleItem {
  productId: Types.ObjectId;
  referenceType: string;
  referenceId: Types.ObjectId;
  title: string;
}

// ─── Document interface ─────────────────────────────────────────────────────

export interface ProductDocument extends Document {
  tenantId: string;
  companyId: Types.ObjectId;
  type: ProductType;
  referenceId: Types.ObjectId | null;
  title: string;
  description: string;
  thumbnail: string;
  pricing: ProductPricing;
  addOns: ProductAddOn[];
  bundleItems: BundleItem[];
  tags: string[];
  category: string;
  yearGroup: string;
  subject: string;
  sortOrder: number;
  totalPurchases: number;
  status: ProductStatus;
  publishedAt: Date | null;
  createdBy: string;
  updatedBy: string;
  createdAt: Date;
  updatedAt: Date;
}

// ─── Sub-document schemas ───────────────────────────────────────────────────

const ProductPricingSchema = new Schema<ProductPricing>(
  {
    currency: {
      type: String,
      enum: ["GBP", "INR"],
      default: "GBP",
    },
    basePrice: { type: Number, min: 0, default: 0 },
    discountPrice: { type: Number, min: 0, default: null },
    discountValidUntil: { type: Date, default: null },
    isFree: { type: Boolean, default: false },
  },
  { _id: false }
);

const ProductAddOnSchema = new Schema<ProductAddOn>(
  {
    type: { type: String, required: true },
    title: { type: String, required: true },
    description: { type: String, default: "" },
    price: { type: Number, min: 0, required: true },
  },
  { _id: false }
);

const BundleItemSchema = new Schema<BundleItem>(
  {
    productId: {
      type: Schema.Types.ObjectId,
      ref: "Product",
      required: true,
    },
    referenceType: { type: String, required: true },
    referenceId: { type: Schema.Types.ObjectId, required: true },
    title: { type: String, required: true },
  },
  { _id: false }
);

// ─── Main schema ────────────────────────────────────────────────────────────

const ProductSchema = new Schema<ProductDocument>(
  {
    tenantId: { type: String, required: true, index: true },
    companyId: {
      type: Schema.Types.ObjectId,
      ref: "Company",
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: ["paper", "paper_set", "test", "course", "bundle", "add_on_service"],
      required: true,
    },
    referenceId: {
      type: Schema.Types.ObjectId,
      default: null,
    },
    title: { type: String, required: true, trim: true, maxlength: 300 },
    description: { type: String, default: "", maxlength: 10000 },
    thumbnail: { type: String, default: "" },
    pricing: { type: ProductPricingSchema, default: () => ({}) },
    addOns: { type: [ProductAddOnSchema], default: [] },
    bundleItems: { type: [BundleItemSchema], default: [] },
    tags: { type: [String], default: [] },
    category: { type: String, default: "", maxlength: 100 },
    yearGroup: { type: String, default: "", maxlength: 50 },
    subject: { type: String, default: "", maxlength: 100 },
    sortOrder: { type: Number, default: 0 },
    totalPurchases: { type: Number, default: 0, min: 0 },
    status: {
      type: String,
      enum: ["active", "inactive", "draft"],
      default: "draft",
    },
    publishedAt: { type: Date, default: null },
    createdBy: { type: String, required: true, lowercase: true, trim: true },
    updatedBy: { type: String, required: true, lowercase: true, trim: true },
  },
  { timestamps: true }
);

// ─── Indexes ────────────────────────────────────────────────────────────────

ProductSchema.index({ companyId: 1, status: 1, type: 1 });
ProductSchema.index({ companyId: 1, referenceId: 1 });
ProductSchema.index({ companyId: 1, status: 1, sortOrder: 1 });
ProductSchema.index({ companyId: 1, tags: 1 });
ProductSchema.index({ companyId: 1, category: 1, yearGroup: 1, subject: 1 });

// ─── Export ─────────────────────────────────────────────────────────────────

export const ProductModel =
  (models.Product as Model<ProductDocument>) ||
  model<ProductDocument>("Product", ProductSchema);
