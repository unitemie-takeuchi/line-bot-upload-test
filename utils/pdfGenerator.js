const PDFDocument = require('pdfkit');
const path = require('path');
const fs = require('fs');

async function generateReportPDF(rows) {
    return new Promise((resolve, reject) => {
        const doc = new PDFDocument({
            margin: 30,
            size: 'A4',
            layout: 'landscape',
            bufferPages: true
        });

        let buffers = [];
        doc.on('data', (chunk) => buffers.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(buffers)));

        const fontPath = path.join(__dirname, '..', 'fonts', 'ipaexg.ttf');
        doc.font(fs.existsSync(fontPath) ? fontPath : 'Helvetica');

        // --- 位置の定義 ---
        const tableTop = 80;    // 🌟 これを追加！
        const colShop = 30;
        const colDate = 160;
        const colSlip = 215;
        const colProduct = 275;
        const colOrigin = 485;   // 🌟数量の代わりに産地（少し幅広めに）
        const colStatus = 560;
        const colReason = 635;

        const drawHeader = (doc) => {
            doc.fontSize(18).text('不良報告 処理結果一覧表（詳細版）', { align: 'center' });
            doc.fontSize(9).text(`出力日時: ${new Date().toLocaleString('ja-JP')}`, { align: 'right' });
            doc.moveDown(1);

            doc.rect(colShop - 5, tableTop - 5, 795, 20).fill('#eeeeee').stroke('#cccccc');
            doc.fillColor('#333333').fontSize(9);
            doc.text('店舗(CD/名)', colShop, tableTop);
            doc.text('納品日', colDate, tableTop);
            doc.text('伝票番号', colSlip, tableTop);
            doc.text('商品(CD/名)', colProduct, tableTop);
            doc.text('産地', colOrigin, tableTop);
            doc.text('判定', colStatus, tableTop);
            doc.text('否認理由/コメント', colReason, tableTop);
            doc.fillColor('#000000');
        };

        drawHeader(doc);

        let currentY = tableTop + 25;
        let counts = { '10': 0, '11': 0, '20': 0 };

        rows.forEach((row) => {
            if (counts[row.status] !== undefined) counts[row.status]++;

            if (currentY > 500) {
                doc.addPage();
                drawHeader(doc);
                currentY = tableTop + 25;
            }

            // 🌟 colFile だったところを colShop に修正
            doc.moveTo(colShop - 5, currentY + 15).lineTo(825, currentY + 15).lineWidth(0.5).stroke('#dddddd');

            doc.fontSize(8);
            doc.fillColor('black');
            doc.text(`${row.shop_cd || ''} ${row.shop_name || ''}`, colShop, currentY, { width: 125 });

            const dDate = row.delivery_date ? new Date(row.delivery_date).toLocaleDateString('ja-JP').slice(5) : '-';
            doc.text(dDate, colDate, currentY);
            doc.text(row.slip_no || '-', colSlip, currentY);
            doc.text(`${row.product_cd || ''} ${row.product_name || ''}`, colProduct, currentY, { width: 205 });

            // 🌟 数量の代わりに産地を表示
            doc.text(row.origin_name || '-', colOrigin, currentY, { width: 70 });

            // 🌟 判定ラベルと色分け
            let statusLabel = '';
            if (row.status === '10') {
                statusLabel = '承認';
                doc.fillColor('green'); // 承認は安心の緑！
            } else if (row.status === '11') {
                statusLabel = '自動承認'; // 🌟表現を長くしたよ
                doc.fillColor('blue');  // 自動承認は青！
            } else if (row.status === '20') {
                statusLabel = '否認';
                doc.fillColor('red');   // 否認は警告の赤！
            }
            doc.text(statusLabel, colStatus, currentY);

            // 理由（ここは常に黒でいいよね！）
            doc.fillColor('black');
            const reasonText = `${row.reject_reason || ''} ${row.reject_comment || ''}`.trim();
            doc.text(reasonText || '-', colReason, currentY, { width: 185 });

            currentY += 22;
        });

        // 集計行
        const total = rows.length;
        const summaryText = `【集計】 承認: ${counts['10']}件   自動承認: ${counts['11']}件   否認: ${counts['20']}件   合計: ${total}件`;

        doc.moveDown(1);
        // 🌟 ここも colShop に修正し、枠の幅を調整
        doc.rect(colShop - 5, currentY, 795, 25).fill('#f9f9f9').stroke('#cccccc');
        doc.fillColor('#000000').fontSize(11).text(summaryText, colShop + 10, currentY + 7);

        const range = doc.bufferedPageRange();
        for (let i = range.start; i < range.start + range.count; i++) {
            doc.switchToPage(i);
            doc.fontSize(10).text(
                `${i + 1} / ${range.count}`,
                0,
                doc.page.height - 50,
                { align: 'center' }
            );
        }

        doc.end();
    });
}

module.exports = { generateReportPDF };