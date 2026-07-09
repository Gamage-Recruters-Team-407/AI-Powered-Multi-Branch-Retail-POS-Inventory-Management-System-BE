const branchService = require("../services/branchService.js");

// ===============================
// CREATE BRANCH
// ===============================
const createBranch = async (req, res) => {
  try {
    const branch = await branchService.createBranch(req.body);

    res.status(201).json({
      message: "Branch created successfully",
      branch,
    });
  } catch (error) {
    res.status(500).json({
      message: error.message,
    });
  }
};

// ===============================
// GET ALL BRANCHES
// ===============================
const getAllBranches = async (req, res) => {
  try {
    const branches = await branchService.getAllBranches();

    res.status(200).json(branches);
  } catch (error) {
    res.status(500).json({
      message: error.message,
    });
  }
};

// ===============================
// GET SINGLE BRANCH
// ===============================
const getBranchById = async (req, res) => {
  try {
    const branchData = await branchService.getBranchById(req.params.id);

    if (!branchData) {
      return res.status(404).json({ message: "Branch not found" });
    }

    res.status(200).json(branchData);
  } catch (error) {
    res.status(500).json({
      message: error.message,
    });
  }
};

// ===============================
// UPDATE BRANCH
// ===============================
const updateBranch = async (req, res) => {
  try {
    const branch = await branchService.updateBranch(req.params.id, req.body);

    if (!branch) {
      return res.status(404).json({ message: "Branch not found" });
    }

    res.status(200).json({
      message: "Branch updated successfully",
      branch,
    });
  } catch (error) {
    res.status(500).json({
      message: error.message,
    });
  }
};

// ===============================
// DELETE BRANCH
// ===============================
const deleteBranch = async (req, res) => {
  try {
    const branch = await branchService.deleteBranch(req.params.id);

    if (!branch) {
      return res.status(404).json({ message: "Branch not found" });
    }

    res.status(200).json({
      message: "Branch deleted successfully",
    });
  } catch (error) {
    res.status(500).json({
      message: error.message,
    });
  }
};

// ===============================
// SEARCH BRANCHES
// ===============================
const searchBranches = async (req, res) => {
  try {
    const { q } = req.query;
    const branches = await branchService.searchBranches(q);

    res.status(200).json(branches);
  } catch (error) {
    res.status(500).json({
      message: error.message,
    });
  }
};

// ===============================
// BRANCH INVENTORY
// ===============================
const getBranchInventory = async (req, res) => {
  try {
    const inventory = await branchService.getBranchInventory(req.params.id);

    res.status(200).json(inventory);
  } catch (error) {
    res.status(500).json({
      message: error.message,
    });
  }
};

// ===============================
// BRANCH SALES
// ===============================
const getBranchSales = async (req, res) => {
  try {
    const sales = await branchService.getBranchSales(req.params.id);

    res.status(200).json(sales);
  } catch (error) {
    res.status(500).json({
      message: error.message,
    });
  }
};

// ===============================
// BRANCH EMPLOYEES
// ===============================
const getBranchEmployees = async (req, res) => {
  try {
    const safeEmployees = await branchService.getBranchEmployees(
      req.params.id
    );

    res.status(200).json(safeEmployees);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ===============================
// BRANCH PERFORMANCE METRICS
// ===============================
const getBranchPerformance = async (req, res) => {
  try {
    const performance = await branchService.getBranchPerformance(
      req.params.id
    );

    res.status(200).json(performance);
  } catch (error) {
    res.status(500).json({
      message: error.message,
    });
  }
};

// ===============================
// UPDATE BRANCH SETTINGS
// ===============================
const updateBranchSettings = async (req, res) => {
  try {
    const branch = await branchService.updateBranchSettings(
      req.params.id,
      req.body
    );

    if (!branch) {
      return res.status(404).json({ message: "Branch not found" });
    }

    res.status(200).json({
      message: "Branch settings updated",
      branch,
    });
  } catch (error) {
    res.status(500).json({
      message: error.message,
    });
  }
};

// ===============================
// GET ALL BRANCHES WITH PERFORMANCE (I ADD THIS FOR ADMIN DASHBOARD) - BONUS
// ===============================
const getAllBranchesWithPerformance = async (req, res) => {
  try {
    const branchesWithStats =
      await branchService.getAllBranchesWithPerformance();

    res.status(200).json(branchesWithStats);
  } catch (error) {
    res.status(500).json({
      message: error.message,
    });
  }
};

// ===============================
// EXPORTS
// ===============================
module.exports = {
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
  getAllBranchesWithPerformance,
  updateBranchSettings,
};