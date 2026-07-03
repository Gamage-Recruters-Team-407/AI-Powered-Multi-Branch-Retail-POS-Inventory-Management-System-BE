const mongoose = require('mongoose');

const systemJobSchema = new mongoose.Schema(
  {
    jobName: {
      type: String,
      required: true,
      unique: true,
    },
    lastRunTime: {
      type: Date,
      required: true,
    },
    status: {
      type: String,
      enum: ['Success', 'Failed'],
      default: 'Success',
    },
  },
  {
    timestamps: true,
  }
);

const SystemJob = mongoose.model('SystemJob', systemJobSchema);
module.exports = SystemJob;
