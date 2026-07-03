const Inventory = require("../models/Inventory");
const Branch = require('../models/Branch');
const User = require("../models/User");
const Notification = require("../models/Notification");
const SystemJob = require("../models/SystemJob");

// Try-catch loading of node-cron to allow standard timer fallbacks in non-configured dev environments
let cron;
try {
    cron = require("node-cron");
} catch (err) {
    cron = null;
}

/**
 * Main routine to audit low-stock items and register notifications for branch admins and managers
 */
const checkLowStockAndNotify = async () => {
    try {
        console.log("[Inventory Cron Job] Running scheduled low stock check...");

        // 0. Time-Stamping Check: Prevent running more than once per day
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const jobRecord = await SystemJob.findOne({ jobName: "InventoryAlert" });
        if (jobRecord && jobRecord.lastRunTime >= today) {
            console.log("[Inventory Cron Job] Already ran today. Skipping execution.");
            return;
        }

        // 1. Find all active inventory records where lowStockAlert is flagged true
        const lowStockItems = await Inventory.find({ lowStockAlert: true })
            .populate("product")
            .populate("branch")
            .exec();

        if (lowStockItems.length === 0) {
            console.log("[Inventory Cron Job] No low-stock items identified. All good.");
            return;
        }

        console.log(`[Inventory Cron Job] Identified ${lowStockItems.length} low-stock inventory records.`);

        // 2. Query for users holding administrative roles who must receive notifications
        const administrators = await User.find({
            role: { $in: ["SUPER_ADMIN", "ADMIN", "MANAGER"] },
            isActive: true
        }).exec();

        if (administrators.length === 0) {
            console.log("[Inventory Cron Job] No active administrators or managers found to notify.");
            return;
        }

        let notificationsCreated = 0;
        let lowStockListText = "Here are the current items that are running low on stock:\n\n";

        // 3. Loop through low stock items and notify each administrator
        for (const item of lowStockItems) {
            const productName = item.product ? item.product.name : "Unknown Product";
            const branchName = item.branch ? item.branch.name : "Unknown Branch";
            const reorderLevel = item.product ? item.product.reorderLevel : 0;
            const currentQty = item.quantity;

            lowStockListText += `- ${productName} (${branchName}): ${currentQty} units remaining (Threshold: ${reorderLevel})\n`;

            const title = `⚠️ Low Stock Alert: ${productName}`;
            const message = `Product '${productName}' is running low in branch '${branchName}'. Current stock: ${currentQty} units (Reorder Threshold: ${reorderLevel} units). Please prepare a replenishment purchase order.`;

            for (const admin of administrators) {
                // To avoid notification spam, check if an unread warning notification already exists
                const existingNotification = await Notification.findOne({
                    user: admin._id,
                    title: title,
                    isRead: false
                }).exec();

                if (!existingNotification) {
                    await Notification.create({
                        user: admin._id,
                        title: title,
                        message: message,
                        type: "WARNING",
                        isRead: false
                    });
                    notificationsCreated++;
                }
            }
        }

        // Consolidated Email Sending
        if (notificationsCreated > 0) {
            const systemEvents = require("../events/eventBus");
            systemEvents.emit('SEND_ALERT', {
                target: { roles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER'] },
                category: 'INVENTORY',
                title: '⚠️ Daily Low Stock Summary Report',
                message: `Hello,\n\nThe system has detected new items running below their reorder threshold. Please review the following low-stock inventory:\n\n${lowStockListText}\n\nLog in to the POS Dashboard to prepare replenishment purchase orders.`,
                type: 'WARNING',
                channels: ['email'] // ONLY EMAIL
            });
        }

        console.log(`[Inventory Cron Job] Done. Registered ${notificationsCreated} new alert notifications across administrative users.`);

        // Update Time-Stamp
        await SystemJob.findOneAndUpdate(
            { jobName: "InventoryAlert" },
            { lastRunTime: new Date(), status: "Success" },
            { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
        );
    } catch (error) {
        console.error("[Inventory Cron Job Error]:", error);
    }
};

/**
 * Initializes and schedules the background low stock audit task
 */
const initInventoryAlertJob = () => {
    if (cron) {
        // Schedule job to run at 8:00 AM every day (0 8 * * *)
        cron.schedule("0 8 * * *", checkLowStockAndNotify);
        console.log("[Inventory Cron Job] Node-cron service scheduled successfully: Run every day at 8:00 AM.");
    } else {
        // Fallback to standard Node interval (every 24 hours) if cron package isn't loaded
        const ONE_DAY = 24 * 60 * 60 * 1000;
        setInterval(checkLowStockAndNotify, ONE_DAY);
        console.log("[Inventory Cron Job] Node-cron missing. Falling back to standard setInterval timer: Run every 24 hours.");
    }

    // Run once immediately on startup so administrators don't wait an hour for initial audit alerts
    checkLowStockAndNotify();
};

module.exports = {
    checkLowStockAndNotify,
    initInventoryAlertJob
};
