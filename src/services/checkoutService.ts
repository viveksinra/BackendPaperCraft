import mongoose from "mongoose";
import Stripe from "stripe";
import { stripe as _stripe } from "../shared/config/stripe";
import { env } from "../shared/config/env";

function requireStripe() {
  if (!_stripe) throw Object.assign(new Error("Stripe not configured"), { status: 503 });
  return _stripe;
}
import { ProductModel, ProductDocument } from "../models/product";
import { PurchaseModel, PurchaseDocument } from "../models/purchase";
import { ParentLinkModel } from "../models/parentLink";
import { logger } from "../shared/logger";

const Company = mongoose.model("Company");
const User = mongoose.model("User");

function toObjectId(id: string): mongoose.Types.ObjectId {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw Object.assign(new Error("Invalid ObjectId"), { status: 400 });
  }
  return new mongoose.Types.ObjectId(id);
}

// ─── Effective price ────────────────────────────────────────────────────────

export function getEffectivePrice(product: ProductDocument): number {
  if (product.pricing?.isFree) return 0;

  if (
    product.pricing?.discountPrice != null &&
    product.pricing.discountValidUntil &&
    new Date(product.pricing.discountValidUntil) > new Date()
  ) {
    return product.pricing.discountPrice;
  }

  return product.pricing?.basePrice ?? 0;
}

// ─── Create checkout session ────────────────────────────────────────────────

interface SelectedAddOn {
  type: string;
  title: string;
  price: number;
}

