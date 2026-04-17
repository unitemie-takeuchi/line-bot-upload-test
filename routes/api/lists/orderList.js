require('dotenv').config();
const express = require('express');
const router = express.Router();
const sql = require('mssql');
const { PDFDocument, rgb } = require('pdf-lib');
const fontkit = require('@pdf-lib/fontkit');
const fs = require('fs');
const path = require('path');

const miedcConfig = {
    user: process.env.DC_SQL_USER,
    password: process.env.DC_SQL_PASSWORD,
    server: process.env.DC_SQL_SERVER,
    database: process.env.DC_SQL_DATABASE,
    port: Number(process.env.DC_SQL_PORT) || 14333,
    options: {
        encrypt: false,
        trustServerCertificate: true
    }
};

const queries = {
    order: `
    SELECT
        QuA.[担当コード], QuA.[担当者名],
        QuA.[納品日] AS [日付],
        QuA.[得意先コード] AS [取引先コード],
        QuA.[得意先略名] AS [取引先名],
        QuA.[商品コード], QuA.[商品正式名], QuA.[商品名], QuA.[産地名], QuA.[等級], QuA.[階級],
        SUM(QuA.[受注バラ数]) AS [数量],
        QuA.[単位名],
        QuA.[受注単価] AS [単価],
        QuA.[摘要]
    FROM ( 
        SELECT
            TBL0201.vhrNhnYMD AS [納品日]
            , TBL0202.chrShnCD AS [商品コード]
            , MST0101.nvhShnNme AS [商品正式名]
            , TBL0202.nvhShnNme AS [商品名]
            , TBL0202.nvhNjrNme AS [産地名]
            , TBL0202.nvhTkyNme AS [等級]
            , TBL0202.nvhKaiNme AS [階級]
            , TBL0202.nvhTniNme AS [単位名]
            , TBL0202.decJtyBaraCnt AS [受注バラ数]
            , TBL0202.decJtyTnk AS [受注単価]
            , TBL0202.nvhMem AS [摘要]
            , MST0401.chrTntCD AS [担当コード]
            , MST0401.nvhTntNme AS [担当者名]
            , CASE 
                WHEN MST0201.chrSsyCD = '00005001' THEN '00005001' 
                WHEN MST0201.chrSsyCD = '00005051' THEN '00005051' 
                WHEN TBL0201.chrTokCD BETWEEN '00006800' AND '00006899' THEN '00006800' 
                WHEN TBL0201.chrTokCD BETWEEN '00007100' AND '00007199' THEN '00007100' 
                WHEN TBL0201.chrTokCD BETWEEN '00005601' AND '00005649' THEN '00005600' 
                WHEN TBL0201.chrTokCD BETWEEN '00005651' AND '00005699' THEN '00005650' 
                WHEN TBL0201.chrTokCD BETWEEN '00006100' AND '00006199' THEN '00006100' 
                WHEN TBL0201.chrTokCD BETWEEN '00006400' AND '00006499' AND TBL0201.chrTokCD != '00006404' THEN '00006400' 
                ELSE TBL0201.chrTokCD 
              END AS [得意先コード]
            , CASE 
                WHEN MST0201.chrSsyCD = '00005001' THEN 'オークワ三重' 
                WHEN MST0201.chrSsyCD = '00005051' THEN 'オークワみはま' 
                WHEN TBL0201.chrTokCD BETWEEN '00006800' AND '00006899' THEN '東海セイムス（全店集約）' 
                WHEN TBL0201.chrTokCD BETWEEN '00007100' AND '00007199' THEN 'JA全農Aコープ株式会社' 
                WHEN TBL0201.chrTokCD BETWEEN '00005601' AND '00005649' THEN '一号舘（果物）' 
                WHEN TBL0201.chrTokCD BETWEEN '00005651' AND '00005699' THEN '一号舘（野菜）' 
                WHEN TBL0201.chrTokCD BETWEEN '00006100' AND '00006199' THEN 'ＧＫＳ' 
                WHEN TBL0201.chrTokCD BETWEEN '00006400' AND '00006499' AND TBL0201.chrTokCD != '00006404' THEN 'ドン・キホーテ（センター）' 
                ELSE MST0201.nvhTokRyk 
              END AS [得意先略名] 
        FROM TBL0201 
        INNER JOIN TBL0202 ON TBL0201.bntJtyNo = TBL0202.bntJtyNo 
        INNER JOIN MST0101 ON TBL0202.chrShnCD = MST0101.chrShnCD 
        INNER JOIN MST0201 ON TBL0201.chrTokCD = MST0201.chrTokCD 
        INNER JOIN MST0401 ON MST0101.chrTntCD = MST0401.chrTntCD 
        WHERE TBL0201.vhrNhnYMD BETWEEN '20260101' AND '20260110' 
          AND MST0401.chrTntCD BETWEEN '002' AND '999' 
          AND MST0401.chrTntCD != '601'
    ) AS QuA 
    GROUP BY         
        QuA.[担当コード]
        , QuA.[担当者名]
        , QuA.[納品日]
        , QuA.[得意先コード]
        , QuA.[得意先略名]
        , QuA.[商品コード]
        , QuA.[商品正式名]
        , QuA.[商品名]
        , QuA.[産地名]
        , QuA.[等級]
        , QuA.[階級] 
        , QuA.[単位名]
        , QuA.[受注単価]
        , QuA.[摘要] 
    ORDER BY
        QuA.[納品日] ASC,
        QuA.[得意先コード] ASC,
        QuA.[商品コード] ASC,
        QuA.[摘要] ASC
`,
    sales: `
    SELECT
        QuA.[担当コード], QuA.[担当者名],
        QuA.[納品日] AS [日付], 
        QuA.[得意先コード] AS [取引先コード],
        QuA.[得意先略名] AS [取引先名],
        QuA.[商品コード], QuA.[商品正式名], QuA.[商品名], QuA.[産地名], 
        QuA.[等級名] AS 等級, 
        QuA.[階級名] AS 階級,
        SUM(QuA.[売上バラ数]) AS [数量],
        QuA.[単位名],
        QuA.[売上単価] AS [単価],
        QuA.[摘要]
    FROM
        ( 
            SELECT
                TBL0301.vhrNhnYMD AS [納品日]
                , TBL0301.vhrUriYMD AS [売上日]
                , TBL0301.vhrSkaYMD AS [出荷日]
                , TBL0301.chrEgyTntCD AS [営業担当コード]
                , TBL0301.chrNyrTntCD AS [入力担当コード]
                , TBL0301.chrTaxKziKBN AS [消費税課税区分]
                , TBL0301.chrTaxTniKBN AS [消費税単位区分]
                , TBL0301.chrTaxHsuKBN AS [消費税端数処理区分]
                , TBL0301.vhrAteDnpNo AS [相手先伝票番号]
                , TBL0301.vhrDnpKBN AS [伝票区分]
                , TBL0301.vhrNyrSyrKBN AS [入力処理区分]
                , TBL0301.vhrUriBnrCD AS [売上分類コード]
                , TBL0301.nvhUriChkSyogo AS [売上チェック照合文字]
                , TBL0301.chrUriChkKBN AS [チェック区分]
                , TBL0302.bntUriMsiNo AS [売上明細番号]
                , TBL0302.intHyjNo AS [表示番号]
                , TBL0302.chrUriKeiTai AS [売上形態]
                , TBL0302.vhrSeiSmbYMD AS [請求締日]
                , TBL0302.chrShnCD AS [商品コード]
                , TBL0302.intShnEda AS [商品枝番]
                , TBL0302.nvhShnNme AS [商品名]
                , TBL0302.vhrNjrCD AS [産地コード]
                , TBL0302.nvhNjrNme AS [産地名]
                , TBL0302.vhrTkyCD AS [等級コード]
                , TBL0302.nvhTkyNme AS [等級名]
                , TBL0302.vhrKaiCD AS [階級コード]
                , TBL0302.nvhKaiNme AS [階級名]
                , TBL0302.vhrTniCD AS [単位コード]
                , TBL0302.nvhTniNme AS [単位名]
                , TBL0302.chrBinKBN AS [便区分]
                , TBL0302.vhrUriKBN AS [売上区分]
                , TBL0302.vhrDnpNo AS [伝票番号]
                , TBL0302.decIri AS [入り数]
                , TBL0302.decUriCnt AS [売上数量]
                , TBL0302.decUriBaraCnt AS [売上バラ数]
                , TBL0302.decUriTnk AS [売上単価]
                , TBL0302.decSkiTnk AS [先単価]
                , TBL0302.chrTaxPerKBN AS [消費税率区分]
                , TBL0302.decTaxPer AS [消費税率]
                , TBL0302.decUriKng AS [売上金額]
                , TBL0302.decZnkKng AS [税抜金額]
                , TBL0302.nvhMem AS [摘要]
                , TBL0302.vhrInsDate AS [登録日時]
                , TBL0302.vhrInsCD AS [登録者コード]
                , TBL0302.vhrUpdDate AS [更新日時]
                , TBL0302.vhrUpdCD AS [更新者コード]
                , MST0101.nvhShnSskNme AS [商品正式名]
                , MST0201.nvhTokNme AS [得意先正式名]
                , MST0101.chrYsiKdmKBN AS [野菜果物区分]
                , MST0101.chrTntCD AS [担当コード]
                , MST0101.chrNewTntCD AS [新担当コード]
                , MST0201.chrSsyCD AS [支社コード]
                , MST0201.vhrStnCD AS [社店コード]
                , MST0201.vhrTrhCD AS [取引先コード]
                , MST0201.decKakePer AS [掛け率]
                , MST0201.decKjoPer AS [控除率]
                , MST0401.nvhTntNme AS [担当者名]
                , MST0101.chrRdcTaxTaiKBN AS [軽減税率対象区分]
                , MST0401.vhrBnrCD1 AS [大分類]
                , MST0401.vhrBnrCD2 AS [中分類]
                , MST0401.vhrBnrCD3 AS [小分類]
                , CASE 
                    WHEN MST0201.chrSsyCD = '00005001' 
                        THEN '00005001' 
                    WHEN MST0201.chrSsyCD = '00005051' 
                        THEN '00005051' 
                    WHEN TBL0301.chrTokCD BETWEEN '00006800' AND '00006899' 
                        THEN '00006800' 
                    WHEN TBL0301.chrTokCD BETWEEN '00007100' AND '00007199' 
                        THEN '00007100' 
                    WHEN TBL0301.chrTokCD BETWEEN '00005601' AND '00005649' 
                        THEN '00005600' 
                    WHEN TBL0301.chrTokCD BETWEEN '00005651' AND '00005699' 
                        THEN '00005650' 
                    WHEN TBL0301.chrTokCD BETWEEN '00006100' AND '00006199' 
                        THEN '00006100' 
                    WHEN TBL0301.chrTokCD BETWEEN '00006400' AND '00006499' 
                    AND TBL0301.chrTokCD != '00006404' 
                        THEN '00006400' 
                    ELSE TBL0301.chrTokCD 
                    END AS [得意先コード]
                , CASE 
                    WHEN MST0201.chrSsyCD = '00005001' 
                        THEN 'オークワ三重' 
                    WHEN MST0201.chrSsyCD = '00005051' 
                        THEN 'オークワみはま' 
                    WHEN TBL0301.chrTokCD BETWEEN '00006800' AND '00006899' 
                        THEN '東海セイムス（全店集約）' 
                    WHEN TBL0301.chrTokCD BETWEEN '00007100' AND '00007199' 
                        THEN 'JA全農Aコープ株式会社' 
                    WHEN TBL0301.chrTokCD BETWEEN '00005601' AND '00005649' 
                        THEN '一号舘（果物）' 
                    WHEN TBL0301.chrTokCD BETWEEN '00005651' AND '00005699' 
                        THEN '一号舘（野菜）' 
                    WHEN TBL0301.chrTokCD BETWEEN '00006100' AND '00006199' 
                        THEN 'ＧＫＳ' 
                    WHEN TBL0301.chrTokCD BETWEEN '00006400' AND '00006499' 
                    AND TBL0301.chrTokCD != '00006404' 
                        THEN 'ドン・キホーテ（センター）' 
                    ELSE MST0201.nvhTokRyk 
                    END AS [得意先略名] 
            FROM
                TBL0301 
                INNER JOIN TBL0302 
                    ON TBL0301.bntUriNo = TBL0302.bntUriNo 
                INNER JOIN MST0101 
                    ON TBL0302.chrShnCD = MST0101.chrShnCD 
                INNER JOIN MST0201 
                    ON TBL0301.chrTokCD = MST0201.chrTokCD 
                INNER JOIN MST0401 
                    ON MST0101.chrTntCD = MST0401.chrTntCD 
            WHERE
                TBL0301.vhrNhnYMD BETWEEN '20260114' AND '20260114' 
                AND MST0401.chrTntCD BETWEEN '002' AND '999' 
                AND MST0401.chrTntCD != '601'
        ) AS QuA 
    GROUP BY
        QuA.[担当コード]
        , QuA.[担当者名]
        , QuA.[納品日]
        , QuA.[得意先コード]
        , QuA.[得意先略名]
        , QuA.[商品コード]
        , QuA.[商品正式名]
        , QuA.[商品名]
        , QuA.[産地名]
        , QuA.[等級名]
        , QuA.[階級名]
        , QuA.[単位名]
        , QuA.[売上単価]
        , QuA.[摘要]
    ORDER BY
        QuA.[納品日] ASC
        , QuA.[得意先コード] ASC
        , QuA.[商品コード] ASC
        , QuA.[摘要] ASC`,
    purchase: `
    SELECT
        QuA.[担当コード], QuA.[担当者名],
        QuA.[仕入日] AS [日付],
        QuA.[仕入先コード] AS [取引先コード],
        QuA.[仕入先略名] AS [取引先名],
        QuA.[商品コード], QuA.[商品正式名], QuA.[商品名], QuA.[産地名], QuA.[等級], QuA.[階級],
        SUM(QuA.[仕入バラ数]) AS [数量],
        QuA.[単位名],
        QuA.[仕入単価] AS [単価],
        QuA.[摘要]
    FROM
        ( 
            SELECT
                TBL0401.bntSirNo AS [仕入番号]
                , TBL0401.vhrSirYMD AS [仕入日]
                , TBL0401.vhrNhnYMD AS [納品日]
                , TBL0401.vhrNkaYMD AS [入荷日]
                , TBL0401.chrSirCD AS [仕入先コード]
                , TBL0401.chrNyrTntCD AS [入力担当コード]
                , TBL0402.decTaxPer AS [消費税率]
                , TBL0401.chrTaxKziKBN AS [消費税課税区分]
                , TBL0401.chrTaxTniKBN AS [消費税単位区分]
                , TBL0401.chrTaxHsuKBN AS [消費税端数処理区分]
                , TBL0401.vhrInsDate AS [登録日時]
                , TBL0401.vhrInsCD AS [登録者コード]
                , TBL0401.vhrUpdDate AS [更新日時]
                , TBL0401.vhrUpdCD AS [更新者コード]
                , TBL0402.bntSirMsiNo AS [仕入明細番号]
                , TBL0402.intHyjNo AS [表示番号]
                , TBL0402.chrSirKeiTai AS [仕入形態]
                , TBL0402.vhrShrKeiYMD AS [支払計上日]
                , TBL0402.chrShnCD AS [商品コード]
                , TBL0402.intShnEda AS [商品枝番]
                , TBL0402.nvhShnNme AS [商品名]
                , TBL0402.vhrNjrCD AS [産地コード]
                , TBL0402.nvhNjrNme AS [産地名]
                , TBL0402.vhrTkyCD AS [等級コード]
                , TBL0402.nvhTkyNme AS [等級]
                , TBL0402.vhrKaiCD AS [階級コード]
                , TBL0402.nvhKaiNme AS [階級]
                , TBL0402.vhrTniCD AS [単位コード]
                , TBL0402.nvhTniNme AS [単位名]
                , TBL0402.decIri AS [入り数]
                , TBL0402.decSirCnt AS [仕入数]
                , TBL0402.decSirBaraCnt AS [仕入バラ数]
                , TBL0402.decSirTnk AS [仕入単価]
                , TBL0402.decSkiTnk AS [先単価]
                , TBL0402.chrTaxPerKBN AS [消費税率区分]
                , TBL0402.decSirKng AS [仕入金額]
                , TBL0402.nvhMem AS [摘要]
                , MST0101.nvhShnSskNme AS [商品正式名]
                , MST0101.chrTntCD AS [担当コード]
                , MST0101.chrYsiKdmKBN AS [野菜果物区分]
                , MST0101.chrRdcTaxTaiKBN AS [軽減税率対象区分]
                , MST0101.chrNewTntCD AS [新担当者コード]
                , MST0301.nvhSirNme AS [仕入先正式名]
                , MST0301.nvhSirRyk AS [仕入先略名]
                , MST0401.nvhTntNme AS [担当者名]
                , MST0301.vhrBnrCD1 AS [大分類]
                , MST0301.vhrBnrCD2 AS [中分類]
                , MST0301.vhrBnrCD3 AS [小分類] 
            FROM
                TBL0401 
                INNER JOIN TBL0402 
                    ON TBL0401.bntSirNo = TBL0402.bntSirNo 
                INNER JOIN MST0101 
                    ON TBL0402.chrShnCD = MST0101.chrShnCD 
                INNER JOIN MST0301 
                    ON TBL0401.chrSirCD = MST0301.chrSirCD 
                INNER JOIN MST0401 
                    ON MST0101.chrTntCD = MST0401.chrTntCD 
            WHERE
                TBL0401.vhrSirYMD BETWEEN '20260101' AND '20260110' 
                AND MST0401.chrTntCD BETWEEN '002' AND '999' 
                AND MST0401.chrTntCD != '601'
        ) AS QuA
    Group By
        QuA.[担当コード]
        , QuA.[担当者名]
        , QuA.[仕入日]
        , QuA.[仕入先コード]
        , QuA.[仕入先略名]
        , QuA.[商品コード]
        , QuA.[商品正式名]
        , QuA.[商品名]
        , QuA.[産地名]
        , QuA.[等級]
        , QuA.[階級]
        , QuA.[単位名]
        , QuA.[仕入単価]
        , QuA.[摘要] 
    ORDER BY
        QuA.[仕入日] ASC
        , QuA.[仕入先コード] ASC
        , QuA.[商品コード] ASC
        , QuA.[摘要] ASC
`
};

