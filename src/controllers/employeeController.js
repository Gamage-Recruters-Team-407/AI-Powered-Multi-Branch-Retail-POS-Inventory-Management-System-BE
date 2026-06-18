const mongoose = require("mongoose");
const Employee = require("../models/Employee");
const User = require("../models/User");
const EmployeeSchedule = require("../models/EmployeeSchedule");
const EmployeeAttendance = require("../models/EmployeeAttendance");
const EmployeePerformance = require("../models/EmployeePerformance");
const systemEvents = require("../events/eventBus");
const cloudinary = require("../config/cloudinary");
const { isMongoConnected } = require("../middleware/requireMongoConnection");
const fs = require("fs");
const path = require("path");

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
        return res.status(200).json({
            success: true,
            employee
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
        if (!firstName || !lastName || !email || !phone) {
            return res.status(400).json({
                success: false,
                message: "First name, last name, email, and phone number are required."
            });
        }

        const emailClean = email.trim().toLowerCase();

        // Check for existing employee/user with same email
        const existingUser = await User.findOne({ email: emailClean });
        const existingEmp = await Employee.findOne({ email: emailClean });
        if (existingUser || existingEmp) {
            return res.status(400).json({
                success: false,
                message: "An employee with this email address is already registered."
            });
        }

        // Validate names
        const nameRegex = /^[a-zA-Z\s\-']{2,50}$/;
        if (!nameRegex.test(firstName.trim()) || !nameRegex.test(lastName.trim())) {
            return res.status(400).json({
                success: false,
                message: "First name and last name must be 2-50 characters and contain only letters."
            });
        }

        // Validate email
        const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
        if (!emailRegex.test(emailClean)) {
            return res.status(400).json({
                success: false,
                message: "Please provide a valid email address."
            });
        }

        // Validate phone number
        const cleanPhone = phone.replace(/[\s\-\(\)]/g, "");
        if (!/^(?:\+94|0)?7[0-9]{8}$/.test(cleanPhone)) {
            return res.status(400).json({
                success: false,
                message: "Please provide a valid Sri Lankan mobile number."
            });
        }

        // Validate salary
        if (salary !== undefined && Number(salary) <= 0) {
            return res.status(400).json({
                success: false,
                message: "Salary must be a positive number above 0."
            });
        }

        // Validate hire date
        if (hireDate) {
            const inputDate = new Date(hireDate);
            if (isNaN(inputDate.getTime())) {
                return res.status(400).json({
                    success: false,
                    message: "Hire date must be a valid date."
                });
            }
        }

        // Validate photo URL (only if no file was uploaded)
        if (!req.file && photo && photo.trim()) {
            const isDataUri = photo.trim().startsWith('data:image/');
            const urlRegex = /^(https?:\/\/|\/?uploads\/).*\.(?:png|jpg|jpeg|gif|webp)/i;
            if (!isDataUri && !urlRegex.test(photo.trim())) {
                return res.status(400).json({
                    success: false,
                    message: "Photo must be a valid image URL (ending in .png, .jpg, .jpeg, or .webp) or relative path."
                });
            }
        }

        let imageUrl = "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150&h=150&fit=crop";

        if (req.file) {
            const base64Image = req.file.buffer.toString("base64");
            const dataURI = `data:${req.file.mimetype};base64,${base64Image}`;

            if (process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_CLOUD_NAME) {
                try {
                    const uploadedImage = await cloudinary.uploader.upload(dataURI, {
                        folder: "retail_pos_employees"
                    });
                    imageUrl = uploadedImage.secure_url;
                } catch (uploadErr) {
                    console.error("Cloudinary upload failed, falling back to local file storage:", uploadErr.message);
                    imageUrl = saveLocalFile(req);
                }
            } else {
                console.log("Cloudinary credentials not configured. Saving to local file storage fallback.");
                imageUrl = saveLocalFile(req);
            }
        } else if (photo && photo.trim()) {
            imageUrl = photo;
        }

        const validBranch = (branch && mongoose.Types.ObjectId.isValid(branch)) ? branch : undefined;

        // Step 1: Create corresponding User login record
        const newAuthUser = await User.create({
            firstName,
            lastName,
            name: `${firstName} ${lastName}`.trim(),
            email: emailClean,
            password: "tempPassword123", // Default login password
            phone,
            role: role ? role.toUpperCase() : "CASHIER",
            branch: validBranch,
            isActive: true
        });

        // Generate unique employee ID
        const employeeId = `EMP-${Date.now().toString().slice(-6)}`;

        // Step 2: Create Employee record linked to User
        const newEmployee = await Employee.create({
            user: newAuthUser._id,
            employeeId,
            firstName,
            lastName,
            email: emailClean,
            phone,
            role: role ? role.toUpperCase() : "CASHIER",
            salary: salary || 40000,
            branch: validBranch,
            joiningDate: hireDate || new Date(),
            photo: imageUrl,
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
            target: { role: 'Admin' },
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

        const validBranch = (branch && mongoose.Types.ObjectId.isValid(branch)) ? branch : undefined;

        // Validate updates if provided
        const nameRegex = /^[a-zA-Z\s\-']{2,50}$/;
        if (firstName !== undefined && !nameRegex.test(firstName.trim())) {
            return res.status(400).json({
                success: false,
                message: "First name must be 2-50 characters and contain only letters."
            });
        }
        if (lastName !== undefined && !nameRegex.test(lastName.trim())) {
            return res.status(400).json({
                success: false,
                message: "Last name must be 2-50 characters and contain only letters."
            });
        }
        if (email !== undefined) {
            const emailClean = email.trim().toLowerCase();
            const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
            if (!emailRegex.test(emailClean)) {
                return res.status(400).json({
                    success: false,
                    message: "Please provide a valid email address."
                });
            }

            const existingUser = await User.findOne({ 
                email: emailClean, 
                _id: { $ne: employee.user } 
            });
            const existingEmp = await Employee.findOne({ 
                email: emailClean, 
                _id: { $ne: employee._id } 
            });
            if (existingUser || existingEmp) {
                return res.status(400).json({
                    success: false,
                    message: "An employee with this email address is already registered."
                });
            }
        }
        if (phone !== undefined) {
            const cleanPhone = phone.replace(/[\s\-\(\)]/g, "");
            if (!/^(?:\+94|0)?7[0-9]{8}$/.test(cleanPhone)) {
                return res.status(400).json({
                    success: false,
                    message: "Please provide a valid Sri Lankan mobile number."
                });
            }
        }
        if (salary !== undefined && Number(salary) <= 0) {
            return res.status(400).json({
                success: false,
                message: "Salary must be a positive number above 0."
            });
        }
        if (hireDate !== undefined) {
            const inputDate = new Date(hireDate);
            if (isNaN(inputDate.getTime())) {
                return res.status(400).json({
                    success: false,
                    message: "Hire date must be a valid date."
                });
            }
        }

        // Validate photo URL (only if no file was uploaded)
        if (!req.file && photo !== undefined && photo.trim()) {
            const isDataUri = photo.trim().startsWith('data:image/');
            const urlRegex = /^(https?:\/\/|\/?uploads\/).*\.(?:png|jpg|jpeg|gif|webp)/i;
            if (!isDataUri && !urlRegex.test(photo.trim())) {
                return res.status(400).json({
                    success: false,
                    message: "Photo must be a valid image URL (ending in .png, .jpg, .jpeg, or .webp) or relative path."
                });
            }
        }

        let imageUrl = employee.photo;

        if (req.file) {
            const base64Image = req.file.buffer.toString("base64");
            const dataURI = `data:${req.file.mimetype};base64,${base64Image}`;

            if (process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_CLOUD_NAME) {
                try {
                    const uploadedImage = await cloudinary.uploader.upload(dataURI, {
                        folder: "retail_pos_employees"
                    });
                    imageUrl = uploadedImage.secure_url;
                } catch (uploadErr) {
                    console.error("Cloudinary upload failed, falling back to local file storage:", uploadErr.message);
                    imageUrl = saveLocalFile(req);
                }
            } else {
                console.log("Cloudinary credentials not configured. Saving to local file storage fallback.");
                imageUrl = saveLocalFile(req);
            }
        } else if (photo !== undefined) {
            imageUrl = photo;
        }

        // Step 1: Update corresponding User login credentials
        if (employee.user) {
            const authUser = await User.findById(employee.user);
            if (authUser) {
                if (firstName !== undefined) authUser.firstName = firstName;
                if (lastName !== undefined) authUser.lastName = lastName;
                if (firstName !== undefined || lastName !== undefined) {
                    authUser.name = `${firstName || authUser.firstName} ${lastName || authUser.lastName}`.trim();
                }
                if (email !== undefined) authUser.email = email.trim().toLowerCase();
                if (phone !== undefined) authUser.phone = phone;
                if (role !== undefined) authUser.role = role.toUpperCase();
                if (branch !== undefined) authUser.branch = validBranch;
                if (status !== undefined) authUser.isActive = (status === "Active");
                await authUser.save();
            }
        }

        // Step 2: Update Employee profile details
        if (firstName !== undefined) employee.firstName = firstName;
        if (lastName !== undefined) employee.lastName = lastName;
        if (email !== undefined) employee.email = email.trim().toLowerCase();
        if (phone !== undefined) employee.phone = phone;
        if (role !== undefined) employee.role = role.toUpperCase();
        if (branch !== undefined) employee.branch = validBranch;
        if (salary !== undefined) employee.salary = salary;
        if (hireDate !== undefined) employee.joiningDate = hireDate;
        employee.photo = imageUrl;

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

        // Step 1: Delete corresponding User login record
        if (employee.user) {
            await User.findByIdAndDelete(employee.user);
        }

        // Step 2: Cascade delete all associated logs (schedules, attendance, performance)
        const empIdStr = employee._id.toString();
        await EmployeeSchedule.deleteMany({ employeeId: empIdStr });
        await EmployeeAttendance.deleteMany({ employeeId: empIdStr });
        await EmployeePerformance.deleteMany({ employeeId: empIdStr });

        // Step 3: Delete Employee record
        await employee.deleteOne();

        // Trigger a notification
        systemEvents.emit('SEND_ALERT', {
            target: { role: 'Admin' },
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
        if (error.code === 11000) {
            return res.status(400).json({
                success: false,
                message: "Attendance record for this date already exists for the employee."
            });
        }
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
                const punctuality = typeof curr.punctuality === "number" ? curr.punctuality : 100;
                const salesAchievement = typeof curr.salesAchievement === "number" ? curr.salesAchievement : 100;
                const customerRating = typeof curr.customerRating === "number" ? curr.customerRating : 4.0;
                const taskCompletion = typeof curr.taskCompletion === "number" ? curr.taskCompletion : 100;
                const currScore = (punctuality + salesAchievement + (customerRating * 20) + taskCompletion) / 4 / 20;
                return acc + currScore;
            }, 0);
            const avgScore = allPerfs.length > 0 ? (totalScore / allPerfs.length) : 4.0;
            
            emp.performanceScore = isNaN(avgScore) ? 4.0 : parseFloat(avgScore.toFixed(2));
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

// @desc    Auto clock-in attendance upon login
// @route   POST /api/employees/attendance/auto-clock-in
// @access  Private
const autoClockIn = async (req, res) => {
    try {
        const employee = await Employee.findOne({ user: req.user._id });
        if (!employee) {
            return res.status(200).json({
                success: true,
                message: "User is not registered in the employee directory. Auto clock-in skipped."
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

        let attendanceRecord = await EmployeeAttendance.findOne({
            employeeId: employee._id.toString(),
            date: localDateStr
        });

        if (!attendanceRecord) {
            attendanceRecord = await EmployeeAttendance.create({
                employeeId: employee._id.toString(),
                date: localDateStr,
                clockIn: clockInTimeStr,
                clockOut: "",
                status: "Present"
            });
            
            employee.workingStatus = "Clocked In";
            
            const dateObj = new Date(localDateStr);
            const attendanceExistsInEmployee = employee.attendance.some(a => {
                if (!a.date) return false;
                try {
                    const d = a.date instanceof Date ? a.date : new Date(a.date);
                    return !isNaN(d.getTime()) && d.toISOString().split('T')[0] === localDateStr;
                } catch (e) {
                    return false;
                }
            });
            if (!attendanceExistsInEmployee) {
                employee.attendance.push({
                    date: dateObj,
                    status: "Present"
                });
            }
            await employee.save();
        } else {
            if (employee.workingStatus !== "Clocked In" && !attendanceRecord.clockOut) {
                employee.workingStatus = "Clocked In";
                await employee.save();
            }
        }

        return res.status(200).json({
            success: true,
            message: "Auto clock-in successful",
            attendance: attendanceRecord
        });
    } catch (error) {
        if (error.code === 11000) {
            try {
                const employee = await Employee.findOne({ user: req.user._id });
                if (employee) {
                    const now = new Date();
                    const year = now.getFullYear();
                    const month = String(now.getMonth() + 1).padStart(2, '0');
                    const day = String(now.getDate()).padStart(2, '0');
                    const localDateStr = `${year}-${month}-${day}`;
                    const existingRecord = await EmployeeAttendance.findOne({
                        employeeId: employee._id.toString(),
                        date: localDateStr
                    });
                    if (existingRecord) {
                        return res.status(200).json({
                            success: true,
                            message: "Auto clock-in successful (resolved parallel request)",
                            attendance: existingRecord
                        });
                    }
                }
            } catch (findErr) {
                console.error("Error retrieving existing record on duplicate key:", findErr.message);
            }
        }
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
        const employee = await Employee.findOne({ user: req.user._id });
        if (!employee) {
            return res.status(200).json({
                success: true,
                message: "User is not registered in the employee directory. Auto clock-out skipped."
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
            attendanceRecord.clockOut = clockOutTimeStr;
            await attendanceRecord.save();
            
            employee.workingStatus = "Off Duty";
            await employee.save();
        } else {
            const latestOpenRecord = await EmployeeAttendance.findOne({
                employeeId: employee._id.toString(),
                clockOut: ""
            }).sort({ createdAt: -1 });

            if (latestOpenRecord) {
                latestOpenRecord.clockOut = clockOutTimeStr;
                await latestOpenRecord.save();
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

        return res.status(200).json({
            success: true,
            message: "Auto clock-out successful"
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: "Auto clock-out failed.",
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
    logPerformanceMetric,
    autoClockIn,
    autoClockOut
};
