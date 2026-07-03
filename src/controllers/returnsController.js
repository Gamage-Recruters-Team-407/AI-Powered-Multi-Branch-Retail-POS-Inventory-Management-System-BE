const returnsService = require("../services/returnsService");

exports.getInvoices = async (req, res) => {
    try {
        const invoices = await returnsService.getAllInvoices();
        return res.status(200).json({
            success: true,
            data: invoices
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

exports.getInvoiceById = async (req, res) => {
    try {
        const invoice = await returnsService.getInvoiceById(req.params.invoiceId);
        if (!invoice) {
            return res.status(404).json({
                success: false,
                message: "Invoice not found"
            });
        }
        return res.status(200).json({
            success: true,
            data: invoice
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

exports.getReturns = async (req, res) => {
    try {
        const returns = await returnsService.getAllReturns();
        return res.status(200).json({
            success: true,
            data: returns
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

exports.createReturn = async (req, res) => {
    try {
        const newReturn = await returnsService.createReturn(req.body);
        return res.status(201).json({
            success: true,
            message: "Return request created successfully",
            data: newReturn
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

exports.updateReturnStatus = async (req, res) => {
    try {
        const { status } = req.body;
        const updatedReturn = await returnsService.updateReturnStatus(req.params.id, status);
        return res.status(200).json({
            success: true,
            message: "Return status updated successfully",
            data: updatedReturn
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message
        });
    }
};
