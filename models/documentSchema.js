const mongoose = require("mongoose");

const documentSchema = new mongoose.Schema({
  fileName: { type: String, required: true },
  fileData: { type: Buffer, required: true }, // Store binary data
  mimeType: { type: String, required: true },
  uploadedBy: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  },
  uploadedByName: { type: String, required: true }, // Store user name for easy display
  uploadDate: { type: Date, default: Date.now },
  fileSize: { type: Number } // Store file size
});

module.exports = mongoose.model("Document", documentSchema);