const express = require("express");
const { protect } = require("../middleware/authMiddleware");
const { authorizeRoles } = require("../middleware/roleMiddleware");
const {
    createTransfer,
    updateTransfer,
    deleteTransfer,
    dispatchTransfer,
    approveTransfer,
    completeTransfer,
    cancelTransfer,
    rejectTransfer,
    listTransfers,
    getTransferById,
    getTransferPermissions,
    getBranchStockAvailability,
    listInventoryMovements,
    getTransferActivityLogs,
    getBranchTransferReports,
    getTransferAnalytics
} = require("../controllers/stockTransferController");

const router = express.Router();

const adminRoles = ["SUPER_ADMIN", "ADMIN"];
const managerOnly = ["MANAGER"];
const viewRoles = ["SUPER_ADMIN", "ADMIN", "MANAGER", "CASHIER"];
const managerAndAdmin = ["SUPER_ADMIN", "ADMIN", "MANAGER"];
const reportViewRoles = ["SUPER_ADMIN", "ADMIN", "MANAGER", "CASHIER"];
const availabilityRoles = ["SUPER_ADMIN", "ADMIN", "MANAGER", "CASHIER"];

router.use(protect);

// ── Permissions & read APIs ──────────────────────────────────────────────────
router.get("/permissions",        authorizeRoles(...viewRoles),         getTransferPermissions);
router.get("/availability",       authorizeRoles(...availabilityRoles), getBranchStockAvailability);

// ── Analytics, Reports, Logs ─────────────────────────────────────────────────
router.get("/analytics/summary",  authorizeRoles(...reportViewRoles),   getTransferAnalytics);
router.get("/reports/by-branch",  authorizeRoles(...reportViewRoles),   getBranchTransferReports);
router.get("/logs",               authorizeRoles(...adminRoles),        getTransferActivityLogs);

// ── Inventory movement history ────────────────────────────────────────────────
router.get("/movements/history",  authorizeRoles(...managerAndAdmin),   listInventoryMovements);

// ── List & single transfer ────────────────────────────────────────────────────
router.get("/",                   authorizeRoles(...viewRoles),         listTransfers);
router.get("/:id",                authorizeRoles(...viewRoles),         getTransferById);

// ── Manager: create / edit / cancel while PENDING ────────────────────────────
router.post("/",                  authorizeRoles(...managerOnly),                    createTransfer);
router.put("/:id",                authorizeRoles(...managerOnly),                    updateTransfer);
router.patch("/:id",              authorizeRoles(...managerOnly),                    updateTransfer);   // PATCH alias (frontend uses PATCH→PUT fallback)
router.patch("/:id/resubmit",     authorizeRoles(...managerOnly),                    updateTransfer);   // rejected → pending resubmit
router.patch("/:id/cancel",       authorizeRoles(...managerOnly, ...adminRoles),     cancelTransfer);
router.delete("/:id",             authorizeRoles(...managerOnly),                    deleteTransfer);

// ── Admin: approve / reject ───────────────────────────────────────────────────
router.patch("/:id/approve",      authorizeRoles(...adminRoles),        approveTransfer);
router.patch("/:id/reject",       authorizeRoles(...adminRoles),        rejectTransfer);

// ── Manager: dispatch APPROVED → IN_TRANSIT ───────────────────────────────────
router.patch("/:id/dispatch",     authorizeRoles(...managerOnly),       dispatchTransfer);

// ── Destination manager: confirm receipt → COMPLETED ─────────────────────────
router.patch("/:id/complete", authorizeRoles(...managerOnly, ...adminRoles), completeTransfer);

module.exports = router;
