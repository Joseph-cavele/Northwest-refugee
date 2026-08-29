import { describe, it, expect } from 'vitest';
import {
  createEventSchema,
  updateEventSchema,
  publishEventSchema,
  listPublicEventsSchema,
} from '@/server/modules/events/event.schema.js';
import { PERMISSIONS, roleHasPermission } from '@/auth/permissions';

/*
 * The rules that decide what the public may see, and who may put it there.
 *
 * WHY THESE AND NOT THE HAPPY PATH. Publishing is the one feature in this system that takes
 * an internal record and puts it on the open internet. Everything asserted below is a way
 * that could go wrong quietly — a field slipping through a schema, a link with a scheme
 * nobody checked, a role gaining a power by inheritance. None of them would fail loudly in
 * development; all of them would be found by somebody outside the organisation.
 *
 * NO DATABASE. These are the schemas and the permission table, which is deliberate: they
 * are the two layers a caller meets before any service code runs, so they can be exercised
 * as pure data. The behaviours that need documents — publish refusing an incomplete notice,
 * the whitelisted public projection, a draft answering 404 — belong in a route suite, and
 * tests/README.md records that debt.
 *
 * PORTABLE. Only the first line is runner-specific: `describe`, `it` and `expect` are
 * globals under Jest and imports under this project's Vitest config (`globals: false`).
 */

const VALID_EVENT = {
  title: 'Documentation clinic',
  type: 'OUTREACH',
  startsAt: '2026-09-01T09:00:00.000Z',
};

describe('publication cannot be set through create or update', () => {
  /*
   * THE CENTRAL GUARANTEE OF THE WHOLE FEATURE. Publishing has its own endpoint and its own
   * permission precisely so that an officer holding `event:update` cannot put something on
   * the public site by adding one key to a body. If `status` ever survives a parse here,
   * that separation is decorative.
   */
  it('strips a status smuggled into a create body', () => {
    const parsed = createEventSchema.parse({
      ...VALID_EVENT,
      publication: { summary: 'A clinic', status: 'PUBLISHED' },
    });

    expect(parsed.publication).toBeDefined();
    expect(parsed.publication).not.toHaveProperty('status');
  });

  it('strips a status smuggled into an update body', () => {
    const parsed = updateEventSchema.parse({
      publication: { summary: 'Edited', status: 'PUBLISHED' },
    });

    expect(parsed.publication).not.toHaveProperty('status');
  });

  it('strips publishedAt and publishedBy, which are the server’s to stamp', () => {
    const parsed = createEventSchema.parse({
      ...VALID_EVENT,
      publication: {
        summary: 'A clinic',
        publishedAt: '2020-01-01T00:00:00.000Z',
        publishedBy: '507f1f77bcf86cd799439011',
      },
    });

    expect(parsed.publication).not.toHaveProperty('publishedAt');
    expect(parsed.publication).not.toHaveProperty('publishedBy');
  });
});

describe('links on a public page must be http(s)', () => {
  /*
   * These render as anchors on a page read by people with good reason to distrust a strange
   * link. `javascript:` in an href is the oldest trick there is, and `data:` can carry a
   * whole document.
   */
  const hostile = [
    'javascript:alert(1)',
    'JavaScript:alert(1)',
    'data:text/html;base64,PHNjcmlwdD4=',
    'vbscript:msgbox',
    'file:///etc/passwd',
    '//evil.example.com',
  ];

  for (const url of hostile) {
    it(`refuses ${url} as a registration link`, () => {
      const result = createEventSchema.safeParse({
        ...VALID_EVENT,
        publication: { registrationUrl: url },
      });
      expect(result.success).toBe(false);
    });

    it(`refuses ${url} as a joining link`, () => {
      const result = createEventSchema.safeParse({
        ...VALID_EVENT,
        publication: { onlineUrl: url },
      });
      expect(result.success).toBe(false);
    });
  }

  it('accepts a real https address', () => {
    const parsed = createEventSchema.parse({
      ...VALID_EVENT,
      publication: { registrationUrl: 'https://example.org/book' },
    });
    expect(parsed.publication?.registrationUrl).toBe('https://example.org/book');
  });

  it('accepts an empty string, because a link is optional', () => {
    const result = createEventSchema.safeParse({
      ...VALID_EVENT,
      publication: { registrationUrl: '' },
    });
    expect(result.success).toBe(true);
  });
});

describe('the poster URL', () => {
  it('accepts a path under /public', () => {
    const parsed = createEventSchema.parse({
      ...VALID_EVENT,
      publication: { imageUrl: '/cards-images/poster.png' },
    });
    expect(parsed.publication?.imageUrl).toBe('/cards-images/poster.png');
  });

  it('accepts an https URL, which is what the upload endpoint returns', () => {
    const result = createEventSchema.safeParse({
      ...VALID_EVENT,
      publication: { imageUrl: 'https://res.cloudinary.com/x/nwhr/public-events/a.png' },
    });
    expect(result.success).toBe(true);
  });

  it('refuses a javascript: scheme here too', () => {
    const result = createEventSchema.safeParse({
      ...VALID_EVENT,
      publication: { imageUrl: 'javascript:alert(1)' },
    });
    expect(result.success).toBe(false);
  });
});

