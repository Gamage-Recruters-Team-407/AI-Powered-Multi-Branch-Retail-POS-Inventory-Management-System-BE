const jwt = require('jsonwebtoken');
const User = require('../models/User');

// check Login
const protect = async (req, res, next) => {
	let token;

	if (
		req.headers.authorization &&
		req.headers.authorization.startsWith('Bearer')
	) {
		token = req.headers.authorization.split(' ')[1];
	}

	if (!token) {
		return res.status(401).json({ message: 'Not authorized, no token' });
	}

	try {
		const decoded = jwt.verify(token, process.env.JWT_SECRET);
		req.user = await User.findById(decoded.id).select('-password');

		if (!req.user || !req.user.isActive) {
			return res.status(401).json({ message: 'Account disabled' });
		}

		next();
	} catch (err) {
		return res.status(401).json({ message: 'Token invalid or expired' });
	}
};

// Role check  authorize("admin", "manager")
const authorize = (...roles) => {
	return (req, res, next) => {
		if (!roles.includes(req.user.role)) {
			return res.status(403).json({
				message: `Role '${req.user.role}' is not allowed to access this`,
			});
		}
		next();
	};
};

module.exports = { protect, authorize, authorizeRoles: authorize };