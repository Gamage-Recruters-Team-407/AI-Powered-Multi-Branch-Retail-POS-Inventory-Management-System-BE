const mongoose = require("mongoose");
const Employee = require("../models/User");
const User = require("../models/User");
const EmployeeSchedule = require("../models/EmployeeSchedule");
const EmployeeAttendance = require("../models/EmployeeAttendance");
const EmployeePerformance = require("../models/EmployeePerformance");
const systemEvents = require("../events/eventBus");
const cloudinary = require("../config/cloudinary");
const { isMongoConnected } = require("../middleware/requireMongoConnection");
const fs = require("fs");
const path = require("path");
const Branch = require("../models/Branch");
const AuditService = require("../services/auditService");

// Helper to save file locally on disk fallback
const saveLocalFile = (req) => {
    try {
        const uploadsDir = path.join(__dirname, "../../uploads");
        if (!fs.existsSync(uploadsDir)) {
            fs.mkdirSync(uploadsDir, { recursive: true });
        }
        
        const originalName = req.file.originalname || "image.jpg";
        const fileExtension = path.extname(originalName) || `.${req.file.mimetype.split("/")[1] || "jpg"}`;
        const fileName = `emp_${Date.now()}_${Math.round(Math.random() * 1e9)}${fileExtension}`;
        const filePath = path.join(uploadsDir, fileName);
        
        fs.writeFileSync(filePath, req.file.buffer);
        
        const baseUrl = `${req.protocol}://${req.get('host')}`;
        return `${baseUrl}/uploads/${fileName}`;
    } catch (err) {
        console.error("Error saving local file fallback:", err.message);
        return "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150&h=150&fit=crop";
    }
};

// ==========================================
// 👥 EMPLOYEE CRUD OPERATIONS
// ==========================================

// @desc    Get all employees
// @route   GET /api/employees
// @access  Public
const getAllEmployees = async (req, res) => {
    if (!isMongoConnected()) {
        return res.status(200).json({ success: true, employees: [] });
    }
    try {
        const users = await Employee.find().populate('branch', 'name');

        const mappedEmployees = users.map(user => ({
            _id: user._id,
            employeeId: user._id.toString(),
            firstName: user.firstName || user.name || "Unnamed",
            lastName: user.lastName || "",
            name: user.name || `${user.firstName || ""} ${user.lastName || ""}`.trim(),
            email: user.email,
            phone: user.phone || "No Phone",
            role: user.role || "user",
            branch: user.branch,
            status: user.isActive ? "Active" : "Inactive",
            salary: user.salary || 0,
            joiningDate: user.joiningDate || null,
            createdAt: user.createdAt,
            workingStatus: user.workingStatus || "Off Duty",
            performanceScore: user.performanceScore || 0.0
        }));

        const roleOrder = {
            'admin': 1,
            'manager': 2,
            'cashier': 3
        };

        const sortedEmployees = mappedEmployees.sort((a, b) => {
            const roleA = (a.role || '').toLowerCase();
            const roleB = (b.role || '').toLowerCase();
            return (roleOrder[roleA] || 99) - (roleOrder[roleB] || 99);
        });

        return res.status(200).json({
            success: true,
            employees: sortedEmployees
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: "Failed to retrieve employees list.",
            error: error.message
        });
    }
};

// @desc    Get single employee by ID
// @route   GET /api/employees/:id
// @access  Public
const getEmployeeById = async (req, res) => {
    try {
        const user = await Employee.findById(req.params.id).populate('branch', 'name');
        if (!user) {
            return res.status(404).json({
                success: false,
                message: "Employee not found."
            });
        }
        const mappedEmployee = {
            _id: user._id,
            employeeId: user._id.toString(),
            firstName: user.firstName || user.name || "Unnamed",
            lastName: user.lastName || "",
            name: user.name || `${user.firstName || ""} ${user.lastName || ""}`.trim(),
            email: user.email,
            phone: user.phone || "No Phone",
            role: user.role || "user",
            branch: user.branch,
            status: user.isActive ? "Active" : "Inactive",
            salary: user.salary || 0,
            joiningDate: user.joiningDate || null,
            createdAt: user.createdAt,
            workingStatus: user.workingStatus || "Off Duty",
            performanceScore: user.performanceScore || 0.0
        };
        return res.status(200).json({
            success: true,
            employee: mappedEmployee
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: "Failed to retrieve employee details.",
            error: error.message
        });
    }
};

