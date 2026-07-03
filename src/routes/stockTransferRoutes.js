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

// Permissions & read APIs
router.get("/permissions", authorizeRoles(...viewRoles), getTransferPermissions);
router.get("/availability", authorizeRoles(...availabilityRoles), getBranchStockAvailability);

// Admin + manager analytics & reports; admin-only audit-style logs
router.get("/analytics/summary", authorizeRoles(...reportViewRoles), getTransferAnalytics);
router.get("/reports/by-branch", authorizeRoles(...reportViewRoles), getBranchTransferReports);
router.get("/logs", authorizeRoles(...adminRoles), getTransferActivityLogs);

// Transfer history (inventory movements) — admin, manager; cashier uses transfer list for status
router.get("/movements/history", authorizeRoles(...managerAndAdmin), listInventoryMovements);

router.get("/", authorizeRoles(...viewRoles), listTransfers);
router.get("/:id", authorizeRoles(...viewRoles), getTransferById);

// Manager: create / edit / cancel while PENDING
router.post("/", authorizeRoles(...managerOnly), createTransfer);
router.put("/:id", authorizeRoles(...managerOnly), updateTransfer);
router.patch("/:id/cancel", authorizeRoles(...managerOnly, ...adminRoles), cancelTransfer);
router.delete("/:id", authorizeRoles(...managerOnly), deleteTransfer);

// Admin: approve → APPROVED, reject, cancel while PENDING
router.patch("/:id/approve", authorizeRoles(...adminRoles), approveTransfer);
router.patch("/:id/reject", authorizeRoles(...adminRoles), rejectTransfer);

// Manager: dispatch APPROVED → IN_TRANSIT (stock out)
router.patch("/:id/dispatch", authorizeRoles(...managerOnly), dispatchTransfer);

// Destination branch manager confirms receipt
router.patch("/:id/complete", authorizeRoles(...managerOnly), completeTransfer);

module.exports = router;
