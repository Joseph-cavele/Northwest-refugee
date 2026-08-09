import AppError from '../../utils/AppError.js';
import { paginateQuery } from '../../utils/paginate.js';
import { toCents, addCents, subtractCents, formatZAR } from '../../utils/money.js';
import { APPROVAL_CEILINGS, ROLES } from '../../config/constants.js';
import * as audit from '../audit/audit.service.js';
import { ACTIONS } from '../audit/audit.model.js';
import Budget, { BUDGET_LIVE } from './budget.model.js';
import Transaction, { POSTED_STATUSES } from './transaction.model.js';
import {
  PettyCashFloat, PettyCashMovement, PettyCashReconciliation, MOVEMENT_SIGN,
} from './pettyCash.model.js';

// The financial controls live here, not in the role table. Holding an approve permission
// is necessary but never sufficient — who created a record, and how much it is for, both
// change whether a given person may approve it.

const live = (filter = {}, includeDeleted = false) =>
  includeDeleted ? filter : { ...filter, deletedAt: null };

// --- the two controls -------------------------------------------------------------------

/**
 * Segregation of duties: the person who raised something may never be the one who
 * approves it, whatever permissions they hold.
 *
 * This is the check CLAUDE.md says must not be removed to "simplify" a flow. The Finance
 * Officer deliberately holds `transaction:create` and not `transaction:approve` — but a
 * role table cannot express "not this particular record", which is why the comparison
 * happens here against the stored creator.
 */
function assertDifferentActor(record, actor) {
  if (String(record.createdBy) === String(actor._id)) {
    throw AppError.selfApproval();
  }
}

/**
 * Delegation of authority: an approver may only approve up to their ceiling. Anything
 * above it escalates to the Executive Director, who is the only role with no limit.
 *
 * A role with no entry in APPROVAL_CEILINGS cannot approve at all, regardless of
 * permissions — an absent ceiling is a deliberate zero, not an oversight.
 */
function assertWithinCeiling(actor, amountCents) {
  const ceiling = APPROVAL_CEILINGS[actor.role];

  if (ceiling === undefined) {
    throw AppError.forbidden('Your role has no approval authority');
  }
  if (amountCents > ceiling) {
    throw AppError.forbidden(
      `${formatZAR(amountCents, { plain: true })} exceeds your approval limit of ` +
        `${formatZAR(ceiling, { plain: true })} — this must be approved by the ${ROLES.EXECUTIVE_DIRECTOR
          .toLowerCase()
          .replace(/_/g, ' ')}`
    );
  }
}

// --- budgets -----------------------------------------------------------------------------

export async function createBudget(data, actor, ctx = {}) {
  const { lines, ...rest } = data;

  let doc;
  try {
    doc = await Budget.create({
      ...rest,
      lines: lines.map((l) => ({
        code: l.code,
        description: l.description,
        allocatedCents: toCents(l.allocated),
      })),
      createdBy: actor._id,
    });
  } catch (err) {
    if (err?.code === 11000) throw AppError.conflict('A budget with that name already exists for that year');
    throw err;
  }

  await audit.record({
    actor,
    action: ACTIONS.FINANCE_CREATED,
    targetType: 'Budget',
    targetId: doc._id,
    ctx,
    meta: { reference: doc.reference, financialYear: doc.financialYear, totalAllocatedCents: doc.totalAllocatedCents },
  });

  return doc;
}

export async function listBudgets(query = {}) {
  const { page, limit, sort, financialYear, status, programme, includeDeleted } = query;

  const filter = {};
  if (financialYear) filter.financialYear = financialYear;
  if (status) filter.status = status;
  if (programme) filter.programme = programme;

  return paginateQuery(Budget, live(filter, includeDeleted), { page, limit, sort });
}

export async function getBudgetById(id) {
  const doc = await Budget.findOne(live({ _id: id })).exec();
  if (!doc) throw AppError.notFound('Budget');
  return doc;
}

