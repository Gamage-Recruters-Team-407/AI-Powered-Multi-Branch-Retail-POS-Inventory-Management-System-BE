const mongoose = require('mongoose');

// Maps human-readable frequency to cron expression
const FREQUENCY_CRON_MAP = {
    'Every day at 8:00 AM':          '0 8 * * *',
    'Every day at 8:00 PM':          '0 20 * * *',
    'Every Monday at 9:00 AM':       '0 9 * * 1',
    'Every Friday at 6:00 PM':       '0 18 * * 5',
    'First day of every month':      '0 0 1 * *',
    'Every 3 months':                '0 0 1 */3 *',
};

const scheduledReportSchema = new mongoose.Schema(
    {
        title: {
            type: String,
            required: true,
            trim: true,
        },
        type: {
            type: String,
            enum: ['Sales', 'Inventory', 'Branch Performance', 'Business Summary'],
            default: 'Sales',
        },
        frequency: {
            type: String,
            required: true,
        },
        cronExpression: {
            type: String,
        },
        active: {
            type: Boolean,
            default: true,
        },
        nextRun: {
            type: Date,
        },
        lastRun: {
            type: Date,
        },
        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
        },
    },
    { timestamps: true }
);

// Auto-compute cron expression from frequency before saving
scheduledReportSchema.pre('save', function () {
    if (this.frequency && !this.cronExpression) {
        this.cronExpression = FREQUENCY_CRON_MAP[this.frequency] || '0 8 * * *';
    }
});

scheduledReportSchema.statics.FREQUENCY_CRON_MAP = FREQUENCY_CRON_MAP;

module.exports = mongoose.model('ScheduledReport', scheduledReportSchema);
