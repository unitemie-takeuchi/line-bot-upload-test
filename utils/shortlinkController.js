// 📁 ファイル名: shortlinkController.js

const express = require('express');
const router = express.Router();
require('dotenv').config();

// 短縮URLの保存用メモリ（必要ならRedisに置き換え）
const shortLinkCache = new Map();

// 有効期限（ミリ秒）
const EXPIRATION_TIME = 5 * 60 * 1000; // 5分

// 🔑 ランダムキー生成関数
function generateShortKey(length = 8) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// 🚪 GET /view?key=xxxxx
router.get('/view', (req, res) => {
  const key = req.query.key;
  const entry = shortLinkCache.get(key);

  if (!entry) {
    return res.status(404).send('リンクが存在しないか、無効です。');
  }

  const { url, timestamp } = entry;
  if (Date.now() - timestamp > EXPIRATION_TIME) {
    shortLinkCache.delete(key);
    return res.status(410).send('リンクの有効期限が切れています。');
  }

  // 🔄 直接リダイレクトではなく、中継HTMLを出力
  res.send(`
  <!DOCTYPE html>
  <html lang="ja">
  <head>
    <meta charset="UTF-8" />
    <title>帳票を開いています...</title>
    <meta http-equiv="refresh" content="0; url=${url}" />
  </head>
  <body>
    <p>📄 帳票を開いています。画面が切り替わらない場合は <a href="${url}">こちら</a> をクリックしてください。</p>
  </body>
  </html>
`);
});

// 🧠 短縮リンク生成関数（環境変数を使用）
function storeShortLink(pdfUrl) {
  const key = generateShortKey();
  const baseUrl = process.env.BASE_SHORT_URL;
  const shortUrl = `${baseUrl}/view?key=${key}`;

  shortLinkCache.set(key, {
    url: pdfUrl,
    timestamp: Date.now(),
  });

  return shortUrl;
}

module.exports = { router, storeShortLink };