// @desc    Register a new staff member
// @route   POST /api/employees
// @access  Public
const addEmployee = async (req, res) => {
    return res.status(400).json({
        success: false,
        message: "Adding employees directly is disabled. Please create users via User Management instead."
    });
};

// @desc    Update employee details
// @route   PUT /api/employees/:id
// @access  Public
const updateEmployee = async (req, res) => {
    try {
        const {
            firstName,
            lastName,
            email,
            phone,
            role,
            branch,
            salary,
            status,
            workingStatus,
            joiningDate,
            hireDate
        } = req.body;

        const user = await Employee.findById(req.params.id);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: "Employee not found."
            });
        }

        const oldValues = {
            firstName: user.firstName,
            lastName: user.lastName,
            email: user.email,
            phone: user.phone,
            role: user.role,
            branch: user.branch,
            salary: user.salary,
            status: user.isActive ? "Active" : "Inactive"
        };

        const validBranch = (branch && mongoose.Types.ObjectId.isValid(branch)) ? branch : undefined;

        if (firstName !== undefined) user.firstName = firstName;
        if (lastName !== undefined) user.lastName = lastName;
        if (firstName !== undefined || lastName !== undefined) {
            user.name = `${firstName || user.firstName || ""} ${lastName || user.lastName || ""}`.trim();
        }
        if (email !== undefined) user.email = email.trim().toLowerCase();
        if (phone !== undefined) user.phone = phone;
        if (role !== undefined) user.role = role;
        if (branch !== undefined) user.branch = validBranch;
        if (salary !== undefined) user.salary = Number(salary);
        if (status !== undefined) user.isActive = (status === "Active");
        if (workingStatus !== undefined) user.workingStatus = workingStatus;
        
        const finalDate = joiningDate !== undefined ? joiningDate : hireDate;
        if (finalDate !== undefined) {
            user.joiningDate = finalDate ? new Date(finalDate) : null;
        }

        await user.save();

        const mappedEmployee = {
            _id: user._id,
            employeeId: user._id.toString(),
            firstName: user.firstName || user.name || "Unnamed",
            lastName: user.lastName || "",
            name: user.name || `${user.firstName || ""} ${user.lastName || ""}`.trim(),
            email: user.email,
            phone: user.phone || "No Phone",
            role: user.role || "user",
            branch: user.branch,
            status: user.isActive ? "Active" : "Inactive",
            salary: user.salary || 0,
            joiningDate: user.joiningDate || null,
            createdAt: user.createdAt,
            workingStatus: user.workingStatus || "Off Duty",
            performanceScore: user.performanceScore || 0.0
        };

        // ✅ Add Audit Log
        await AuditService.log({
            user: req.user,
            action: "UPDATE",
            module: "EMPLOYEE",
            req,
            status: "SUCCESS",
            resourceType: "Employee",
            resourceId: user._id,
            resourceName: mappedEmployee.name,
            previousValues: oldValues,
            newValues: {
                firstName: user.firstName,
                lastName: user.lastName,
                email: user.email,
                phone: user.phone,
                role: user.role,
                branch: user.branch,
                salary: user.salary,
                status: mappedEmployee.status
            },
            metadata: {
                employeeId: mappedEmployee.employeeId,
                updatedFields: Object.keys(req.body).filter(k => k !== 'photo')
            }
        });

        return res.status(200).json({
            success: true,
            employee: mappedEmployee,
            message: "Employee updated successfully"
        });
    } catch (error) {
        console.error("Update employee error:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to update employee details.",
            error: error.message
        });
    }
};

// @desc    Delete employee profile
// @route   DELETE /api/employees/:id
// @access  Public
const deleteEmployee = async (req, res) => {
    try {
        const user = await Employee.findById(req.params.id);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: "Employee not found."
            });
        }

        const employeeName = user.name || `${user.firstName || ""} ${user.lastName || ""}`.trim();
        const empIdStr = user._id.toString();

        // Delete user
        await user.deleteOne();

        // Cascade delete all associated logs (schedules, attendance, performance)
        await EmployeeSchedule.deleteMany({ employeeId: empIdStr });
        await EmployeeAttendance.deleteMany({ employeeId: empIdStr });
        await EmployeePerformance.deleteMany({ employeeId: empIdStr });

        // ✅ Add Audit Log
        await AuditService.log({
            user: req.user,
            action: "DELETE",
            module: "EMPLOYEE",
            req,
            status: "SUCCESS",
            resourceType: "Employee",
            resourceId: user._id,
            resourceName: employeeName,
            metadata: {
                employeeId: empIdStr,
                role: user.role
            }
        });

        return res.status(200).json({
            success: true,
            message: "Employee profile deleted successfully"
        });
    } catch (error) {
        console.error("Delete employee error:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to delete employee profile.",
            error: error.message
        });
    }
};

