import mongoose from "mongoose";
import { PurchaseModel, PurchaseDocument } from "../models/purchase";
import { ProductModel } from "../models/product";
import { addNotificationJob } from "../queue/queues";
import { logger } from "../shared/logger";

const User = mongoose.model("User");

function toObjectId(id: string): mongoose.Types.ObjectId {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw Object.assign(new Error("Invalid ObjectId"), { status: 400 });
  }
  return new mongoose.Types.ObjectId(id);
}

// ─── Student purchases ──────────────────────────────────────────────────────

interface PurchaseFilters {
  status?: string;
  productType?: string;
}

interface PaginationOpts {
  page?: number;
  limit?: number;
}

export async function getStudentPurchases(
  studentUserId: string,
  filters?: PurchaseFilters,
  pagination?: PaginationOpts
): Promise<{ purchases: PurchaseDocument[]; total: number; page: number; pageSize: number }> {
  const query: Record<string, unknown> = { studentUserId: toObjectId(studentUserId) };
  if (filters?.status) query.status = filters.status;
  if (filters?.productType) query.productType = filters.productType;

  const page = pagination?.page ?? 1;
  const limit = pagination?.limit ?? 20;

  const [purchases, total] = await Promise.all([
    PurchaseModel.find(query)
      .sort({ completedAt: -1, createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    PurchaseModel.countDocuments(query),
  ]);

  return { purchases, total, page, pageSize: limit };
}

// ─── Parent purchases ───────────────────────────────────────────────────────

export async function getParentPurchases(
  parentUserId: string,
  filters?: PurchaseFilters,
  pagination?: PaginationOpts
): Promise<{ purchases: Array<Record<string, unknown>>; total: number; page: number; pageSize: number }> {
  const query: Record<string, unknown> = {
    buyerUserId: toObjectId(parentUserId),
    buyerRole: "parent",
  };
  if (filters?.status) query.status = filters.status;
  if (filters?.productType) query.productType = filters.productType;

  const page = pagination?.page ?? 1;
  const limit = pagination?.limit ?? 20;

  const [purchases, total] = await Promise.all([
    PurchaseModel.find(query)
      .sort({ completedAt: -1, createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    PurchaseModel.countDocuments(query),
  ]);

  // Enrich with child name
  const studentIds = [...new Set(purchases.map((p) => p.studentUserId.toString()))];
  const students = await User.find({ _id: { $in: studentIds } })
    .select("firstName lastName email")
    .lean();
  const studentMap = new Map(students.map((s: Record<string, unknown>) => [
    (s._id as mongoose.Types.ObjectId).toString(),
    s,
  ]));

  const enriched = purchases.map((p) => ({
    ...p,
    studentName:
      ((studentMap.get(p.studentUserId.toString()) as Record<string, unknown>)?.firstName || "") +
      " " +
      ((studentMap.get(p.studentUserId.toString()) as Record<string, unknown>)?.lastName || ""),
  }));

  return { purchases: enriched, total, page, pageSize: limit };
}

// ─── Buyer purchases (grouped) ──────────────────────────────────────────────

export async function getBuyerPurchases(
  buyerUserId: string,
  filters?: PurchaseFilters,
  pagination?: PaginationOpts
): Promise<{ purchases: PurchaseDocument[]; total: number; page: number; pageSize: number }> {
  const query: Record<string, unknown> = { buyerUserId: toObjectId(buyerUserId) };
  if (filters?.status) query.status = filters.status;
  if (filters?.productType) query.productType = filters.productType;

  const page = pagination?.page ?? 1;
  const limit = pagination?.limit ?? 20;

  const [purchases, total] = await Promise.all([
    PurchaseModel.find(query)
      .sort({ completedAt: -1, createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    PurchaseModel.countDocuments(query),
  ]);

  return { purchases, total, page, pageSize: limit };
}

// ─── Access check ───────────────────────────────────────────────────────────

export async function hasAccess(
  studentUserId: string,
  _referenceType: string,
  referenceId: string
): Promise<{ hasAccess: boolean; purchase?: PurchaseDocument }> {
  const studentOid = toObjectId(studentUserId);
  const refOid = toObjectId(referenceId);

  // Direct purchase check
  const directPurchase = await PurchaseModel.findOne({
    studentUserId: studentOid,
    referenceId: refOid,
    status: "completed",
    accessGranted: true,
  });

  if (directPurchase) {
    return { hasAccess: true, purchase: directPurchase };
  }

  // Bundle purchase check: find bundles containing this referenceId
  const bundleProducts = await ProductModel.find({
    "bundleItems.referenceId": refOid,
    status: "active",
  }).select("_id");

  if (bundleProducts.length > 0) {
    const bundleProductIds = bundleProducts.map((p) => p._id);
    const bundlePurchase = await PurchaseModel.findOne({
      studentUserId: studentOid,
      productId: { $in: bundleProductIds },
      status: "completed",
      accessGranted: true,
    });

    if (bundlePurchase) {
      return { hasAccess: true, purchase: bundlePurchase };
    }
  }

  return { hasAccess: false };
}

// ─── Grant access ───────────────────────────────────────────────────────────

export async function grantAccess(purchaseId: string): Promise<PurchaseDocument> {
  const purchase = await PurchaseModel.findById(toObjectId(purchaseId));
  if (!purchase) throw Object.assign(new Error("Purchase not found"), { status: 404 });

  // Idempotency: already granted
  if (purchase.accessGranted) {
    return purchase;
  }

  purchase.accessGranted = true;
  purchase.accessGrantedAt = new Date();
  await purchase.save();

  // Increment product totalPurchases
  await ProductModel.findByIdAndUpdate(purchase.productId, {
    $inc: { totalPurchases: 1 },
  });

  // If bundle, grant access to all bundle items
  if (purchase.productType === "bundle") {
    const product = await ProductModel.findById(purchase.productId);
    if (product?.bundleItems?.length) {
      for (const item of product.bundleItems) {
        // Check if individual access already exists
        const exists = await PurchaseModel.findOne({
          studentUserId: purchase.studentUserId,
          referenceId: item.referenceId,
          status: "completed",
          accessGranted: true,
        });
        if (!exists) {
          await PurchaseModel.create({
            tenantId: purchase.tenantId,
            companyId: purchase.companyId,
            buyerUserId: purchase.buyerUserId,
            buyerRole: purchase.buyerRole,
            studentUserId: purchase.studentUserId,
            productId: purchase.productId,
            productType: item.referenceType,
            productTitle: item.title,
            referenceId: item.referenceId,
            amount: 0,
            currency: purchase.currency,
            status: "completed",
            accessGranted: true,
            accessGrantedAt: new Date(),
            completedAt: new Date(),
          });
        }
      }
    }
  }

  // Queue notification
  try {
    await addNotificationJob({
      type: "purchase_access_granted",
      recipientUserIds: [purchase.studentUserId.toString()],
      title: "Access Granted",
      body: `You now have access to: ${purchase.productTitle}`,
      referenceType: "purchase",
      referenceId: String(purchase._id),
      companyId: purchase.companyId.toString(),
    });
  } catch (err) {
    logger.warn({ msg: "Failed to queue access notification", purchaseId, error: (err as Error).message });
  }

  logger.info({
    msg: "Access granted",
    purchaseId,
    studentUserId: purchase.studentUserId.toString(),
    productTitle: purchase.productTitle,
  });

  return purchase;
}

// ─── Revoke access ──────────────────────────────────────────────────────────

export async function revokeAccess(
  purchaseId: string,
  reason: string
): Promise<PurchaseDocument> {
  const purchase = await PurchaseModel.findById(toObjectId(purchaseId));
  if (!purchase) throw Object.assign(new Error("Purchase not found"), { status: 404 });

  purchase.accessGranted = false;
  purchase.status = "refunded";
  purchase.refundedAt = new Date();
  purchase.refundReason = reason;
  await purchase.save();

  logger.info({
    msg: "Access revoked",
    purchaseId,
    reason,
    studentUserId: purchase.studentUserId.toString(),
  });

  return purchase;
}
