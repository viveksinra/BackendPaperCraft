import mongoose from "mongoose";
import { ProductModel, ProductDocument, ProductType } from "../models/product";
import { PaperSetModel } from "../models/paperSet";
import { logger } from "../shared/logger";

const Company = mongoose.model("Company");

function toObjectId(id: string): mongoose.Types.ObjectId {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw Object.assign(new Error("Invalid ObjectId"), { status: 400 });
  }
  return new mongoose.Types.ObjectId(id);
}

// ─── Create ─────────────────────────────────────────────────────────────────

export async function createProduct(
  companyId: string,
  tenantId: string,
  input: Record<string, unknown>,
  creatorEmail: string
): Promise<ProductDocument> {
  const companyOid = toObjectId(companyId);
  const type = input.type as ProductType;

  // For non-bundle types, verify referenceId exists
  if (type !== "bundle" && input.referenceId) {
    const existing = await ProductModel.findOne({
      companyId: companyOid,
      referenceId: toObjectId(input.referenceId as string),
      status: { $ne: "inactive" },
    });
    if (existing) {
      throw Object.assign(
        new Error("An active product already exists for this content"),
        { status: 409 }
      );
    }
  }

  // For bundles, validate bundleItems reference valid products
  if (type === "bundle" && Array.isArray(input.bundleItems)) {
    const itemIds = (input.bundleItems as Array<{ productId: string }>).map(
      (i) => toObjectId(i.productId)
    );
    const count = await ProductModel.countDocuments({
      _id: { $in: itemIds },
      companyId: companyOid,
    });
    if (count !== itemIds.length) {
      throw Object.assign(
        new Error("One or more bundleItems reference invalid products"),
        { status: 400 }
      );
    }
  }

  const doc = await ProductModel.create({
    tenantId,
    companyId: companyOid,
    type,
    referenceId: input.referenceId ? toObjectId(input.referenceId as string) : null,
    title: input.title,
    description: input.description || "",
    thumbnail: input.thumbnail || "",
    pricing: input.pricing || {},
    addOns: input.addOns || [],
    bundleItems: input.bundleItems || [],
    tags: input.tags || [],
    category: input.category || "",
    yearGroup: input.yearGroup || "",
    subject: input.subject || "",
    sortOrder: input.sortOrder ?? 0,
    status: "draft",
    createdBy: creatorEmail,
    updatedBy: creatorEmail,
  });

  return doc;
}

// ─── Update ─────────────────────────────────────────────────────────────────

export async function updateProduct(
  companyId: string,
  productId: string,
  input: Record<string, unknown>,
  updaterEmail: string
): Promise<ProductDocument> {
  const doc = await ProductModel.findOne({
    _id: toObjectId(productId),
    companyId: toObjectId(companyId),
  });
  if (!doc) throw Object.assign(new Error("Product not found"), { status: 404 });

  const allowed = [
    "title", "description", "thumbnail", "pricing", "addOns",
    "bundleItems", "tags", "category", "yearGroup", "subject", "sortOrder",
  ];
  for (const key of allowed) {
    if (input[key] !== undefined) {
      (doc as unknown as Record<string, unknown>)[key] = input[key];
    }
  }
  doc.updatedBy = updaterEmail;
  await doc.save();
  return doc;
}

// ─── Publish / Unpublish ────────────────────────────────────────────────────

export async function publishProduct(
  companyId: string,
  productId: string,
  updaterEmail: string
): Promise<ProductDocument> {
  const doc = await ProductModel.findOne({
    _id: toObjectId(productId),
    companyId: toObjectId(companyId),
  });
  if (!doc) throw Object.assign(new Error("Product not found"), { status: 404 });

  if (!doc.title) {
    throw Object.assign(new Error("Product title is required to publish"), { status: 400 });
  }

  // Paid products require Stripe account
  const isFree = doc.pricing?.isFree === true;
  if (!isFree) {
    const company = await Company.findById(toObjectId(companyId)).lean();
    if (!company) throw Object.assign(new Error("Company not found"), { status: 404 });
    const c = company as Record<string, unknown>;
    if (!c.stripeAccountId || !c.stripePayoutsEnabled) {
      throw Object.assign(
        new Error("Stripe account with payouts enabled is required to publish paid products"),
        { status: 400 }
      );
    }
  }

  doc.status = "active";
  doc.publishedAt = new Date();
  doc.updatedBy = updaterEmail;
  await doc.save();
  return doc;
}

