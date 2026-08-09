import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { validate } from '../../middleware/validate.js';
import { PERMISSIONS } from '../../config/permissions.js';
import * as controller from './fundraising.controller.js';
import * as schema from './fundraising.schema.js';

const router = Router();

router.use(authenticate);

// --- donors ---------------------------------------------------------------------------

router
  .route('/donors')
  .post(
    authorize(PERMISSIONS.DONOR_CREATE),
    validate({ body: schema.createDonorSchema }),
    controller.createDonor
  )
  .get(
    authorize(PERMISSIONS.DONOR_READ),
    validate({ query: schema.listDonorsSchema }),
    controller.listDonors
  );

router
  .route('/donors/:id')
  .get(authorize(PERMISSIONS.DONOR_READ), validate({ params: schema.idParamSchema }), controller.getDonor)
  .patch(
    authorize(PERMISSIONS.DONOR_CREATE),
    validate({ params: schema.idParamSchema, body: schema.updateDonorSchema }),
    controller.updateDonor
  );

// --- campaigns ------------------------------------------------------------------------

router
  .route('/campaigns')
  .post(
    authorize(PERMISSIONS.CAMPAIGN_CREATE),
    validate({ body: schema.createCampaignSchema }),
    controller.createCampaign
  )
  .get(
    authorize(PERMISSIONS.CAMPAIGN_READ),
    validate({ query: schema.listCampaignsSchema }),
    controller.listCampaigns
  );

// Before /campaigns/:id so it is not captured as an id.
router.get(
  '/campaigns/:id/totals',
  authorize(PERMISSIONS.CAMPAIGN_READ),
  validate({ params: schema.idParamSchema }),
  controller.campaignTotals
);

router
  .route('/campaigns/:id')
  .get(authorize(PERMISSIONS.CAMPAIGN_READ), validate({ params: schema.idParamSchema }), controller.getCampaign)
  .patch(
    authorize(PERMISSIONS.CAMPAIGN_UPDATE),
    validate({ params: schema.idParamSchema, body: schema.updateCampaignSchema }),
    controller.updateCampaign
  );

// --- pledges --------------------------------------------------------------------------

router
  .route('/pledges')
  .post(
    authorize(PERMISSIONS.PLEDGE_MANAGE),
    validate({ body: schema.createPledgeSchema }),
    controller.createPledge
  )
  .get(
    authorize(PERMISSIONS.DONATION_READ),
    validate({ query: schema.listPledgesSchema }),
    controller.listPledges
  );

router.patch(
  '/pledges/:id',
  authorize(PERMISSIONS.PLEDGE_MANAGE),
  validate({ params: schema.idParamSchema, body: schema.updatePledgeSchema }),
  controller.updatePledge
);

// --- donations ------------------------------------------------------------------------

router
  .route('/donations')
  .post(
    authorize(PERMISSIONS.DONATION_CREATE),
    validate({ body: schema.recordDonationSchema }),
    controller.recordDonation
  )
  .get(
    authorize(PERMISSIONS.DONATION_READ),
    validate({ query: schema.listDonationsSchema }),
    controller.listDonations
  );

// Settlement and refund move money that has already been reported, so both are guarded by
// donation:create rather than the read permission.
router.post(
  '/donations/:id/settle',
  authorize(PERMISSIONS.DONATION_CREATE),
  validate({ params: schema.idParamSchema, body: schema.settleDonationSchema }),
  controller.settleDonation
);

router.post(
  '/donations/:id/receipt/resend',
  authorize(PERMISSIONS.DONATION_CREATE),
  validate({ params: schema.idParamSchema }),
  controller.resendReceipt
);

router.post(
  '/donations/:id/refund',
  authorize(PERMISSIONS.DONATION_CREATE),
  validate({ params: schema.idParamSchema, body: schema.refundDonationSchema }),
  controller.refundDonation
);

router.get(
  '/donations/:id',
  authorize(PERMISSIONS.DONATION_READ),
  validate({ params: schema.idParamSchema }),
  controller.getDonation
);

export default router;
