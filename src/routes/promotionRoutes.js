const express = require('express');
const router = express.Router();
const {
	getPromotions,
	createPromotion,
	validateCoupon,
	getPromotionById,
	updatePromotion,
	deletePromotion,
} = require('../controllers/promotionController');
const { isMongoConnected } = require('../middleware/requireMongoConnection');

const requireMongoConnection = (req, res, next) => {
	if (!isMongoConnected()) {
		return res.status(503).json({
			success: false,
			message:
				'MongoDB is not connected. Set MONGO_URI in .env and ensure Atlas/network access.',
		});
	}
	next();
};

router.get('/', requireMongoConnection, getPromotions);
router.post('/', requireMongoConnection, createPromotion);
router.post('/validate', requireMongoConnection, validateCoupon);
router.get('/:id', requireMongoConnection, getPromotionById);
router.put('/:id', requireMongoConnection, updatePromotion);
router.delete('/:id', requireMongoConnection, deletePromotion);

module.exports = router;
