const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const { 
	getPromotions, 
	createPromotion, 
	validateCoupon,
	getPromotionById,
	updatePromotion,
	deletePromotion
} = require('../controllers/promotionController');

const isMongoConnected = () => mongoose.connection.readyState === 1;

const requireMongoConnection = (req, res, next) => {
  if (!isMongoConnected()) {
    return res.status(503).json({
      success: false,
      message: 'MongoDB is not connected yet. Check MONGO_URI, DB_NAME, and Atlas network access.',
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
