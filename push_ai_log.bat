@echo off
chcp 65001 >nul
echo ========================================================
echo   DONG BO VA PUSH AI LOG TU FOLDER CONVERT LEN PHOENIX
echo ========================================================

cd /d "D:\Buid-Phase\P-118"

echo [1/2] Dang quet cac prompt AI moi (bo qua loc thu muc)...
python scripts/log_antigravity.py --hours 48 --no-repo-filter

echo [2/2] Dang gui log len Phoenix Server...
python scripts/submit_log.py

echo ========================================================
echo   HOAN TAT! KIEM TRA TREN PHOENIX DASHBOARD
echo ========================================================
pause
