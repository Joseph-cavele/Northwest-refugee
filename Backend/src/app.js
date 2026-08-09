import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import pinoHttp from 'pino-http';

import env from './config/env.js';
import logger, { serializers } from './config/logger.js';
import { requestId } from './middleware/requestId.js';
import { apiLimiter } from './middleware/rateLimiter.js';
import { sanitizeRequest } from './middleware/validate.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';

import authRoutes from './modules/auth/auth.routes.js';
import departmentRoutes from './modules/departments/department.routes.js';
import notificationRoutes from './modules/notifications/notification.routes.js';
import aiUsageRoutes from './modules/ai/aiUsage.routes.js';
import beneficiaryRoutes from './modules/beneficiaries/beneficiary.routes.js';
import documentRoutes from './modules/documents/document.routes.js';
import serviceRequestRoutes from './modules/serviceRequests/serviceRequest.routes.js';
import referralRoutes from './modules/referrals/referral.routes.js';
import auditRoutes from './modules/audit/audit.routes.js';
import chatboardRoutes from './modules/chatboard/chatboard.routes.js';
import caseRoutes from './modules/cases/case.routes.js';
import programmeRoutes from './modules/programmes/programme.routes.js';
import educationRoutes from './modules/education/education.routes.js';
import enrollmentRoutes from './modules/enrollments/enrollment.routes.js';
import eventRoutes from './modules/events/event.routes.js';
import fundraisingRoutes from './modules/fundraising/fundraising.routes.js';
import financeRoutes from './modules/finance/finance.routes.js';
import reportRoutes from './modules/reports/report.routes.js';
import guideRoutes from './modules/guide/guide.routes.js';
import whatsappRoutes from './modules/whatsapp/whatsapp.routes.js';
import paymentRoutes from './modules/payments/payment.routes.js';

const app = express();

// One reverse proxy hop (Render, Nginx). Wrong here and rate limiting buckets every
// client under the proxy's IP, which locks out the whole office at once.
app.set('trust proxy', 1);

app.use(requestId);
app.use(helmet());
app.use(
  cors({
    origin: env.CORS_ORIGIN.split(','),
    credentials: true, // allows the httpOnly refresh cookie cross-origin
  })
);
app.use(compression());

// ---------------------------------------------------------------------------
// WEBHOOKS — mount ABOVE express.json(). Do not reorder.
// ---------------------------------------------------------------------------
// Paystack HMACs the raw request bytes. Once express.json() has parsed and re-serialised
// the body, key order and whitespace are gone, the digest can no longer be reproduced, and
// every legitimate payment notification fails verification. The router applies rawBody
// itself; what matters here is that it is mounted BEFORE express.json().
app.use('/api/v1/payments/webhooks', paymentRoutes);

// Meta signs the raw JSON body of every WhatsApp webhook (X-Hub-Signature-256), for the
// same reason and with the same constraint.
app.use('/api/v1/whatsapp', whatsappRoutes);

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Strips Mongo operators and prototype-pollution keys. Must run after body parsing and
// before any route. express-mongo-sanitize throws on Express 5 — this is the replacement.
app.use(sanitizeRequest);

app.use(
  pinoHttp({
    logger,
    // Reuse the id already stamped on the request so log lines and the error body agree.
    genReqId: (req) => req.id,
    // The platform health probe would otherwise be most of the log volume.
    autoLogging: { ignore: (req) => req.url === '/health' },
    // Our serializers expect the raw Node req/res. Without this pino-http substitutes its
    // own pre-shaped objects and the header allowlist never runs.
    serializers,
    wrapSerializers: false,
  })
);

app.use('/api', apiLimiter);

// Unauthenticated on purpose: the platform probe cannot present a token. Reports process
// liveness only — deliberately says nothing about the database or any dependency.
app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok', uptime: process.uptime() });
});

// --- API v1 ---------------------------------------------------------------
// Public: the help guide behind the website widget. Static content, no auth — someone
// looking for help must not need an account to find out how to get it.
app.use('/api/v1/guide', guideRoutes);

app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/departments', departmentRoutes);
app.use('/api/v1/notifications', notificationRoutes);
app.use('/api/v1/ai', aiUsageRoutes);
app.use('/api/v1/beneficiaries', beneficiaryRoutes);
app.use('/api/v1/documents', documentRoutes);
app.use('/api/v1/service-requests', serviceRequestRoutes);
app.use('/api/v1/referrals', referralRoutes);
app.use('/api/v1/audit', auditRoutes);
app.use('/api/v1/chatboard', chatboardRoutes);
app.use('/api/v1/cases', caseRoutes);
app.use('/api/v1/programmes', programmeRoutes);
app.use('/api/v1/education', educationRoutes);
app.use('/api/v1/enrollments', enrollmentRoutes);
app.use('/api/v1/events', eventRoutes);
app.use('/api/v1/fundraising', fundraisingRoutes);
app.use('/api/v1/finance', financeRoutes);
app.use('/api/v1/reports', reportRoutes);

// Terminal pair: unmatched route → 404, then the single error formatter. Nothing may be
// registered after these two or it will never be reached.
app.use(notFoundHandler);
app.use(errorHandler);

export default app;
