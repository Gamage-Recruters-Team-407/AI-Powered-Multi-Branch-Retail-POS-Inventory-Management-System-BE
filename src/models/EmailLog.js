const mongoose = require("mongoose");

const emailLogSchema = new mongoose.Schema(
  {
    recipient: {
      type: String,
      required: true
    },
    subject: {
      type: String,
      required: true
    },
    text: {
      type: String,
      required: true
    },
    html: {
      type: String
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

module.exports = mongoose.model("EmailLog", emailLogSchema);
