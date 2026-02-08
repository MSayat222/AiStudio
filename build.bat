@echo off
echo Building Studio Helper...
echo.

REM Clean old build
if exist "out" rmdir /s /q out
if exist "dist" rmdir /s /q dist

REM Install fresh
call npm install

REM Build
call npm run make

if exist "out" (
    echo Build successful! Check "out" folder.
    dir out /b
) else (
    echo Build failed. Try: npx electron-forge make
)

pause