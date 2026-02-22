import mongoose from "mongoose";
import { stripe as _stripe } from "../shared/config/stripe";
import { env } from "../shared/config/env";

function requireStripe() {
  if (!_stripe) throw Object.assign(new Error("Stripe not configured"), { status: 503 });
  return _stripe;
}
import { logger } from "../shared/logger";

const Company = mongoose.model("Company");

function toObjectId(id: string): mongoose.Types.ObjectId {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw Object.assign(new Error("Invalid ObjectId"), { status: 400 });
  }
  return new mongoose.Types.ObjectId(id);
}

// ─── Create connected account ───────────────────────────────────────────────

export async function createConnectedAccount(
  companyId: string,
  tenantId: string,
  adminEmail: string
): Promise<string> {
  const company = await Company.findById(toObjectId(companyId));
  if (!company) throw Object.assign(new Error("Company not found"), { status: 404 });

  const c = company as Record<string, unknown>;
  if (c.stripeAccountId) {
    throw Object.assign(
      new Error("Company already has a Stripe account"),
      { status: 409 }
    );
  }

  const account = await requireStripe().accounts.create({
    type: "standard",
    email: adminEmail,
    metadata: {
      companyId,
      tenantId,
    },
  });

  await Company.findByIdAndUpdate(toObjectId(companyId), {
    stripeAccountId: account.id,
    stripeAccountStatus: "pending",
    stripeAccountCreatedAt: new Date(),
  });

  logger.info({
    msg: "Stripe Connect account created",
    companyId,
    accountId: account.id,
  });

  return account.id;
}

// ─── Create onboarding link ─────────────────────────────────────────────────

export async function createOnboardingLink(companyId: string): Promise<string> {
  const company = await Company.findById(toObjectId(companyId)).lean();
  if (!company) throw Object.assign(new Error("Company not found"), { status: 404 });

  const c = company as Record<string, unknown>;
  if (!c.stripeAccountId) {
    throw Object.assign(
      new Error("Company does not have a Stripe account. Create one first."),
      { status: 400 }
    );
  }

  const accountLink = await requireStripe().accountLinks.create({
    account: c.stripeAccountId as string,
    refresh_url: env.STRIPE_CONNECT_REFRESH_URL || "",
    return_url: env.STRIPE_CONNECT_RETURN_URL || "",
    type: "account_onboarding",
  });

  return accountLink.url;
}

// ─── Verify account status ──────────────────────────────────────────────────

export async function verifyAccountStatus(companyId: string): Promise<{
  status: string;
  payoutsEnabled: boolean;
  chargesEnabled: boolean;
  onboardingComplete: boolean;
}> {
  const company = await Company.findById(toObjectId(companyId)).lean();
  if (!company) throw Object.assign(new Error("Company not found"), { status: 404 });

  const c = company as Record<string, unknown>;
  if (!c.stripeAccountId) {
    throw Object.assign(new Error("Company does not have a Stripe account"), { status: 400 });
  }

  const account = await requireStripe().accounts.retrieve(c.stripeAccountId as string);

  // Derive status
  let derivedStatus = "pending";
  if (account.payouts_enabled && account.charges_enabled) {
    derivedStatus = "active";
  } else if (account.details_submitted && !account.payouts_enabled) {
    derivedStatus = "restricted";
  }

  await Company.findByIdAndUpdate(toObjectId(companyId), {
    stripeOnboardingComplete: account.details_submitted ?? false,
    stripePayoutsEnabled: account.payouts_enabled ?? false,
    stripeChargesEnabled: account.charges_enabled ?? false,
    stripeAccountStatus: derivedStatus,
  });

  logger.info({
    msg: "Stripe account status verified",
    companyId,
    status: derivedStatus,
  });

  return {
    status: derivedStatus,
    payoutsEnabled: account.payouts_enabled ?? false,
    chargesEnabled: account.charges_enabled ?? false,
    onboardingComplete: account.details_submitted ?? false,
  };
}

// ─── Dashboard link ─────────────────────────────────────────────────────────

export async function getAccountDashboardLink(companyId: string): Promise<string> {
  const company = await Company.findById(toObjectId(companyId)).lean();
  if (!company) throw Object.assign(new Error("Company not found"), { status: 404 });

  const c = company as Record<string, unknown>;
  if (!c.stripeAccountId) {
    throw Object.assign(new Error("Company does not have a Stripe account"), { status: 400 });
  }

  const loginLink = await requireStripe().accounts.createLoginLink(c.stripeAccountId as string);
  return loginLink.url;
}

// ─── Account balance ────────────────────────────────────────────────────────

export async function getAccountBalance(companyId: string): Promise<{
  available: Array<{ amount: number; currency: string }>;
  pending: Array<{ amount: number; currency: string }>;
}> {
  const company = await Company.findById(toObjectId(companyId)).lean();
  if (!company) throw Object.assign(new Error("Company not found"), { status: 404 });

  const c = company as Record<string, unknown>;
  if (!c.stripeAccountId) {
    throw Object.assign(new Error("Company does not have a Stripe account"), { status: 400 });
  }

  const balance = await requireStripe().balance.retrieve({
    stripeAccount: c.stripeAccountId as string,
  });

  return {
    available: balance.available.map((b) => ({ amount: b.amount, currency: b.currency })),
    pending: balance.pending.map((b) => ({ amount: b.amount, currency: b.currency })),
  };
}
