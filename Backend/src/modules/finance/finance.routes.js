import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { validate } from '../../middleware/validate.js';
import { PERMISSIONS } from '../../config/permissions.js';
import * as controller from './finance.controller.js';
import * as schema from './finance.schema.js';

// The permissions below are the outer gate only. Whether a particular person may approve
// a particular record depends on who raised it and how much it is for, and those checks
// live in finance.service.js where both are known.

const router = Router();

router.use(authenticate);

// --- budgets ---------------------------------------------------------------------------

router
  .route('/budgets')
  .post(
    authorize(PERMISSIONS.BUDGET_CREATE),
    validate({ body: schema.createBudgetSchema }),
    controller.createBudget
  )
  .get(
    authorize(PERMISSIONS.BUDGET_READ),
    validate({ query: schema.listBudgetsSchema }),
    controller.listBudgets
  );

// Static paths before /:id.
router.get(
  '/budgets/:id/position',
  authorize(PERMISSIONS.BUDGET_READ),
  validate({ params: schema.idParamSchema }),
  controller.budgetPosition
);

router.post(
  '/budgets/:id/submit',
  authorize(PERMISSIONS.BUDGET_CREATE),
  validate({ params: schema.idParamSchema }),
  controller.submitBudget
);

router.post(
  '/budgets/:id/approve',
  authorize(PERMISSIONS.BUDGET_APPROVE),
  validate({ params: schema.idParamSchema }),
  controller.approveBudget
);

router.post(
  '/budgets/:id/reject',
  authorize(PERMISSIONS.BUDGET_APPROVE),
  validate({ params: schema.idParamSchema, body: schema.rejectSchema }),
  controller.rejectBudget
);

router
  .route('/budgets/:id')
  .get(authorize(PERMISSIONS.BUDGET_READ), validate({ params: schema.idParamSchema }), controller.getBudget)
  .patch(
    authorize(PERMISSIONS.BUDGET_CREATE),
    validate({ params: schema.idParamSchema, body: schema.updateBudgetSchema }),
    controller.updateBudget
  );

// --- transactions ----------------------------------------------------------------------

router
  .route('/transactions')
  .post(
    authorize(PERMISSIONS.TRANSACTION_CREATE),
    validate({ body: schema.createTransactionSchema }),
    controller.createTransaction
  )
  .get(
    authorize(PERMISSIONS.TRANSACTION_READ),
    validate({ query: schema.listTransactionsSchema }),
    controller.listTransactions
  );

router.post(
  '/transactions/:id/submit',
  authorize(PERMISSIONS.TRANSACTION_CREATE),
  validate({ params: schema.idParamSchema }),
  controller.submitTransaction
);

router.post(
  '/transactions/:id/approve',
  authorize(PERMISSIONS.TRANSACTION_APPROVE),
  validate({ params: schema.idParamSchema }),
  controller.approveTransaction
);

router.post(
  '/transactions/:id/reject',
  authorize(PERMISSIONS.TRANSACTION_APPROVE),
  validate({ params: schema.idParamSchema, body: schema.rejectSchema }),
  controller.rejectTransaction
);

// Corrections are a new opposing entry, never an edit — so this posts rather than patches.
router.post(
  '/transactions/:id/reverse',
  authorize(PERMISSIONS.TRANSACTION_APPROVE),
  validate({ params: schema.idParamSchema, body: schema.reverseSchema }),
  controller.reverseTransaction
);

router
  .route('/transactions/:id')
  .get(authorize(PERMISSIONS.TRANSACTION_READ), validate({ params: schema.idParamSchema }), controller.getTransaction)
  .patch(
    authorize(PERMISSIONS.TRANSACTION_CREATE),
    validate({ params: schema.idParamSchema, body: schema.updateTransactionSchema }),
    controller.updateTransaction
  );

// --- petty cash ------------------------------------------------------------------------

router
  .route('/petty-cash')
  .post(
    authorize(PERMISSIONS.PETTY_CASH_CREATE),
    validate({ body: schema.createFloatSchema }),
    controller.createFloat
  )
  .get(
    authorize(PERMISSIONS.PETTY_CASH_READ),
    validate({ query: schema.listMovementsSchema }),
    controller.listFloats
  );

router
  .route('/petty-cash/:id/movements')
  .post(
    authorize(PERMISSIONS.PETTY_CASH_CREATE),
    validate({ params: schema.idParamSchema, body: schema.movementSchema }),
    controller.recordMovement
  )
  .get(
    authorize(PERMISSIONS.PETTY_CASH_READ),
    validate({ params: schema.idParamSchema, query: schema.listMovementsSchema }),
    controller.listMovements
  );

// Refused for the custodian's own float, in the service.
router.post(
  '/petty-cash/:id/reconcile',
  authorize(PERMISSIONS.PETTY_CASH_RECONCILE),
  validate({ params: schema.idParamSchema, body: schema.reconcileSchema }),
  controller.reconcileFloat
);

router.get(
  '/petty-cash/:id',
  authorize(PERMISSIONS.PETTY_CASH_READ),
  validate({ params: schema.idParamSchema }),
  controller.getFloat
);

export default router;
