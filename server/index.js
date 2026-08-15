import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import db, { initDb } from './db.js';
import { authenticateToken, generateToken, JWT_SECRET } from './middleware/auth.js';

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
});

app.use(cors());
app.use(express.json());

// ──────────────────────────────────────────────
//  Avatar color palette
// ──────────────────────────────────────────────
const AVATAR_COLORS = [
  '#8b5cf6', '#06b6d4', '#10b981', '#f59e0b',
  '#ef4444', '#ec4899', '#6366f1', '#14b8a6',
  '#f97316', '#a855f7', '#3b82f6', '#84cc16',
];

function randomColor() {
  return AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)];
}

// ──────────────────────────────────────────────
//  AUTH ROUTES
// ──────────────────────────────────────────────

// Sign Up
app.post('/api/auth/signup', (req, res) => {
  try {
    const { username, displayName, password } = req.body;

    if (!username || !displayName || !password) {
      return res.status(400).json({ error: 'All fields are required.' });
    }

    if (username.length < 3 || username.length > 20) {
      return res.status(400).json({ error: 'Username must be 3-20 characters.' });
    }

    if (!/^[a-zA-Z0-9_]+$/.test(username)) {
      return res.status(400).json({ error: 'Username can only contain letters, numbers, and underscores.' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters.' });
    }

    // Check if username already exists
    const existingUser = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
    if (existingUser) {
      return res.status(409).json({ error: 'Username already taken.' });
    }

    const passwordHash = bcrypt.hashSync(password, 10);
    const avatarColor = randomColor();

    const result = db.prepare(
      'INSERT INTO users (username, displayName, passwordHash, avatarColor) VALUES (?, ?, ?, ?)'
    ).run(username, displayName, passwordHash, avatarColor);

    const user = { id: result.lastInsertRowid, username };
    const token = generateToken(user);

    res.status(201).json({
      token,
      user: {
        id: result.lastInsertRowid,
        username,
        displayName,
        avatarColor,
      },
    });
  } catch (err) {
    console.error('Signup error:', err);
    res.status(500).json({ error: 'Server error during signup.' });
  }
});

// Sign In
app.post('/api/auth/signin', (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required.' });
    }

    const user = db.prepare(
      'SELECT id, username, displayName, passwordHash, avatarColor FROM users WHERE username = ?'
    ).get(username);

    if (!user) {
      return res.status(401).json({ error: 'Invalid username or password.' });
    }

    const validPassword = bcrypt.compareSync(password, user.passwordHash);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid username or password.' });
    }

    // Update last seen
    db.prepare('UPDATE users SET lastSeen = CURRENT_TIMESTAMP WHERE id = ?').run(user.id);

    const token = generateToken(user);

    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        avatarColor: user.avatarColor,
      },
    });
  } catch (err) {
    console.error('Signin error:', err);
    res.status(500).json({ error: 'Server error during signin.' });
  }
});

// Get current user
app.get('/api/auth/me', authenticateToken, (req, res) => {
  const user = db.prepare(
    'SELECT id, username, displayName, avatarColor, bio, createdAt FROM users WHERE id = ?'
  ).get(req.user.id);

  if (!user) return res.status(404).json({ error: 'User not found.' });
  res.json({ user });
});

// ──────────────────────────────────────────────
//  USER ROUTES
// ──────────────────────────────────────────────

// Search users by username
app.get('/api/users/search', authenticateToken, (req, res) => {
  const { q } = req.query;
  if (!q || q.length < 2) {
    return res.json({ users: [] });
  }

  const users = db.prepare(
    `SELECT id, username, displayName, avatarColor 
     FROM users 
     WHERE username LIKE ? AND id != ? 
     LIMIT 20`
  ).all(`%${q}%`, req.user.id);

  // For each user, check friendship/request status
  const usersWithStatus = users.map((u) => {
    const friendRequest = db.prepare(
      `SELECT id, status, fromUserId FROM friend_requests 
       WHERE (fromUserId = ? AND toUserId = ?) OR (fromUserId = ? AND toUserId = ?)`
    ).get(req.user.id, u.id, u.id, req.user.id);

    let friendStatus = 'none';
    if (friendRequest) {
      if (friendRequest.status === 'accepted') friendStatus = 'friends';
      else if (friendRequest.status === 'pending') {
        friendStatus = friendRequest.fromUserId === req.user.id ? 'sent' : 'received';
      }
    }

    return { ...u, friendStatus };
  });

  res.json({ users: usersWithStatus });
});

