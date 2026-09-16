const DEFAULT_LIMIT = 12;
const MAX_LIMIT = 100;

/** Normalise `?page=&limit=` into Sequelize offset/limit values. */
export const getPagination = (query, defaultLimit = DEFAULT_LIMIT) => {
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(MAX_LIMIT, Math.max(1, Number(query.limit) || defaultLimit));
  return { page, limit, offset: (page - 1) * limit };
};

/** Shape a `findAndCountAll` result into the envelope the client expects. */
export const buildMeta = ({ count, page, limit }) => ({
  page,
  limit,
  total: count,
  totalPages: Math.max(1, Math.ceil(count / limit)),
  hasNext: page * limit < count,
  hasPrev: page > 1,
});

export default getPagination;
