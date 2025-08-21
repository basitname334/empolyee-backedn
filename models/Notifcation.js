const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  userName: { type: String },
  message: { type: String, required: true },
  timestamp: { type: Date, required: true },
  reportId: { type: String, required: false }, // Link to specific report
  read: { type: Boolean, default: false },
  deny: { type: Boolean, default: false },

})

module.exports = mongoose.model('Notification', notificationSchema);