import { describe, it, expect, afterAll, beforeEach } from 'vitest';
import {
  app, request, ROLES, connect, disconnect, resetDatabase, makeUser, expectSuccess, expectError,
} from './helpers.js';
import Budget from '../src/modules/finance/budget.model.js';
import Transaction from '../src/modules/finance/transaction.model.js';
import { PettyCashFloat, PettyCashMovement } from '../src/modules/finance/pettyCash.model.js';

const hasDb = await connect();
const base = '/api/v1/finance';

describe.runIf(hasDb)('finance routes', () => {
  let finance; let ed; let admin; let coord; let volunteer; let budget;

  beforeEach(async () => {
    await resetDatabase();
    await Budget.syncIndexes();

    finance = await makeUser(ROLES.FINANCE_OFFICER);
    ed = await makeUser(ROLES.EXECUTIVE_DIRECTOR);
    admin = await makeUser(ROLES.ADMIN_OFFICER);
    coord = await makeUser(ROLES.PROJECT_COORDINATOR);
    volunteer = await makeUser(ROLES.VOLUNTEER);

    budget = expectSuccess(
      await request(app).post(`${base}/budgets`).set('Authorization', `Bearer ${finance.token}`).send({
        name: 'Operations 2026',
        financialYear: 2026,
        lines: [
          { code: 'FOOD', description: 'Food parcels', allocated: '50000.00' },
          { code: 'TRANS', description: 'Transport', allocated: '10000.00' },
        ],
      }),
      201
    );
  });
  afterAll(disconnect);

  const as = (user, m, url) => request(app)[m](url).set('Authorization', `Bearer ${user.token}`);

  const approveBudget = async () => {
    await as(finance, 'post', `${base}/budgets/${budget._id}/submit`).send({});
    return as(ed, 'post', `${base}/budgets/${budget._id}/approve`).send({});
  };

  const expense = (over = {}) => ({
    type: 'EXPENSE', amount: '1000.00', description: 'Food parcels for March',
    budget: budget._id, budgetLineCode: 'FOOD', ...over,
  });

  // --- access ----------------------------------------------------------------
  it('requires authentication and a permission', async () => {
    expectError(await request(app).get(`${base}/budgets`), 401);
    expectError(await as(volunteer, 'get', `${base}/budgets`), 403);
  });

  it('gives the Finance Officer create but never approve', async () => {
    expectSuccess(await as(finance, 'get', `${base}/transactions`));
    await approveBudget();
    const txn = expectSuccess(await as(finance, 'post', `${base}/transactions`).send(expense()), 201);
    await as(finance, 'post', `${base}/transactions/${txn._id}/submit`).send({});
    // The segregation of duties starts in the role table.
    expectError(await as(finance, 'post', `${base}/transactions/${txn._id}/approve`).send({}), 403);
  });

  // --- money at the boundary -------------------------------------------------
  it('stores budget allocations as integer cents', async () => {
    expect(budget.lines[0].allocatedCents).toBe(5_000_000);
    expect(budget.totalAllocatedCents).toBe(6_000_000);
    const stored = await Budget.findById(budget._id);
    expect(stored.lines.every((l) => Number.isInteger(l.allocatedCents))).toBe(true);
  });

  it('rejects a negative or unparseable amount', async () => {
    await approveBudget();
    expectError(await as(finance, 'post', `${base}/transactions`).send(expense({ amount: '-100' })), 422);
    expectError(await as(finance, 'post', `${base}/transactions`).send(expense({ amount: 'lots' })), 422);
  });

  it('refuses a REVERSAL raised directly', async () => {
    expectError(await as(finance, 'post', `${base}/transactions`).send(expense({ type: 'REVERSAL' })), 422);
  });

  it('requires a budget line on an expense', async () => {
    const res = await as(finance, 'post', `${base}/transactions`).send(
      expense({ budget: undefined, budgetLineCode: undefined })
    );
    const err = expectError(res, 422);
    expect(err.details).toHaveProperty('budgetLineCode');
  });

  // --- maker-checker ---------------------------------------------------------
  it('SELF-APPROVAL: creator cannot approve, a different approver can', async () => {
    await approveBudget();
    const txn = expectSuccess(await as(finance, 'post', `${base}/transactions`).send(expense()), 201);
    await as(finance, 'post', `${base}/transactions/${txn._id}/submit`).send({});

    // admin holds transaction:approve and did not create it.
    const approved = expectSuccess(await as(admin, 'post', `${base}/transactions/${txn._id}/approve`).send({}));
    expect(approved.status).toBe('APPROVED');
    expect(approved.approvedBy).toBe(admin.id);
  });

  it('refuses self-approval when the creator also holds the approve permission', async () => {
    await approveBudget();
    // The admin officer can both create-by-proxy and approve — the record's creator is
    // what stops them, not the role table.
    const txn = await Transaction.create({
      type: 'EXPENSE', amountCents: 100_000, description: 'Self raised',
      budget: budget._id, budgetLineCode: 'FOOD',
      status: 'PENDING_APPROVAL', createdBy: admin.user._id,
    });

    const res = await as(admin, 'post', `${base}/transactions/${txn._id}/approve`).send({});
    expectError(res, 403, 'SELF_APPROVAL');
  });

  // --- approval ceilings -----------------------------------------------------
  it('holds an approver to their delegation ceiling', async () => {
    await approveBudget();
    // R6 000 — above the Admin Officer's R5 000 ceiling.
    const txn = expectSuccess(await as(finance, 'post', `${base}/transactions`).send(expense({ amount: '6000.00' })), 201);
    await as(finance, 'post', `${base}/transactions/${txn._id}/submit`).send({});

    const res = await as(admin, 'post', `${base}/transactions/${txn._id}/approve`).send({});
    expectError(res, 403);
    expect(res.body.error.message).toMatch(/approval limit/i);
    expect(res.body.error.message).toMatch(/executive director/i);
  });

  it('lets the coordinator approve within theirs, and the ED approve anything', async () => {
    await approveBudget();
    const mid = expectSuccess(await as(finance, 'post', `${base}/transactions`).send(expense({ amount: '6000.00' })), 201);
    await as(finance, 'post', `${base}/transactions/${mid._id}/submit`).send({});
    // R6 000 is within the coordinator's R10 000 ceiling.
    expectSuccess(await as(coord, 'post', `${base}/transactions/${mid._id}/approve`).send({}));

    const big = expectSuccess(await as(finance, 'post', `${base}/transactions`).send(expense({ amount: '20000.00' })), 201);
    await as(finance, 'post', `${base}/transactions/${big._id}/submit`).send({});
    expectError(await as(coord, 'post', `${base}/transactions/${big._id}/approve`).send({}), 403);
    expectSuccess(await as(ed, 'post', `${base}/transactions/${big._id}/approve`).send({}));
  });

  // --- commitment lifecycle --------------------------------------------------
  it('commits against the line when raised and settles it on approval', async () => {
    await approveBudget();
    const txn = expectSuccess(await as(finance, 'post', `${base}/transactions`).send(expense()), 201);

    let line = (await Budget.findById(budget._id)).line('FOOD');
    expect(line.committedCents).toBe(100_000);
    expect(line.spentCents).toBe(0);

    await as(finance, 'post', `${base}/transactions/${txn._id}/submit`).send({});
    await as(ed, 'post', `${base}/transactions/${txn._id}/approve`).send({});

    line = (await Budget.findById(budget._id)).line('FOOD');
    expect(line.committedCents).toBe(0);
    expect(line.spentCents).toBe(100_000);
  });

  it('releases the commitment when the expense is rejected', async () => {
    await approveBudget();
    const txn = expectSuccess(await as(finance, 'post', `${base}/transactions`).send(expense()), 201);
    await as(finance, 'post', `${base}/transactions/${txn._id}/submit`).send({});
    await as(ed, 'post', `${base}/transactions/${txn._id}/reject`).send({ reason: 'Not budgeted' });

    const line = (await Budget.findById(budget._id)).line('FOOD');
    expect(line.committedCents).toBe(0);
    expect(line.spentCents).toBe(0);
  });

  it('BUDGET OVERSPEND: refuses an expense the line cannot bear', async () => {
    await approveBudget();
    expectSuccess(await as(finance, 'post', `${base}/transactions`).send(expense({ amount: '45000.00' })), 201);

    const res = await as(finance, 'post', `${base}/transactions`).send(expense({ amount: '10000.00' }));
    expectError(res, 409);
    expect(res.body.error.message).toMatch(/Insufficient budget/);
    // The failed attempt must not leave the line encumbered.
    expect((await Budget.findById(budget._id)).line('FOOD').committedCents).toBe(4_500_000);
  });

  it('holds under concurrent commitments against the same line', async () => {
    await approveBudget();
    // Three officers each raising R20 000 against a R50 000 line: two fit, one cannot.
    const results = await Promise.all(
      Array.from({ length: 3 }, () => as(finance, 'post', `${base}/transactions`).send(expense({ amount: '20000.00' })))
    );
    expect(results.filter((r) => r.status === 201)).toHaveLength(2);
    expect(results.filter((r) => r.status === 409)).toHaveLength(1);
    expect((await Budget.findById(budget._id)).line('FOOD').committedCents).toBe(4_000_000);
  });

  it('refuses an expense against a budget that is not approved', async () => {
    expectError(await as(finance, 'post', `${base}/transactions`).send(expense()), 409);
  });

  it('refuses an unknown budget line', async () => {
    await approveBudget();
    expectError(await as(finance, 'post', `${base}/transactions`).send(expense({ budgetLineCode: 'NOPE' })), 400);
  });

  // --- posted entries are immutable ------------------------------------------
  it('refuses to edit a posted transaction through the API', async () => {
    await approveBudget();
    const txn = expectSuccess(await as(finance, 'post', `${base}/transactions`).send(expense()), 201);
    await as(finance, 'post', `${base}/transactions/${txn._id}/submit`).send({});
    await as(ed, 'post', `${base}/transactions/${txn._id}/approve`).send({});

    expectError(await as(finance, 'patch', `${base}/transactions/${txn._id}`).send({ description: 'Changed' }), 409);
  });

  it('refuses to edit a posted transaction at the model layer too', async () => {
    await approveBudget();
    const txn = expectSuccess(await as(finance, 'post', `${base}/transactions`).send(expense()), 201);
    await as(finance, 'post', `${base}/transactions/${txn._id}/submit`).send({});
    await as(ed, 'post', `${base}/transactions/${txn._id}/approve`).send({});

    // No service, script or console session can quietly amend the ledger.
    const doc = await Transaction.findById(txn._id);
    doc.amountCents = 1;
    await expect(doc.save()).rejects.toThrow(/immutable/i);
  });

  it('corrects a posted entry with a reversal, leaving the original intact', async () => {
    await approveBudget();
    const txn = expectSuccess(await as(finance, 'post', `${base}/transactions`).send(expense()), 201);
    await as(finance, 'post', `${base}/transactions/${txn._id}/submit`).send({});
    await as(ed, 'post', `${base}/transactions/${txn._id}/approve`).send({});

    const { original, reversal } = expectSuccess(
      await as(ed, 'post', `${base}/transactions/${txn._id}/reverse`).send({ reason: 'Paid twice' }),
      201
    );

    expect(original.status).toBe('REVERSED');
    expect(reversal.type).toBe('REVERSAL');
    // Amounts are always positive; direction is the type.
    expect(reversal.amountCents).toBe(100_000);
    expect(reversal.reversalOf).toBe(txn._id);

    // The original's own figures are untouched.
    const stored = await Transaction.findById(txn._id);
    expect(stored.amountCents).toBe(100_000);
    expect(stored.description).toBe('Food parcels for March');

    // And the line gets its money back.
    expect((await Budget.findById(budget._id)).line('FOOD').spentCents).toBe(0);
  });

  it('refuses to reverse twice, or to reverse something unposted', async () => {
    await approveBudget();
    const txn = expectSuccess(await as(finance, 'post', `${base}/transactions`).send(expense()), 201);
    expectError(await as(ed, 'post', `${base}/transactions/${txn._id}/reverse`).send({ reason: 'x' }), 409);

    await as(finance, 'post', `${base}/transactions/${txn._id}/submit`).send({});
    await as(ed, 'post', `${base}/transactions/${txn._id}/approve`).send({});
    await as(ed, 'post', `${base}/transactions/${txn._id}/reverse`).send({ reason: 'Paid twice' });
    expectError(await as(ed, 'post', `${base}/transactions/${txn._id}/reverse`).send({ reason: 'again' }), 409);
  });

  it('reports a position reconciled against the posted entries', async () => {
    await approveBudget();
    const txn = expectSuccess(await as(finance, 'post', `${base}/transactions`).send(expense()), 201);
    await as(finance, 'post', `${base}/transactions/${txn._id}/submit`).send({});
    await as(ed, 'post', `${base}/transactions/${txn._id}/approve`).send({});

    const position = expectSuccess(await as(finance, 'get', `${base}/budgets/${budget._id}/position`));
    const food = position.lines.find((l) => l.code === 'FOOD');
    expect(food.spentCents).toBe(100_000);
    expect(food.actualCents).toBe(100_000);
    expect(food.reconciled).toBe(true);
    expect(food.availableCents).toBe(4_900_000);
  });

  // --- budget workflow -------------------------------------------------------
  it('refuses to edit a budget once it leaves draft', async () => {
    await as(finance, 'post', `${base}/budgets/${budget._id}/submit`).send({});
    expectError(await as(finance, 'patch', `${base}/budgets/${budget._id}`).send({ name: 'Changed' }), 409);
  });

  it('refuses duplicate line codes', async () => {
    const res = await as(finance, 'post', `${base}/budgets`).send({
      name: 'Dupes', financialYear: 2026,
      lines: [
        { code: 'A', description: 'One', allocated: '10.00' },
        { code: 'A', description: 'Two', allocated: '10.00' },
      ],
    });
    expectError(res, 422);
  });

  // --- petty cash ------------------------------------------------------------
  it('records movements and refuses to overdraw the tin', async () => {
    const float = expectSuccess(
      await as(finance, 'post', `${base}/petty-cash`).send({
        name: 'Front desk', custodian: admin.id, imprest: '2000.00',
      }),
      201
    );

    expectSuccess(
      await as(finance, 'post', `${base}/petty-cash/${float._id}/movements`)
        .send({ type: 'REPLENISHMENT', amount: '2000.00', description: 'Opening float' }),
      201
    );
    expect((await PettyCashFloat.findById(float._id)).balanceCents).toBe(200_000);

    expectSuccess(
      await as(finance, 'post', `${base}/petty-cash/${float._id}/movements`)
        .send({ type: 'DISBURSEMENT', amount: '500.00', description: 'Taxi fare' }),
      201
    );
    expect((await PettyCashFloat.findById(float._id)).balanceCents).toBe(150_000);

    // A float that shows minus R40 is a counting error nobody can unpick later.
    const over = await as(finance, 'post', `${base}/petty-cash/${float._id}/movements`)
      .send({ type: 'DISBURSEMENT', amount: '5000.00', description: 'Too much' });
    expectError(over, 409);
    expect(over.body.error.message).toMatch(/Insufficient petty cash/);
  });

  it('CUSTODIAN CANNOT RECONCILE THEIR OWN FLOAT', async () => {
    // The custodian is the finance officer, who also holds petty_cash:reconcile.
    const float = expectSuccess(
      await as(finance, 'post', `${base}/petty-cash`).send({
        name: 'Own float', custodian: finance.id, imprest: '1000.00',
      }),
      201
    );

    const res = await as(finance, 'post', `${base}/petty-cash/${float._id}/reconcile`)
      .send({ counted: '1000.00' });
    expectError(res, 403);
    expect(res.body.error.message).toMatch(/own float/i);
  });

  it('records a variance as its own adjustment rather than absorbing it', async () => {
    const float = expectSuccess(
      await as(finance, 'post', `${base}/petty-cash`).send({
        name: 'Front desk', custodian: admin.id, imprest: '2000.00',
      }),
      201
    );
    await as(finance, 'post', `${base}/petty-cash/${float._id}/movements`)
      .send({ type: 'REPLENISHMENT', amount: '2000.00', description: 'Opening float' });

    // Finance is not the custodian here, so may reconcile. R40 short.
    const result = expectSuccess(
      await as(finance, 'post', `${base}/petty-cash/${float._id}/reconcile`).send({ counted: '1960.00' })
    );
    expect(result.reconciliation.expectedCents).toBe(200_000);
    expect(result.reconciliation.countedCents).toBe(196_000);
    expect(result.reconciliation.varianceCents).toBe(-4000);

    expect((await PettyCashFloat.findById(float._id)).balanceCents).toBe(196_000);
    const adjustment = await PettyCashMovement.findOne({ float: float._id, type: 'ADJUSTMENT' });
    expect(adjustment).not.toBeNull();
    expect(adjustment.amountCents).toBe(4000);
  });

  it('keeps movements immutable', async () => {
    const float = expectSuccess(
      await as(finance, 'post', `${base}/petty-cash`).send({
        name: 'Front desk', custodian: admin.id, imprest: '1000.00',
      }),
      201
    );
    await as(finance, 'post', `${base}/petty-cash/${float._id}/movements`)
      .send({ type: 'REPLENISHMENT', amount: '1000.00', description: 'Opening' });

    const movement = await PettyCashMovement.findOne({ float: float._id });
    movement.amountCents = 1;
    await expect(movement.save()).rejects.toThrow(/immutable/i);
  });
});
