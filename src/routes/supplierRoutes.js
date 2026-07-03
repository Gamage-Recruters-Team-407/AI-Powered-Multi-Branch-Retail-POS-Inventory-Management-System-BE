const express = require('express');
const mongoose = require('mongoose');
const controller = require("../controllers/supplierController");
const { protect, authorize } = require('../middleware/authMiddleware');

const router = express.Router();

const isMongoConnected = () => mongoose.connection.readyState === 1;

const requireMongoConnection = (req, res, next) => {
  if (!isMongoConnected()) {
    return res.status(503).json({
      success: false,
      message: 'MongoDB is not connected yet. Check MONGO_URI, DB_NAME, and Atlas network access.',
    });
  }
  next();
};

// Performance Reports
router.get("/reports/performance", controller.getAllPerformanceReports);
router.get("/:id/performance", requireMongoConnection, controller.getPerformanceReport);

// Procurement and Transactions
router.post("/:id/transactions", requireMongoConnection, protect, authorize("SUPER_ADMIN", "ADMIN", "MANAGER", "admin", "manager"), controller.addTransaction);
router.patch("/:id/transactions/:txnId", requireMongoConnection, protect, authorize("SUPER_ADMIN", "ADMIN", "MANAGER", "admin", "manager"), controller.updateTransactionStatus);
router.get("/:id/procurement", requireMongoConnection, controller.getProcurementHistory);

// Contract Management
router.get("/:id/contract", requireMongoConnection, controller.getContract);
router.put("/:id/contract", requireMongoConnection, protect, authorize("SUPER_ADMIN", "ADMIN", "MANAGER", "admin", "manager"), controller.updateContract);

// CRUD for Supplier
router.post("/", requireMongoConnection, protect, authorize("SUPER_ADMIN", "ADMIN", "MANAGER", "admin", "manager"), controller.createSupplier);
router.get("/", controller.getSuppliers);
router.get("/:id", requireMongoConnection, controller.getSupplier);
router.put("/:id", requireMongoConnection, protect, authorize("SUPER_ADMIN", "ADMIN", "MANAGER", "admin", "manager"), controller.updateSupplier);
router.delete("/:id", requireMongoConnection, protect, authorize("SUPER_ADMIN", "ADMIN", "admin", "manager"), controller.deleteSupplier);

module.exports = router;
