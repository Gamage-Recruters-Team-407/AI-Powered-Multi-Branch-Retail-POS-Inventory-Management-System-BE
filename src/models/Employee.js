const mongoose = require("mongoose");

const employeeSchema = new mongoose.Schema(
{
    employeeId: {
        type: String,
        unique: true
    },

    firstName: String,
    lastName: String,

    email: String,

    phone: String,

    role: String,

    salary: Number,

    branch:{
        type:mongoose.Schema.Types.ObjectId,
        ref:"Branch"
    },

    joiningDate: Date,

    photo: {
        type: String,
        default: ""
    },

    status: {
        type: String,
        default: "Active"
    },

    performanceScore: {
        type: Number,
        default: 4.0
    },

    workingStatus: {
        type: String,
        default: "Off Duty"
    },

    attendance: [
        {
            date: Date,
            status: {
                type: String,
                enum: ["PRESENT", "ABSENT", "LEAVE", "Present", "Late"]
            }
        }
    ]
},
{ timestamps: true }
);

module.exports = mongoose.model("Employee", employeeSchema);