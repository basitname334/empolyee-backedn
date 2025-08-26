// server.js

const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const connectDB = require('./config/db');
const { verifyEmailConnection } = require('./services/emailService');
const { Server } = require('socket.io');
const http = require('http');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const documentRoutes = require("./routes/document");
const postRoutes = require("./routes/posts");
const { generateToken04 } = require("./services/zegoServerAssistant");
const path = require("path");

// Models
const User = require('./models/User');
const Appointment = require('./models/Appointment');
const Call = require('./models/Call');
const Poll = require('./models/PollSchema');
const Report = require('./models/Report');

// Middleware
const auth = require('./middlewares/auth');

// Routes
const authRoutes = require('./routes/authRoutes');
const reportRoutes = require('./routes/report');
const challengeRoutes = require('./routes/challenges');
const doctorRoutes = require('./routes/doctor');

dotenv.config();

// Debug: Log environment variables (avoid logging sensitive data in production)
console.log('JWT_SECRET loaded:', !!process.env.JWT_SECRET);

connectDB();

const app = express();
const server = http.createServer(app);

// Make sure Express trusts proxy (useful on Render/Nginx for correct protocol/origin handling)
app.set('trust proxy', 1);

/**
 * ----------------------------
 * CORS: Robust configuration
 * ----------------------------
 * - Allows localhost dev
 * - Allows your main Vercel domain
 * - Allows ALL Vercel preview deployments (emp-health-frontend-*.vercel.app)
 * - Handles preflight (OPTIONS) properly
 */
const allowedOrigins = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://192.168.0.105:3000',
  'https://emp-health-frontend.vercel.app'
];

// Regex to allow all preview subdomains on Vercel for this project
const vercelPreviewRegex = /^https:\/\/emp-health-frontend.*\.vercel\.app$/;

const corsOptionsDelegate = (req, callback) => {
  const origin = req.header('Origin');
  console.log('Request Origin:', origin);

  // Allow no-origin requests (e.g., curl, mobile apps)
  if (!origin) {
    return callback(null, {
      origin: true,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
      optionsSuccessStatus: 204
    });
  }

  if (allowedOrigins.includes(origin) || vercelPreviewRegex.test(origin)) {
    return callback(null, {
      origin: true,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
      optionsSuccessStatus: 204
    });
  }

  console.error('❌ CORS Error: Origin not allowed:', origin);
  return callback(new Error('Not allowed by CORS'), {
    origin: false
  });
};

// Must be registered before any routes
app.use((req, res, next) => {
  // Helps caches/CDNs vary by Origin automatically
  res.setHeader('Vary', 'Origin');
  next();
});
app.use(cors(corsOptionsDelegate));
// Explicitly handle preflight for all routes (bypasses other middleware like auth)
app.options('*', cors(corsOptionsDelegate));

/**
 * Security headers
 * NOTE: We relax only the parts you explicitly configured later for /api/documents.
 */
app.use(helmet({
  // Don't block cross-origin resources globally since you serve documents cross-origin
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));

// Parsers & logger
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(morgan('dev'));

// Verify email transport on boot
verifyEmailConnection();

// Static uploads (single, consistent mapping)
app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));

/**
 * Small helper middleware to ensure JSON body presence on certain POST routes
 */
const validateRequest = (req, res, next) => {
  if (!req.body || Object.keys(req.body).length === 0) {
    return res.status(400).json({ message: 'Request body is required' });
  }
  next();
};

// Base route
app.get('/', (req, res) => res.send('CORS Configured! ✅'));

/**
 * ----------------------------
 * API ROUTES
 * ----------------------------
 */
app.use('/api/auth', authRoutes);
app.use('/api', challengeRoutes);
app.use('/api', doctorRoutes);
app.use('/api', reportRoutes);

// Extra headers only for documents to relax CORP/COEP as you had
app.use('/api/documents', (req, res, next) => {
  res.header('Cross-Origin-Resource-Policy', 'cross-origin');
  res.header('Cross-Origin-Embedder-Policy', 'unsafe-none');
  next();
});
app.use('/api/posts', postRoutes);
app.use("/api/documents", documentRoutes);

// Example challenge route (kept)
app.get('/api/challenges', (req, res) => {
  res.status(200).json({ message: 'Challenges endpoint', challenges: [] });
});

/**
 * ----------------------------
 * ZEGO Cloud Token Route
 * ----------------------------
 */