// ==========================================
// 📅 SHIFT SCHEDULES MANAGEMENT
// ==========================================

// @desc    Get all shift schedules
// @route   GET /api/employees/schedules
// @access  Public
const getSchedules = async (req, res) => {
    if (!isMongoConnected()) {
        return res.status(200).json({ success: true, schedules: [] });
    }
    try {
        const schedules = await EmployeeSchedule.find();
        return res.status(200).json({
            success: true,
            schedules
        });
    } catch (error) {
        console.error("Get schedules error:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to retrieve schedules.",
            error: error.message
        });
    }
};

// @desc    Save/Update a shift schedule
// @route   POST /api/employees/schedules
// @access  Public
const saveSchedule = async (req, res) => {
    try {
        const { employeeId, date, shift, notes } = req.body;

        if (!employeeId || !date || !shift) {
            return res.status(400).json({
                success: false,
                message: "EmployeeId, date, and shift role are required."
            });
        }

        // ✅ Fixed: new: true → returnDocument: 'after'
        const schedule = await EmployeeSchedule.findOneAndUpdate(
            { employeeId, date },
            { 
                employeeId, 
                date, 
                shift, 
                notes: notes || "" 
            },
            { 
                upsert: true,
                returnDocument: 'after',  // ✅ Fixed
                runValidators: true
            }
        );

        // ✅ Add Audit Log
        await AuditService.log({
            user: req.user,
            action: "UPDATE",
            module: "EMPLOYEE",
            req,
            status: "SUCCESS",
            resourceType: "Schedule",
            metadata: {
                employeeId,
                date,
                shift,
                notes
            }
        });

        return res.status(200).json({
            success: true,
            schedule,
            message: "Schedule updated successfully"
        });
    } catch (error) {
        console.error("Save schedule error:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to assign schedule.",
            error: error.message
        });
    }
};

// ==========================================
// ⏱️ ATTENDANCE LOGS MANAGEMENT
// ==========================================

// @desc    Get all attendance logs
// @route   GET /api/employees/attendance
// @access  Public
const getAttendance = async (req, res) => {
    if (!isMongoConnected()) {
        return res.status(200).json({ success: true, attendance: [] });
    }
    try {
        const attendance = await EmployeeAttendance.find().sort({ createdAt: -1 });
        return res.status(200).json({
            success: true,
            attendance
        });
    } catch (error) {
        console.error("Get attendance error:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to retrieve attendance logs.",
            error: error.message
        });
    }
};

// @desc    Log/Clock-in/out attendance
// @route   POST /api/employees/attendance
// @access  Public
const logAttendance = async (req, res) => {
    try {
        const { employeeId, date, clockIn, clockOut, status } = req.body;

        if (!employeeId || !date) {
            return res.status(400).json({
                success: false,
                message: "EmployeeId and date are required parameters."
            });
        }

        // Update employee working status
        let emp = await Employee.findById(employeeId);
        if (!emp) {
            emp = await Employee.findOne({ employeeId });
        }

        if (emp) {
            if (clockOut) {
                emp.workingStatus = "Off Duty";
            } else {
                emp.workingStatus = "Clocked In";
            }
            await emp.save();
        }

        // ✅ Fixed: new: true → returnDocument: 'after'
        const attendanceLog = await EmployeeAttendance.findOneAndUpdate(
            { employeeId, date },
            {
                employeeId,
                date,
                clockIn: clockIn || "",
                clockOut: clockOut || "",
                status: status || "Present"
            },
            {
                upsert: true,
                returnDocument: 'after',  // ✅ Fixed
                runValidators: true
            }
        );

        // ✅ Add Audit Log
        await AuditService.log({
            user: req.user,
            action: "UPDATE",
            module: "EMPLOYEE",
            req,
            status: "SUCCESS",
            resourceType: "Attendance",
            metadata: {
                employeeId,
                date,
                clockIn,
                clockOut,
                status
            }
        });

        return res.status(200).json({
            success: true,
            log: attendanceLog,
            message: "Attendance logged successfully"
        });
    } catch (error) {
        if (error.code === 11000) {
            return res.status(400).json({
                success: false,
                message: "Attendance record for this date already exists for the employee."
            });
        }
        console.error("Log attendance error:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to log attendance.",
            error: error.message
        });
    }
};

