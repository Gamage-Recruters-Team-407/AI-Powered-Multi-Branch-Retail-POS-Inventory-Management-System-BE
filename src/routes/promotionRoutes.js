const express = require('express');
const router = express.Router();
const { getPromotions, createPromotion } = require('../controllers/promotionController');

router.get('/', getPromotions);
router.post('/', createPromotion);

module.exports = router;