// ──────────────────────────────────────────────
//  FRIEND ROUTES
// ──────────────────────────────────────────────

// Send friend request
app.post('/api/friends/request', authenticateToken, (req, res) => {
  try {
    const { toUserId } = req.body;
    const fromUserId = req.user.id;

    if (fromUserId === toUserId) {
      return res.status(400).json({ error: "You can't send a request to yourself." });
    }

    // Check target user exists
    const targetUser = db.prepare('SELECT id FROM users WHERE id = ?').get(toUserId);
    if (!targetUser) {
      return res.status(404).json({ error: 'User not found.' });
    }

    // Check if request already exists
    const existing = db.prepare(
      `SELECT id, status FROM friend_requests 
       WHERE (fromUserId = ? AND toUserId = ?) OR (fromUserId = ? AND toUserId = ?)`
    ).get(fromUserId, toUserId, toUserId, fromUserId);

    if (existing) {
      if (existing.status === 'accepted') {
        return res.status(400).json({ error: 'You are already friends.' });
      }
      if (existing.status === 'pending') {
        return res.status(400).json({ error: 'Friend request already pending.' });
      }
      // If rejected, allow re-sending by updating
      db.prepare(
        'UPDATE friend_requests SET fromUserId = ?, toUserId = ?, status = ?, createdAt = CURRENT_TIMESTAMP WHERE id = ?'
      ).run(fromUserId, toUserId, 'pending', existing.id);

      // Notify via socket
      const targetSocketId = onlineUsers.get(toUserId);
      if (targetSocketId) {
        const fromUser = db.prepare('SELECT id, username, displayName, avatarColor FROM users WHERE id = ?').get(fromUserId);
        io.to(targetSocketId).emit('friend:request', { from: fromUser });
      }

      return res.json({ message: 'Friend request sent.' });
    }

    db.prepare(
      'INSERT INTO friend_requests (fromUserId, toUserId) VALUES (?, ?)'
    ).run(fromUserId, toUserId);

    // Notify via socket
    const targetSocketId = onlineUsers.get(toUserId);
    if (targetSocketId) {
      const fromUser = db.prepare('SELECT id, username, displayName, avatarColor FROM users WHERE id = ?').get(fromUserId);
      io.to(targetSocketId).emit('friend:request', { from: fromUser });
    }

    res.status(201).json({ message: 'Friend request sent.' });
  } catch (err) {
    console.error('Friend request error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// Get friend requests (incoming & outgoing)
app.get('/api/friends/requests', authenticateToken, (req, res) => {
  const incoming = db.prepare(
    `SELECT fr.id, fr.status, fr.createdAt,
            u.id as userId, u.username, u.displayName, u.avatarColor
     FROM friend_requests fr
     JOIN users u ON u.id = fr.fromUserId
     WHERE fr.toUserId = ? AND fr.status = 'pending'
     ORDER BY fr.createdAt DESC`
  ).all(req.user.id);

  const outgoing = db.prepare(
    `SELECT fr.id, fr.status, fr.createdAt,
            u.id as userId, u.username, u.displayName, u.avatarColor
     FROM friend_requests fr
     JOIN users u ON u.id = fr.toUserId
     WHERE fr.fromUserId = ? AND fr.status = 'pending'
     ORDER BY fr.createdAt DESC`
  ).all(req.user.id);

  res.json({ incoming, outgoing });
});

// Accept friend request
app.put('/api/friends/accept/:requestId', authenticateToken, (req, res) => {
  const { requestId } = req.params;

  const request = db.prepare(
    'SELECT * FROM friend_requests WHERE id = ? AND toUserId = ? AND status = ?'
  ).get(requestId, req.user.id, 'pending');

  if (!request) {
    return res.status(404).json({ error: 'Friend request not found.' });
  }

  db.prepare('UPDATE friend_requests SET status = ? WHERE id = ?').run('accepted', requestId);

  // Notify the requester via socket
  const requesterSocketId = onlineUsers.get(request.fromUserId);
  if (requesterSocketId) {
    const acceptedByUser = db.prepare('SELECT id, username, displayName, avatarColor FROM users WHERE id = ?').get(req.user.id);
    io.to(requesterSocketId).emit('friend:accepted', { user: acceptedByUser });
  }

  res.json({ message: 'Friend request accepted.' });
});

// Reject friend request
app.put('/api/friends/reject/:requestId', authenticateToken, (req, res) => {
  const { requestId } = req.params;

  const request = db.prepare(
    'SELECT * FROM friend_requests WHERE id = ? AND toUserId = ? AND status = ?'
  ).get(requestId, req.user.id, 'pending');

  if (!request) {
    return res.status(404).json({ error: 'Friend request not found.' });
  }

  db.prepare('UPDATE friend_requests SET status = ? WHERE id = ?').run('rejected', requestId);
  res.json({ message: 'Friend request rejected.' });
});

// Get friends list
app.get('/api/friends', authenticateToken, (req, res) => {
  const friends = db.prepare(
    `SELECT u.id, u.username, u.displayName, u.avatarColor, u.lastSeen
     FROM friend_requests fr
     JOIN users u ON (u.id = CASE WHEN fr.fromUserId = ? THEN fr.toUserId ELSE fr.fromUserId END)
     WHERE (fr.fromUserId = ? OR fr.toUserId = ?) AND fr.status = 'accepted'
     ORDER BY u.displayName`
  ).all(req.user.id, req.user.id, req.user.id);

  // Add online status and last message for each friend
  const friendsWithMeta = friends.map((friend) => {
    const isOnline = onlineUsers.has(friend.id);

    const lastMessage = db.prepare(
      `SELECT content, senderId, createdAt FROM messages
       WHERE (senderId = ? AND receiverId = ?) OR (senderId = ? AND receiverId = ?)
       ORDER BY createdAt DESC LIMIT 1`
    ).get(req.user.id, friend.id, friend.id, req.user.id);

    const unreadCount = db.prepare(
      `SELECT COUNT(*) as count FROM messages
       WHERE senderId = ? AND receiverId = ? AND read = 0`
    ).get(friend.id, req.user.id);

    return {
      ...friend,
      isOnline,
      lastMessage: lastMessage || null,
      unreadCount: unreadCount?.count || 0,
    };
  });

  res.json({ friends: friendsWithMeta });
});

// ──────────────────────────────────────────────
//  MESSAGE ROUTES
// ──────────────────────────────────────────────

// Get chat history with a friend
app.get('/api/messages/:friendId', authenticateToken, (req, res) => {
  const { friendId } = req.params;
  const userId = req.user.id;

  // Verify they are friends
  const friendship = db.prepare(
    `SELECT id FROM friend_requests 
     WHERE ((fromUserId = ? AND toUserId = ?) OR (fromUserId = ? AND toUserId = ?)) 
     AND status = 'accepted'`
  ).get(userId, parseInt(friendId), parseInt(friendId), userId);

  if (!friendship) {
    return res.status(403).json({ error: 'You are not friends with this user.' });
  }

  const messages = db.prepare(
    `SELECT id, senderId, receiverId, content, type, read, createdAt
     FROM messages
     WHERE (senderId = ? AND receiverId = ?) OR (senderId = ? AND receiverId = ?)
     ORDER BY createdAt ASC
     LIMIT 500`
  ).all(userId, parseInt(friendId), parseInt(friendId), userId);

  // Mark messages from friend as read
  db.prepare(
    'UPDATE messages SET read = 1 WHERE senderId = ? AND receiverId = ? AND read = 0'
  ).run(parseInt(friendId), userId);

  res.json({ messages });
});

// ──────────────────────────────────────────────
//  SOCKET.IO — Real-Time
// ──────────────────────────────────────────────

// Map userId → socketId for online tracking
const onlineUsers = new Map();

io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) return next(new Error('Authentication required'));

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    socket.userId = decoded.id;
    socket.username = decoded.username;
    next();
  } catch (err) {
    next(new Error('Invalid token'));
  }
});

