<# ==============================================================
 PowerShell 5 対応版: OneDrive から Graph API 経由で CSV をダウンロードするスクリプト
 ============================================================== #>

function Load-DotEnv($path) {
    if (-not (Test-Path $path)) { return }
    Get-Content $path | ForEach-Object {
        if ($_ -match '^\s*([^#][^=]+)=(.*)$') {
            $key = $matches[1].Trim()
            $value = $matches[2].Trim()
            [System.Environment]::SetEnvironmentVariable($key, $value)
        }
    }
}

# .env 読み込み
$envPath = Join-Path $PSScriptRoot ".env"
Load-DotEnv -path $envPath

# OAUTH_系またはGRAPH_系から読み取り（PowerShell 5対応）
$tenantId = if ($env:OAUTH_TENANT_ID) { $env:OAUTH_TENANT_ID } else { $env:GRAPH_TENANT_ID }
$clientId = if ($env:OAUTH_CLIENT_ID) { $env:OAUTH_CLIENT_ID } else { $env:GRAPH_CLIENT_ID }
$secret   = if ($env:OAUTH_CLIENT_SECRET) { $env:OAUTH_CLIENT_SECRET } else { $env:GRAPH_CLIENT_SECRET }
$scope    = if ($env:OAUTH_SCOPE) { $env:OAUTH_SCOPE } else { $env:GRAPH_SCOPE }
$tokenUrl = if ($env:OAUTH_TOKEN_URL) { $env:OAUTH_TOKEN_URL } else { $env:GRAPH_TOKEN_URL }

$driveId  = if ($env:OAUTH_DRIVE_ID) { $env:OAUTH_DRIVE_ID } else { $env:GRAPH_DRIVE_ID }
$filePath = if ($env:OAUTH_FILE_PATH) { $env:OAUTH_FILE_PATH } else { $env:GRAPH_FILE_PATH }
$savePath = if ($env:CSV_DOWNLOAD_PATH) { $env:CSV_DOWNLOAD_PATH } else { "C:\temp\default.csv" }

if (-not $tenantId -or -not $clientId -or -not $secret -or -not $driveId -or -not $filePath -or -not $savePath -or -not $tokenUrl -or -not $scope) {
    throw "必要な環境変数が不足しています。"
}

# アクセストークン取得
$body = @{
    client_id     = $clientId
    scope         = $scope
    client_secret = $secret
    grant_type    = "client_credentials"
}
$tokenResponse = Invoke-RestMethod -Method POST -Uri $tokenUrl -Body $body
$token = $tokenResponse.access_token

# ファイルダウンロード
$encodedPath = [System.Web.HttpUtility]::UrlPathEncode($filePath)
$uri = "https://graph.microsoft.com/v1.0/drives/$driveId/root:/${encodedPath}:/content"

Invoke-RestMethod -Headers @{ Authorization = "Bearer $token" } -Uri $uri -OutFile $savePath -ErrorAction Stop

Write-Host "✅ ダウンロード完了: $savePath"




<# =====================================================================
 CSV → SQL Server 取り込みスクリプト（T_会社カレンダー）
 - .env の以下を使用:
   SQL_SERVER, SQL_DATABASE, SQL_USER, SQL_PASSWORD
   CSV_PATH（任意。未設定なら $PSScriptRoot\dbo_MST0701.csv を使用）
 - 期待するCSV列: chrYMD, chrKdoKBN
===================================================================== #>

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Load-DotEnv($path) {
    if (-not (Test-Path $path)) { return }
    Get-Content $path | ForEach-Object {
        if ($_ -match '^\s*([^#][^=]+)=(.*)$') {
            $key = $matches[1].Trim()
            $value = $matches[2].Trim()
            [System.Environment]::SetEnvironmentVariable($key, $value)
        }
    }
}

# .env 読み込み
$envPath = Join-Path $PSScriptRoot ".env"
Load-DotEnv -path $envPath

