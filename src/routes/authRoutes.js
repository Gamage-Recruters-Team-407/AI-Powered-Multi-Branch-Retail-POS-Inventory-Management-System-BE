const express = require("express");
const router = express.Router();
const {
  register,
  loginUser,
  forgotPassword,
  resetPassword,
  getProfile,
  updateProfile,
  logoutUser,
  changePassword,
} = require("../controllers/authcontroller");
const { protect } = require("../middleware/authMiddleware");

// Public Routes
router.post("/register", register);
router.post("/login", loginUser);
router.post("/forgot-password", forgotPassword);
router.post("/reset-password/:token", resetPassword);

// Protected Routes (require authentication)
router.get("/profile", protect, getProfile);
router.put("/profile", protect, updateProfile);
router.post("/logout", protect, logoutUser);
router.post("/change-password", protect, changePassword);

module.exports = router;