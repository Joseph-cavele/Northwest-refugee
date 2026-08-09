/**
 * Wrap an async route handler so a rejected promise reaches errorHandler instead of
 * hanging the request until the client times out. Every async controller is wrapped in
 * this — an unwrapped one fails silently, which is far harder to diagnose than a 500.
 */
export function catchAsync(fn) {
  return function wrapped(req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

export default catchAsync;
