const Supplier = require("../models/Supplier");

class SupplierService {
    // CREATE SUPPLIER
    async createSupplier(data) {
        return await Supplier.create(data);
    }

    // GET ALL SUPPLIERS + SEARCH & FILTER
    async getAllSuppliers(search = "", category = "", status = "") {
        const mongoose = require("mongoose");
        if (mongoose.connection.readyState !== 1) {
            return [];
        }

        const query = {};

        if (search) {
            query.$or = [
                { companyName: { $regex: search, $options: "i" } },
                { contactPerson: { $regex: search, $options: "i" } },
                { email: { $regex: search, $options: "i" } },
                { phone: { $regex: search, $options: "i" } }
            ];
        }

        if (category) {
            query.category = category;
        }

        if (status) {
            query.status = status;
        }

        return await Supplier.find(query).sort({ createdAt: -1 });
    }

    // GET ONE SUPPLIER
    async getSupplierById(id) {
        return await Supplier.findById(id);
    }

    // UPDATE SUPPLIER
    async updateSupplier(id, data) {
        return await Supplier.findByIdAndUpdate(
            id,
            data,
            { returnDocument: 'after', runValidators: true }
        );
    }

    // DELETE SUPPLIER
    async deleteSupplier(id) {
        return await Supplier.findByIdAndDelete(id);
    }

    // ADD TRANSACTION
    async addTransaction(id, transactionData) {
        const supplier = await Supplier.findById(id);
        if (!supplier) return null;

        if (!supplier.transactions) {
            supplier.transactions = [];
        }

        supplier.transactions.push(transactionData);

        if (transactionData.status === "Delivered") {
            supplier.totalSpend = (supplier.totalSpend || 0) + Number(transactionData.amount || 0);
        }

        const total = supplier.transactions.length;
        const delivered = supplier.transactions.filter(t => t.status === "Delivered").length;
        const cancelled = supplier.transactions.filter(t => t.status === "Cancelled").length;

        supplier.performance.returnRate = total > 0 ? Number(((cancelled / total) * 100).toFixed(2)) : 0.0;
        supplier.performance.onTimeDelivery = total > 0 ? Number(((delivered / total) * 100).toFixed(2)) : 95;

        let recommendation = "Stable performance. Standard operations recommended.";
        const rating = supplier.rating || 5.0;
        const onTime = supplier.performance.onTimeDelivery;
        const retRate = supplier.performance.returnRate;
        const quality = supplier.performance.qualityScore || 95;
        const leadTime = supplier.performance.leadTimeDays || 3;

        if (rating >= 4.5 && onTime >= 90) {
            recommendation = "Excellent performance. Highly recommended to renew contract.";
        } else if (retRate > 10 || quality < 80) {
            recommendation = "Caution: High return rate or low quality. Consider auditing quality processes.";
        } else if (onTime < 80 || leadTime > 5) {
            recommendation = "Warning: Slow delivery times. Recommend discussing lead times with supplier.";
        }
        supplier.aiRecommendation = recommendation;

        return await supplier.save();
    }

