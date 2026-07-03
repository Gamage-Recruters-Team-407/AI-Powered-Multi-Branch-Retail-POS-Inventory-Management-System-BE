const mongoose = require("mongoose");
const StockTransfer = require("../models/StockTransfer");
const Inventory = require("../models/Inventory");
const InventoryMovement = require("../models/InventoryMovement");
const Branch = require("../models/Branch");
const Product = require("../models/Product");
const AuditLog = require("../models/Auditlog");
const {
	isAdminRole,
	isManagerRole,
	getCreateTransferDenial,
	getManagerPendingTransferDenial,
	getDispatchTransferDenial,
	getConfirmReceiptDenial,
	getTransferActions,
	getPermissionsForUser,
	buildTransferScopeFilter,
	buildMovementScopeFilter,
	getTransferViewDenial,
	getUserBranchIds,
} = require("../utils/stockTransferPermissions");

const parsePagination = (query) => {
    const page = Math.max(Number(query.page) || 1, 1);
    const limit = Math.min(Math.max(Number(query.limit) || 10, 1), 100);
    return { page, limit, skip: (page - 1) * limit };
};

const ACTIVE_TRANSFER_STATUSES = ["PENDING", "APPROVED", "IN_TRANSIT"];

const buildTransferFilters = (query) => {
    const filters = {};

    const activeOnly =
        query.active === "true" ||
        query.active === "1" ||
        query.activeOnly === "true" ||
        query.activeOnly === "1";

    if (activeOnly) {
        filters.status = { $in: ACTIVE_TRANSFER_STATUSES };
    } else if (query.statusIn) {
        const statuses = String(query.statusIn)
            .split(",")
            .map((s) => s.trim().toUpperCase())
            .filter(Boolean);
        if (statuses.length) {
            filters.status = { $in: statuses };
        }
    } else if (query.status) {
        filters.status = query.status;
    }

    if (query.fromBranch) {
        filters.fromBranch = query.fromBranch;
    }

    if (query.toBranch) {
        filters.toBranch = query.toBranch;
    }

    if (query.startDate || query.endDate) {
        filters.transferDate = {};
        if (query.startDate) {
            filters.transferDate.$gte = new Date(query.startDate);
        }
        if (query.endDate) {
            filters.transferDate.$lte = new Date(query.endDate);
        }
    }

    return filters;
};

const validateTransferItems = async (items) => {
    if (!Array.isArray(items) || items.length === 0) {
        return "At least one transfer item is required.";
    }

    const hasInvalidQuantity = items.some((item) => !item.product || Number(item.quantity) <= 0);
    if (hasInvalidQuantity) {
        return "Each item must include a valid product and quantity > 0.";
    }

    const productIds = items.map((item) => item.product);
    const products = await Product.countDocuments({ _id: { $in: productIds } });

    if (products !== productIds.length) {
        return "One or more products do not exist.";
    }

    return null;
};

const checkStockAvailability = async (fromBranch, items, session = null) => {
    for (const item of items) {
        const inventory = await Inventory.findOne({
            branch: fromBranch,
            product: item.product
        }).session(session);

        if (!inventory || inventory.quantity < item.quantity) {
            return {
                available: false,
                message: `Insufficient stock for product ${item.product}.`
            };
        }
    }

    return { available: true };
};

const createAuditLog = async (req, action, metadata) => {
    await AuditLog.create({
        user: req.user?._id || null,
        action,
        module: "STOCK_TRANSFER",
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"],
        metadata
    });
};

const pushActivityLog = (transfer, status, note, userId) => {
    transfer.activityLogs.push({
        status,
        note,
        changedBy: userId || null
    });
};

const recordInventoryMovement = async ({
    transferId,
    branch,
    product,
    movementType,
    quantity,
    previousQuantity,
    newQuantity,
    performedBy,
    note,
    session
}) => {
    await InventoryMovement.create(
        [
            {
                transfer: transferId,
                branch,
                product,
                movementType,
                quantity,
                previousQuantity,
                newQuantity,
                performedBy: performedBy || null,
                note
            }
        ],
        { session }
    );
};

