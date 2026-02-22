import { Document, Model, Schema, Types, model, models } from "mongoose";

// ─── Constants & Types ──────────────────────────────────────────────────────

export type PurchaseStatus =
  | "pending"
  | "completed"
  | "failed"
  | "refunded"
  | "expired";

// ─── Sub-document interfaces ────────────────────────────────────────────────

export interface PurchaseAddOn {
  type: string;
  title: string;
  price: number;
}

// ─── Document interface ─────────────────────────────────────────────────────

export interface PurchaseDocument extends Document {
  tenantId: string;
  companyId: Types.ObjectId;
  buyerUserId: Types.ObjectId;
  buyerRole: "student" | "parent";
  studentUserId: Types.ObjectId;
  productId: Types.ObjectId;
  productType: string;
  productTitle: string;
  referenceId: Types.ObjectId | null;
  stripeSessionId: string;
  stripePaymentIntentId: string;
  stripeChargeId: string;
  amount: number;
  platformFee: number;
  currency: string;
  addOns: PurchaseAddOn[];
  status: PurchaseStatus;
  accessGranted: boolean;
  accessGrantedAt: Date | null;
  completedAt: Date | null;
  failedAt: Date | null;
  failureReason: string;
  refundedAt: Date | null;
  refundReason: string;
  receiptUrl: string;
  createdAt: Date;
  updatedAt: Date;
}

// ─── Sub-document schemas ───────────────────────────────────────────────────

const PurchaseAddOnSchema = new Schema<PurchaseAddOn>(
  {
    type: { type: String, required: true },
    title: { type: String, required: true },
    price: { type: Number, min: 0, required: true },
  },
  { _id: false }
);

// ─── Main schema ────────────────────────────────────────────────────────────

const PurchaseSchema = new Schema<PurchaseDocument>(
  {
    tenantId: { type: String, required: true, index: true },
    companyId: {
      type: Schema.Types.ObjectId,
      ref: "Company",
      required: true,
      index: true,
    },
    buyerUserId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    buyerRole: {
      type: String,
      enum: ["student", "parent"],
      required: true,
    },
    studentUserId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    productId: {
      type: Schema.Types.ObjectId,
      ref: "Product",
      required: true,
    },
    productType: { type: String, required: true },
    productTitle: { type: String, required: true },
    referenceId: { type: Schema.Types.ObjectId, default: null },
    stripeSessionId: { type: String, default: "" },
    stripePaymentIntentId: { type: String, default: "" },
    stripeChargeId: { type: String, default: "" },
    amount: { type: Number, required: true, min: 0 },
    platformFee: { type: Number, default: 0, min: 0 },
    currency: { type: String, default: "GBP" },
    addOns: { type: [PurchaseAddOnSchema], default: [] },
    status: {
      type: String,
      enum: ["pending", "completed", "failed", "refunded", "expired"],
      default: "pending",
    },
    accessGranted: { type: Boolean, default: false },
    accessGrantedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    failedAt: { type: Date, default: null },
    failureReason: { type: String, default: "" },
    refundedAt: { type: Date, default: null },
    refundReason: { type: String, default: "" },
    receiptUrl: { type: String, default: "" },
  },
  { timestamps: true }
);

// ─── Indexes ────────────────────────────────────────────────────────────────

PurchaseSchema.index({ buyerUserId: 1, status: 1 });
PurchaseSchema.index({ studentUserId: 1, productId: 1 });
PurchaseSchema.index({ studentUserId: 1, referenceId: 1, status: 1 });
PurchaseSchema.index({ companyId: 1, status: 1, completedAt: -1 });
PurchaseSchema.index({ stripeSessionId: 1 });
PurchaseSchema.index({ stripePaymentIntentId: 1 });

// ─── Export ─────────────────────────────────────────────────────────────────

export const PurchaseModel =
  (models.Purchase as Model<PurchaseDocument>) ||
  model<PurchaseDocument>("Purchase", PurchaseSchema);
