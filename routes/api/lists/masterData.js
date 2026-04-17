//line-bot-upload-test\routes\api\lists\masterData.js
const express = require('express');
const router = express.Router();
const sql = require('mssql');

// orderList.jsと同じ設定を使うよ
const miedcConfig = {
    user: process.env.DC_SQL_USER,
    password: process.env.DC_SQL_PASSWORD,
    server: process.env.DC_SQL_SERVER,
    database: process.env.DC_SQL_DATABASE,
    port: Number(process.env.DC_SQL_PORT) || 14333,
    options: {
        encrypt: false,
        trustServerCertificate: true
    }
};

// 接続プール（ここも高速化！）
const poolPromise = new sql.ConnectionPool(miedcConfig)
    .connect()
    .then(pool => {
        console.log('マスター用：DB接続OK！');
        return pool;
    })
    .catch(err => console.error('マスター用：接続失敗', err));

// --- 1. 得意先マスター取得 ---
router.get('/customers', async (req, res) => {
    try {
        const pool = await poolPromise;
        const result = await pool.request().query(`
            SELECT TOP 500 chrTokCD AS code, nvhTokRyk AS name 
            FROM MST0201 
            ORDER BY chrTokCD
        `);
        res.json(result.recordset);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- 2. 商品マスター取得 ---
router.get('/products', async (req, res) => {
    try {
        const pool = await poolPromise;
        const result = await pool.request().query(`
            SELECT TOP 500 chrShnCD AS code, nvhShnNme AS name 
            FROM MST0101 
            ORDER BY chrShnCD
        `);
        res.json(result.recordset);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- 3. 担当者マスター取得 ---
router.get('/staffs', async (req, res) => {
    try {
        const pool = await poolPromise;
        const result = await pool.request().query(`
            SELECT chrTntCD AS code, nvhTntNme AS name 
            FROM MST0401 
            ORDER BY chrTntCD
        `);
        res.json(result.recordset);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
