const customerService = require("../services/customerService");
const systemEvents = require("../events/eventBus");
const { isMongoConnected } = require("../middleware/requireMongoConnection");

// CREATE
exports.createCustomer = async (req, res) => {
    try {

        const customer = await customerService.createCustomer(req.body);

        systemEvents.emit('SEND_ALERT', {
            target: { role: 'Manager' },
            category: 'CUSTOMER',
            type: 'INFO',
            title: 'New Customer Registered',
            message: `Customer ${customer.firstName || req.body.firstName} just registered.`,
            channels: ['in-app'],
        });

        return res.status(201).json({
            success: true,
            message: "Customer created successfully",
            data: customer
        });

    } catch (error) {

        if (error.code === 11000) {

            const duplicatedField = Object.keys(error.keyValue || {})[0];

            let message = "Duplicate field value";

            if (duplicatedField === "email") {
                message = "Customer email already exists";
            }

            if (duplicatedField === "phone") {
                message = "Customer phone already exists";
            }

            return res.status(409).json({
                success: false,
                message
            });
        }

        return res.status(500).json({
            success: false,
            message: "Failed to create customer"
        });
    }
};

// GET ALL
exports.getCustomers = async (req, res) => {
    if (!isMongoConnected()) {
        return res.json({ success: true, count: 0, data: [] });
    }
    try {
        const search = req.query.search || "";
        const data = await customerService.getAllCustomers(search);

        return res.json({
            success: true,
            count: data.length,
            data
        });

    } catch (err) {
        return res.status(500).json({
            success: false,
            message: err.message
        });
    }
};

// GET ONE
exports.getCustomer = async (req, res) => {
    try {
        const data = await customerService.getCustomerById(req.params.id);

        if (!data) {
            return res.status(404).json({
                success: false,
                message: "Customer not found"
            });
        }

        return res.json({
            success: true,
            data
        });

    } catch (err) {
        return res.status(500).json({
            success: false,
            message: err.message
        });
    }
};

// UPDATE
exports.updateCustomer = async (req, res) => {
    try {
        const data = await customerService.updateCustomer(
            req.params.id,
            req.body
        );

        return res.json({
            success: true,
            message: "Customer updated",
            data
        });

    } catch (err) {
        return res.status(500).json({
            success: false,
            message: err.message
        });
    }
};

// DELETE
exports.deleteCustomer = async (req, res) => {
    try {
        await customerService.deleteCustomer(req.params.id);

        return res.json({
            success: true,
            message: "Customer deleted"
        });

    } catch (err) {
        return res.status(500).json({
            success: false,
            message: err.message
        });
    }
};

// GET CUSTOMERS BY BRANCH
exports.getCustomersByBranch = async (req, res) => {

    try {

        const branchId = req.params.branchId;
        const search = req.query.search || "";

        const customers =
            await customerService.getCustomersByBranchId(
                branchId,
                search
            );

        return res.status(200).json({
            success: true,
            count: customers.length,
            data: customers
        });

    } catch (error) {

        return res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

// ADD LOYALTY POINTS
exports.addLoyaltyPoints = async (req, res) => {

    try {

        const { customerId, amount } = req.body;

        const customer =
            await customerService.addLoyaltyPoints(
                customerId,
                amount
            );

        systemEvents.emit('SEND_ALERT', {
            target: { role: 'Manager' },
            category: 'CUSTOMER',
            type: 'SUCCESS',
            title: 'Loyalty Points Awarded',
            message: `Customer ${customer.firstName || customerId} received ${amount} loyalty points.`,
            channels: ['in-app'],
        });

        return res.status(200).json({
            success: true,
            message: "Loyalty points updated",
            data: customer
        });

    } catch (error) {

        return res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

/* // PURCHASE HISTORY
exports.purchaseHistory = async (req, res) => {
    try {
        const data = await customerService.getPurchaseHistory(req.params.id);

        return res.json({
            success: true,
            data
        });

    } catch (err) {
        return res.status(500).json({
            success: false,
            message: err.message
        });
    }
}; */

// ANALYTICS
exports.analytics = async (req, res) => {
    try {
        const data = await customerService.getAnalytics();

        return res.json({
            success: true,
            data
        });

    } catch (err) {
        return res.status(500).json({
            success: false,
            message: err.message
        });
    }
};   