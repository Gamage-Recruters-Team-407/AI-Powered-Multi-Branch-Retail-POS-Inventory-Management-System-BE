const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
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
        
        // Ensure Database is connected before looking up user
        if (mongoose.connection.readyState !== 1) {
            return res.status(503).json({ message: 'Database connection lost. Please try again in a moment.' });
        }

        req.user = await User.findById(decoded.id).select('-password');

        if (!req.user || !req.user.isActive) {
            return res.status(401).json({ message: 'Account disabled or user not found' });
        }

        next();
    } catch (err) {
        if (err.name === 'TokenExpiredError') {
            return res.status(401).json({ message: 'Session expired. Please log in again.' });
        }
        if (err.name === 'JsonWebTokenError') {
            return res.status(401).json({ message: 'Invalid token. Please log in again.' });
        }
        // If it's not a JWT error, it's a server/DB error
        return res.status(500).json({ message: 'Internal server error during authentication' });
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

module.exports = { 
  protect, 
  authorize, 
  authorizeRoles: authorize 
};