describe('publishing states an end state rather than toggling', () => {
  /*
   * A toggle sent twice — an impatient click, a retried request — lands in the opposite
   * state from the one the officer chose. An explicit boolean is idempotent.
   */
  it('accepts an explicit true', () => {
    expect(publishEventSchema.parse({ publish: true }).publish).toBe(true);
  });

  it('accepts an explicit false', () => {
    expect(publishEventSchema.parse({ publish: false }).publish).toBe(false);
  });

  it('refuses an empty body, so a bare POST cannot publish by accident', () => {
    expect(publishEventSchema.safeParse({}).success).toBe(false);
  });

  it('refuses a truthy string, which is what an untyped caller would send', () => {
    expect(publishEventSchema.safeParse({ publish: 'true' }).success).toBe(false);
  });
});

describe('the public query offers no way to reach a draft', () => {
  /*
   * The published-and-not-deleted condition is written in the service and cannot be
   * influenced by a caller. This asserts the other half: that the query schema gives an
   * attacker nothing to aim at in the first place.
   */
  it('drops a status filter', () => {
    const parsed = listPublicEventsSchema.parse({ status: 'DRAFT' });
    expect(parsed).not.toHaveProperty('status');
  });

  it('drops includeDeleted', () => {
    const parsed = listPublicEventsSchema.parse({ includeDeleted: true });
    expect(parsed).not.toHaveProperty('includeDeleted');
  });

  it('drops a publication filter', () => {
    const parsed = listPublicEventsSchema.parse({ publication: 'DRAFT' });
    expect(parsed).not.toHaveProperty('publication');
  });

  it('caps how much an anonymous caller can pull in one request', () => {
    expect(listPublicEventsSchema.safeParse({ limit: 500 }).success).toBe(false);
    expect(listPublicEventsSchema.parse({}).limit).toBe(12);
  });
});

describe('who may publish, and who may only write', () => {
  /*
   * Publishing is separate from editing because it is a different act with a different
   * audience: an edit changes an internal record, publishing puts a time and a place in
   * front of people who may travel across Rustenburg on the strength of it.
   *
   * The negative assertions are the load-bearing ones. A permission table tends to drift
   * towards generosity — somebody adds a role to a list to unblock a colleague — and the
   * only thing that notices is a test that says who must NOT have it.
   */
  it('gives the Executive Director the full set', () => {
    for (const permission of [
      PERMISSIONS.EVENT_CREATE,
      PERMISSIONS.EVENT_UPDATE,
      PERMISSIONS.EVENT_PUBLISH,
      PERMISSIONS.EVENT_DELETE,
    ]) {
      expect(roleHasPermission('EXECUTIVE_DIRECTOR', permission)).toBe(true);
    }
  });

  it('lets the Comms Officer publish, because public words are their job', () => {
    expect(roleHasPermission('COMMS_OFFICER', PERMISSIONS.EVENT_PUBLISH)).toBe(true);
  });

  it('does NOT let the Comms Officer delete', () => {
    expect(roleHasPermission('COMMS_OFFICER', PERMISSIONS.EVENT_DELETE)).toBe(false);
  });

  it('lets a Project Coordinator plan events but not publish or delete them', () => {
    expect(roleHasPermission('PROJECT_COORDINATOR', PERMISSIONS.EVENT_CREATE)).toBe(true);
    expect(roleHasPermission('PROJECT_COORDINATOR', PERMISSIONS.EVENT_UPDATE)).toBe(true);
    expect(roleHasPermission('PROJECT_COORDINATOR', PERMISSIONS.EVENT_PUBLISH)).toBe(false);
    expect(roleHasPermission('PROJECT_COORDINATOR', PERMISSIONS.EVENT_DELETE)).toBe(false);
  });

  it('gives a Volunteer none of them', () => {
    for (const permission of [
      PERMISSIONS.EVENT_CREATE,
      PERMISSIONS.EVENT_UPDATE,
      PERMISSIONS.EVENT_PUBLISH,
      PERMISSIONS.EVENT_DELETE,
    ]) {
      expect(roleHasPermission('VOLUNTEER', permission)).toBe(false);
    }
  });

  it('keeps delete narrower than every other event permission', () => {
    const roles = [
      'EXECUTIVE_DIRECTOR',
      'ADMIN_OFFICER',
      'PROJECT_COORDINATOR',
      'FINANCE_OFFICER',
      'COMMS_OFFICER',
      'ME_OFFICER',
      'PEER_LEADER',
      'VOLUNTEER',
    ] as const;

    const canDelete = roles.filter((r) => roleHasPermission(r, PERMISSIONS.EVENT_DELETE));
    // An event is the parent of an attendance register, and a register is the evidence a
    // funder is shown. Exactly one role may take one away.
    expect(canDelete).toEqual(['EXECUTIVE_DIRECTOR']);
  });
});
