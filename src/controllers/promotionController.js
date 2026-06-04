const Promotion = require('../models/Promotion');
const systemEvents = require("../events/eventBus");

exports.getPromotions = async (req, res, next) => {
	try {
		const promotions = await Promotion.find();
		res.json(promotions);
	} catch (err) {
		next(err);
	}
};

exports.createPromotion = async (req, res, next) => {
	try {
		const promotion = new Promotion(req.body);
		await promotion.save();

		// Trigger a notification
		systemEvents.emit('SEND_ALERT', {
			target: { role: 'Manager' }, 
			category: 'SYSTEM',
			type: 'INFO',
			title: 'New Promotion Launched',
			message: `A new promotion "${promotion.name || 'Special Offer'}" has been created!`,
			channels: ['in-app', 'email']
		});

		res.status(201).json(promotion);
	} catch (err) {
		next(err);
	}
};
