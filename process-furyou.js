// process-furyou.js
const axios = require('axios');
const sql = require('mssql');
const graphAuth = require('./config/graphAuth');
const path = require('path');
const fs = require('fs');
const pdfPoppler = require('pdf-poppler');

const DRIVE_ID = process.env.OAUTH_DRIVE_ID;
const OUTPUT_DIR = 'C:/Line-Bot-Upload/line-bot-upload-test/temp/furyou';

async function convertPdfToPng(pdfPath, outputDir) {
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }

    const opts = {
        format: 'png',
        out_dir: outputDir,
        out_prefix: path.basename(pdfPath, '.pdf'),
        page: null,
    };

    console.log(`[CONVERT] start: ${pdfPath}`);
    await pdfPoppler.convert(pdfPath, opts);
    console.log(`[CONVERT] done`);
}

async function processFuryouReports() {
    console.log('[PROCESS] start');

    try {
        // DB件数
        const pool = await sql.connect({
            user: process.env.SQL_USER,
            password: process.env.SQL_PASSWORD,
            server: process.env.SQL_SERVER,
            database: process.env.SQL_DATABASE,
            options: { encrypt: true, trustServerCertificate: true },
        });

        const dbResult = await pool.request().query(`
            SELECT COUNT(*) AS cnt
            FROM dbo.T_MV不良報告書
            WHERE CAST(import_dt AS DATE) = CAST(GETDATE() AS DATE)
        `);

        const dbCount = dbResult.recordset[0].cnt;
        console.log(`[PROCESS] DB count = ${dbCount}`);

        // Drive一覧
        const accessToken = await graphAuth.getAccessToken();

        const listRes = await axios.get(
            `https://graph.microsoft.com/v1.0/drives/${DRIVE_ID}/root/children`,
            { headers: { Authorization: `Bearer ${accessToken}` } }
        );

        const files = listRes.data.value || [];

        const targetFiles = files.filter(f =>
            f.name &&
            f.name.includes('MV不良報告') &&
            f.name.toLowerCase().endsWith('.pdf')
        );

        console.log(`[PROCESS] Drive count = ${targetFiles.length}`);

        if (dbCount !== targetFiles.length) {
            console.log('[PROCESS] count mismatch');
            return;
        }

        console.log('[PROCESS] count matched');

        if (targetFiles.length === 0) {
            console.log('[PROCESS] No target PDF found.');
            return;
        }

        const startTime = new Date();
        console.log(`[PROCESS] PNG convert start: ${startTime.toLocaleTimeString()}`);

        for (const file of targetFiles) {
            console.log(`[PROCESS] Convert target: ${file.name}`);

            const pdfPath = path.join(OUTPUT_DIR, file.name);

            const pdfRes = await axios.get(
                `https://graph.microsoft.com/v1.0/drives/${DRIVE_ID}/items/${file.id}/content`,
                {
                    headers: { Authorization: `Bearer ${accessToken}` },
                    responseType: 'arraybuffer',
                }
            );

            fs.writeFileSync(pdfPath, pdfRes.data);
            await convertPdfToPng(pdfPath, OUTPUT_DIR);
            normalizePngName(OUTPUT_DIR, path.basename(pdfPath, '.pdf'));
        }

        const endTime = new Date();
        const elapsedMs = endTime - startTime;

        console.log(`[PROCESS] PNG convert end: ${endTime.toLocaleTimeString()}`);
        console.log(`[PROCESS] Elapsed: ${(elapsedMs / 1000).toFixed(2)} sec`);
        console.log(`[PROCESS] Converted files: ${targetFiles.length}`);

    } catch (err) {
        console.error('[PROCESS] error', err.response?.data || err.message);
    }
}

function normalizePngName(outputDir, baseName) {
  const oldPath = path.join(outputDir, `${baseName}-1.png`);
  const newPath = path.join(outputDir, `${baseName}.png`);

  if (fs.existsSync(oldPath)) {
    fs.renameSync(oldPath, newPath);
  }
}


module.exports = processFuryouReports;
