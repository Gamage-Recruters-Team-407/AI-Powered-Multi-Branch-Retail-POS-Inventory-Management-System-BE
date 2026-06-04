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
router.get("/",    getAllWarehouses);
router.get("/:id", getWarehouseById);
router.post("/",   authorizeRoles("admin", "manager"), createWarehouse);
router.put("/:id", authorizeRoles("admin", "manager"), updateWarehouse);
router.delete("/:id", authorizeRoles("admin"), deleteWarehouse);

// ── Zones ───────────────────────────────────
router.get("/:id/zones",  getZonesByWarehouse);
router.post("/:id/zones", authorizeRoles("admin", "manager"), createZone);
router.put("/zones/:zoneId",    authorizeRoles("admin", "manager"), updateZone);
router.delete("/zones/:zoneId", authorizeRoles("admin"), deleteZone);

// ── Stock ────────────────────────────────────
router.get("/:id/stock",         getWarehouseStock);
router.post("/:id/stock/add",    authorizeRoles("admin", "manager", "warehouse_staff"), addStock);
router.post("/:id/stock/remove", authorizeRoles("admin", "manager", "warehouse_staff"), removeStock);
router.post("/transfer",         authorizeRoles("admin", "manager"), transferStock);

// ── Transactions & Stats ─────────────────────
router.get("/:id/transactions", getTransactions);
router.get("/:id/stats",        getWarehouseStats);

module.exports = router;