export async function updateBudget(id, patch, actor, ctx = {}) {
  const doc = await getBudgetById(id);
  if (doc.status !== 'DRAFT') {
    throw AppError.conflict(`A ${doc.status.toLowerCase().replace(/_/g, ' ')} budget can no longer be edited`);
  }

  const { lines, ...safe } = patch;
  if (lines) {
    safe.lines = lines.map((l) => ({
      code: l.code,
      description: l.description,
      allocatedCents: toCents(l.allocated),
      // Redrafting keeps whatever has already been committed or spent against the code.
      committedCents: doc.line(l.code)?.committedCents ?? 0,
      spentCents: doc.line(l.code)?.spentCents ?? 0,
    }));
  }

  doc.set(safe);
  await doc.save();

  await audit.record({
    actor,
    action: ACTIONS.FINANCE_CREATED,
    targetType: 'Budget',
    targetId: doc._id,
    ctx,
    meta: { reference: doc.reference, fields: Object.keys(safe) },
  });

  return doc;
}

export async function submitBudget(id, actor, ctx = {}) {
  const doc = await getBudgetById(id);
  if (doc.status !== 'DRAFT') throw AppError.conflict('Only a draft budget can be submitted');
  if (doc.lines.length === 0) throw AppError.badRequest('A budget needs at least one line before submission');

  doc.status = 'PENDING_APPROVAL';
  doc.submittedAt = new Date();
  await doc.save();

  await audit.record({
    actor,
    action: ACTIONS.FINANCE_SUBMITTED,
    targetType: 'Budget',
    targetId: doc._id,
    ctx,
    meta: { reference: doc.reference, totalAllocatedCents: doc.totalAllocatedCents },
  });

  return doc;
}

export async function approveBudget(id, actor, ctx = {}) {
  const doc = await getBudgetById(id);
  if (doc.status !== 'PENDING_APPROVAL') throw AppError.conflict('Only a submitted budget can be approved');

  assertDifferentActor(doc, actor);
  assertWithinCeiling(actor, doc.totalAllocatedCents);

  doc.status = 'APPROVED';
  doc.approvedBy = actor._id;
  doc.approvedAt = new Date();
  await doc.save();

  await audit.record({
    actor,
    action: ACTIONS.FINANCE_APPROVED,
    targetType: 'Budget',
    targetId: doc._id,
    ctx,
    meta: { reference: doc.reference, totalAllocatedCents: doc.totalAllocatedCents, createdBy: String(doc.createdBy) },
  });

  return doc;
}

export async function rejectBudget(id, { reason }, actor, ctx = {}) {
  const doc = await getBudgetById(id);
  if (doc.status !== 'PENDING_APPROVAL') throw AppError.conflict('Only a submitted budget can be rejected');

  assertDifferentActor(doc, actor);

  doc.status = 'REJECTED';
  doc.rejectedBy = actor._id;
  doc.rejectedAt = new Date();
  doc.rejectionReason = reason;
  await doc.save();

  await audit.record({
    actor,
    action: ACTIONS.FINANCE_REJECTED,
    targetType: 'Budget',
    targetId: doc._id,
    ctx,
    meta: { reference: doc.reference, reason },
  });

  return doc;
}

// --- budget commitments -------------------------------------------------------------------

/**
 * Move money between a line's three figures, atomically and only when the line can bear it.
 *
 * The `$expr` guard is what makes an overspend impossible rather than merely unlikely: two
 * officers committing against the same line at once cannot both pass a read-then-write
 * available-balance check, but they cannot both satisfy one conditional update.
 */
async function moveOnLine(budgetId, code, { commit = 0, spend = 0, release = 0 }) {
  const filter = {
    _id: budgetId,
    status: 'APPROVED',
    deletedAt: null,
    lines: { $elemMatch: { code } },
  };

  // Only a fresh commitment can exceed the allocation; releasing or settling never can.
  if (commit > 0) {
    filter.$expr = {
      $let: {
        vars: { line: { $first: { $filter: { input: '$lines', cond: { $eq: ['$$this.code', code] } } } } },
        in: {
          $gte: [
            { $subtract: ['$$line.allocatedCents', { $add: ['$$line.committedCents', '$$line.spentCents'] }] },
            commit,
          ],
        },
      },
    };
  }

  const update = { $inc: {} };
  if (commit) update.$inc['lines.$[l].committedCents'] = commit;
  if (release) update.$inc['lines.$[l].committedCents'] = -release;
  if (spend) {
    update.$inc['lines.$[l].committedCents'] = -spend;
    update.$inc['lines.$[l].spentCents'] = spend;
  }

  return Budget.findOneAndUpdate(filter, update, {
    arrayFilters: [{ 'l.code': code }],
    returnDocument: 'after',
  }).exec();
}

// --- transactions --------------------------------------------------------------------------

