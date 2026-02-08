// ============================================
// MODIFIED FOR OES EVASION
// OES fighter - Stealth Edition
// ============================================

if (require('electron-squirrel-startup')) {
    process.exit(0);
}

const { app, BrowserWindow, shell, ipcMain, globalShortcut, desktopCapturer } = require('electron');
const { createWindow, updateGlobalShortcuts } = require('./utils/window');
const { setupGeminiIpcHandlers, stopMacOSAudioCapture, sendToRenderer } = require('./utils/ai-manager');
const storage = require('./storage');

const geminiSessionRef = { current: null };
let mainWindow = null;
let isOesDetected = false;
let stealthMode = false;
let emergencyHideTimer = null;

// Перехватываем все необработанные хоткеи
app.on('ready', () => {
    // Логируем все зарегистрированные хоткеи
    console.log('Available hotkeys:');
    console.log('- Ctrl+\\ : Toggle window visibility');
    console.log('- Ctrl+Shift+Alt+H : Emergency hide');
    console.log('- Ctrl+Shift+Alt+X : Emergency exit');
});

// ============ STEALTH FUNCTIONS ============
function initStealthMode() {
    console.log('Initializing stealth mode...');

    // 1. Маскировка имени процесса
    maskProcessName();

    // 2. Регулярная проверка на OES
    startOesDetection();

    // 3. Эмуляция системного процесса
    emulateSystemProcess();

    // 4. Регистрация аварийных хоткеев
    registerEmergencyHotkeys();

    // 5. Маскировка сетевых запросов
    setupRequestMasking();
}

function maskProcessName() {
    if (process.platform === 'win32') {
        try {
            // Изменяем имя процесса в памяти
            process.title = 'svchost.exe';
            console.log('Process masked as: svchost.exe');

            // Дополнительная маскировка через реестр
            const Registry = require('winreg');
            const regKey = new Registry({
                hive: Registry.HKCU,
                key: '\\Software\\Microsoft\\Windows\\CurrentVersion\\Run'
            });

            // Добавляем запуск с другим именем
            regKey.set('WindowsSystemMonitor', Registry.REG_SZ,
                `"${process.execPath}" --silent --service`,
                () => { });

        } catch (error) {
            console.warn('Could not fully mask process:', error.message);
        }
    }
}

function startOesDetection() {
    // Проверяем каждые 10 секунд
    setInterval(() => {
        checkForOes();
    }, 10000);

    // Первая проверка сразу
    setTimeout(() => checkForOes(), 2000);
}

function checkForOes() {
    const { exec } = require('child_process');

    // Метод 1: Проверка процессов
    exec('tasklist /FO CSV', (err, stdout) => {
        if (err) return;

        const oesProcesses = [
            'oes.exe', 'OES.exe', 'OnlineExam.exe', 'Proctoring.exe',
            'examguard.exe', 'respondus.exe', 'proctorio.exe', 'honorlock.exe'
        ];

        const found = oesProcesses.some(proc => stdout.toLowerCase().includes(proc.toLowerCase()));

        if (found && !isOesDetected) {
            console.log('⚠️ OES DETECTED! Enabling full stealth mode.');
            isOesDetected = true;
            enableFullStealth();
            notifyRenderer('oes-detected');
        } else if (!found && isOesDetected) {
            console.log('OES not detected. Disabling stealth.');
            isOesDetected = false;
            disableStealth();
            notifyRenderer('oes-cleared');
        }
    });

    // Метод 2: Проверка окон
    try {
        const { getWindows } = require('@nut-tree/nut-js');
        getWindows().then(windows => {
            const oesWindows = windows.filter(win =>
                win.title.includes('OES') ||
                win.title.includes('Online Exam') ||
                win.title.includes('Proctoring')
            );

            if (oesWindows.length > 0 && !stealthMode) {
                enableFullStealth();
            }
        });
    } catch (e) {
        // Библиотека не установлена, пропускаем
    }
}

