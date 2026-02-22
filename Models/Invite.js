const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const InviteSchema = new Schema({
  code: {
    type: String,
    required: true,
    unique: true
  },
  companyId: {
    type: Schema.Types.ObjectId,
    ref: "Company",
    required: true
  },
  // Email of the person being invited
  email: {
    type: String,
    required: true,
    lowercase: true,
    trim: true
  },
  role: {
    type: String,
    required: true,
    enum: ['owner', 'admin', 'manager', 'editor', 'viewer', 'senior_teacher', 'teacher', 'content_reviewer', 'student', 'parent'],
    default: 'viewer'
  },
  // Email of the person who created the invite
  createdBy: {
    type: String,
    required: true,
    lowercase: true,
    trim: true
  },
  // Status of the invite
  status: {
    type: String,
    enum: ['pending', 'used', 'revoked'],
    default: 'pending'
  },
  usedAt: {
    type: Date,
    default: null
  },
  // Email of the user who used the invite (may differ from 'email' field)
  usedBy: {
    type: String,
    lowercase: true,
    trim: true,
    default: null
  }
}, {
  timestamps: true
});

// Index for faster lookups
// Note: 'code' already has unique: true which creates an index automatically
InviteSchema.index({ companyId: 1 });
InviteSchema.index({ email: 1 });
InviteSchema.index({ status: 1 });
// TTL index for automatic cleanup after 7 days
InviteSchema.index({ createdAt: 1 }, { expireAfterSeconds: 7 * 24 * 60 * 60 });

module.exports = mongoose.model("Invite", InviteSchema);


