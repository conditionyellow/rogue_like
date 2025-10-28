class LocalizationManager {
    constructor() {
        this.translations = {};
        this.currentLang = localStorage.getItem('rogue_lang') || 'en'; // Default to English
    }

    async init() {
        await this.loadLanguage(this.currentLang);
        this.updateUI();
    }

    async loadLanguage(lang) {
        try {
            const response = await fetch(`locales/${lang}.json`);
            if (!response.ok) {
                throw new Error(`Failed to load language file: ${lang}.json`);
            }
            this.translations = await response.json();
            this.currentLang = lang;
            localStorage.setItem('rogue_lang', lang);
        } catch (error) {
            // Fallback to English if loading fails
            if (lang !== 'en') {
                await this.loadLanguage('en');
            }
        }
    }

    async setLanguage(lang) {
        await this.loadLanguage(lang);
        this.updateUI();
    }

    t(key, replacements = {}) {
        let translation = this.translations[key] || key;
        for (const placeholder in replacements) {
            translation = translation.replace(`{${placeholder}}`, replacements[placeholder]);
        }
        return translation;
    }

    updateUI() {
        document.querySelectorAll('[data-i18n-key]').forEach(element => {
            const key = element.getAttribute('data-i18n-key');
            element.textContent = this.t(key);
        });
    }
}

// Create a global instance
const loc = new LocalizationManager();
