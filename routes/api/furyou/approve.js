//C:\Line-Bot-Upload\line-bot-upload-test\routes\api\furyou\approve.js

const express = require('express');
const router = express.Router();
const db = require("../../../utils/sqlClient");

router.post('/', async (req, res) => {
    const { id } = req.body;

    if (!id) return res.status(400).json({ error: "id is required" });

    try {
        await db.query(`
            UPDATE T_MV不良報告書
            SET Status = '10',
                processed_dt = GETDATE()
            WHERE id = @id
        `, { id });

        res.json({ ok: true });

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Server Error" });
    }
});

module.exports = router;
