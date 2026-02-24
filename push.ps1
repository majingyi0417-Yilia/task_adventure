param(
    [string]$m = "更新"
)

# 检查Git仓库
if (-not (Test-Path ".git")) {
    Write-Host "错误：当前目录不是Git仓库" -ForegroundColor Red
    exit 1
}

# 添加所有更改
Write-Host "添加文件..." -ForegroundColor Cyan
git add .

# 提交
$timestamp = Get-Date -Format "yyyy-MM-dd HH:mm"
$message = if ($m -eq "更新") { "更新: $timestamp" } else { $m }
Write-Host "提交: $message" -ForegroundColor Cyan
git commit -m "$message"

# 推送
Write-Host "推送到GitHub..." -ForegroundColor Cyan
git push

Write-Host "✅ 完成！" -ForegroundColor Green
