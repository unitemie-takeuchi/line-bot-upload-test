const sql = require('mssql');

async function getApproverByUserId(userId) {
  const result = await sql.query(`
    WITH 所属部署 AS (
        SELECT d.department_id, d.department_full_name, d.parent_department_id
        FROM dbo.T_社員_部署役職 r
        JOIN dbo.T_部署 d ON r.department_full_name = d.department_full_name
        WHERE r.user_id = @userId
    ),
    上位部署 AS (
        SELECT department_id, department_full_name, parent_department_id, 0 AS level
        FROM 所属部署
        UNION ALL
        SELECT d.department_id, d.department_full_name, d.parent_department_id, ud.level + 1
        FROM dbo.T_部署 d
        INNER JOIN 上位部署 ud ON d.department_id = ud.parent_department_id
    ),
    申請者のrank AS (
        SELECT MIN(r.rank) AS my_rank
        FROM dbo.T_社員_部署役職 r
        JOIN dbo.T_部署 d ON r.department_full_name = d.department_full_name
        WHERE r.user_id = @userId
    ),
    候補者一覧 AS (
        SELECT
            r.user_id,
            e.氏名,
            r.department_full_name,
            r.position_name,
            r.rank,
            ud.level,
            ROW_NUMBER() OVER (
                ORDER BY r.rank DESC, ud.level ASC
            ) AS row_num
        FROM dbo.T_社員_部署役職 r
        JOIN dbo.T_部署 d ON r.department_full_name = d.department_full_name
        JOIN 上位部署 ud ON d.department_id = ud.department_id
        JOIN 申請者のrank sr ON r.rank < sr.my_rank
        JOIN dbo.T_社員 e ON r.user_id = e.user_id
        WHERE r.user_id <> @userId
          AND e.在職ステータス = 'employed'
          AND r.rank <= 5
    )
    SELECT 
        user_id AS 承認者ID,
        氏名 AS 承認者名,
        department_full_name,
        position_name,
        rank
    FROM 候補者一覧
    WHERE row_num = 1;
  `.replace(/@userId/g, `'${userId}'`) // プレースホルダを直接埋め込む場合。パラメータ化でもOK
  );

  return result.recordset[0] || null;
}

module.exports = { getApproverByUserId };
