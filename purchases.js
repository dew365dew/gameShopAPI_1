import express from "express";
import { db } from "./db.js";

const router = express.Router();

/**
 * 🛒 สร้างการซื้อเกม (Checkout)
 * Body:
 * {
 *   "user_id": 1,
 *   "game_ids": [2, 3, 5],
 *   "discount_code": "SALE10"   // หรือ null ได้
 * }
 */
router.post("/", async (req, res) => {
  const connection = await db.getConnection();
  try {
    const { user_id, game_ids, discount_code } = req.body;
    if (!user_id || !Array.isArray(game_ids) || game_ids.length === 0) {
      connection.release();
      return res.status(400).json({ error: "Missing required fields" });
    }

    // ✅ ตรวจสอบ user
    const [userRows] = await connection.execute("SELECT * FROM users WHERE id=?", [user_id]);
    if (userRows.length === 0) {
      connection.release();
      return res.status(404).json({ error: "User not found" });
    }
    const user = userRows[0];

    // ✅ ตรวจสอบเกมทั้งหมด
    const [games] = await connection.query(
      `SELECT id, title, price FROM games WHERE id IN (${game_ids.map(() => "?").join(",")})`,
      game_ids
    );
    if (games.length !== game_ids.length) {
      connection.release();
      return res.status(400).json({ error: "Some games not found" });
    }

    // ✅ ตรวจสอบเกมที่มีอยู่แล้ว
    const [owned] = await connection.query(
      `SELECT game_id FROM user_library WHERE user_id=? AND game_id IN (${game_ids.map(() => "?").join(",")})`,
      [user_id, ...game_ids]
    );
    if (owned.length > 0) {
      const ownedIds = owned.map(o => o.game_id);
      connection.release();
      return res.status(400).json({ error: "Some games already owned", ownedIds });
    }

    // ✅ คำนวณราคา
    let subtotal = games.reduce((sum, g) => sum + parseFloat(g.price), 0);
    let discountAmount = 0;
    let discountId = null;

    // ✅ ตรวจสอบโค้ดส่วนลด
    if (discount_code) {
      const [discountRows] = await connection.execute(
        "SELECT * FROM discount_codes WHERE code=?",
        [discount_code]
      );
      if (discountRows.length === 0) {
        connection.release();
        return res.status(400).json({ error: "Invalid discount code" });
      }

      const discount = discountRows[0];
      const now = new Date();

      if (discount.expires_at && new Date(discount.expires_at) < now) {
        connection.release();
        return res.status(400).json({ error: "Discount code expired" });
      }

      if (discount.max_uses && discount.uses_count >= discount.max_uses) {
        connection.release();
        return res.status(400).json({ error: "Discount code limit reached" });
      }

      if (discount.single_use_per_account) {
        const [used] = await connection.execute(
          "SELECT * FROM discount_uses WHERE discount_id=? AND user_id=?",
          [discount.id, user_id]
        );
        if (used.length > 0) {
          connection.release();
          return res.status(400).json({ error: "This user already used this code" });
        }
      }

      // ✅ คำนวณส่วนลด
      if (discount.discount_type === "percent") {
        discountAmount = (subtotal * discount.discount_value) / 100;
      } else if (discount.discount_type === "fixed") {
        discountAmount = discount.discount_value;
      } else if (discount.discount_type === "free") {
        discountAmount = subtotal;
      }

      if (discountAmount > subtotal) discountAmount = subtotal;
      discountId = discount.id;
    }

    const total = subtotal - discountAmount;

    // ✅ ตรวจสอบยอดเงินใน wallet
    if (user.wallet_balance < total) {
      connection.release();
      return res.status(400).json({ error: "Insufficient wallet balance" });
    }

    // ✅ เริ่ม transaction
    await connection.beginTransaction();

    // ✅ สร้าง purchase หลัก
    const [purchaseResult] = await connection.execute(
      "INSERT INTO purchases (user_id, total_amount, discount_code) VALUES (?, ?, ?)",
      [user_id, total, discount_code || null]
    );
    const purchaseId = purchaseResult.insertId;

    // ✅ สร้าง purchase_items + user_library
    for (const g of games) {
      await connection.execute(
        "INSERT INTO purchase_items (purchase_id, game_id, price_at_purchase) VALUES (?, ?, ?)",
        [purchaseId, g.id, g.price]
      );
      await connection.execute(
        "INSERT INTO user_library (user_id, game_id) VALUES (?, ?)",
        [user_id, g.id]
      );
    }

    // ✅ หัก wallet และเพิ่ม transaction
    await connection.execute(
      `INSERT INTO wallet_transactions (user_id, amount, txn_type, detail, related_purchase_id)
       VALUES (?, ?, 'purchase', 'Purchase games', ?)`,
      [user_id, -total, purchaseId]
    );

    await connection.execute(
      "UPDATE users SET wallet_balance = wallet_balance - ? WHERE id = ?",
      [total, user_id]
    );

    // ✅ บันทึกส่วนลด (ถ้ามี)
    if (discountId) {
      await connection.execute(
        "INSERT INTO discount_uses (discount_id, user_id) VALUES (?, ?)",
        [discountId, user_id]
      );
      await connection.execute(
        "UPDATE discount_codes SET uses_count = uses_count + 1 WHERE id=?",
        [discountId]
      );
    }

    // ✅ อัปเดตยอดขายรายวันใน game_rankings
    for (const g of games) {
      await connection.execute(`
        INSERT INTO game_rankings (game_id, ranking_date, rank_position, sales_count)
        VALUES (?, CURDATE(), 0, 1)
        ON DUPLICATE KEY UPDATE sales_count = sales_count + 1
      `, [g.id]);
    }

    // ✅ ปิด transaction
    await connection.commit();

    res.json({
      message: "Purchase successful",
      purchase_id: purchaseId,
      subtotal,
      discount: discountAmount,
      total_paid: total,
    });
  } catch (err) {
    console.error("❌ Purchase error:", err);
    try {
      await connection.rollback();
    } catch {}
    res.status(500).json({ error: "Server error", details: err.message });
  } finally {
    connection.release();
  }
});

export default router;
