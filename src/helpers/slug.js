import slugify from 'slugify';

/**
 * Build a URL-safe slug that is unique for `model`, appending -2, -3 ... on
 * collision. Pass `excludeId` when renaming an existing record.
 */
export const uniqueSlug = async (model, value, excludeId = null) => {
  const base = slugify(String(value), { lower: true, strict: true, trim: true }) || 'item';
  let candidate = base;
  let suffix = 1;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const existing = await model.findOne({ where: { slug: candidate } });
    if (!existing || existing.id === excludeId) return candidate;
    suffix += 1;
    candidate = `${base}-${suffix}`;
  }
};

export default uniqueSlug;