const adjustInventoryWithLog = async ({
    transferId,
    branch,
    product,
    quantityChange,
    movementType,
    performedBy,
    note,
    session,
    upsert = false
}) => {
    const inventory = await Inventory.findOne({ branch, product }).session(session);
    const previousQuantity = inventory?.quantity || 0;
    const newQuantity = previousQuantity + quantityChange;

    if (!upsert && newQuantity < 0) {
        throw new Error(`Insufficient stock for product ${product}.`);
    }

    if (inventory) {
        inventory.quantity = newQuantity;
        await inventory.save({ session });
    } else if (upsert) {
        await Inventory.create(
            [{ branch, product, quantity: newQuantity, reservedStock: 0, lowStockAlert: false }],
            { session }
        );
    } else {
        throw new Error(`Inventory not found for product ${product}.`);
    }

    await recordInventoryMovement({
        transferId,
        branch,
        product,
        movementType,
        quantity: Math.abs(quantityChange),
        previousQuantity,
        newQuantity,
        performedBy,
        note,
        session
    });
};

const getRequestBody = (req) => req.body || {};

const deductSourceBranchStock = async (transfer, performedBy, session) => {
    for (const item of transfer.items) {
        await adjustInventoryWithLog({
            transferId: transfer._id,
            branch: transfer.fromBranch,
            product: item.product,
            quantityChange: -Number(item.quantity),
            movementType: "OUT",
            performedBy,
            note: "Stock deducted from source branch on transfer approval",
            session
        });
    }
};

const restoreSourceBranchStock = async (transfer, performedBy, session) => {
    for (const item of transfer.items) {
        await adjustInventoryWithLog({
            transferId: transfer._id,
            branch: transfer.fromBranch,
            product: item.product,
            quantityChange: Number(item.quantity),
            movementType: "RESTORE",
            performedBy,
            note: "Stock restored after transfer cancellation",
            session,
            upsert: true
        });
    }
};

const resolveAvailabilityBranchId = (req) => {
    const perms = getPermissionsForUser(req.user);
    const requested = req.query.branchId;

    if (perms.viewScope === "all") {
        return requested || null;
    }

    const userBranchIds = getUserBranchIds(req.user);
    if (!userBranchIds.length) {
        return null;
    }

    if (requested && userBranchIds.some((id) => String(id) === String(requested))) {
        return requested;
    }

    return userBranchIds[0];
};