function emulateSystemProcess() {
    if (process.platform === 'win32') {
        // Создаем фиктивный системный процесс для маскировки
        const { spawn } = require('child_process');

        // Запускаем легитимный системный процесс
        const systemProc = spawn('powershell.exe', [
            '-WindowStyle', 'Hidden',
            '-Command', 'Start-Sleep -Seconds 3600'
        ], {
            detached: true,
            stdio: 'ignore'
        });

        systemProc.unref();
        console.log('System process emulation started');
    }
}

function registerEmergencyHotkeys() {
    // ============ ОСНОВНЫЕ ХОТКЕИ ============

    // 1. Ctrl+\ - Основное переключение видимости (ВАША КЛАВИША)
    try {
        globalShortcut.register('Ctrl+\\', () => {
            console.log('📱 Main toggle: Ctrl+\\ pressed');
            if (mainWindow && !mainWindow.isDestroyed()) {
                if (mainWindow.isVisible()) {
                    mainWindow.hide();
                    console.log('Window hidden via Ctrl+\\');
                    notifyRenderer('window-hidden');
                } else {
                    // В режиме стелса показываем только если OES не обнаружен
                    if (!isOesDetected || !stealthMode) {
                        mainWindow.showInactive();
                        console.log('Window shown via Ctrl+\\');
                        notifyRenderer('window-shown');
                    } else {
                        console.log('Cannot show window: OES detected in stealth mode');
                    }
                }
            }
        });
        console.log('✅ Registered main toggle: Ctrl+\\');
    } catch (error) {
        console.error('Failed to register Ctrl+\\:', error.message);
    }

    // 2. Ctrl+Shift+\ - Альтернативное переключение (на случай конфликтов)
    try {
        globalShortcut.register('Ctrl+Shift+\\', () => {
            console.log('🔧 Alternative toggle: Ctrl+Shift+\\');
            if (mainWindow && !mainWindow.isDestroyed()) {
                if (mainWindow.isVisible()) {
                    mainWindow.hide();
                } else {
                    if (!isOesDetected) {
                        mainWindow.showInactive();
                    }
                }
            }
        });
    } catch (error) {
        // Игнорируем если не удалось зарегистрировать
    }

    // ============ АВАРИЙНЫЕ ХОТКЕИ ============

    // 3. Ctrl+Shift+Alt+H - Аварийное скрытие (глубокое скрытие)
    try {
        globalShortcut.register('Ctrl+Shift+Alt+H', () => {
            console.log('🚨 EMERGENCY HIDE: Ctrl+Shift+Alt+H');
            emergencyHide();
        });
        console.log('✅ Registered emergency hide: Ctrl+Shift+Alt+H');
    } catch (error) {
        console.error('Failed to register emergency hide:', error.message);
    }

    // 4. Ctrl+Shift+Alt+X - Аварийный выход
    try {
        globalShortcut.register('Ctrl+Shift+Alt+X', () => {
            console.log('🚨 EMERGENCY EXIT: Ctrl+Shift+Alt+X');
            emergencyExit();
        });
    } catch (error) {
        console.error('Failed to register emergency exit:', error.message);
    }

    // ============ ДОПОЛНИТЕЛЬНЫЕ ФУНКЦИИ ============

    // 5. Ctrl+Shift+Alt+O - Проверка статуса OES
    try {
        globalShortcut.register('Ctrl+Shift+Alt+O', () => {
            console.log('🔍 Checking OES status...');
            checkForOes();
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('stealth-status', {
                    oesDetected: isOesDetected,
                    stealthMode: stealthMode,
                    time: new Date().toLocaleTimeString()
                });
            }
        });
    } catch (error) {
        // Игнорируем
    }

    console.log('✅ All hotkeys registered successfully');
}