export async function createTransaction(data, actor, ctx = {}) {
  const { amount, ...rest } = data;
  const amountCents = toCents(amount);

  if (data.type === 'EXPENSE') {
    const budget = await getBudgetById(data.budget);
    if (!budget.isLive) {
      throw AppError.conflict('Expenses can only be raised against an approved budget');
    }
    if (!budget.line(data.budgetLineCode)) {
      throw AppError.badRequest(`Budget ${budget.reference} has no line "${data.budgetLineCode}"`);
    }

    // Commit before the transaction exists: the money is spoken for the moment the
    // expense is raised, not when it is approved.
    const committed = await moveOnLine(budget._id, data.budgetLineCode, { commit: amountCents });
    if (!committed) {
      const line = budget.line(data.budgetLineCode);
      throw AppError.conflict(
        `Insufficient budget on line ${line.code}: ${formatZAR(line.availableCents, { plain: true })} available, ` +
          `${formatZAR(amountCents, { plain: true })} requested`
      );
    }
  }

  let doc;
  try {
    doc = await Transaction.create({ ...rest, amountCents, createdBy: actor._id });
  } catch (err) {
    // Hand the commitment back rather than leaving a line encumbered by nothing.
    if (data.type === 'EXPENSE') {
      await moveOnLine(data.budget, data.budgetLineCode, { release: amountCents }).catch(() => {});
    }
    throw err;
  }

  await audit.record({
    actor,
    action: ACTIONS.FINANCE_CREATED,
    targetType: 'Transaction',
    targetId: doc._id,
    ctx,
    meta: { reference: doc.reference, type: doc.type, amountCents },
  });

  return doc;
}

export async function submitTransaction(id, actor, ctx = {}) {
  const doc = await getTransactionById(id);
  if (doc.status !== 'DRAFT') throw AppError.conflict('Only a draft transaction can be submitted');

  doc.status = 'PENDING_APPROVAL';
  doc.submittedAt = new Date();
  await doc.save();

  await audit.record({
    actor,
    action: ACTIONS.FINANCE_SUBMITTED,
    targetType: 'Transaction',
    targetId: doc._id,
    ctx,
    meta: { reference: doc.reference, amountCents: doc.amountCents },
  });

  return doc;
}

/** Approve and post. Moves the expense from committed to spent. */
export async function approveTransaction(id, actor, ctx = {}) {
  const doc = await getTransactionById(id);
  if (doc.status !== 'PENDING_APPROVAL') throw AppError.conflict('Only a submitted transaction can be approved');

  assertDifferentActor(doc, actor);
  assertWithinCeiling(actor, doc.amountCents);

  if (doc.type === 'EXPENSE') {
    const settled = await moveOnLine(doc.budget, doc.budgetLineCode, { spend: doc.amountCents });
    if (!settled) throw AppError.conflict('The budget line could not be settled — is the budget still approved?');
  }

  doc.status = 'APPROVED';
  doc.approvedBy = actor._id;
  doc.approvedAt = new Date();
  doc.postedAt = new Date();
  await doc.save();

  await audit.record({
    actor,
    action: ACTIONS.FINANCE_APPROVED,
    targetType: 'Transaction',
    targetId: doc._id,
    ctx,
    meta: { reference: doc.reference, amountCents: doc.amountCents, createdBy: String(doc.createdBy) },
  });

  return doc;
}

/** Reject, releasing any commitment the expense was holding. */
export async function rejectTransaction(id, { reason }, actor, ctx = {}) {
  const doc = await getTransactionById(id);
  if (doc.status !== 'PENDING_APPROVAL') throw AppError.conflict('Only a submitted transaction can be rejected');

  assertDifferentActor(doc, actor);

  if (doc.type === 'EXPENSE') {
    await moveOnLine(doc.budget, doc.budgetLineCode, { release: doc.amountCents });
  }

  doc.status = 'REJECTED';
  doc.rejectedBy = actor._id;
  doc.rejectedAt = new Date();
  doc.rejectionReason = reason;
  await doc.save();

  await audit.record({
    actor,
    action: ACTIONS.FINANCE_REJECTED,
    targetType: 'Transaction',
    targetId: doc._id,
    ctx,
    meta: { reference: doc.reference, amountCents: doc.amountCents, reason },
  });

  return doc;
}