export async function createCheckoutSession(
  buyerUserId: string,
  buyerRole: "student" | "parent",
  studentUserId: string,
  productId: string,
  selectedAddOns?: SelectedAddOn[]
): Promise<{ sessionId: string; checkoutUrl: string }> {
  const product = await ProductModel.findOne({
    _id: toObjectId(productId),
    status: "active",
  });
  if (!product) {
    throw Object.assign(new Error("Product not found or not active"), { status: 404 });
  }

  // Prevent duplicate purchase
  const existingPurchase = await PurchaseModel.findOne({
    studentUserId: toObjectId(studentUserId),
    productId: product._id,
    status: { $in: ["pending", "completed"] },
  });
  if (existingPurchase) {
    throw Object.assign(
      new Error("Student already has access or a pending purchase for this product"),
      { status: 409 }
    );
  }

  // Parent-child link validation
  if (buyerRole === "parent") {
    const link = await ParentLinkModel.findOne({
      parentUserId: toObjectId(buyerUserId),
      studentUserId: toObjectId(studentUserId),
      status: "active",
    });
    if (!link) {
      throw Object.assign(
        new Error("No active parent-child link found"),
        { status: 403 }
      );
    }
  }

  // Get company for Stripe account
  const company = await Company.findById(product.companyId).lean();
  if (!company) throw Object.assign(new Error("Company not found"), { status: 404 });
  const c = company as Record<string, unknown>;
  if (!c.stripeAccountId) {
    throw Object.assign(new Error("Company Stripe account not configured"), { status: 400 });
  }

  // Calculate total
  const effectivePrice = getEffectivePrice(product);
  const addOnTotal = (selectedAddOns || []).reduce((sum, a) => sum + a.price, 0);
  const total = effectivePrice + addOnTotal;

  // Convert to pence (smallest currency unit)
  const totalInPence = Math.round(total * 100);
  const platformFeeInPence = Math.round(totalInPence * (env.STRIPE_PLATFORM_FEE_PERCENT / 100));
  const platformFee = platformFeeInPence / 100;

  // Get buyer email for receipt
  const buyer = await User.findById(toObjectId(buyerUserId)).lean();
  const buyerEmail = (buyer as Record<string, unknown>)?.email as string | undefined;

  // Create Purchase record
  const purchase = await PurchaseModel.create({
    tenantId: product.tenantId,
    companyId: product.companyId,
    buyerUserId: toObjectId(buyerUserId),
    buyerRole,
    studentUserId: toObjectId(studentUserId),
    productId: product._id,
    productType: product.type,
    productTitle: product.title,
    referenceId: product.referenceId,
    amount: total,
    platformFee,
    currency: product.pricing?.currency || "GBP",
    addOns: selectedAddOns || [],
    status: "pending",
  });

  // Build line items
  const lineItems: Array<Record<string, unknown>> = [
    {
      price_data: {
        currency: (product.pricing?.currency || "GBP").toLowerCase(),
        product_data: {
          name: product.title,
          description: product.description || undefined,
          images: product.thumbnail ? [product.thumbnail] : undefined,
        },
        unit_amount: Math.round(effectivePrice * 100),
      },
      quantity: 1,
    },
  ];

  // Add add-on line items
  for (const addOn of selectedAddOns || []) {
    lineItems.push({
      price_data: {
        currency: (product.pricing?.currency || "GBP").toLowerCase(),
        product_data: { name: addOn.title },
        unit_amount: Math.round(addOn.price * 100),
      },
      quantity: 1,
    });
  }

  // Create Stripe Checkout Session
  const sessionParams: Stripe.Checkout.SessionCreateParams = {
    mode: "payment",
    line_items: lineItems as Stripe.Checkout.SessionCreateParams.LineItem[],
    payment_intent_data: {
      application_fee_amount: platformFeeInPence > 0 ? platformFeeInPence : undefined,
      transfer_data: {
        destination: c.stripeAccountId as string,
      },
    },
    success_url: `${env.FRONTEND_CHECKOUT_SUCCESS_URL || ""}?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: env.FRONTEND_CHECKOUT_CANCEL_URL || "",
    customer_email: buyerEmail || undefined,
    metadata: {
      purchaseId: String(purchase._id),
      productId: String(product._id),
      studentUserId,
      companyId: product.companyId.toString(),
    },
  };

  const session = await requireStripe().checkout.sessions.create(sessionParams);

  // Update purchase with session ID
  purchase.stripeSessionId = session.id;
  await purchase.save();

  logger.info({
    msg: "Checkout session created",
    sessionId: session.id,
    purchaseId: String(purchase._id),
    productId,
    amount: total,
  });

  return {
    sessionId: session.id,
    checkoutUrl: session.url || "",
  };
}

// ─── Verify checkout session ────────────────────────────────────────────────

export async function verifyCheckoutSession(
  sessionId: string
): Promise<{ purchase: PurchaseDocument | null; paymentStatus: string }> {
  const session = await requireStripe().checkout.sessions.retrieve(sessionId);
  const purchase = await PurchaseModel.findOne({ stripeSessionId: sessionId });

  return {
    purchase,
    paymentStatus: session.payment_status || "unknown",
  };
}

// ─── Handle free access ─────────────────────────────────────────────────────

export async function handleFreeAccess(
  buyerUserId: string,
  buyerRole: "student" | "parent",
  studentUserId: string,
  productId: string
): Promise<PurchaseDocument> {
  const product = await ProductModel.findOne({
    _id: toObjectId(productId),
    status: "active",
  });
  if (!product) {
    throw Object.assign(new Error("Product not found or not active"), { status: 404 });
  }

  if (!product.pricing?.isFree) {
    throw Object.assign(new Error("Product is not free"), { status: 400 });
  }

  // Prevent duplicate
  const existing = await PurchaseModel.findOne({
    studentUserId: toObjectId(studentUserId),
    productId: product._id,
    status: "completed",
    accessGranted: true,
  });
  if (existing) {
    throw Object.assign(new Error("Student already has access to this product"), { status: 409 });
  }

  // Parent-child link validation
  if (buyerRole === "parent") {
    const link = await ParentLinkModel.findOne({
      parentUserId: toObjectId(buyerUserId),
      studentUserId: toObjectId(studentUserId),
      status: "active",
    });
    if (!link) {
      throw Object.assign(new Error("No active parent-child link found"), { status: 403 });
    }
  }

  const now = new Date();
  const purchase = await PurchaseModel.create({
    tenantId: product.tenantId,
    companyId: product.companyId,
    buyerUserId: toObjectId(buyerUserId),
    buyerRole,
    studentUserId: toObjectId(studentUserId),
    productId: product._id,
    productType: product.type,
    productTitle: product.title,
    referenceId: product.referenceId,
    amount: 0,
    currency: product.pricing?.currency || "GBP",
    status: "completed",
    accessGranted: true,
    accessGrantedAt: now,
    completedAt: now,
  });

  // Increment totalPurchases
  await ProductModel.findByIdAndUpdate(product._id, {
    $inc: { totalPurchases: 1 },
  });

  // Handle bundle: grant individual access
  if (product.type === "bundle" && product.bundleItems?.length) {
    for (const item of product.bundleItems) {
      await PurchaseModel.create({
        tenantId: product.tenantId,
        companyId: product.companyId,
        buyerUserId: toObjectId(buyerUserId),
        buyerRole,
        studentUserId: toObjectId(studentUserId),
        productId: product._id,
        productType: item.referenceType,
        productTitle: item.title,
        referenceId: item.referenceId,
        amount: 0,
        currency: product.pricing?.currency || "GBP",
        status: "completed",
        accessGranted: true,
        accessGrantedAt: now,
        completedAt: now,
      });
    }
  }

  logger.info({
    msg: "Free access granted",
    purchaseId: String(purchase._id),
    productId,
    studentUserId,
  });

  return purchase;
}