function setupRequestMasking() {
    // Маскируем User-Agent и заголовки
    app.on('ready', () => {
        const { session } = require('electron');

        session.defaultSession.webRequest.onBeforeSendHeaders((details, callback) => {
            // Маскируем под Chrome
            details.requestHeaders['User-Agent'] =
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0';

            // Добавляем реферы Microsoft
            details.requestHeaders['Referer'] = 'https://www.microsoft.com/';
            details.requestHeaders['Origin'] = 'https://www.microsoft.com';

            // Маскируем под легитимные запросы
            if (details.url.includes('googleapis.com')) {
                details.requestHeaders['X-Goog-Api-Key'] = 'dummy-key-for-masking';
                details.url = details.url.replace('v1beta', 'v1');
            }

            callback({ requestHeaders: details.requestHeaders });
        });

        // Блокируем известные OES домены
        const blockList = [
            '*://*.oes-monitor.com/*',
            '*://*.proctoring-api.com/*',
            '*://*.examsecurity.com/*'
        ];

        session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
            const isBlocked = blockList.some(pattern => {
                const regex = new RegExp(pattern.replace('*', '.*'));
                return regex.test(details.url);
            });

            if (isBlocked) {
                console.log(`Blocked OES request: ${details.url}`);
                callback({ cancel: true });
            } else {
                callback({});
            }
        });
    });
}

function enableFullStealth() {
    if (stealthMode) return;

    console.log('Enabling FULL STEALTH MODE');
    stealthMode = true;

    // 1. Скрыть окно и отключить Ctrl+\
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.hide();

        // Отключаем основную клавишу в режиме стелса
        try {
            globalShortcut.unregister('Ctrl+\\');
            console.log('Main toggle (Ctrl+\\) disabled in stealth mode');
        } catch (error) { }
    }
}

function disableStealth() {
    if (!stealthMode) return;

    console.log('Disabling stealth mode');
    stealthMode = false;

    // Восстанавливаем Ctrl+\ когда стелс отключен
    if (mainWindow && !mainWindow.isDestroyed()) {
        try {
            globalShortcut.register('Ctrl+\\', () => {
                if (mainWindow && !mainWindow.isDestroyed()) {
                    if (mainWindow.isVisible()) {
                        mainWindow.hide();
                    } else {
                        mainWindow.showInactive();
                    }
                }
            });
            console.log('Main toggle (Ctrl+\\) re-enabled');
        } catch (error) { }
    }
}

function emergencyHide() {
    console.log('🚨 EXECUTING EMERGENCY HIDE PROTOCOL');

    // 1. Мгновенно скрыть окно
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.hide();
        mainWindow.setOpacity(0.001);
        mainWindow.setFocusable(false);

        // Изменить заголовок окна
        mainWindow.setTitle('Windows Defender Update');
    }

    // 2. Очистить все данные
    try {
        storage.clearAllData();
        console.log('All data cleared');
    } catch (e) { }

    // 3. Закрыть все сессии
    if (geminiSessionRef.current) {
        geminiSessionRef.current.close();
        geminiSessionRef.current = null;
    }

    // 4. Уведомить рендерер
    sendToRenderer('emergency-hide-executed');

    // 5. Показать через 2 минуты если не было команды на выход
    if (emergencyHideTimer) clearTimeout(emergencyHideTimer);
    emergencyHideTimer = setTimeout(() => {
        if (mainWindow && !mainWindow.isDestroyed() && !isOesDetected) {
            mainWindow.setOpacity(1.0);
            mainWindow.setFocusable(true);
            mainWindow.showInactive();
            console.log('Emergency hide ended');
        }
    }, 120000);
}

function emergencyExit() {
    console.log('🚨 EXECUTING EMERGENCY EXIT PROTOCOL');

    // 1. Скрыть и очистить
    emergencyHide();

    // 2. Полностью закрыть приложение через 3 секунды
    setTimeout(() => {
        console.log('Force quitting application...');

        // Убиваем процесс без сохранения
        process.exit(0);
    }, 3000);
}

function notifyRenderer(event) {
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('stealth-event', event);
    }
}