const APP_ID = Number(process.env.ZEGO_APP_ID) || 1757000422;
const SERVER_SECRET = process.env.ZEGO_SERVER_SECRET || '0ce7e80431c85f491e586b683d3737b4';

app.get("/api/zego/token", (req, res) => {
  try {
    const { userID, roomID } = req.query;
    if (!userID || !roomID) {
      return res.status(400).json({ error: "userID and roomID are required" });
    }
    const token = generateToken04(
      APP_ID,
      userID,
      SERVER_SECRET,
      3600,
      JSON.stringify({ room_id: roomID })
    );
    res.json({ token });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Token generation failed" });
  }
});

/**
 * ----------------------------
 * SCHEDULING
 * ----------------------------
 * NOTE: Path kept as-is (/:userId/schedule)
 */
app.post('/:userId/schedule', async (req, res) => {
  try {
    const { date, startTime, endTime, breaks } = req.body;
    console.log('Received schedule data:', { date, startTime, endTime, breaks });

    if (!date || !startTime || !endTime) {
      return res.status(400).json({ message: 'Date, start time, and end time are required' });
    }

    const user = await User.findById(req.params.userId);
    if (!user) return res.status(404).json({ message: 'User not found' });

    const updateData = {
      workingHours: {
        start: startTime,
        end: endTime,
        breaks: breaks || [],
        date,
      },
      $push: {
        schedule: { date, startTime, endTime, breaks: breaks || [] },
      },
    };

    await User.findByIdAndUpdate(
      req.params.userId,
      updateData,
      { new: true, runValidators: false }
    );

    res.status(200).json({ message: 'Schedule updated successfully' });
  } catch (error) {
    console.error('Error in schedule update:', error);
    res.status(500).json({ message: error.message });
  }
});

/**
 * ----------------------------
 * REPORTS
 * ----------------------------
 */
app.get('/api/reports/all', auth, async (req, res) => {
  try {
    console.log('GET /api/reports/all - User:', req.user);

    const reports = await Report.aggregate([
      { $sort: { createdAt: -1 } },
      {
        $lookup: {
          from: 'users',
          localField: 'user',
          foreignField: '_id',
          as: 'user'
        }
      },
      { $unwind: '$user' },
      {
        $project: {
          _id: 1,
          title: 1,
          description: 1,
          createdAt: 1,
          'user.name': 1,
          'user.email': 1
        }
      }
    ], { allowDiskUse: true });

    res.set('Cache-Control', 'no-cache');
    res.status(200).json({ reports });
  } catch (error) {
    console.error('Error in GET /api/reports/all:', error);
    res.status(500).json({ message: 'Failed to fetch reports', error: error.message });
  }
});

app.post('/api/report', auth, validateRequest, async (req, res) => {
  try {
    console.log('POST /api/report - Request body:', req.body, 'User:', req.user);

    if (!req.user || !req.user.userId) {
      console.error('POST /api/report - Missing or invalid user data');
      return res.status(401).json({ success: false, message: 'User not authenticated' });
    }

    if (!mongoose.Types.ObjectId.isValid(req.user.userId)) {
      console.error('POST /api/report - Invalid userId:', req.user.userId);
      return res.status(400).json({ success: false, message: 'Invalid user ID format' });
    }

    let {
      title,
      type,
      date,
      time,
      reportToHR,
      anonymous,
      location,
      description,
      involvedParties
    } = req.body;

    if (!Array.isArray(involvedParties)) {
      involvedParties = [];
    }

    const allowedTypes = ['hazard', 'safety', 'incident'];

    const missingFields = [];
    if (!title) missingFields.push('title');
    if (!type) missingFields.push('type');
    else if (!allowedTypes.includes(type)) {
      console.error('POST /api/report - Invalid type:', type);
      return res.status(400).json({ success: false, message: `Invalid 'type' value. Allowed: ${allowedTypes.join(', ')}` });
    }
    if (!date) missingFields.push('date');
    if (!time) missingFields.push('time');
    if (!location) missingFields.push('location');
    if (!description) missingFields.push('description');

    if (missingFields.length > 0) {
      console.error('POST /api/report - Missing fields:', missingFields);
      return res.status(400).json({ success: false, message: `Missing required fields: ${missingFields.join(', ')}` });
    }

    const report = new Report({
      title,
      type,
      date,
      time,
      reportToHR: Boolean(reportToHR),
      anonymous: Boolean(anonymous),
      location,
      description,
      involvedParties,
      user: req.user.userId,
      status: 'pending',
    });

    console.log('POST /api/report - Saving report:', report);
    await report.save();
    console.log('POST /api/report - Report saved successfully:', report);

    res.status(201).json({ success: true, message: 'Report submitted successfully', data: report });
  } catch (error) {
    console.error('Error in POST /api/report:', error.message, error.stack);
    res.status(500).json({ success: false, message: 'Failed to create report', error: error.message });
  }
});

