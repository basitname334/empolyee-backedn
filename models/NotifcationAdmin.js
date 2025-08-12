const mongoose = require('mongoose');

const NotificationAdminSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  userName: { type: String, required: false },
  message: { type: String, required: true },
  timestamp: { type: Date, required: true },
  reportId: { type: String, required: true }, // Link to specific report
  read: { type: Boolean, default: false },
});

module.exports = mongoose.model('NotificationAdmin', NotificationAdminSchema);
