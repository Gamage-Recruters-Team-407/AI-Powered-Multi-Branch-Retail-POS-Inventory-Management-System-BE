const mongoose = require('mongoose');

const PUBLIC_API_PATHS = new Set(['/api/health', '/health']);

const isMongoConnected = () => mongoose.connection.readyState === 1;

const requireMongoConnection = (req, res, next) => {
	if (!req.path.startsWith('/api')) {
		return next();
	}
	if (PUBLIC_API_PATHS.has(req.path)) {
		return next();
	}
	if (isMongoConnected()) {
		return next();
	}
	return res.status(503).json({
		success: false,
		message:
			'MongoDB is not connected. Set MONGO_URI in .env and ensure Atlas/network access, then restart the server.',
	});
};

module.exports = { requireMongoConnection, isMongoConnected };
