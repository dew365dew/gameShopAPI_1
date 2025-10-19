import express from 'express';
import { db } from './db.js';

const router = express.Router();


// 🟢 1. แสดงโค้ดส่วนลดทั้งหมด (Admin)
router.get('/', async (req, res) => {
  try {
    const [rows] = await db.execute(`
      SELECT 
        id, code, description, discount_type, discount_value,
        max_uses, uses_count, single_use_per_account,
        expires_at, created_at
      FROM discount_codes
      ORDER BY created_at DESC
    `);
    res.json(rows);
  } catch (err) {
    console.error('❌ Get discounts error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});


// 🟢 2. เพิ่มโค้ดส่วนลดใหม่ (Admin)
router.post('/', async (req, res) => {
  try {
    const { 
      code, description, discount_type, discount_value,
      max_uses, single_use_per_account, expires_at 
    } = req.body;

    if (!code || !discount_type || !discount_value) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const [exists] = await db.execute('SELECT * FROM discount_codes WHERE code = ?', [code]);
    if (exists.length) {
      return res.status(400).json({ error: 'Discount code already exists' });
    }

    await db.execute(
      `INSERT INTO discount_codes 
        (code, description, discount_type, discount_value, max_uses, single_use_per_account, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [code, description || null, discount_type, discount_value, max_uses || null, single_use_per_account ?? true, expires_at || null]
    );

    res.json({ message: 'Discount code created successfully' });
  } catch (err) {
    console.error('❌ Create discount error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});


// 🟡 3. แก้ไขโค้ดส่วนลด (Admin)
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { 
      code, description, discount_type, discount_value,
      max_uses, single_use_per_account, expires_at 
    } = req.body;

    const [existing] = await db.execute('SELECT * FROM discount_codes WHERE id = ?', [id]);
    if (!existing.length) {
      return res.status(404).json({ error: 'Discount not found' });
    }

    await db.execute(
      `UPDATE discount_codes 
       SET code=?, description=?, discount_type=?, discount_value=?, 
           max_uses=?, single_use_per_account=?, expires_at=?
       WHERE id=?`,
      [code, description, discount_type, discount_value, max_uses, single_use_per_account, expires_at, id]
    );

    res.json({ message: 'Discount updated successfully' });
  } catch (err) {
    console.error('❌ Update discount error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});


// 🔴 4. ลบโค้ดส่วนลด (Admin)
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const [existing] = await db.execute('SELECT * FROM discount_codes WHERE id = ?', [id]);
    if (!existing.length) {
      return res.status(404).json({ error: 'Discount not found' });
    }

    await db.execute('DELETE FROM discount_codes WHERE id = ?', [id]);

    res.json({ message: 'Discount deleted successfully' });
  } catch (err) {
    console.error('❌ Delete discount error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
