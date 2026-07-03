const supplierService = require("../services/supplierService");

// CREATE
exports.createSupplier = async (req, res, next) => {
    try {
        const data = await supplierService.createSupplier(req.body);

        return res.status(201).json({
            success: true,
            message: "Supplier created",
            data
        });

    } catch (err) {
        if (err.name === 'ValidationError') {
            return res.status(400).json({
                success: false,
                message: err.message
            });
        }
        next(err);
    }
};

// GET ALL
exports.getSuppliers = async (req, res, next) => {
    try {
        const search = req.query.search || "";
        const category = req.query.category || "";
        const status = req.query.status || "";
        
        const data = await supplierService.getAllSuppliers(search, category, status);

        return res.json({
            success: true,
            count: data.length,
            data
        });

    } catch (err) {
        next(err);
    }
};

// GET ONE
exports.getSupplier = async (req, res, next) => {
    try {
        const data = await supplierService.getSupplierById(req.params.id);

        if (!data) {
            return res.status(404).json({
                success: false,
                message: "Supplier not found"
            });
        }

        return res.json({
            success: true,
            data
        });

    } catch (err) {
        next(err);
    }
};

// UPDATE
exports.updateSupplier = async (req, res, next) => {
    try {
        const data = await supplierService.updateSupplier(
            req.params.id,
            req.body
        );

        if (!data) {
            return res.status(404).json({
                success: false,
                message: "Supplier not found"
            });
        }

        return res.json({
            success: true,
            message: "Supplier updated",
            data
        });

    } catch (err) {
        if (err.name === 'ValidationError') {
            return res.status(400).json({
                success: false,
                message: err.message
            });
        }
        next(err);
    }
};

// DELETE
exports.deleteSupplier = async (req, res, next) => {
    try {
        const data = await supplierService.deleteSupplier(req.params.id);

        if (!data) {
            return res.status(404).json({
                success: false,
                message: "Supplier not found"
            });
        }

        return res.json({
            success: true,
            message: "Supplier deleted"
        });

    } catch (err) {
        next(err);
    }
};

// ADD TRANSACTION
exports.addTransaction = async (req, res, next) => {
    try {
        const { id } = req.params;
        const data = await supplierService.addTransaction(id, req.body);

        if (!data) {
            return res.status(404).json({
                success: false,
                message: "Supplier not found"
            });
        }

        return res.status(201).json({
            success: true,
            message: "Transaction added successfully",
            data
        });
    } catch (err) {
        if (err.name === 'ValidationError') {
            return res.status(400).json({
                success: false,
                message: err.message
            });
        }
        next(err);
    }
};

// UPDATE TRANSACTION STATUS
exports.updateTransactionStatus = async (req, res, next) => {
    try {
        const { id, txnId } = req.params;
        const { status } = req.body;
        const data = await supplierService.updateTransactionStatus(id, txnId, status);

        if (!data) {
            return res.status(404).json({
                success: false,
                message: "Supplier or transaction not found"
            });
        }

        return res.json({
            success: true,
            message: "Transaction status updated successfully",
            data: data.supplier || data.po
        });
    } catch (err) {
        if (err.name === 'ValidationError') {
            return res.status(400).json({
                success: false,
                message: err.message
            });
        }
        next(err);
    }
};


// GET PROCUREMENT HISTORY
exports.getProcurementHistory = async (req, res, next) => {
    try {
        const { id } = req.params;
        const data = await supplierService.getProcurementHistory(id);

        if (!data) {
            return res.status(404).json({
                success: false,
                message: "Supplier not found"
            });
        }

        return res.json({
            success: true,
            data
        });
    } catch (err) {
        next(err);
    }
};

// GET PERFORMANCE REPORT
exports.getPerformanceReport = async (req, res, next) => {
    try {
        const { id } = req.params;
        const data = await supplierService.getPerformanceReport(id);

        if (!data) {
            return res.status(404).json({
                success: false,
                message: "Supplier not found"
            });
        }

        return res.json({
            success: true,
            data
        });
    } catch (err) {
        next(err);
    }
};

// GET ALL PERFORMANCE REPORTS
exports.getAllPerformanceReports = async (req, res, next) => {
    try {
        const data = await supplierService.getAllPerformanceReports();
        return res.json({
            success: true,
            count: data.length,
            data
        });
    } catch (err) {
        next(err);
    }
};

// GET CONTRACT DETAILS
exports.getContract = async (req, res, next) => {
    try {
        const { id } = req.params;
        const supplier = await supplierService.getSupplierById(id);

        if (!supplier) {
            return res.status(404).json({
                success: false,
                message: "Supplier not found"
            });
        }

        return res.json({
            success: true,
            data: supplier.contract || {}
        });
    } catch (err) {
        next(err);
    }
};

// UPDATE CONTRACT DETAILS
exports.updateContract = async (req, res, next) => {
    try {
        const { id } = req.params;
        const data = await supplierService.updateContract(id, req.body);

        if (!data) {
            return res.status(404).json({
                success: false,
                message: "Supplier not found"
            });
        }

        return res.json({
            success: true,
            message: "Contract updated successfully",
            data: data.contract
        });
    } catch (err) {
        if (err.name === 'ValidationError') {
            return res.status(400).json({
                success: false,
                message: err.message
            });
        }
        next(err);
    }
};
