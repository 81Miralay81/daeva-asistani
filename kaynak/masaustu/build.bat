@echo off
chcp 65001 >nul
echo === Daeva Asistani - exe olusturuluyor ===
python --version || (echo Python bulunamadi. python.org'dan kurup "Add python.exe to PATH" kutusunu isaretleyin. & pause & exit /b 1)
python -m pip install --upgrade pip
python -m pip install pywebview pyinstaller
python -m PyInstaller --noconfirm --onefile --windowed --name DaevaAsistani --icon icon.ico --add-data "app;app" main.py
echo.
echo Bitti! Program: dist\DaevaAsistani.exe
pause
