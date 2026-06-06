const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'weather.db'));

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Users table
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

// Favorite cities table
db.exec(`
  CREATE TABLE IF NOT EXISTS favorites (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    city TEXT NOT NULL,
    country TEXT DEFAULT '',
    lat REAL,
    lon REAL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(user_id, city)
  )
`);

// Weather cache table (optional, to reduce API calls)
db.exec(`
  CREATE TABLE IF NOT EXISTS weather_cache (
    city TEXT PRIMARY KEY,
    data TEXT NOT NULL,
    expires_at INTEGER NOT NULL
  )
`);

module.exports = db;
