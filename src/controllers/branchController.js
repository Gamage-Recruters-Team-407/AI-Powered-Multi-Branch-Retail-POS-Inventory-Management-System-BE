const Branch = require("../models/Branch.js");
const { isMongoConnected } = require("../middleware/requireMongoConnection");

// You will likely need these models too (adjust names if different)
const Inventory = require("../models/Inventory.js");
const Sale = require("../models/Sale.js");
const Employee = require("../models/User.js");
const systemEvents = require("../events/eventBus.js");

// ===============================
// CREATE BRANCH
// ===============================
const createBranch = async (req, res) => {
  try {
    const branch = await Branch.create(req.body);

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
    if (!isMongoConnected()) {
      return res.status(200).json([]);
    }

    const branches = await Branch.find().populate("manager");

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
    const branch = await Branch.findById(req.params.id)
      .populate("manager", "firstName lastName email");
      
    if (!branch) {
      return res.status(404).json({ message: "Branch not found" });
    }

    const branchData = branch.toObject();

    if (branchData.manager) {
      const m = branchData.manager;
      branchData.manager.displayName = 
        `${m.firstName || ""} ${m.lastName || ""}`.trim() || m.email || "N/A";
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
    const branch = await Branch.findByIdAndUpdate(
      req.params.id,
      req.body,
      { returnDocument: 'after' }
    );

    if (!branch) {
      return res.status(404).json({ message: "Branch not found" });
    }

    // Trigger a notification
    systemEvents.emit('SEND_ALERT', {
      target: { role: 'Admin' }, 
      category: 'SYSTEM',
      type: 'INFO',
      title: 'Branch Details Updated',
      message: `The details for branch "${branch.name}" have been modified.`,
      channels: ['in-app']
    });

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
    const branch = await Branch.findByIdAndDelete(req.params.id);

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

    const branches = await Branch.find({
      name: { $regex: q, $options: "i" },
    });

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
    const inventory = await Inventory.find({
      branch: req.params.id,
    }).populate("product");

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
    const sales = await Sale.find({
      branch: req.params.id,
    });

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
    const employees = await Employee.find({
      branch: req.params.id,
      role: { $in: ['CASHIER', 'MANAGER', 'INVENTORY', 'EMPLOYEE', 'cashier', 'manager', 'inventory', 'employee'] }
    });

    const safeEmployees = employees.map(emp => ({
      _id: emp._id,
      name: `${emp.firstName || ""} ${emp.lastName || ""}`,
      email: emp.email,
      role: emp.role
    }));

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
    const branchId = req.params.id;

    const sales = await Sale.find({ branch: branchId });

    const totalSales = sales.length;

    const totalRevenue = sales.reduce(
      (sum, sale) => sum + (sale.totalAmount || 0),
      0
    );

    const inventoryCount = await Inventory.countDocuments({
      branch: branchId,
    });

    const employeeCount = await Employee.countDocuments({
      branch: branchId,
      role: { $in: ['CASHIER', 'MANAGER', 'INVENTORY', 'EMPLOYEE', 'cashier', 'manager', 'inventory', 'employee'] }
    });

    res.status(200).json({
      branchId,
      totalSales,
      totalRevenue,
      inventoryCount,
      employeeCount,
    });
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
    const branch = await Branch.findByIdAndUpdate(
      req.params.id,
      { settings: req.body },
      { returnDocument: 'after' }
    );

    if (!branch) {
      return res.status(404).json({ message: "Branch not found" });
    }

    // Trigger a notification
    systemEvents.emit('SEND_ALERT', {
      target: { role: 'Admin' }, 
      category: 'SYSTEM',
      type: 'WARNING',
      title: 'Branch Settings Changed',
      message: `The configuration settings for branch "${branch.name}" have been modified.`,
      channels: ['in-app']
    });

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
  updateBranchSettings,
};