// One success envelope for the whole API: { success, data, meta? }.
//
// Errors are the mirror image — { success: false, error, requestId } — and are emitted
// only by middleware/errorHandler.js. A controller that calls res.json() directly is what
// breaks a frontend that switches on `success`, so route every response through here.

/**
 * @param {import('express').Response} res
 * @param {*} data
 * @param {object} [options]
 * @param {number} [options.status=200]
 * @param {object} [options.meta]  pagination or other envelope-level context
 */
export function sendSuccess(res, data, { status = 200, meta } = {}) {
  const body = { success: true, data };
  if (meta) body.meta = meta;
  return res.status(status).json(body);
}

export function sendCreated(res, data, meta) {
  return sendSuccess(res, data, { status: 201, meta });
}

/**
 * 204 carries no body — anything passed here would be silently dropped by the client,
 * so nothing is accepted.
 */
export function sendNoContent(res) {
  return res.status(204).end();
}

/**
 * Spread a paginateQuery() result straight into the envelope:
 *
 *   sendPaginated(res, await listBeneficiaries(req.validatedQuery, req.user));
 */
export function sendPaginated(res, { data, meta }) {
  return sendSuccess(res, data, { meta });
}
