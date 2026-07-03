const mongoose = require('mongoose');
const PDFDocument = require('pdfkit');
const Sale = require('../models/Sale');
const Inventory = require('../models/Inventory');
const Branch = require('../models/Branch');
const Report = require('../models/Report');
const ScheduledReport = require('../models/ScheduledReport');
const { scheduleOne, unscheduleOne } = require('../services/reportSchedulerService');

// ─── Internal helper: log a history entry to the Report collection ───────────
async function logHistory({ title, action, type, format, filters, userId }) {
    try {
        await Report.create({
            title,
            action,
            type: type || 'Sales',
            format: format || 'View',
            filters: filters || {},
            generatedBy: userId || null,
            generatedAt: new Date(),
        });
    } catch (e) {
        // Non-fatal — never block the export response for a log failure
        console.warn('[ReportController] History log failed:', e.message);
    }
}

// Helper: check if MongoDB is connected
const isDbConnected = () => mongoose.connection.readyState === 1;

// ─────────────────────────────────────────────────────────────
// SAMPLE / FALLBACK DATA
// Used when DB is unavailable or collections are empty.
// Replace with real aggregations as collections are populated.
// ─────────────────────────────────────────────────────────────
const SAMPLE_SUMMARY = {
    totalSales: 2400000,
    totalOrders: 1248,
    lowStockItems: 36,
    activeBranches: 8,
    netRevenue: 1800000,
    _note: 'Sample data — DB collections empty or unavailable',
};

const SAMPLE_SALES = [
    { id: 'RPT-001', branch: 'Colombo', type: 'Sales', period: 'May 2026', amount: 850000, status: 'Completed' },
    { id: 'RPT-002', branch: 'Kandy', type: 'Inventory', period: 'May 2026', amount: 420000, status: 'Review' },
    { id: 'RPT-003', branch: 'Galle', type: 'Sales', period: 'May 2026', amount: 610000, status: 'Completed' },
    { id: 'RPT-004', branch: 'All Branches', type: 'Business Summary', period: 'Q2 2026', amount: 2400000, status: 'Scheduled' },
    { id: 'RPT-005', branch: 'Jaffna', type: 'Branch Performance', period: 'May 2026', amount: 310000, status: 'Pending' },
    { id: 'RPT-006', branch: 'Negombo', type: 'Customer', period: 'May 2026', amount: 195000, status: 'Completed' },
];

const SAMPLE_BRANCH_PERFORMANCE = [
    { branch: 'Colombo', revenue: 850000, growth: 12.4, orders: 380 },
    { branch: 'Kandy', revenue: 610000, growth: 8.1, orders: 275 },
    { branch: 'Galle', revenue: 420000, growth: 5.3, orders: 190 },
    { branch: 'Jaffna', revenue: 310000, growth: -2.1, orders: 140 },
    { branch: 'Negombo', revenue: 195000, growth: 3.8, orders: 88 },
    { branch: 'Matara', revenue: 175000, growth: 6.7, orders: 75 },
];

const SAMPLE_HISTORY = [
    { action: 'Sales Report exported as PDF', user: 'Amal Perera', date: '2026-06-02', time: '4:35 PM', format: 'PDF' },
    { action: 'Inventory Summary exported as Excel', user: 'Nimal Silva', date: '2026-06-01', time: '11:20 AM', format: 'Excel' },
    { action: 'Branch Performance Report generated', user: 'Amal Perera', date: '2026-05-31', time: '9:05 AM', format: 'View' },
    { action: 'Business Summary Q2 2026 scheduled', user: 'System', date: '2026-05-30', time: '8:00 PM', format: 'Scheduled' },
    { action: 'Customer Report exported as PDF', user: 'Ravi Kumar', date: '2026-05-29', time: '2:15 PM', format: 'PDF' },
];

const SAMPLE_SCHEDULED = [
    { id: 'sch-1', title: 'Daily Sales Summary', frequency: 'Every day at 8:00 PM', nextRun: 'Today, 8:00 PM', type: 'Sales', active: true },
    { id: 'sch-2', title: 'Weekly Inventory Report', frequency: 'Every Monday at 9:00 AM', nextRun: 'Mon, 9 Jun 2026', type: 'Inventory', active: true },
    { id: 'sch-3', title: 'Monthly Branch Performance', frequency: 'First day of every month', nextRun: '1 Jul 2026', type: 'Branch Performance', active: true },
    { id: 'sch-4', title: 'Quarterly Business Summary', frequency: 'Every 3 months', nextRun: '1 Jul 2026', type: 'Business Summary', active: false },
];

