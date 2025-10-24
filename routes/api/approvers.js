const express = require("express");
const router = express.Router();

const { sql } = require("../../utils/sqlClient");
const dbConfig = require("../../config/dbConfig");

router.get("/", async (req, res) => {
    console.log("🛠 approvers.js");
    console.log("[DEBUG] req.query:", req.query);

    const qUserId = String(req.query.user_id || "").trim();
    const qLineId = String(req.query.line_id || "").trim(); // あっても良い（保険）

    let userId = "";
    let pool;

    try {
        pool = await sql.connect(dbConfig);

        if (qUserId) {
            userId = qUserId;
            console.log("[INFO] user_id 直接指定:", userId);
        } else if (qLineId) {
            console.log("[INFO] line_id から user_id 解決:", qLineId);
            const who = await pool.request()
                .input("line_id", sql.NVarChar(64), qLineId)
                .query(`
                    SELECT user_id 
                    FROM T_社員 
                    WHERE line_id=@line_id AND 在職ステータス='employed'
                `);
            if (!who.recordset.length) {
                return res.status(404).json({ error: "line_id に紐づく社員が見つかりません" });
            }
            userId = who.recordset[0].user_id;
            console.log("[INFO] 解決 user_id:", userId);
        } else {
            return res.status(400).json({ error: "user_id または line_id を指定してください" });
        }

        const result = await pool.request()
            .input("user_id", sql.NVarChar(64), userId)
            .query(`
WITH 部署階層 AS (
    SELECT d.department_id, d.department_full_name, d.parent_department_id, 0 AS level
    FROM dbo.T_社員_部署役職 r
    JOIN dbo.T_部署 d ON r.department_full_name = d.department_full_name
    WHERE r.user_id = @user_id

    UNION ALL

    SELECT d2.department_id, d2.department_full_name, d2.parent_department_id, dh.level + 1
    FROM dbo.T_部署 d2
    INNER JOIN 部署階層 dh ON d2.department_id = dh.parent_department_id
)
, 承認候補 AS (
    SELECT
        r.user_id,
        e.氏名,
        r.position_name,
        r.rank,
        dh.department_full_name,
        dh.level,
        ROW_NUMBER() OVER (
            PARTITION BY r.user_id
            ORDER BY dh.level ASC, r.rank DESC   -- ★ 並び替えを変更
        ) AS rn
    FROM 部署階層 dh
    JOIN dbo.T_社員_部署役職 r ON dh.department_full_name = r.department_full_name
    JOIN dbo.T_社員 e ON r.user_id = e.user_id
    WHERE r.user_id <> @user_id
      AND e.在職ステータス = 'employed'
      AND r.rank < (
          SELECT MIN(rank)
          FROM dbo.T_社員_部署役職
          WHERE user_id = @user_id
      )
      AND r.rank <= 5
)
SELECT
    user_id AS 承認者ID,
    氏名 AS 承認者名,
    position_name,
    department_full_name,
    rank,
    level
FROM 承認候補
WHERE rn = 1
ORDER BY level ASC, rank DESC;
            `);

        const rows = result.recordset || [];
        const wantList = req.query.list === '1';

        console.log(`[INFO] クエリ実行成功。取得件数: ${rows.length}`);

        if (!rows.length) {
            return res.json({ found: false });
        }

        if (wantList) {
            return res.json(rows); // 配列返すモード
        }

        const first = rows[0];
        console.log("[INFO] 承認者データ:", {
            found: true,
            氏名: first.承認者名,
            position_name: first.position_name,
            department_name: first.department_full_name,
            user_id: first.承認者ID
        });

        return res.json({
            found: true,
            氏名: first.承認者名,
            position_name: first.position_name,
            department_name: first.department_full_name,
            user_id: first.承認者ID
        });

    } catch (err) {
        console.error("approverエラー:", err);
        return res.status(500).json({ error: "internal server error" });
    } finally {
        try { if (pool) await pool.close(); } catch { }
    }
});

module.exports = router;
