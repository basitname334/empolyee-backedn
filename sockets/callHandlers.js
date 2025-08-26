const activeUsers = new Map(); // socket.id => userData
const activeCalls = new Map(); // callId => callInfo

function socketHandler(io) {
  io.on('connection', (socket) => {
    console.log('✅ New client connected:', socket.id);

    // -------------------- User Joined --------------------
    socket.on('user-joined', async (userData) => {
      try {
        console.log('👤 User joining:', userData);
        
        // Store user data
        activeUsers.set(socket.id, {
          ...userData,
          socketId: socket.id,
          joinedAt: new Date()
        });

        // Send user their own info
        socket.emit('your-info', {
          id: userData.id,
          name: userData.name,
          role: userData.role,
          socketId: socket.id
        });

        // Send available users based on role
        const availableUsers = getAvailableUsersByRole(userData.role);
        socket.emit('available-users', availableUsers);

        // Notify other users about this user joining
        notifyOtherUsers(socket.id, userData);

        console.log(`✅ ${userData.role} ${userData.name} joined (${socket.id})`);
        logActiveUsers();
      } catch (error) {
        console.error('❌ Error in user-joined:', error);
        socket.emit('error', { message: 'Failed to join' });
      }
    });

    // -------------------- Get Available Users --------------------
    socket.on('get-available-users', () => {
      const user = activeUsers.get(socket.id);
      if (!user) {
        socket.emit('error', { message: 'User not found' });
        return;
      }

      const availableUsers = getAvailableUsersByRole(user.role);
      socket.emit('available-users', availableUsers);
      console.log(`📋 Sent ${availableUsers.length} available users to ${user.name}`);
    });

    // -------------------- Call Initiation --------------------
    socket.on('initiate-call', async ({ callerId, calleeId, callerName }) => {
      try {
        console.log(`📞 Call initiated: ${callerName} (${callerId}) calling ${calleeId}`);
        
        // Find the callee
        const callee = findUserById(calleeId);
        if (!callee) {
          socket.emit('call-error', { message: 'User not found or offline' });
          return;
        }

        const callId = generateCallId();
        const callInfo = {
          callId,
          caller: { id: callerId, name: callerName, socketId: socket.id },
          callee: { id: calleeId, name: callee.name, socketId: callee.socketId },
          status: 'initiated',
          startTime: new Date()
        };

        activeCalls.set(callId, callInfo);

        // Notify the callee
        io.to(callee.socketId).emit('incoming-call', {
          callId,
          callerId,
          callerName,
          callerSocketId: socket.id
        });

        console.log(`📞 Incoming call sent to ${callee.name} (${callee.socketId})`);
      } catch (error) {
        console.error('❌ initiate-call error:', error);
        socket.emit('call-error', { message: 'Failed to initiate call' });
      }
    });

    // -------------------- Accept Call --------------------
    socket.on('accept-call', async ({ callId }) => {
      try {
        const call = activeCalls.get(callId);
        if (!call) {
          socket.emit('call-error', { message: 'Call not found' });
          return;
        }

        call.status = 'accepted';
        call.acceptedAt = new Date();

        // Notify both parties
        io.to(call.caller.socketId).emit('call-accepted', { callId });
        io.to(call.callee.socketId).emit('call-accepted', { callId });

        console.log(`✅ Call ${callId} accepted`);
      } catch (error) {
        console.error('❌ accept-call error:', error);
        socket.emit('call-error', { message: 'Failed to accept call' });
      }
    });

    // -------------------- Reject Call --------------------
    socket.on('reject-call', async ({ callId }) => {
      try {
        const call = activeCalls.get(callId);
        if (!call) return;

        call.status = 'rejected';
        call.endTime = new Date();

        // Notify the caller
        io.to(call.caller.socketId).emit('call-rejected', { callId });

        activeCalls.delete(callId);
        console.log(`❌ Call ${callId} rejected`);
      } catch (error) {
        console.error('❌ reject-call error:', error);
      }
    });

    // -------------------- End Call --------------------
    socket.on('end-call', async ({ callId }) => {
      try {
        const call = activeCalls.get(callId);
        if (!call) return;

        const endTime = new Date();
        call.status = 'ended';
        call.endTime = endTime;
        call.duration = Math.floor((endTime - call.startTime) / 1000);

        // Notify both parties
        io.to(call.caller.socketId).emit('call-ended', { callId });
        io.to(call.callee.socketId).emit('call-ended', { callId });

        activeCalls.delete(callId);
        console.log(`📞 Call ${callId} ended (duration: ${call.duration}s)`);
      } catch (error) {
        console.error('❌ end-call error:', error);
      }
    });

    // -------------------- WebRTC Signaling --------------------
    socket.on('offer', ({ offer, target }) => {
      console.log(`📤 Relaying offer from ${socket.id} to ${target}`);
      io.to(target).emit('offer', { offer, from: socket.id });
    });

    socket.on('answer', ({ answer, target }) => {
      console.log(`📤 Relaying answer from ${socket.id} to ${target}`);
      io.to(target).emit('answer', { answer, from: socket.id });
    });

    socket.on('ice-candidate', ({ candidate, target }) => {
      console.log(`📤 Relaying ICE candidate from ${socket.id} to ${target}`);
      io.to(target).emit('ice-candidate', { candidate, from: socket.id });
    });

    // -------------------- Disconnect --------------------
    socket.on('disconnect', async () => {
      const user = activeUsers.get(socket.id);
      if (!user) return;

      console.log(`👋 ${user.name} (${user.role}) disconnected`);

      // Handle active calls involving this user
      for (const [callId, call] of activeCalls.entries()) {
        if (call.caller.socketId === socket.id || call.callee.socketId === socket.id) {
          const otherSocketId = call.caller.socketId === socket.id
            ? call.callee.socketId
            : call.caller.socketId;

          io.to(otherSocketId).emit('call-ended', { callId, reason: 'disconnect' });
          activeCalls.delete(callId);
          console.log(`📞 Call ${callId} ended due to disconnect`);
        }
      }

      // Notify other users about disconnection
      notifyUserDisconnected(socket.id, user);

      // Remove from active users
      activeUsers.delete(socket.id);
      logActiveUsers();
    });

    // -------------------- Ping/Pong --------------------
    socket.on('ping', () => {
      socket.emit('pong');
    });
  });

  // Status log every 30s
  setInterval(() => {
    logActiveUsers();
  }, 30000);
}

