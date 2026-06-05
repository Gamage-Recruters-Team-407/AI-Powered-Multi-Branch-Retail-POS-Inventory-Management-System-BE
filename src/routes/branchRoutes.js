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

// =========================
// BASIC CRUD ROUTES
// =========================

// Create branch
router.post("/", createBranch);

// Get all branches
router.get("/", getAllBranches);

// Search branches
router.get("/search", searchBranches);

// Get single branch
router.get("/:id", getBranchById);

// Update branch
router.put("/:id", updateBranch);

// Delete branch
router.delete("/:id", deleteBranch);

// =========================
// BRANCH RELATED DATA
// =========================

// Get branch inventory
router.get("/:id/inventory", getBranchInventory);

// Get branch sales
router.get("/:id/sales", getBranchSales);

// Get branch employees
router.get("/:id/employees", getBranchEmployees);

// Get branch performance analytics
router.get("/:id/performance", getBranchPerformance);

// Update branch settings
router.put("/:id/settings", updateBranchSettings);

module.exports = router;