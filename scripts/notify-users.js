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
    text: `📢 受注データ更新のお知らせ

本日分の受注データを更新・追加しました。
集荷リストから最新の内容が確認できますので、ご利用ください。`,
    });
    console.log('✅ 通知を送信しました');
  } catch (err) {
    console.error('❌ 通知の送信に失敗しました:', err);
  }
}

sendBroadcast();