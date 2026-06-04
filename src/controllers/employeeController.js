const Employee = require("../models/Employee");
const EmployeeSchedule = require("../models/EmployeeSchedule");
const EmployeeAttendance = require("../models/EmployeeAttendance");
const EmployeePerformance = require("../models/EmployeePerformance");
const systemEvents = require("../events/eventBus");

// ==========================================
// 👥 EMPLOYEE CRUD OPERATIONS
// ==========================================

// @desc    Get all employees
// @route   GET /api/employees
// @access  Public (or Private with protect)
const getAllEmployees = async (req, res) => {
    try {
        const employees = await Employee.find();
        return res.status(200).json({
            success: true,
            employees
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
        const employee = await Employee.findById(req.params.id);
        if (!employee) {
            return res.status(404).json({
                success: false,
                message: "Employee not found."
            });
        }
        return res.status(200).json({
            success: true,
            employee
        });
    } catch (error) {
        // Fallback search by employeeId custom string if query isn't ObjectId formatted
        try {
            const employee = await Employee.findOne({ employeeId: req.params.id });
            if (employee) {
                return res.status(200).json({
                    success: true,
                    employee
                });
            }
        } catch (innerErr) {}

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
    try {
        const {
            firstName,
            lastName,
            email,
            phone,
            role,
            branch,
            salary,
            hireDate,
            photo
        } = req.body;

        // Validation
        if (!firstName || !lastName || !email) {
            return res.status(400).json({
                success: false,
                message: "First name, last name, and email are required."
            });
        }

        // Generate unique employee ID
        const employeeId = `EMP-${Date.now().toString().slice(-6)}`;

        const newEmployee = await Employee.create({
            employeeId,
            firstName,
            lastName,
            email,
            phone,
            role,
            salary: salary || 40000,
            branch: branch || "1",
            joiningDate: hireDate || new Date(),
            photo: photo || "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150&h=150&fit=crop",
            status: "Active",
            performanceScore: 4.0,
            workingStatus: "Off Duty"
        });

        // Initialize default performance metric record
        const currentMonth = new Date().toISOString().substring(0, 7);
        await EmployeePerformance.create({
            employeeId: newEmployee._id.toString(),
            punctuality: 100,
            salesAchievement: 100,
            customerRating: 4.0,
            taskCompletion: 100,
            date: currentMonth
        });

        // Trigger a notification
        systemEvents.emit('SEND_ALERT', {
            target: { role: 'Admin' }, // Send to all Admins
            category: 'EMPLOYEE',
            type: 'INFO',
            title: 'New Employee Hired',
            message: `${firstName} ${lastName} has been hired as a ${role} at Branch ${branch}.`,
            channels: ['in-app', 'email']
        });

        return res.status(201).json({
            success: true,
            employee: newEmployee,
            message: "Employee registered successfully"
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: "Failed to register employee.",
            error: error.message
        });
    }
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
            hireDate,
            photo,
            status,
            workingStatus
        } = req.body;

        let employee = await Employee.findById(req.params.id);
        
        // Fallback for custom string employee IDs
        if (!employee) {
            employee = await Employee.findOne({ employeeId: req.params.id });
        }

        if (!employee) {
            return res.status(404).json({
                success: false,
                message: "Employee not found."
            });
        }

        if (firstName !== undefined) employee.firstName = firstName;
        if (lastName !== undefined) employee.lastName = lastName;
        if (email !== undefined) employee.email = email;
        if (phone !== undefined) employee.phone = phone;
        if (role !== undefined) employee.role = role;
        if (branch !== undefined) employee.branch = branch;
        if (salary !== undefined) employee.salary = salary;
        if (hireDate !== undefined) employee.joiningDate = hireDate;
        if (photo !== undefined) employee.photo = photo;
        if (status !== undefined) employee.status = status;
        if (workingStatus !== undefined) employee.workingStatus = workingStatus;

        const updatedEmployee = await employee.save();

        return res.status(200).json({
            success: true,
            employee: updatedEmployee,
            message: "Employee updated successfully"
        });
    } catch (error) {
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
        let employee = await Employee.findById(req.params.id);

        if (!employee) {
            employee = await Employee.findOne({ employeeId: req.params.id });
        }

        if (!employee) {
            return res.status(404).json({
                success: false,
                message: "Employee not found."
            });
        }

        await employee.deleteOne();

        // Trigger a notification
        systemEvents.emit('SEND_ALERT', {
            target: { role: 'Admin' }, // Send to all Admins
            category: 'SECURITY',
            type: 'WARNING',
            title: 'Employee Terminated',
            message: `Employee ${employee.firstName} ${employee.lastName} (${employee.employeeId}) has been removed from the system.`,
            channels: ['in-app', 'email']
        });

        return res.status(200).json({
            success: true,
            message: "Employee profile deleted successfully"
        });
    } catch (error) {
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
    try {
        const schedules = await EmployeeSchedule.find();
        return res.status(200).json({
            success: true,
            schedules
        });
    } catch (error) {
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

        // Delete existing schedule for same employee and date if present (upsert behaviour)
        await EmployeeSchedule.findOneAndDelete({ employeeId, date });

        const newSchedule = await EmployeeSchedule.create({
            employeeId,
            date,
            shift,
            notes: notes || ""
        });

        return res.status(200).json({
            success: true,
            schedule: newSchedule,
            message: "Schedule updated successfully"
        });
    } catch (error) {
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
    try {
        const attendance = await EmployeeAttendance.find().sort({ createdAt: -1 });
        return res.status(200).json({
            success: true,
            attendance
        });
    } catch (error) {
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

        // Create new log record
        const newLog = await EmployeeAttendance.create({
            employeeId,
            date,
            clockIn: clockIn || "",
            clockOut: clockOut || "",
            status: status || "Present"
        });

        return res.status(200).json({
            success: true,
            log: newLog,
            message: "Attendance logged successfully"
        });
    } catch (error) {
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
    try {
        const performance = await EmployeePerformance.find();
        return res.status(200).json({
            success: true,
            performance
        });
    } catch (error) {
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

        const newPerf = await EmployeePerformance.create({
            employeeId,
            punctuality: parseInt(punctuality),
            salesAchievement: parseInt(salesAchievement),
            customerRating: parseFloat(customerRating),
            taskCompletion: parseInt(taskCompletion),
            date
        });

        // Recalculate average performanceScore for Employee
        let emp = await Employee.findById(employeeId);
        if (!emp) {
            emp = await Employee.findOne({ employeeId });
        }

        if (emp) {
            const allPerfs = await EmployeePerformance.find({ employeeId });
            const totalScore = allPerfs.reduce((acc, curr) => {
                // Formula: Convert customerRating back to 0-100 scale, average all, then map to 0-5 stars
                const currScore = (curr.punctuality + curr.salesAchievement + (curr.customerRating * 20) + curr.taskCompletion) / 4 / 20;
                return acc + currScore;
            }, 0);
            const avgScore = totalScore / allPerfs.length;
            
            emp.performanceScore = parseFloat(avgScore.toFixed(2));
            await emp.save();
        }

        return res.status(200).json({
            success: true,
            performance: newPerf,
            message: "Performance metrics updated"
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: "Failed to save performance rating scorecard.",
            error: error.message
        });
    }
};

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
    logPerformanceMetric
};
