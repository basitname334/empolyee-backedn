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
const mongoose = require('mongoose');
const documentRoutes = require("./routes/document");
const postRoutes = require("./routes/posts");
const { createCipheriv } = require('crypto');
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
console.log('Environment variables loaded:', {
  JWT_SECRET: !!process.env.JWT_SECRET,
  MONGODB_URI: !!process.env.MONGODB_URI, // Check MongoDB URI
  PORT: process.env.PORT || 5000,
});

// Connect to MongoDB and verify connection
connectDB().then(() => {
  console.log('MongoDB connected successfully');
}).catch((err) => {
  console.error('MongoDB connection failed:', err);
  process.exit(1); // Exit if database connection fails
});

const app = express();
const server = http.createServer(app);

const allowedOrigins = ['http://localhost:3000', 'https://emp-health-frontend.vercel.app', 'http://192.168.0.105:3000'];

// Updated CORS configuration
app.use(cors({
  origin: (origin, callback) => {
    console.log('Request Origin:', origin);
    if (!origin || allowedOrigins.includes(origin) || /^https:\/\/emp-health-frontend-.*\.vercel\.app$/.test(origin)) {
      callback(null, true);
    } else {
      console.error('CORS Error: Origin not allowed:', origin);
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
  optionsSuccessStatus: 200 // Handle legacy browsers
}));

// Explicitly handle preflight OPTIONS requests
app.options('*', cors());

app.use(helmet());
app.use(express.json());
app.use(morgan('dev'));
verifyEmailConnection();
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

const validateRequest = (req, res, next) => {
  if (!req.body || Object.keys(req.body).length === 0) {
    return res.status(400).json({ message: 'Request body is required' });
  }
  next();
};

// Test route to verify server and CORS
app.get('/api/test', (req, res) => {
  console.log('GET /api/test - Request received');
  res.status(200).json({ message: 'Test endpoint working, CORS enabled' });
});

// Fix: Move /api/all-doctors before mounted routers to avoid conflicts
app.get('/api/all-doctors', async (req, res) => {
  try {
    console.log('GET /api/all-doctors - Fetching doctors...');
    const doctors = await User.find({ role: 'doctor' }).select('-password -__v'); // Exclude sensitive fields
    console.log('GET /api/all-doctors - Doctors found:', doctors.length);
    if (doctors.length === 0) {
      console.log('GET /api/all-doctors - No doctors found in database');
      return res.status(200).json({ doctors: [], message: 'No doctors found' });
    }
    res.status(200).json({ doctors });
  } catch (error) {
    console.error('Error in GET /api/all-doctors:', error.message);
    res.status(500).json({ message: 'Failed to fetch doctors', error: error.message });
  }
});

// Fix: Corrected /:userId/schedule to /api/users/:userId/schedule
app.post('/api/users/:userId/schedule', async (req, res) => {
  try {
    const { date, startTime, endTime, breaks } = req.body;
    console.log('POST /api/users/:userId/schedule - Received data:', { date, startTime, endTime, breaks, userId: req.params.userId });

    // Validate input data
    if (!date || !startTime || !endTime) {
      return res.status(400).json({ message: 'Date, start time, and end time are required' });
    }

    if (!mongoose.Types.ObjectId.isValid(req.params.userId)) {
      console.error('POST /api/users/:userId/schedule - Invalid userId:', req.params.userId);
      return res.status(400).json({ message: 'Invalid userId format' });
    }

    const user = await User.findById(req.params.userId);
    if (!user) {
      console.error('POST /api/users/:userId/schedule - User not found:', req.params.userId);
      return res.status(404).json({ message: 'User not found' });
    }

    const updateData = {
      workingHours: {
        start: startTime,
        end: endTime,
        breaks: breaks || [],
        date,
      },
      $push: {
        schedule: {
          date,
          startTime,
          endTime,
          breaks: breaks || [],
        },
      },
    };

    await User.findByIdAndUpdate(req.params.userId, updateData, { new: true, runValidators: false });
    console.log('POST /api/users/:userId/schedule - Schedule updated for user:', req.params.userId);
    res.status(200).json({ message: 'Schedule updated successfully' });
  } catch (error) {
    console.error('Error in POST /api/users/:userId/schedule:', error.message);
    res.status(500).json({ message: 'Failed to update schedule', error: error.message });
  }
});

// Other routes
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
    console.error('Error in GET /api/reports/all:', error.message);
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

    let { title, type, date, time, reportToHR, anonymous, location, description, involvedParties } = req.body;
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

    await report.save();
    console.log('POST /api/report - Report saved:', report._id);
    res.status(201).json({ success: true, message: 'Report submitted successfully', data: report });
  } catch (error) {
    console.error('Error in POST /api/report:', error.message);
    res.status(500).json({ success: false, message: 'Failed to create report', error: error.message });
  }
});

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
    console.log('POST /api/appointments - Appointment created:', appointment._id);
    res.status(201).json({ message: 'Appointment created successfully', appointment });
  } catch (error) {
    console.error('Error in POST /api/appointments:', error.message);
    res.status(500).json({ message: 'Failed to create appointment', error: error.message });
  }
});

