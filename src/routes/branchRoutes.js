const express = require("express");
const router = express.Router();

const {
  createBranch,
  getAllBranches,
  getBranchById,
  updateBranch,
  deleteBranch,
  searchBranches,
  getBranchInventory,
  getBranchSales,
  getBranchEmployees,
  getBranchPerformance,
  updateBranchSettings,
} = require("../controllers/branchController");

//make manager baranch accssible to only for Admin
const { protect } = require("../middleware/authMiddleware");
const { authorizeRoles } = require("../middleware/roleMiddleware");

// =========================
// ADMIN ONLY ROUTES
// =========================

// Create branch
router.post(
  "/",
  protect,
  authorizeRoles("ADMIN", "SUPER_ADMIN"),
  createBranch
);

// // Get all branches
// router.get(
//   "/",
//   protect,
//   authorizeRoles("ADMIN", "SUPER_ADMIN"),
//   getAllBranches
// );
router.get(
  "/",
  protect,
  authorizeRoles("ADMIN", "SUPER_ADMIN", "MANAGER"),
  getAllBranches
);

// Search branches
router.get(
  "/search",
  protect,
  authorizeRoles("ADMIN", "SUPER_ADMIN"),
  searchBranches
);
// router.get(
//   "/search",
//   protect,
//   authorizeRoles("ADMIN", "SUPER_ADMIN", "MANAGER"),
//   searchBranches
// );

// Get single branch
router.get(
  "/:id",
  protect,
  authorizeRoles("ADMIN", "SUPER_ADMIN", "MANAGER"),
  getBranchById
);

// Update branch
router.put(
  "/:id",
  protect,
  authorizeRoles("ADMIN", "SUPER_ADMIN"),
  updateBranch
);

// Delete branch
router.delete(
  "/:id",
  protect,
  authorizeRoles("ADMIN", "SUPER_ADMIN"),
  deleteBranch
);

// =========================
// BRANCH RELATED DATA
// =========================

// Get branch inventory
router.get(
  "/:id/inventory",
  protect,
  authorizeRoles("ADMIN", "SUPER_ADMIN", "MANAGER"),
  getBranchInventory
);

// Get branch sales
router.get(
  "/:id/sales",
  protect,
  authorizeRoles("ADMIN", "SUPER_ADMIN", "MANAGER"),
  getBranchSales
);

// Get branch employees
router.get(
  "/:id/employees",
  protect,
  authorizeRoles("ADMIN", "SUPER_ADMIN", "MANAGER"),
  getBranchEmployees
);

// Get branch performance analytics
router.get(
  "/:id/performance",
  protect,
  authorizeRoles("ADMIN", "SUPER_ADMIN", "MANAGER"),
  getBranchPerformance
);

// Update branch settings
router.put(
  "/:id/settings",
  protect,
  authorizeRoles("ADMIN", "SUPER_ADMIN"),
  updateBranchSettings
);


module.exports = router;