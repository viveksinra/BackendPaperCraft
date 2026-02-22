const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const UserSchema = new Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    match: /^\S+@\S+\.\S+$/
  },
  password: {
    salt: {
      type: String,
      required: true
    },
    hash: {
      type: String,
      required: true
    }
  },
  firstName: {
    type: String,
    trim: true,
    maxlength: 50
  },
  lastName: {
    type: String,
    trim: true,
    maxlength: 50
  },
  photoURL: {
    type: String,
    trim: true,
    maxlength: 500
  },
  phoneNumber: {
    type: String,
    trim: true,
    maxlength: 20
  },
  about: {
    type: String,
    trim: true,
    maxlength: 500
  },
  registeredAs: {
    type: String,
    enum: ['parent', 'student', null],
    default: null
  },
  isSuperAdmin: {
    type: Boolean,
    default: false
  },
  lastActiveCompanyId: {
    type: Schema.Types.ObjectId,
    ref: "Company",
    default: null
  }
}, {
  timestamps: true
});

// Index for faster lookups
// Note: 'email' already has unique: true which creates an index automatically
UserSchema.index({ createdAt: -1 });

module.exports = mongoose.model("User", UserSchema);


