const mongoose = require("mongoose");

const employeeScheduleSchema = new mongoose.Schema(
  {
    employeeId: {
      type: String, // String to match employee _id (which could be emp_1, emp_2, or ObjectId)
      required: true,
      index: true
    },
    date: {
      type: String, // format: "YYYY-MM-DD"
      required: true,
      index: true
    },
    shift: {
      type: String, // e.g. "Morning", "Evening", "Off"
      required: true
    },
    notes: {
      type: String,
      default: ""
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model("EmployeeSchedule", employeeScheduleSchema);
