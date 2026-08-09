import mongoose from 'mongoose';

const { Schema } = mongoose;

// The organisational unit a staff member sits in — Programmes, Finance, Communications.
//
// A department is NOT an access control boundary. Role decides what someone may do and
// scopeToProgrammes() decides which rows they see; this is a directory and reporting
// grouping only. Nothing in config/permissions.js reads it, and nothing should start to
// without that being a deliberate decision — a second, quieter authorisation axis is how a
// permission matrix stops being the single source of truth.

const departmentSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },

    // Stable, human-readable key. Derived from the name once, at creation: a department
    // that is later renamed keeps its slug, so a saved filter or a link does not break.
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },

    description: { type: String, trim: true, maxlength: 1000, default: '' },

    // Optional — a small organisation often has departments with no formal head.
    head: { type: Schema.Types.ObjectId, ref: 'User', default: null },

    // Deactivated rather than deleted: staff and past access requests still point here, and
    // an inactive department must still render in their history. Only active ones are
    // offered when choosing.
    isActive: { type: Boolean, default: true, index: true },

    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

// Case-insensitive uniqueness on the display name too. Without the collation, "Finance"
// and "finance" are two departments, and the staff list quietly splits between them.
departmentSchema.index(
  { name: 1 },
  { unique: true, collation: { locale: 'en', strength: 2 }, name: 'unique_department_name_ci' }
);

departmentSchema.set('toJSON', {
  transform(_doc, ret) {
    delete ret.__v;
    return ret;
  },
});

/**
 * 'Communications & Marketing' → 'communications-marketing'.
 *
 * Trailing/leading separators are trimmed after the substitution, not before, or a name
 * ending in '&' leaves a dangling hyphen.
 */
export function slugify(name) {
  return String(name ?? '')
    .toLowerCase()
    .normalize('NFKD')
    // Strip the combining marks NFKD just separated out, so 'Éducation' → 'education'.
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const Department = mongoose.models.Department || mongoose.model('Department', departmentSchema);

export default Department;
