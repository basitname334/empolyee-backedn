const mongoose = require('mongoose');

const NotificationAdminSchema = new mongoose.Schema({
  user: { type: String, required: true }, // or type: mongoose.Schema.Types.
  userName: { type: String, required: true }, // or type: mongoose.Schema.Types.ObjectId if referencing user
  // ObjectId if referencing user
  message: { type: String, required: true },
  timestamp: { type: String, required: true },
  read: { type: Boolean, default: false },
});

module.exports = mongoose.model('NotificationAdmin', NotificationAdminSchema);
