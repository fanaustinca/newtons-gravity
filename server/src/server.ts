import express from 'express';
import { createServer } from 'http';
import { Server, Socket } from 'socket.io';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuid } from 'uuid';
import path from 'path';
import * as admin from 'firebase-admin';

// ── Types ──────────────────────────────────────────────────────────────────

interface User {
  id: string;
  username: string;
  passwordHash: string | null;
  isAnonymous: boolean;
  socketId?: string;
  totalIq: number;
}

interface UpgradeState {
  iqMultiplierLevel: number;
  healthLevel: number;
  speedLevel: number;
  magnetLevel: number;
}

interface RoomPlayer {
  userId: string;
  username: string;
  socketId: string;
  iq: number;
  x: number;
  z: number;
  yaw: number;
  colorIdx: number;
  isReady: boolean;
  upgrades: UpgradeState;
}

interface GameObject {
  id: string;
  type: 'apple' | 'anvil';
  x: number;
  y: number;
  z: number;
  speed: number;
  spawnedAt: number;
}

interface Room {
  id: string;
  name: string;
  hostSocketId: string;
  players: Map<string, RoomPlayer>;   // key = socketId
  objects: Map<string, GameObject>;   // key = objectId
  status: 'waiting' | 'playing' | 'upgrade' | 'ended';
  wave: number;
  waveTimer: ReturnType<typeof setTimeout> | null;
  spawnTimer: ReturnType<typeof setInterval> | null;
  createdAt: number;
}

// ── Config ─────────────────────────────────────────────────────────────────

const JWT_SECRET = process.env['JWT_SECRET'] || 'newton-gravity-secret-key-change-in-prod';
const PORT       = parseInt(process.env['PORT'] || '3000', 10);
const WAVE_DURATION_MS = 35_000;
const BASE_SPAWN_MS    = 1_800;
const MIN_SPAWN_MS     = 550;
const WAVE_DELAY_MS    = 15_000; // max wait for upgrade screen (matches client countdown)
const MAX_WAVES        = 20;
const MAX_PLAYERS      = 8;
const MIN_PLAYERS      = 2;

// ── Firestore ──────────────────────────────────────────────────────────────

admin.initializeApp();
const db = admin.firestore();
db.settings({ databaseId: 'newton' });

// ── In-memory stores ───────────────────────────────────────────────────────

const users = new Map<string, User>();          // key = userId (registered users loaded from Firestore + anonymous)
const rooms = new Map<string, Room>();          // key = roomId
const socketUserMap = new Map<string, string>(); // socketId → userId

/** Load all registered users from Firestore into memory on startup */
async function loadRegisteredUsers(): Promise<void> {
  const snapshot = await db.collection('users').where('isAnonymous', '==', false).get();
  snapshot.forEach(doc => {
    const d = doc.data() as Omit<User, 'id'>;
    users.set(doc.id, { ...d, id: doc.id });
  });
  console.log(`[firestore] Loaded ${snapshot.size} registered users`);
}

loadRegisteredUsers().catch(err => console.error('[firestore] load error:', err));

// ── Branch tips for server-side spawn positions ────────────────────────────

const BRANCH_TIPS = [
  [-10.5, 16.0, -2.0], [-8.0, 19.5, -1.5], [-5.5, 22.0, -3.0],
  [-2.0,  23.5, -2.0], [ 0.0, 24.5, -2.5], [ 2.0, 23.5, -1.5],
  [ 5.5,  22.0, -1.5], [ 8.0, 19.5, -2.5], [10.5, 16.0, -2.0],
  [-6.0,  18.0,  0.5], [ 6.0, 18.0,  0.5], [ 0.0, 20.0,  1.0],
  [-3.5,  20.0, -4.0], [ 3.5, 20.0, -4.0], [ 0.0, 16.5, -4.5],
];

// ── Auth helpers ───────────────────────────────────────────────────────────

function signToken(userId: string): string {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: '24h' });
}

function verifyToken(token: string): { userId: string } | null {
  try {
    return jwt.verify(token, JWT_SECRET) as { userId: string };
  } catch {
    return null;
  }
}

// ── Express app ────────────────────────────────────────────────────────────

const app = express();
const httpServer = createServer(app);

app.use(cors({ origin: '*' }));
app.use(express.json());

// Serve Angular build in production
const staticPath = path.join(__dirname, '../../public');
app.use(express.static(staticPath));

