const mongoose = require("mongoose");

const employeePerformanceSchema = new mongoose.Schema(
  {
    employeeId: {
      type: String, // String to match employee _id
      required: true,
      index: true
    },
    punctuality: {
      type: Number, // percentage, e.g., 90
      required: true
    },
    salesAchievement: {
      type: Number, // percentage, e.g., 95
      required: true
    },
    customerRating: {
      type: Number, // e.g., 4.5
      required: true
    },
    taskCompletion: {
      type: Number, // percentage, e.g., 90
      required: true
    },
    date: {
      type: String, // format: "YYYY-MM"
      required: true,
      index: true
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model("EmployeePerformance", employeePerformanceSchema);