// ==========================================
// 📈 PERFORMANCE METRICS CENTER
// ==========================================

// @desc    Get performance scorecards
// @route   GET /api/employees/performance
// @access  Public
const getPerformanceMetrics = async (req, res) => {
    if (!isMongoConnected()) {
        return res.status(200).json({ success: true, performance: [] });
    }
    try {
        const performance = await EmployeePerformance.find();
        return res.status(200).json({
            success: true,
            performance
        });
    } catch (error) {
        console.error("Get performance metrics error:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to retrieve performance metrics.",
            error: error.message
        });
    }
};

// @desc    Submit score review and update average
// @route   POST /api/employees/performance
// @access  Public
const logPerformanceMetric = async (req, res) => {
    try {
        const {
            employeeId,
            punctuality,
            salesAchievement,
            customerRating,
            taskCompletion,
            date
        } = req.body;

        if (!employeeId || !date) {
            return res.status(400).json({
                success: false,
                message: "EmployeeId and date fields are required."
            });
        }

        // ✅ Fixed: new: true → returnDocument: 'after'
        const performance = await EmployeePerformance.findOneAndUpdate(
            { employeeId, date },
            {
                employeeId,
                punctuality: parseInt(punctuality),
                salesAchievement: parseInt(salesAchievement),
                customerRating: parseFloat(customerRating),
                taskCompletion: parseInt(taskCompletion),
                date
            },
            {
                upsert: true,
                returnDocument: 'after',  // ✅ Fixed
                runValidators: true
            }
        );

        // Recalculate average performanceScore for Employee
        let emp = await Employee.findById(employeeId);
        if (!emp) {
            emp = await Employee.findOne({ employeeId });
        }

        if (emp) {
            const allPerfs = await EmployeePerformance.find({ employeeId });
            const totalScore = allPerfs.reduce((acc, curr) => {
                const punctuality = typeof curr.punctuality === "number" ? curr.punctuality : 100;
                const salesAchievement = typeof curr.salesAchievement === "number" ? curr.salesAchievement : 100;
                const customerRating = typeof curr.customerRating === "number" ? curr.customerRating : 4.0;
                const taskCompletion = typeof curr.taskCompletion === "number" ? curr.taskCompletion : 100;
                const currScore = (punctuality + salesAchievement + (customerRating * 20) + taskCompletion) / 4 / 20;
                return acc + currScore;
            }, 0);
            const avgScore = allPerfs.length > 0 ? (totalScore / allPerfs.length) : 0.0;
            
            emp.performanceScore = isNaN(avgScore) ? 0.0 : parseFloat(avgScore.toFixed(2));
            await emp.save();
        }

        // ✅ Add Audit Log
        await AuditService.log({
            user: req.user,
            action: "UPDATE",
            module: "EMPLOYEE",
            req,
            status: "SUCCESS",
            resourceType: "Performance",
            metadata: {
                employeeId,
                punctuality,
                salesAchievement,
                customerRating,
                taskCompletion,
                date
            }
        });

        return res.status(200).json({
            success: true,
            performance,
            message: "Performance metrics updated"
        });
    } catch (error) {
        console.error("Log performance metric error:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to save performance rating scorecard.",
            error: error.message
        });
    }
};

// ==========================================
// 🚀 AUTO CLOCK-IN / CLOCK-OUT
// ==========================================