// Helper functions
function getAvailableUsersByRole(currentUserRole) {
  const targetRole = currentUserRole === 'doctor' ? 'employee' : 'doctor';
  const users = [];
  
  for (const [socketId, userData] of activeUsers.entries()) {
    if (userData.role === targetRole) {
      users.push({
        id: userData.id,
        name: userData.name,
        role: userData.role,
        socketId: userData.socketId
      });
    }
  }
  
  return users;
}

function findUserById(userId) {
  for (const [socketId, userData] of activeUsers.entries()) {
    if (userData.id === userId) {
      return userData;
    }
  }
  return null;
}

function notifyOtherUsers(newUserSocketId, newUserData) {
  const targetRole = newUserData.role === 'doctor' ? 'employee' : 'doctor';
  
  for (const [socketId, userData] of activeUsers.entries()) {
    if (socketId !== newUserSocketId && userData.role === targetRole) {
      // Send updated user list to existing users
      const availableUsers = getAvailableUsersByRole(userData.role);
      global.io.to(socketId).emit('available-users', availableUsers);
    }
  }
}

function notifyUserDisconnected(disconnectedSocketId, disconnectedUser) {
  const targetRole = disconnectedUser.role === 'doctor' ? 'employee' : 'doctor';
  
  for (const [socketId, userData] of activeUsers.entries()) {
    if (userData.role === targetRole) {
      // Send updated user list
      const availableUsers = getAvailableUsersByRole(userData.role);
      global.io.to(socketId).emit('available-users', availableUsers);
    }
  }
}

function generateCallId() {
  return 'call_' + Math.random().toString(36).substr(2, 9) + '_' + Date.now();
}

function logActiveUsers() {
  const doctors = [];
  const employees = [];
  
  for (const [socketId, userData] of activeUsers.entries()) {
    if (userData.role === 'doctor') {
      doctors.push(userData.name);
    } else if (userData.role === 'employee') {
      employees.push(userData.name);
    }
  }
  
  console.log(`📊 Active Users: ${activeUsers.size}, Active Calls: ${activeCalls.size}`);
  console.log(`👨‍⚕️ Doctors (${doctors.length}): ${doctors.join(', ') || 'None'}`);
  console.log(`👥 Employees (${employees.length}): ${employees.join(', ') || 'None'}`);
}

module.exports = socketHandler;