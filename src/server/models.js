/*   * Every model, imported for its registration side effect.
 *
 * WHAT THIS FIXES, AND WHY IT IS A PORT PROBLEM RATHER THAN A DESIGN ONE.
 *
 * Mongoose registers a model when its module is first imported. Under Express that
 * happened once: app.js pulled in every route, every route pulled in its service, and by
 * the time a request arrived the whole schema registry was populated. `populate('author')`
 * resolved because SOME other file had already imported the User model.
 *
 * A Next route is its own bundle. `/api/v1/auth/me` imports the User model and populates
 * `departmentId` — and nothing in that bundle imports the Department model, so mongoose
 * throws MissingSchemaError and the route 500s. That is a real fault: AuthProvider calls
 * /me on boot, so the symptom is signing in and immediately appearing signed out.
 *
 * It is worse than a single broken route, because it is LATENT. Mongoose only needs the
 * model when there is actually a document to resolve, so a populate over rows whose
 * reference is null passes happily and fails the first time somebody assigns one. Several
 * services populate models they never import: cases populates beneficiary and caseworker,
 * finance populates four different User paths, chatboard populates author. Every one of
 * those is an error waiting for its first non-null row.
 *
 * So the registry is restored explicitly, in one file, imported by server/http/route.js —
 * which every route handler already goes through. That reproduces the Express invariant
 * rather than patching the routes one at a time as each one is discovered in production.
 *
 * The cost is that every server bundle carries every schema. That is some kilobytes on a
 * server bundle, against a class of 500 that only shows up once real data exists. Adding a
 * model? Add it here too.
 */

import './modules/ai/aiUsage.model.js';
import './modules/audit/audit.model.js';
import './modules/auth/accessRequest.model.js';
import './modules/auth/otp.model.js';
import './modules/beneficiaries/beneficiary.model.js';
import './modules/cases/case.model.js';
import './modules/chatboard/chatboard.model.js';
import './modules/departments/department.model.js';
import './modules/documents/document.model.js';
import './modules/education/education.model.js';
import './modules/enrollments/enrollment.model.js';
import './modules/events/event.model.js';
import './modules/finance/budget.model.js';
import './modules/finance/pettyCash.model.js';
import './modules/finance/transaction.model.js';
import './modules/fundraising/fundraising.model.js';
import './modules/notifications/notification.model.js';
import './modules/programmes/programme.model.js';
import './modules/referrals/referral.model.js';
import './modules/reports/metric.model.js';
import './modules/serviceRequests/serviceRequest.model.js';
import './modules/users/user.model.js';
import './modules/whatsapp/session.model.js';