// @desc    Auto clock-in attendance upon login
// @route   POST /api/employees/attendance/auto-clock-in
// @access  Private
const autoClockIn = async (req, res) => {
    try {
        let employee = await Employee.findById(req.user._id);
        if (!employee) {
            return res.status(200).json({
                success: true,
                message: "User not found. Auto clock-in skipped."
            });
        }
        
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const localDateStr = `${year}-${month}-${day}`;
        
        let hours = now.getHours();
        const minutes = String(now.getMinutes()).padStart(2, '0');
        const ampm = hours >= 12 ? 'PM' : 'AM';
        hours = hours % 12;
        hours = hours ? hours : 12;
        const clockInTimeStr = `${String(hours).padStart(2, '0')}:${minutes} ${ampm}`;

        // ✅ Fixed: new: true → returnDocument: 'after'
        let attendanceRecord = await EmployeeAttendance.findOneAndUpdate(
            {
                employeeId: employee._id.toString(),
                date: localDateStr
            },
            {
                employeeId: employee._id.toString(),
                date: localDateStr,
                clockIn: clockInTimeStr,
                clockOut: "",
                status: "Present"
            },
            {
                upsert: true,
                returnDocument: 'after',  // ✅ Fixed
                runValidators: true
            }
        );

        // Update employee working status
        employee.workingStatus = "Clocked In";
        await employee.save();

        // ✅ Add Audit Log
        await AuditService.log({
            user: req.user,
            action: "LOGIN",
            module: "AUTH",
            req,
            status: "SUCCESS",
            resourceType: "Attendance",
            metadata: {
                employeeId: employee._id,
                date: localDateStr,
                clockIn: clockInTimeStr,
                status: "Present"
            },
            branch: employee.branch
        });

        return res.status(200).json({
            success: true,
            message: "Auto clock-in successful",
            attendance: attendanceRecord
        });
    } catch (error) {
        console.error("Auto clock-in error:", error);
        return res.status(500).json({
            success: false,
            message: "Auto clock-in failed.",
            error: error.message
        });
    }
};

// @desc    Auto clock-out attendance upon logout
// @route   POST /api/employees/attendance/auto-clock-out
// @access  Private
const autoClockOut = async (req, res) => {
    try {
        let employee = await Employee.findById(req.user._id);
        if (!employee) {
            return res.status(200).json({
                success: true,
                message: "User not found. Auto clock-out skipped."
            });
        }
        
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const localDateStr = `${year}-${month}-${day}`;
        
        let hours = now.getHours();
        const minutes = String(now.getMinutes()).padStart(2, '0');
        const ampm = hours >= 12 ? 'PM' : 'AM';
        hours = hours % 12;
        hours = hours ? hours : 12;
        const clockOutTimeStr = `${String(hours).padStart(2, '0')}:${minutes} ${ampm}`;

        let attendanceRecord = await EmployeeAttendance.findOne({
            employeeId: employee._id.toString(),
            date: localDateStr
        });

        if (attendanceRecord) {
            // ✅ Fixed: new: true → returnDocument: 'after'
            attendanceRecord = await EmployeeAttendance.findOneAndUpdate(
                {
                    employeeId: employee._id.toString(),
                    date: localDateStr
                },
                {
                    $set: { clockOut: clockOutTimeStr }
                },
                {
                    returnDocument: 'after',  // ✅ Fixed
                    runValidators: true
                }
            );
            
            employee.workingStatus = "Off Duty";
            await employee.save();
        } else {
            // Try to find latest open record
            const latestOpenRecord = await EmployeeAttendance.findOne({
                employeeId: employee._id.toString(),
                clockOut: ""
            }).sort({ createdAt: -1 });

            if (latestOpenRecord) {
                // ✅ Fixed: new: true → returnDocument: 'after'
                await EmployeeAttendance.findOneAndUpdate(
                    { _id: latestOpenRecord._id },
                    { $set: { clockOut: clockOutTimeStr } },
                    { 
                        returnDocument: 'after',  // ✅ Fixed
                        runValidators: true 
                    }
                );
            } else {
                await EmployeeAttendance.create({
                    employeeId: employee._id.toString(),
                    date: localDateStr,
                    clockIn: "",
                    clockOut: clockOutTimeStr,
                    status: "Present"
                });
            }
            
            employee.workingStatus = "Off Duty";
            await employee.save();
        }

        // ✅ Add Audit Log
        await AuditService.log({
            user: req.user,
            action: "LOGOUT",
            module: "AUTH",
            req,
            status: "SUCCESS",
            resourceType: "Attendance",
            metadata: {
                employeeId: employee._id,
                date: localDateStr,
                clockOut: clockOutTimeStr
            },
            branch: employee.branch
        });

        return res.status(200).json({
            success: true,
            message: "Auto clock-out successful"
        });
    } catch (error) {
        console.error("Auto clock-out error:", error);
        return res.status(500).json({
            success: false,
            message: "Auto clock-out failed.",
            error: error.message
        });
    }
};

// ==========================================
// 📤 EXPORT MODULE
// ==========================================

module.exports = {
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
};