const mongoose = require("mongoose");

const employeeAttendanceSchema = new mongoose.Schema(
  {
    employeeId: {
      type: String, // String to support both string mock IDs and ObjectIds
      required: true,
      index: true
    },
    date: {
      type: String, // format: "YYYY-MM-DD"
      required: true,
      index: true
    },
    clockIn: {
      type: String, // e.g. "07:55 AM"
      default: ""
    },
    clockOut: {
      type: String, // e.g. "05:05 PM"
      default: ""
    },
    status: {
      type: String, // "Present", "Late", "Absent", "Leave"
      default: "Present"
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model("EmployeeAttendance", employeeAttendanceSchema);
