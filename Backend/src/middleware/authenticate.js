import AppError from '../utils/AppError.js';
import { verifyAccessToken } from '../utils/tokens.js';
import User from '../modules/users/user.model.js';

function bearerToken(req) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) return null;
  return header.slice('Bearer '.length).trim();
}

// Load the staff user behind a Bearer access token. Anything but an active account is
// rejected, so a disabled user is locked out the moment their next request lands rather
// than when their token happens to expire.
async function loadUser(token) {
  const payload = verifyAccessToken(token);
  const user = await User.findById(payload.sub);
  if (!user || user.status !== 'active') {
    throw AppError.unauthorized('Account is not active');
  }
  // Reject tokens minted before the last password reset or forced logout-all.
  if ((payload.tv ?? 0) !== (user.tokenVersion ?? 0)) {
    throw AppError.unauthorized('Session expired, please sign in again');
  }
  return user;
}

export async function authenticate(req, _res, next) {
  try {
    const token = bearerToken(req);
    if (!token) throw AppError.unauthorized();
    req.user = await loadUser(token);
    next();
  } catch (err) {
    next(err);
  }
}

// Attaches req.user when a valid token is present but never blocks. For endpoints that
// behave differently signed-in vs anonymous — logout being the obvious one.
export async function optionalAuthenticate(req, _res, next) {
  try {
    const token = bearerToken(req);
    if (token) req.user = await loadUser(token);
  } catch {
    // Ignore a bad or expired token here — the route is usable either way.
  }
  next();
}

export default authenticate;