const poolPromise = new sql.ConnectionPool(miedcConfig)
    .connect()
    .then(pool => {
        console.log('ミエデンDCへの接続が完了したよ！');
        return pool;
    })
    .catch(err => {
        console.error('接続失敗:', err);
    });

router.get('/get-order-data', async (req, res) => {
    try {
        const pool = await poolPromise;
        const mode = req.query.mode || 'order'; // モード取得
        let start = req.query.start ? req.query.start.replace(/-/g, '') : '20260101';
        let end = req.query.end ? req.query.end.replace(/-/g, '') : start;

        // モードに対応するクエリを取得
        let base = queries[mode];

        // 日付置換ロジックを汎用化（どのテーブル名が来ても対応できるように修正）
        // vhrNhnYMD か vhrSirYMD どちらかが BETWEEN になっているので、そこを置換
        const dynamicQuery = base.replace(
            /(vhrNhnYMD|vhrSirYMD) BETWEEN '.*?' AND '.*?'/g,
            (match, colName) => `${colName} BETWEEN '${start}' AND '${end}'`
        );

        const result = await pool.request().query(dynamicQuery);
        res.json(result.recordset);
    } catch (err) {
        console.error('データ取得エラー:', err);
        res.status(500).json({ error: err.message });
    }
});

const fontPath = path.join(__dirname, '../../../fonts/ipaexg.ttf');
const jpnFontBytes = fs.readFileSync(fontPath);

