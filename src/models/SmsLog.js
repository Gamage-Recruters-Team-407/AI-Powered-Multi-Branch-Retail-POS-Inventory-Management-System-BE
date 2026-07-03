const mongoose = require("mongoose");

const smsLogSchema = new mongoose.Schema(
  {
    recipientId: {
      type: mongoose.Schema.Types.ObjectId,
      required: false
    },
    recipientType: {
      type: String,
      enum: ["Supplier", "Warehouse", "Employee", "Customer"],
      required: false
    },
    recipientPhone: {
      type: String,
      required: true
    },
    message: {
      type: String,
      required: true
    },
    status: {
      type: String,
      enum: ["Sent", "Failed"],
      required: true
    },
    errorMessage: {
      type: String,
      default: ""
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model("SmsLog", smsLogSchema);
