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

connectDB();

const app = express();
const server = http.createServer(app);

const allowedOrigins = [
  'http://localhost:3000',
  'https://emp-health-frontend.vercel.app',
  'https://*.vercel.app',
];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.some(allowed => 
      allowed === origin || (allowed.includes('*') && new RegExp(allowed.replace('*', '.*')).test(origin))
    )) {
      callback(null, true);
    } else {
      console.error('CORS Error: Origin not allowed:', origin);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-auth-token'],
}));

app.use(helmet());
app.use(express.json());
app.use(morgan('dev'));
verifyEmailConnection();
app.use('/uploads', express.static('uploads'));

const validateRequest = (req, res, next) => {
  if (!req.body || Object.keys(req.body).length === 0) {
    return res.status(400).json({ message: 'Request body is required' });
  }
  next();
};

app.get('/', (req, res) => res.send('CORS Configured!'));

app.use('/api/auth', authRoutes);
app.use('/api', challengeRoutes);
app.use('/api', doctorRoutes);
app.use('/api', reportRoutes);

app.get('/api/challenges', (req, res) => {
  res.status(200).json({ message: 'Challenges endpoint', challenges: [] });
});

app.post('/:userId/schedule', async (req, res) => {
  try {
    const { date, startTime, endTime, breaks } = req.body;
    if (!date || !startTime || !endTime) {
      return res.status(400).json({ message: 'Date, start time, and end time are required' });
    }
    const user = await User.findById(req.params.userId);
    if (!user) return res.status(404).json({ message: 'User not found' });
    if (user.role !== 'doctor') {
      return res.status(403).json({ message: 'Only doctors can update schedules' });
    }
    await User.findByIdAndUpdate(
      req.params.userId,
      {
        workingHours: { start: startTime, end: endTime, breaks: breaks || [] },
        $push: { schedule: { date, startTime, endTime, breaks: breaks || [] } },
      },
      { new: true, runValidators: false }
    );
    res.status(200).json({ message: 'Schedule updated successfully' });
  } catch (error) {
    console.error('Error in schedule update:', error);
    res.status(500).json({ message: error.message });
  }
});

app.get('/api/reports/all', auth, async (req, res) => {
  try {
    const reports = await Report.aggregate([
      { $sort: { createdAt: -1 } },
      { $lookup: { from: 'users', localField: 'user', foreignField: '_id', as: 'user' } },
      { $unwind: '$user' },
      { $project: { _id: 1, title: 1, description: 1, createdAt: 1, 'user.name': 1, 'user.email': 1 } },
    ], { allowDiskUse: true });
    res.status(200).json({ reports });
  } catch (error) {
    console.error('Error in GET /api/reports/all:', error);
    res.status(500).json({ message: 'Failed to fetch reports', error: error.message });
  }
});

app.post('/api/report', auth, validateRequest, async (req, res) => {
  try {
    let { title, type, date, time, reportToHR, anonymous, location, description, involvedParties } = req.body;
    if (!Array.isArray(involvedParties)) involvedParties = [];
    const allowedTypes = ['hazard', 'safety', 'incident'];
    const missingFields = [];
    if (!title) missingFields.push('title');
    if (!type || !allowedTypes.includes(type)) missingFields.push('type');
    if (!date) missingFields.push('date');
    if (!time) missingFields.push('time');
    if (!location) missingFields.push('location');
    if (!description) missingFields.push('description');
    if (missingFields.length > 0) {
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
    res.status(201).json({ success: true, message: 'Report submitted successfully', data: report });
  } catch (error) {
    console.error('Error in POST /api/report:', error);
    res.status(500).json({ success: false, message: 'Failed to create report', error: error.message });
  }
});

app.use('/api/protected', auth, (req, res) => {
  res.status(200).json({ message: 'You are logged in and can access this protected route.' });
});

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', message: 'Server is running' });
});

app.post('/api/appointments', auth, validateRequest, async (req, res) => {
  try {
    const { day, date, time, type, doctorName, avatarSrc, userId } = req.body;
    if (!day || !date || !time || !type || !doctorName || !avatarSrc || !userId) {
      return res.status(400).json({ message: 'All fields are required including userId.' });
    }
    if (!mongoose.Types.ObjectId.isValid(userId)) {
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

app.get('/api/all-doctors', async (req, res) => {
  try {
    const doctors = await User.find({ role: 'doctor' });
    res.status(200).json({ doctors });
  } catch (error) {
    console.error('Error in GET /api/all-doctors:', error);
    res.status(500).json({ message: 'Failed to fetch doctors', error: error.message });
  }
});

app.post('/api/polls', validateRequest, async (req, res) => {
  try {
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
    const { question, choices } = req.body;
    if (!question || !Array.isArray(choices) || choices.length < 2) {
      return res.status(400).json({ message: 'Question and at least 2 choices are required.' });
    }
    const formattedChoices = choices.map(choice => ({ text: choice, votes: 0 }));
    const poll = new Poll({ question, choices: formattedChoices });
    await poll.save();
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

app.post('/api/calls', auth, async (req, res) => {
  try {
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

app.use((req, res) => {
  res.status(404).json({ message: 'API endpoint not found' });
});

app.use((err, req, res, next) => {
  console.error('Global error handler:', err);
  res.status(500).json({
    message: 'Internal server error',
    error: process.env.NODE_ENV === 'production' ? 'An error occurred' : err.message,
  });
});

const io = new Server(server, {
  cors: {
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.some(allowed => 
        allowed === origin || (allowed.includes('*') && new RegExp(allowed.replace('*', '.*')).test(origin))
      )) {
        callback(null, true);
      } else {
        console.error('Socket.IO CORS Error: Origin not allowed:', origin);
        callback(new Error('Not allowed by CORS'));
      }
    },
    methods: ['GET', 'POST'],
    credentials: true,
  },
  pingTimeout: 60000,
  pingInterval: 25000,
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

  socket.on('reject-call', ({ to, callId }) => {
    io.to(to).emit('call-rejected', { callId });
  });

  socket.on('end-call', ({ to, callId }) => {
    io.to(to).emit('call-ended', { callId });
  });

  socket.on('ice-candidate', ({ candidate, to }) => {
    io.to(to).emit('ice-candidate', { candidate });
  });

  socket.on('offer', ({ offer, from, to }) => {
    io.to(to).emit('offer', { offer, from });
  });

  socket.on('answer', ({ answer, to }) => {
    io.to(to).emit('answer', { answer, from: socket.id });
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

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

process.on('unhandledRejection', err => {
  console.error('UNHANDLED REJECTION:', err.stack);
});

process.on('uncaughtException', err => {
  console.error('UNCAUGHT EXCEPTION:', err.stack);
  process.exit(1);
});
