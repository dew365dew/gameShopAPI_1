import express from 'express';
import cors from 'cors';
import userRoutes from './users.js';
import categoryRoutes from './categories.js';
import gameRoutes from './games.js';
import purchaseRoutes from './purchases.js';
import cartRoutes from "./cart.js";
import discounts from './discounts.js'; // ✅ import route ใหม่

const app = express();

// Enable CORS สำหรับทุก origin (dev)
app.use(cors());

// หรือจำกัดเฉพาะ localhost:4200
// app.use(cors({ origin: 'http://localhost:4200' }));

app.use(express.json());

app.get('/', (req, res) => {
  res.send('Hello GameShop');
});

app.use('/users', userRoutes);
app.use('/categories', categoryRoutes);
app.use('/games', gameRoutes);
app.use('/purchases', purchaseRoutes);
app.use("/cart", cartRoutes);
// ✅ ใช้งาน route
app.use('/api/discounts', discounts);

app.listen(3000, () => console.log('Server running on port 3000'));