// ─────────────────────────────────────────────────────────────
// GET /api/reports/summary
// Returns KPI totals: totalSales, totalOrders, lowStockItems,
// activeBranches, netRevenue.
// Uses Sale, Inventory, Branch models when DB is connected.
// Falls back to sample data if collections are empty or DB down.
// ─────────────────────────────────────────────────────────────
exports.getSummary = async (req, res, next) => {
    try {
        if (!isDbConnected()) {
            return res.status(200).json({
                success: true,
                source: 'sample',
                data: SAMPLE_SUMMARY,
            });
        }

        // Aggregate total sales amount from Sale collection
        const salesAgg = await Sale.aggregate([
            { $group: { _id: null, totalAmount: { $sum: '$finalAmount' }, count: { $sum: 1 } } },
        ]);

        const totalSales = salesAgg[0]?.totalAmount || 0;
        const totalOrders = salesAgg[0]?.count || 0;

        // Count low stock items
        const lowStockItems = await Inventory.countDocuments({ lowStockAlert: true });

        // Count active branches
        const activeBranches = await Branch.countDocuments({ isActive: true });

        // Net revenue = totalSales * 0.75 (rough estimate: 25% costs)
        // TODO: replace with real profit calculation when cost models are available
        const netRevenue = Math.round(totalSales * 0.75);

        // If Sale collection is empty, return sample with a note
        if (totalOrders === 0) {
            return res.status(200).json({
                success: true,
                source: 'sample',
                data: {
                    ...SAMPLE_SUMMARY,
                    activeBranches: activeBranches || SAMPLE_SUMMARY.activeBranches,
                    lowStockItems: lowStockItems || SAMPLE_SUMMARY.lowStockItems,
                },
            });
        }

        return res.status(200).json({
            success: true,
            source: 'database',
            data: {
                totalSales,
                totalOrders,
                lowStockItems,
                activeBranches,
                netRevenue,
            },
        });
    } catch (error) {
        next(error);
    }
};

// ─────────────────────────────────────────────────────────────
// GET /api/reports/sales
// Returns sales records. Supports query filters:
// ?branch=&fromDate=&toDate=&status=&search=
// Uses Sale model. Falls back to sample if collection is empty.
// ─────────────────────────────────────────────────────────────
exports.getSalesReport = async (req, res, next) => {
    try {
        const { branch, fromDate, toDate, status, search } = req.query;

        if (!isDbConnected()) {
            return res.status(200).json({
                success: true,
                source: 'sample',
                count: SAMPLE_SALES.length,
                data: SAMPLE_SALES,
            });
        }

        // Build filter
        const filter = {};

        if (branch && mongoose.Types.ObjectId.isValid(branch)) {
            filter.branch = new mongoose.Types.ObjectId(branch);
        }

        if (status && status !== 'All Statuses') {
            filter.status = status;
        }

        if (fromDate || toDate) {
            filter.createdAt = {};
            if (fromDate) filter.createdAt.$gte = new Date(fromDate);
            if (toDate) {
                const end = new Date(toDate);
                end.setHours(23, 59, 59, 999);
                filter.createdAt.$lte = end;
            }
        }

        if (search) {
            filter.invoiceNumber = { $regex: search, $options: 'i' };
        }

        const sales = await Sale.find(filter)
            .populate('branch', 'name city')
            .populate('cashier', 'firstName lastName')
            .sort({ createdAt: -1 })
            .limit(100)
            .exec();

        // Fall back to sample if no real data yet
        if (sales.length === 0) {
            return res.status(200).json({
                success: true,
                source: 'sample',
                count: SAMPLE_SALES.length,
                data: SAMPLE_SALES,
            });
        }

        return res.status(200).json({
            success: true,
            source: 'database',
            count: sales.length,
            data: sales,
        });
    } catch (error) {
        next(error);
    }
};

