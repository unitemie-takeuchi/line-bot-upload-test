const sql = require('mssql');

// 接続設定（さっき成功した内容だよ！）
const config = {
    user: 'unite',
    password: 'unite', 
    server: '127.0.0.1',
    port: 14333,
    database: 'N22', // ここを N22 にするのを忘れずに！
    options: {
        encrypt: false,
        trustServerCertificate: true
    },
};

async function listTables() {
    try {
        let pool = await sql.connect(config);
        
        // SQL Serverに「テーブルの名前を全部教えて！」と頼むクエリ
        const result = await pool.request().query(`
            SELECT name 
            FROM sys.tables 
            ORDER BY name
        `);
        
        console.log('--- N22 データベースのテーブル一覧 ---');
        result.recordset.forEach(row => {
            console.log(`📌 ${row.name}`);
        });
        console.log('--------------------------------------');
        console.log(`合計: ${result.recordset.length} 個のテーブルが見つかったよ！`);
        
        await pool.close();
    } catch (err) {
        console.error('❌ エラーが発生したよ...', err.message);
    }
}

listTables();