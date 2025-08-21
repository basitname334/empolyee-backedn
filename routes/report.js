const Report = require("../models/Report");
const User = require("../models/User");
const Notification = require("../models/Notifcation"); // Fixed typo: was 'Notifcation'
const express = require("express");
const router = express.Router();
const auth = require("../middlewares/auth");
const NotificationAdmin = require("../models/NotifcationAdmin");
const Notifcation = require("../models/Notifcation");

// Health check route
router.get("/ping", (req, res) => {
  res.send("yes working");
});

// POST /report - Create a new report (authenticated users)
router.post("/report", auth, async (req, res) => {
  try {
    const report = new Report({
      ...req.body,
      user: req.user.userId, // Attach user ID from token
    });
    await report.save();
    res.status(201).json({ message: "Report submitted successfully", report });
  } catch (err) {
    res
      .status(500)
      .json({ message: "Failed to save report", error: err.message });
  }
});

// GET /reports - Get current user's reports
router.get("/reports", auth, async (req, res) => {
  try {
    const reports = await Report.find({ user: req.user.userId })
      .populate("user", "name email")
      .sort({ createdAt: -1 });

    res.status(200).json({ reports });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Failed to fetch reports", error: error.message });
  }
});

// GET /reports/all - Fetch all reports with pagination (admin/doctor only)
router.get("/reports/all", auth, async (req, res) => {
  try {
    // Check if user has admin or doctor role
    if (!["admin", "doctor"].includes(req.user.role)) {
      return res
        .status(403)
        .json({ message: "Access denied. Admin or Doctor role required." });
    }

    // Pagination parameters
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    // Fetch paginated reports from the database
    const [reports, total] = await Promise.all([
      Report.find()
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate("user", "name email"),
      Report.countDocuments(),
    ]);

    res.status(200).json({
      reports,
      total,
      page,
      pages: Math.ceil(total / limit),
      hasNext: page < Math.ceil(total / limit),
      hasPrev: page > 1,
    });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Failed to fetch all reports", error: error.message });
  }
});

// GET /rep_all - Fetch all reports or specific report by ID (no auth - consider adding auth if needed)
router.get("/rep_all", async (req, res) => {
  try {
    const { _id } = req.query;

    if (_id) {
      // Fetch specific report by ID
      const report = await Report.findById(_id).populate("user", "name email");
      if (!report) {
        return res.status(404).json({ message: "Report not found" });
      }
      return res.status(200).json({ report });
    }

    // Fetch all reports
    const reports = await Report.find()
      .populate("user", "name email")
      .sort({ createdAt: -1 });
    res.status(200).json({ reports });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Failed to fetch reports", error: error.message });
  }
});

// PATCH /reports/:id/status - Update report status (admin/doctor only)
router.patch("/reports/:id/status", auth, async (req, res) => {
  try {
    // Check if user has admin or doctor role
    if (!["admin", "doctor"].includes(req.user.role)) {
      return res
        .status(403)
        .json({ message: "Access denied. Admin or Doctor role required." });
    }

    const { status } = req.body;
    if (!status) {
      return res.status(400).json({ message: "Status is required." });
    }

    const report = await Report.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true }
    ).populate("user", "name email");

    if (!report) {
      return res.status(404).json({ message: "Report not found" });
    }

    res
      .status(200)
      .json({ message: "Report status updated successfully", report });
  } catch (error) {
    res
      .status(500)
      .json({
        message: "Failed to update report status",
        error: error.message,
      });
  }
});

// DELETE /reports/:id - Delete a report by ID (admin/doctor only)
router.delete("/reports/:id", auth, async (req, res) => {
  try {
    // Check if user has admin or doctor role
    if (!["admin", "doctor"].includes(req.user.role)) {
      return res
        .status(403)
        .json({ message: "Access denied. Admin or Doctor role required." });
    }

    const report = await Report.findById(req.params.id);
    if (!report) {
      return res.status(404).json({ message: "Report not found" });
    }

    await Report.findByIdAndDelete(req.params.id);
    res.status(200).json({ message: "Report deleted successfully" });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Failed to delete report", error: error.message });
  }
});

// PATCH /:userId/identity - Update user identity status (admin only)
// router.patch('/:userId/identity', auth, async (req, res) => {
//   const { userId } = req.params;
//   const { identityApproved } = req.body;

//   try {
//     // Validate input
//     if (typeof identityApproved !== 'boolean') {
//       return res.status(400).json({ message: 'identityApproved must be a boolean' });
//     }

//     // Find user by email (assuming userId is email as per frontend)
//     const user = await User.findOne({ email: userId });
//     if (!user) {
//       return res.status(404).json({ message: 'User not found' });
//     }

//     // Restrict access to admins only
//     if (req.user.role !== 'admin') {
//       return res.status(403).json({ message: 'Access denied. Admins only.' });
//     }

