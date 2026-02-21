import { z } from "zod";

const templateHeaderSchema = z.object({
  showLogo:          z.boolean().default(true),
  logoPosition:      z.enum(["left", "center", "right"]).default("left"),
  title:             z.string().max(500).default(""),
  subtitle:          z.string().max(500).default(""),
  studentInfoFields: z.array(z.string().max(100)).max(10).default(["Name", "Date"]),
});

const templateInstructionsSchema = z.object({
  show:     z.boolean().default(true),
  text:     z.string().max(10000).default(""),
  position: z.enum(["before_sections", "per_section"]).default("before_sections"),
});

const templateSectionsSchema = z.object({
  numberingStyle:           z.enum(["numeric", "alpha", "roman"]).default("numeric"),
  showSectionHeaders:       z.boolean().default(true),
  pageBreakBetweenSections: z.boolean().default(false),
});

const templateFooterSchema = z.object({
  showPageNumbers: z.boolean().default(true),
  copyrightText:   z.string().max(500).default(""),
  showWatermark:   z.boolean().default(false),
  watermarkText:   z.string().max(200).default(""),
});

const templateFormattingSchema = z.object({
  paperSize: z.enum(["A4", "Letter"]).default("A4"),
  margins: z.object({
    top:    z.number().min(0).max(100).default(20),
    right:  z.number().min(0).max(100).default(15),
    bottom: z.number().min(0).max(100).default(20),
    left:   z.number().min(0).max(100).default(15),
  }).optional(),
  fontSize:    z.number().min(8).max(24).default(12),
  fontFamily:  z.string().max(100).default("Arial"),
  lineSpacing: z.number().min(1).max(3).default(1.5),
});

const layoutSchema = z.object({
  header:       templateHeaderSchema.optional(),
  instructions: templateInstructionsSchema.optional(),
  sections:     templateSectionsSchema.optional(),
  footer:       templateFooterSchema.optional(),
  formatting:   templateFormattingSchema.optional(),
});

export const createPaperTemplateSchema = z.object({
  name:        z.string().min(1).max(200).trim(),
  description: z.string().max(2000).optional(),
  layout:      layoutSchema.optional(),
});

export const updatePaperTemplateSchema = z.object({
  name:        z.string().min(1).max(200).trim().optional(),
  description: z.string().max(2000).optional(),
  layout: z.object({
    header:       templateHeaderSchema.partial().optional(),
    instructions: templateInstructionsSchema.partial().optional(),
    sections:     templateSectionsSchema.partial().optional(),
    footer:       templateFooterSchema.partial().optional(),
    formatting: z.object({
      paperSize:   z.enum(["A4", "Letter"]).optional(),
      margins: z.object({
        top:    z.number().min(0).max(100).optional(),
        right:  z.number().min(0).max(100).optional(),
        bottom: z.number().min(0).max(100).optional(),
        left:   z.number().min(0).max(100).optional(),
      }).optional(),
      fontSize:    z.number().min(8).max(24).optional(),
      fontFamily:  z.string().max(100).optional(),
      lineSpacing: z.number().min(1).max(3).optional(),
    }).optional(),
  }).optional(),
});
