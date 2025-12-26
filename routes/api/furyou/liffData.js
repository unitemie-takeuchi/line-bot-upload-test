// C:\Line-Bot-Upload\line-bot-upload-test\routes\api\furyou\liffData.js
const express = require('express');
const router = express.Router();
const sql = require('mssql');
const dbConfig = require('../../../config/dbConfig');

// 1. レポート情報の一時保存 (POST)
router.post('/save-report', async (req, res) => {
    try {
        const { userId, reportId, ownerCd, ownerName, pdfFileName } = req.body;
        if (!userId) return res.status(400).send('userId is required');

        let pool = await sql.connect(dbConfig);
        await pool.request()
            .input('userId', sql.NVarChar, userId)
            .input('reportId', sql.Int, reportId)
            .input('ownerCd', sql.NVarChar, ownerCd)
            .input('ownerName', sql.NVarChar, ownerName)
            .input('pdfFileName', sql.NVarChar, pdfFileName)
            .query(`
                MERGE INTO TempLiffData AS target
                USING (SELECT @userId AS UserId) AS source
                ON (target.UserId = source.UserId)
                WHEN MATCHED THEN
                    UPDATE SET ReportId = @reportId, OwnerCd = @ownerCd, 
                               OwnerName = @ownerName, PdfFileName = @pdfFileName, UpdatedAt = GETDATE()
                WHEN NOT MATCHED THEN
                    INSERT (UserId, ReportId, OwnerCd, OwnerName, PdfFileName)
                    VALUES (@userId, @reportId, @ownerCd, @ownerName, @pdfFileName);
            `);
        res.json({ status: 'success' });
    } catch (err) {
        console.error('[ERROR] /api/save-report:', err);
        res.status(500).send('Server Error');
    }
});

// 2. レポート情報の取得 (GET)
router.get('/get-report', async (req, res) => {
    try {
        const userId = req.query.userId;
        if (!userId) return res.status(400).send('userId is required');

        let pool = await sql.connect(dbConfig);
        let result = await pool.request()
            .input('userId', sql.NVarChar, userId)
            .query('SELECT * FROM TempLiffData WHERE UserId = @userId');

        if (result.recordset.length > 0) {
            res.json(result.recordset[0]);
        } else {
            res.status(404).send('Data not found');
        }
    } catch (err) {
        console.error('[ERROR] /api/get-report:', err);
        res.status(500).send('Server Error');
    }
});

// 3. レポートIDを指定して詳細情報を取得 (GET)
router.get('/get-report-detail', async (req, res) => {
    try {
        const reportId = req.query.reportId;
        if (!reportId) return res.status(400).send('reportId is required');

        let pool = await sql.connect(dbConfig);
        let result = await pool.request()
            .input('reportId', sql.Int, reportId)
            .query('SELECT * FROM dbo.T_MV不良報告書 WHERE id = @reportId');

        if (result.recordset.length > 0) {
            const data = result.recordset[0];
            const fileName = data.pdf_file_name || "";
            const nameParts = fileName.split('_');
            let rawName = nameParts.length > 2 ? nameParts[2] : "（名前なし）";
            const finalName = rawName.replace(/\.pdf$/i, "");

            res.json({
                ReportId: data.id,
                OwnerCd: data.owner_cd,
                OwnerName: finalName,
                PdfFileName: data.pdf_file_name
            });
        } else {
            res.status(404).send('Report not found');
        }
    } catch (err) {
        console.error('[ERROR] /api/get-report-detail:', err);
        res.status(500).send('Server Error');
    }
});

module.exports = router;