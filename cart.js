import express from "express";
import { db } from "./db.js";

const router = express.Router();

// 🧺 ดึงรายการในตะกร้า
router.get("/:user_id", async (req, res) => {
  try {
    const { user_id } = req.params;
    const [rows] = await db.query(
      `SELECT c.game_id, g.title, g.price, g.image_path
       FROM cart_items c
       JOIN games g ON c.game_id = g.id
       WHERE c.user_id = ?`,
      [user_id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ➕ เพิ่มเกมเข้าตะกร้า
router.post("/", async (req, res) => {
  try {
    const { user_id, game_id } = req.body;
    if (!user_id || !game_id)
      return res.status(400).json({ error: "Missing required fields" });

    await db.execute(
      "INSERT IGNORE INTO cart_items (user_id, game_id) VALUES (?, ?)",
      [user_id, game_id]
    );

    res.json({ message: "Added to cart" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// 🗑️ ล้างตะกร้าหลังสั่งซื้อสำเร็จ
router.delete("/clear/:user_id", async (req, res) => {
  try {
    const { user_id } = req.params;
    await db.execute("DELETE FROM cart_items WHERE user_id = ?", [user_id]);
    res.json({ message: "Cart cleared" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ❌ ลบเกมออกจากตะกร้า
router.delete("/:user_id/:game_id", async (req, res) => {
  try {
    const { user_id, game_id } = req.params;
    await db.execute(
      "DELETE FROM cart_items WHERE user_id = ? AND game_id = ?",
      [user_id, game_id]
    );
    res.json({ message: "Removed from cart" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});



export default router;