// ─────────────────────────────────────────────────────────────
// GET /api/reports/inventory
// Returns inventory/low-stock report.
// Uses Inventory + Product models.
// ─────────────────────────────────────────────────────────────
exports.getInventoryReport = async (req, res, next) => {
    try {
        if (!isDbConnected()) {
            return res.status(200).json({
                success: true,
                source: 'sample',
                data: {
                    summary: { totalProducts: 486, totalQuantity: 32610, inventoryValue: 124600, lowStockCount: 36 },
                    lowStockItems: [],
                    _note: 'Sample data — DB unavailable',
                },
            });
        }

        // Aggregate inventory stats
        const statsAgg = await Inventory.aggregate([
            {
                $lookup: {
                    from: 'products',
                    localField: 'product',
                    foreignField: '_id',
                    as: 'productDetail',
                },
            },
            { $unwind: { path: '$productDetail', preserveNullAndEmptyArrays: true } },
            {
                $group: {
                    _id: null,
                    totalQuantity: { $sum: '$quantity' },
                    totalValue: {
                        $sum: { $multiply: ['$quantity', { $ifNull: ['$productDetail.costPrice', 0] }] },
                    },
                    totalProducts: { $addToSet: '$product' },
                    lowStockCount: { $sum: { $cond: [{ $eq: ['$lowStockAlert', true] }, 1, 0] } },
                },
            },
            {
                $project: {
                    _id: 0,
                    totalQuantity: 1,
                    inventoryValue: '$totalValue',
                    totalProducts: { $size: '$totalProducts' },
                    lowStockCount: 1,
                },
            },
        ]);

        const summary = statsAgg[0] || { totalProducts: 0, totalQuantity: 0, inventoryValue: 0, lowStockCount: 0 };

        // Get low stock items list
        const lowStockItems = await Inventory.find({ lowStockAlert: true })
            .populate('product', 'name sku costPrice')
            .populate('branch', 'name city')
            .limit(50)
            .exec();

        return res.status(200).json({
            success: true,
            source: summary.totalProducts > 0 ? 'database' : 'sample',
            data: {
                summary,
                lowStockItems: lowStockItems.length > 0 ? lowStockItems : [],
            },
        });
    } catch (error) {
        next(error);
    }
};

// ─────────────────────────────────────────────────────────────
// GET /api/reports/branch-performance
// Returns revenue per branch for charts.
// Uses Sale + Branch models (aggregate).
// Falls back to sample if Sale collection empty.
// ─────────────────────────────────────────────────────────────
exports.getBranchPerformance = async (req, res, next) => {
    try {
        const { fromDate, toDate } = req.query;

        if (!isDbConnected()) {
            return res.status(200).json({
                success: true,
                source: 'sample',
                data: SAMPLE_BRANCH_PERFORMANCE,
            });
        }

        const matchStage = {};
        if (fromDate || toDate) {
            matchStage.createdAt = {};
            if (fromDate) matchStage.createdAt.$gte = new Date(fromDate);
            if (toDate) {
                const end = new Date(toDate);
                end.setHours(23, 59, 59, 999);
                matchStage.createdAt.$lte = end;
            }
        }

        const pipeline = [
            ...(Object.keys(matchStage).length > 0 ? [{ $match: matchStage }] : []),
            {
                $group: {
                    _id: '$branch',
                    revenue: { $sum: '$finalAmount' },
                    orders: { $sum: 1 },
                },
            },
            {
                $lookup: {
                    from: 'branches',
                    localField: '_id',
                    foreignField: '_id',
                    as: 'branchInfo',
                },
            },
            { $unwind: { path: '$branchInfo', preserveNullAndEmptyArrays: true } },
            {
                $project: {
                    _id: 0,
                    branchId: '$_id',
                    branch: { $ifNull: ['$branchInfo.name', 'Unknown'] },
                    city: { $ifNull: ['$branchInfo.city', ''] },
                    revenue: 1,
                    orders: 1,
                },
            },
            { $sort: { revenue: -1 } },
        ];

        const results = await Sale.aggregate(pipeline);

        if (results.length === 0) {
            return res.status(200).json({
                success: true,
                source: 'sample',
                data: SAMPLE_BRANCH_PERFORMANCE,
            });
        }

        return res.status(200).json({
            success: true,
            source: 'database',
            count: results.length,
            data: results,
        });
    } catch (error) {
        next(error);
    }
};

