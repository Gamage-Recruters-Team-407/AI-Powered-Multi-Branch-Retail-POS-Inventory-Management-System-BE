const mongoose = require("mongoose");
const Employee = require("../models/Employee");
const User = require("../models/User");
const EmployeeSchedule = require("../models/EmployeeSchedule");
const EmployeeAttendance = require("../models/EmployeeAttendance");
const EmployeePerformance = require("../models/EmployeePerformance");

const seedEmployees = async () => {
    try {
        // Step 1: Migrate/link any legacy employee documents that don't have a linked user reference
        const legacyEmps = await Employee.find({ $or: [{ user: { $exists: false } }, { user: null }] });
        if (legacyEmps.length > 0) {
            console.log(`🔧 Found ${legacyEmps.length} legacy employees without user references. Running migration...`);
            for (const emp of legacyEmps) {
                if (!emp.email) continue;
                const emailClean = emp.email.trim().toLowerCase();
                const validBranch = (emp.branch && mongoose.Types.ObjectId.isValid(emp.branch)) ? emp.branch : undefined;
                emp.branch = validBranch;

                let authUser = await User.findOne({ email: emailClean });
                if (!authUser) {
                    authUser = await User.create({
                        firstName: emp.firstName,
                        lastName: emp.lastName,
                        name: `${emp.firstName} ${emp.lastName}`.trim(),
                        email: emailClean,
                        password: "password123",
                        phone: emp.phone,
                        role: emp.role ? emp.role.toUpperCase() : "CASHIER",
                        branch: validBranch,
                        isActive: emp.status === "Active"
                    });
                    console.log(`  Created new auth user for ${emp.firstName} ${emp.lastName}`);
                }
                emp.user = authUser._id;
                await emp.save();
                console.log(`  Linked employee ${emp.firstName} ${emp.lastName} to user ${authUser._id}`);
            }
        }

        const count = await Employee.countDocuments();
        if (count > 0) {
            console.log("ℹ️ Employees database already has records. Skipping seeding.");
            return;
        }

        console.log("🌱 Seeding Employees and corresponding Users database...");

        const initialEmployees = [
            {
                employeeId: "EMP-000001",
                firstName: "Nimal",
                lastName: "Perera",
                email: "nimal.p@pos.com",
                phone: "+94 77 123 4567",
                role: "manager",
                branch: "6a1f169080d2295486a83fb5",
                status: "Active",
                salary: 75000,
                joiningDate: new Date("2024-01-15"),
                photo: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&h=150&fit=crop",
                performanceScore: 4.8,
                workingStatus: "Off Duty"
            },
            {
                employeeId: "EMP-000002",
                firstName: "Kasun",
                lastName: "Jayawardena",
                email: "kasun.j@pos.com",
                phone: "+94 71 987 6543",
                role: "cashier",
                branch: "6a1f169080d2295486a83fb5",
                status: "Active",
                salary: 45000,
                joiningDate: new Date("2024-03-10"),
                photo: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&h=150&fit=crop",
                performanceScore: 4.2,
                workingStatus: "Off Duty"
            },
            {
                employeeId: "EMP-000003",
                firstName: "Sunil",
                lastName: "Fernando",
                email: "sunil.f@pos.com",
                phone: "+94 75 444 5555",
                role: "cashier",
                branch: "6a1f169080d2295486a83fb6",
                status: "Active",
                salary: 48000,
                joiningDate: new Date("2024-02-01"),
                photo: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&h=150&fit=crop",
                performanceScore: 4.5,
                workingStatus: "Off Duty"
            },
            {
                employeeId: "EMP-000004",
                firstName: "Priya",
                lastName: "Silva",
                email: "priya.s@pos.com",
                phone: "+94 72 222 3333",
                role: "cashier",
                branch: "6a1fbd701bb175c7da693d76",
                status: "Active",
                salary: 43000,
                joiningDate: new Date("2024-05-18"),
                photo: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&h=150&fit=crop",
                performanceScore: 3.9,
                workingStatus: "Off Duty"
            },
            {
                employeeId: "EMP-000005",
                firstName: "Amara",
                lastName: "Dias",
                email: "amara.d@pos.com",
                phone: "+94 77 999 8888",
                role: "admin",
                branch: "6a1f169080d2295486a83fb5",
                status: "Active",
                salary: 95000,
                joiningDate: new Date("2023-08-01"),
                photo: "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=150&h=150&fit=crop",
                performanceScore: 4.9,
                workingStatus: "Off Duty"
            }
        ];

        const createdEmployees = [];
        for (const empData of initialEmployees) {
            // Check if User already exists with this email
            let authUser = await User.findOne({ email: empData.email });
            if (!authUser) {
                authUser = await User.create({
                    firstName: empData.firstName,
                    lastName: empData.lastName,
                    name: `${empData.firstName} ${empData.lastName}`.trim(),
                    email: empData.email,
                    password: "password123", // default password for seeded test staff
                    phone: empData.phone,
                    role: empData.role.toUpperCase(),
                    branch: empData.branch,
                    isActive: empData.status === "Active"
                });
            }

            const emp = await Employee.create({
                user: authUser._id,
                employeeId: empData.employeeId,
                firstName: empData.firstName,
                lastName: empData.lastName,
                email: empData.email,
                phone: empData.phone,
                role: empData.role.toUpperCase(),
                salary: empData.salary,
                branch: empData.branch,
                joiningDate: empData.joiningDate,
                photo: empData.photo,
                status: empData.status,
                performanceScore: empData.performanceScore,
                workingStatus: empData.workingStatus
            });
            createdEmployees.push(emp);
        }
        console.log(`✅ Seeded ${createdEmployees.length} employees and corresponding auth users.`);

        const getEmpId = (firstName) => {
            const emp = createdEmployees.find(e => e.firstName === firstName);
            return emp ? emp._id.toString() : null;
        };

        // Clear existing schedules/attendance/performance to re-seed cleanly
        await EmployeeSchedule.deleteMany({});
        await EmployeeAttendance.deleteMany({});
        await EmployeePerformance.deleteMany({});

        const initialSchedules = [
            { employeeId: getEmpId("Nimal"), date: "2026-06-03", shift: "Morning", notes: "Opening manager" },
            { employeeId: getEmpId("Kasun"), date: "2026-06-03", shift: "Morning", notes: "Register 1" },
            { employeeId: getEmpId("Sunil"), date: "2026-06-03", shift: "Evening", notes: "Receiving stock" },
            { employeeId: getEmpId("Priya"), date: "2026-06-03", shift: "Morning", notes: "Galle checkout" },
            { employeeId: getEmpId("Amara"), date: "2026-06-03", shift: "Off", notes: "Day Off" }
        ].filter(s => s.employeeId !== null);

        await EmployeeSchedule.insertMany(initialSchedules);
        console.log(`✅ Seeded schedules.`);

        const initialAttendance = [
            { employeeId: getEmpId("Nimal"), date: "2026-06-02", clockIn: "07:55 AM", clockOut: "05:05 PM", status: "Present" },
            { employeeId: getEmpId("Kasun"), date: "2026-06-02", clockIn: "08:15 AM", clockOut: "05:00 PM", status: "Late" },
            { employeeId: getEmpId("Sunil"), date: "2026-06-02", clockIn: "01:50 PM", clockOut: "10:05 PM", status: "Present" },
            { employeeId: getEmpId("Priya"), date: "2026-06-02", clockIn: "08:00 AM", clockOut: "04:55 PM", status: "Present" }
        ].filter(a => a.employeeId !== null);

        await EmployeeAttendance.insertMany(initialAttendance);
        console.log(`✅ Seeded attendance logs.`);

        const initialPerformance = [
            { employeeId: getEmpId("Nimal"), punctuality: 98, salesAchievement: 105, customerRating: 4.8, taskCompletion: 95, date: "2026-05" },
            { employeeId: getEmpId("Kasun"), punctuality: 85, salesAchievement: 92, customerRating: 4.5, taskCompletion: 88, date: "2026-05" },
            { employeeId: getEmpId("Sunil"), punctuality: 95, salesAchievement: 80, customerRating: 4.2, taskCompletion: 92, date: "2026-05" },
            { employeeId: getEmpId("Priya"), punctuality: 92, salesAchievement: 98, customerRating: 4.0, taskCompletion: 90, date: "2026-05" },
            { employeeId: getEmpId("Amara"), punctuality: 100, salesAchievement: 110, customerRating: 4.9, taskCompletion: 99, date: "2026-05" }
        ].filter(p => p.employeeId !== null);

        await EmployeePerformance.insertMany(initialPerformance);
        console.log(`✅ Seeded performance scorecards.`);

    } catch (error) {
        console.error("❌ Error seeding employee data:", error);
    }
};

module.exports = seedEmployees;