    // GET PROCUREMENT HISTORY
    async getProcurementHistory(id) {
        const PurchaseOrder = require("../models/PurchaseOrder");
        const supplier = await Supplier.findById(id);
        if (!supplier) return null;

        const manualTxns = (supplier.transactions || []).map(t => ({
            id: t.id,
            date: t.date,
            itemsCount: t.itemsCount,
            amount: t.amount,
            status: t.status,
            type: "Manual"
        }));

        const pos = await PurchaseOrder.find({
            $or: [
                { supplier: id },
                { supplierName: { $regex: new RegExp("^" + supplier.companyName.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&') + "$", "i") } }
            ]
        });

        const poTxns = pos.map(po => {
            const itemsCount = po.items ? po.items.reduce((sum, item) => sum + (item.quantity || 0), 0) : 0;
            const dateStr = po.orderDate ? new Date(po.orderDate).toISOString().slice(0, 10) : "";
            
            let status = "Pending";
            if (["Received", "RECEIVED"].includes(po.status)) {
                status = "Delivered";
            } else if (["Rejected", "CANCELLED"].includes(po.status)) {
                status = "Cancelled";
            } else if (["Approved", "APPROVED", "Pending", "PENDING"].includes(po.status)) {
                status = "Pending";
            }

            return {
                id: po.poNumber || po._id.toString(),
                date: dateStr,
                itemsCount,
                amount: po.totalAmount || 0,
                status,
                type: "Purchase Order"
            };
        });

        const combined = [...manualTxns, ...poTxns].sort((a, b) => new Date(b.date) - new Date(a.date));

        const totalAmount = combined.reduce((sum, t) => sum + (t.status === "Delivered" ? t.amount : 0), 0);
        const counts = combined.reduce((acc, t) => {
            if (t.status === "Delivered") acc.delivered++;
            else if (t.status === "Cancelled") acc.cancelled++;
            else acc.pending++;
            return acc;
        }, { delivered: 0, pending: 0, cancelled: 0 });

        return {
            supplierId: id,
            companyName: supplier.companyName,
            totalSpend: totalAmount,
            metrics: {
                totalCount: combined.length,
                manualCount: manualTxns.length,
                purchaseOrderCount: poTxns.length,
                statusDistribution: counts
            },
            history: combined
        };
    }

    // GET PERFORMANCE REPORT
    async getPerformanceReport(id) {
        const supplier = await Supplier.findById(id);
        if (!supplier) return null;

        const historyData = await this.getProcurementHistory(id);

        let recommendation = supplier.aiRecommendation || "";
        if (!recommendation) {
            recommendation = "Stable performance. Standard operations recommended.";
            const rating = supplier.rating || 5.0;
            const onTime = supplier.performance?.onTimeDelivery || 95;
            const retRate = supplier.performance?.returnRate || 0;
            const quality = supplier.performance?.qualityScore || 95;
            const leadTime = supplier.performance?.leadTimeDays || 3;

            if (rating >= 4.5 && onTime >= 90) {
                recommendation = "Excellent performance. Highly recommended to renew contract.";
            } else if (retRate > 10 || quality < 80) {
                recommendation = "Caution: High return rate or low quality. Consider auditing quality processes.";
            } else if (onTime < 80 || leadTime > 5) {
                recommendation = "Warning: Slow delivery times. Recommend discussing lead times with supplier.";
            }
            supplier.aiRecommendation = recommendation;
            await supplier.save();
        }

        return {
            supplier: {
                id: supplier._id,
                companyName: supplier.companyName,
                contactPerson: supplier.contactPerson,
                email: supplier.email,
                phone: supplier.phone,
                status: supplier.status,
                rating: supplier.rating,
                category: supplier.category
            },
            contract: supplier.contract || {},
            performance: supplier.performance || {},
            metrics: {
                totalSpend: historyData ? historyData.totalSpend : supplier.totalSpend,
                transactionCount: historyData ? historyData.metrics.totalCount : 0,
                purchaseOrderCount: historyData ? historyData.metrics.purchaseOrderCount : 0,
                manualTransactionCount: historyData ? historyData.metrics.manualCount : 0,
                statusDistribution: historyData ? historyData.metrics.statusDistribution : { delivered: 0, pending: 0, cancelled: 0 }
            },
            aiRecommendation: recommendation
        };
    }

    // GET ALL PERFORMANCE REPORTS
    async getAllPerformanceReports() {
        const mongoose = require("mongoose");
        const PurchaseOrder = require("../models/PurchaseOrder");
        if (mongoose.connection.readyState !== 1) {
            return [];
        }
        const suppliers = await Supplier.find({});
        const reports = await Promise.all(suppliers.map(async (supplier) => {
            const purchaseOrderCount = await PurchaseOrder.countDocuments({
                $or: [
                    { supplier: supplier._id },
                    {
                        supplierName: {
                            $regex: new RegExp(
                                "^" + supplier.companyName.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&') + "$",
                                "i",
                            ),
                        },
                    },
                ],
            });

            let recommendation = supplier.aiRecommendation;
            if (!recommendation) {
                recommendation = "Stable performance. Standard operations recommended.";
                const rating = supplier.rating || 5.0;
                const onTime = supplier.performance?.onTimeDelivery || 95;
                const retRate = supplier.performance?.returnRate || 0;
                const quality = supplier.performance?.qualityScore || 95;
                const leadTime = supplier.performance?.leadTimeDays || 3;

                if (rating >= 4.5 && onTime >= 90) {
                    recommendation = "Excellent performance. Highly recommended to renew contract.";
                } else if (retRate > 10 || quality < 80) {
                    recommendation = "Caution: High return rate or low quality. Consider auditing quality processes.";
                } else if (onTime < 80 || leadTime > 5) {
                    recommendation = "Warning: Slow delivery times. Recommend discussing lead times with supplier.";
                }
            }

            return {
                id: supplier._id,
                companyName: supplier.companyName,
                category: supplier.category,
                rating: supplier.rating,
                status: supplier.status,
                totalSpend: supplier.totalSpend,
                purchaseOrderCount,
                performance: supplier.performance || {},
                contractStatus: supplier.contract?.status || "Under Negotiation",
                contractEndDate: supplier.contract?.endDate || null,
                aiRecommendation: recommendation
            };
        }));

        return reports;
    }

    // UPDATE CONTRACT
    async updateContract(id, contractData) {
        const supplier = await Supplier.findById(id);
        if (!supplier) return null;

        supplier.contract = {
            ...supplier.contract.toObject(),
            ...contractData
        };

        return await supplier.save();
    }

    // UPDATE TRANSACTION STATUS
    async updateTransactionStatus(supplierId, transactionId, status) {
        const mongoose = require("mongoose");
        const supplier = await Supplier.findById(supplierId);
        if (!supplier) return null;

        // 1. Try to find in manual transactions
        let foundManual = false;
        if (supplier.transactions) {
            const tIdx = supplier.transactions.findIndex(t => t.id === transactionId || (t._id && t._id.toString() === transactionId));
            if (tIdx !== -1) {
                foundManual = true;
                const oldStatus = supplier.transactions[tIdx].status;
                supplier.transactions[tIdx].status = status;

                const amount = Number(supplier.transactions[tIdx].amount || 0);
                if (oldStatus !== "Delivered" && status === "Delivered") {
                    supplier.totalSpend = (supplier.totalSpend || 0) + amount;
                } else if (oldStatus === "Delivered" && status !== "Delivered") {
                    supplier.totalSpend = Math.max(0, (supplier.totalSpend || 0) - amount);
                }

                const total = supplier.transactions.length;
                const delivered = supplier.transactions.filter(t => t.status === "Delivered").length;
                const cancelled = supplier.transactions.filter(t => t.status === "Cancelled").length;

                supplier.performance.returnRate = total > 0 ? Number(((cancelled / total) * 100).toFixed(2)) : 0.0;
                supplier.performance.onTimeDelivery = total > 0 ? Number(((delivered / total) * 100).toFixed(2)) : 95;

                let recommendation = "Stable performance. Standard operations recommended.";
                const rating = supplier.rating || 5.0;
                const onTime = supplier.performance.onTimeDelivery;
                const retRate = supplier.performance.returnRate;
                const quality = supplier.performance.qualityScore || 95;
                const leadTime = supplier.performance.leadTimeDays || 3;

                if (rating >= 4.5 && onTime >= 90) {
                    recommendation = "Excellent performance. Highly recommended to renew contract.";
                } else if (retRate > 10 || quality < 80) {
                    recommendation = "Caution: High return rate or low quality. Consider auditing quality processes.";
                } else if (onTime < 80 || leadTime > 5) {
                    recommendation = "Warning: Slow delivery times. Recommend discussing lead times with supplier.";
                }
                supplier.aiRecommendation = recommendation;

                await supplier.save();
                return { type: "manual", supplier };
            }
        }

        // 2. Try to find in Purchase Orders if not found in manual
        if (!foundManual) {
            try {
                const PurchaseOrder = require("../models/PurchaseOrder");
                let po = await PurchaseOrder.findOne({ poNumber: transactionId });
                if (!po && mongoose.Types.ObjectId.isValid(transactionId)) {
                    po = await PurchaseOrder.findById(transactionId);
                }
                if (po) {
                    let poStatus = "Pending";
                    if (status === "Delivered") poStatus = "Received";
                    else if (status === "Cancelled") poStatus = "Rejected";
                    
                    po.status = poStatus;
                    await po.save();
                    return { type: "po", po };
                }
            } catch (err) {
                console.error("Error updating PurchaseOrder in supplier service:", err);
            }
        }
        return null;
    }
}

module.exports = new SupplierService();
