const axios = require('axios');
const storage = require('../storage');
const path = require('path');
const fs = require('fs');

class AIManager {
    constructor() {
        this.providers = {
            gemini: this.processWithGemini.bind(this),
            groq: this.processWithGroq.bind(this),
            deepseek: this.processWithDeepSeek.bind(this),
            openrouter: this.processWithOpenRouter.bind(this),
            openai: this.processWithOpenAI.bind(this),
            anthropic: this.processWithAnthropic.bind(this),
            cohere: this.processWithCohere.bind(this),
            ollama: this.processWithOllama.bind(this),
            custom: this.processWithCustom.bind(this)
        };

        this.models = storage.getModels();
    }

    // ============ ОСНОВНОЙ МЕТОД ============
    async process(prompt, options = {}) {
        const startTime = Date.now();

        // Определяем провайдера
        let provider = options.provider || storage.getAIProvider();
        if (provider === 'auto') {
            provider = this.detectBestProvider();
        }

        // Определяем модель
        let model = options.model || storage.getPreferredModel();
        if (model === 'auto') {
            model = this.getBestModel(provider);
        }

        console.log(`🧠 Using ${provider} / ${model}`);

        try {
            // Проверяем лимиты
            const limitCheck = storage.checkProviderLimit(provider);
            if (!limitCheck.available) {
                console.warn(`Provider ${provider} limit exceeded, trying fallback`);
                return this.process(prompt, { ...options, provider: 'auto' });
            }

            // Проверяем кэш
            const cached = storage.getFromCache(prompt, provider, model);
            if (cached) {
                console.log('📦 Using cached response');
                return {
                    success: true,
                    provider: 'cache',
                    model: model,
                    content: cached,
                    cached: true,
                    time: Date.now() - startTime
                };
            }

            // Вызываем соответствующий провайдер
            const processor = this.providers[provider];
            if (!processor) {
                throw new Error(`Provider ${provider} not supported`);
            }

            const content = await processor(prompt, { ...options, model });

            // Сохраняем в кэш
            storage.saveToCache(prompt, provider, model, content);

            // Обновляем статистику
            const tokens = this.estimateTokens(content);
            storage.incrementUsage(provider, model, tokens);

            // Логируем
            storage.logEvent('ai_request', {
                provider,
                model,
                promptLength: prompt.length,
                responseLength: content.length,
                tokens,
                time: Date.now() - startTime
            });

            return {
                success: true,
                provider,
                model,
                content,
                cached: false,
                time: Date.now() - startTime,
                tokens
            };

        } catch (error) {
            console.error(`❌ ${provider} error:`, error.message);

            // Fallback на другой провайдер
            if (provider !== 'auto') {
                console.log('🔄 Trying fallback provider...');
                return this.process(prompt, { ...options, provider: 'auto' });
            }

            storage.logEvent('ai_error', {
                provider,
                model,
                error: error.message,
                promptLength: prompt.length
            });

            throw error;
        }
    }

    // ============ DETECTION & SELECTION ============
    detectBestProvider() {
        const credentials = storage.getCredentials();

        // Приоритеты
        if (credentials.deepSeekApiKey && credentials.deepSeekApiKey.startsWith('sk-')) {
            return 'deepseek';
        }
        if (credentials.groqApiKey && credentials.groqApiKey.startsWith('gsk_')) {
            return 'groq';
        }
        if (credentials.geminiApiKey && credentials.geminiApiKey.startsWith('AIzaSyB')) {
            return 'gemini';
        }
        if (credentials.openRouterApiKey && credentials.openRouterApiKey.startsWith('sk-or-')) {
            return 'openrouter';
        }
        if (credentials.openaiApiKey && credentials.openaiApiKey.startsWith('sk-')) {
            return 'openai';
        }
        if (credentials.anthropicApiKey) {
            return 'anthropic';
        }
        if (credentials.cohereApiKey) {
            return 'cohere';
        }
        if (credentials.ollamaUrl) {
            return 'ollama';
        }

        throw new Error('No valid API keys found');
    }