// ─────────────────────────────────────────────────────────────
// GET /api/reports/history
// Returns report generation/export history from Report model.
// Falls back to sample data if collection is empty.
// ─────────────────────────────────────────────────────────────
exports.getReportHistory = async (req, res, next) => {
    try {
        if (!isDbConnected()) {
            return res.status(200).json({
                success: true,
                source: 'sample',
                data: SAMPLE_HISTORY,
            });
        }

        const history = await Report.find()
            .populate('generatedBy', 'firstName lastName email')
            .sort({ createdAt: -1 })
            .limit(50)
            .exec();

        if (history.length === 0) {
            return res.status(200).json({
                success: true,
                source: 'sample',
                data: SAMPLE_HISTORY,
            });
        }

        return res.status(200).json({
            success: true,
            source: 'database',
            count: history.length,
            data: history,
        });
    } catch (error) {
        next(error);
    }
};

// ─────────────────────────────────────────────────────────────
// GET /api/reports/scheduled
// Returns all ScheduledReport documents from MongoDB.
// Falls back to sample data if DB is down or collection empty.
// ─────────────────────────────────────────────────────────────
exports.getScheduledReports = async (req, res, next) => {
    try {
        if (!isDbConnected()) {
            return res.status(200).json({ success: true, source: 'sample', data: SAMPLE_SCHEDULED });
        }

        const schedules = await ScheduledReport.find().sort({ createdAt: -1 });

        if (schedules.length === 0) {
            return res.status(200).json({ success: true, source: 'sample', data: SAMPLE_SCHEDULED });
        }

        return res.status(200).json({
            success: true,
            source: 'database',
            count: schedules.length,
            data: schedules,
        });
    } catch (error) {
        next(error);
    }
};

// ─────────────────────────────────────────────────────────────
// POST /api/reports/scheduled
// Create a new ScheduledReport and register its cron task.
// ─────────────────────────────────────────────────────────────
exports.createScheduledReport = async (req, res, next) => {
    try {
        const { title, type, frequency, cronExpression, active } = req.body;
        if (!title || !frequency) {
            return res.status(400).json({ success: false, error: 'title and frequency are required.' });
        }

        const doc = await ScheduledReport.create({
            title,
            type: type || 'Sales',
            frequency,
            cronExpression: cronExpression || ScheduledReport.FREQUENCY_CRON_MAP[frequency] || '0 8 * * *',
            active: active !== undefined ? active : true,
            createdBy: req.user?._id || null,
        });

        // Register the cron task immediately
        scheduleOne(doc);

        // Log to history
        await logHistory({
            title: `${doc.title} schedule created`,
            action: `Scheduled report "${doc.title}" set up — ${doc.frequency}`,
            type: doc.type,
            format: 'Scheduled',
            userId: req.user?._id,
        });

        return res.status(201).json({ success: true, data: doc });
    } catch (error) {
        next(error);
    }
};

// ─────────────────────────────────────────────────────────────
// PATCH /api/reports/scheduled/:id
// Toggle active/inactive or update fields. Re-registers cron task.
// ─────────────────────────────────────────────────────────────
exports.updateScheduledReport = async (req, res, next) => {
    try {
        const { id } = req.params;
        const updates = req.body;

        const doc = await ScheduledReport.findByIdAndUpdate(id, updates, { returnDocument: 'after' });
        if (!doc) return res.status(404).json({ success: false, error: 'Schedule not found.' });

        // Re-register (will stop old task and start new one if active)
        scheduleOne(doc);

        return res.status(200).json({ success: true, data: doc });
    } catch (error) {
        next(error);
    }
};

// ─────────────────────────────────────────────────────────────
// DELETE /api/reports/scheduled/:id
// Remove a ScheduledReport and stop its cron task.
// ─────────────────────────────────────────────────────────────
exports.deleteScheduledReport = async (req, res, next) => {
    try {
        const { id } = req.params;
        const doc = await ScheduledReport.findByIdAndDelete(id);
        if (!doc) return res.status(404).json({ success: false, error: 'Schedule not found.' });

        // Stop the cron task
        unscheduleOne(id);

        return res.status(200).json({ success: true, message: `Schedule "${doc.title}" deleted.` });
    } catch (error) {
        next(error);
    }
};

