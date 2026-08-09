import { describe, it, expect, afterAll, beforeEach } from 'vitest';
import { connect, disconnect, resetDatabase, ROLES } from './helpers.js';
import User from '../src/modules/users/user.model.js';
import { Channel } from '../src/modules/chatboard/chatboard.model.js';
import { seedExecutiveDirector, seedGeneralChannel } from '../src/seed.js';

const hasDb = await connect();

describe.runIf(hasDb)('seed', () => {
  beforeEach(resetDatabase);
  afterAll(disconnect);

  it('creates the Executive Director with no password and an invite link', async () => {
    const result = await seedExecutiveDirector();
    expect(result.created).toBe(true);
    expect(result.user.role).toBe(ROLES.EXECUTIVE_DIRECTOR);
    // A seeded default password would live in the git history forever.
    expect(result.user.status).toBe('invited');
    expect(result.inviteLink).toContain('/accept-invite?token=');

    const stored = await User.findById(result.user._id).select('+passwordHash');
    expect(stored.passwordHash).toBeUndefined();
  });

  it('is idempotent — a second run changes nothing', async () => {
    const first = await seedExecutiveDirector();
    const second = await seedExecutiveDirector();

    expect(second.created).toBe(false);
    expect(second.inviteLink).toBeNull();
    expect(String(second.user._id)).toBe(String(first.user._id));
    expect(await User.countDocuments({ role: ROLES.EXECUTIVE_DIRECTOR })).toBe(1);
  });

  it('creates a general channel once', async () => {
    const ed = await seedExecutiveDirector();
    expect((await seedGeneralChannel(ed.user._id)).created).toBe(true);
    expect((await seedGeneralChannel(ed.user._id)).created).toBe(false);
    expect(await Channel.countDocuments({ slug: 'general' })).toBe(1);
  });
});
