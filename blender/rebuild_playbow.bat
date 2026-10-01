@echo off
REM Rebuilds golden_retriever_playbow.blend from build_playbow_golden.py.
REM Close the .blend in Blender first. Double-click this file to run.
cd /d "%~dp0"
"C:\Program Files\Blender Foundation\Blender 5.2\blender.exe" -b -P build_playbow_golden.py
echo.
echo Done. Re-open golden_retriever_playbow.blend in Blender.
pause