// ============ MAIN WINDOW CREATION ============
function createMainWindow() {
    // Создаем окно в скрытом режиме если OES обнаружен
    const shouldShow = !isOesDetected;

    mainWindow = createWindow(sendToRenderer, geminiSessionRef);
    
    if (mainWindow && !mainWindow.isDestroyed()) {
        // Показать окно если OES не обнаружен
        if (!isOesDetected) {
            mainWindow.show();
            console.log('Window shown on startup');
        } else {
            console.log('Window hidden on startup (OES detected)');
        }
    }

    // Дополнительные настройки скрытности
    if (mainWindow) {
        // Скрыть из Alt+Tab
        mainWindow.setFocusable(shouldShow);
        mainWindow.setEnabled(shouldShow);

        // Маскировать под системное окно
        mainWindow.setTitle('Windows System Diagnostics');

        // Скрыть при потере фокуса
        mainWindow.on('blur', () => {
            if (isOesDetected && mainWindow.isVisible()) {
                setTimeout(() => mainWindow.hide(), 500);
            }
        });

        // Перехват закрытия
        mainWindow.on('close', (e) => {
            if (isOesDetected) {
                e.preventDefault();
                mainWindow.hide();
                console.log('Window close prevented (stealth mode)');
            }
        });
    }

    return mainWindow;
}

// ============ APP INITIALIZATION ============
app.whenReady().then(async () => {
    console.log('🚀 Starting OES-fighter v1 (Multi-AI Edition)...');

    // Initialize storage
    storage.initializeStorage();

    // Initialize stealth mode
    initStealthMode();

    // Create main window
    createMainWindow();

    // Setup all IPC handlers
    setupStorageIpcHandlers();           // Storage management
    setupAIProvidersIpcHandlers();       // AI providers
    setupStealthIpcHandlers();           // Stealth mode
    setupGeneralIpcHandlers();           // General functions

    console.log('✅ Application ready with multi-AI support');
});

