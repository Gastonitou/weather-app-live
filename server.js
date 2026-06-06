const express = require('express');
const session = require('express-session');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const API_KEY = 'bd5e378503939ddaee76f12ad7a97608'; // OpenWeatherMap demo key
const DB_PATH = path.join(__dirname, 'data.json');

// ====== DATABASE (JSON File - kein SQLite nötig) ======
function loadDB() {
  try { return JSON.parse(fs.readFileSync(DB_PATH, 'utf8')); }
  catch { return { users: [], favorites: [], sessions: {}, nextUserId: 1 }; }
}

function saveDB(db) {
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}

// Init
if (!fs.existsSync(DB_PATH)) saveDB(loadDB());

// ====== MIDDLEWARE ======
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.use(session({
  secret: 'fullstack-weather-secret-2024',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 7 * 24 * 60 * 60 * 1000 }
}));

function requireAuth(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ error: 'Nicht eingeloggt' });
  next();
}

// ====== AUTH ======
app.post('/api/register', (req, res) => {
  const db = loadDB();
  const { username, email, password } = req.body;

  if (!username || !email || !password || password.length < 6) {
    return res.status(400).json({ error: 'Ungültige Eingabe. Passwort min. 6 Zeichen.' });
  }

  if (db.users.find(u => u.username === username || u.email === email)) {
    return res.status(409).json({ error: 'Benutzername oder Email existiert bereits' });
  }

  // Simple password hashing (kein bcrypt nötig - spart Speicher)
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');

  const user = {
    id: db.nextUserId++,
    username,
    email,
    password: salt + ':' + hash,
    created_at: new Date().toISOString()
  };

  db.users.push(user);
  saveDB(db);

  req.session.userId = user.id;
  req.session.username = user.username;
  res.json({ success: true, user: { id: user.id, username, email } });
});

app.post('/api/login', (req, res) => {
  const db = loadDB();
  const { username, password } = req.body;

  const user = db.users.find(u => u.username === username);
  if (!user) return res.status(401).json({ error: 'Falscher Benutzername oder Passwort' });

  const [salt, hash] = user.password.split(':');
  const check = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');

  if (hash !== check) return res.status(401).json({ error: 'Falscher Benutzername oder Passwort' });

  req.session.userId = user.id;
  req.session.username = user.username;
  res.json({ success: true, user: { id: user.id, username, email: user.email } });
});

app.post('/api/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

app.get('/api/me', (req, res) => {
  if (req.session.userId) {
    res.json({ loggedIn: true, user: { id: req.session.userId, username: req.session.username } });
  } else {
    res.json({ loggedIn: false });
  }
});

// ====== WEATHER ======
app.get('/api/weather/:city', async (req, res) => {
  try {
    const city = req.params.city;

    const weatherRes = await fetch(
      `https://api.openweathermap.org/data/2.5/weather?q=${city}&units=metric&lang=de&appid=${API_KEY}`
    );

    if (!weatherRes.ok) {
      if (weatherRes.status === 404) return res.status(404).json({ error: 'Stadt nicht gefunden 🌍' });
      return res.status(502).json({ error: 'Wetter-API Fehler' });
    }

    const weather = await weatherRes.json();

    // 5-day forecast (every 3h)
    let forecast = [];
    try {
      const fcRes = await fetch(
        `https://api.openweathermap.org/data/2.5/forecast?q=${city}&units=metric&lang=de&appid=${API_KEY}`
      );
      if (fcRes.ok) {
        const fcData = await fcRes.json();
        forecast = fcData.list.filter((_, i) => i % 8 === 0).slice(0, 4).map(d => ({
          date: d.dt_txt.split(' ')[0],
          temp: Math.round(d.main.temp),
          condition_id: d.weather[0].id
        }));
      }
    } catch {}

    const result = {
      city: weather.name,
      country: weather.sys.country,
      temp: Math.round(weather.main.temp),
      feels_like: Math.round(weather.main.feels_like),
      humidity: weather.main.humidity,
      pressure: weather.main.pressure,
      wind: Math.round(weather.wind.speed * 3.6),
      description: weather.weather[0].description,
      condition_id: weather.weather[0].id,
      sunrise: weather.sys.sunrise,
      sunset: weather.sys.sunset,
      forecast
    };

    res.json(result);
  } catch (err) {
    console.error('Weather error:', err.message);
    res.status(500).json({ error: 'Server-Fehler' });
  }
});

// ====== FAVORITES ======
app.get('/api/favorites', requireAuth, (req, res) => {
  const db = loadDB();
  const favs = db.favorites.filter(f => f.userId === req.session.userId);
  res.json(favs.map(f => ({ city: f.city, country: f.country })));
});

app.post('/api/favorites', requireAuth, (req, res) => {
  const db = loadDB();
  const { city, country } = req.body;

  if (!db.favorites.find(f => f.userId === req.session.userId && f.city === city)) {
    db.favorites.push({ userId: req.session.userId, city, country: country || '' });
    saveDB(db);
  }
  res.json({ success: true });
});

app.delete('/api/favorites/:city', requireAuth, (req, res) => {
  const db = loadDB();
  db.favorites = db.favorites.filter(f => !(f.userId === req.session.userId && f.city === req.params.city));
  saveDB(db);
  res.json({ success: true });
});

// ====== START ======
app.listen(PORT, () => {
  console.log(`✅ Fullstack Weather läuft auf http://localhost:${PORT}`);
  console.log(`📁 Daten: ${DB_PATH}`);
});