//     // Update identity status
//     user.identityStatus = identityApproved ? 'provided' : 'declined';
//     await user.save();

//     res.status(200).json({
//       message: `Identity ${identityApproved ? 'provided' : 'declined'} successfully`,
//       identityStatus: user.identityStatus
//     });
//   } catch (error) {
//     console.error('Error updating identity status:', error);
//     res.status(500).json({ message: 'Server error' });
//   }
// });

// POST /:userId/notify - Send notification to user (admin only)
// router.post('/:userId/notify', auth, async (req, res) => {
//   const { userId } = req.params;
//   const { message, timestamp, reportId } = req.body;

//   try {
//     if (!message || !timestamp) {
//       return res.status(400).json({ message: 'Message and timestamp are required' });
//     }

//     if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.*Z$/.test(timestamp)) {
//       return res.status(400).json({ message: 'Invalid timestamp format' });
//     }

//     const user = await User.findOne({ email: userId });
//     if (!user) {
//       return res.status(404).json({ message: 'User not found' });
//     }

//     if (req.user.role !== 'admin') {
//       return res.status(403).json({ message: 'Access denied. Admins only.' });
//     }

//     const existingNotification = await Notification.findOne({ reportId: reportId });

//     // Check for existing notification for this report
//     // const existingNotification = await Notification.findOne({ user: user._id, reportId });
//     if (existingNotification) {
//       return res.status(400).json({ message: 'User has already been notified for this report' });
//     }

//     const notification = new Notification({
//       user: user._id,
//       message,
//       timestamp: new Date(timestamp),
//       reportId,
//     });
//     await notification.save();

//     user.notifications = user.notifications || [];
//     user.notifications.push(notification._id);
//     await user.save();

//     res.status(200).json({ message: 'Notification sent successfully', notification });
//   } catch (error) {
//     console.error('Error sending notification:', error);
//     res.status(500).json({ message: 'Server error' });
//   }
// });

router.post("/:userId/notify", auth, async (req, res) => {
  const { userId } = req.params;
  const { message, timestamp, reportId } = req.body;

  try {
    if (!message || !timestamp || !reportId) {
      return res
        .status(400)
        .json({ message: "Message, timestamp, and reportId are required" });
    }

    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.*Z$/.test(timestamp)) {
      return res.status(400).json({ message: "Invalid timestamp format" });
    }

    // 👉 Tumne userId me email bheja hai, is liye findOne({ email })
    const user = await User.findOne({ email: userId });
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (req.user.role !== "admin") {
      return res.status(403).json({ message: "Access denied. Admins only." });
    }

    // check if notification already exists for this report
    const existingNotification = await Notification.findOne({
      reportId: reportId,
    });
    if (existingNotification) {
      return res
        .status(400)
        .json({ message: "User has already been notified for this report" });
    }

    // 👇 Save username from User model
    const notification = new Notification({
      user: user._id,
      userName: user.name, // save user name here
      message,
      timestamp: new Date(timestamp),
      reportId,
    });

    await notification.save();

    user.notifications = user.notifications || [];
    user.notifications.push(notification._id);
    await user.save();

    res
      .status(200)
      .json({ message: "Notification sent successfully", notification });
  } catch (error) {
    console.error("Error sending notification:", error);
    res.status(500).json({ message: "Server error" });
  }
});

router.get("/:userId/notifications", auth, async (req, res) => {
  const { userId } = req.params;
  const { rep_id } = req.query;

  try {
    const user = await User.findOne({ email: userId });
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const notifications = await Notification.find({ reportId: rep_id }).sort({
      timestamp: -1,
    });

    res.status(200).json({
      notifications,
      message: notifications.length
        ? "Notifications found"
        : "No notifications",
    });
  } catch (error) {
    console.error("Error fetching notifications:", error);
    res.status(500).json({ message: "Server error" });
  }
});

router.post("/:email/notify_admin", auth, async (req, res) => {
  const { email } = req.params;
  const { message, timestamp, reportId } = req.body;

  try {
    if (!message || !timestamp || !reportId) {
      return res
        .status(400)
        .json({ message: "Message, timestamp, and reportId are required" });
    }

    // Validate timestamp format
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.*Z$/.test(timestamp)) {
      return res.status(400).json({ message: "Invalid timestamp format" });
    }

    // Find user
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Check if notification already exists
    let existingNotification = await Notification.findOne({
      user: user._id,
      reportId,
    });

    if (existingNotification) {
      existingNotification.read = true;
      await existingNotification.save();

      return res.status(200).json({
        message: "Notification already existed and is now marked as read",
        notification: existingNotification,
      });
    }
    await Notifcation.save();

    // Push to user.notifications
    user.notifications = user.notifications || [];
    user.notifications.push(Notifcation._id);
    await user.save();

    res
      .status(200)
      .json({ message: "Notification sent successfully", Notifcation });
  } catch (error) {
    console.error("Error sending notification:", error);
    res.status(500).json({ message: "Server error" });
  }
});


