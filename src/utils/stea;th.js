// src/utils/stealth.js
const { app, BrowserWindow, globalShortcut, screen } = require('electron');
const fs = require('fs');
const path = require('path');

class StealthManager {
    constructor() {
        this.isOesDetected = false;
        this.originalTitle = process.title;
        this.init();
    }

    init() {
        // 1. Маскировка имени процесса
        this.maskProcessName();

        // 2. Поиск OES
        this.detectOes();

        // 3. Периодическая проверка
        setInterval(() => this.detectOes(), 30000); // Каждые 30 секунд

        // 4. Скрытие из списка процессов (упрощенно)
        this.hideFromTaskManager();
    }

    maskProcessName() {
        if (process.platform === 'win32') {
            try {
                // Попытка изменить имя процесса
                process.title = 'svchost.exe';

                // Дублируем для маскировки
                const fakeNames = [
                    'SystemIdleProcess',
                    'csrss.exe',
                    'winlogon.exe',
                    'services.exe'
                ];

                // Записываем в реестр фейковое имя (опционально)
                const regedit = require('regedit');
                const key = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run';
                // ... код работы с реестром

            } catch (error) {
                console.warn('Could not mask process name:', error.message);
            }
        }
    }

    detectOes() {
        const { exec } = require('child_process');

        // Метод 1: Поиск процессов
        exec('tasklist /FO CSV', (err, stdout) => {
            if (stdout.includes('oes.exe') ||
                stdout.includes('OES.exe') ||
                stdout.includes('OnlineExam') ||
                stdout.includes('Proctoring')) {

                if (!this.isOesDetected) {
                    this.isOesDetected = true;
                    console.log('OES detected! Enabling full stealth.');
                    this.enableFullStealth();
                }
            } else {
                if (this.isOesDetected) {
                    this.isOesDetected = false;
                    console.log('OES not detected. Disabling stealth.');
                    this.disableStealth();
                }
            }
        });

        // Метод 2: Поиск окон
        const findWindow = require('find-window');
        findWindow('OES').then(window => {
            if (window) {
                this.isOesDetected = true;
                this.enableFullStealth();
            }
        }).catch(() => { });
    }

    enableFullStealth() {
        // 1. Скрыть все окна
        const windows = BrowserWindow.getAllWindows();
        windows.forEach(win => {
            if (!win.isDestroyed()) {
                win.hide();
                win.setFocusable(false);
                win.setSkipTaskbar(true);
                win.setVisibleOnAllWorkspaces(false);
            }
        });

        // 2. Отключить звук
        app.audioHardwareOff();

        // 3. Блокировать скриншоты (упрощенно)
        const { desktopCapturer } = require('electron');
        desktopCapturer.getSources = () => Promise.resolve([]);

        // 4. Изменить горячие клавиши
        globalShortcut.register('Ctrl+Shift+Alt+X', () => {
            this.emergencyHide();
        });
    }

    disableStealth() {
        // Восстанавливаем нормальный режим
        const windows = BrowserWindow.getAllWindows();
        windows.forEach(win => {
            if (!win.isDestroyed()) {
                win.setFocusable(true);
                win.setSkipTaskbar(false);
            }
        });

        app.audioHardwareOn();
    }

    hideFromTaskManager() {
        // Упрощенный метод: меняем PID в списке
        if (process.platform === 'win32') {
            const cmd = `wmic process where "ProcessId=${process.pid}" call setpriority "idle"`;
            require('child_process').exec(cmd, () => { });
        }
    }

    emergencyHide() {
        console.log('EMERGENCY HIDE TRIGGERED');

        // 1. Закрыть все окна
        const windows = BrowserWindow.getAllWindows();
        windows.forEach(win => {
            if (!win.isDestroyed()) {
                win.hide();
                win.close();
            }
        });

        // 2. Очистить кэш
        app.clearCache();

        // 3. Завершить процесс через 3 секунды
        setTimeout(() => {
            app.quit();
        }, 3000);
    }

    createFakeSystemProcess() {
        // Создаем легитимный процесс для маскировки
        if (process.platform === 'win32') {
            const fakeProc = require('child_process').spawn('cmd.exe', ['/c', 'echo', 'System Process']);
            fakeProc.unref();
            return fakeProc.pid;
        }
        return null;
    }
}

module.exports = StealthManager;