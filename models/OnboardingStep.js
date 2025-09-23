const mongoose = require('mongoose');

const OnboardingStepSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  step: {
    type: Number,
    required: true,
    min: 1,
    max: 9
  },
  // Flexible data storage for different step types
  data: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  // Specific fields for common step data
  height: {
    type: String,
    trim: true
  },
  unit: {
    type: String,
    enum: ['cm', 'ft', 'in'],
    default: 'cm'
  },
  blood_group: {
    type: String,
    trim: true
  },
  emergency_contact_relation: {
    type: String,
    trim: true
  },
  emergency_contact_name: {
    type: String,
    trim: true
  },
  emergency_contact: {
    type: String,
    trim: true
  },
  provider: {
    type: String,
    trim: true
  },
  success: {
    type: Boolean,
    default: false
  },
  skipped: {
    type: Boolean,
    default: false
  },
  allergies: [{
    type: String,
    trim: true
  }],
  allergy_description: {
    type: String,
    trim: true
  },
  disorders: [{
    type: String,
    trim: true
  }],
  disorder_detail: {
    type: String,
    trim: true
  },
  avatar: {
    type: String,
    trim: true
  },
  // Metadata
  completedAt: {
    type: Date,
    default: Date.now
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Pre-save middleware to update the updatedAt field
OnboardingStepSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Index for faster queries
OnboardingStepSchema.index({ userId: 1, step: 1 });
OnboardingStepSchema.index({ userId: 1, completedAt: -1 });

// Static method to get user's onboarding progress
OnboardingStepSchema.statics.getUserProgress = function(userId) {
  return this.find({ userId })
    .sort({ step: 1 })
    .select('step data height unit blood_group emergency_contact_relation emergency_contact_name emergency_contact provider success skipped allergies allergy_description disorders disorder_detail avatar completedAt');
};

// Static method to get specific step data
OnboardingStepSchema.statics.getUserStep = function(userId, step) {
  return this.findOne({ userId, step });
};

// Static method to check if user has completed all steps
OnboardingStepSchema.statics.isOnboardingComplete = function(userId) {
  return this.countDocuments({ userId }).then(count => count >= 9);
};

// Instance method to get step summary
OnboardingStepSchema.methods.getStepSummary = function() {
  const summary = {
    step: this.step,
    completedAt: this.completedAt
  };

  // Add relevant data based on step
  switch (this.step) {
    case 1:
      if (this.height) summary.height = this.height;
      if (this.unit) summary.unit = this.unit;
      break;
    case 2:
      if (this.emergency_contact_relation) summary.emergency_contact_relation = this.emergency_contact_relation;
      if (this.emergency_contact_name) summary.emergency_contact_name = this.emergency_contact_name;
      if (this.emergency_contact) summary.emergency_contact = this.emergency_contact;
      break;
    case 3:
      if (this.blood_group) summary.blood_group = this.blood_group;
      break;
    case 5:
      if (this.provider !== undefined) summary.provider = this.provider;
      if (this.success !== undefined) summary.success = this.success;
      if (this.skipped !== undefined) summary.skipped = this.skipped;
      break;
    case 6:
      if (this.allergies && this.allergies.length > 0) summary.allergies = this.allergies;
      if (this.allergy_description) summary.allergy_description = this.allergy_description;
      break;
    case 7:
      if (this.disorders && this.disorders.length > 0) summary.disorders = this.disorders;
      if (this.disorder_detail) summary.disorder_detail = this.disorder_detail;
      break;
    case 8:
      if (this.avatar) summary.avatar = this.avatar;
      break;
    case 9:
      // Step 9 completion
      summary.completed = true;
      break;
  }

  return summary;
};

module.exports = mongoose.model('OnboardingStep', OnboardingStepSchema);
