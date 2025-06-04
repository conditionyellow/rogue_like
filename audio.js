class AudioManager {
    constructor() {
        this.audioContext = null;
        this.soundEffects = {};
        this.backgroundMusic = null;
        this.masterVolume = 0.7;
        this.effectsVolume = 0.8;
        this.musicVolume = 0.5;
        this.isMuted = false;
        
        // Initialize audio context on user interaction
        this.initialized = false;
        this.initPromise = null;
        
        // Create empty sound buffers for procedural audio
        this.createProceduralSounds();
    }
    
    async init() {
        if (this.initialized) return;
        if (this.initPromise) return this.initPromise;
        
        this.initPromise = this.doInit();
        await this.initPromise;
        return this.initPromise;
    }
    
    async doInit() {
        try {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            
            // Resume context if suspended (required for some browsers)
            if (this.audioContext.state === 'suspended') {
                await this.audioContext.resume();
            }
            
            this.createMasterGain();
            this.generateSoundEffects();
            this.generateBackgroundMusic();
            
            this.initialized = true;
            console.log('Audio system initialized successfully');
        } catch (error) {
            console.warn('Audio initialization failed:', error);
        }
    }
    
    createMasterGain() {
        this.masterGain = this.audioContext.createGain();
        this.masterGain.gain.setValueAtTime(this.masterVolume, this.audioContext.currentTime);
        this.masterGain.connect(this.audioContext.destination);
    }
    
    setVolume(volume) {
        this.masterVolume = Math.max(0, Math.min(1, volume));
        if (this.masterGain && !this.isMuted) {
            this.masterGain.gain.setValueAtTime(this.masterVolume, this.audioContext.currentTime);
        }
    }
    
    toggleMute() {
        this.isMuted = !this.isMuted;
        if (this.masterGain) {
            this.masterGain.gain.setValueAtTime(
                this.isMuted ? 0 : this.masterVolume, 
                this.audioContext.currentTime
            );
        }
        return this.isMuted;
    }
    
    createProceduralSounds() {
        // Define sound parameters for procedural generation
        this.soundParams = {
            footstep: { frequency: 200, duration: 0.1, type: 'noise' },
            combat: { frequency: 300, duration: 0.3, type: 'square' },
            levelUp: { frequency: [440, 554, 659], duration: 0.5, type: 'sine' },
            itemPickup: { frequency: 660, duration: 0.2, type: 'sine' },
            enemyDeath: { frequency: 150, duration: 0.4, type: 'sawtooth' },
            damage: { frequency: 180, duration: 0.2, type: 'triangle' },
            heal: { frequency: [523, 659, 784], duration: 0.4, type: 'sine' },
            stairs: { frequency: [330, 415, 523], duration: 0.6, type: 'triangle' },
            specialAttack: { frequency: 250, duration: 0.25, type: 'square' },
            error: { frequency: 100, duration: 0.3, type: 'sawtooth' }
        };
    }
    
    generateSoundEffects() {
        // Generate procedural sound effects using Web Audio API
        for (const [name, params] of Object.entries(this.soundParams)) {
            this.soundEffects[name] = this.createProceduralSound(params);
        }
    }
    
    createProceduralSound(params) {
        return {
            play: () => this.playProceduralSound(params),
            params: params
        };
    }
    
    playProceduralSound(params) {
        if (!this.initialized || this.isMuted) return;
        
        try {
            const now = this.audioContext.currentTime;
            const gainNode = this.audioContext.createGain();
            
            gainNode.connect(this.masterGain);
            gainNode.gain.setValueAtTime(0, now);
            gainNode.gain.linearRampToValueAtTime(this.effectsVolume * 0.3, now + 0.01);
            gainNode.gain.exponentialRampToValueAtTime(0.001, now + params.duration);
            
            if (Array.isArray(params.frequency)) {
                // Chord or sequence
                params.frequency.forEach((freq, index) => {
                    const delay = index * 0.1;
                    this.createOscillator(freq, params.type, now + delay, params.duration - delay, gainNode);
                });
            } else if (params.type === 'noise') {
                this.createNoise(now, params.duration, gainNode);
            } else {
                this.createOscillator(params.frequency, params.type, now, params.duration, gainNode);
            }
        } catch (error) {
            console.warn('Error playing procedural sound:', error);
        }
    }
    
    createOscillator(frequency, type, startTime, duration, gainNode) {
        const oscillator = this.audioContext.createOscillator();
        oscillator.type = type;
        oscillator.frequency.setValueAtTime(frequency, startTime);
        
        // Add some frequency modulation for more interesting sounds
        if (type === 'square' || type === 'sawtooth') {
            oscillator.frequency.exponentialRampToValueAtTime(frequency * 0.5, startTime + duration);
        }
        
        oscillator.connect(gainNode);
        oscillator.start(startTime);
        oscillator.stop(startTime + duration);
    }
    
    createNoise(startTime, duration, gainNode) {
        // Create noise using a buffer source
        const bufferSize = this.audioContext.sampleRate * duration;
        const buffer = this.audioContext.createBuffer(1, bufferSize, this.audioContext.sampleRate);
        const data = buffer.getChannelData(0);
        
        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }
        
        const source = this.audioContext.createBufferSource();
        source.buffer = buffer;
        
        // Apply a filter to make it more footstep-like
        const filter = this.audioContext.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(800, startTime);
        
        source.connect(filter);
        filter.connect(gainNode);
        source.start(startTime);
    }
    
    generateBackgroundMusic() {
        // Create simple ambient background music
        this.backgroundMusic = {
            isPlaying: false,
            nodes: [],
            start: () => this.startBackgroundMusic(),
            stop: () => this.stopBackgroundMusic()
        };
    }
    
    startBackgroundMusic() {
        if (!this.initialized || this.isMuted || this.backgroundMusic.isPlaying) return;
        
        try {
            const now = this.audioContext.currentTime;
            const baseGain = this.audioContext.createGain();
            baseGain.gain.setValueAtTime(this.musicVolume * 0.1, now);
            baseGain.connect(this.masterGain);
            
            // Create ambient drone with multiple frequencies
            const frequencies = [55, 82.5, 110, 165]; // Low bass frequencies for ambient feel
            
            frequencies.forEach((freq, index) => {
                const oscillator = this.audioContext.createOscillator();
                const gain = this.audioContext.createGain();
                
                oscillator.type = 'sine';
                oscillator.frequency.setValueAtTime(freq, now);
                
                // Add slight frequency variation for organic feel
                const variation = this.audioContext.createOscillator();
                const variationGain = this.audioContext.createGain();
                variation.type = 'sine';
                variation.frequency.setValueAtTime(0.1 + index * 0.05, now);
                variationGain.gain.setValueAtTime(2, now);
                
                variation.connect(variationGain);
                variationGain.connect(oscillator.frequency);
                
                gain.gain.setValueAtTime(0.2 - index * 0.03, now);
                
                oscillator.connect(gain);
                gain.connect(baseGain);
                
                oscillator.start(now);
                variation.start(now);
                
                this.backgroundMusic.nodes.push(oscillator, variation, gain, variationGain);
            });
            
            this.backgroundMusic.nodes.push(baseGain);
            this.backgroundMusic.isPlaying = true;
            
        } catch (error) {
            console.warn('Error starting background music:', error);
        }
    }
    
    stopBackgroundMusic() {
        if (!this.backgroundMusic.isPlaying) return;
        
        try {
            const now = this.audioContext.currentTime;
            
            this.backgroundMusic.nodes.forEach(node => {
                if (node.stop) {
                    node.stop(now + 0.5); // Fade out time
                } else if (node.gain) {
                    node.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
                }
            });
            
            setTimeout(() => {
                this.backgroundMusic.nodes = [];
                this.backgroundMusic.isPlaying = false;
            }, 600);
            
        } catch (error) {
            console.warn('Error stopping background music:', error);
        }
    }
    
    async playSound(soundName) {
        if (!this.initialized) {
            await this.init();
        }
        
        if (this.soundEffects[soundName]) {
            this.soundEffects[soundName].play();
        } else {
            console.warn(`Sound effect '${soundName}' not found`);
        }
    }
    
    setMasterVolume(volume) {
        this.masterVolume = Math.max(0, Math.min(1, volume));
        if (this.masterGain) {
            this.masterGain.gain.setValueAtTime(this.masterVolume, this.audioContext.currentTime);
        }
    }
    
    setEffectsVolume(volume) {
        this.effectsVolume = Math.max(0, Math.min(1, volume));
    }
    
    setMusicVolume(volume) {
        this.musicVolume = Math.max(0, Math.min(1, volume));
    }
    
    toggleMute() {
        this.isMuted = !this.isMuted;
        if (this.isMuted) {
            this.stopBackgroundMusic();
        } else if (this.initialized) {
            this.startBackgroundMusic();
        }
        return this.isMuted;
    }
    
    getMuteState() {
        return this.isMuted;
    }
}

// Export for use in main game
window.AudioManager = AudioManager;