// --- 受注PDF生成（メイン処理） ---
router.post('/generate-pdf', async (req, res) => {
    try {
        // 🌟 conditions を追加で受け取る
        const { items, userId, mode, conditions } = req.body;

        if (!items || items.length === 0) {
            return res.status(400).send("データがありません");
        }

        const now = new Date();
        const printDateStr = `出力日時: ${now.getFullYear()}/${(now.getMonth() + 1).toString().padStart(2, '0')}/${now.getDate().toString().padStart(2, '0')} ${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;

        const pdfDoc = await PDFDocument.create();
        pdfDoc.registerFontkit(fontkit);
        const jpnFont = await pdfDoc.embedFont(jpnFontBytes);

        // --- タイトルの切り替え ---
        const titles = {
            order: "【得意先別・商品別　受注一覧表】",
            sales: "【得意先別・商品別　売上一覧表】",
            purchase: "【仕入先別・商品別　仕入一覧表】"
        };
        const mainTitle = titles[mode] || titles.order;

        const addNewPage = () => {
            const newPage = pdfDoc.addPage([595.28, 841.89]);
            const { width, height } = newPage.getSize();
            newPage.drawText(printDateStr, { x: 450, y: height - 25, size: 7, font: jpnFont, color: rgb(0.4, 0.4, 0.4) });

            const titleSize = 18;
            const titleWidth = jpnFont.widthOfTextAtSize(mainTitle, titleSize);
            newPage.drawText(mainTitle, { x: (width - titleWidth) / 2, y: height - 40, size: titleSize, font: jpnFont });

            // 🌟 ここ！タイトルの下に検索条件を描画する
            if (conditions) {
                const condSize = 9;
                const condWidth = jpnFont.widthOfTextAtSize(conditions, condSize);
                newPage.drawText(conditions, {
                    x: (width - condWidth) / 2,
                    y: height - 55, // タイトルの少し下
                    size: condSize,
                    font: jpnFont,
                    color: rgb(0.3, 0.3, 0.3)
                });
            }
            return { newPage, height };
        };

        // 見出し描画を1本化する新しい関数
        const drawSectionHeader = (targetPage, item, y, isContinued = false) => {
            let ty = y;
            const suffix = isContinued ? " （続き）" : "";

            // 取引先名（x:35 に統一して左寄せ！）
            targetPage.drawText(`[${item.取引先コード}] ${item.取引先名} 様${suffix}`, {
                x: 35, y: ty, size: 11, font: jpnFont, color: rgb(0, 0, 0)
            });

            ty -= 15; // 名前からラベル（見出し）への間隔

            const labelSize = 8;
            const labelColor = rgb(0.3, 0.3, 0.3);

            // 各項目の位置（ここを固定すれば絶対にズレない！）
            targetPage.drawText("コード", { x: 35, y: ty, size: labelSize, font: jpnFont, color: labelColor });
            targetPage.drawText("商品名", { x: 75, y: ty, size: labelSize, font: jpnFont, color: labelColor });
            targetPage.drawText("産地", { x: 185, y: ty, size: labelSize, font: jpnFont, color: labelColor });
            targetPage.drawText("等階級", { x: 245, y: ty, size: labelSize, font: jpnFont, color: labelColor });

            // 右寄せのラベル
            const drawRightLabel = (text, endX, currentY) => {
                const tw = jpnFont.widthOfTextAtSize(text, labelSize);
                targetPage.drawText(text, { x: endX - tw, y: currentY, size: labelSize, font: jpnFont, color: labelColor });
            };

            drawRightLabel("数量", 345, ty);
            drawRightLabel("単価", 415, ty); // 明細の x:415 に合わせる
            drawRightLabel("金額", 475, ty); // 明細の x:475 に合わせる
            targetPage.drawText("摘要", { x: 485, y: ty, size: labelSize, font: jpnFont, color: labelColor });

            // 太めの区切り線
            targetPage.drawLine({
                start: { x: 30, y: ty - 3 },
                end: { x: 565, y: ty - 3 },
                thickness: 1.2,
                color: rgb(0.2, 0.2, 0.2)
            });

            return ty - 15; // 「次に明細を書き始める y座標」を返す
        };

        let { newPage: page, height } = addNewPage();
        let currentY = height - 60;
        let lastDate = "";
        let lastCustomer = "";
        let lastItemCode = "";
        const dayOfWeekStr = ["日", "月", "火", "水", "木", "金", "土"];
        let lineCounter = 0;

        items.forEach((item, index) => {
            // --- 納品日ヘッダー ---
            if (lastDate !== item.日付) {
                lineCounter = 0;
                if (currentY < 120) {
                    ({ newPage: page, height } = addNewPage());
                    currentY = height - 60;
                }
                const yyyy = item.日付.substring(0, 4);
                const mm = item.日付.substring(4, 6);
                const dd = item.日付.substring(6, 8);
                const d = new Date(yyyy, mm - 1, dd);
                const dateStr = `${yyyy}/${mm}/${dd}(${dayOfWeekStr[d.getDay()]}) 取引分`;
                currentY -= 25;
                page.drawText(dateStr, { x: 40, y: currentY, size: 11, font: jpnFont, color: rgb(0, 0, 0.5) });
                currentY -= 5;
                lastDate = item.日付;
                lastCustomer = "";
                lastItemCode = "";
            }

            // --- 得意先ヘッダー ---
            if (lastCustomer !== item.取引先コード) {
                lineCounter = 0;
                if (currentY < 100) {
                    ({ newPage: page, height } = addNewPage());
                    currentY = height - 85;
                } else {
                    // 通常（改ページじゃない時）も、得意先の前には少し余白を入れる
                    currentY -= 15;
                }

                // 🌟 currentY を決めてから関数を呼ぶ！
                currentY = drawSectionHeader(page, item, currentY, false);

                lastCustomer = item.取引先コード;
                lastItemCode = "";
            }

            // --- ★ 空行（商品ブレーク）の制御 ---
            if (lastItemCode !== "" && lastItemCode !== item.商品コード) {
                if (currentY < 50) {
                    ({ newPage: page, height } = addNewPage());
                    currentY = height - 85;
                    // 🌟 ここも新しい関数！(第4引数を true にする)
                    currentY = drawSectionHeader(page, item, currentY, true);
                } else {
                    if (lineCounter % 2 === 0) {
                        page.drawRectangle({ x: 45, y: currentY - 3, width: 520, height: 13, color: rgb(0.97, 0.97, 0.97) });
                    }
                    page.drawLine({ start: { x: 45, y: currentY - 3 }, end: { x: 565, y: currentY - 3 }, thickness: 0.2, color: rgb(0.8, 0.8, 0.8) });
                    currentY -= 13;
                    lineCounter++;
                }
            }
            lastItemCode = item.商品コード;

            // --- 明細の描画前の改ページ判定 ---
            if (currentY < 50) {
                ({ newPage: page, height } = addNewPage());
                currentY = height - 85;
                // 新しい関数に差し替え！ (第4引数は true)
                currentY = drawSectionHeader(page, item, currentY, true);
            }

            // ゼブラ塗りつぶし
            if (lineCounter % 2 === 0) {
                page.drawRectangle({
                    x: 30, // 🌟 45から30に（左端から開始）
                    y: currentY - 3,
                    width: 535, // 🌟 幅も少し広げる
                    height: 13,
                    color: rgb(0.97, 0.97, 0.97)
                });
            }

            const fontSize = 9;
            const price = (item.単価 || 0).toLocaleString();
            const amount = ((item.単価 || 0) * (item.数量 || 0)).toLocaleString();

            page.drawText(Number(item.商品コード).toString(), { x: 35, y: currentY, size: fontSize, font: jpnFont });
            page.drawText((item.商品名 || "").substring(0, 12), { x: 75, y: currentY, size: fontSize, font: jpnFont });
            page.drawText((item.産地名 || "").substring(0, 6), { x: 185, y: currentY, size: 8, font: jpnFont });
            const rank = `${item.等級 || ''}${item.階級 || ''}`.trim();
            page.drawText(rank.substring(0, 8), { x: 245, y: currentY, size: 8, font: jpnFont });

            const drawRightText = (text, endX) => {
                const tw = jpnFont.widthOfTextAtSize(text, fontSize);
                page.drawText(text, { x: endX - tw, y: currentY, size: fontSize, font: jpnFont });
            };

            drawRightText((item.数量 || 0).toLocaleString(), 345);
            page.drawText(item.単位名 || "", { x: 347, y: currentY, size: 7, font: jpnFont });
            drawRightText(price, 415);
            drawRightText(amount, 475);

            if (item.摘要) {
                page.drawText(item.摘要.substring(0, 15), { x: 485, y: currentY, size: 7, font: jpnFont, color: rgb(0.2, 0.2, 0.2) });
            }

            page.drawLine({ start: { x: 35, y: currentY - 3 }, end: { x: 565, y: currentY - 3 }, thickness: 0.2, color: rgb(0.8, 0.8, 0.8) });

            currentY -= 13;
            lineCounter++;
        });

        const pages = pdfDoc.getPages();
        pages.forEach((p, i) => {
            p.drawText(`${i + 1} / ${pages.length} ページ`, { x: 260, y: 20, size: 8, font: jpnFont, color: rgb(0.4, 0.4, 0.4) });
        });

        const pdfBytes = await pdfDoc.save();
        const fileName = `${userId}.pdf`;
        const saveDir = 'C:/Line-Bot-Upload/line-bot-upload-test/temp/lists';
        const filePath = path.join(saveDir, fileName);

        if (!fs.existsSync(saveDir)) fs.mkdirSync(saveDir, { recursive: true });
        fs.writeFileSync(filePath, Buffer.from(pdfBytes));

        const baseUrl = 'https://test.unitemie.com';
        res.json({ url: `${baseUrl}/view-pdf?file=${fileName}` });

    } catch (error) {
        console.error("PDF生成・保存エラー:", error);
        res.status(500).send("PDFの作成に失敗しちゃった...");
    }
});

module.exports = router;