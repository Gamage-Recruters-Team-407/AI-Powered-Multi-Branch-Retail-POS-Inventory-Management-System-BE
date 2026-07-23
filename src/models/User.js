const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const userSchema = new mongoose.Schema(
  {
    firstName: String,
    lastName: String,

    name: String,

    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },

    password: {
      type: String,
      required: true,
      select: false,
    },

    phone: String,

    address: String,

    role: {
      type: String,
      enum: [
        "SUPER_ADMIN",
        "ADMIN",
        "MANAGER",
        "CASHIER",
        "EMPLOYEE",
        "super_admin",
        "admin",
        "manager",
        "cashier",
        "employee",
        "user",
      ],
      default: "user",
      uppercase: false,
    },

    branch: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Branch",
    },

    isActive: {
      type: Boolean,
      default: true,
    },

    // Employee fields
    salary: {
      type: Number,
      default: 0,
    },

    joiningDate: {
      type: Date,
    },

    workingStatus: {
      type: String,
      default: "Off Duty",
    },

    performanceScore: {
      type: Number,
      default: 0.0,
    },

    // Admin approval fields
    approvalStatus: {
      type: String,
      enum: ["PENDING", "APPROVED", "REJECTED"],
      default: "PENDING",
    },

    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    approvedAt: {
      type: Date,
      default: null,
    },

    // Password reset fields
    resetPasswordToken: String,
    resetPasswordExpire: Date,

    lastLogin: Date,
  },
  { timestamps: true }
);

userSchema.pre("save", async function () {
  if (!this.isModified("password")) return;

  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

userSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

module.exports = mongoose.model("User", userSchema);