const express = require("express");
const router = express.Router();
const { protect, authorizeRoles } = require("../middleware/authMiddleware");
const {
  getAllWarehouses, getWarehouseById, createWarehouse, updateWarehouse, deleteWarehouse,
  getZonesByWarehouse, createZone, updateZone, deleteZone,
  getWarehouseStock, addStock, removeStock, transferStock,
  getTransactions, getWarehouseStats,
} = require("../controllers/warehouseController");

// All routes require login
router.use(protect);

// ── Warehouse ───────────────────────────────
router.get("/",       getAllWarehouses);
router.get("/:id",    getWarehouseById);
router.post("/",      authorizeRoles("SUPER_ADMIN", "ADMIN", "MANAGER"), createWarehouse);
router.put("/:id",    authorizeRoles("SUPER_ADMIN", "ADMIN", "MANAGER"), updateWarehouse);
router.delete("/:id", authorizeRoles("SUPER_ADMIN", "ADMIN"), deleteWarehouse);

// ── Zones ───────────────────────────────────
router.get("/:id/zones",        getZonesByWarehouse);
router.post("/:id/zones",       authorizeRoles("SUPER_ADMIN", "ADMIN", "MANAGER"), createZone);
router.put("/zones/:zoneId",    authorizeRoles("SUPER_ADMIN", "ADMIN", "MANAGER"), updateZone);
router.delete("/zones/:zoneId", authorizeRoles("SUPER_ADMIN", "ADMIN"), deleteZone);

// ── Stock ────────────────────────────────────
router.get("/:id/stock",         getWarehouseStock);
router.post("/:id/stock/add",    authorizeRoles("SUPER_ADMIN", "ADMIN", "MANAGER"), addStock);
router.post("/:id/stock/remove", authorizeRoles("SUPER_ADMIN", "ADMIN", "MANAGER"), removeStock);
router.post("/transfer",         authorizeRoles("SUPER_ADMIN", "ADMIN", "MANAGER"), transferStock);

// ── Transactions & Stats ─────────────────────
router.get("/:id/transactions", getTransactions);
router.get("/:id/stats",        getWarehouseStats);

module.exports = router;