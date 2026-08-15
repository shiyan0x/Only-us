import initSqlJs from 'sql.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Database file path — auto-created on first run
const dbPath = path.join(__dirname, 'onlyus.db');

let db;

// ──────────────────────────────────────────────
//  Initialize Database
// ──────────────────────────────────────────────
async function initDb() {
  const SQL = await initSqlJs();

  // Load existing database file if it exists, otherwise create new
  if (fs.existsSync(dbPath)) {
    const buffer = fs.readFileSync(dbPath);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }

  // Create tables
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL COLLATE NOCASE,
      displayName TEXT NOT NULL,
      passwordHash TEXT NOT NULL,
      avatarColor TEXT NOT NULL DEFAULT '#8b5cf6',
      avatarImage TEXT DEFAULT '',
      bio TEXT DEFAULT '',
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      lastSeen DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Migrate column for existing database if needed
  try {
    db.run(`ALTER TABLE users ADD COLUMN avatarImage TEXT DEFAULT ''`);
  } catch (e) {
    // Column already exists
  }

  db.run(`
    CREATE TABLE IF NOT EXISTS friend_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fromUserId INTEGER NOT NULL,
      toUserId INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'accepted', 'rejected')),
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (fromUserId) REFERENCES users(id),
      FOREIGN KEY (toUserId) REFERENCES users(id),
      UNIQUE(fromUserId, toUserId)
    );
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      senderId INTEGER NOT NULL,
      receiverId INTEGER NOT NULL,
      content TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'text' CHECK(type IN ('text', 'image', 'system')),
      read INTEGER NOT NULL DEFAULT 0,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (senderId) REFERENCES users(id),
      FOREIGN KEY (receiverId) REFERENCES users(id)
    );
  `);

  // Create indexes (ignore if already exist)
  try { db.run('CREATE INDEX IF NOT EXISTS idx_messages_sender_receiver ON messages(senderId, receiverId)'); } catch(e) {}
  try { db.run('CREATE INDEX IF NOT EXISTS idx_messages_created ON messages(createdAt)'); } catch(e) {}
  try { db.run('CREATE INDEX IF NOT EXISTS idx_friend_requests_to ON friend_requests(toUserId, status)'); } catch(e) {}
  try { db.run('CREATE INDEX IF NOT EXISTS idx_friend_requests_from ON friend_requests(fromUserId, status)'); } catch(e) {}
  try { db.run('CREATE INDEX IF NOT EXISTS idx_users_username ON users(username)'); } catch(e) {}

  console.log('✅ Database initialized at:', dbPath);
  saveDb(); // Save initial state
  return db;
}

// ──────────────────────────────────────────────
//  Persist to disk
// ──────────────────────────────────────────────
function saveDb() {
  if (!db) return;
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(dbPath, buffer);
}

// Auto-save every 5 seconds
setInterval(saveDb, 5000);

// Save on process exit
process.on('exit', saveDb);
process.on('SIGINT', () => { saveDb(); process.exit(); });
process.on('SIGTERM', () => { saveDb(); process.exit(); });

// ──────────────────────────────────────────────
//  Helper: wraps sql.js to match better-sqlite3 API
//  so the rest of the server code stays clean
// ──────────────────────────────────────────────
class DbWrapper {
  prepare(sql) {
    return new PreparedStatement(sql);
  }

  run(sql, ...params) {
    db.run(sql, params);
    saveDb();
  }
}

class PreparedStatement {
  constructor(sql) {
    this.sql = sql;
  }

  // Get one row
  get(...params) {
    try {
      const stmt = db.prepare(this.sql);
      stmt.bind(params);
      if (stmt.step()) {
        const cols = stmt.getColumnNames();
        const vals = stmt.get();
        stmt.free();
        const row = {};
        cols.forEach((col, i) => { row[col] = vals[i]; });
        return row;
      }
      stmt.free();
      return undefined;
    } catch (e) {
      console.error('DB get error:', e.message, this.sql, params);
      return undefined;
    }
  }

  // Get all rows
  all(...params) {
    try {
      const stmt = db.prepare(this.sql);
      stmt.bind(params);
      const rows = [];
      while (stmt.step()) {
        const cols = stmt.getColumnNames();
        const vals = stmt.get();
        const row = {};
        cols.forEach((col, i) => { row[col] = vals[i]; });
        rows.push(row);
      }
      stmt.free();
      return rows;
    } catch (e) {
      console.error('DB all error:', e.message, this.sql, params);
      return [];
    }
  }

  // Run (insert/update/delete)
  run(...params) {
    try {
      db.run(this.sql, params);
      saveDb();
      // Return lastInsertRowid for inserts
      const result = db.exec('SELECT last_insert_rowid() as id');
      const lastId = result.length > 0 ? result[0].values[0][0] : 0;
      return { lastInsertRowid: lastId, changes: db.getRowsModified() };
    } catch (e) {
      console.error('DB run error:', e.message, this.sql, params);
      throw e;
    }
  }
}

const dbWrapper = new DbWrapper();

export { initDb, saveDb };
export default dbWrapper;
