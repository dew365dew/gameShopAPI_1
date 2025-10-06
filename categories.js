import express from 'express';
import { db } from './db.js'; // ✅ นำเข้าเชื่อมต่อฐานข้อมูล

const router = express.Router();

/**
 * ✅ แสดงหมวดหมู่เกมทั้งหมด
 * ตัวอย่าง: GET /categories
 */
router.get('/', async (req, res) => {
  try {
    const [categories] = await db.execute('SELECT * FROM categories ORDER BY id ASC');
    res.json(categories);
  } catch (err) {
    console.error('❌ Get categories error:', err);
    res.status(500).json({ error: 'Server error', details: err.message });
  }
});

export default router;
