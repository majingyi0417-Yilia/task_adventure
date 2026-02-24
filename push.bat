@echo off
echo 正在推送到 GitHub...
git add .
git commit -m "更新: %date% %time%"
git push origin main
echo 推送完成！
pause
