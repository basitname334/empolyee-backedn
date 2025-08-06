const User = require('../models/User');
const Call = require('../models/Call');

const activeUsers = new Map();
const activeCalls = new Map();

function socketHandler(io) {
  io.on('connection', (socket) => {
    console.log('✅ New client connected:', socket.id);

    socket.on('user-joined', async (userData) => {
      try {
        activeUsers.set(socket.id, userData);
        await User.findByIdAndUpdate(userData.id, {
          isOnline: true,
          socketId: socket.id,
        });
        socket.emit('your-info', {
          id: userData.id,
          name: userData.name || userData.username || userData.email,
          role: userData.role,
          socketId: socket.id,
        });
        if (userData.role === 'doctor') {
          const onlineEmployees = getOnlineUsersByRole('employee');
          socket.emit('available-users', onlineEmployees);
          broadcastToRole(io, activeUsers, 'employee', 'available-users', [getUserInfo(userData)]);
        } else if (userData.role === 'employee') {
          const onlineDoctors = getOnlineUsersByRole('doctor');
          socket.emit('available-users', onlineDoctors);
          broadcastToRole(io, activeUsers, 'doctor', 'available-users', [getUserInfo(userData)]);
        }
        broadcastToAdmins(io, activeUsers, 'user-status-update', {
          userId: userData.id,
          username: userData.username || userData.name || userData.email,
          role: userData.role,
          isOnline: true,
        });
      } catch (error) {
        console.error('❌ Error in user-joined:', error);
        socket.emit('error', { message: 'Failed to join call service' });
      }
    });

    socket.on('get-available-users', () => {
      const user = activeUsers.get(socket.id);
      if (!user) {
        socket.emit('error', { message: 'User not authenticated' });
        return;
      }
      if (user.role === 'doctor') {
        socket.emit('available-users', getOnlineUsersByRole('employee'));
      } else if (user.role === 'employee') {
        socket.emit('available-users', getOnlineUsersByRole('doctor'));
      }
    });

    socket.on('initiate-call', async ({ callerId, calleeId, callerName, signalData, from }) => {
      try {
        const callee = await User.findById(calleeId);
        if (!callee?.socketId) {
          socket.emit('call-error', { message: 'User is offline or not connected' });
          return;
        }
        const call = new Call({ caller: callerId, callee: calleeId, status: 'initiated' });
        await call.save();
        const callId = call._id.toString();
        const callInfo = {
          callId,
          caller: { id: callerId, name: callerName, socketId: socket.id },
          callee: { id: calleeId, name: callee.name || callee.email, socketId: callee.socketId },
          status: 'initiated',
          startTime: new Date(),
        };
        activeCalls.set(callId, callInfo);
        io.to(callee.socketId).emit('call-made', {
          callId,
          signal: signalData,
          from,
          name: callerName,
        });
        broadcastToAdmins(io, activeUsers, 'new-call', callInfo);
      } catch (err) {
        console.error('❌ initiate-call error:', err);
        socket.emit('call-error', { message: 'Failed to initiate call. Check server logs.' });
      }
    });

    socket.on('accept-call', async ({ callId, signal, to }) => {
      try {
        const call = activeCalls.get(callId);
        if (!call) {
          socket.emit('call-error', { message: 'Call not found' });
          return;
        }
        call.status = 'accepted';
        await Call.findByIdAndUpdate(callId, { status: 'accepted' });
        io.to(call.caller.socketId).emit('call-accepted', signal);
        io.to(call.callee.socketId).emit('call-accepted', signal);
        broadcastToAdmins(io, activeUsers, 'call-status-update', call);
      } catch (err) {
        console.error('❌ accept-call error:', err);
        socket.emit('call-error', { message: 'Failed to accept call. Check TURN server or network.' });
      }
    });

    socket.on('reject-call', async ({ callId, to }) => {
      try {
        const call = activeCalls.get(callId);
        if (!call) {
          socket.emit('call-error', { message: 'Call not found' });
          return;
        }
        await Call.findByIdAndUpdate(callId, { status: 'rejected', endTime: new Date() });
        io.to(to).emit('call-rejected', { callId });
        activeCalls.delete(callId);
        broadcastToAdmins(io, activeUsers, 'call-ended', { callId, reason: 'rejected' });
      } catch (err) {
        console.error('❌ reject-call error:', err);
        socket.emit('call-error', { message: 'Failed to reject call' });
      }
    });

    socket.on('end-call', async ({ callId, to }) => {
      try {
        const call = activeCalls.get(callId);
        if (!call) {
          socket.emit('call-error', { message: 'Call not found' });
          return;
        }
        const endTime = new Date();
        const duration = Math.floor((endTime - call.startTime) / 1000);
        await Call.findByIdAndUpdate(callId, { status: 'ended', endTime, duration });
        io.to(call.caller.socketId).emit('call-ended', { callId });
        io.to(call.callee.socketId).emit('call-ended', { callId });
        activeCalls.delete(callId);
        broadcastToAdmins(io, activeUsers, 'call-ended', { callId, duration });
      } catch (err) {
        console.error('❌ end-call error:', err);
        socket.emit('call-error', { message: 'Failed to end call' });
      }
    });

    socket.on('offer', ({ offer, target, from }) => {
      io.to(target).emit('offer', { offer, from });
    });

    socket.on('answer', ({ answer, target, from }) => {
      io.to(target).emit('answer', { answer, from });
    });

    socket.on('ice-candidate', ({ candidate, target, from }) => {
      io.to(target).emit('ice-candidate', { candidate, from });
    });

    socket.on('get-active-calls', () => {
      const user = activeUsers.get(socket.id);
      if (user?.role === 'admin') {
        socket.emit('active-calls', Array.from(activeCalls.values()));
      }
    });

    socket.on('disconnect', async () => {
      const user = activeUsers.get(socket.id);
      if (!user) return;
      await User.findByIdAndUpdate(user.id, { isOnline: false, socketId: null });
      for (const [callId, call] of activeCalls.entries()) {
        if (call.caller.socketId === socket.id || call.callee.socketId === socket.id) {
          const otherSocketId = call.caller.socketId === socket.id ? call.callee.socketId : call.caller.socketId;
          io.to(otherSocketId).emit('call-ended', { callId, reason: 'disconnect' });
          await Call.findByIdAndUpdate(callId, { status: 'ended', endTime: new Date() });
          activeCalls.delete(callId);
        }
      }
      if (user.role === 'doctor') {
        broadcastToRole(io, activeUsers, 'employee', 'user-disconnected', {
          id: user.id,
          name: user.name || user.username || user.email,
          role: user.role,
          socketId: socket.id,
        });
      } else if (user.role === 'employee') {
        broadcastToRole(io, activeUsers, 'doctor', 'user-disconnected', {
          id: user.id,
          name: user.name || user.username || user.email,
          role: user.role,
          socketId: socket.id,
        });
      }
      broadcastToAdmins(io, activeUsers, 'user-status-update', {
        userId: user.id,
        username: user.username || user.name || user.email,
        role: user.role,
        isOnline: false,
      });
      activeUsers.delete(socket.id);
    });
  });

  setInterval(() => {
    console.log(`📊 Active Users: ${activeUsers.size}, Active Calls: ${activeCalls.size}`);
  }, 30000);
}

function getOnlineUsersByRole(role) {
  const users = [];
  for (const [socketId, userData] of activeUsers.entries()) {
    if (userData.role === role) {
      users.push(getUserInfo(userData));
    }
  }
  return users;
}

function getUserInfo(userData) {
  return {
    id: userData.id,
    name: userData.name || userData.username || userData.email,
    role: userData.role,
    socketId: userData.socketId || userData.socketId,
  };
}

function broadcastToRole(io, activeUsers, targetRole, event, data) {
  for (const [socketId, user] of activeUsers.entries()) {
    if (user.role === targetRole) {
      io.to(socketId).emit(event, data);
    }
  }
}

function broadcastToAdmins(io, activeUsers, event, data) {
  for (const [socketId, user] of activeUsers.entries()) {
    if (user.role === 'admin') {
      io.to(socketId).emit(event, data);
    }
  }
}

module.exports = socketHandler;
