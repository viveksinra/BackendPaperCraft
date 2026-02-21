const mongoose = require("mongoose");
const registry = require("../../engine/schemaExplorer/registry");

function validateEntity(req, res) {
  const { entity } = req.params || {};
  const cfg = registry[entity];
  if (!cfg) {
    return res.status(400).json({ message: "Unknown entity", variant: "error" });
  }
  req._schemaExplorerCfg = cfg;
  return null;
}

function coerceNumber(value, fallback) {
  const n = parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
}

function validateFilters(filters, allowedFields) {
  if (filters == null) return { ok: true };
  if (typeof filters !== "object" || Array.isArray(filters)) {
    return { ok: false, reason: "filters must be an object" };
  }
  for (const key of Object.keys(filters)) {
    if (!allowedFields.includes(key)) {
      return { ok: false, reason: `filter field not allowed: ${key}` };
    }
    const value = filters[key];
    if (Array.isArray(value)) continue;
    if (value && typeof value === "object") {
      const { from, to } = value;
      if (!(from && to)) {
        return { ok: false, reason: `dateRange filter for ${key} requires {from,to}` };
      }
      if (Number.isNaN(Date.parse(from)) || Number.isNaN(Date.parse(to))) {
        return { ok: false, reason: `invalid dateRange values for ${key}` };
      }
      continue;
    }
    const t = typeof value;
    if (!(["string", "number", "boolean"].includes(t))) {
      return { ok: false, reason: `unsupported filter type for ${key}` };
    }
  }
  return { ok: true };
}

function validateListRequest(req, res, next) {
  const entityErr = validateEntity(req, res);
  if (entityErr) return; // response already sent

  const input = req.method === "GET" ? (req.query || {}) : (req.body || {});
  const page = coerceNumber(input.page, 1);
  const pageSize = coerceNumber(input.pageSize, 25);
  const sortField = input.sortField || "_id";
  const sortDirection = input.sortDirection || "desc";
  const searchText = input.searchText;
  const filters = input.filters || {};

  if (page < 1) return res.status(400).json({ message: "page must be >= 1", variant: "error" });
  if (pageSize < 1 || pageSize > 200) return res.status(400).json({ message: "pageSize must be between 1 and 200", variant: "error" });
  if (!["asc", "desc"].includes(String(sortDirection).toLowerCase())) {
    return res.status(400).json({ message: "sortDirection must be 'asc' or 'desc'", variant: "error" });
  }
  if (typeof sortField !== "string" || sortField.length > 64) {
    return res.status(400).json({ message: "sortField must be a string <= 64 chars", variant: "error" });
  }
  if (searchText != null && typeof searchText !== "string") {
    return res.status(400).json({ message: "searchText must be a string", variant: "error" });
  }
  if (typeof searchText === "string" && searchText.length > 256) {
    return res.status(400).json({ message: "searchText too long", variant: "error" });
  }

  const cfg = req._schemaExplorerCfg;
  const vf = validateFilters(filters, cfg.allowedFilterFields || []);
  if (!vf.ok) return res.status(400).json({ message: `Invalid filters: ${vf.reason}`, variant: "error" });

  return next();
}

function validateGetOneRequest(req, res, next) {
  const entityErr = validateEntity(req, res);
  if (entityErr) return;
  const { id } = req.params || {};
  if (!id || !mongoose.isValidObjectId(id)) {
    return res.status(400).json({ message: "Invalid id", variant: "error" });
  }
  return next();
}

function validateExportRequest(req, res, next) {
  // Reuse list validation rules; export-specific params can be validated here if added later
  return validateListRequest(req, res, next);
}

module.exports = { validateListRequest, validateGetOneRequest, validateExportRequest };


