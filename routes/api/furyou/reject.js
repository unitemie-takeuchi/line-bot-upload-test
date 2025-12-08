//C:\Line-Bot-Upload\line-bot-upload-test\routes\api\furyou\reject.js

const express = require('express');
const router = express.Router();

const db = require("../../../utils/sqlClient");
//const mailer = require('../../../utils/mailer');

router.post('/', async (req, res) => {
    const { id, reasonLabel, comment } = req.body;

    if (!id || !reasonLabel) {
        return res.status(400).json({ error: "id and reasonLabel are required" });
    }

    try {
        const rows = await db.query(`
            SELECT PDFFileName, owner_cd
            FROM T_MV不良報告書
            WHERE id = @id
        `, { id });

        if (rows.length === 0) {
            return res.status(404).json({ error: "Record not found" });
        }

        const fileName = rows[0].PDFFileName;

        await db.query(`
            UPDATE T_MV不良報告書
            SET Status = '20',
                reject_reason = @reason,
                processed_dt = GETDATE()
            WHERE id = @id
        `, { id, reason: `${reasonLabel} / ${comment || ""}` });

        await mailer.sendRejectMail({
            fileName,
            reasonLabel,
            comment
        });

        res.json({ ok: true });

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Server Error" });
    }
});

module.exports = router;
