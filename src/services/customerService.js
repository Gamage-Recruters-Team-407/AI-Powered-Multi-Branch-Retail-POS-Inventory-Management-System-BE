const Customer = require("../models/Customer");
const Sale = require("../models/Sale");
const { sendEmail } = require("../utils/emailSender");

class CustomerService {

    // CREATE CUSTOMER
    async createCustomer(data) {
        return await Customer.create(data);
    }

    // GET ALL CUSTOMERS + SEARCH (name, email, phone)
    async getAllCustomers(search = "") {

        const query = {};

        if (search) {
            query.$or = [
                { firstName: { $regex: search, $options: "i" } },
                { lastName: { $regex: search, $options: "i" } },
                { email: { $regex: search, $options: "i" } },
                { phone: { $regex: search, $options: "i" } }
            ];
        }

        return await Customer.find(query)
            .populate("preferredBranch")
            .sort({ createdAt: -1 });
    }

    // GET ONE CUSTOMER
    async getCustomerById(id) {
        return await Customer.findById(id)
            .populate("preferredBranch");
    }

    // UPDATE CUSTOMER
    async updateCustomer(id, data) {
        return await Customer.findByIdAndUpdate(
            id,
            data,
            { returnDocument: 'after' }
        );
    }

    // DELETE CUSTOMER
    async deleteCustomer(id) {
        return await Customer.findByIdAndDelete(id);
    }

    // GET CUSTOMERS BY BRANCH
    async getCustomersByBranchId(branchId, search = "") {

        const query = {
            preferredBranch: branchId
        };

        if (search) {
            query.$and = [
                {
                    preferredBranch: branchId
                },
                {
                    $or: [
                        { firstName: { $regex: search, $options: "i" } },
                        { lastName: { $regex: search, $options: "i" } },
                        { email: { $regex: search, $options: "i" } },
                        { phone: { $regex: search, $options: "i" } }
                    ]
                }
            ];
    }

        return await Customer.find(query)
            .populate("preferredBranch")
            .sort({ createdAt: -1 });
    }

    /* // PURCHASE HISTORY (FROM SALE MODULE)
    async getPurchaseHistory(customerId) {

        return await Sale.find({ customer: customerId })
            .populate("items.product")
            .populate("branch")
            .sort({ createdAt: -1 });
    } */

    // LOYALTY POINT UPDATE (CALLED FROM POS)
    async addLoyaltyPoints(customerId, amount) {

        const points = Math.floor(amount / 1000);

        const customer = await Customer.findByIdAndUpdate(
            customerId,
            {
                $inc: {
                    loyaltyPoints: points,
                    totalPurchases: amount
                }
            },
            { returnDocument: 'after' }
        );

        if (!customer) {
            throw new Error("Customer not found");
        }

        if (customer.totalPurchases >= 2500000) {
            customer.customerType = "PLATINUM";
        }
        else if (customer.totalPurchases >= 1000000) {
            customer.customerType = "GOLD";
        }
        else if (customer.totalPurchases >= 200000) {
            customer.customerType = "SILVER";
        }
        else {
            customer.customerType = "BRONZE";
        }

        await customer.save();

        // ✉️ Send Automated Loyalty E-Receipt
        if (customer.email && points > 0) {
            const subject = "🎁 You Earned Loyalty Points!";
            const textContent = `Hello ${customer.firstName},\n\nYou just earned ${points} loyalty points on your recent purchase!\nYour total points balance is now ${customer.loyaltyPoints}.\n\nYou are currently a ${customer.customerType} tier member.\n\nThank you for shopping with us!`;
            
            const htmlContent = `
                <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 10px;">
                    <h2 style="color: #3b82f6;">🎁 Loyalty Points Earned!</h2>
                    <p style="font-size: 16px; color: #1e293b;">Hello <strong>${customer.firstName}</strong>,</p>
                    <p style="font-size: 16px; color: #1e293b;">You just earned <strong>${points} loyalty points</strong> on your recent purchase!</p>
                    <div style="background-color: #f8fafc; padding: 15px; border-radius: 8px; margin: 20px 0;">
                        <p style="margin: 0; font-size: 16px;"><strong>Total Points Balance:</strong> <span style="color: #2563eb; font-weight: bold; font-size: 18px;">${customer.loyaltyPoints}</span></p>
                        <p style="margin: 5px 0 0 0; font-size: 14px;"><strong>Current Tier:</strong> <span style="display: inline-block; padding: 4px 10px; background-color: #fef3c7; color: #d97706; border-radius: 20px; font-weight: bold;">${customer.customerType}</span></p>
                    </div>
                    <p style="font-size: 14px; color: #64748b;">Thank you for shopping with us! We look forward to seeing you again soon.</p>
                </div>
            `;
            
            // Dispatch asynchronously so it doesn't block the API response
            sendEmail(customer.email, subject, textContent, htmlContent).catch(err => {
                console.error("[Loyalty Email Failed]", err.message);
            });
        }

        return customer;
    }

    // CUSTOMER TYPE UPDATE (CALLED FROM POS AFTER PURCHASE)
    async updateCustomerType(customerId) {

        const customer = await Customer.findById(customerId);

        if (!customer) {
            throw new Error("Customer not found");
        }

        let customerType = "BRONZE";

        if (customer.totalPurchases >= 50000) {
            customerType = "SILVER";
        }

        if (customer.totalPurchases >= 100000) {
            customerType = "GOLD";
        }

        if (customer.totalPurchases >= 250000) {
            customerType = "PLATINUM";
        }

        customer.customerType = customerType;

        await customer.save();

        return customer;
    }

    // ANALYTICS
    async getAnalytics() {

        const totalCustomers = await Customer.countDocuments();

        const topCustomers = await Customer.find()
            .sort({ totalPurchases: -1 })
            .limit(5);

        const totalLoyaltyUsers = await Customer.countDocuments({
            loyaltyPoints: { $gt: 0 }
        });

        return {
            totalCustomers,
            totalLoyaltyUsers,
            topCustomers
        };
    } 
}

module.exports = new CustomerService();