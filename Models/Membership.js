const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const MembershipSchema = new Schema({
  companyId: {
    type: Schema.Types.ObjectId,
    ref: "Company",
    required: true
  },
  userEmail: {
    type: String,
    required: true,
    lowercase: true,
    trim: true
  },
  role: {
    type: String,
    required: true,
    enum: ['owner', 'admin', 'senior_teacher', 'teacher', 'content_reviewer', 'student', 'parent'],
    default: 'teacher'
  }
}, {
  timestamps: true
});

// Compound index for unique membership per user+company
MembershipSchema.index({ companyId: 1, userEmail: 1 }, { unique: true });
// Index for user lookups
MembershipSchema.index({ userEmail: 1 });

module.exports = mongoose.model("Membership", MembershipSchema);


