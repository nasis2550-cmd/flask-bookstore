const express = require('express');
const session = require('express-session');
const bcrypt = require('bcrypt');
const { pool } = require('./db');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('.'));

app.use(
  session({
    secret: process.env.SESSION_SECRET || 'dev_secret',
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly: true, maxAge: 7 * 24 * 60 * 60 * 1000 }
  })
);

function requireAuth(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: 'Not authenticated' });
  next();
}

// Register
app.post('/api/register', async (req, res) => {
  const { username, email, password } = req.body;
  if (!username || !email || !password) return res.status(400).json({ error: 'Missing fields' });
  try {
    const hash = await bcrypt.hash(password, 12);
    const sql = 'INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)';
    await pool.execute(sql, [username, email, hash]);
    res.json({ message: 'Registered successfully' });
  } catch (err) {
    if (err && err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Username or email already exists' });
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Login
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Missing fields' });
  try {
    const [rows] = await pool.execute('SELECT id, username, password_hash FROM users WHERE username = ?', [username]);
    if (!rows.length) return res.status(401).json({ error: 'Invalid credentials' });
    const user = rows[0];
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: 'Invalid credentials' });
    req.session.user = { id: user.id, username: user.username };
    res.json({ message: 'Logged in', user: req.session.user });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Logout
app.post('/api/logout', (req, res) => {
  req.session.destroy(() => {
    res.json({ message: 'Logged out' });
  });
});

// Create comment
app.post('/api/comments', requireAuth, async (req, res) => {
  const { content } = req.body;
  if (!content || !content.trim()) return res.status(400).json({ error: 'Content required' });
  try {
    const sql = 'INSERT INTO comments (user_id, content) VALUES (?, ?)';
    const [result] = await pool.execute(sql, [req.session.user.id, content]);
    res.json({ id: result.insertId, content, user_id: req.session.user.id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Edit comment
app.put('/api/comments/:id', requireAuth, async (req, res) => {
  const { id } = req.params;
  const { content } = req.body;
  if (!content || !content.trim()) return res.status(400).json({ error: 'Content required' });
  try {
    const [rows] = await pool.execute('SELECT id, user_id FROM comments WHERE id = ?', [id]);
    if (!rows.length) return res.status(404).json({ error: 'Comment not found' });
    const comment = rows[0];
    if (comment.user_id !== req.session.user.id) return res.status(403).json({ error: 'Forbidden' });
    await pool.execute('UPDATE comments SET content = ? WHERE id = ?', [content, id]);
    res.json({ message: 'Updated' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Delete comment
app.delete('/api/comments/:id', requireAuth, async (req, res) => {
  const { id } = req.params;
  try {
    const [rows] = await pool.execute('SELECT id, user_id FROM comments WHERE id = ?', [id]);
    if (!rows.length) return res.status(404).json({ error: 'Comment not found' });
    const comment = rows[0];
    if (comment.user_id !== req.session.user.id) return res.status(403).json({ error: 'Forbidden' });
    await pool.execute('DELETE FROM comments WHERE id = ?', [id]);
    res.json({ message: 'Deleted' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// List comments (optional)
app.get('/api/comments', async (req, res) => {
  try {
    const [rows] = await pool.execute(
      'SELECT c.id, c.content, c.created_at, c.updated_at, u.username FROM comments c JOIN users u ON c.user_id = u.id ORDER BY c.created_at DESC'
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});