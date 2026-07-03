const express = require("express");
const router = express.Router();
const upload = require("../middleware/uploadMiddleware");
const { protect } = require("../middleware/authMiddleware");
const {
    getAllEmployees,
    getEmployeeById,
    addEmployee,
    updateEmployee,
    deleteEmployee,
    getSchedules,
    saveSchedule,
    getAttendance,
    logAttendance,
    getPerformanceMetrics,
    logPerformanceMetric,
    autoClockIn,
    autoClockOut
} = require("../controllers/employeeController");

// --- EMPLOYEE CRUD ENDPOINTS ---
router.get("/", getAllEmployees);
router.post("/", upload.single("photo"), addEmployee);
router.get("/schedules", getSchedules);
router.post("/schedules", saveSchedule);

// Auto Attendance Routes
router.post("/attendance/auto-clock-in", protect, autoClockIn);
router.post("/attendance/auto-clock-out", protect, autoClockOut);

router.get("/attendance", getAttendance);
router.post("/attendance", logAttendance);
router.get("/performance", getPerformanceMetrics);
router.post("/performance", logPerformanceMetric);
router.get("/:id", getEmployeeById);
router.put("/:id", upload.single("photo"), updateEmployee);
router.delete("/:id", deleteEmployee);

module.exports = router;
