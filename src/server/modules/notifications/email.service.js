import { Resend } from 'resend';
import env from '../../config/env.js';
import { loggerFor } from '../../config/logger.js';
import { formatZAR } from '../../utils/money.js';
import { formatDate } from '../../utils/dates.js';

const log = loggerFor('email.service');

// Transactional email via Resend. The client is built lazily and only when a key is
// configured; without RESEND_API_KEY the action link is logged instead of sent, so the
// invite and reset flows are testable without a live provider.

const resend = env.RESEND_API_KEY ? new Resend(env.RESEND_API_KEY) : null;

async function deliver({ to, subject, html }) {
  if (!resend) {
    log.warn({ subject }, 'RESEND_API_KEY not set — email not sent');
    return;
  }
  const { error } = await resend.emails.send({
    from: env.EMAIL_FROM,
    to,
    subject,
    html,
    ...(env.MAIL_REPLY_TO ? { replyTo: env.MAIL_REPLY_TO } : {}),
  });
  // Resend resolves (does not reject) with an `error` object on failure — a bare await
  // would silently swallow a bounced send.
  if (error) throw new Error(`Email delivery failed: ${error.message ?? error}`);
}

/**
 * Log an action link when the email did not go out, so a developer is not locked out of a
 * flow by a mail provider.
 *
 * IT MUST NEVER RUN IN PRODUCTION — the link is a single-use credential and this puts it in
 * plain text in the log.
 *
 * `delivered` is false in two different situations and both need this. No provider
 * configured is the obvious one. The other cost an afternoon: a provider IS configured but
 * REFUSES the send — an unverified `from` domain returns 403 on every message — and the
 * old version only checked `!resend`, so a misconfigured provider produced a flow with no
 * way to finish it and no link anywhere to recover. The caller still throws; this only
 * makes the failure survivable in development.
 */
function logActionLink(delivered, link, what) {
  if (delivered || env.NODE_ENV === 'production') return;
  log.warn({ link }, `${what} (dev only — email was not delivered)`);
}

// Inline styles only — email clients discard <style> blocks and external CSS.
function layout(heading, bodyHtml) {
  return `<div style="font-family:system-ui,Arial,sans-serif;max-width:520px;margin:auto;color:#1a1a1a">
    <h2 style="color:#0f5132">${heading}</h2>
    ${bodyHtml}
    <hr style="border:none;border-top:1px solid #e5e5e5;margin:24px 0"/>
    <p style="font-size:12px;color:#777">North West House of Refuge — staff system.
    If you were not expecting this email, you can safely ignore it.</p>
  </div>`;
}

function button(href, label) {
  return `<p><a href="${href}" style="display:inline-block;padding:10px 18px;background:#0f5132;
    color:#fff;text-decoration:none;border-radius:6px">${label}</a></p>
    <p style="font-size:12px;color:#777">Or paste this link into your browser:<br/>${href}</p>`;
}

export async function sendInviteEmail(user, rawToken) {
  const link = `${env.APP_URL}/accept-invite?token=${encodeURIComponent(rawToken)}`;
  let delivered = false;
  try {
    await deliver({
      to: user.email,
      subject: 'You have been invited to the NWHR staff system',
      html: layout(
        `Welcome, ${user.name}`,
        `<p>You have been invited to the North West House of Refuge staff dashboard.
         Set your password to activate your account. This link expires in 7 days.</p>
         ${button(link, 'Set your password')}`
      ),
    });
    delivered = Boolean(resend);
  } finally {
    // `finally`, not the success path: a refused send must still leave the link somewhere
    // recoverable in development, and the throw must still reach the caller.
    logActionLink(delivered, link, 'invite link');
  }
}

/**
 * Escape anything that came from a person before it goes into HTML. A donor's own name
 * arrives from a form, and an unescaped `<` would let a stray angle bracket break the
 * receipt — or worse, inject markup into an email the organisation signed.
 */
function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function row(label, value) {
  return `<tr>
    <td style="padding:6px 12px 6px 0;color:#555;vertical-align:top">${esc(label)}</td>
    <td style="padding:6px 0;font-weight:600">${esc(value)}</td>
  </tr>`;
}

/**
 * Receipt for a settled donation.
 *
 * A valid s18A tax certificate must carry the PBO's SARS approval number, the
 * organisation's name and address, the donor's details and tax reference, the amount and
 * date, and the certification that the donation will be used solely for the
 * organisation's objects. Without S18A_PBO_NUMBER none of that can be asserted, so this
 * sends a plain acknowledgement instead — an invalid certificate is worse than none,
 * because a donor may try to claim against it.
 *
 * @returns {Promise<{ sent: boolean, isTaxCertificate: boolean }>}
 */
