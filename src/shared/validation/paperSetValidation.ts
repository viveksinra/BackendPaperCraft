import { z } from "zod";

const objectIdRegex = /^[0-9a-fA-F]{24}$/;

const paperSetPricingSchema = z.object({
  currency:             z.enum(["GBP", "INR"]).default("GBP"),
  pricePerPaper:        z.number().min(0).default(0),
  bundlePrice:          z.number().min(0).default(0),
  checkingServicePrice: z.number().min(0).default(0),
  oneToOneServicePrice: z.number().min(0).default(0),
  isFree:               z.boolean().default(false),
});

const paperSetEntrySchema = z.object({
  paperId: z.string().regex(objectIdRegex),
  order:   z.number().int().min(0).default(0),
});

export const createPaperSetSchema = z.object({
  title:            z.string().min(1).max(300).trim(),
  shortDescription: z.string().max(500).optional(),
  fullDescription:  z.string().max(10000).optional(),
  examType:         z.string().max(100).default("Custom"),
  yearGroup:        z.string().max(100).default(""),
  subjectCategory:  z.string().max(100).default(""),
  papers:           z.array(paperSetEntrySchema).optional(),
  pricing:          paperSetPricingSchema.optional(),
});

export const updatePaperSetSchema = z.object({
  title:            z.string().min(1).max(300).trim().optional(),
  shortDescription: z.string().max(500).optional(),
  fullDescription:  z.string().max(10000).optional(),
  examType:         z.string().max(100).optional(),
  yearGroup:        z.string().max(100).optional(),
  subjectCategory:  z.string().max(100).optional(),
  papers:           z.array(paperSetEntrySchema).optional(),
  pricing:          paperSetPricingSchema.partial().optional(),
  imageUrls:        z.array(z.string().url()).max(10).optional(),
  sortDate:         z.string().datetime().optional(),
});

export const addPaperToSetSchema = z.object({
  paperId: z.string().regex(objectIdRegex),
  order:   z.number().int().min(0).optional(),
});

export const listPaperSetsQuerySchema = z.object({
  status:   z.enum(["draft", "published", "archived"]).optional(),
  examType: z.string().max(100).optional(),
  search:   z.string().max(200).optional(),
  page:     z.coerce.number().int().min(1).default(1),
  limit:    z.coerce.number().int().min(1).max(100).default(20),
  sortBy:   z.enum(["sortDate", "createdAt", "title"]).default("sortDate"),
  sortDir:  z.enum(["asc", "desc"]).default("desc"),
});
