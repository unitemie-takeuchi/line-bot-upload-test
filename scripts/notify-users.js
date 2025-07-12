// notify-users.js
require('dotenv').config({ path: '../.env' });
const { Client } = require('@line/bot-sdk');

const client = new Client({
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET,
});

async function sendBroadcast() {
  try {
    await client.broadcast({
      type: 'text',
      text: `📢 バージョンアップのお知らせ

📄 帳票の印刷・ダウンロードができるようになりました！

初回のみ、URLをタップ後に「Acrobat Reader」を常時使用に設定し、
ログイン画面が出た場合は ✖（閉じる）でOKです。`,
    });
    console.log('✅ 通知を送信しました');
  } catch (err) {
    console.error('❌ 通知の送信に失敗しました:', err);
  }
}

sendBroadcast();