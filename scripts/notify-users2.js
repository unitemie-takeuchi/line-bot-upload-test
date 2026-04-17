// notify-users.js
require('dotenv').config({ path: '../.env' });
const { Client } = require('@line/bot-sdk');

const client = new Client({
    channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
    channelSecret: process.env.LINE_CHANNEL_SECRET,
});

async function sendTest() {
    // たけうちのユーザーID
    const myUserId = 'U29c7b04b8084561da3d7100355e4395c';

    try {
        // broadcast ではなく pushMessage を使うよ！
        await client.pushMessage(myUserId, [
            {
                type: 'text',
                text: `📢【テスト送信：新機能のお知らせ】\n\n本日より、新機能『Data Explorer（データ抽出）』を追加しました！\n\n「受注・売上・仕入」の状況を確認いただけます。`
            },
            {
                type: 'template',
                altText: '新機能：Data Explorer 操作手順書',
                template: {
                    type: 'buttons',
                    title: 'Data Explorer Guide',
                    text: '操作方法については、以下のボタンからマニュアルをご確認ください。',
                    actions: [
                        {
                            type: 'uri',
                            label: 'マニュアルを開く',
                            uri: 'https://unitemie-my.sharepoint.com/:b:/g/personal/unitemie_soumu02_unitemie_onmicrosoft_com/IQDpfOPEk5rrTrby-vYCpmsfAZR7iL6O1noqlaNlKOYsBgc?e=UW0Acq'
                        }
                    ]
                }
            }
        ]);
        console.log('✅ たけうちへのテスト送信が成功したよ！');
    } catch (err) {
        console.error('❌ 送信失敗:', err);
    }
}

sendTest();