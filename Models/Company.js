const mongoose = require("mongoose");
const { generateCompanySlug } = require("../utils/companySlug");
const Schema = mongoose.Schema;

const CompanySchema = new Schema({
  name: {
    type: String,
    required: true,
    trim: true,
    minlength: 1,
    maxlength: 200
  },
  owner: {
    type: String,
    required: true,
    lowercase: true,
    trim: true
  },
  slug: {
    type: String,
    required: true,
    lowercase: true,
    trim: true,
    unique: true,
    minlength: 2,
    maxlength: 120
  },
  description: {
    type: String,
    trim: true,
    maxlength: 500,
    default: null
  },
  websiteUrl: {
    type: String,
    trim: true,
    maxlength: 255,
    default: null,
    validate: {
      validator: function(v) {
        if (!v) return true;
        try {
          const url = new URL(v);
          return url.protocol === 'http:' || url.protocol === 'https:';
        } catch {
          return false;
        }
      },
      message: 'Invalid URL format'
    }
  },
  contactEmail: {
    type: String,
    trim: true,
    lowercase: true,
    maxlength: 255,
    default: null,
    validate: {
      validator: function(v) {
        if (!v) return true;
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
      },
      message: 'Invalid email format'
    }
  },
  username: {
    type: String,
    trim: true,
    lowercase: true,
    unique: true,
    sparse: true,
    minlength: 3,
    maxlength: 30,
    default: null,
    validate: {
      validator: function(v) {
        if (!v) return true;
        return /^[a-z0-9_-]+$/.test(v);
      },
      message: 'Username can only contain lowercase letters, numbers, underscores, and hyphens'
    }
  },
  brandSettings: {
    logo: {
      type: String,
      default: null
    },
    favicon: {
      type: String,
      default: null
    },
    displayName: {
      type: String,
      default: null
    },
    tagline: {
      type: String,
      default: null
    },
    primaryColor: {
      type: String,
      default: '#1976d2'
    },
    secondaryColor: {
      type: String,
      default: '#dc004e'
    },
    accentColor: {
      type: String,
      default: '#ff9800'
    },
    backgroundColor: {
      type: String,
      default: '#ffffff'
    },
    surfaceColor: {
      type: String,
      default: '#f5f5f5'
    },
    textColor: {
      type: String,
      default: '#212121'
    },
    fontFamily: {
      type: String,
      default: 'Inter, sans-serif'
    },
    headingFont: {
      type: String,
      default: 'Inter, sans-serif'
    },
    customCss: {
      type: String,
      default: null
    }
  },

  // Stripe Connect fields (Phase 6)
  stripeAccountId: {
    type: String,
    default: null,
    index: true,
    sparse: true
  },
  stripeAccountStatus: {
    type: String,
    enum: ["pending", "active", "restricted", "disabled", null],
    default: null
  },
  stripeOnboardingComplete: {
    type: Boolean,
    default: false
  },
  stripePayoutsEnabled: {
    type: Boolean,
    default: false
  },
  stripeChargesEnabled: {
    type: Boolean,
    default: false
  },
  stripeAccountCreatedAt: {
    type: Date,
    default: null
  }
}, {
  timestamps: true
});

// Index for faster lookups
CompanySchema.index({ owner: 1 });
CompanySchema.index({ createdAt: -1 });

CompanySchema.pre("validate", async function slugMiddleware(next) {
  try {
    if (!this.slug && this.name) {
      this.slug = await generateCompanySlug(this.constructor, this.name, this._id);
    }
    next();
  } catch (error) {
    next(error);
  }
});

CompanySchema.pre("findOneAndUpdate", async function slugUpdateMiddleware(next) {
  const update = this.getUpdate();
  if (update?.name && !update.slug) {
    try {
      const slug = await generateCompanySlug(this.model, update.name, this.getQuery()?._id);
      this.setUpdate({ ...update, slug });
    } catch (error) {
      return next(error);
    }
  }
  return next();
});

module.exports = mongoose.model("Company", CompanySchema);


