# Requires -Modules SqlServer

function Load-DotEnv($path) {
    Get-Content $path | ForEach-Object {
        if ($_ -match '^\s*([^#][^=]+)=(.*)$') {
            $key = $matches[1].Trim()
            $value = $matches[2].Trim()
            [System.Environment]::SetEnvironmentVariable($key, $value)
        }
    }
}

function To-DbValue {
    param($v)
    if ($null -eq $v) { return [DBNull]::Value }
    if ($v -is [string] -and $v.Trim().Length -eq 0) { return [DBNull]::Value }
    return $v
}

# .env 読み込み
$envPath = Join-Path $PSScriptRoot ".env"
Load-DotEnv -path $envPath

# 環境変数
$token       = $env:SMARTHR_TOKEN
$endpoint    = $env:SMARTHR_ENDPOINT
$sqlServer   = $env:SQL_SERVER
$sqlDatabase = $env:SQL_DATABASE
$sqlUser     = $env:SQL_USER
$sqlPassword = $env:SQL_PASSWORD

function Get-AllCrews {
    param([string]$Endpoint, [string]$Token, [int]$PerPage = 100)
    $headers = @{ "Authorization" = "Bearer $Token"; "accept" = "application/json" }
    $page = 1; $all = @()
    while ($true) {
        $url = "$Endpoint/api/v1/crews?page=$page&per_page=$PerPage"
        $chunk = Invoke-RestMethod -Uri $url -Headers $headers -Method Get
        $list = if ($chunk.PSObject.Properties.Name -contains 'crews') { $chunk.crews } else { $chunk }
        if (-not $list -or $list.Count -eq 0) { break }
        $all += $list
        if ($list.Count -lt $PerPage) { break }
        $page++
        Start-Sleep -Milliseconds 200
    }
    return ,$all
}

# crew取得
$crews = Get-AllCrews -Endpoint $endpoint -Token $token
Write-Host "✅ crew件数: $($crews.Count)"

# DB接続
$connString = "Server=$sqlServer;Database=$sqlDatabase;User Id=$sqlUser;Password=$sqlPassword;TrustServerCertificate=True;"
$connection = New-Object System.Data.SqlClient.SqlConnection $connString
$connection.Open()

# 全件削除
$cmd = $connection.CreateCommand()
$cmd.CommandText = "DELETE dbo.T_社員_部署役職"
$cmd.ExecuteNonQuery()

$cmd = $connection.CreateCommand()
$cmd.CommandText = "DELETE dbo.T_社員"
$cmd.ExecuteNonQuery()

$cmd = $connection.CreateCommand()
$cmd.CommandText = "DELETE dbo.T_部署"
$cmd.ExecuteNonQuery()

# 登録処理
foreach ($crew in $crews) {
    if (-not $crew.user_id) { continue }

    $氏名 = ($crew.last_name + " " + $crew.first_name).Trim()
    $emp_status = To-DbValue($crew.emp_status)
    $cmd = $connection.CreateCommand()
    $cmd.CommandText = "INSERT INTO dbo.T_社員 (user_id, emp_code, 氏名, 在職ステータス) VALUES (@user_id, @emp_code, @氏名, @status)"
    $cmd.Parameters.AddWithValue("@user_id", $crew.user_id) | Out-Null
    $cmd.Parameters.AddWithValue("@emp_code", (To-DbValue $crew.emp_code)) | Out-Null
    $cmd.Parameters.AddWithValue("@氏名", (To-DbValue $氏名)) | Out-Null
    $cmd.Parameters.AddWithValue("@status", $emp_status) | Out-Null
    $cmd.ExecuteNonQuery()

foreach ($dept in $crew.departments) {
    if ($null -eq $dept) { continue }

    $hasValidPosition = $false

    foreach ($pos in $crew.positions) {
        if ($null -eq $pos) { continue }

        $hasValidPosition = $true

        $cmd = $connection.CreateCommand()
        $cmd.CommandText = @"
INSERT INTO dbo.T_社員_部署役職 (user_id, department_full_name, position_name, rank)
VALUES (@user_id, @department, @position, @rank)
"@
        $cmd.Parameters.AddWithValue("@user_id", $crew.user_id) | Out-Null
        $cmd.Parameters.AddWithValue("@department", (To-DbValue $dept.full_name)) | Out-Null
        $cmd.Parameters.AddWithValue("@position", (To-DbValue $pos.name)) | Out-Null
        $cmd.Parameters.AddWithValue("@rank", (To-DbValue $pos.rank)) | Out-Null
        $cmd.ExecuteNonQuery()
    }

    if (-not $hasValidPosition) {
        # positionがnullしかない場合
        $positionName = if ($crew.employment_type.name) { $crew.employment_type.name } else { "" }

        $cmd = $connection.CreateCommand()
        $cmd.CommandText = @"
INSERT INTO dbo.T_社員_部署役職 (user_id, department_full_name, position_name, rank)
VALUES (@user_id, @department, @position, @rank)
"@
        $cmd.Parameters.AddWithValue("@user_id", $crew.user_id) | Out-Null
        $cmd.Parameters.AddWithValue("@department", (To-DbValue $dept.full_name)) | Out-Null
        $cmd.Parameters.AddWithValue("@position", (To-DbValue $positionName)) | Out-Null
        $cmd.Parameters.AddWithValue("@rank", 99) | Out-Null
        $cmd.ExecuteNonQuery()
    }
}
# 部署マスタ格納用
$departmentMap = @{}  # full_name → department_id の対応
$parentMap = @{}      # full_name → parent_full_name の対応

foreach ($crew in $crews) {
    foreach ($dept in $crew.departments) {
        if ($null -eq $dept) { continue }

        $fullPath = $dept.full_name
        $parts = $fullPath -split '/'
        $path = ""
        $parentId = $null

        foreach ($name in $parts) {
            $path = if ($path) { "$path/$name" } else { $name }

            if (-not $departmentMap.ContainsKey($path)) {
                $id = [guid]::NewGuid()
                $departmentMap[$path] = $id
                if ($path -ne $name) {
                    $parentPath = $path.Substring(0, $path.LastIndexOf('/'))
                    $parentMap[$path] = $parentPath
                }

                # SQL登録
                $cmd = $connection.CreateCommand()
                $cmd.CommandText = @"
INSERT INTO dbo.T_部署 (department_id, department_name, department_full_name, parent_department_id)
VALUES (@id, @name, @full, @parent)
"@
                $cmd.Parameters.AddWithValue("@id", $id) | Out-Null
                $cmd.Parameters.AddWithValue("@name", $name) | Out-Null
                $cmd.Parameters.AddWithValue("@full", $path) | Out-Null
                $parent = if ($parentMap.ContainsKey($path)) { $departmentMap[$parentMap[$path]] } else { [DBNull]::Value }
                $cmd.Parameters.AddWithValue("@parent", $parent) | Out-Null
                $cmd.ExecuteNonQuery()
            }
        }
    }
}

}

$connection.Close()
Write-Host "✅ 取込完了：社員／部署役職"
