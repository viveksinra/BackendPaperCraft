/* eslint-disable no-await-in-loop */
function slugifyCompanyName(value) {
  return value
    .toString()
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-")
    .slice(0, 80);
}

async function generateCompanySlug(model, name, selfId) {
  const fallback = `company-${Date.now().toString(36)}`;
  const base = slugifyCompanyName(name) || fallback;
  let slug = base;
  let counter = 1;

  while (
    await model.exists({
      slug,
      ...(selfId ? { _id: { $ne: selfId } } : {}),
    })
  ) {
    slug = `${base}-${counter}`;
    counter += 1;
  }

  return slug;
}

module.exports = {
  slugifyCompanyName,
  generateCompanySlug,
};