io.on('connection', (socket) => {
  const userId = socket.userId;
  console.log(`✨ User connected: ${socket.username} (${userId})`);

  // Track online status
  onlineUsers.set(userId, socket.id);

  // Notify friends that this user is online
  broadcastStatusToFriends(userId, true);

  // Update lastSeen
  db.prepare('UPDATE users SET lastSeen = CURRENT_TIMESTAMP WHERE id = ?').run(userId);

  // ── Send Message ──
  socket.on('message:send', (data) => {
    const { receiverId, content, type = 'text' } = data;

    // Store message in DB
    const result = db.prepare(
      'INSERT INTO messages (senderId, receiverId, content, type) VALUES (?, ?, ?, ?)'
    ).run(userId, receiverId, content, type);

    const message = {
      id: result.lastInsertRowid,
      senderId: userId,
      receiverId,
      content,
      type,
      read: 0,
      createdAt: new Date().toISOString(),
    };

    // Send to receiver if online
    const receiverSocketId = onlineUsers.get(receiverId);
    if (receiverSocketId) {
      io.to(receiverSocketId).emit('message:receive', message);
    }

    // Confirm to sender
    socket.emit('message:sent', message);
  });

  // ── Mark as Read ──
  socket.on('message:read', ({ friendId }) => {
    db.prepare(
      'UPDATE messages SET read = 1 WHERE senderId = ? AND receiverId = ? AND read = 0'
    ).run(friendId, userId);

    const friendSocketId = onlineUsers.get(friendId);
    if (friendSocketId) {
      io.to(friendSocketId).emit('message:read', { readBy: userId });
    }
  });

  // ── Typing Indicators ──
  socket.on('typing:start', ({ receiverId }) => {
    const receiverSocketId = onlineUsers.get(receiverId);
    if (receiverSocketId) {
      io.to(receiverSocketId).emit('typing:start', { userId });
    }
  });

  socket.on('typing:stop', ({ receiverId }) => {
    const receiverSocketId = onlineUsers.get(receiverId);
    if (receiverSocketId) {
      io.to(receiverSocketId).emit('typing:stop', { userId });
    }
  });

  // ── Disconnect ──
  socket.on('disconnect', () => {
    console.log(`👋 User disconnected: ${socket.username} (${userId})`);
    onlineUsers.delete(userId);
    db.prepare('UPDATE users SET lastSeen = CURRENT_TIMESTAMP WHERE id = ?').run(userId);
    broadcastStatusToFriends(userId, false);
  });
});

function broadcastStatusToFriends(userId, isOnline) {
  // Get all accepted friends
  const friends = db.prepare(
    `SELECT CASE WHEN fromUserId = ? THEN toUserId ELSE fromUserId END as friendId
     FROM friend_requests
     WHERE (fromUserId = ? OR toUserId = ?) AND status = 'accepted'`
  ).all(userId, userId, userId);

  friends.forEach(({ friendId }) => {
    const friendSocketId = onlineUsers.get(friendId);
    if (friendSocketId) {
      io.to(friendSocketId).emit('user:status', { userId, isOnline });
    }
  });
}

// ──────────────────────────────────────────────
//  START SERVER
// ──────────────────────────────────────────────
const PORT = process.env.PORT || 3001;

async function start() {
  await initDb();
  httpServer.listen(PORT, () => {
    console.log(`\n🔒 OnlyUs server running on http://localhost:${PORT}\n`);
  });
}

start().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