export async function sendDonationReceiptEmail(donation, donor) {
  if (!donor?.email) {
    log.warn({ donation: String(donation._id) }, 'no donor email — receipt not sent');
    return { sent: false, isTaxCertificate: false };
  }

  const isTaxCertificate = Boolean(env.S18A_PBO_NUMBER);
  const amount = formatZAR(donation.amountCents, { plain: true });
  const received = formatDate(donation.settledAt ?? donation.receivedAt);

  const details = `<table style="border-collapse:collapse;margin:16px 0;font-size:14px">
    ${row('Receipt number', donation.receiptNumber ?? donation.reference)}
    ${row('Date received', received)}
    ${row('Amount', amount)}
    ${row('Method', donation.method)}
    ${row('Donor', donor.name)}
    ${donor.address ? row('Donor address', donor.address) : ''}
    ${isTaxCertificate && donor.taxNumber ? row('Donor tax reference', donor.taxNumber) : ''}
    ${isTaxCertificate ? row('PBO number', env.S18A_PBO_NUMBER) : ''}
  </table>`;

  const certification = isTaxCertificate
    ? `<p style="font-size:13px;color:#333">This receipt is issued for the purposes of section 18A(1) of the
       Income Tax Act, 1962. It certifies that the donation described above was received by
       ${esc(env.ORG_NAME)} (PBO ${esc(env.S18A_PBO_NUMBER)}) and will be used exclusively in carrying out
       the public benefit activities of the organisation.</p>
       ${env.ORG_ADDRESS ? `<p style="font-size:12px;color:#777">${esc(env.ORG_ADDRESS)}</p>` : ''}`
    : `<p style="font-size:13px;color:#a15c00">This is an acknowledgement of your donation, not a section 18A
       tax certificate. If you need one for your tax return, please reply to this email and we will issue it.</p>`;

  await deliver({
    to: donor.email,
    subject: isTaxCertificate
      ? `Your section 18A tax receipt — ${donation.receiptNumber}`
      : `Thank you for your donation — ${donation.reference}`,
    html: layout(
      `Thank you, ${donor.name}`,
      `<p>We have received your donation of <strong>${esc(amount)}</strong>. It goes directly towards
       our work with refugees, asylum seekers and migrants in Rustenburg.</p>
       ${details}
       ${certification}`
    ),
  });

  if (!resend && env.NODE_ENV !== 'production') {
    log.warn({ receipt: donation.receiptNumber, amount }, 'donation receipt (dev only)');
  }

  return { sent: true, isTaxCertificate };
}

/**
 * Acknowledge a staff access request.
 *
 * Everything interpolated here was typed into a PUBLIC form by someone with no account, so
 * it goes through esc() without exception — this is the one email in the system whose
 * content is wholly attacker-controlled.
 *
 * Says only that the request was received. It deliberately does not confirm whether the
 * address was already a staff account: the endpoint answers identically either way, and an
 * email that gave the game away would undo that.
 */
export async function sendAccessRequestReceivedEmail(request) {
  await deliver({
    to: request.email,
    subject: 'We have received your access request — NWHR',
    html: layout(
      `Thank you, ${esc(request.firstName)}`,
      `<p>We have received your request for access to the North West House of Refuge staff
       system. An administrator will review it and you will be emailed the outcome.</p>
       <p>If the request is approved you will receive a link to set your password and
       activate your account. There is nothing you need to do in the meantime.</p>`
    ),
  });
}

/** Tell an applicant their request was declined, with the reviewer's reason. */
export async function sendAccessRequestRejectedEmail(request) {
  const reason = request.decisionNote
    ? `<p style="font-size:14px"><strong>Reason:</strong> ${esc(request.decisionNote)}</p>`
    : '';

  await deliver({
    to: request.email,
    subject: 'Your access request — NWHR',
    html: layout(
      `Hello ${esc(request.firstName)}`,
      `<p>Thank you for your interest in the North West House of Refuge staff system.
       Your request for access has not been approved at this time.</p>
       ${reason}
       <p>If you believe this is a mistake, please reply to this email and we will look
       at it again.</p>`
    ),
  });
}

export async function sendPasswordResetEmail(user, rawToken) {
  const link = `${env.APP_URL}/reset-password?token=${encodeURIComponent(rawToken)}`;
  let delivered = false;
  try {
    await deliver({
      to: user.email,
      subject: 'Reset your NWHR password',
      html: layout(
        'Password reset requested',
        `<p>We received a request to reset your password. This link expires in 1 hour.
         If you did not request it, ignore this email — your password will not change.</p>
         ${button(link, 'Reset password')}`
      ),
    });
    delivered = Boolean(resend);
  } finally {
    logActionLink(delivered, link, 'reset link');
  }
}
