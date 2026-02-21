import "./testSetup";
import { describe, it, expect, vi } from "vitest";
import type { DomainConfigDocument } from "../src/models/domainConfig";
import {
  buildPreviewUrl,
  ensurePreviewPath,
  normalizeBasePath,
} from "../src/services/domainConfig";
import { generateCompanySlug, slugifyCompanyName } from "../utils/companySlug";

describe("company slug helpers", () => {
  it("sanitizes company names into lowercase kebab-case", () => {
    expect(slugifyCompanyName("Acme Labs, Inc.")).toBe("acme-labs-inc");
    expect(slugifyCompanyName("  Montréal Québec  ")).toBe("montr-al-qu-bec");
  });

  it("appends suffix when slug already exists", async () => {
    const existsMock = vi
      .fn()
      .mockResolvedValueOnce(true) // acme-labs exists
      .mockResolvedValueOnce(false); // acme-labs-1 available

    const mockModel = { exists: existsMock };
    const slug = await generateCompanySlug(mockModel as never, "Acme Labs", undefined);
    expect(slug).toBe("acme-labs-1");
    expect(existsMock).toHaveBeenCalledTimes(2);
  });
});

describe("domain config helpers", () => {
  it("normalizes base paths", () => {
    expect(normalizeBasePath("blog")).toBe("/blog");
    expect(normalizeBasePath("/docs/")).toBe("/docs");
    expect(normalizeBasePath("")).toBe("/blog");
  });

  it("ensures preview paths follow slug/basePath combo", () => {
    const mockConfig = {
      basePath: "/blog",
      preview: { path: "/foo", enabled: true },
      previewPath: "/foo",
    } as unknown as DomainConfigDocument;

    const mutated = ensurePreviewPath("acme", mockConfig);
    expect(mutated).toBe(true);
    expect(mockConfig.preview?.path).toBe("/acme/blog");
    expect(mockConfig.previewPath).toBe("/acme/blog");
  });

  it("builds preview URL with token query parameter", () => {
    const mockConfig = {
      preview: {
        host: "preview.papercraft.com",
        path: "/acme/blog",
        token: "abc123",
        enabled: true,
      },
      previewHostname: "preview.papercraft.com",
      previewPath: "/acme/blog",
      previewToken: "abc123",
    } as unknown as DomainConfigDocument;

    const url = buildPreviewUrl(mockConfig, "https");
    expect(url).toBe("https://preview.papercraft.com/acme/blog?previewToken=abc123");
  });
});