// ✅ Notify Admin endpoint
router.post("/:email/notify_admin", auth, async (req, res) => {
  const { email } = req.params;
  const { message, timestamp, userName, reportId } = req.body;

  try {
    // Find user
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Check agar deny pehle se true hai
    const existingNotification = await Notification.findOne({
      user: user._id,
      reportId: reportId,
    });

    if (existingNotification && existingNotification.deny === true) {
      return res.status(400).json({
        message: "You already notified to admin",
      });
    }

    // Agar already notification hai aur deny false hai -> dobara na banao
    if (existingNotification) {
      return res.status(200).json({
        message: "Notification already exists",
        notification: existingNotification,
      });
    }

    // Naya notification create karo
    const newNotification = new Notification({
      user: user._id,
      reportId,
      message,
      timestamp,
      userName,
      deny: false, // default false
    });

    await newNotification.save();

    res.status(201).json({
      message: "Notification sent to Admin",
      notification: newNotification,
    });
  } catch (error) {
    console.error("Error in notify_admin:", error);
    res.status(500).json({ message: "Server error" });
  }
});


// for deny
router.put("/:email/deny", auth, async (req, res) => {
  const { email } = req.params;
  const { rep_id } = req.query; // frontend se aa raha hai

  try {
    if (!rep_id) {
      return res.status(400).json({ message: "rep_id (reportId) is required" });
    }

    // Find user
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Find and delete notification
    const updatedNotification = await Notification.findOneAndUpdate(
      { user: user._id, reportId: rep_id },
      { $set: { deny: true } },
      { new: true }
    );
    if (!updatedNotification) {
      return res.status(404).json({ message: "Notification not found" });
    }

    // Update user.notifications array
    user.notifications = (user.notifications || []).filter(
      (n) => n.toString() !== updatedNotification._id.toString()
    );
    await user.save();

    // Return updated notifications
    const remainingNotifications = await NotificationAdmin.find({
      user: user._id,
    }).sort({ timestamp: -1 });

    res.status(200).json({
      message: "Notification deleted successfully",
      notifications: remainingNotifications,
    });
  } catch (error) {
    console.error("Error deleting notification:", error);
    res.status(500).json({ message: "Server error" });
  }
});

router.get("/:email/notifications_admin", auth, async (req, res) => {
  const { email } = req.params;
  const { rep_id } = req.query;

  try {
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Query for admin notifications
    // const query = { user: user._id };
    // if (reportId) {
    //   query.reportId = reportId;
    // }

    // First check user notifications
    if (rep_id) {
      const notificationsUser = await Notification.find({
        reportId: rep_id,
      }).sort({ timestamp: -1 });
      if (notificationsUser && notificationsUser.length > 0) {
        return res.status(200).json({
          notifications: notificationsUser,
          message: "You've already notified the user",
        });
      }
    }

    // Then check admin notifications
    // const notificationsAdmin = await NotificationAdmin.find({
    //   user: user._id,
    // }).sort({ timestamp: -1 });
    // return res.status(200).json({
    //   notifications: notificationsAdmin,
    //   message: notificationsAdmin.length
    //     ? "Notifications found"
    //     : "No notifications",
    // });
  } catch (error) {
    console.error("Error fetching admin notifications:", error);
    res.status(500).json({ message: "Server error" });
  }
});

router.patch("/notifications/:id", auth, async (req, res) => {
  const { id } = req.params;

  try {
    const notification =
      (await Notification.findById(id)) ||
      (await NotificationAdmin.findById(id));
    if (!notification) {
      return res.status(404).json({ message: "Notification not found" });
    }

    notification.read = true;
    await notification.save();

    res.status(200).json({ message: "Notification marked as read" });
  } catch (error) {
    console.error("Error marking notification as read:", error);
    res.status(500).json({ message: "Server error" });
  }
});
// router.get('/:userEmail/notifications', auth, async (req, res) => {
//   try {
//     const user = await User.findOne({ email: req.params.userEmail });
//     if (!user) {
//       return res.status(404).json({ message: 'User not found' });
//     }

//     if (req.user.email !== req.params.userEmail && req.user.role !== 'admin') {
//       return res.status(403).json({ message: 'Access denied' });
//     }

//     const notifications = await Notification.find({ user: user._id }).sort({ timestamp: -1 });
//     res.status(200).json({ notifications });
//   } catch (error) {
//     console.error('Error fetching notifications:', error);
//     res.status(500).json({ message: 'Server error' });
//   }
// });

module.exports = router;