/**
 * Correct a posted entry by writing an opposing REVERSAL, never by editing it.
 *
 * The original stays exactly as it was posted. Anyone reading the ledger later sees both
 * the mistake and the correction, which is the only version an auditor can rely on.
 */
export async function reverseTransaction(id, { reason }, actor, ctx = {}) {
  const original = await getTransactionById(id);

  if (!POSTED_STATUSES.includes(original.status)) {
    throw AppError.conflict('Only a posted transaction can be reversed');
  }
  if (original.status === 'REVERSED') throw AppError.conflict('This transaction has already been reversed');

  assertWithinCeiling(actor, original.amountCents);

  const reversal = await Transaction.create({
    type: 'REVERSAL',
    amountCents: original.amountCents,
    currency: original.currency,
    description: `Reversal of ${original.reference}: ${reason}`,
    payee: original.payee,
    method: 'JOURNAL',
    budget: original.budget,
    budgetLineCode: original.budgetLineCode,
    status: 'APPROVED',
    createdBy: actor._id,
    approvedBy: actor._id,
    approvedAt: new Date(),
    postedAt: new Date(),
    reversalOf: original._id,
    reversalReason: reason,
  });

  // Give the money back to the line the original consumed.
  if (original.type === 'EXPENSE' && original.budget) {
    await Budget.updateOne(
      { _id: original.budget, lines: { $elemMatch: { code: original.budgetLineCode } } },
      { $inc: { 'lines.$[l].spentCents': -original.amountCents } },
      { arrayFilters: [{ 'l.code': original.budgetLineCode }] }
    ).exec();
  }

  // The model allows exactly these two fields to change after posting.
  original.status = 'REVERSED';
  original.reversedBy = reversal._id;
  await original.save();

  await audit.record({
    actor,
    action: ACTIONS.FINANCE_REVERSED,
    targetType: 'Transaction',
    targetId: original._id,
    ctx,
    meta: { reference: original.reference, reversal: reversal.reference, amountCents: original.amountCents, reason },
  });

  return { original, reversal };
}

export async function listTransactions(query = {}) {
  const {
    page, limit, sort, type, status, budget, budgetLineCode, createdBy,
    awaitingApproval, from, to, includeDeleted,
  } = query;

  const filter = {};
  if (type) filter.type = type;
  if (status) filter.status = status;
  if (budget) filter.budget = budget;
  if (budgetLineCode) filter.budgetLineCode = budgetLineCode;
  if (createdBy) filter.createdBy = createdBy;
  if (awaitingApproval) filter.status = 'PENDING_APPROVAL';
  if (from || to) {
    filter.createdAt = {};
    if (from) filter.createdAt.$gte = from;
    if (to) filter.createdAt.$lte = to;
  }

  return paginateQuery(Transaction, live(filter, includeDeleted), {
    page,
    limit,
    sort,
    populate: [
      { path: 'createdBy', select: 'name role' },
      { path: 'approvedBy', select: 'name role' },
    ],
  });
}

export async function getTransactionById(id) {
  const doc = await Transaction.findOne(live({ _id: id })).exec();
  if (!doc) throw AppError.notFound('Transaction');
  return doc;
}

export async function updateTransaction(id, patch, actor, ctx = {}) {
  const doc = await getTransactionById(id);
  if (!doc.isEditable) {
    throw AppError.conflict('Only a draft transaction can be edited — post a reversal to correct a posted entry');
  }

  const { amount, type, budget, budgetLineCode, ...safe } = patch;
  // Changing the amount or the line after the commitment is placed would leave the budget
  // encumbered by the wrong figure. Delete the draft and raise it again.
  void amount;
  void type;
  void budget;
  void budgetLineCode;

  doc.set(safe);
  await doc.save();

  await audit.record({
    actor,
    action: ACTIONS.FINANCE_CREATED,
    targetType: 'Transaction',
    targetId: doc._id,
    ctx,
    meta: { reference: doc.reference, fields: Object.keys(safe), status: doc.status },
  });

  return doc;
}

// --- petty cash ------------------------------------------------------------------------------

export async function createFloat(data, actor, ctx = {}) {
  const { imprest, ...rest } = data;
  const imprestCents = toCents(imprest);

  const doc = await PettyCashFloat.create({
    ...rest,
    imprestCents,
    balanceCents: 0,
    createdBy: actor._id,
  });

  await audit.record({
    actor,
    action: ACTIONS.FINANCE_CREATED,
    targetType: 'PettyCashFloat',
    targetId: doc._id,
    ctx,
    meta: { reference: doc.reference, imprestCents, custodian: String(doc.custodian) },
  });

  return doc;
}