const createTransfer = async (req, res) => {
    try {
        const body = getRequestBody(req);
        const { fromBranch, toBranch, items, notes } = body;

        if (!Object.keys(body).length) {
            return res.status(400).json({
                success: false,
                message:
                    "Request body is empty. In Postman: open the Body tab → select raw → choose JSON → paste your JSON payload."
            });
        }

        if (!fromBranch || !toBranch) {
            return res.status(400).json({
                success: false,
                message: "fromBranch and toBranch are required in the JSON body."
            });
        }

        if (fromBranch === toBranch) {
            return res.status(400).json({ success: false, message: "fromBranch and toBranch must be different." });
        }

        const branchAccessError = getCreateTransferDenial(req.user);
        if (branchAccessError) {
            return res.status(403).json({ success: false, message: branchAccessError });
        }

        const [fromExists, toExists] = await Promise.all([
            Branch.exists({ _id: fromBranch }),
            Branch.exists({ _id: toBranch })
        ]);

        if (!fromExists || !toExists) {
            return res.status(404).json({ success: false, message: "One or both branches do not exist." });
        }

        const validationError = await validateTransferItems(items);
        if (validationError) {
            return res.status(400).json({ success: false, message: validationError });
        }

        const availability = await checkStockAvailability(fromBranch, items);
        if (!availability.available) {
            return res.status(400).json({ success: false, message: availability.message });
        }

        const transfer = await StockTransfer.create({
            fromBranch,
            toBranch,
            items,
            notes,
            createdBy: req.user._id,
            activityLogs: [
                {
                    status: "PENDING",
                    note: "Transfer created",
                    changedBy: req.user._id
                }
            ]
        });

        await createAuditLog(req, "CREATE_TRANSFER", {
            transferId: transfer._id,
            fromBranch,
            toBranch,
            itemCount: items.length
        });

        return res.status(201).json({ success: true, data: transfer });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

const updateTransfer = async (req, res) => {
    try {
        const transfer = await StockTransfer.findById(req.params.id);

        if (!transfer) {
            return res.status(404).json({ success: false, message: "Transfer not found." });
        }

        if (transfer.status !== "PENDING") {
            return res.status(400).json({ success: false, message: "Only PENDING transfers can be updated." });
        }

        const managerAccessError = getManagerPendingTransferDenial(req.user, transfer);
        if (managerAccessError) {
            return res.status(403).json({ success: false, message: managerAccessError });
        }

        const { fromBranch, toBranch, items, notes } = getRequestBody(req);
        const nextFrom = fromBranch || transfer.fromBranch;
        const nextTo = toBranch || transfer.toBranch;
        const nextItems = items || transfer.items;

        if (String(nextFrom) === String(nextTo)) {
            return res.status(400).json({ success: false, message: "fromBranch and toBranch must be different." });
        }

        const [fromExists, toExists] = await Promise.all([
            Branch.exists({ _id: nextFrom }),
            Branch.exists({ _id: nextTo })
        ]);

        if (!fromExists || !toExists) {
            return res.status(404).json({ success: false, message: "One or both branches do not exist." });
        }

        const validationError = await validateTransferItems(nextItems);
        if (validationError) {
            return res.status(400).json({ success: false, message: validationError });
        }

        const availability = await checkStockAvailability(nextFrom, nextItems);
        if (!availability.available) {
            return res.status(400).json({ success: false, message: availability.message });
        }

        transfer.fromBranch = nextFrom;
        transfer.toBranch = nextTo;
        transfer.items = nextItems;
        if (notes !== undefined) {
            transfer.notes = notes;
        }

        pushActivityLog(transfer, "PENDING", "Transfer updated", req.user._id);
        await transfer.save();

        await createAuditLog(req, "UPDATE_TRANSFER", { transferId: transfer._id });

        return res.status(200).json({ success: true, data: transfer });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

const deleteTransfer = async (req, res) => {
    try {
        const transfer = await StockTransfer.findById(req.params.id);

        if (!transfer) {
            return res.status(404).json({ success: false, message: "Transfer not found." });
        }

        if (transfer.status !== "PENDING") {
            return res.status(400).json({ success: false, message: "Only PENDING transfers can be deleted." });
        }

        const managerAccessError = getManagerPendingTransferDenial(req.user, transfer);
        if (managerAccessError) {
            return res.status(403).json({ success: false, message: managerAccessError });
        }

        await StockTransfer.deleteOne({ _id: transfer._id });
        await createAuditLog(req, "DELETE_TRANSFER", { transferId: transfer._id });

        return res.status(200).json({ success: true, message: "Transfer deleted successfully." });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

/** Legacy/manual dispatch for transfers stuck in APPROVED */
const dispatchTransfer = async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const transfer = await StockTransfer.findById(req.params.id).session(session);

        if (!transfer) {
            await session.abortTransaction();
            return res.status(404).json({ success: false, message: "Transfer not found." });
        }

        const dispatchDenial = getDispatchTransferDenial(req.user, transfer);
        if (dispatchDenial) {
            await session.abortTransaction();
            return res.status(403).json({ success: false, message: dispatchDenial });
        }

        const availability = await checkStockAvailability(transfer.fromBranch, transfer.items, session);
        if (!availability.available) {
            await session.abortTransaction();
            return res.status(400).json({ success: false, message: availability.message });
        }

        await deductSourceBranchStock(transfer, req.user._id, session);

        transfer.status = "IN_TRANSIT";
        transfer.dispatchedAt = new Date();
        pushActivityLog(transfer, "IN_TRANSIT", "Transfer dispatched", req.user._id);

        await transfer.save({ session });
        await session.commitTransaction();

        await createAuditLog(req, "DISPATCH_TRANSFER", { transferId: transfer._id });

        return res.status(200).json({ success: true, data: transfer });
    } catch (error) {
        await session.abortTransaction();
        return res.status(500).json({ success: false, message: error.message });
    } finally {
        session.endSession();
    }
};

const completeTransfer = async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const transfer = await StockTransfer.findById(req.params.id).session(session);

        if (!transfer) {
            await session.abortTransaction();
            return res.status(404).json({ success: false, message: "Transfer not found." });
        }

        if (transfer.status !== "IN_TRANSIT") {
            await session.abortTransaction();
            return res.status(400).json({ success: false, message: "Only IN_TRANSIT transfers can be completed." });
        }

        const receiptAccessError = getConfirmReceiptDenial(req.user, transfer);
        if (receiptAccessError) {
            await session.abortTransaction();
            return res.status(403).json({ success: false, message: receiptAccessError });
        }

        for (const item of transfer.items) {
            await adjustInventoryWithLog({
                transferId: transfer._id,
                branch: transfer.toBranch,
                product: item.product,
                quantityChange: Number(item.quantity),
                movementType: "IN",
                performedBy: req.user._id,
                note: "Stock received at destination branch",
                session,
                upsert: true
            });
        }

        transfer.status = "COMPLETED";
        transfer.completedAt = new Date();
        pushActivityLog(transfer, "COMPLETED", "Transfer completed", req.user._id);

        await transfer.save({ session });
        await session.commitTransaction();

        await createAuditLog(req, "COMPLETE_TRANSFER", { transferId: transfer._id });

        return res.status(200).json({ success: true, data: transfer });
    } catch (error) {
        await session.abortTransaction();
        return res.status(500).json({ success: false, message: error.message });
    } finally {
        session.endSession();
    }
};

/** Admin approves pending request → APPROVED (stock moves on manager dispatch) */
const approveTransfer = async (req, res) => {
    try {
        const transfer = await StockTransfer.findById(req.params.id);
        const { note } = getRequestBody(req);

        if (!transfer) {
            return res.status(404).json({ success: false, message: "Transfer not found." });
        }

        if (transfer.status !== "PENDING") {
            return res.status(400).json({
                success: false,
                message: "Only PENDING transfers can be approved."
            });
        }

        const availability = await checkStockAvailability(transfer.fromBranch, transfer.items);
        if (!availability.available) {
            return res.status(400).json({ success: false, message: availability.message });
        }

        const now = new Date();
        transfer.status = "APPROVED";
        transfer.approvedAt = now;
        pushActivityLog(
            transfer,
            "APPROVED",
            note || "Transfer approved by admin",
            req.user._id
        );

        await transfer.save();

        await createAuditLog(req, "APPROVE_TRANSFER", { transferId: transfer._id });

        return res.status(200).json({ success: true, data: transfer });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

const cancelTransfer = async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const transfer = await StockTransfer.findById(req.params.id).session(session);
        const { reason } = getRequestBody(req);

        if (!transfer) {
            await session.abortTransaction();
            return res.status(404).json({ success: false, message: "Transfer not found." });
        }

        if (["COMPLETED", "CANCELLED", "REJECTED"].includes(transfer.status)) {
            await session.abortTransaction();
            return res.status(400).json({
                success: false,
                message: `Transfer cannot be cancelled when status is ${transfer.status}.`
            });
        }

        if (isManagerRole(req.user.role)) {
            const managerAccessError = getManagerPendingTransferDenial(req.user, transfer);
            if (managerAccessError) {
                await session.abortTransaction();
                return res.status(403).json({ success: false, message: managerAccessError });
            }
        } else if (!isAdminRole(req.user.role)) {
            await session.abortTransaction();
            return res.status(403).json({ success: false, message: "Access denied for this role." });
        } else if (transfer.status !== "PENDING") {
            await session.abortTransaction();
            return res.status(400).json({
                success: false,
                message: "Admins can only cancel transfers while they are pending review."
            });
        }

        if (transfer.status === "IN_TRANSIT") {
            await restoreSourceBranchStock(transfer, req.user._id, session);
        }

        transfer.status = "CANCELLED";
        transfer.cancelledAt = new Date();
        transfer.cancelReason = reason || "Transfer cancelled";
        pushActivityLog(transfer, "CANCELLED", transfer.cancelReason, req.user._id);

        await transfer.save({ session });
        await session.commitTransaction();

        await createAuditLog(req, "CANCEL_TRANSFER", {
            transferId: transfer._id,
            reason: transfer.cancelReason
        });

        return res.status(200).json({ success: true, data: transfer });
    } catch (error) {
        await session.abortTransaction();
        return res.status(500).json({ success: false, message: error.message });
    } finally {
        session.endSession();
    }
};

/** Admin progress tracking: reject a pending transfer request */
const rejectTransfer = async (req, res) => {
    try {
        const transfer = await StockTransfer.findById(req.params.id);
        const { reason } = getRequestBody(req);

        if (!transfer) {
            return res.status(404).json({ success: false, message: "Transfer not found." });
        }

        if (transfer.status !== "PENDING") {
            return res.status(400).json({
                success: false,
                message: "Only PENDING transfers can be rejected."
            });
        }

        transfer.status = "REJECTED";
        transfer.rejectedAt = new Date();
        transfer.rejectReason = reason || "Transfer rejected";
        pushActivityLog(transfer, "REJECTED", transfer.rejectReason, req.user._id);
        await transfer.save();

        await createAuditLog(req, "REJECT_TRANSFER", {
            transferId: transfer._id,
            reason: transfer.rejectReason
        });

        return res.status(200).json({ success: true, data: transfer });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

const listTransfers = async (req, res) => {
    try {
        const filters = {
            ...buildTransferFilters(req.query),
            ...buildTransferScopeFilter(req.user),
        };
        const { page, limit, skip } = parsePagination(req.query);

        const [data, total] = await Promise.all([
            StockTransfer.find(filters)
                .populate("fromBranch", "name code")
                .populate("toBranch", "name code")
                .populate("createdBy", "firstName lastName email role")
                .populate("items.product", "name barcode")
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit),
            StockTransfer.countDocuments(filters)
        ]);

        const permissions = getPermissionsForUser(req.user);

        const statusCounts = await StockTransfer.aggregate([
            { $match: buildTransferScopeFilter(req.user) },
            { $group: { _id: "$status", count: { $sum: 1 } } }
        ]);
        const summary = {
            pending: 0,
            approved: 0,
            inTransit: 0,
            rejected: 0,
            completed: 0,
            cancelled: 0,
            active: 0
        };
        for (const row of statusCounts) {
            const key = String(row._id || "").toUpperCase();
            const count = row.count ?? 0;
            if (key === "PENDING") summary.pending = count;
            else if (key === "APPROVED") summary.approved = count;
            else if (key === "IN_TRANSIT") summary.inTransit = count;
            else if (key === "REJECTED") summary.rejected = count;
            else if (key === "COMPLETED") summary.completed = count;
            else if (key === "CANCELLED") summary.cancelled = count;
            if (ACTIVE_TRANSFER_STATUSES.includes(key)) {
                summary.active += count;
            }
        }

        const enriched = data.map((doc) => {
            const plain = doc.toObject ? doc.toObject() : doc;
            return { ...plain, actions: getTransferActions(plain, req.user) };
        });

        return res.status(200).json({
            success: true,
            data: enriched,
            permissions,
            summary,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

const getTransferById = async (req, res) => {
    try {
        const transfer = await StockTransfer.findById(req.params.id)
            .populate("fromBranch", "name code")
            .populate("toBranch", "name code")
            .populate("createdBy", "firstName lastName email role")
            .populate("items.product", "name barcode")
            .populate("activityLogs.changedBy", "firstName lastName email");

        if (!transfer) {
            return res.status(404).json({ success: false, message: "Transfer not found." });
        }

        const viewDenial = getTransferViewDenial(req.user, transfer);
        if (viewDenial) {
            return res.status(403).json({ success: false, message: viewDenial });
        }

        const actions = getTransferActions(transfer, req.user);

        return res.status(200).json({
            success: true,
            data: transfer,
            permissions: getPermissionsForUser(req.user),
            actions,
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

const getTransferPermissions = async (req, res) => {
    try {
        return res.status(200).json({
            success: true,
            permissions: getPermissionsForUser(req.user),
            workflow: {
                steps: ["PENDING", "APPROVED", "IN_TRANSIT", "COMPLETED"],
                terminal: ["REJECTED", "CANCELLED"]
            }
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

const getBranchStockAvailability = async (req, res) => {
    try {
        const branchId = resolveAvailabilityBranchId(req);

        if (!branchId || !mongoose.Types.ObjectId.isValid(branchId)) {
            return res.status(400).json({
                success: false,
                message: "A valid branchId is required for stock availability."
            });
        }

        const branchExists = await Branch.exists({ _id: branchId });
        if (!branchExists) {
            return res.status(404).json({ success: false, message: "Branch not found." });
        }

        const inventory = await Inventory.find({ branch: branchId })
            .populate("product", "name barcode category")
            .populate("branch", "name code")
            .sort({ "product.name": 1 });

        const data = inventory.map((row) => ({
            productId: row.product?._id,
            name: row.product?.name,
            barcode: row.product?.barcode,
            sku: row.product?.sku || null,
            branchId: row.branch?._id,
            branchName: row.branch?.name,
            quantity: row.quantity,
            reservedStock: row.reservedStock,
            availableQuantity: Math.max(Number(row.quantity) - Number(row.reservedStock || 0), 0),
            lowStockAlert: row.lowStockAlert
        }));

        return res.status(200).json({
            success: true,
            branchId,
            data,
            count: data.length
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

const listInventoryMovements = async (req, res) => {
    try {
        const filters = {
            ...buildMovementScopeFilter(req.user)
        };

        if (req.query.transferId) {
            filters.transfer = req.query.transferId;
        }

        if (req.query.branch) {
            filters.branch = req.query.branch;
        }

        if (req.query.product) {
            filters.product = req.query.product;
        }

        const { page, limit, skip } = parsePagination(req.query);

        const [data, total] = await Promise.all([
            InventoryMovement.find(filters)
                .populate("branch", "name code")
                .populate("product", "name barcode")
                .populate("performedBy", "firstName lastName email")
                .populate("transfer", "status fromBranch toBranch")
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit),
            InventoryMovement.countDocuments(filters)
        ]);

        return res.status(200).json({
            success: true,
            data,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

const getTransferActivityLogs = async (req, res) => {
    try {
        const transferFilter = buildTransferScopeFilter(req.user);
        const { page, limit, skip } = parsePagination(req.query);

        const transfers = await StockTransfer.find(transferFilter)
            .select("activityLogs fromBranch toBranch status")
            .populate("fromBranch", "name code")
            .populate("toBranch", "name code")
            .populate("activityLogs.changedBy", "firstName lastName email role");

        const logs = transfers.flatMap((transfer) =>
            (transfer.activityLogs || []).map((log) => ({
                transferId: transfer._id,
                status: transfer.status,
                fromBranch: transfer.fromBranch,
                toBranch: transfer.toBranch,
                logStatus: log.status,
                note: log.note,
                changedBy: log.changedBy,
                changedAt: log.changedAt
            }))
        );

        logs.sort((a, b) => new Date(b.changedAt) - new Date(a.changedAt));
        const paged = logs.slice(skip, skip + limit);

        return res.status(200).json({
            success: true,
            data: paged,
            pagination: {
                page,
                limit,
                total: logs.length,
                totalPages: Math.ceil(logs.length / limit)
            }
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

const getBranchTransferReports = async (req, res) => {
    try {
        const match = {
            ...buildTransferFilters(req.query),
            ...buildTransferScopeFilter(req.user)
        };

        const reports = await StockTransfer.aggregate([
            { $match: match },
            {
                $facet: {
                    byStatus: [{ $group: { _id: "$status", count: { $sum: 1 } } }],
                    byFromBranch: [
                        {
                            $group: {
                                _id: "$fromBranch",
                                total: { $sum: 1 },
                                units: { $sum: { $sum: "$items.quantity" } }
                            }
                        },
                        {
                            $lookup: {
                                from: "branches",
                                localField: "_id",
                                foreignField: "_id",
                                as: "branch"
                            }
                        },
                        { $unwind: { path: "$branch", preserveNullAndEmptyArrays: true } },
                        {
                            $project: {
                                branchId: "$_id",
                                branchName: "$branch.name",
                                branchCode: "$branch.code",
                                totalTransfers: "$total",
                                totalUnits: "$units"
                            }
                        }
                    ],
                    byToBranch: [
                        {
                            $group: {
                                _id: "$toBranch",
                                total: { $sum: 1 },
                                units: { $sum: { $sum: "$items.quantity" } }
                            }
                        },
                        {
                            $lookup: {
                                from: "branches",
                                localField: "_id",
                                foreignField: "_id",
                                as: "branch"
                            }
                        },
                        { $unwind: { path: "$branch", preserveNullAndEmptyArrays: true } },
                        {
                            $project: {
                                branchId: "$_id",
                                branchName: "$branch.name",
                                branchCode: "$branch.code",
                                totalTransfers: "$total",
                                totalUnits: "$units"
                            }
                        }
                    ]
                }
            }
        ]);

        return res.status(200).json({
            success: true,
            data: reports[0] || { byStatus: [], byFromBranch: [], byToBranch: [] }
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

const getTransferAnalytics = async (req, res) => {
    try {
        const filters = {
            ...buildTransferFilters(req.query),
            ...buildTransferScopeFilter(req.user)
        };
        const pipeline = [{ $match: filters }];

        const [statusSummary, volumeSummary, topProducts, cancelledCount] = await Promise.all([
            StockTransfer.aggregate([
                ...pipeline,
                { $group: { _id: "$status", count: { $sum: 1 } } }
            ]),
            StockTransfer.aggregate([
                ...pipeline,
                { $unwind: "$items" },
                {
                    $group: {
                        _id: null,
                        totalUnits: { $sum: "$items.quantity" },
                        totalTransfers: { $sum: 1 }
                    }
                }
            ]),
            StockTransfer.aggregate([
                ...pipeline,
                { $unwind: "$items" },
                {
                    $group: {
                        _id: "$items.product",
                        quantity: { $sum: "$items.quantity" }
                    }
                },
                { $sort: { quantity: -1 } },
                { $limit: 5 },
                {
                    $lookup: {
                        from: "products",
                        localField: "_id",
                        foreignField: "_id",
                        as: "product"
                    }
                },
                { $unwind: "$product" },
                {
                    $project: {
                        _id: 0,
                        productId: "$product._id",
                        name: "$product.name",
                        barcode: "$product.barcode",
                        quantity: 1
                    }
                }
            ]),
            StockTransfer.countDocuments({ ...filters, status: "CANCELLED" })
        ]);

        return res.status(200).json({
            success: true,
            statusSummary,
            volumeSummary: volumeSummary[0] || { totalUnits: 0, totalTransfers: 0 },
            topProducts,
            cancelledCount
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

module.exports = {
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
};
