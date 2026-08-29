import { PAGINATION } from '../config/constants.js';

/**
 * Run a paged query and return the rows with the meta block the API envelope expects.
 *
 *   const { data, meta } = await paginateQuery(Beneficiary, filter, req.validatedQuery);
 *
 * `limit` is clamped here as well as in the zod schema. Schemas only guard HTTP callers —
 * a cron job or a service calling this directly would otherwise be able to pull the whole
 * beneficiary register into memory.
 *
 * `maxLimit` RAISES THAT CEILING FOR ONE CALLER, and the caller has to ask. It exists for
 * the metric series, which is non-personal by construction and useless in 100-row slices
 * — see PAGINATION.METRIC_MAX_LIMIT. Do not pass it from anything that reads rows about
 * people; the default is the protection.
 *
 * NOTE ON `lean`: it is off by default and should stay off for anything holding personal
 * information. A lean result is a plain object, so the model's toJSON transform never
 * runs — and that transform is the last line of defence that strips permit numbers and
 * vulnerability flags out of a response.
 */
export async function paginateQuery(Model, filter = {}, options = {}) {
  const {
    page: rawPage = 1,
    limit: rawLimit = PAGINATION.DEFAULT_LIMIT,
    sort = '-createdAt',
    select,
    populate,
    lean = false,
    maxLimit = PAGINATION.MAX_LIMIT,
  } = options;

  const page = Math.max(1, Number(rawPage) || 1);
  const limit = Math.min(Math.max(1, Number(rawLimit) || PAGINATION.DEFAULT_LIMIT), maxLimit);
  const skip = (page - 1) * limit;

  let query = Model.find(filter).sort(sort).skip(skip).limit(limit);
  if (select) query = query.select(select);
  if (populate) query = query.populate(populate);
  if (lean) query = query.lean();

  // countDocuments respects the filter; estimatedDocumentCount would not.
  const [data, total] = await Promise.all([query.exec(), Model.countDocuments(filter)]);

  const pages = Math.max(1, Math.ceil(total / limit));

  return {
    data,
    meta: {
      page,
      limit,
      total,
      pages,
      hasNext: page < pages,
      hasPrev: page > 1,
    },
  };
}

export default paginateQuery;
