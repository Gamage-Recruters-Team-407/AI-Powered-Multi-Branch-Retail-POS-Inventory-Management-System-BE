const mongoose = require('mongoose');
const Promotion = require('../models/Promotion');
const systemEvents = require('../events/eventBus');
const { isMongoConnected } = require('../middleware/requireMongoConnection');

const dbUnavailable = (res) =>
	res.status(503).json({
		success: false,
		message:
			'MongoDB is not connected. Set MONGO_URI in .env and ensure Atlas/network access.',
	});

exports.getPromotions = async (req, res, next) => {
	try {
		if (!isMongoConnected()) {
			return dbUnavailable(res);
		}
		const promotions = await Promotion.find();
		res.json(promotions);
	} catch (err) {
		next(err);
	}
};

exports.createPromotion = async (req, res, next) => {
	try {
		if (!isMongoConnected()) {
			return dbUnavailable(res);
		}
		const promotion = new Promotion(req.body);
		await promotion.save();

		systemEvents.emit('SEND_ALERT', {
			target: { role: 'Manager' },
			category: 'SYSTEM',
			type: 'INFO',
			title: 'New Promotion Launched',
			message: `A new promotion "${promotion.title || 'Special Offer'}" has been created!`,
			channels: ['in-app', 'email'],
		});

		res.status(201).json(promotion);
	} catch (err) {
		next(err);
	}
};

exports.validateCoupon = async (req, res, next) => {
	const { couponCode, cartTotal, branchId } = req.body;

	try {
		if (!couponCode) {
			return res.status(400).json({ valid: false, message: "Coupon code is required" });
		}

		// Find the promotion by couponCode (case-insensitive check)
		const promotion = await Promotion.findOne({
			couponCode: couponCode.trim().toUpperCase()
		});

		// 1. Promotion exists
		if (!promotion) {
			return res.status(200).json({ valid: false, message: "Coupon not found" });
		}

		// 2. Promotion is active
		if (!promotion.isActive) {
			return res.status(200).json({ valid: false, message: "Coupon is inactive" });
		}

		// 3. Current date is between startDate and endDate
		const now = new Date();
		if (promotion.startDate && now < promotion.startDate) {
			return res.status(200).json({ valid: false, message: "Promotion has not started yet" });
		}
		if (promotion.endDate && now > promotion.endDate) {
			return res.status(200).json({ valid: false, message: "Coupon expired" });
		}

		// 4. Branch is eligible (if branch restrictions exist)
		if (promotion.branches && promotion.branches.length > 0) {
			if (!branchId || !promotion.branches.some(b => b.toString() === branchId.toString())) {
				return res.status(200).json({ valid: false, message: "Coupon is not valid for this branch" });
			}
		}

		// 5. Minimum purchase amount is satisfied
		const minAmount = promotion.minPurchaseAmount || 0;
		if (cartTotal < minAmount) {
			return res.status(200).json({
				valid: false,
				message: `Minimum purchase amount of Rs. ${minAmount} is required`
			});
		}

		// 6. Usage limit is not exceeded
		if (promotion.usageLimit !== null && promotion.usageLimit !== undefined) {
			if (promotion.usageCount >= promotion.usageLimit) {
				return res.status(200).json({ valid: false, message: "Coupon usage limit exceeded" });
			}
		}

		// Calculate discount amount based on type
		let discountAmount = 0;
		if (promotion.discountType === "PERCENTAGE") {
			discountAmount = parseFloat((cartTotal * (promotion.discountValue / 100)).toFixed(2));
		} else if (promotion.discountType === "FIXED") {
			discountAmount = Math.min(promotion.discountValue, cartTotal);
		}

		return res.status(200).json({
			valid: true,
			promotionId: promotion._id,
			promotionTitle: promotion.title,
			discountType: promotion.discountType,
			discountValue: promotion.discountValue,
			discountAmount
		});
	} catch (err) {
		next(err);
	}
};

exports.getPromotionById = async (req, res, next) => {
	const { id } = req.params;

	try {
		if (!mongoose.Types.ObjectId.isValid(id)) {
			return res.status(400).json({ message: "Invalid Promotion ID format" });
		}

		const promotion = await Promotion.findById(id);

		if (!promotion) {
			return res.status(404).json({ message: "Promotion not found" });
		}

		res.json(promotion);
	} catch (err) {
		next(err);
	}
};

exports.updatePromotion = async (req, res, next) => {
	const { id } = req.params;

	try {
		if (!mongoose.Types.ObjectId.isValid(id)) {
			return res.status(400).json({ message: "Invalid Promotion ID format" });
		}

		const promotion = await Promotion.findByIdAndUpdate(
			id,
			req.body,
			{ returnDocument: 'after', runValidators: true }
		);

		if (!promotion) {
			return res.status(404).json({ message: "Promotion not found" });
		}

		// Trigger a notification
		systemEvents.emit('SEND_ALERT', {
			target: { role: 'Manager' }, 
			category: 'SYSTEM',
			type: 'INFO',
			title: 'Promotion Updated',
			message: `Promotion "${promotion.title || 'Special Offer'}" has been updated!`,
			channels: ['in-app', 'email']
		});

		res.json(promotion);
	} catch (err) {
		next(err);
	}
};

exports.deletePromotion = async (req, res, next) => {
	const { id } = req.params;

	try {
		if (!mongoose.Types.ObjectId.isValid(id)) {
			return res.status(400).json({ message: "Invalid Promotion ID format" });
		}

		const promotion = await Promotion.findByIdAndDelete(id);

		if (!promotion) {
			return res.status(404).json({ message: "Promotion not found" });
		}

		// Trigger a notification
		systemEvents.emit('SEND_ALERT', {
			target: { role: 'Manager' }, 
			category: 'SYSTEM',
			type: 'WARNING',
			title: 'Promotion Deleted',
			message: `Promotion "${promotion.title || 'Special Offer'}" has been deleted.`,
			channels: ['in-app']
		});

		res.json({ message: "Promotion deleted successfully" });
	} catch (err) {
		next(err);
	}
};