// ─────────────────────────────────────────────────────────────
// POST /api/reports/export/pdf
// Generates a fully styled PDF document using pdfkit and streams it.
// ─────────────────────────────────────────────────────────────
exports.exportPDF = async (req, res, next) => {
    try {
        const { reportType, branch, fromDate, toDate, status, invoiceNumber } = req.body;

        let salesList = [];
        let summaryStats = SAMPLE_SUMMARY;
        let isRealDb = false;

        if (isDbConnected()) {
            const filter = {};
            if (invoiceNumber) {
                filter.invoiceNumber = invoiceNumber;
            } else {
                if (branch && mongoose.Types.ObjectId.isValid(branch)) {
                    filter.branch = new mongoose.Types.ObjectId(branch);
                }
                if (status && status !== 'All Statuses') {
                    filter.status = status;
                }
                if (fromDate || toDate) {
                    filter.createdAt = {};
                    if (fromDate) filter.createdAt.$gte = new Date(fromDate);
                    if (toDate) {
                        const end = new Date(toDate);
                        end.setHours(23, 59, 59, 999);
                        filter.createdAt.$lte = end;
                    }
                }
            }

            const sales = await Sale.find(filter)
                .populate('branch', 'name city')
                .populate('cashier', 'firstName lastName')
                .sort({ createdAt: -1 })
                .exec();

            if (sales.length > 0) {
                isRealDb = true;
                salesList = sales;
                
                const totalSales = sales.reduce((acc, s) => acc + (s.finalAmount || s.totalAmount || 0), 0);
                const totalOrders = sales.length;
                summaryStats = {
                    totalSales,
                    totalOrders,
                    lowStockItems: await Inventory.countDocuments({ lowStockAlert: true }),
                    activeBranches: await Branch.countDocuments({ isActive: true }),
                    netRevenue: Math.round(totalSales * 0.75),
                    _note: 'Live Database Export'
                };
            }
        }

        if (!isRealDb) {
            salesList = SAMPLE_SALES.filter(s => {
                if (invoiceNumber) {
                    return s.id === invoiceNumber;
                }
                if (branch && branch !== 'All Branches' && branch !== 'All Types' && s.branch.toLowerCase() !== branch.toLowerCase().replace(' branch', '')) {
                    return false;
                }
                if (status && status !== 'All Statuses' && s.status !== status) {
                    return false;
                }
                return true;
            });
        }

        const doc = new PDFDocument({ margin: 50 });

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="report_${reportType || 'Sales'}.pdf"`);

        doc.pipe(res);

        // Header Design
        doc.fillColor('#1e293b').fontSize(20).font('Helvetica-Bold').text('GAMAGE POS RETAIL SYSTEM', { align: 'center' });
        doc.fillColor('#2563eb').fontSize(14).font('Helvetica-Bold').text('Reporting & Analytics Module', { align: 'center' });
        doc.moveDown();

        doc.fillColor('#475569').fontSize(10).font('Helvetica');
        doc.text(`Report Category : ${reportType || 'Sales Report'}`);
        doc.text(`Branch Target   : ${branch || 'All Branches'}`);
        doc.text(`Report Period   : ${fromDate || 'Beginning'} to ${toDate || 'Present'}`);
        doc.text(`Generation Date : ${new Date().toLocaleString()}`);
        doc.moveDown(1.5);

        // Draw Executive Summary Section
        doc.fillColor('#1e293b').fontSize(12).font('Helvetica-Bold').text('EXECUTIVE SUMMARY', { underline: true });
        doc.moveDown(0.5);
        doc.fontSize(10).font('Helvetica');
        doc.text(`Total Sales Amount  : LKR ${summaryStats.totalSales.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
        doc.text(`Total Orders Count  : ${summaryStats.totalOrders}`);
        doc.text(`Estimated Profit    : LKR ${summaryStats.netRevenue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (est. 75% margin)`);
        doc.text(`Active Branches Count: ${summaryStats.activeBranches}`);
        doc.text(`Low Stock Alerts    : ${summaryStats.lowStockItems} items`);
        doc.text(`Data Verification   : ${isRealDb ? 'Verified MongoDB Production Records' : 'Static Fallback Sample Dataset'}`);
        doc.moveDown(1.5);

        // Detail Table Headers
        doc.fillColor('#1e293b').fontSize(12).font('Helvetica-Bold').text('TRANSACTION LOG DETAILS', { underline: true });
        doc.moveDown(0.5);

        const tableTop = doc.y;
        
        const drawTableHeader = (yPos) => {
            doc.rect(50, yPos - 4, 495, 20).fill('#2563eb');
            doc.fillColor('#ffffff').fontSize(9).font('Helvetica-Bold');
            doc.text('REPORT ID', 55, yPos);
            doc.text('BRANCH', 140, yPos);
            doc.text('CASHIER / TYPE', 230, yPos);
            doc.text('DATE / PERIOD', 330, yPos);
            doc.text('AMOUNT', 415, yPos, { width: 75, align: 'right' });
            doc.text('STATUS', 495, yPos, { width: 50, align: 'right' });
        };

        drawTableHeader(tableTop);
        doc.font('Helvetica');

        let y = tableTop + 24;
        salesList.forEach((item) => {
            if (y > 720) {
                doc.addPage();
                y = 50;
                drawTableHeader(y);
                y += 24;
            }

            const idStr = item.invoiceNumber || item.id || String(item._id).substring(0, 8);
            const branchStr = item.branch?.name || item.branch || 'Unknown';
            const cashierOrType = item.cashier ? `${item.cashier.firstName} ${item.cashier.lastName}` : (item.type || 'POS Sale');
            const dateStr = item.createdAt ? new Date(item.createdAt).toLocaleDateString() : (item.period || 'N/A');
            
            const rawAmount = item.amount !== undefined ? item.amount : (item.finalAmount !== undefined ? item.finalAmount : (item.totalAmount || 0));
            const amountStr = typeof rawAmount === 'number' ? `LKR ${rawAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : String(rawAmount);
            const statusStr = item.status || 'Completed';

            doc.strokeColor('#e2e8f0').lineWidth(0.5).moveTo(50, y + 14).lineTo(545, y + 14).stroke();

            doc.fillColor('#334155').font('Helvetica').fontSize(8.5);
            doc.text(idStr, 55, y, { width: 80, height: 15, ellipsis: true });
            doc.text(branchStr, 140, y, { width: 85, height: 15, ellipsis: true });
            doc.text(cashierOrType, 230, y, { width: 95, height: 15, ellipsis: true });
            doc.text(dateStr, 330, y, { width: 80, height: 15, ellipsis: true });
            doc.text(amountStr, 415, y, { width: 75, align: 'right' });
            doc.text(statusStr, 495, y, { width: 50, align: 'right' });

            y += 20;
        });

        doc.end();

        // Log export to history (non-blocking — runs after stream starts)
        logHistory({
            title: `${reportType || 'Sales'} Report exported as PDF`,
            action: `${reportType || 'Sales'} Report exported as PDF`,
            type: reportType || 'Sales',
            format: 'PDF',
            filters: { branch, status, fromDate, toDate, invoiceNumber },
            userId: req.user?._id,
        });
    } catch (error) {
        next(error);
    }
};

// ─────────────────────────────────────────────────────────────
// POST /api/reports/export/excel
// Generates an Excel-compatible Comma-Separated Values (CSV) download.
// ─────────────────────────────────────────────────────────────
exports.exportExcel = async (req, res, next) => {
    try {
        const { reportType, branch, fromDate, toDate, status, invoiceNumber } = req.body;

        let salesList = [];
        let summaryStats = SAMPLE_SUMMARY;
        let isRealDb = false;

        if (isDbConnected()) {
            const filter = {};
            if (invoiceNumber) {
                filter.invoiceNumber = invoiceNumber;
            } else {
                if (branch && mongoose.Types.ObjectId.isValid(branch)) {
                    filter.branch = new mongoose.Types.ObjectId(branch);
                }
                if (status && status !== 'All Statuses') {
                    filter.status = status;
                }
                if (fromDate || toDate) {
                    filter.createdAt = {};
                    if (fromDate) filter.createdAt.$gte = new Date(fromDate);
                    if (toDate) {
                        const end = new Date(toDate);
                        end.setHours(23, 59, 59, 999);
                        filter.createdAt.$lte = end;
                    }
                }
            }

            const sales = await Sale.find(filter)
                .populate('branch', 'name city')
                .populate('cashier', 'firstName lastName')
                .sort({ createdAt: -1 })
                .exec();

            if (sales.length > 0) {
                isRealDb = true;
                salesList = sales;
                
                const totalSales = sales.reduce((acc, s) => acc + (s.finalAmount || s.totalAmount || 0), 0);
                const totalOrders = sales.length;
                summaryStats = {
                    totalSales,
                    totalOrders,
                    lowStockItems: await Inventory.countDocuments({ lowStockAlert: true }),
                    activeBranches: await Branch.countDocuments({ isActive: true }),
                    netRevenue: Math.round(totalSales * 0.75),
                    _note: 'Live Database Export'
                };
            }
        }

        if (!isRealDb) {
            salesList = SAMPLE_SALES.filter(s => {
                if (invoiceNumber) {
                    return s.id === invoiceNumber;
                }
                if (branch && branch !== 'All Branches' && branch !== 'All Types' && s.branch.toLowerCase() !== branch.toLowerCase().replace(' branch', '')) {
                    return false;
                }
                if (status && status !== 'All Statuses' && s.status !== status) {
                    return false;
                }
                return true;
            });
        }

        let csvContent = 'GAMAGE POS RETAIL SYSTEM - EXPORTED REPORT\n';
        csvContent += `Report Category,${reportType || 'Sales Report'}\n`;
        csvContent += `Branch Target,${branch || 'All Branches'}\n`;
        csvContent += `Report Period,${fromDate || 'Beginning'} to ${toDate || 'Present'}\n`;
        csvContent += `Generation Date,${new Date().toLocaleString()}\n\n`;

        csvContent += 'EXECUTIVE SUMMARY\n';
        csvContent += `Total Sales Amount,LKR ${summaryStats.totalSales.toFixed(2)}\n`;
        csvContent += `Total Orders Count,${summaryStats.totalOrders}\n`;
        csvContent += `Estimated Profit,LKR ${summaryStats.netRevenue.toFixed(2)}\n`;
        csvContent += `Active Branches,${summaryStats.activeBranches}\n`;
        csvContent += `Low Stock Alerts,${summaryStats.lowStockItems}\n`;
        csvContent += `Data Source,${isRealDb ? 'Live MongoDB Production' : 'Mock Sample Fallback'}\n\n`;

        csvContent += 'REPORT ID,BRANCH,CASHIER / TYPE,DATE / PERIOD,AMOUNT,STATUS\n';

        salesList.forEach(item => {
            const idStr = item.invoiceNumber || item.id || String(item._id);
            const branchStr = item.branch?.name || item.branch || 'Unknown';
            const cashierOrType = item.cashier ? `${item.cashier.firstName} ${item.cashier.lastName}` : (item.type || 'POS Sale');
            const dateStr = item.createdAt ? new Date(item.createdAt).toLocaleDateString() : (item.period || 'N/A');
            const rawAmount = item.amount !== undefined ? item.amount : (item.finalAmount !== undefined ? item.finalAmount : (item.totalAmount || 0));
            const statusStr = item.status || 'Completed';

            const clean = (val) => {
                const s = String(val).replace(/"/g, '""');
                return s.includes(',') || s.includes('\n') ? `"${s}"` : s;
            };

            csvContent += `${clean(idStr)},${clean(branchStr)},${clean(cashierOrType)},${clean(dateStr)},${rawAmount.toFixed(2)},${clean(statusStr)}\n`;
        });

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="report_${reportType || 'Sales'}.csv"`);

        // Log export to history
        logHistory({
            title: `${reportType || 'Sales'} Report exported as Excel`,
            action: `${reportType || 'Sales'} Report exported as Excel/CSV`,
            type: reportType || 'Sales',
            format: 'Excel',
            filters: { branch, status, fromDate, toDate, invoiceNumber },
            userId: req.user?._id,
        });

        return res.status(200).send(csvContent);
    } catch (error) {
        next(error);
    }
};