// REST: register permanent account
app.post('/api/auth/register', async (req, res) => {
  const { username, password } = req.body as { username: string; password: string };
  if (!username || !password || username.length < 2 || password.length < 6) {
    return res.status(400).json({ error: 'Username ≥ 2 chars, password ≥ 6 chars required.' });
  }
  const taken = [...users.values()].find(u => u.username.toLowerCase() === username.toLowerCase() && !u.isAnonymous);
  if (taken) return res.status(409).json({ error: 'Username already taken.' });

  const passwordHash = await bcrypt.hash(password, 10);
  const user: User = { id: uuid(), username, passwordHash, isAnonymous: false, totalIq: 0 };
  users.set(user.id, user);
  await db.collection('users').doc(user.id).set({ username, passwordHash, isAnonymous: false, totalIq: 0 });
  return res.json({ token: signToken(user.id), user: { id: user.id, username, isAnonymous: false } });
});

// REST: login
app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body as { username: string; password: string };
  const user = [...users.values()].find(u => u.username.toLowerCase() === username.toLowerCase() && !u.isAnonymous);
  if (!user || !user.passwordHash) return res.status(401).json({ error: 'Invalid credentials.' });
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return res.status(401).json({ error: 'Invalid credentials.' });
  return res.json({ token: signToken(user.id), user: { id: user.id, username: user.username, isAnonymous: false } });
});

// REST: leaderboard (public)
app.get('/api/leaderboard', (_req, res) => {
  const top = [...users.values()]
    .filter(u => !u.isAnonymous && u.totalIq > 0)
    .sort((a, b) => b.totalIq - a.totalIq)
    .slice(0, 10)
    .map(u => ({ username: u.username, totalIq: u.totalIq }));
  res.json(top);
});

// REST: report solo score (registered users only)
app.post('/api/score/report', async (req, res) => {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized.' });
  const payload = verifyToken(auth.slice(7));
  if (!payload) return res.status(401).json({ error: 'Invalid token.' });
  const user = users.get(payload.userId);
  if (!user || user.isAnonymous) return res.status(403).json({ error: 'Registered users only.' });
  const { iq } = req.body as { iq: number };
  if (typeof iq !== 'number' || iq < 0) return res.status(400).json({ error: 'Invalid IQ.' });
  user.totalIq += iq;
  await db.collection('users').doc(user.id).update({ totalIq: user.totalIq });
  return res.json({ totalIq: user.totalIq });
});

// SPA fallback
app.get('*', (_req, res) => {
  res.sendFile(path.join(staticPath, 'index.html'), err => {
    if (err) res.status(200).send('Newton\'s Gravity Server running.');
  });
});

// ── Socket.io ─────────────────────────────────────────────────────────────

const io = new Server(httpServer, {
  cors: { origin: '*' },
  transports: ['websocket', 'polling'],
});

io.use((socket, next) => {
  const token = socket.handshake.auth['token'] as string | undefined;
  if (token) {
    const payload = verifyToken(token);
    if (payload) {
      socketUserMap.set(socket.id, payload.userId);
      return next();
    }
  }
  // Allow anonymous handshake — user will authenticate via auth:anonymous event
  next();
});

