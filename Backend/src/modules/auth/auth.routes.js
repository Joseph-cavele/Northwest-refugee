import { Router } from 'express';
import { validate } from '../../middleware/validate.js';
import { authenticate, optionalAuthenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import {
  authLimiter,
  passwordResetLimiter,
  sensitiveActionLimiter,
} from '../../middleware/rateLimiter.js';
import { PERMISSIONS } from '../../config/permissions.js';
import * as auth from './auth.controller.js';
import * as accessRequest from './accessRequest.controller.js';
import * as schema from './auth.schema.js';

const router = Router();

// --- Public (credential and recovery flows) ------------------------------------
// authLimiter is keyed by IP+email so neither a shared office IP nor one account can be
// brute-forced; passwordResetLimiter throttles the endpoints that send email.
router.post('/login', authLimiter, validate({ body: schema.loginSchema }), auth.login);
router.post('/mfa/verify', authLimiter, validate({ body: schema.mfaVerifySchema }), auth.mfaVerify);
router.post('/refresh', auth.refresh);
router.post('/logout', optionalAuthenticate, auth.logout);
router.post('/accept-invite', validate({ body: schema.acceptInviteSchema }), auth.acceptInvite);
router.post(
  '/forgot-password',
  passwordResetLimiter,
  validate({ body: schema.forgotPasswordSchema }),
  auth.forgotPassword
);
router.post(
  '/reset-password',
  passwordResetLimiter,
  validate({ body: schema.resetPasswordSchema }),
  auth.resetPassword
);

// --- Staff access requests -----------------------------------------------------
// Declared before the `/:id` routes further down this section, and the only unauthenticated
// WRITE in the system. passwordResetLimiter is reused deliberately: submitting sends mail
// to an address the caller chose, which is the same abuse shape as a password reset.
router.get('/access-requests/options', accessRequest.options);
router.post(
  '/access-requests',
  passwordResetLimiter,
  validate({ body: schema.submitAccessRequestSchema }),
  accessRequest.submit
);

router.get(
  '/access-requests',
  authenticate,
  authorize(PERMISSIONS.ACCESS_REQUEST_READ),
  validate({ query: schema.listAccessRequestsSchema }),
  accessRequest.list
);
router.get(
  '/access-requests/:id',
  authenticate,
  authorize(PERMISSIONS.ACCESS_REQUEST_READ),
  validate({ params: schema.accessRequestIdParamSchema }),
  accessRequest.getById
);
// Approving mints a staff account, so it is held with the review permission rather than
// with read — see config/permissions.js.
router.post(
  '/access-requests/:id/approve',
  authenticate,
  authorize(PERMISSIONS.ACCESS_REQUEST_REVIEW),
  validate({
    params: schema.accessRequestIdParamSchema,
    body: schema.approveAccessRequestSchema,
  }),
  accessRequest.approve
);
router.post(
  '/access-requests/:id/reject',
  authenticate,
  authorize(PERMISSIONS.ACCESS_REQUEST_REVIEW),
  validate({
    params: schema.accessRequestIdParamSchema,
    body: schema.rejectAccessRequestSchema,
  }),
  accessRequest.reject
);

// --- Authenticated -------------------------------------------------------------
router
  .route('/me')
  .get(authenticate, auth.me)
  .patch(authenticate, validate({ body: schema.updateProfileSchema }), auth.updateProfile);

// Rate limited because it accepts a password: a stolen access token could otherwise be
// used to guess at the current one. Keyed by user rather than IP+email — the body carries
// no email, and bucketing the whole office behind one NAT address would let one person's
// typos lock out their colleagues.
router.post(
  '/change-password',
  authenticate,
  sensitiveActionLimiter,
  validate({ body: schema.changePasswordSchema }),
  auth.changePassword
);

router.post('/logout-all', authenticate, auth.logoutAll);
router.post('/mfa/enroll', authenticate, auth.mfaEnroll);
router.post('/mfa/enable', authenticate, validate({ body: schema.mfaEnableSchema }), auth.mfaEnable);

// Staff invitation — permission-checked, never role-checked.
router.post(
  '/invite',
  authenticate,
  authorize(PERMISSIONS.USER_INVITE),
  validate({ body: schema.inviteSchema }),
  auth.invite
);

export default router;