    getBestModel(provider) {
        const models = this.models[provider];
        if (!models || models.length === 0) {
            return 'default';
        }

        // Возвращаем первую доступную модель
        return models[0].id;
    }

    estimateTokens(text) {
        // Простая оценка: ~4 символа = 1 токен
        return Math.ceil(text.length / 4);
    }

    // ============ PROVIDER IMPLEMENTATIONS ============

    async processWithGemini(prompt, options = {}) {
        const apiKey = storage.getGeminiApiKey();
        if (!apiKey) throw new Error('Gemini API key not set');

        const model = options.model || 'gemini-2.0-flash';

        const response = await axios.post(
            `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
            {
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: {
                    temperature: options.temperature || 0.7,
                    maxOutputTokens: options.max_tokens || 2000
                }
            },
            {
                params: { key: apiKey },
                timeout: 30000
            }
        );

        return response.data.candidates[0].content.parts[0].text;
    }

    async processWithGroq(prompt, options = {}) {
        const apiKey = storage.getGroqApiKey();
        if (!apiKey) throw new Error('Groq API key not set');

        const model = options.model || 'mixtral-8x7b-32768';

        const response = await axios.post(
            'https://api.groq.com/openai/v1/chat/completions',
            {
                model: model,
                messages: [{ role: 'user', content: prompt }],
                temperature: options.temperature || 0.7,
                max_tokens: options.max_tokens || 1000
            },
            {
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json'
                },
                timeout: 15000 // Groq быстрый
            }
        );

        return response.data.choices[0].message.content;
    }

    async processWithDeepSeek(prompt, options = {}) {
        const apiKey = storage.getDeepSeekApiKey();
        if (!apiKey) throw new Error('DeepSeek API key not set');

        const model = options.model || 'deepseek-chat';

        const response = await axios.post(
            'https://api.deepseek.com/v1/chat/completions',
            {
                model: model,
                messages: [{ role: 'user', content: prompt }],
                temperature: options.temperature || 0.7,
                max_tokens: options.max_tokens || 2000,
                stream: false
            },
            {
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json'
                },
                timeout: 30000
            }
        );

        return response.data.choices[0].message.content;
    }

    async processWithOpenRouter(prompt, options = {}) {
        const apiKey = storage.getOpenRouterApiKey();
        if (!apiKey) throw new Error('OpenRouter API key not set');

        const model = options.model || 'openai/gpt-4o-mini';

        const response = await axios.post(
            'https://openrouter.ai/api/v1/chat/completions',
            {
                model: model,
                messages: [{ role: 'user', content: prompt }],
                temperature: options.temperature || 0.7,
                max_tokens: options.max_tokens || 1000
            },
            {
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json',
                    'HTTP-Referer': 'http://localhost:3000',
                    'X-Title': 'Cheating Daddy'
                },
                timeout: 30000
            }
        );

        return response.data.choices[0].message.content;
    }

    async processWithOpenAI(prompt, options = {}) {
        const apiKey = storage.getOpenAIKey();
        if (!apiKey) throw new Error('OpenAI API key not set');

        const model = options.model || 'gpt-4o-mini';

        const response = await axios.post(
            'https://api.openai.com/v1/chat/completions',
            {
                model: model,
                messages: [{ role: 'user', content: prompt }],
                temperature: options.temperature || 0.7,
                max_tokens: options.max_tokens || 1000
            },
            {
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json'
                },
                timeout: 30000
            }
        );

        return response.data.choices[0].message.content;
    }

    async processWithAnthropic(prompt, options = {}) {
        const apiKey = storage.getAnthropicKey();
        if (!apiKey) throw new Error('Anthropic API key not set');

        const model = options.model || 'claude-3-haiku-20240307';

        const response = await axios.post(
            'https://api.anthropic.com/v1/messages',
            {
                model: model,
                messages: [{ role: 'user', content: prompt }],
                temperature: options.temperature || 0.7,
                max_tokens: options.max_tokens || 1000
            },
            {
                headers: {
                    'x-api-key': apiKey,
                    'anthropic-version': '2023-06-01',
                    'Content-Type': 'application/json'
                },
                timeout: 30000
            }
        );

        return response.data.content[0].text;
    }

    async processWithCohere(prompt, options = {}) {
        const apiKey = storage.getCohereKey();
        if (!apiKey) throw new Error('Cohere API key not set');

        const model = options.model || 'command-r-plus';

        const response = await axios.post(
            'https://api.cohere.ai/v1/generate',
            {
                model: model,
                prompt: prompt,
                temperature: options.temperature || 0.7,
                max_tokens: options.max_tokens || 1000
            },
            {
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json'
                },
                timeout: 30000
            }
        );

        return response.data.generations[0].text;
    }

    async processWithOllama(prompt, options = {}) {
        const ollamaUrl = storage.getOllamaUrl();
        const model = options.model || 'llama3.2';

        const response = await axios.post(
            `${ollamaUrl}/api/generate`,
            {
                model: model,
                prompt: prompt,
                temperature: options.temperature || 0.7,
                max_tokens: options.max_tokens || 1000,
                stream: false
            },
            {
                timeout: 60000 // Ollama медленнее
            }
        );

        return response.data.response;
    }

    async processWithCustom(prompt, options = {}) {
        const apiUrl = storage.getCustomApiUrl();
        const apiKey = storage.getCustomApiKey();

        if (!apiUrl) throw new Error('Custom API URL not set');

        const config = {
            url: apiUrl,
            method: 'POST',
            data: {
                prompt: prompt,
                ...options
            },
            timeout: 30000
        };

        if (apiKey) {
            config.headers = {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            };
        }

        const response = await axios(config);

        // Пытаемся извлечь ответ из разных форматов
        if (response.data.choices) {
            return response.data.choices[0].message?.content || response.data.choices[0].text;
        }
        if (response.data.completion) {
            return response.data.completion;
        }
        if (response.data.response) {
            return response.data.response;
        }
        if (response.data.text) {
            return response.data.text;
        }

        return JSON.stringify(response.data);
    }

    // ============ SCREENSHOT ANALYSIS ============
    async analyzeScreenshot(imageBase64, question = "Что изображено на скриншоте?") {
        const provider = storage.getAIProvider();

        // Только провайдеры с поддержкой vision
        const visionProviders = ['gemini', 'openai', 'anthropic', 'deepseek'];
        if (!visionProviders.includes(provider)) {
            // Fallback на Gemini для анализа изображений
            return this.analyzeWithGeminiVision(imageBase64, question);
        }

        switch (provider) {
            case 'gemini':
                return this.analyzeWithGeminiVision(imageBase64, question);
            case 'openai':
                return this.analyzeWithOpenAIVision(imageBase64, question);
            case 'deepseek':
                return this.analyzeWithDeepSeekVision(imageBase64, question);
            default:
                return this.analyzeWithGeminiVision(imageBase64, question);
        }
    }

    async analyzeWithGeminiVision(imageBase64, question) {
        const apiKey = storage.getGeminiApiKey();
        if (!apiKey) throw new Error('Gemini API key required for vision');

        const response = await axios.post(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent`,
            {
                contents: [{
                    parts: [
                        { text: question },
                        {
                            inline_data: {
                                mime_type: "image/png",
                                data: imageBase64
                            }
                        }
                    ]
                }]
            },
            {
                params: { key: apiKey },
                timeout: 60000
            }
        );

        return response.data.candidates[0].content.parts[0].text;
    }

