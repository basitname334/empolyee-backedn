const express = require("express");
const multer = require("multer");
const path = require("path");
const Document = require("../models/documentSchema");

const router = express.Router();

// Configure multer for file uploads
const storage = multer.memoryStorage(); // Store in memory instead of disk
const upload = multer({ 
  storage,
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

// Upload and store document in DB
router.post("/upload", upload.single("file"), async (req, res) => {
  try {
    const { uploadedBy, uploadedByName } = req.body;

    if (!req.file) {
      return res.status(400).json({ success: false, message: "No file uploaded" });
    }

    const doc = new Document({
      fileName: req.file.originalname,
      fileData: req.file.buffer, // Store binary data
      mimeType: req.file.mimetype,
      uploadedBy,
      uploadedByName,
      fileSize: req.file.size
    });

    await doc.save();
    
    // Return document info without fileData
    const responseDoc = {
      _id: doc._id,
      fileName: doc.fileName,
      mimeType: doc.mimeType,
      uploadedBy: doc.uploadedBy,
      uploadedByName: doc.uploadedByName,
      uploadDate: doc.uploadDate,
      fileSize: doc.fileSize
    };

    res.json({ success: true, document: responseDoc });
  } catch (error) {
    console.error("Upload error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get documents for specific user
router.get("/user/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    
    const docs = await Document.find(
      { uploadedBy: userId }, 
      { fileData: 0 } // Exclude file data from response
    ).sort({ uploadDate: -1 });
    
    res.json({ success: true, documents: docs });
  } catch (error) {
    console.error("Get documents error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get all documents (admin only - optional)
router.get("/", async (req, res) => {
  try {
    const docs = await Document.find({}, { fileData: 0 }).sort({ uploadDate: -1 });
    res.json({ success: true, documents: docs });
  } catch (error) {
    console.error("Get all documents error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get specific document file for viewing/downloading
router.get("/file/:id", async (req, res) => {
  try {
    const doc = await Document.findById(req.params.id);
    if (!doc) {
      return res.status(404).json({ success: false, message: "File not found" });
    }

    // Set proper headers for PDF viewing
    res.set({
      'Content-Type': doc.mimeType,
      'Content-Length': doc.fileData.length,
      'Content-Disposition': `inline; filename="${encodeURIComponent(doc.fileName)}"`,
      'Cache-Control': 'no-cache',
      'Accept-Ranges': 'bytes'
    });
    
    res.send(doc.fileData);
  } catch (error) {
    console.error("Get file error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Download specific document
router.get("/download/:id", async (req, res) => {
  try {
    const doc = await Document.findById(req.params.id);
    if (!doc) {
      return res.status(404).json({ success: false, message: "File not found" });
    }

    res.set({
      'Content-Type': doc.mimeType,
      'Content-Length': doc.fileData.length,
      'Content-Disposition': `attachment; filename="${doc.fileName}"` // Use attachment for downloading
    });
    
    res.send(doc.fileData);
  } catch (error) {
    console.error("Download file error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Delete document (optional)
router.delete("/:id", async (req, res) => {
  try {
    const doc = await Document.findByIdAndDelete(req.params.id);
    if (!doc) {
      return res.status(404).json({ success: false, message: "Document not found" });
    }
    res.json({ success: true, message: "Document deleted successfully" });
  } catch (error) {
    console.error("Delete document error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;