export async function getFloatById(id) {
  const doc = await PettyCashFloat.findOne(live({ _id: id })).exec();
  if (!doc) throw AppError.notFound('Petty cash float');
  return doc;
}

export async function listFloats(query = {}) {
  return paginateQuery(PettyCashFloat, live({}), {
    page: query.page,
    limit: query.limit,
    sort: '-createdAt',
    populate: { path: 'custodian', select: 'name role' },
  });
}

/**
 * Record a movement and re-derive the balance.
 *
 * The balance is adjusted with a guarded conditional update so the tin can never go
 * negative — a float that shows minus R40 is a counting error nobody can unpick later.
 */
export async function recordMovement(id, data, actor, ctx = {}) {
  const float = await getFloatById(id);
  if (float.status !== 'ACTIVE') throw AppError.conflict(`A ${float.status.toLowerCase()} float takes no movements`);

  const amountCents = toCents(data.amount);
  const delta = MOVEMENT_SIGN[data.type] * amountCents;

  const filter = { _id: float._id, status: 'ACTIVE', deletedAt: null };
  // Paying out more than is in the tin is not a rounding problem, it is a mistake.
  if (delta < 0) filter.balanceCents = { $gte: amountCents };

  const updated = await PettyCashFloat.findOneAndUpdate(
    filter,
    { $inc: { balanceCents: delta } },
    { returnDocument: 'after' }
  ).exec();

  if (!updated) {
    throw AppError.conflict(
      `Insufficient petty cash: ${formatZAR(float.balanceCents, { plain: true })} in the float, ` +
        `${formatZAR(amountCents, { plain: true })} requested`
    );
  }

  const movement = await PettyCashMovement.create({
    float: float._id,
    type: data.type,
    amountCents,
    description: data.description,
    balanceAfterCents: updated.balanceCents,
    budget: data.budget ?? null,
    budgetLineCode: data.budgetLineCode ?? null,
    recordedBy: actor._id,
  });

  await audit.record({
    actor,
    action: ACTIONS.PETTY_CASH_MOVEMENT,
    targetType: 'PettyCashFloat',
    targetId: float._id,
    ctx,
    meta: { type: data.type, amountCents, balanceAfterCents: updated.balanceCents },
  });

  return { float: updated, movement };
}

/**
 * Count the tin against the ledger.
 *
 * A custodian may not reconcile their own float. Counting your own cash and certifying it
 * correct is the entire risk the control exists to address, so the comparison is made here
 * where both identities are known — a permission cannot express it.
 */
export async function reconcileFloat(id, { counted, notes }, actor, ctx = {}) {
  const float = await getFloatById(id);

  if (String(float.custodian) === String(actor._id)) {
    throw AppError.forbidden('A custodian cannot reconcile their own float');
  }

  const countedCents = toCents(counted);
  const expectedCents = float.balanceCents;
  const varianceCents = subtractCents(countedCents, expectedCents);

  const reconciliation = await PettyCashReconciliation.create({
    float: float._id,
    expectedCents,
    countedCents,
    varianceCents,
    notes,
    reconciledBy: actor._id,
  });

  // The count is the truth; the ledger is brought to it with an adjustment so the
  // difference stays visible as its own row rather than being silently absorbed.
  if (varianceCents !== 0) {
    float.balanceCents = countedCents;
    await PettyCashMovement.create({
      float: float._id,
      type: 'ADJUSTMENT',
      amountCents: Math.abs(varianceCents),
      description: `Reconciliation variance of ${formatZAR(varianceCents, { plain: true })}`,
      balanceAfterCents: countedCents,
      recordedBy: actor._id,
    });
  }

  float.lastReconciledAt = new Date();
  await float.save();

  await audit.record({
    actor,
    action: ACTIONS.PETTY_CASH_RECONCILED,
    targetType: 'PettyCashFloat',
    targetId: float._id,
    ctx,
    meta: { expectedCents, countedCents, varianceCents, custodian: String(float.custodian) },
  });

  return { float, reconciliation };
}

export async function listMovements(id, query = {}) {
  const float = await getFloatById(id);

  const filter = { float: float._id };
  if (query.type) filter.type = query.type;

  return paginateQuery(PettyCashMovement, filter, {
    page: query.page,
    limit: query.limit,
    sort: query.sort,
    populate: { path: 'recordedBy', select: 'name role' },
  });
}

