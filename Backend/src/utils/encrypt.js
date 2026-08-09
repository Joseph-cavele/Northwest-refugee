import crypto from 'node:crypto';
import env from '../config/env.js';

// Field-level encryption for special personal information (POPIA s26) — currently permit
// numbers. A database dump, a backup on someone's laptop, or a misconfigured Atlas
// snapshot must not reveal a refugee's permit number, because that number can be used to
// locate them.
//
// AES-256-GCM: authenticated, so a tampered ciphertext fails to decrypt rather than
// returning silently wrong plaintext.
//
// KEY ROTATION: changing ENCRYPTION_KEY makes every stored value undecryptable. The
// stored format is version-prefixed so a future key can be introduced by adding a `v2`
// branch and re-encrypting in a migration, rather than by a flag day.

const VERSION = 'v1';
const IV_BYTES = 12; // 96-bit nonce, the GCM standard
const ALGORITHM = 'aes-256-gcm';

let cachedKeys = null;

/**
 * One secret in the environment, two cryptographically independent subkeys derived from
 * it — reusing a single key for both encryption and the HMAC index would let weaknesses
 * in one construction inform the other.
 */
function keys() {
  if (cachedKeys) return cachedKeys;

  if (!env.ENCRYPTION_KEY) {
    // Fail closed. Never fall back to storing the value in the clear.
    throw new Error(
      'ENCRYPTION_KEY is not set — refusing to handle a permit number. ' +
        'Generate one with: openssl rand -hex 32'
    );
  }

  const master = Buffer.from(env.ENCRYPTION_KEY, 'hex');
  const salt = Buffer.alloc(0);
  cachedKeys = {
    encryption: Buffer.from(crypto.hkdfSync('sha256', master, salt, 'nwhr-field-encryption', 32)),
    blindIndex: Buffer.from(crypto.hkdfSync('sha256', master, salt, 'nwhr-blind-index', 32)),
  };
  return cachedKeys;
}

/** True if `value` is already in stored ciphertext form — used to avoid double-encrypting. */
export function isEncrypted(value) {
  return typeof value === 'string' && value.startsWith(`${VERSION}:`) && value.split(':').length === 4;
}

/**
 * Encrypt a value for storage. Returns `v1:<iv>:<tag>:<ciphertext>`, all base64.
 * A fresh random IV per call means the same permit number encrypts differently every
 * time — which is why lookups need blindIndex() rather than matching on this.
 */
export function encryptField(plaintext) {
  if (plaintext === null || plaintext === undefined || plaintext === '') return null;

  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGORITHM, keys().encryption, iv);
  const ciphertext = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [VERSION, iv.toString('base64'), tag.toString('base64'), ciphertext.toString('base64')].join(':');
}

/**
 * Decrypt a stored value. Throws if the ciphertext was tampered with — that is the point
 * of GCM, and a decryption failure should surface as an error, not as empty data.
 */
export function decryptField(stored) {
  if (stored === null || stored === undefined || stored === '') return null;
  if (!isEncrypted(stored)) {
    throw new Error('decryptField: value is not in encrypted form');
  }

  const [, ivB64, tagB64, dataB64] = stored.split(':');
  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    keys().encryption,
    Buffer.from(ivB64, 'base64')
  );
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));

  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, 'base64')),
    decipher.final(),
  ]).toString('utf8');
}

/**
 * Deterministic HMAC of a normalised value, so an encrypted field can still be looked up
 * by exact match:
 *
 *   Beneficiary.findOne({ 'immigration.permitNumberIndex': blindIndex(permit) })
 *
 * TRADE-OFF, accepted deliberately: a blind index leaks equality. Anyone with database
 * access can test whether a *guessed* permit number is present, and can tell that two
 * records share one. That is the price of being able to find a person by their permit at
 * the front desk. It never reveals a number that was not already guessed.
 */
export function blindIndex(value) {
  if (value === null || value === undefined || value === '') return null;
  return crypto.createHmac('sha256', keys().blindIndex).update(normalise(value)).digest('hex');
}

/**
 * Normalise before indexing so "ABC 123/45", "abc-12345" and "ABC12345" all match. Front
 * desks and WhatsApp both produce inconsistent spacing and punctuation, and a lookup that
 * misses because of a hyphen sends someone away who is already in the register.
 */
export function normalise(value) {
  return String(value).toUpperCase().replace(/[^A-Z0-9]/g, '');
}
