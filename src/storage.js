const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

// ============================================
// CONFIGURATION CONSTANTS
// ============================================

const CONFIG_VERSION = 2; // Updated for multi-provider support
const ENCRYPTION_KEY = 'cheating-daddy-secure-storage-2024'; // In production, use env variable

// Default values
const DEFAULT_CONFIG = {
    configVersion: CONFIG_VERSION,
    onboarded: false,
    layout: 'normal',
    firstRun: true,
    lastUpdateCheck: 0,
    analyticsEnabled: false
};

const DEFAULT_CREDENTIALS = {
    // Gemini API
    geminiApiKey: '',
    // Groq API
    groqApiKey: '',
    // DeepSeek API
    deepSeekApiKey: '',
    // OpenRouter API
    openRouterApiKey: '',
    // OpenAI API
    openaiApiKey: '',
    // Anthropic Claude
    anthropicApiKey: '',
    // Cohere API
    cohereApiKey: '',
    // Local Ollama
    ollamaUrl: 'http://localhost:11434',
    // Custom endpoints
    customApiUrl: '',
    customApiKey: ''
};

const DEFAULT_PREFERENCES = {
    // AI Provider
    aiProvider: 'auto', // auto, gemini, groq, deepseek, openrouter, local
    preferredModel: 'auto', // auto-select based on availability

    // Interface
    customPrompt: '',
    selectedProfile: 'interview',
    selectedLanguage: 'en-US',
    selectedScreenshotInterval: '5',
    selectedImageQuality: 'medium',
    advancedMode: false,
    audioMode: 'speaker_only',
    fontSize: 'medium',
    backgroundTransparency: 0.8,
    theme: 'dark',

    // Features
    googleSearchEnabled: false,
    autoHideEnabled: true,
    stealthModeEnabled: true,
    screenshotCompression: true,

    // Performance
    cacheResponses: true,
    maxCacheSize: 100,
    responseTimeout: 30000
};

const DEFAULT_KEYBINDS = null; // null means use system defaults

const DEFAULT_LIMITS = {
    data: [],
    // Rate limits per provider (free tier)
    providerLimits: {
        gemini: { daily: 60, monthly: 2000, resetTime: '00:00' },
        groq: { daily: 10000, monthly: 300000, resetTime: '00:00' },
        deepseek: { daily: 50, monthly: 1500, resetTime: '00:00' },
        openrouter: { daily: 100, monthly: 3000, resetTime: '00:00' }
    }
};