/**
 * ----------------------------
 * PROTECTED CHECK + HEALTH
 * ----------------------------
 */
app.use('/api/protected', auth, (req, res) => {
  res.status(200).json({ message: 'You are logged in and can access this protected route.' });
});

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', message: 'Server is running' });
});

/**
 * ----------------------------
 * APPOINTMENTS
 * ----------------------------
 */
app.post('/api/appointments', auth, validateRequest, async (req, res) => {
  try {
    console.log('POST /api/appointments - Request body:', req.body, 'User:', req.user);
    const { day, date, time, type, doctorName, avatarSrc, userId } = req.body;
    if (!day || !date || !time || !type || !doctorName || !avatarSrc || !userId) {
      return res.status(400).json({ message: 'All fields are required including userId.' });
    }
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      console.error('POST /api/appointments - Invalid userId:', userId);
      return res.status(400).json({ message: 'Invalid userId format' });
    }
    const appointment = new Appointment({ day, date, time, type, doctorName, avatarSrc, user: userId });
    await appointment.save();
    await User.findByIdAndUpdate(userId, { $push: { appointments: appointment._id } });
    res.status(201).json({ message: 'Appointment created successfully', appointment });
  } catch (error) {
    console.error('Error in POST /api/appointments:', error);
    res.status(500).json({ message: 'Failed to create appointment', error: error.message });
  }
});

app.get('/api/appointments', async (req, res) => {
  try {
    const { userId } = req.query;
    const query = userId ? { user: userId } : {};
    const appointments = await Appointment.find(query).populate('user', 'name email role');
    res.status(200).json({ appointments });
  } catch (error) {
    console.error('Error in GET /api/appointments:', error);
    res.status(500).json({ message: 'Failed to fetch appointments', error: error.message });
  }
});

/**
 * ----------------------------
 * DOCTORS
 * ----------------------------
 */
app.get('/api/all-doctors', async (req, res) => {
  try {
    const doctors = await User.find({ role: 'doctor' });
    res.status(200).json({ doctors });
  } catch (error) {
    console.error('Error in GET /api/all-doctors:', error);
    res.status(500).json({ message: 'Failed to fetch doctors', error: error.message });
  }
});

/**
 * ----------------------------
 * POLLS
 * ----------------------------
 */
app.post('/api/polls', validateRequest, async (req, res) => {
  try {
    console.log('POST /api/polls - Request body:', req.body);
    const { question, choices } = req.body;
    if (!question || !Array.isArray(choices) || choices.length < 2) {
      return res.status(400).json({ message: 'Question and at least 2 choices are required.' });
    }
    const formattedChoices = choices.map(choice => ({ text: choice, votes: 0 }));
    const poll = new Poll({ question, choices: formattedChoices });
    await poll.save();
    res.status(201).json({ message: 'Poll created successfully', poll });
  } catch (error) {
    console.error('Error in POST /api/polls:', error);
    res.status(500).json({ message: 'Failed to create poll', error: error.message });
  }
});

app.post('/api/add_poll', validateRequest, async (req, res) => {
  try {
    console.log('POST /api/add_poll - Request body:', req.body);
    const { question, choices } = req.body;
    if (!question || !Array.isArray(choices) || choices.length < 2) {
      return res.status(400).json({ message: 'Question and at least 2 choices are required.' });
    }
    const formattedChoices = choices.map(choice => ({ text: choice, votes: 0 }));
    const poll = new Poll({ question, choices: formattedChoices });
    await poll.save();
    console.log('POST /api/add_poll - Poll saved successfully:', poll);
    res.status(201).json({ message: 'Poll created successfully', poll });
  } catch (error) {
    console.error('Error in POST /api/add_poll:', error);
    res.status(500).json({ message: 'Failed to create poll', error: error.message });
  }
});

