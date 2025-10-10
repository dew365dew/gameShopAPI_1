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





// ✅ เติมเงินเข้ากระเป๋า (เวอร์ชันแก้ถูกต้อง)
router.post('/:id/topup', async (req, res) => {
  const connection = await db.getConnection(); // ดึง connection จาก pool
  try {
    const { id } = req.params;
    const { amount } = req.body;

    if (!amount || amount <= 0) {
      connection.release();
      return res.status(400).json({ error: 'Invalid amount' });
    }

    // ตรวจสอบ user
    const [user] = await connection.execute('SELECT * FROM users WHERE id = ?', [id]);
    if (!user.length) {
      connection.release();
      return res.status(404).json({ error: 'User not found' });
    }

    // ✅ เริ่ม transaction
    await connection.beginTransaction();

    // เพิ่มรายการ top-up
    await connection.execute(
      `INSERT INTO wallet_transactions (user_id, amount, txn_type, detail)
       VALUES (?, ?, 'topup', 'Top-up wallet')`,
      [id, amount]
    );

    // อัปเดตยอดเงิน
    await connection.execute(
      `UPDATE users SET wallet_balance = wallet_balance + ? WHERE id = ?`,
      [amount, id]
    );

    // ✅ commit
    await connection.commit();

    res.json({ message: 'Top-up successful', amount_added: amount });
  } catch (err) {
    console.error('❌ Top-up error:', err.message);

    try {
      await connection.rollback(); // rollback ถ้ามี error
    } catch (rollbackErr) {
      console.error('Rollback failed:', rollbackErr.message);
    }

    res.status(500).json({ error: 'Server error', details: err.message });
  } finally {
    connection.release(); // ✅ ปล่อย connection คืน pool ทุกครั้ง
  }
});



// ✅ ประวัติการซื้อเกม + เติมเงิน
router.get('/:id/history', async (req, res) => {
  try {
    const { id } = req.params;

    // ตรวจสอบ user
    const [user] = await db.execute('SELECT * FROM users WHERE id = ?', [id]);
    if (!user.length) return res.status(404).json({ error: 'User not found' });

    // ดึงข้อมูลเกมที่ซื้อ
    const [purchases] = await db.execute(
      `SELECT g.title, pi.price_at_purchase AS price, p.created_at AS purchased_at
       FROM purchases p
       JOIN purchase_items pi ON p.id = pi.purchase_id
       JOIN games g ON pi.game_id = g.id
       WHERE p.user_id = ?
       ORDER BY p.created_at DESC`,
      [id]
    );

    // ดึงข้อมูลการเติมเงิน
    const [topups] = await db.execute(
      `SELECT amount, created_at FROM wallet_transactions
       WHERE user_id = ? AND txn_type = 'topup'
       ORDER BY created_at DESC`,
      [id]
    );

    res.json({
      user: user[0].username,
      purchases,
      topups
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});


// ✅ แสดงธุรกรรมทั้งหมดของผู้ใช้ทุกคน (Admin only)
router.get('/transactions/all', async (req, res) => {
  try {
    const [transactions] = await db.execute(`
      SELECT 
        u.username,
        wt.txn_type,
        wt.amount,
        wt.detail,
        wt.created_at
      FROM wallet_transactions wt
      JOIN users u ON wt.user_id = u.id
      ORDER BY wt.created_at DESC
    `);

    res.json(transactions);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});



export default router;