app.get('/api/appointments', async (req, res) => {
  try {
    const { userId } = req.query;
    const query = userId ? { user: userId } : {};
    const appointments = await Appointment.find(query).populate('user', 'name email role');
    console.log('GET /api/appointments - Appointments found:', appointments.length);
    res.status(200).json({ appointments });
  } catch (error) {
    console.error('Error in GET /api/appointments:', error.message);
    res.status(500).json({ message: 'Failed to fetch appointments', error: error.message });
  }
});

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
    console.log('POST /api/polls - Poll created:', poll._id);
    res.status(201).json({ message: 'Poll created successfully', poll });
  } catch (error) {
    console.error('Error in POST /api/polls:', error.message);
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
    console.log('POST /api/add_poll - Poll created:', poll._id);
    res.status(201).json({ message: 'Poll created successfully', poll });
  } catch (error) {
    console.error('Error in POST /api/add_poll:', error.message);
    res.status(500).json({ message: 'Failed to create poll', error: error.message });
  }
});

app.get('/api/polls', async (req, res) => {
  try {
    const polls = await Poll.find();
    console.log('GET /api/polls - Polls found:', polls.length);
    res.status(200).json({ polls });
  } catch (error) {
    console.error('Error in GET /api/polls:', error.message);
    res.status(500).json({ message: 'Failed to fetch polls', error: error.message });
  }
});

app.post('/api/calls', auth, async (req, res) => {
  try {
    console.log('POST /api/calls - Request body:', req.body, 'User:', req.user);
    const { recipientId } = req.body;
    if (!recipientId) {
      return res.status(400).json({ message: 'Recipient ID is required' });
    }
    const call = new Call({ caller: req.user.userId, recipient: recipientId });
    await call.save();
    console.log('POST /api/calls - Call created:', call._id);
    res.status(201).json({ message: 'Call initiated', call });
  } catch (error) {
    console.error('Error in POST /api/calls:', error.message);
    res.status(500).json({ message: 'Failed to initiate call', error: error.message });
  }
});

app.get('/api/challenges', (req, res) => {
  console.log('GET /api/challenges - Request received');
  res.status(200).json({ message: 'Challenges endpoint', challenges: [] });
});

// ZegoCloud token generation
const APP_ID = 1757000422;
const SERVER_SECRET = "0ce7e80431c85f491e586b683d3737b4";

const ErrorCode = {
  success: 0,
  appIDInvalid: 1,
  userIDInvalid: 3,
  secretInvalid: 5,
  effectiveTimeInSecondsInvalid: 6,
};

const KPrivilegeKey = {
  PrivilegeKeyLogin: 1,
  PrivilegeKeyPublish: 2,
};

const KPrivilegeVal = {
  PrivilegeEnable: 1,
  PrivilegeDisable: 0,
};

function RndNum(a, b) {
  return Math.ceil((a + (b - a)) * Math.random());
}

function makeNonce() {
  return RndNum(-2147483648, 2147483647);
}

function makeRandomIv() {
  const str = '0123456789abcdefghijklmnopqrstuvwxyz';
  const result = [];
  for (let i = 0; i < 16; i++) {
    const r = Math.floor(Math.random() * str.length);
    result.push(str.charAt(r));
  }
  return result.join('');
}

function getAlgorithm(keyBase64) {
  const key = Buffer.from(keyBase64);
  switch (key.length) {
    case 16:
      return 'aes-128-cbc';
    case 24:
      return 'aes-192-cbc';
    case 32:
      return 'aes-256-cbc';
  }
  throw new Error('Invalid key length: ' + key.length);
}

function aesEncrypt(plainText, key, iv) {
  const cipher = createCipheriv(getAlgorithm(key), key, iv);
  cipher.setAutoPadding(true);
  const encrypted = cipher.update(plainText);
  const final = cipher.final();
  const out = Buffer.concat([encrypted, final]);
  return Uint8Array.from(out).buffer;
}

