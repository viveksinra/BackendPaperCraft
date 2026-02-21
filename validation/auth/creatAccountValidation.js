const Joi = require('joi');
const mongoose = require('mongoose');
const User = mongoose.model('myUser');

// Joi Schema for User validation
const userSchema = Joi.object({
  employeeId: Joi.string().max(50).required(),
  employeeHrCode: Joi.string().max(50).required(),
  firstName: Joi.string().max(50).optional(),
  middleName: Joi.string().allow('', null).max(50).optional(),
  lastName: Joi.string().allow('', null).max(50).optional(),
  email: Joi.string().email().max(100).required(),
  mobileNumber: Joi.string().max(15).required(),
  dateOfBirth: Joi.date().optional(),
  gender: Joi.object({
    label: Joi.string().required(),
    id: Joi.string().required(),
  }).required(),
  address: Joi.string().allow('', null).max(255).optional(),
  district: Joi.string().max(50).optional(),
  state: Joi.string().max(50).optional(),
  pincode: Joi.string().max(10).optional(),
  dateOfJoining: Joi.date().optional(),
  vertical: Joi.string().hex().length(24).required(), // ObjectId validation
  supervisorId: Joi.string().hex().length(24).optional(), // ObjectId validation
  status: Joi.object({
    label: Joi.string().required(),
    id: Joi.string().required(),
  }).required(),
  role: Joi.string().hex().length(24).optional(), // ObjectId validation
  password: Joi.string().required(),
  hrRemarks: Joi.string().allow('', null).optional(),
});

// Middleware to validate on account creation
const validateOnAccountCreate = async (req, res, next) => {
  const { error } = userSchema.validate(req.body);
  if (error) {
    return res.status(400).json({ message: error.details[0].message, variant: "error" });
  }

  const { employeeId, email, mobileNumber,employeeHrCode } = req.body;
  try {
    const userByEmployeeId = await User.findOne({ employeeId });
    if (userByEmployeeId) {
      return res.status(400).json({ message: "Employee ID already exists.", variant: "error" });
    }
    const userByemployeeHrCode = await User.findOne({ employeeHrCode });
    if (userByemployeeHrCode) {
      return res.status(400).json({ message: "Employee Hr Code already exists.", variant: "error" });
    }

    const userByEmail = await User.findOne({ email });
    if (userByEmail) {
      return res.status(400).json({ message: "Email already exists.", variant: "error" });
    }

    const userByMobileNumber = await User.findOne({ mobileNumber });
    if (userByMobileNumber) {
      return res.status(400).json({ message: "Mobile number already exists.", variant: "error" });
    }

    next();
  } catch (dbError) {
    console.log(dbError);
    return res.status(500).json({ message: "Database error during uniqueness check.", variant: "error" });
  }
};

// Middleware to validate on updates
const validateOnAccountUpdate = async (req, res, next) => {
  const { employeeId, email, mobileNumber } = req.body;

  try {
    if (employeeId) {
      const userByEmployeeId = await User.findOne({ employeeId });
      if (userByEmployeeId && userByEmployeeId._id.toString() !== req.params.id) {
        return res.status(400).json({ message: "Employee ID already exists.", variant: "error" });
      }
    }

    if (email) {
      const userByEmail = await User.findOne({ email });
      if (userByEmail && userByEmail._id.toString() !== req.params.id) {
        return res.status(400).json({ message: "Email already exists.", variant: "error" });
      }
    }

    if (mobileNumber) {
      const userByMobileNumber = await User.findOne({ mobileNumber });
      if (userByMobileNumber && userByMobileNumber._id.toString() !== req.params.id) {
        return res.status(400).json({ message: "Mobile number already exists.", variant: "error" });
      }
    }

    next();
  } catch (dbError) {
    return res.status(500).json({ message: "Database error during uniqueness check.", variant: "error" });
  }
};

// Middleware to validate employee ID on account deletion
const validateOnAccountDelete = async (req, res, next) => {
  const { error } = Joi.object({
    employeeId: Joi.string().hex().length(24).required(),
  }).validate(req.body);

  if (error) {
    return res.status(400).json({ message: "Invalid Employee ID", variant: "error" });
  }

  next();
};

module.exports = { validateOnAccountCreate, validateOnAccountUpdate, validateOnAccountDelete };
