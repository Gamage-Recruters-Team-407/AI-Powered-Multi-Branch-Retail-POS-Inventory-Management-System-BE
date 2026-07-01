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
        const employees = await Employee.find().populate('branch', 'name');

        const roleOrder = {
            'admin': 1,
            'manager': 2,
            'cashier': 3
        };

        const sortedEmployees = employees.sort((a, b) => {
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

        // Check for existing employee with same email
        const existingEmp = await Employee.findOne({ email: emailClean });
        if (existingEmp) {
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

        let branchName = "";
        if (validBranch) {
            const branchDoc = await Branch.findById(validBranch);
            branchName = branchDoc ? branchDoc.name : "";
        }

        // Define the role to use (defaults to input or CASHIER)
        let employeeRole = role ? role.toUpperCase() : "CASHIER";

        // Step 1: Fetch corresponding User login record or create one if it doesn't exist
        let authUser = await User.findOne({ email: emailClean });
        if (!authUser) {
            authUser = await User.create({
                firstName,
                lastName,
                name: `${firstName} ${lastName}`.trim(),
                email: emailClean,
                password: "tempPassword123", // Default login password
                phone,
                role: employeeRole,
                branch: validBranch,
                isActive: true
            });
        } else {
            // Fix: Prioritize and keep the existing user's role (do not demote them)
            employeeRole = authUser.role || employeeRole;
            
            // Only update branch if provided
            if (validBranch) authUser.branch = validBranch;
            await authUser.save();
        }

        // Generate unique employee ID
        const employeeId = `EMP-${Date.now().toString().slice(-6)}`;

        // Step 2: Create Employee record linked to User
        const newEmployee = await Employee.create({
            user: authUser._id,
            employeeId,
            firstName,
            lastName,
            email: emailClean,
            phone,
            role: employeeRole,
            salary: salary || 40000,
            branch: validBranch,
            branchName: branchName, 
            joiningDate: hireDate || new Date(),
            photo: imageUrl,
            status: "Active",
            performanceScore: 0.0,
            workingStatus: "Off Duty"
        });



        // ✅ Add Audit Log
        await AuditService.log({
            user: req.user || authUser,
            action: "CREATE",
            module: "EMPLOYEE",
            req,
            status: "SUCCESS",
            resourceType: "Employee",
            resourceId: newEmployee._id,
            resourceName: `${firstName} ${lastName}`,
            metadata: {
                employeeId: newEmployee.employeeId,
                role: employeeRole,
                branch: branchName
            },
            branch: validBranch,
            branchName: branchName,
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

        // Save old values for audit
        const oldValues = {
            firstName: employee.firstName,
            lastName: employee.lastName,
            email: employee.email,
            phone: employee.phone,
            role: employee.role,
            branch: employee.branch,
            salary: employee.salary,
            status: employee.status
        };

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

        if (branch !== undefined) {
            employee.branch = validBranch;
            if (validBranch) {
                const branchDoc = await Branch.findById(validBranch);
                employee.branchName = branchDoc ? branchDoc.name : "";
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

        // ✅ Add Audit Log
        await AuditService.log({
            user: req.user,
            action: "UPDATE",
            module: "EMPLOYEE",
            req,
            status: "SUCCESS",
            resourceType: "Employee",
            resourceId: updatedEmployee._id,
            resourceName: `${updatedEmployee.firstName} ${updatedEmployee.lastName}`,
            previousValues: oldValues,
            newValues: {
                firstName: updatedEmployee.firstName,
                lastName: updatedEmployee.lastName,
                email: updatedEmployee.email,
                phone: updatedEmployee.phone,
                role: updatedEmployee.role,
                branch: updatedEmployee.branch,
                salary: updatedEmployee.salary,
                status: updatedEmployee.status
            },
            metadata: {
                employeeId: updatedEmployee.employeeId,
                updatedFields: Object.keys(req.body).filter(k => k !== 'photo')
            },
            branch: updatedEmployee.branch,
            branchName: updatedEmployee.branchName,
        });

        return res.status(200).json({
            success: true,
            employee: updatedEmployee,
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

        const employeeName = `${employee.firstName} ${employee.lastName}`;
        const employeeId = employee.employeeId;

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

        // ✅ Add Audit Log
        await AuditService.log({
            user: req.user,
            action: "DELETE",
            module: "EMPLOYEE",
            req,
            status: "SUCCESS",
            resourceType: "Employee",
            resourceId: employee._id,
            resourceName: employeeName,
            metadata: {
                employeeId: employeeId,
                role: employee.role,
                branch: employee.branchName
            },
            branch: employee.branch,
            branchName: employee.branchName,
        });

        // Trigger a notification
        systemEvents.emit('SEND_ALERT', {
            target: { role: 'Admin' },
            category: 'SECURITY',
            type: 'WARNING',
            title: 'Employee Terminated',
            message: `Employee ${employeeName} (${employeeId}) has been removed from the system.`,
            channels: ['in-app', 'email']
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
        let employee = await Employee.findOne({ user: req.user._id });
        if (!employee && req.user.email) {
            employee = await Employee.findOne({ email: req.user.email.trim().toLowerCase() });
            if (employee) {
                employee.user = req.user._id;
                await employee.save();
                console.log(`🔧 Self-healed User-Employee relationship for ${employee.email}`);
            }
        }
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
        
        // Add to attendance array if not exists
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
            branch: employee.branch,
            branchName: employee.branchName,
        });

        return res.status(200).json({
            success: true,
            message: "Auto clock-in successful",
            attendance: attendanceRecord
        });
    } catch (error) {
        // Handle duplicate key error gracefully
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
        let employee = await Employee.findOne({ user: req.user._id });
        if (!employee && req.user.email) {
            employee = await Employee.findOne({ email: req.user.email.trim().toLowerCase() });
            if (employee) {
                employee.user = req.user._id;
                await employee.save();
                console.log(`🔧 Self-healed User-Employee relationship for ${employee.email}`);
            }
        }
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
            branch: employee.branch,
            branchName: employee.branchName,
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