const DEFAULT_MODELS = {
    gemini: [
        { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', context: 1_000_000, free: true },
        { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash', context: 1_000_000, free: true },
        { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro', context: 1_000_000, free: false }
    ],
    groq: [
        { id: 'mixtral-8x7b-32768', name: 'Mixtral 8x7B', context: 32768, free: true },
        { id: 'llama-3.1-70b-versatile', name: 'Llama 3.1 70B', context: 128000, free: true },
        { id: 'llama-3.2-3b-preview', name: 'Llama 3.2 3B', context: 128000, free: true }
    ],
    deepseek: [
        { id: 'deepseek-chat', name: 'DeepSeek Chat', context: 128000, free: true },
        { id: 'deepseek-coder', name: 'DeepSeek Coder', context: 128000, free: true },
        { id: 'deepseek-reasoner', name: 'DeepSeek Reasoner', context: 128000, free: true }
    ],
    openrouter: [
        { id: 'openai/gpt-4o-mini', name: 'GPT-4o Mini', context: 128000, free: false },
        { id: 'meta-llama/llama-3.1-70b-instruct', name: 'Llama 3.1 70B', context: 128000, free: true },
        { id: 'google/gemini-2.0-flash-exp', name: 'Gemini 2.0 Flash', context: 1000000, free: true }
    ],
    local: [
        { id: 'llama3.2', name: 'Llama 3.2', context: 8192, free: true },
        { id: 'mistral', name: 'Mistral', context: 8192, free: true },
        { id: 'codellama', name: 'CodeLlama', context: 16384, free: true }
    ]
};

// ============================================
// ENCRYPTION UTILITIES
// ============================================

function encrypt(text) {
    if (!text) return text;
    try {
        const cipher = crypto.createCipher('aes-256-cbc', ENCRYPTION_KEY);
        let encrypted = cipher.update(text, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        return encrypted;
    } catch (error) {
        console.warn('Encryption failed:', error.message);
        return text; // Fallback to plain text
    }
}

function decrypt(text) {
    if (!text || !text.includes(':')) return text; // Not encrypted
    try {
        const decipher = crypto.createDecipher('aes-256-cbc', ENCRYPTION_KEY);
        let decrypted = decipher.update(text, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    } catch (error) {
        console.warn('Decryption failed:', error.message);
        return text;
    }
}

// ============================================
// PATH MANAGEMENT
// ============================================

function getConfigDir() {
    const platform = os.platform();
    let configDir;

    if (platform === 'win32') {
        configDir = path.join(os.homedir(), 'AppData', 'Roaming', 'OES-Fighter');
    } else if (platform === 'darwin') {
        configDir = path.join(os.homedir(), 'Library', 'Application Support', 'OES-Fighter');
    } else {
        configDir = path.join(os.homedir(), '.oes-fighter');
    }

    return configDir;
}

// File paths
function getConfigPath() {
    return path.join(getConfigDir(), 'config.json');
}

function getCredentialsPath() {
    return path.join(getConfigDir(), 'credentials.enc');
}

function getPreferencesPath() {
    return path.join(getConfigDir(), 'preferences.json');
}

function getKeybindsPath() {
    return path.join(getConfigDir(), 'keybinds.json');
}

function getLimitsPath() {
    return path.join(getConfigDir(), 'limits.json');
}

function getModelsPath() {
    return path.join(getConfigDir(), 'models.json');
}

function getCacheDir() {
    const cacheDir = path.join(getConfigDir(), 'cache');
    if (!fs.existsSync(cacheDir)) {
        fs.mkdirSync(cacheDir, { recursive: true });
    }
    return cacheDir;
}

function getLogsDir() {
    const logsDir = path.join(getConfigDir(), 'logs');
    if (!fs.existsSync(logsDir)) {
        fs.mkdirSync(logsDir, { recursive: true });
    }
    return logsDir;
}

function getScreenshotsDir() {
    const screenshotsDir = path.join(getConfigDir(), 'screenshots');
    if (!fs.existsSync(screenshotsDir)) {
        fs.mkdirSync(screenshotsDir, { recursive: true });
    }
    return screenshotsDir;
}

// ============================================
// FILE UTILITIES
// ============================================

function readJsonFile(filePath, defaultValue) {
    try {
        if (fs.existsSync(filePath)) {
            const data = fs.readFileSync(filePath, 'utf8');
            return JSON.parse(data);
        }
    } catch (error) {
        console.warn(`Error reading ${filePath}:`, error.message);
    }
    return defaultValue;
}

function writeJsonFile(filePath, data) {
    try {
        const dir = path.dirname(filePath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
        return true;
    } catch (error) {
        console.error(`Error writing ${filePath}:`, error.message);
        return false;
    }
}

function readEncryptedFile(filePath, defaultValue) {
    try {
        if (fs.existsSync(filePath)) {
            const encrypted = fs.readFileSync(filePath, 'utf8');
            const decrypted = decrypt(encrypted);
            return JSON.parse(decrypted);
        }
    } catch (error) {
        console.warn(`Error reading encrypted ${filePath}:`, error.message);
    }
    return defaultValue;
}

function writeEncryptedFile(filePath, data) {
    try {
        const dir = path.dirname(filePath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        const encrypted = encrypt(JSON.stringify(data));
        fs.writeFileSync(filePath, encrypted, 'utf8');
        return true;
    } catch (error) {
        console.error(`Error writing encrypted ${filePath}:`, error.message);
        return false;
    }
}

// ============================================
// INITIALIZATION
// ============================================

function needsReset() {
    const configPath = getConfigPath();
    if (!fs.existsSync(configPath)) {
        return true;
    }

    try {
        const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        return !config.configVersion || config.configVersion < CONFIG_VERSION;
    } catch {
        return true;
    }
}

function resetConfigDir() {
    const configDir = getConfigDir();

    console.log('Initializing storage with multi-AI support...');

    // Remove existing directory if it exists
    if (fs.existsSync(configDir)) {
        try {
            fs.rmSync(configDir, { recursive: true, force: true });
        } catch (error) {
            console.warn('Could not remove config dir:', error.message);
        }
    }

    // Create fresh directory structure
    fs.mkdirSync(configDir, { recursive: true });
    getCacheDir();
    getLogsDir();
    getScreenshotsDir();

    // Initialize with defaults
    writeJsonFile(getConfigPath(), DEFAULT_CONFIG);
    writeEncryptedFile(getCredentialsPath(), DEFAULT_CREDENTIALS);
    writeJsonFile(getPreferencesPath(), DEFAULT_PREFERENCES);
    writeJsonFile(getModelsPath(), DEFAULT_MODELS);
    writeJsonFile(getLimitsPath(), DEFAULT_LIMITS);

    console.log('Storage initialized successfully');
}

function initializeStorage() {
    if (needsReset()) {
        resetConfigDir();
    } else {
        // Ensure all directories exist
        getCacheDir();
        getLogsDir();
        getScreenshotsDir();
    }
}

// ============================================
// CONFIG MANAGEMENT
// ============================================

function getConfig() {
    return readJsonFile(getConfigPath(), DEFAULT_CONFIG);
}

function setConfig(config) {
    const current = getConfig();
    const updated = { ...current, ...config, configVersion: CONFIG_VERSION };
    return writeJsonFile(getConfigPath(), updated);
}

function updateConfig(key, value) {
    const config = getConfig();
    config[key] = value;
    return writeJsonFile(getConfigPath(), config);
}

// ============================================
// CREDENTIALS MANAGEMENT (ENCRYPTED)
// ============================================

function getCredentials() {
    const creds = readEncryptedFile(getCredentialsPath(), DEFAULT_CREDENTIALS);

    // Migration: ensure all fields exist
    return { ...DEFAULT_CREDENTIALS, ...creds };
}

function setCredentials(credentials) {
    const current = getCredentials();
    const updated = { ...current, ...credentials };
    return writeEncryptedFile(getCredentialsPath(), updated);
}

// Individual API key getters/setters
function getApiKey() {
    return getCredentials().geminiApiKey || '';
}

function setApiKey(apiKey) {
    return setCredentials({ geminiApiKey: apiKey });
}

function getGeminiApiKey() {
    return getCredentials().geminiApiKey || '';
}

function setGeminiApiKey(apiKey) {
    return setCredentials({ geminiApiKey: apiKey });
}

function getGroqApiKey() {
    return getCredentials().groqApiKey || '';
}

function setGroqApiKey(apiKey) {
    return setCredentials({ groqApiKey: apiKey });
}

function getDeepSeekApiKey() {
    return getCredentials().deepSeekApiKey || '';
}

function setDeepSeekApiKey(apiKey) {
    return setCredentials({ deepSeekApiKey: apiKey });
}

function getOpenRouterApiKey() {
    return getCredentials().openRouterApiKey || '';
}

function setOpenRouterApiKey(apiKey) {
    return setCredentials({ openRouterApiKey: apiKey });
}

function getOpenAIKey() {
    return getCredentials().openaiApiKey || '';
}

function setOpenAIKey(apiKey) {
    return setCredentials({ openaiApiKey: apiKey });
}

function getAnthropicKey() {
    return getCredentials().anthropicApiKey || '';
}

function setAnthropicKey(apiKey) {
    return setCredentials({ anthropicApiKey: apiKey });
}

function getCohereKey() {
    return getCredentials().cohereApiKey || '';
}

function setCohereKey(apiKey) {
    return setCredentials({ cohereApiKey: apiKey });
}

function getOllamaUrl() {
    return getCredentials().ollamaUrl || 'http://localhost:11434';
}

function setOllamaUrl(url) {
    return setCredentials({ ollamaUrl: url });
}

function getCustomApiUrl() {
    return getCredentials().customApiUrl || '';
}

function setCustomApiUrl(url) {
    return setCredentials({ customApiUrl: url });
}

function getCustomApiKey() {
    return getCredentials().customApiKey || '';
}

function setCustomApiKey(key) {
    return setCredentials({ customApiKey: key });
}

// Batch API key update
function updateAllApiKeys(keys) {
    return setCredentials({
        geminiApiKey: keys.gemini || getGeminiApiKey(),
        groqApiKey: keys.groq || getGroqApiKey(),
        deepSeekApiKey: keys.deepseek || getDeepSeekApiKey(),
        openRouterApiKey: keys.openrouter || getOpenRouterApiKey(),
        openaiApiKey: keys.openai || getOpenAIKey(),
        anthropicApiKey: keys.anthropic || getAnthropicKey(),
        cohereApiKey: keys.cohere || getCohereKey(),
        ollamaUrl: keys.ollama || getOllamaUrl(),
        customApiUrl: keys.customUrl || getCustomApiUrl(),
        customApiKey: keys.customKey || getCustomApiKey()
    });
}

// ============================================
// PREFERENCES MANAGEMENT
// ============================================

function getPreferences() {
    const saved = readJsonFile(getPreferencesPath(), {});
    return { ...DEFAULT_PREFERENCES, ...saved };
}

function setPreferences(preferences) {
    const current = getPreferences();
    const updated = { ...current, ...preferences };
    return writeJsonFile(getPreferencesPath(), updated);
}

function updatePreference(key, value) {
    const preferences = getPreferences();
    preferences[key] = value;
    return writeJsonFile(getPreferencesPath(), preferences);
}

// AI Provider specific
function getAIProvider() {
    return getPreferences().aiProvider || 'auto';
}

function setAIProvider(provider) {
    return updatePreference('aiProvider', provider);
}

function getPreferredModel() {
    return getPreferences().preferredModel || 'auto';
}

function setPreferredModel(model) {
    return updatePreference('preferredModel', model);
}

// ============================================
// KEYBINDS MANAGEMENT
// ============================================

function getKeybinds() {
    return readJsonFile(getKeybindsPath(), DEFAULT_KEYBINDS);
}

function setKeybinds(keybinds) {
    return writeJsonFile(getKeybindsPath(), keybinds);
}

// ============================================
// MODELS MANAGEMENT
// ============================================

function getModels() {
    return readJsonFile(getModelsPath(), DEFAULT_MODELS);
}

function setModels(models) {
    return writeJsonFile(getModelsPath(), models);
}

function getAvailableModels(provider) {
    const models = getModels();
    if (provider && models[provider]) {
        return models[provider];
    }
    return models;
}

function addCustomModel(provider, model) {
    const models = getModels();
    if (!models[provider]) {
        models[provider] = [];
    }
    models[provider].push(model);
    return setModels(models);
}

// ============================================
// RATE LIMITING & USAGE TRACKING
// ============================================

function getLimits() {
    return readJsonFile(getLimitsPath(), DEFAULT_LIMITS);
}

function setLimits(limits) {
    return writeJsonFile(getLimitsPath(), limits);
}

function getTodayDateString() {
    const now = new Date();
    return now.toISOString().split('T')[0];
}

function getTodayLimits() {
    const limits = getLimits();
    const today = getTodayDateString();

    // Find today's entry
    let todayEntry = limits.data.find(entry => entry.date === today);

    if (!todayEntry) {
        // Clean old entries (keep only last 30 days)
        limits.data = limits.data.filter(entry => {
            const entryDate = new Date(entry.date);
            const todayDate = new Date(today);
            const diffTime = Math.abs(todayDate - entryDate);
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            return diffDays <= 30;
        });

        // Create new entry for today
        todayEntry = {
            date: today,
            requests: 0,
            tokens: 0,
            screenshots: 0,
            providers: {
                gemini: { requests: 0, tokens: 0 },
                groq: { requests: 0, tokens: 0 },
                deepseek: { requests: 0, tokens: 0 },
                openrouter: { requests: 0, tokens: 0 },
                local: { requests: 0, tokens: 0 }
            }
        };
        limits.data.push(todayEntry);
        setLimits(limits);
    }

    return todayEntry;
}

function incrementUsage(provider, model, tokens = 0) {
    const limits = getLimits();
    const today = getTodayDateString();

    let todayEntry = limits.data.find(entry => entry.date === today);
    if (!todayEntry) {
        todayEntry = getTodayLimits();
    }

    // Increment overall usage
    todayEntry.requests = (todayEntry.requests || 0) + 1;
    todayEntry.tokens = (todayEntry.tokens || 0) + tokens;

    // Increment provider-specific usage
    if (!todayEntry.providers) {
        todayEntry.providers = {};
    }
    if (!todayEntry.providers[provider]) {
        todayEntry.providers[provider] = { requests: 0, tokens: 0 };
    }

    todayEntry.providers[provider].requests++;
    todayEntry.providers[provider].tokens += tokens;

    // Track model usage
    if (!todayEntry.models) {
        todayEntry.models = {};
    }
    if (!todayEntry.models[model]) {
        todayEntry.models[model] = { requests: 0, tokens: 0 };
    }

    todayEntry.models[model].requests++;
    todayEntry.models[model].tokens += tokens;

    setLimits(limits);
    return todayEntry;
}

function getProviderLimit(provider) {
    const limits = getLimits();
    return limits.providerLimits[provider] || { daily: 1000, monthly: 30000 };
}

function checkProviderLimit(provider) {
    const todayEntry = getTodayLimits();
    const limit = getProviderLimit(provider);

    if (!todayEntry.providers || !todayEntry.providers[provider]) {
        return { available: true, remaining: limit.daily };
    }

    const used = todayEntry.providers[provider].requests || 0;
    const remaining = Math.max(0, limit.daily - used);

    return {
        available: used < limit.daily,
        used,
        remaining,
        limit: limit.daily
    };
}

// ============================================
// CACHE MANAGEMENT
// ============================================

function getCacheKey(prompt, provider, model) {
    const hash = crypto.createHash('md5').update(prompt + provider + model).digest('hex');
    return path.join(getCacheDir(), `${hash}.json`);
}

function getFromCache(prompt, provider, model) {
    try {
        const cacheFile = getCacheKey(prompt, provider, model);
        if (fs.existsSync(cacheFile)) {
            const cached = readJsonFile(cacheFile);
            // Check if cache is still valid (24 hours)
            if (Date.now() - cached.timestamp < 24 * 60 * 60 * 1000) {
                return cached.response;
            }
        }
    } catch (error) {
        console.warn('Cache read error:', error.message);
    }
    return null;
}

function saveToCache(prompt, provider, model, response) {
    try {
        const cacheFile = getCacheKey(prompt, provider, model);
        const cacheData = {
            prompt,
            provider,
            model,
            response,
            timestamp: Date.now()
        };
        writeJsonFile(cacheFile, cacheData);
        return true;
    } catch (error) {
        console.warn('Cache save error:', error.message);
        return false;
    }
}

function clearCache() {
    try {
        const cacheDir = getCacheDir();
        const files = fs.readdirSync(cacheDir);
        files.forEach(file => {
            fs.unlinkSync(path.join(cacheDir, file));
        });
        return true;
    } catch (error) {
        console.error('Error clearing cache:', error.message);
        return false;
    }
}

// ============================================
// SESSION HISTORY
// ============================================

function getHistoryDir() {
    const historyDir = path.join(getConfigDir(), 'history');
    if (!fs.existsSync(historyDir)) {
        fs.mkdirSync(historyDir, { recursive: true });
    }
    return historyDir;
}

function getSessionPath(sessionId) {
    return path.join(getHistoryDir(), `${sessionId}.json`);
}

function saveSession(sessionId, data) {
    const sessionPath = getSessionPath(sessionId);
    const existingSession = readJsonFile(sessionPath, null);

    const sessionData = {
        sessionId,
        createdAt: existingSession?.createdAt || parseInt(sessionId),
        lastUpdated: Date.now(),
        provider: data.provider || existingSession?.provider || 'auto',
        model: data.model || existingSession?.model || 'auto',
        profile: data.profile || existingSession?.profile || null,
        customPrompt: data.customPrompt || existingSession?.customPrompt || null,
        conversationHistory: data.conversationHistory || existingSession?.conversationHistory || [],
        screenAnalysisHistory: data.screenAnalysisHistory || existingSession?.screenAnalysisHistory || [],
        tokensUsed: data.tokensUsed || existingSession?.tokensUsed || 0,
        requestsMade: data.requestsMade || existingSession?.requestsMade || 0
    };

    // Encrypt sensitive data
    if (sessionData.conversationHistory.length > 0) {
        sessionData.conversationHistory = sessionData.conversationHistory.map(msg => ({
            ...msg,
            content: encrypt(msg.content)
        }));
    }

    return writeJsonFile(sessionPath, sessionData);
}

function getSession(sessionId) {
    const session = readJsonFile(getSessionPath(sessionId), null);

    if (session && session.conversationHistory) {
        session.conversationHistory = session.conversationHistory.map(msg => ({
            ...msg,
            content: decrypt(msg.content)
        }));
    }

    return session;
}

function getAllSessions() {
    const historyDir = getHistoryDir();

    try {
        if (!fs.existsSync(historyDir)) {
            return [];
        }

        const files = fs.readdirSync(historyDir)
            .filter(f => f.endsWith('.json'))
            .sort((a, b) => {
                const tsA = parseInt(a.replace('.json', ''));
                const tsB = parseInt(b.replace('.json', ''));
                return tsB - tsA;
            });

        return files.map(file => {
            const sessionId = file.replace('.json', '');
            const data = getSession(sessionId);
            if (data) {
                return {
                    sessionId,
                    createdAt: data.createdAt,
                    lastUpdated: data.lastUpdated,
                    provider: data.provider,
                    model: data.model,
                    messageCount: data.conversationHistory?.length || 0,
                    screenAnalysisCount: data.screenAnalysisHistory?.length || 0,
                    tokensUsed: data.tokensUsed || 0,
                    requestsMade: data.requestsMade || 0,
                    profile: data.profile || null
                };
            }
            return null;
        }).filter(Boolean);
    } catch (error) {
        console.error('Error reading sessions:', error.message);
        return [];
    }
}

function deleteSession(sessionId) {
    const sessionPath = getSessionPath(sessionId);
    try {
        if (fs.existsSync(sessionPath)) {
            fs.unlinkSync(sessionPath);
            return true;
        }
    } catch (error) {
        console.error('Error deleting session:', error.message);
    }
    return false;
}

function deleteAllSessions() {
    const historyDir = getHistoryDir();
    try {
        if (fs.existsSync(historyDir)) {
            const files = fs.readdirSync(historyDir).filter(f => f.endsWith('.json'));
            files.forEach(file => {
                fs.unlinkSync(path.join(historyDir, file));
            });
        }
        return true;
    } catch (error) {
        console.error('Error deleting all sessions:', error.message);
        return false;
    }
}

// ============================================
// SCREENSHOTS MANAGEMENT
// ============================================

function saveScreenshot(filename, buffer) {
    try {
        const screenshotsDir = getScreenshotsDir();
        const filePath = path.join(screenshotsDir, filename);
        fs.writeFileSync(filePath, buffer);
        return filePath;
    } catch (error) {
        console.error('Error saving screenshot:', error.message);
        return null;
    }
}

function getScreenshotPath(filename) {
    return path.join(getScreenshotsDir(), filename);
}

function listScreenshots(limit = 50) {
    try {
        const screenshotsDir = getScreenshotsDir();
        if (!fs.existsSync(screenshotsDir)) {
            return [];
        }

        const files = fs.readdirSync(screenshotsDir)
            .filter(f => f.endsWith('.png') || f.endsWith('.jpg'))
            .sort((a, b) => {
                const statA = fs.statSync(path.join(screenshotsDir, a));
                const statB = fs.statSync(path.join(screenshotsDir, b));
                return statB.mtime.getTime() - statA.mtime.getTime();
            })
            .slice(0, limit);

        return files.map(file => ({
            filename: file,
            path: path.join(screenshotsDir, file),
            size: fs.statSync(path.join(screenshotsDir, file)).size,
            created: fs.statSync(path.join(screenshotsDir, file)).mtime
        }));
    } catch (error) {
        console.error('Error listing screenshots:', error.message);
        return [];
    }
}

function cleanupScreenshots(maxAgeHours = 24) {
    try {
        const screenshotsDir = getScreenshotsDir();
        if (!fs.existsSync(screenshotsDir)) {
            return 0;
        }

        const cutoff = Date.now() - (maxAgeHours * 60 * 60 * 1000);
        const files = fs.readdirSync(screenshotsDir);

        let deleted = 0;
        files.forEach(file => {
            const filePath = path.join(screenshotsDir, file);
            const stat = fs.statSync(filePath);
            if (stat.mtime.getTime() < cutoff) {
                fs.unlinkSync(filePath);
                deleted++;
            }
        });

        return deleted;
    } catch (error) {
        console.error('Error cleaning up screenshots:', error.message);
        return 0;
    }
}

// ============================================
// LOGGING
// ============================================

function logEvent(event, data = {}) {
    try {
        const logsDir = getLogsDir();
        const today = getTodayDateString();
        const logFile = path.join(logsDir, `${today}.log`);

        const logEntry = {
            timestamp: new Date().toISOString(),
            event,
            ...data
        };

        fs.appendFileSync(logFile, JSON.stringify(logEntry) + '\n', 'utf8');
    } catch (error) {
        console.error('Error logging event:', error.message);
    }
}

// ============================================
// BACKUP & RESTORE
// ============================================

function createBackup() {
    try {
        const configDir = getConfigDir();
        const backupDir = path.join(os.homedir(), 'Desktop', `cheating-daddy-backup-${Date.now()}`);

        if (!fs.existsSync(backupDir)) {
            fs.mkdirSync(backupDir, { recursive: true });
        }

        // Copy config files
        const files = fs.readdirSync(configDir);
        files.forEach(file => {
            const source = path.join(configDir, file);
            const dest = path.join(backupDir, file);

            if (fs.statSync(source).isFile()) {
                fs.copyFileSync(source, dest);
            } else if (fs.statSync(source).isDirectory()) {
                // Recursively copy directory
                const copyDir = (src, dst) => {
                    if (!fs.existsSync(dst)) fs.mkdirSync(dst, { recursive: true });
                    const items = fs.readdirSync(src);
                    items.forEach(item => {
                        const srcPath = path.join(src, item);
                        const dstPath = path.join(dst, item);
                        if (fs.statSync(srcPath).isDirectory()) {
                            copyDir(srcPath, dstPath);
                        } else {
                            fs.copyFileSync(srcPath, dstPath);
                        }
                    });
                };
                copyDir(source, dest);
            }
        });

        return backupDir;
    } catch (error) {
        console.error('Error creating backup:', error.message);
        return null;
    }
}

// ============================================
// CLEANUP
// ============================================

function clearAllData() {
    const configDir = getConfigDir();
    try {
        if (fs.existsSync(configDir)) {
            fs.rmSync(configDir, { recursive: true, force: true });
        }
        resetConfigDir();
        return true;
    } catch (error) {
        console.error('Error clearing all data:', error.message);
        return false;
    }
}

// ============================================
// EXPORTS
// ============================================

module.exports = {
    // Initialization
    initializeStorage,
    getConfigDir,

    // Config
    getConfig,
    setConfig,
    updateConfig,

    // Credentials (encrypted)
    getCredentials,
    setCredentials,

    // Individual API keys
    getApiKey: getGeminiApiKey,
    setApiKey: setGeminiApiKey,
    getGeminiApiKey,
    setGeminiApiKey,
    getGroqApiKey,
    setGroqApiKey,
    getDeepSeekApiKey,
    setDeepSeekApiKey,
    getOpenRouterApiKey,
    setOpenRouterApiKey,
    getOpenAIKey,
    setOpenAIKey,
    getAnthropicKey,
    setAnthropicKey,
    getCohereKey,
    setCohereKey,
    getOllamaUrl,
    setOllamaUrl,
    getCustomApiUrl,
    setCustomApiUrl,
    getCustomApiKey,
    setCustomApiKey,
    updateAllApiKeys,

    // Preferences
    getPreferences,
    setPreferences,
    updatePreference,
    getAIProvider,
    setAIProvider,
    getPreferredModel,
    setPreferredModel,

    // Keybinds
    getKeybinds,
    setKeybinds,

    // Models
    getModels,
    setModels,
    getAvailableModels,
    addCustomModel,

    // Rate limiting
    getLimits,
    setLimits,
    getTodayLimits,
    incrementUsage,
    checkProviderLimit,
    getProviderLimit,

    // Cache
    getFromCache,
    saveToCache,
    clearCache,

    // Session history
    saveSession,
    getSession,
    getAllSessions,
    deleteSession,
    deleteAllSessions,

    // Screenshots
    saveScreenshot,
    getScreenshotPath,
    listScreenshots,
    cleanupScreenshots,

    // Logging
    logEvent,

    // Backup
    createBackup,

    // Cleanup
    clearAllData,

    // Utility paths
    getCacheDir,
    getLogsDir,
    getScreenshotsDir
};