const express = require('express');
const path = require('path');
require('dotenv').config();
const { notifyAdmin } = require('./utils/lineNotify');

const app = express();
const port = parseInt(process.env.STATIC_PORT, 10);
const publicPath = path.join(__dirname, 'public');

if (isNaN(port)) {
  const msg = '❌ STATIC_PORT が無効（未定義または数値でない）です。サービス起動に失敗しました。';
  console.error(msg);
  notifyAdmin(msg).then(() => process.exit(1));
} else {
  console.log(`🧭 Serving static files from: ${publicPath}`);
  app.use(express.static(publicPath));

  app.listen(port, (err) => {
    if (err) {
      const msg = `❌ STATIC_PORT=${port} でサーバー起動に失敗しました。\n${err.message}`;
      console.error(msg);
      notifyAdmin(msg).then(() => process.exit(1));
    } else {
      const msg = `✅ Viewerサーバーが起動しました。\nhttp://localhost:${port}`;
      console.log(msg);
      notifyAdmin(msg); // 成功時も通知する
    }
  });
}
