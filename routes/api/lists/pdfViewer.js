const express = require("express");
const path = require("path");
const fs = require("fs");
const router = express.Router();
const pdf2img = require("pdf-img-convert");

const PDF_DIR = "C:/Line-Bot-Upload/line-bot-upload-test/temp/lists";

router.get("/", async (req, res) => {
    const fileName = req.query.file;
    const filePath = path.join(PDF_DIR, fileName);

    if (!fs.existsSync(filePath)) {
        return res.status(404).send("ファイルが見つかりません");
    }

    try {
        // 画像変換をやめて、PDFファイルを直接ストリームで送る
        const data = fs.readFileSync(filePath);

        // ブラウザに「これはPDFだよ、そのまま画面に出してね」と伝える
        res.contentType("application/pdf");
        // インライン表示（ダウンロードさせずに開く）の設定
        res.setHeader("Content-Disposition", "inline; filename=" + fileName);

        res.send(data);

    } catch (error) {
        console.error("送信エラー:", error);
        res.status(500).send("表示に失敗しました");
    }
});

module.exports = router;