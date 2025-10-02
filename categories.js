import express from 'express';
const router = express.Router();

// ตัวอย่าง endpoint
router.get('/', (req, res) => {
  res.json({ message: 'Get all categories' });
});

export default router;  // <--- ต้องมี export default