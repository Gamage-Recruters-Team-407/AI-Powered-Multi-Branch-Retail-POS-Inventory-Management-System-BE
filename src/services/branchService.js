const Branch = require("../models/Branch.js");
const { isMongoConnected } = require("../middleware/requireMongoConnection");

const Inventory = require("../models/Inventory.js");
const Sale = require("../models/Sale.js");
const Employee = require("../models/User.js");
const systemEvents = require("../events/eventBus.js");

const EMPLOYEE_ROLES = [
  "CASHIER",
  "MANAGER",
  "INVENTORY",
  "EMPLOYEE",
  "cashier",
  "manager",
  "inventory",
  "employee",
];

// ===============================
// CREATE BRANCH
// ===============================
const createBranch = async (data) => {
  return await Branch.create(data);
};

// ===============================
// GET ALL BRANCHES
// ===============================
const getAllBranches = async () => {
  if (!isMongoConnected()) {
    return [];
  }

  return await Branch.find().populate("manager");
};

// ===============================
// GET SINGLE BRANCH
// ===============================
const getBranchById = async (id) => {
  const branch = await Branch.findById(id).populate(
    "manager",
    "firstName lastName email"
  );

  if (!branch) {
    return null;
  }

  const branchData = branch.toObject();

  if (branchData.manager) {
    const m = branchData.manager;
    branchData.manager.displayName =
      `${m.firstName || ""} ${m.lastName || ""}`.trim() || m.email || "N/A";
  }

  return branchData;
};

// ===============================
// UPDATE BRANCH
// ===============================
const updateBranch = async (id, updates) => {
  const branch = await Branch.findByIdAndUpdate(id, updates, {
    returnDocument: "after",
  });

  if (!branch) {
    return null;
  }

  systemEvents.emit("SEND_ALERT", {
    target: { role: "Admin" },
    category: "SYSTEM",
    type: "INFO",
    title: "Branch Details Updated",
    message: `The details for branch "${branch.name}" have been modified.`,
    channels: ["in-app"],
  });

  return branch;
};

// ===============================
// DELETE BRANCH
// ===============================
const deleteBranch = async (id) => {
  const branch = await Branch.findByIdAndDelete(id);
  return branch;
};

// ===============================
// SEARCH BRANCHES
// ===============================
const searchBranches = async (q) => {
  return await Branch.find({
    name: { $regex: q, $options: "i" },
  });
};

// ===============================
// BRANCH INVENTORY
// ===============================
const getBranchInventory = async (branchId) => {
  return await Inventory.find({ branch: branchId }).populate("product");
};

// ===============================
// BRANCH SALES
// ===============================
const getBranchSales = async (branchId) => {
  return await Sale.find({ branch: branchId });
};

// ===============================
// BRANCH EMPLOYEES
// ===============================
const getBranchEmployees = async (branchId) => {
  const employees = await Employee.find({
    branch: branchId,
    role: { $in: EMPLOYEE_ROLES },
  });

  return employees.map((emp) => ({
    _id: emp._id,
    name: `${emp.firstName || ""} ${emp.lastName || ""}`,
    email: emp.email,
    role: emp.role,
  }));
};

// ===============================
// BRANCH PERFORMANCE METRICS
// ===============================
const getBranchPerformance = async (branchId) => {
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
    role: { $in: EMPLOYEE_ROLES },
  });

  return {
    branchId,
    totalSales,
    totalRevenue,
    inventoryCount,
    employeeCount,
  };
};

// ===============================
// UPDATE BRANCH SETTINGS
// ===============================
const updateBranchSettings = async (id, settings) => {
  const branch = await Branch.findByIdAndUpdate(
    id,
    { settings },
    { returnDocument: "after" }
  );

  if (!branch) {
    return null;
  }

  systemEvents.emit("SEND_ALERT", {
    target: { role: "Admin" },
    category: "SYSTEM",
    type: "WARNING",
    title: "Branch Settings Changed",
    message: `The configuration settings for branch "${branch.name}" have been modified.`,
    channels: ["in-app"],
  });

  return branch;
};

// ===============================
// GET ALL BRANCHES WITH PERFORMANCE (ADMIN DASHBOARD)
// ===============================
const getAllBranchesWithPerformance = async () => {
  const branches = await Branch.find().populate(
    "manager",
    "firstName lastName email"
  );

  const branchesWithStats = await Promise.all(
    branches.map(async (branch) => {
      const sales = await Sale.find({
        branch: branch._id,
        status: "COMPLETED",
      });

      const totalRevenue = sales.reduce(
        (sum, sale) => sum + (sale.totalAmount || 0),
        0
      );

      const inventoryCount = await Inventory.countDocuments({
        branch: branch._id,
      });

      const employeeCount = await Employee.countDocuments({
        branch: branch._id,
        role: { $in: EMPLOYEE_ROLES },
      });

      const lowStockCount = await Inventory.countDocuments({
        branch: branch._id,
        quantity: { $lte: 10 },
      });

      return {
        _id: branch._id,
        name: branch.name,
        code: branch.code,
        city: branch.city,
        isActive: branch.isActive,
        totalRevenue,
        totalSales: sales.length,
        employeeCount,
        inventoryCount,
        lowStockCount,
      };
    })
  );

  return branchesWithStats;
};

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