# 環境変数の取得
$sqlServer   = $env:SQL_SERVER
$sqlDatabase = $env:SQL_DATABASE
$sqlUser     = $env:SQL_USER
$sqlPassword = $env:SQL_PASSWORD
$csvPath     = $env:CSV_DOWNLOAD_PATH
if ([string]::IsNullOrWhiteSpace($csvPath)) {
    $csvPath = Join-Path $PSScriptRoot "dbo_MST0701.csv"
}

if ([string]::IsNullOrWhiteSpace($sqlServer) -or
    [string]::IsNullOrWhiteSpace($sqlDatabase) -or
    [string]::IsNullOrWhiteSpace($sqlUser) -or
    [string]::IsNullOrWhiteSpace($sqlPassword)) {
    throw "SQL_SERVER / SQL_DATABASE / SQL_USER / SQL_PASSWORD のいずれかが .env に未設定です。"
}

if (-not (Test-Path $csvPath)) {
    throw "CSVファイルが見つかりません: $csvPath"
}

# 接続文字列（必要に応じて Encrypt/TrustServerCertificate を調整）
$connectionString = "Server=$sqlServer;Database=$sqlDatabase;User ID=$sqlUser;Password=$sqlPassword;Encrypt=True;TrustServerCertificate=True;"

# SQL接続を開く
$connection = New-Object System.Data.SqlClient.SqlConnection $connectionString
$connection.Open()

# テーブル存在チェック＆作成
$createTableSql = @"
IF NOT EXISTS (
    SELECT 1 FROM sys.tables t WHERE t.name = N'T_会社カレンダー' AND t.schema_id = SCHEMA_ID(N'dbo')
)
BEGIN
    CREATE TABLE dbo.T_会社カレンダー (
        chrYMD    int NOT NULL PRIMARY KEY,
        chrKdoKBN bit NOT NULL
    );
END
"@

$cmd = $connection.CreateCommand()
$cmd.CommandText = $createTableSql
$cmd.ExecuteNonQuery() | Out-Null

# 取り込みデータの準備（エンコーディング調整。Access出力はcp932のことが多い）
# PowerShell 7+ なら -Encoding Parameter が使えるが、互換のため Get-Content + ConvertFrom-Csv を使用
$csvLines = Get-Content -Path $csvPath -Encoding Default
$rows = $csvLines | ConvertFrom-Csv

# DataTable構築（型をしっかり定義）
$dataTable = New-Object System.Data.DataTable "Calendar"
$col1 = New-Object System.Data.DataColumn("chrYMD", [int])
$col2 = New-Object System.Data.DataColumn("chrKdoKBN", [bool])
[void]$dataTable.Columns.Add($col1)
[void]$dataTable.Columns.Add($col2)

foreach ($r in $rows) {
    $ymd = [int]$r.chrYMD
    $kbn = if ([string]::IsNullOrWhiteSpace($r.chrKdoKBN)) { $false } else { ([int]$r.chrKdoKBN -ne 0) }

    $row = $dataTable.NewRow()
    $row["chrYMD"] = $ymd
    $row["chrKdoKBN"] = $kbn
    $dataTable.Rows.Add($row) | Out-Null
}

# トランケート＆BulkCopy
$transaction = $connection.BeginTransaction()
try {
    $truncate = $connection.CreateCommand()
    $truncate.Transaction = $transaction
    $truncate.CommandText = "TRUNCATE TABLE dbo.T_会社カレンダー;"
    $truncate.ExecuteNonQuery() | Out-Null

    $bulkCopy = New-Object System.Data.SqlClient.SqlBulkCopy($connection, [System.Data.SqlClient.SqlBulkCopyOptions]::Default, $transaction)
    $bulkCopy.DestinationTableName = "dbo.T_会社カレンダー"
    $bulkCopy.BulkCopyTimeout = 0  # 無制限
    [void]$bulkCopy.ColumnMappings.Add("chrYMD", "chrYMD")
    [void]$bulkCopy.ColumnMappings.Add("chrKdoKBN", "chrKdoKBN")

    $bulkCopy.WriteToServer($dataTable)

    $transaction.Commit()
    Write-Host "✅ 取り込み完了: $($dataTable.Rows.Count) 行"
}
catch {
    $transaction.Rollback()
    throw
}
finally {
    $connection.Close()
}
