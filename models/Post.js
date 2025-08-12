const mongoose = require('mongoose');

const postSchema = new mongoose.Schema({
  content: {
    type: String,
    trim: true
  },
  userId: {
    type: String,
  },
  username: {
    type: String,
  },
  email: {
    type: String,
  },
  role: {
    type: String,
    enum: ['employee', 'admin']
  },
  avatarUrl: {
    type: String,
    default: null
  },
  hashtags: [{
    type: String
  }],
  likes: {
    type: Number,
    default: 0
  },
  isBlocked: {
    type: Boolean,
    default: false
  },
  blockedBy: {
    type: String,
    default: null
  },
  blockedAt: {
    type: Date,
    default: null
  }
}, {
  timestamps: true
});

// Index for better query performance
postSchema.index({ userId: 1 });
postSchema.index({ isBlocked: 1 });
postSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Post', postSchema);
