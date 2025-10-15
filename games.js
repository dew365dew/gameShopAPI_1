import express from 'express';
import { db } from './db.js';

const router = express.Router();

/**
 * ✅ เพิ่มข้อมูลเกมใหม่
 * release_date ตั้งอัตโนมัติ (CURRENT_DATE)
 */
router.post('/', async (req, res) => {
  try {
    const { title, price, category_id, image_path, description } = req.body;

    if (!title || !price || !category_id || !image_path) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // ตรวจสอบว่า category_id มีจริงไหม
    const [category] = await db.execute('SELECT * FROM categories WHERE id = ?', [category_id]);
    if (category.length === 0) {
      return res.status(400).json({ error: 'Invalid category_id' });
    }

    const [result] = await db.execute(
      `INSERT INTO games (title, price, category_id, image_path, description)
       VALUES (?, ?, ?, ?, ?)`,
      [title, price, category_id, image_path, description || null]
    );

    res.json({ message: 'Game added successfully', gameId: result.insertId });
  } catch (err) {
    console.error('❌ Add game error:', err);
    res.status(500).json({ error: 'Server error', details: err.message });
  }
});

/**
 * ✅ แก้ไขข้อมูลเกม (ยกเว้น category_id)
 */
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { title, price, image_path, description } = req.body;

    const [existing] = await db.execute('SELECT * FROM games WHERE id = ?', [id]);
    if (existing.length === 0) {
      return res.status(404).json({ error: 'Game not found' });
    }

    await db.execute(
      `UPDATE games
       SET title = ?, price = ?, image_path = ?, description = ?
       WHERE id = ?`,
      [title || existing[0].title, price || existing[0].price, image_path || existing[0].image_path, description || existing[0].description, id]
    );

    res.json({ message: 'Game updated successfully' });
  } catch (err) {
    console.error('❌ Update game error:', err);
    res.status(500).json({ error: 'Server error', details: err.message });
  }
});

/**
 * ✅ แสดงเกมทั้งหมด (พร้อมชื่อหมวดหมู่)
 */
router.get('/', async (req, res) => {
  try {
    const [games] = await db.execute(`
      SELECT g.*, c.name AS category_name
      FROM games g
      JOIN categories c ON g.category_id = c.id
      ORDER BY g.created_at DESC
    `);
    res.json(games);
  } catch (err) {
    console.error('❌ Get all games error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * ✅ ค้นหาเกมตามชื่อ (LIKE)
 * ตัวอย่าง: GET /games/search?title=Zelda
 */
router.get('/search', async (req, res) => {
  try {
    const { title } = req.query;
    if (!title) return res.status(400).json({ error: 'Missing title query' });

    const [games] = await db.execute(`
      SELECT g.*, c.name AS category_name
      FROM games g
      JOIN categories c ON g.category_id = c.id
      WHERE g.title LIKE ?
    `, [`%${title}%`]);

    res.json(games);
  } catch (err) {
    console.error('❌ Search game error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * ✅ ค้นหาเกมตามหมวดหมู่
 * ตัวอย่าง: GET /games/category/3
 */
router.get('/category/:category_id', async (req, res) => {
  try {
    const { category_id } = req.params;
    const [games] = await db.execute(`
      SELECT g.*, c.name AS category_name
      FROM games g
      JOIN categories c ON g.category_id = c.id
      WHERE g.category_id = ?
    `, [category_id]);

    res.json(games);
  } catch (err) {
    console.error('❌ Get games by category error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * ✅ ลบเกมตาม id
 * ตัวอย่าง: DELETE /games/10
 */
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const [result] = await db.execute('DELETE FROM games WHERE id = ?', [id]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Game not found' });
    }
    res.json({ message: 'Game deleted successfully' });
  } catch (err) {
    console.error('❌ Delete game error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});


/**
 * ✅ การจัดอันดับเกมขายดี (Top 5 จากยอดขายจริง)
 * ตัวอย่าง: GET /games/top-sellers
 */
router.get('/top-sellers', async (req, res) => {
  try {
    // ดึงยอดขายรวมของแต่ละเกม จาก purchase_items
    const [topGames] = await db.execute(`
      SELECT 
        g.id AS game_id,
        g.title,
        g.image_path,
        g.price,
        c.name AS category_name,
        COUNT(pi.id) AS total_sales,
        SUM(pi.price_at_purchase) AS total_revenue
      FROM purchase_items pi
      INNER JOIN games g ON pi.game_id = g.id
      INNER JOIN categories c ON g.category_id = c.id
      GROUP BY g.id, g.title, g.image_path, g.price, c.name
      ORDER BY total_sales DESC, total_revenue DESC
      LIMIT 5
    `);

    // ถ้าไม่มีข้อมูลยอดขายเลย
    if (topGames.length === 0) {
      return res.status(200).json({ message: 'ยังไม่มีข้อมูลยอดขายเกม' });
    }

    res.json({
      ranking_date: new Date().toISOString().split('T')[0],
      top_count: topGames.length,
      top_games: topGames.map((g, i) => ({
        rank: i + 1,
        game_id: g.game_id,
        title: g.title,
        category: g.category_name,
        price: g.price,
        total_sales: g.total_sales,
        total_revenue: g.total_revenue,
        image_path: g.image_path
      }))
    });
  } catch (err) {
    console.error('❌ Get top-sellers error:', err);
    res.status(500).json({ error: 'Server error', details: err.message });
  }
});


export default router;

