import express from 'express';
import { db } from './db.js';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

const router = express.Router();
const JWT_SECRET = 'supersecretkey';

// Register
router.post('/register', async (req, res) => {
  try {
    const { username, email, password, profile_image_path } = req.body;
    if (!username || !email || !password) return res.status(400).json({ error: 'Missing fields' });

    const [existing] = await db.execute('SELECT * FROM users WHERE username=? OR email=?', [username, email]);
    if (existing.length) return res.status(400).json({ error: 'Username or email already exists' });

    const hash = await bcrypt.hash(password, 10);
    const [result] = await db.execute(
      'INSERT INTO users (username, email, password_hash, profile_image_path) VALUES (?, ?, ?, ?)',
      [username, email, hash, profile_image_path || null]
    );

    res.json({ message: 'User registered', userId: result.insertId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const [users] = await db.execute('SELECT * FROM users WHERE email=?', [email]);
    if (!users.length) return res.status(401).json({ error: 'Invalid email/password' });

    const user = users[0];
    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) return res.status(401).json({ error: 'Invalid email/password' });

    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role, profile_image_path: user.profile_image_path },
      JWT_SECRET,
      { expiresIn: '1h' }
    );

    res.json({
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        wallet_balance: user.wallet_balance,
        profile_image_path: user.profile_image_path,
        created_at: user.created_at
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});



// ✅ UPDATE USER
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { username, email, password, profile_image_path } = req.body;

    // ตรวจสอบว่าผู้ใช้นี้มีอยู่จริง
    const [user] = await db.execute('SELECT * FROM users WHERE id = ?', [id]);
    if (user.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    // ตรวจสอบว่าชื่อหรืออีเมลซ้ำกับคนอื่นไหม
    const [exists] = await db.execute(
      'SELECT * FROM users WHERE (username = ? OR email = ?) AND id != ?',
      [username, email, id]
    );
    if (exists.length > 0) {
      return res.status(400).json({ error: 'Username or email already exists' });
    }

    // ถ้ามี password ใหม่ → hash ก่อน
    let passwordHash = user[0].password_hash;
    if (password && password.trim() !== '') {
      passwordHash = await bcrypt.hash(password, 10);
    }

    // อัปเดตข้อมูล
    await db.execute(
      `UPDATE users 
       SET username = ?, email = ?, password_hash = ?, profile_image_path = ?
       WHERE id = ?`,
      [username, email, passwordHash, profile_image_path || null, id]
    );

    res.json({ message: 'User updated successfully' });
  } catch (err) {
    console.error('❌ Update user error:', err);
    res.status(500).json({ error: 'Server error', details: err.message });
  }
});









// Get all users with profile image
router.get('/', async (req, res) => {
  try {
    const [users] = await db.execute(
      'SELECT id, username, email, role, wallet_balance, profile_image_path, created_at FROM users'
    );
    res.json(users);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;