io.on('connection', (socket: Socket) => {
  console.log(`[connect] ${socket.id}`);

  // ── Auth events ────────────────────────────────────────────────────────

  socket.on('auth:anonymous', ({ name }: { name: string }) => {
    const safeName = (name || 'Newton').slice(0, 20).replace(/[<>&]/g, '');
    const user: User = { id: uuid(), username: safeName, passwordHash: null, isAnonymous: true, socketId: socket.id, totalIq: 0 };
    users.set(user.id, user);
    socketUserMap.set(socket.id, user.id);
    socket.emit('auth:ok', { token: signToken(user.id), user: { id: user.id, username: user.username, isAnonymous: true } });
  });

  socket.on('auth:token', ({ token }: { token: string }) => {
    const payload = verifyToken(token);
    if (!payload) return socket.emit('auth:error', { error: 'Invalid token.' });
    const user = users.get(payload.userId);
    if (!user) return socket.emit('auth:error', { error: 'User not found.' });
    user.socketId = socket.id;
    socketUserMap.set(socket.id, user.id);
    socket.emit('auth:ok', { token, user: { id: user.id, username: user.username, isAnonymous: user.isAnonymous } });
  });

  // ── Room events ────────────────────────────────────────────────────────

  socket.on('room:list', () => {
    const list = [...rooms.values()]
      .filter(r => r.status !== 'ended' && r.players.size < MAX_PLAYERS)
      .map(r => ({
        id: r.id, name: r.name,
        playerCount: r.players.size,
        hostName: r.players.get(r.hostSocketId)?.username ?? '?',
        inProgress: r.status !== 'waiting',
        wave: r.wave,
      }));
    socket.emit('room:list', list);
  });

  socket.on('room:create', ({ name }: { name: string }) => {
    const userId = socketUserMap.get(socket.id);
    const user = userId ? users.get(userId) : null;
    if (!user) return socket.emit('error', 'Not authenticated.');

    const roomId = uuid().slice(0, 8).toUpperCase();
    const room: Room = {
      id: roomId, name: (name || 'Newton Room').slice(0, 30),
      hostSocketId: socket.id,
      players: new Map(), objects: new Map(),
      status: 'waiting', wave: 1,
      waveTimer: null, spawnTimer: null,
      createdAt: Date.now(),
    };
    const player: RoomPlayer = {
      userId: user.id, username: user.username, socketId: socket.id,
      iq: 0, x: 0, z: 3, yaw: 0, colorIdx: 0, isReady: false,
      upgrades: { iqMultiplierLevel: 0, healthLevel: 0, speedLevel: 0, magnetLevel: 0 },
    };
    room.players.set(socket.id, player);
    rooms.set(roomId, room);
    socket.join(roomId);
    socket.emit('room:joined', { room: roomSnapshot(room), you: player });
  });

  socket.on('room:join', ({ roomId }: { roomId: string }) => {
    const userId = socketUserMap.get(socket.id);
    const user = userId ? users.get(userId) : null;
    if (!user) return socket.emit('error', 'Not authenticated.');

    const room = rooms.get(roomId);
    if (!room) return socket.emit('room:error', 'Room not found.');
    if (room.status === 'ended') return socket.emit('room:error', 'Game has ended.');
    if (room.players.size >= MAX_PLAYERS) return socket.emit('room:error', 'Room is full.');

    const colorIdx = room.players.size;
    const player: RoomPlayer = {
      userId: user.id, username: user.username, socketId: socket.id,
      iq: 0, x: 0, z: 3, yaw: 0, colorIdx, isReady: false,
      upgrades: { iqMultiplierLevel: 0, healthLevel: 0, speedLevel: 0, magnetLevel: 0 },
    };
    room.players.set(socket.id, player);
    socket.join(roomId);

    // Notify the joining player
    socket.emit('room:joined', { room: roomSnapshot(room), you: player });
    // Notify others
    socket.to(roomId).emit('room:playerJoined', { player: publicPlayer(player) });
  });

  socket.on('room:leave', () => leaveRoom(socket));

  // ── Game events ────────────────────────────────────────────────────────

  socket.on('game:start', () => {
    const room = findPlayerRoom(socket.id);
    if (!room || room.hostSocketId !== socket.id) return;
    if (room.status !== 'waiting') return;
    if (room.players.size < MIN_PLAYERS) return socket.emit('room:error', `Need at least ${MIN_PLAYERS} players to start.`);
    startWave(room, io);
  });

  socket.on('player:move', ({ x, z, yaw }: { x: number; z: number; yaw: number }) => {
    const room = findPlayerRoom(socket.id);
    if (!room) return;
    const p = room.players.get(socket.id);
    if (!p) return;
    p.x = x; p.z = z; p.yaw = yaw;
    socket.to(room.id).emit('player:moved', { socketId: socket.id, x, z, yaw });
  });

  socket.on('player:catch', ({ objectId, type, newIq }: { objectId: string; type: 'apple' | 'anvil'; newIq: number }) => {
    const room = findPlayerRoom(socket.id);
    if (!room || room.status !== 'playing') return;
    if (!room.objects.has(objectId)) return; // already caught

    room.objects.delete(objectId);
    const p = room.players.get(socket.id);
    if (!p) return;

    if (type === 'apple') {
      const mult = 1 + p.upgrades.iqMultiplierLevel * 0.5;
      p.iq = Math.round(p.iq + 10 * mult);
    } else {
      // Anvil in multiplayer = lose IQ
      p.iq = Math.max(0, p.iq - 25);
    }

    io.to(room.id).emit('game:objectCaught', { objectId, catcherSocketId: socket.id });
    io.to(room.id).emit('player:score', { socketId: socket.id, iq: p.iq });
  });

  socket.on('player:ready', () => {
    const room = findPlayerRoom(socket.id);
    if (!room || room.status !== 'upgrade') return;
    const p = room.players.get(socket.id);
    if (p) p.isReady = true;

    if ([...room.players.values()].every(pl => pl.isReady)) {
      clearTimeout(room.waveTimer!);
      room.waveTimer = null;
      advanceWave(room, io);
    }
  });

  socket.on('player:upgrade', ({ upgrades }: { upgrades: UpgradeState }) => {
    const room = findPlayerRoom(socket.id);
    if (!room) return;
    const p = room.players.get(socket.id);
    if (p) p.upgrades = upgrades;
  });

  socket.on('disconnect', () => {
    console.log(`[disconnect] ${socket.id}`);
    leaveRoom(socket);
    // Clean up anonymous user
    const userId = socketUserMap.get(socket.id);
    if (userId) {
      const u = users.get(userId);
      if (u?.isAnonymous) users.delete(userId);
      socketUserMap.delete(socket.id);
    }
  });
});