// ============ APP EVENTS ============
app.on('window-all-closed', () => {
    stopMacOSAudioCapture();
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('before-quit', () => {
    stopMacOSAudioCapture();
    // Очищаем все хоткеи
    globalShortcut.unregisterAll();
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0 && !isOesDetected) {
        createMainWindow();
    }
});

// ============ STEALTH IPC HANDLERS ============
function setupStealthIpcHandlers() {
    ipcMain.handle('stealth:get-status', async () => {
        return {
            isOesDetected,
            stealthMode,
            processTitle: process.title,
            timestamp: new Date().toISOString()
        };
    });

    ipcMain.handle('stealth:enable', async () => {
        enableFullStealth();
        return { success: true };
    });

    ipcMain.handle('stealth:disable', async () => {
        disableStealth();
        return { success: true };
    });

    ipcMain.handle('stealth:emergency-hide', async () => {
        emergencyHide();
        return { success: true };
    });

    ipcMain.handle('stealth:check-oes', async () => {
        checkForOes();
        return {
            detected: isOesDetected,
            recommendation: isOesDetected ?
                'Use emergency hide (Ctrl+Shift+Alt+H)' :
                'Normal mode is safe'
        };
    });

    ipcMain.handle('stealth:simulate-system', async () => {
        emulateSystemProcess();
        return { success: true };
    });
}

// ============ STORAGE IPC HANDLERS ============
function setupStorageIpcHandlers() {
    // ============ CONFIG ============
    ipcMain.handle('storage:get-config', async () => {
        try {
            return { success: true, data: storage.getConfig() };
        } catch (error) {
            console.error('Error getting config:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('storage:set-config', async (event, config) => {
        try {
            storage.setConfig(config);
            return { success: true };
        } catch (error) {
            console.error('Error setting config:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('storage:update-config', async (event, key, value) => {
        try {
            storage.updateConfig(key, value);
            return { success: true };
        } catch (error) {
            console.error('Error updating config:', error);
            return { success: false, error: error.message };
        }
    });

    // ============ CREDENTIALS ============
    ipcMain.handle('storage:get-credentials', async () => {
        try {
            const creds = storage.getCredentials();
            return { success: true, data: creds };
        } catch (error) {
            console.error('Error getting credentials:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('storage:set-credentials', async (event, credentials) => {
        try {
            storage.setCredentials(credentials);
            return { success: true };
        } catch (error) {
            console.error('Error setting credentials:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('storage:update-all-api-keys', async (event, keys) => {
        try {
            storage.updateAllApiKeys(keys);
            return { success: true };
        } catch (error) {
            console.error('Error updating API keys:', error);
            return { success: false, error: error.message };
        }
    });

    // ============ INDIVIDUAL API KEYS ============

    // Gemini
    ipcMain.handle('storage:get-gemini-api-key', async () => {
        try {
            return { success: true, data: storage.getGeminiApiKey() };
        } catch (error) {
            console.error('Error getting Gemini API key:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('storage:set-gemini-api-key', async (event, apiKey) => {
        try {
            storage.setGeminiApiKey(apiKey);
            return { success: true };
        } catch (error) {
            console.error('Error setting Gemini API key:', error);
            return { success: false, error: error.message };
        }
    });

    // Groq
    ipcMain.handle('storage:get-groq-api-key', async () => {
        try {
            return { success: true, data: storage.getGroqApiKey() };
        } catch (error) {
            console.error('Error getting Groq API key:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('storage:set-groq-api-key', async (event, apiKey) => {
        try {
            storage.setGroqApiKey(apiKey);
            return { success: true };
        } catch (error) {
            console.error('Error setting Groq API key:', error);
            return { success: false, error: error.message };
        }
    });

    // DeepSeek
    ipcMain.handle('storage:get-deepseek-api-key', async () => {
        try {
            return { success: true, data: storage.getDeepSeekApiKey() };
        } catch (error) {
            console.error('Error getting DeepSeek API key:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('storage:set-deepseek-api-key', async (event, apiKey) => {
        try {
            storage.setDeepSeekApiKey(apiKey);
            return { success: true };
        } catch (error) {
            console.error('Error setting DeepSeek API key:', error);
            return { success: false, error: error.message };
        }
    });

    // OpenRouter
    ipcMain.handle('storage:get-openrouter-api-key', async () => {
        try {
            return { success: true, data: storage.getOpenRouterApiKey() };
        } catch (error) {
            console.error('Error getting OpenRouter API key:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('storage:set-openrouter-api-key', async (event, apiKey) => {
        try {
            storage.setOpenRouterApiKey(apiKey);
            return { success: true };
        } catch (error) {
            console.error('Error setting OpenRouter API key:', error);
            return { success: false, error: error.message };
        }
    });

    // OpenAI
    ipcMain.handle('storage:get-openai-api-key', async () => {
        try {
            return { success: true, data: storage.getOpenAIKey() };
        } catch (error) {
            console.error('Error getting OpenAI API key:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('storage:set-openai-api-key', async (event, apiKey) => {
        try {
            storage.setOpenAIKey(apiKey);
            return { success: true };
        } catch (error) {
            console.error('Error setting OpenAI API key:', error);
            return { success: false, error: error.message };
        }
    });

    // Anthropic
    ipcMain.handle('storage:get-anthropic-api-key', async () => {
        try {
            return { success: true, data: storage.getAnthropicKey() };
        } catch (error) {
            console.error('Error getting Anthropic API key:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('storage:set-anthropic-api-key', async (event, apiKey) => {
        try {
            storage.setAnthropicKey(apiKey);
            return { success: true };
        } catch (error) {
            console.error('Error setting Anthropic API key:', error);
            return { success: false, error: error.message };
        }
    });

    // Cohere
    ipcMain.handle('storage:get-cohere-api-key', async () => {
        try {
            return { success: true, data: storage.getCohereKey() };
        } catch (error) {
            console.error('Error getting Cohere API key:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('storage:set-cohere-api-key', async (event, apiKey) => {
        try {
            storage.setCohereKey(apiKey);
            return { success: true };
        } catch (error) {
            console.error('Error setting Cohere API key:', error);
            return { success: false, error: error.message };
        }
    });

    // Ollama
    ipcMain.handle('storage:get-ollama-url', async () => {
        try {
            return { success: true, data: storage.getOllamaUrl() };
        } catch (error) {
            console.error('Error getting Ollama URL:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('storage:set-ollama-url', async (event, url) => {
        try {
            storage.setOllamaUrl(url);
            return { success: true };
        } catch (error) {
            console.error('Error setting Ollama URL:', error);
            return { success: false, error: error.message };
        }
    });

    // Custom API
    ipcMain.handle('storage:get-custom-api-url', async () => {
        try {
            return { success: true, data: storage.getCustomApiUrl() };
        } catch (error) {
            console.error('Error getting custom API URL:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('storage:set-custom-api-url', async (event, url) => {
        try {
            storage.setCustomApiUrl(url);
            return { success: true };
        } catch (error) {
            console.error('Error setting custom API URL:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('storage:get-custom-api-key', async () => {
        try {
            return { success: true, data: storage.getCustomApiKey() };
        } catch (error) {
            console.error('Error getting custom API key:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('storage:set-custom-api-key', async (event, apiKey) => {
        try {
            storage.setCustomApiKey(apiKey);
            return { success: true };
        } catch (error) {
            console.error('Error setting custom API key:', error);
            return { success: false, error: error.message };
        }
    });

    // ============ AI PROVIDER SETTINGS ============
    ipcMain.handle('storage:get-ai-provider', async () => {
        try {
            return { success: true, data: storage.getAIProvider() };
        } catch (error) {
            console.error('Error getting AI provider:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('storage:set-ai-provider', async (event, provider) => {
        try {
            storage.setAIProvider(provider);
            return { success: true };
        } catch (error) {
            console.error('Error setting AI provider:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('storage:get-preferred-model', async () => {
        try {
            return { success: true, data: storage.getPreferredModel() };
        } catch (error) {
            console.error('Error getting preferred model:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('storage:set-preferred-model', async (event, model) => {
        try {
            storage.setPreferredModel(model);
            return { success: true };
        } catch (error) {
            console.error('Error setting preferred model:', error);
            return { success: false, error: error.message };
        }
    });

    // ============ PREFERENCES ============
    ipcMain.handle('storage:get-preferences', async () => {
        try {
            return { success: true, data: storage.getPreferences() };
        } catch (error) {
            console.error('Error getting preferences:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('storage:set-preferences', async (event, preferences) => {
        try {
            storage.setPreferences(preferences);
            return { success: true };
        } catch (error) {
            console.error('Error setting preferences:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('storage:update-preference', async (event, key, value) => {
        try {
            storage.updatePreference(key, value);
            return { success: true };
        } catch (error) {
            console.error('Error updating preference:', error);
            return { success: false, error: error.message };
        }
    });

    // ============ KEYBINDS ============
    ipcMain.handle('storage:get-keybinds', async () => {
        try {
            return { success: true, data: storage.getKeybinds() };
        } catch (error) {
            console.error('Error getting keybinds:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('storage:set-keybinds', async (event, keybinds) => {
        try {
            storage.setKeybinds(keybinds);
            return { success: true };
        } catch (error) {
            console.error('Error setting keybinds:', error);
            return { success: false, error: error.message };
        }
    });

    // ============ MODELS MANAGEMENT ============
    ipcMain.handle('storage:get-models', async () => {
        try {
            return { success: true, data: storage.getModels() };
        } catch (error) {
            console.error('Error getting models:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('storage:get-available-models', async (event, provider) => {
        try {
            return { success: true, data: storage.getAvailableModels(provider) };
        } catch (error) {
            console.error('Error getting available models:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('storage:add-custom-model', async (event, provider, model) => {
        try {
            storage.addCustomModel(provider, model);
            return { success: true };
        } catch (error) {
            console.error('Error adding custom model:', error);
            return { success: false, error: error.message };
        }
    });

    // ============ RATE LIMITS & USAGE ============
    ipcMain.handle('storage:get-limits', async () => {
        try {
            return { success: true, data: storage.getLimits() };
        } catch (error) {
            console.error('Error getting limits:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('storage:get-today-limits', async () => {
        try {
            return { success: true, data: storage.getTodayLimits() };
        } catch (error) {
            console.error('Error getting today limits:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('storage:get-provider-limits', async (event, provider) => {
        try {
            const limits = storage.checkProviderLimit(provider);
            const providerLimit = storage.getProviderLimit(provider);
            return {
                success: true,
                data: {
                    current: limits,
                    dailyLimit: providerLimit.daily,
                    monthlyLimit: providerLimit.monthly
                }
            };
        } catch (error) {
            console.error('Error getting provider limits:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('storage:increment-usage', async (event, provider, model, tokens) => {
        try {
            storage.incrementUsage(provider, model, tokens);
            return { success: true };
        } catch (error) {
            console.error('Error incrementing usage:', error);
            return { success: false, error: error.message };
        }
    });

    // ============ CACHE MANAGEMENT ============
    ipcMain.handle('storage:get-from-cache', async (event, prompt, provider, model) => {
        try {
            const cached = storage.getFromCache(prompt, provider, model);
            return { success: true, data: cached };
        } catch (error) {
            console.error('Error getting from cache:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('storage:save-to-cache', async (event, prompt, provider, model, response) => {
        try {
            storage.saveToCache(prompt, provider, model, response);
            return { success: true };
        } catch (error) {
            console.error('Error saving to cache:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('storage:clear-cache', async () => {
        try {
            storage.clearCache();
            return { success: true };
        } catch (error) {
            console.error('Error clearing cache:', error);
            return { success: false, error: error.message };
        }
    });

    // ============ SESSION HISTORY ============
    ipcMain.handle('storage:get-all-sessions', async () => {
        try {
            return { success: true, data: storage.getAllSessions() };
        } catch (error) {
            console.error('Error getting sessions:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('storage:get-session', async (event, sessionId) => {
        try {
            return { success: true, data: storage.getSession(sessionId) };
        } catch (error) {
            console.error('Error getting session:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('storage:save-session', async (event, sessionId, data) => {
        try {
            storage.saveSession(sessionId, data);
            return { success: true };
        } catch (error) {
            console.error('Error saving session:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('storage:delete-session', async (event, sessionId) => {
        try {
            storage.deleteSession(sessionId);
            return { success: true };
        } catch (error) {
            console.error('Error deleting session:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('storage:delete-all-sessions', async () => {
        try {
            storage.deleteAllSessions();
            return { success: true };
        } catch (error) {
            console.error('Error deleting all sessions:', error);
            return { success: false, error: error.message };
        }
    });

    // ============ SCREENSHOTS ============
    ipcMain.handle('storage:save-screenshot', async (event, filename, buffer) => {
        try {
            const path = storage.saveScreenshot(filename, buffer);
            return { success: !!path, data: path };
        } catch (error) {
            console.error('Error saving screenshot:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('storage:list-screenshots', async (event, limit) => {
        try {
            const screenshots = storage.listScreenshots(limit);
            return { success: true, data: screenshots };
        } catch (error) {
            console.error('Error listing screenshots:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('storage:cleanup-screenshots', async (event, maxAgeHours) => {
        try {
            const deleted = storage.cleanupScreenshots(maxAgeHours || 24);
            return { success: true, data: deleted };
        } catch (error) {
            console.error('Error cleaning up screenshots:', error);
            return { success: false, error: error.message };
        }
    });

    // ============ LOGGING ============
    ipcMain.handle('storage:log-event', async (event, eventName, data) => {
        try {
            storage.logEvent(eventName, data);
            return { success: true };
        } catch (error) {
            console.error('Error logging event:', error);
            return { success: false, error: error.message };
        }
    });

    // ============ BACKUP & RESTORE ============
    ipcMain.handle('storage:create-backup', async () => {
        try {
            const backupPath = storage.createBackup();
            return { success: !!backupPath, data: backupPath };
        } catch (error) {
            console.error('Error creating backup:', error);
            return { success: false, error: error.message };
        }
    });

    // ============ UTILITIES ============
    ipcMain.handle('storage:get-config-dir', async () => {
        try {
            return { success: true, data: storage.getConfigDir() };
        } catch (error) {
            console.error('Error getting config dir:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('storage:get-cache-dir', async () => {
        try {
            return { success: true, data: storage.getCacheDir() };
        } catch (error) {
            console.error('Error getting cache dir:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('storage:get-screenshots-dir', async () => {
        try {
            return { success: true, data: storage.getScreenshotsDir() };
        } catch (error) {
            console.error('Error getting screenshots dir:', error);
            return { success: false, error: error.message };
        }
    });

    // ============ CLEAR ALL DATA ============
    ipcMain.handle('storage:clear-all', async () => {
        try {
            storage.clearAllData();
            return { success: true };
        } catch (error) {
            console.error('Error clearing all data:', error);
            return { success: false, error: error.message };
        }
    });
}

// ============ GENERAL IPC HANDLERS ============
function setupGeneralIpcHandlers() {
    ipcMain.handle('get-app-version', async () => {
        return app.getVersion();
    });

    ipcMain.handle('quit-application', async event => {
        try {
            stopMacOSAudioCapture();
            app.quit();
            return { success: true };
        } catch (error) {
            console.error('Error quitting application:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('open-external', async (event, url) => {
        try {
            await shell.openExternal(url);
            return { success: true };
        } catch (error) {
            console.error('Error opening external URL:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.on('update-keybinds', (event, newKeybinds) => {
        if (mainWindow) {
            // Also save to storage
            storage.setKeybinds(newKeybinds);
            updateGlobalShortcuts(newKeybinds, mainWindow, sendToRenderer, geminiSessionRef);
        }
    });

    // Debug logging from renderer
    ipcMain.on('log-message', (event, msg) => {
        console.log(msg);
    });
}

// ============ AI PROVIDERS IPC HANDLERS ============
function setupAIProvidersIpcHandlers() {
    const aiManager = require('./utils/ai-manager');

    // Test all providers
    ipcMain.handle('ai:test-providers', async () => {
        try {
            const results = await aiManager.testAllProviders();
            return { success: true, data: results };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    // Get available providers
    ipcMain.handle('ai:get-providers', async () => {
        try {
            const providers = aiManager.getAvailableProviders();
            const info = providers.map(p => aiManager.getProviderInfo(p));
            return { success: true, data: info };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    // Process with AI
    ipcMain.handle('ai:process', async (event, { prompt, options = {} }) => {
        try {
            const result = await aiManager.process(prompt, options);
            return { success: true, data: result };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    // Analyze screenshot
    ipcMain.handle('ai:analyze-screenshot', async (event, { imageBase64, question = "Что изображено?" }) => {
        try {
            const result = await aiManager.analyzeScreenshot(imageBase64, question);
            return { success: true, data: result };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    // Get provider info
    ipcMain.handle('ai:get-provider-info', async (event, provider) => {
        try {
            const info = aiManager.getProviderInfo(provider);
            return { success: true, data: info };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    // Quick test single provider
    ipcMain.handle('ai:test-provider', async (event, provider) => {
        try {
            const result = await aiManager.testProvider(provider);
            return { success: true, data: result };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    // Get current provider status
    ipcMain.handle('ai:get-current-status', async () => {
        try {
            const provider = storage.getAIProvider();
            const info = aiManager.getProviderInfo(provider);
            const limits = storage.checkProviderLimit(provider);
            const todayLimits = storage.getTodayLimits();

            return {
                success: true,
                data: {
                    provider: info,
                    limits: limits,
                    today: todayLimits
                }
            };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });
}

// Экспортируем для тестирования
module.exports = {
    isOesDetected,
    stealthMode,
    emergencyHide,
    checkForOes
};