    async analyzeWithDeepSeekVision(imageBase64, question) {
        const apiKey = storage.getDeepSeekApiKey();
        if (!apiKey) throw new Error('DeepSeek API key required for vision');

        const response = await axios.post(
            'https://api.deepseek.com/v1/chat/completions',
            {
                model: 'deepseek-chat',
                messages: [{
                    role: 'user',
                    content: [
                        { type: 'text', text: question },
                        { type: 'image_url', image_url: { url: `data:image/png;base64,${imageBase64}` } }
                    ]
                }]
            },
            {
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json'
                },
                timeout: 60000
            }
        );

        return response.data.choices[0].message.content;
    }

    async analyzeWithOpenAIVision(imageBase64, question) {
        const apiKey = storage.getOpenAIKey();
        if (!apiKey) throw new Error('OpenAI API key required for vision');

        const response = await axios.post(
            'https://api.openai.com/v1/chat/completions',
            {
                model: 'gpt-4o-mini',
                messages: [{
                    role: 'user',
                    content: [
                        { type: 'text', text: question },
                        { type: 'image_url', image_url: { url: `data:image/png;base64,${imageBase64}` } }
                    ]
                }]
            },
            {
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json'
                },
                timeout: 60000
            }
        );

        return response.data.choices[0].message.content;
    }

    // ============ UTILITIES ============
    async testProvider(provider) {
        try {
            const testPrompt = "Respond with 'OK' if you're working.";
            const result = await this.process(testPrompt, {
                provider,
                max_tokens: 10
            });
            return result.success;
        } catch (error) {
            console.error(`${provider} test failed:`, error.message);
            return false;
        }
    }

    async testAllProviders() {
        const results = {};
        const credentials = storage.getCredentials();

        for (const provider of Object.keys(this.providers)) {
            if (provider === 'custom') continue;

            const hasKey = this.checkProviderKey(provider, credentials);
            if (hasKey) {
                results[provider] = await this.testProvider(provider);
            } else {
                results[provider] = 'no_key';
            }
        }

        return results;
    }

    checkProviderKey(provider, credentials) {
        switch (provider) {
            case 'gemini': return !!credentials.geminiApiKey;
            case 'groq': return !!credentials.groqApiKey;
            case 'deepseek': return !!credentials.deepSeekApiKey;
            case 'openrouter': return !!credentials.openRouterApiKey;
            case 'openai': return !!credentials.openaiApiKey;
            case 'anthropic': return !!credentials.anthropicApiKey;
            case 'cohere': return !!credentials.cohereApiKey;
            case 'ollama': return !!credentials.ollamaUrl;
            default: return false;
        }
    }

    getAvailableProviders() {
        const credentials = storage.getCredentials();
        const available = [];

        for (const provider of Object.keys(this.providers)) {
            if (provider === 'custom') {
                if (credentials.customApiUrl) available.push(provider);
                continue;
            }
            if (this.checkProviderKey(provider, credentials)) {
                available.push(provider);
            }
        }

        return available;
    }

    getProviderInfo(provider) {
        const info = {
            name: provider,
            models: this.models[provider] || [],
            limits: storage.checkProviderLimit(provider),
            keySet: this.checkProviderKey(provider, storage.getCredentials())
        };

        // Добавляем человеческие названия
        const providerNames = {
            gemini: 'Google Gemini',
            groq: 'Groq',
            deepseek: 'DeepSeek',
            openrouter: 'OpenRouter',
            openai: 'OpenAI',
            anthropic: 'Anthropic Claude',
            cohere: 'Cohere',
            ollama: 'Local Ollama',
            custom: 'Custom API'
        };

        info.displayName = providerNames[provider] || provider;
        return info;
    }
}

// Создаем синглтон
const aiManager = new AIManager();

// Экспортируем функции для совместимости со старым кодом
module.exports = {
    // Основные функции
    processWithAI: aiManager.process.bind(aiManager),
    analyzeScreenshot: aiManager.analyzeScreenshot.bind(aiManager),

    // Утилиты
    testAllProviders: aiManager.testAllProviders.bind(aiManager),
    getAvailableProviders: aiManager.getAvailableProviders.bind(aiManager),
    getProviderInfo: aiManager.getProviderInfo.bind(aiManager),

    // Для совместимости
    sendToRenderer: (channel, data) => {
        // Эта функция будет переопределена в index.js
        console.log(`Renderer event: ${channel}`, data);
    },

    // Старые функции (для совместимости)
    setupGeminiIpcHandlers: (geminiSessionRef) => {
        console.log('IPC handlers setup (legacy)');
    },

    stopMacOSAudioCapture: () => {
        console.log('Audio capture stopped');
    }
};