export async function unpublishProduct(
  companyId: string,
  productId: string,
  updaterEmail: string
): Promise<ProductDocument> {
  const doc = await ProductModel.findOne({
    _id: toObjectId(productId),
    companyId: toObjectId(companyId),
  });
  if (!doc) throw Object.assign(new Error("Product not found"), { status: 404 });

  doc.status = "inactive";
  doc.updatedBy = updaterEmail;
  await doc.save();
  return doc;
}

// ─── Delete (soft) ──────────────────────────────────────────────────────────

export async function deleteProduct(
  companyId: string,
  productId: string
): Promise<void> {
  const doc = await ProductModel.findOne({
    _id: toObjectId(productId),
    companyId: toObjectId(companyId),
  });
  if (!doc) throw Object.assign(new Error("Product not found"), { status: 404 });

  doc.status = "inactive";
  await doc.save();
}

// ─── List (admin) ───────────────────────────────────────────────────────────

interface ListFilters {
  type?: ProductType;
  status?: string;
  category?: string;
  yearGroup?: string;
  subject?: string;
  search?: string;
}

interface PaginationOpts {
  page?: number;
  limit?: number;
}

export async function listProducts(
  companyId: string,
  filters?: ListFilters,
  pagination?: PaginationOpts
): Promise<{ products: ProductDocument[]; total: number; page: number; pageSize: number }> {
  const query: Record<string, unknown> = { companyId: toObjectId(companyId) };

  if (filters?.type) query.type = filters.type;
  if (filters?.status) query.status = filters.status;
  if (filters?.category) query.category = filters.category;
  if (filters?.yearGroup) query.yearGroup = filters.yearGroup;
  if (filters?.subject) query.subject = filters.subject;
  if (filters?.search) {
    query.title = { $regex: filters.search, $options: "i" };
  }

  const page = pagination?.page ?? 1;
  const limit = pagination?.limit ?? 20;

  const [products, total] = await Promise.all([
    ProductModel.find(query)
      .sort({ sortOrder: 1, createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    ProductModel.countDocuments(query),
  ]);

  return { products, total, page, pageSize: limit };
}

// ─── Get single ─────────────────────────────────────────────────────────────

export async function getProduct(
  companyId: string,
  productId: string
): Promise<ProductDocument> {
  const doc = await ProductModel.findOne({
    _id: toObjectId(productId),
    companyId: toObjectId(companyId),
  });
  if (!doc) throw Object.assign(new Error("Product not found"), { status: 404 });
  return doc;
}

// ─── Catalog (public, active only) ──────────────────────────────────────────

interface CatalogFilters {
  type?: ProductType;
  category?: string;
  yearGroup?: string;
  subject?: string;
  search?: string;
  priceMin?: number;
  priceMax?: number;
}

type CatalogSort = "sortOrder" | "newest" | "price_asc" | "price_desc" | "popularity";

export async function getCatalog(
  companyId: string,
  filters?: CatalogFilters,
  pagination?: PaginationOpts,
  sort?: CatalogSort
): Promise<{ products: ProductDocument[]; total: number; page: number; pageSize: number }> {
  const query: Record<string, unknown> = {
    companyId: toObjectId(companyId),
    status: "active",
  };

  if (filters?.type) query.type = filters.type;
  if (filters?.category) query.category = filters.category;
  if (filters?.yearGroup) query.yearGroup = filters.yearGroup;
  if (filters?.subject) query.subject = filters.subject;
  if (filters?.search) {
    query.title = { $regex: filters.search, $options: "i" };
  }
  if (filters?.priceMin !== undefined || filters?.priceMax !== undefined) {
    const priceFilter: Record<string, number> = {};
    if (filters?.priceMin !== undefined) priceFilter.$gte = filters.priceMin;
    if (filters?.priceMax !== undefined) priceFilter.$lte = filters.priceMax;
    query["pricing.basePrice"] = priceFilter;
  }

  let sortObj: Record<string, 1 | -1> = { sortOrder: 1 };
  switch (sort) {
    case "newest": sortObj = { createdAt: -1 }; break;
    case "price_asc": sortObj = { "pricing.basePrice": 1 }; break;
    case "price_desc": sortObj = { "pricing.basePrice": -1 }; break;
    case "popularity": sortObj = { totalPurchases: -1 }; break;
  }

  const page = pagination?.page ?? 1;
  const limit = pagination?.limit ?? 20;

  const [products, total] = await Promise.all([
    ProductModel.find(query)
      .sort(sortObj)
      .skip((page - 1) * limit)
      .limit(limit),
    ProductModel.countDocuments(query),
  ]);

  return { products, total, page, pageSize: limit };
}

// ─── Get by reference ───────────────────────────────────────────────────────

export async function getProductByReference(
  companyId: string,
  _referenceType: string,
  referenceId: string
): Promise<ProductDocument | null> {
  return ProductModel.findOne({
    companyId: toObjectId(companyId),
    referenceId: toObjectId(referenceId),
    status: "active",
  });
}

// ─── Auto-create from PaperSet ──────────────────────────────────────────────

export async function createProductFromPaperSet(
  companyId: string,
  paperSetId: string,
  creatorEmail: string
): Promise<ProductDocument> {
  const companyOid = toObjectId(companyId);
  const paperSet = await PaperSetModel.findOne({
    _id: toObjectId(paperSetId),
    companyId: companyOid,
  });
  if (!paperSet) {
    throw Object.assign(new Error("Paper set not found"), { status: 404 });
  }

  // Check no existing product for this paper set
  const existing = await ProductModel.findOne({
    companyId: companyOid,
    referenceId: paperSet._id,
    status: { $ne: "inactive" },
  });
  if (existing) {
    throw Object.assign(
      new Error("A product already exists for this paper set"),
      { status: 409 }
    );
  }

  // Map PaperSet pricing to Product pricing
  const pricing: Record<string, unknown> = {
    currency: paperSet.pricing?.currency || "GBP",
    basePrice: paperSet.pricing?.bundlePrice ?? 0,
    isFree: paperSet.pricing?.isFree ?? false,
  };

  // Map checking service to add-on
  const addOns: Array<Record<string, unknown>> = [];
  if (paperSet.pricing?.checkingServicePrice > 0) {
    addOns.push({
      type: "checking_service",
      title: "Paper Checking Service",
      description: "Professional marking and feedback",
      price: paperSet.pricing.checkingServicePrice,
    });
  }
  if (paperSet.pricing?.oneToOneServicePrice > 0) {
    addOns.push({
      type: "one_to_one",
      title: "1-to-1 Tutorial Session",
      description: "Personal tutorial session",
      price: paperSet.pricing.oneToOneServicePrice,
    });
  }

  const doc = await ProductModel.create({
    tenantId: paperSet.tenantId,
    companyId: companyOid,
    type: "paper_set",
    referenceId: paperSet._id,
    title: paperSet.title,
    description: paperSet.shortDescription || paperSet.fullDescription || "",
    pricing,
    addOns,
    category: paperSet.subjectCategory || "",
    yearGroup: paperSet.yearGroup || "",
    subject: paperSet.subjectCategory || "",
    status: "draft",
    createdBy: creatorEmail,
    updatedBy: creatorEmail,
  });

  logger.info({
    msg: "Product auto-created from PaperSet",
    productId: doc._id,
    paperSetId,
    companyId,
  });

  return doc;
}