// ── Room helpers ───────────────────────────────────────────────────────────

function findPlayerRoom(socketId: string): Room | undefined {
  return [...rooms.values()].find(r => r.players.has(socketId));
}

function leaveRoom(socket: Socket): void {
  const room = findPlayerRoom(socket.id);
  if (!room) return;
  room.players.delete(socket.id);
  socket.leave(room.id);
  io.to(room.id).emit('room:playerLeft', { socketId: socket.id });

  if (room.players.size === 0) {
    clearRoomTimers(room);
    rooms.delete(room.id);
    return;
  }
  // Transfer host if host left
  if (room.hostSocketId === socket.id) {
    room.hostSocketId = room.players.keys().next().value!;
    io.to(room.id).emit('room:newHost', { socketId: room.hostSocketId });
  }
}

function clearRoomTimers(room: Room): void {
  if (room.waveTimer) clearTimeout(room.waveTimer);
  if (room.spawnTimer) clearInterval(room.spawnTimer);
  room.waveTimer = null;
  room.spawnTimer = null;
}

function roomSnapshot(room: Room) {
  return {
    id: room.id, name: room.name, status: room.status, wave: room.wave,
    hostSocketId: room.hostSocketId,
    players: [...room.players.values()].map(publicPlayer),
  };
}

function publicPlayer(p: RoomPlayer) {
  return { socketId: p.socketId, username: p.username, iq: p.iq, x: p.x, z: p.z, yaw: p.yaw, colorIdx: p.colorIdx };
}

// ── Wave management ────────────────────────────────────────────────────────

function startWave(room: Room, srv: Server): void {
  clearRoomTimers(room);
  room.status = 'playing';
  room.objects.clear();
  [...room.players.values()].forEach(p => { p.isReady = false; });

  srv.to(room.id).emit('game:waveStart', { wave: room.wave });

  const spawnMs = Math.max(MIN_SPAWN_MS, BASE_SPAWN_MS - room.wave * 120);
  room.spawnTimer = setInterval(() => spawnObject(room, srv), spawnMs);

  room.waveTimer = setTimeout(() => endWave(room, srv), WAVE_DURATION_MS);
}

function spawnObject(room: Room, srv: Server): void {
  if (room.status !== 'playing') return;
  const [tx, ty, tz] = BRANCH_TIPS[Math.floor(Math.random() * BRANCH_TIPS.length)];
  const anvilChance = Math.min(0.08 + room.wave * 0.04, 0.32);
  const type: 'apple' | 'anvil' = Math.random() < anvilChance ? 'anvil' : 'apple';
  const obj: GameObject = {
    id: uuid(),
    type,
    x: tx + (Math.random() - 0.5) * 2.5,
    y: ty + 0.5,
    z: tz + (Math.random() - 0.5) * 4.0,
    speed: (3.5 + room.wave * 0.4) + Math.random() * 1.5,
    spawnedAt: Date.now(),
  };
  room.objects.set(obj.id, obj);
  srv.to(room.id).emit('game:spawn', obj);
}

function endWave(room: Room, srv: Server): void {
  clearRoomTimers(room);
  room.status = 'upgrade';
  const scores = [...room.players.values()].map(p => ({ socketId: p.socketId, username: p.username, iq: p.iq }))
    .sort((a, b) => b.iq - a.iq);
  srv.to(room.id).emit('game:waveEnd', { wave: room.wave, scores });

  // Auto-advance after WAVE_DELAY_MS
  room.waveTimer = setTimeout(() => advanceWave(room, srv), WAVE_DELAY_MS);
}

function advanceWave(room: Room, srv: Server): void {
  if (room.wave >= MAX_WAVES) {
    room.status = 'ended';
    clearRoomTimers(room);
    const scores = [...room.players.values()]
      .map(p => ({ socketId: p.socketId, username: p.username, iq: p.iq }))
      .sort((a, b) => b.iq - a.iq);
    srv.to(room.id).emit('game:ended', { scores });
    return;
  }
  room.wave++;
  startWave(room, srv);
}

// ── Start server ───────────────────────────────────────────────────────────

httpServer.listen(PORT, () => console.log(`Newton server on :${PORT}`));

// Clean up idle empty rooms every 10 minutes
setInterval(() => {
  const cutoff = Date.now() - 30 * 60_000;
  for (const [id, room] of rooms) {
    if (room.players.size === 0 || room.createdAt < cutoff) {
      clearRoomTimers(room);
      rooms.delete(id);
    }
  }
}, 600_000);