function generateToken04(appId, userId, secret, effectiveTimeInSeconds, payload) {
  if (!appId || typeof appId !== 'number') {
    throw { errorCode: ErrorCode.appIDInvalid, errorMessage: 'appID invalid' };
  }
  if (!userId || typeof userId !== 'string') {
    throw { errorCode: ErrorCode.userIDInvalid, errorMessage: 'userId invalid' };
  }
  if (!secret || typeof secret !== 'string' || secret.length !== 32) {
    throw { errorCode: ErrorCode.secretInvalid, errorMessage: 'secret must be a 32 byte string' };
  }
  if (!effectiveTimeInSeconds || typeof effectiveTimeInSeconds !== 'number') {
    throw { errorCode: ErrorCode.effectiveTimeInSecondsInvalid, errorMessage: 'effectiveTimeInSeconds invalid' };
  }

  const createTime = Math.floor(new Date().getTime() / 1000);
  const tokenInfo = {
    app_id: appId,
    user_id: userId,
    nonce: makeNonce(),
    ctime: createTime,
    expire: createTime + effectiveTimeInSeconds,
    payload: payload || ''
  };

  const plainText = JSON.stringify(tokenInfo);
  console.log('Zego token plain text:', plainText);
  const iv = makeRandomIv();
  console.log('Zego token IV:', iv);

  const encryptBuf = aesEncrypt(plainText, secret, iv);
  const [b1, b2, b3] = [new Uint8Array(8), new Uint8Array(2), new Uint8Array(2)];
  new DataView(b1.buffer).setBigInt64(0, BigInt(tokenInfo.expire), false);
  new DataView(b2.buffer).setUint16(0, iv.length, false);
  new DataView(b3.buffer).setUint16(0, encryptBuf.byteLength, false);
  const buf = Buffer.concat([
    Buffer.from(b1),
    Buffer.from(b2),
    Buffer.from(iv),
    Buffer.from(b3),
    Buffer.from(encryptBuf),
  ]);
  const dv = new DataView(Uint8Array.from(buf).buffer);

  return '04' + Buffer.from(dv.buffer).toString('base64');
}

app.get("/api/zego/token", (req, res) => {
  try {
    const { userID, roomID } = req.query;
    console.log('GET /api/zego/token - Request query:', { userID, roomID });

    if (!userID || !roomID) {
      return res.status(400).json({ error: 'userID and roomID required' });
    }

    const token = generateToken04(
      APP_ID,
      userID,
      SERVER_SECRET,
      3600,
      JSON.stringify({ room_id: roomID })
    );
    console.log('GET /api/zego/token - Token generated for user:', userID);

    res.json({ token, appID: APP_ID, userID, roomID });
  } catch (error) {
    console.error('Error in GET /api/zego/token:', error.message);
    res.status(500).json({ error: 'Token generation failed', details: error.message });
  }
});

// Mount other routes after custom routes to avoid conflicts
app.use('/api/auth', authRoutes);
app.use('/api', challengeRoutes);
app.use('/api', doctorRoutes);
app.use('/api', reportRoutes);
app.use('/uploads', express.static(path.join(process.cwd(), 'Uploads')));
app.use('/api/documents', (req, res, next) => {
  res.header('Cross-Origin-Resource-Policy', 'cross-origin');
  res.header('Cross-Origin-Embedder-Policy', 'unsafe-none');
  next();
}, documentRoutes);
app.use('/api/posts', postRoutes);

app.use('/api/protected', auth, (req, res) => {
  console.log('GET /api/protected - User:', req.user);
  res.status(200).json({ message: 'You are logged in and can access this protected route.' });
});

app.get('/health', (req, res) => {
  console.log('GET /health - Health check');
  res.status(200).json({ status: 'ok', message: 'Server is running' });
});

// Catch-all for undefined routes
app.use((req, res) => {
  console.log('404 - Route not found:', req.method, req.url);
  res.status(404).json({ message: 'API endpoint not found' });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Global error handler:', err.message, err.stack);
  res.status(500).json({
    message: 'Internal server error',
    error: process.env.NODE_ENV === 'production' ? 'An error occurred' : err.message
  });
});

const io = new Server(server, {
  cors: {
    origin: (origin, callback) => {
      console.log('Socket.IO Request Origin:', origin);
      if (!origin || allowedOrigins.includes(origin) || /^https:\/\/emp-health-frontend-.*\.vercel\.app$/.test(origin)) {
        callback(null, true);
      } else {
        console.error('Socket.IO CORS Error: Origin not allowed:', origin);
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
    console.log('Socket.IO: User joined room:', roomId, userId);
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
        console.log('Socket.IO: User disconnected from room:', room);
      }
    });
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
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
