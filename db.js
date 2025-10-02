import mysql from 'mysql2/promise';

export const db = mysql.createPool({
  host: '192.250.235.90', // ← ใช้ host จาก cPanel
  user: 'gamesgho_user',               // user ที่สร้างใน cPanel
  password: 'Ujee17122543',
  database: 'gamesgho_db65011212231',
  port: 3306
});  
