//C:\Line-Bot-Upload\line-bot-upload-test\routes\api\furyou\list.js

const express = require('express');
const router = express.Router();
const db = require("../../../utils/sqlClient");

router.get('/', async (req, res) => {
    const cd = req.query.cd;

    if (!cd) {
        return res.status(400).json({ error: "cd is required" });
    }

    try {
        const result = await db.query(`
            SELECT 
                [id]
                , [pdf_file_name] 
                , [import_dt] 
                , [owner_cd] 
                , [status]
                , [approval_dt] 
                , [reject_reason]
                , [line_id]
                , [processed_dt]
            FROM T_MV不良報告書
            WHERE owner_cd = @cd
              AND CONVERT(date, import_dt) = CONVERT(date, GETDATE())
            ORDER BY id
        `, { cd });

        const reports = result.map(r => ({
            id: r.id,
            pdfFileName: r.PDFFileName,
            status: r.Status,
            pdfUrl: `https://unitemie.sharepoint.com/sites/Line-BotFiles/Shared%20Documents/${encodeURIComponent(r.PDFFileName)}`
        }));

        res.json({
            owner_cd: cd,
            processDate: new Date().toISOString().slice(0, 10),
            reports: reports
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Server Error" });
    }
});

module.exports = router;
