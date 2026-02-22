import { Request, Response, NextFunction } from "express";
import path from "path";
import * as productService from "../../services/productService";
import * as purchaseService from "../../services/purchaseService";

const User = require(path.join(__dirname, "..", "..", "..", "Models", "User"));

type AuthedRequest = Request & { auth?: { sub?: string } };

/**
 * Access gating middleware factory.
 *
 * Checks whether the authenticated student has purchased the content
 * identified by `referenceType` and `req.params` (id, testId, etc.).
 *
 * - If no product exists for this content: ALLOW (content not priced)
 * - If product is free: ALLOW
 * - If student has purchased: ALLOW
 * - Otherwise: 403 with product info for purchase prompt
 */
export function requireAccess(referenceType: string) {
  return async (req: AuthedRequest, res: Response, next: NextFunction) => {
    try {
      const email = req.auth?.sub;
      if (!email) {
        return res.status(401).sendEnvelope("authentication required", "error");
      }

      // Resolve referenceId from params -- try common param names
      const referenceId =
        req.params.id ||
        req.params.referenceId ||
        req.params.testId ||
        req.params.paperId ||
        req.params.paperSetId;

      if (!referenceId) {
        return next(); // No reference to gate
      }

      // Need companyId from params or active context
      const companyId = req.params.companyId || req.activeCompanyId;
      if (!companyId) {
        return next(); // No company context to check against
      }

      // Check if this content has a product listing
      const product = await productService.getProductByReference(companyId, referenceType, referenceId);
      if (!product) {
        return next(); // Not priced, allow access
      }

      // Free products don't require a purchase
      if (product.pricing?.isFree) {
        return next();
      }

      // Resolve student userId
      const user = await User.findOne({ email });
      if (!user) {
        return res.status(401).sendEnvelope("user not found", "error");
      }
      const studentUserId = user._id.toString();

      // Check purchase
      const { hasAccess } = await purchaseService.hasAccess(studentUserId, referenceType, referenceId);
      if (hasAccess) {
        return next();
      }

      // No access -- return 403 with product info for purchase prompt
      const effectivePrice =
        product.pricing?.discountPrice != null &&
        product.pricing.discountValidUntil &&
        new Date(product.pricing.discountValidUntil) > new Date()
          ? product.pricing.discountPrice
          : product.pricing?.basePrice ?? 0;

      return res.status(403).json({
        status: "error",
        message: "Purchase required",
        product: {
          id: String(product._id),
          title: product.title,
          price: effectivePrice,
          currency: product.pricing?.currency || "GBP",
        },
      });
    } catch (err: any) {
      return res.status(err.status || 500).sendEnvelope(err.message || "access check failed", "error");
    }
  };
}
