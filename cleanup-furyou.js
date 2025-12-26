// C:\Line-Bot-Upload\line-bot-upload-test\cleanup-furyou.js

const fs = require('fs');
const path = require('path');
const axios = require('axios');
const graphAuth = require('./config/graphAuth');

// 住所（パス）の設定
const DRIVE_ID = process.env.OAUTH_DRIVE_ID;
const LOCAL_TEMP_DIR = 'C:/Line-Bot-Upload/line-bot-upload-test/temp/furyou';

/**
 * 13時の定期お掃除を実行する関数
 */
async function dailyCleanup() {
    console.log('--- [CLEANUP] 13時のお掃除を開始します ---');

    try {
        // 1️⃣ ローカル（temp/furyou）のお掃除
        if (fs.existsSync(LOCAL_TEMP_DIR)) {
            const localFiles = fs.readdirSync(LOCAL_TEMP_DIR);
            for (const file of localFiles) {
                const filePath = path.join(LOCAL_TEMP_DIR, file);
                fs.unlinkSync(filePath);
                console.log(`🗑️ ローカル削除: ${file}`);
            }
        }

        // 2️⃣ OneDrive のお掃除
        const accessToken = await graphAuth.getAccessToken();
        const listRes = await axios.get(
            `https://graph.microsoft.com/v1.0/drives/${DRIVE_ID}/root/children`,
            { headers: { Authorization: `Bearer ${accessToken}` } }
        );

        const cloudFiles = listRes.data.value || [];
        for (const file of cloudFiles) {
            // 「MV不良報告」が含まれるPDFを狙い撃ち
            if (file.name && file.name.includes('MV不良報告') && file.name.toLowerCase().endsWith('.pdf')) {
                await axios.delete(
                    `https://graph.microsoft.com/v1.0/drives/${DRIVE_ID}/items/${file.id}`,
                    { headers: { Authorization: `Bearer ${accessToken}` } }
                );
                console.log(`☁️ OneDrive削除: ${file.name}`);
            }
        }

        console.log('--- [CLEANUP] お掃除完了！スッキリしたね！ ---');

    } catch (err) {
        console.error('❌ [CLEANUP] エラーが発生しました:', err.message);
    }
}

// 他のファイルから呼べるように書き出し
module.exports = dailyCleanup;