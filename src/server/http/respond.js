import { NextResponse } from 'next/server';

/*
 * The success envelope, as NextResponse.
 *
 * The contract is unchanged from Express — `{ success, data, meta? }` on the way out,
 * `{ success: false, error, requestId }` on failure — because the whole front end switches
 * on it and API.md documents it. Only the transport changed.
 *
 * Errors are NOT built here. They are thrown as AppError and shaped in one place by
 * `route()`, exactly as errorHandler was the only error formatter under Express.
 */

const REQUEST_ID_HEADER = 'x-request-id';

/**
 * @param {*} data
 * @param {object} [options]
 * @param {number} [options.status=200]
 * @param {object} [options.meta]      pagination or other envelope-level context
 * @param {string} [options.requestId] echoed back; `route()` supplies it
 */
export function success(data, { status = 200, meta, requestId } = {}) {
  const body = { success: true, data };
  if (meta) body.meta = meta;

  return NextResponse.json(body, {
    status,
    headers: requestId ? { [REQUEST_ID_HEADER]: requestId } : undefined,
  });
}

export function created(data, options = {}) {
  return success(data, { ...options, status: 201 });
}

/**
 * 204 carries no body — anything passed here would be silently dropped by the client, so
 * nothing is accepted.
 */
export function noContent({ requestId } = {}) {
  return new NextResponse(null, {
    status: 204,
    headers: requestId ? { [REQUEST_ID_HEADER]: requestId } : undefined,
  });
}

/**
 * Spread a paginateQuery() result straight into the envelope:
 *
 *   return paginated(await listBeneficiaries(query, user));
 */
export function paginated({ data, meta }, options = {}) {
  return success(data, { ...options, meta });
}

/**
 * Plain text, for the one endpoint that must not receive JSON.
 *
 * Meta's WhatsApp GET /webhook handshake expects `hub.challenge` echoed back as bare text;
 * a JSON envelope fails verification with only a generic dashboard error to show for it.
 */
export function text(body, { status = 200 } = {}) {
  return new NextResponse(String(body), {
    status,
    headers: { 'content-type': 'text/plain; charset=utf-8' },
  });
}

export { REQUEST_ID_HEADER };
