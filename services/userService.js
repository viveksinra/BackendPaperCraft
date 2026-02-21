const User = require("../Models/User");
const Transaction = require("../Models/Transaction");
const mongoose = require('mongoose');

/**
 * Get user profile by ID
 */
exports.getUserProfile = async (userId) => {
  try {
    const user = await User.findById(userId).select('-otp -otpExpires -otpAttempts -oneSignalPlayerId');
    
    if (!user) {
      throw new Error('User not found');
    }

    return user;
  } catch (error) {
    console.error('Error getting user profile:', error);
    throw error;
  }
};

/**
 * Update user profile
 */
exports.updateUserProfile = async (userId, updateData) => {
  try {
    const user = await User.findByIdAndUpdate(
      userId,
      { $set: updateData },
      { new: true, runValidators: true }
    ).select('-otp -otpExpires -otpAttempts -oneSignalPlayerId');

    if (!user) {
      throw new Error('User not found');
    }

    return user;
  } catch (error) {
    console.error('Error updating user profile:', error);
    throw error;
  }
};

/**
 * Get user statistics and dashboard data
 */
exports.getUserStats = async (userId) => {
  try {
    const user = await User.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    // Get transaction statistics
    const transactionStats = await Transaction.aggregate([
      {
        $match: { user: new mongoose.Types.ObjectId(userId) }
      },
      {
        $group: {
          _id: '$type',
          count: { $sum: 1 },
          totalAmount: { $sum: '$amount' }
        }
      }
    ]);

    // Get recent transactions
    const recentTransactions = await Transaction.find({ user: userId })
      .sort({ timestamp: -1 })
      .limit(5)
      .select('type amount description timestamp');

    return {
      profile: {
        id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        name: user.name, // Virtual field for backward compatibility
        email: user.email,
        coins: user.coins,
        sessionLicenses: user.sessionLicenses,
        profileImage: user.profileImage,
        createdAt: user.createdAt
      },
      stats: {
        totalTransactions: transactionStats.reduce((sum, stat) => sum + stat.count, 0),
        totalSpent: transactionStats
          .filter(stat => stat._id === 'spent')
          .reduce((sum, stat) => sum + stat.totalAmount, 0),
        totalEarned: transactionStats
          .filter(stat => ['earned', 'credited'].includes(stat._id))
          .reduce((sum, stat) => sum + stat.totalAmount, 0)
      },
      recentTransactions
    };
  } catch (error) {
    console.error('Error getting user stats:', error);
    throw error;
  }
};

/**
 * Update user notification settings
 */
exports.updateNotificationSettings = async (userId, settings) => {
  try {
    const user = await User.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    // Initialize notificationSettings if it doesn't exist
    if (!user.notificationSettings) {
      user.notificationSettings = {};
    }

    // Update notification settings
    Object.assign(user.notificationSettings, settings);
    await user.save();

    return {
      message: 'Notification settings updated successfully',
      settings: user.notificationSettings
    };
  } catch (error) {
    console.error('Error updating notification settings:', error);
    throw error;
  }
};

/**
 * Check if user has sufficient balance
 */
exports.checkUserBalance = async (userId, requiredCoins) => {
  try {
    const user = await User.findById(userId).select('coins');
    if (!user) {
      throw new Error('User not found');
    }

    return {
      hasEnough: user.coins >= requiredCoins,
      currentBalance: user.coins,
      required: requiredCoins,
      shortfall: Math.max(0, requiredCoins - user.coins)
    };
  } catch (error) {
    console.error('Error checking user balance:', error);
    throw error;
  }
};

module.exports = exports;