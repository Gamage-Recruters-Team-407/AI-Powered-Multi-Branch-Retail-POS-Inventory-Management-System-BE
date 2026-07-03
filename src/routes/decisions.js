const express = require('express');
const router = express.Router();
const decisionsController = require('../controllers/decisionsController');

router.get('/suggestions', decisionsController.getSuggestions);
router.post('/create-po', decisionsController.createPurchaseOrder);
router.post('/send-offer', decisionsController.sendOffer);
router.post('/reorder', decisionsController.reorder);
router.post('/approve-all', decisionsController.approveAll);

module.exports = router;