// --- reporting -------------------------------------------------------------------------------

/** Budget versus actual, recomputed from the transactions rather than trusted. */
export async function getBudgetPosition(id) {
  const budget = await getBudgetById(id);

  const posted = await Transaction.find({
    budget: budget._id,
    type: 'EXPENSE',
    status: 'APPROVED',
    deletedAt: null,
  })
    .select('budgetLineCode amountCents')
    .exec();

  const actualByLine = posted.reduce(
    (acc, t) => ({ ...acc, [t.budgetLineCode]: addCents(acc[t.budgetLineCode] ?? 0, t.amountCents) }),
    {}
  );

  return {
    budget: budget._id,
    reference: budget.reference,
    status: budget.status,
    totalAllocatedCents: budget.totalAllocatedCents,
    totalCommittedCents: budget.totalCommittedCents,
    totalSpentCents: budget.totalSpentCents,
    totalAvailableCents: budget.totalAvailableCents,
    lines: budget.lines.map((l) => ({
      code: l.code,
      description: l.description,
      allocatedCents: l.allocatedCents,
      committedCents: l.committedCents,
      spentCents: l.spentCents,
      availableCents: l.availableCents,
      actualCents: actualByLine[l.code] ?? 0,
      // A mismatch means the running figure has drifted from the posted entries.
      reconciled: (actualByLine[l.code] ?? 0) === l.spentCents,
    })),
  };
}

// --- cross-module reads ----------------------------------------------------------------------
// For the finance-alerts job. All three are unscoped by design: a cron job has no acting
// user, and a control that only covers the programmes one officer happens to be assigned
// to is not a control.

/**
 * Budget lines whose committed + spent has reached `thresholdPercent` of their allocation.
 *
 * Committed counts, not just spent. By the time a line is overspent on posted entries
 * alone the money is already gone; the commitment is the point at which somebody can still
 * decide not to.
 */
export async function findBudgetLinesNearLimit(thresholdPercent = 90) {
  const budgets = await Budget.find({ status: { $in: BUDGET_LIVE }, deletedAt: null })
    .select('reference name financialYear lines programme')
    .exec();

  const flagged = [];
  for (const budget of budgets) {
    for (const line of budget.lines ?? []) {
      // An unallocated line cannot be overspent, and dividing by it would report Infinity.
      if (line.allocatedCents <= 0) continue;

      const usedCents = addCents(line.committedCents, line.spentCents);
      const usedPercent = Math.round((usedCents / line.allocatedCents) * 100);
      if (usedPercent < thresholdPercent) continue;

      flagged.push({
        budget: budget._id,
        reference: budget.reference,
        name: budget.name,
        financialYear: budget.financialYear,
        code: line.code,
        description: line.description,
        allocatedCents: line.allocatedCents,
        usedCents,
        availableCents: line.availableCents,
        usedPercent,
      });
    }
  }

  return flagged.sort((a, b) => b.usedPercent - a.usedPercent);
}

/** Submitted spend nobody has decided on. Oldest first — that is the one holding up a payment. */
export async function findStaleApprovals(days = 3, asOf = new Date()) {
  const cutoff = new Date(asOf.getTime() - days * 86_400_000);

  return Transaction.find({
    status: 'PENDING_APPROVAL',
    deletedAt: null,
    submittedAt: { $ne: null, $lte: cutoff },
  })
    .select('reference type amountCents description submittedAt createdBy budget budgetLineCode')
    .sort('submittedAt')
    .exec();
}

/**
 * Active floats nobody has counted lately.
 *
 * A float that has never been reconciled matches rather than being skipped: it is the one
 * most worth counting, and treating a null as "recently checked" would hide exactly the
 * float that has never been checked at all.
 */
export async function findUnreconciledFloats(days = 30, asOf = new Date()) {
  const cutoff = new Date(asOf.getTime() - days * 86_400_000);

  return PettyCashFloat.find({
    status: 'ACTIVE',
    deletedAt: null,
    $or: [{ lastReconciledAt: null }, { lastReconciledAt: { $lte: cutoff } }],
  })
    .select('reference name custodian imprestCents balanceCents lastReconciledAt')
    .sort('lastReconciledAt')
    .exec();
}