app.get('/api/polls', async (req, res) => {
  try {
    const polls = await Poll.find();
    res.status(200).json({ polls });
  } catch (error) {
    console.error('Error in GET /api/polls:', error);
    res.status(500).json({ message: 'Failed to fetch polls', error: error.message });
  }
});

/**
 * ----------------------------
 * CALLS
 * ----------------------------
 */
app.post('/api/calls', auth, async (req, res) => {
  try {
    console.log('POST /api/calls - Request body:', req.body, 'User:', req.user);
    const { recipientId } = req.body;
    if (!recipientId) {
      return res.status(400).json({ message: 'Recipient ID is required' });
    }
    const call = new Call({ caller: req.user.userId, recipient: recipientId });
    await call.save();
    res.status(201).json({ message: 'Call initiated', call });
  } catch (error) {
    console.error('Error in POST /api/calls:', error);
    res.status(500).json({ message: 'Failed to initiate call', error: error.message });
  }
});

/**
 * ----------------------------
 * 404 + Error Handlers
 * ----------------------------
 */
app.use((req, res) => {
  res.status(404).json({ message: 'API endpoint not found' });
});

app.use((err, req, res, next) => {
  console.error('Global error handler:', err);
  // Handle CORS errors gracefully for visibility
  if (err && err.message === 'Not allowed by CORS') {
    return res.status(403).json({ message: 'CORS: Origin not allowed', origin: req.header('Origin') || null });
  }
  res.status(500).json({
    message: 'Internal server error',
    error: process.env.NODE_ENV === 'production' ? 'An error occurred' : err.message
  });
});

/**
 * ----------------------------
 * Socket.IO
 * ----------------------------
 */
const io = new Server(server, {
  cors: {
    origin: (origin, callback) => {
      console.log('Socket.IO Request Origin:', origin);
      if (!origin || allowedOrigins.includes(origin) || vercelPreviewRegex.test(origin)) {
        callback(null, true);
      } else {
        console.error('❌ Socket.IO CORS Error: Origin not allowed:', origin);
        callback(new Error('Not allowed by CORS'));
      }
    },
    methods: ['GET', 'POST'],
    credentials: true
  }
});

io.on('connection', (socket) => {
  console.log('Socket.IO: New connection', socket.id);

  socket.on('join-room', ({ roomId, userId }) => {
    socket.join(roomId.toLowerCase());
    const room = io.sockets.adapter.rooms.get(roomId.toLowerCase());
    const users = room ? [...room] : [socket.id];
    io.to(roomId.toLowerCase()).emit('room-users', users);
    socket.to(roomId.toLowerCase()).emit('user-connected', userId);
  });

  socket.on('call-user', ({ userToCall, signalData, from, name }) => {
    io.to(userToCall).emit('call-made', { signal: signalData, from, name });
  });

  socket.on('answer-call', ({ signal, to }) => {
    io.to(to).emit('call-accepted', signal);
  });

  socket.on('reject-call', ({ to }) => {
    io.to(to).emit('call-rejected');
  });

  socket.on('end-call', ({ to }) => {
    io.to(to).emit('call-ended');
  });

  socket.on('ice-candidate', ({ candidate, to }) => {
    io.to(to).emit('ice-candidate', { candidate });
  });

  socket.on('offer', ({ offer, from, to }) => {
    io.to(to).emit('offer', { offer, from });
  });

  socket.on('answer', ({ answer, to }) => {
    io.to(to).emit('pass', { answer });
  });

  socket.on('disconnect', () => {
    socket.rooms.forEach(room => {
      if (room !== socket.id) {
        socket.to(room).emit('user-disconnected', socket.id);
        const updatedUsers = [...(io.sockets.adapter.rooms.get(room) || [])];
        io.to(room).emit('room-users', updatedUsers);
      }
    });
  });
});

/**
 * ----------------------------
 * Server start
 * ----------------------------
 */
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  if (app._router && app._router.stack) {
    app._router.stack.forEach((middleware) => {
      if (middleware.route && middleware.route.path && middleware.route.stack[0]) {
        console.log(`Route registered: ${middleware.route.stack[0].method.toUpperCase()} ${middleware.route.path}`);
      }
    });
  } else {
    console.log('Router stack not available');
  }
});

process.on('unhandledRejection', err => {
  console.error('UNHANDLED REJECTION:', err.stack);
});
process.on('uncaughtException', err => {
  console.error('UNCAUGHT EXCEPTION:', err.stack);
  process.exit(1);
});
