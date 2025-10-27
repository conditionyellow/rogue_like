import { itemTemplates } from './items.js';
import { monsterTemplates } from './monsters.js';

// ===== ROGUE GAME ENGINE =====
// A full-featured roguelike game implementation

export class Game {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.tileSize = 16;
        this.mapWidth = 40;
        this.mapHeight = 40;
        this.viewWidth = this.canvas.width / this.tileSize;
        this.viewHeight = this.canvas.height / this.tileSize;
        
        this.player = null;
        this.dungeon = null;
        this.entities = [];
        this.items = [];
        this.turn = 0;
        this.floor = 1; // 現在の階層
        this.gameState = 'playing'; // playing, inventory, item_selection, dead
        this.itemSelectionMode = false;
        this.magicSelectionMode = false; // 魔法選択モード
        this.inventoryUIActive = false; // 専用インベントリUI表示フラグ
        this.shopUIActive = false;      // ショップUI表示フラグ
        this.nextItemId = 0; // グローバルアイテムIDカウンター
        this.projectiles = []; // 魔法の弾などを管理
        this.traps = []; // ダンジョン内の罠を管理
        this.shopInventory = []; // ショップの商品リスト
        this.shopRoom = null; // ショップ部屋の参照

        // コマンド入力関連
        this.commandInput = null; // 後で初期化
        this.commandHistory = [];
        this.commandHistoryIndex = -1;
        this.isCommandInputFocused = false; // コマンド入力がフォーカスされているか
        this.waitingForInput = null; // 現在待機している入力の種類 (例: 'languageSelection')

        // ゲーム内の全魔法を定義
        this.spells = {
            'fireball': { name: 'Fireball', cost: 10, damage: 15, range: 6, type: 'projectile' },
            'heal': { name: 'Heal', cost: 8, heal: 25, type: 'self' }
        };
        
        // Initialize audio system
        this.audioManager = new AudioManager();
        
        this.messages = [];
        this.maxMessages = 50;
        
        this.colors = {
            background: '#000000',        // 黒背景
            wall: '#FFFFFF',              // 可視の壁は白
            wallExplored: '#444444',      // 探索済みの壁は暗いグレー
            floor: '#AAAAAA',             // 可視の床はライトグレー
            floorExplored: '#222222',     // 探索済みの床は非常に暗いグレー
            door: '#6a9bd1',              // ソフトブルーのドア/通路
            player: '#7dd87d',            // 明るい緑のプレイヤー
            enemy: '#e74c3c',             // 温かい赤の敵
            merchant: '#f1c40f',          // 商人の色
            item: '#f39c12',              // 温かいオレンジのアイテム
            potion: '#9b59b6',            // 紫のポーション
            weapon: '#e67e22',            // オレンジの武器
            armor: '#3498db',             // 青の防具
            gold: '#f1c40f',              // 金色のゴールド
            stairs: '#FFFF00',            // 可視の階段は黄色
            stairsExplored: '#555500',    // 探索済みの階段は暗い黄色
            text: '#ecf0f1',              // メインテキスト色
            textSecondary: '#bdc3c7',     // セカンダリテキスト色
            ui: '#34495e'                 // UI要素色
        };

        this.fov = []; // Field of View: stores explored/visible state of each tile
        this.visibleTiles = new Set(); // Stores currently visible tile coordinates (e.g., "x,y")
    }
    
    async init() {
        this.setupEventListeners();
        this.generateDungeon();
        this.createPlayer();
        this.spawnEnemies();
        this.spawnItems();
        this.spawnTraps();
        this.addMessage(loc.t('msg_welcome', { floor: this.floor }), 'system');
        this.addMessage(loc.t('msg_find_stairs'), 'system');
        this.addMessage(loc.t('msg_audio_prompt'), 'system');
        this.render();
        this.updateUI();
        
        // Initialize audio on first user interaction
        this.audioInitialized = false;
    }
    
    async initializeAudio() {
        if (!this.audioInitialized) {
            await this.audioManager.init();
            this.audioManager.startBackgroundMusic();
            this.audioInitialized = true;
            this.addMessage(loc.t('msg_audio_enabled'), 'system');
        }
    }
    
    setupEventListeners() {
        this.commandInput = document.getElementById('commandInput');

        // コマンド入力フィールドのイベントリスナー
        this.commandInput.addEventListener('keydown', (e) => this.handleCommandInput(e));
        this.commandInput.addEventListener('focus', () => { this.isCommandInputFocused = true; });
        this.commandInput.addEventListener('blur', () => { this.isCommandInputFocused = false; });

        // 全体のキーダウンイベントリスナー（コマンド入力がフォーカスされていない場合のみ処理）
        document.addEventListener('keydown', (e) => {
            if (!this.isCommandInputFocused) {
                this.handleInput(e);
            }
        });
    }
    
    handleInput(e) {
        if (this.gameState === 'dead') return;
        
        // Initialize audio on first input
        if (!this.audioInitialized) {
            this.initializeAudio();
        }

        // 言語選択待機中の処理
        if (this.waitingForInput === 'languageSelection') {
            if (e.key === 'Escape') {
                this.waitingForInput = null; // 言語選択モードをキャンセル
                this.addMessage(loc.t('msg_language_selection_cancelled'), 'system'); // キャンセルメッセージ
                // コマンド入力フィールドをクリアするなどの処理が必要であれば追加
                this.commandInput.value = ''; // コマンド入力フィールドをクリア
                this.isCommandInputFocused = false; // フォーカスを外す
            }
            e.preventDefault(); // 数字以外のキー入力を無視
            return;
        }
        
        // インベントリUI表示中の処理
        if (this.inventoryUIActive) {
            this.handleInventoryInput(e);
            return;
        }

        // ショップUI表示中の処理
        if (this.shopUIActive) {
            this.handleShopInput(e);
            return;
        }
        
        // アイテム選択モードの処理
        if (this.itemSelectionMode) {
            this.handleItemSelection(e);
            return;
        }

        // 魔法選択モードの処理
        if (this.magicSelectionMode) {
            this.handleMagicSelection(e);
            return;
        }
        
        // Handle UI closing with Escape key
        if (e.key === 'Escape') {
            if (this.inventoryUIActive) {
                this.hideInventoryUI();
            } else if (this.shopUIActive) {
                this.hideShopUI();
            } else if (this.itemSelectionMode) {
                this.itemSelectionMode = false;
                this.addMessage(loc.t('msg_item_selection_cancelled'), 'system');
            } else if (this.magicSelectionMode) {
                this.magicSelectionMode = false;
                this.addMessage(loc.t('msg_spell_selection_cancelled'), 'system');
            }
            e.preventDefault();
            return;
        }
        
        // If no UI is active and it's not an Escape key, handle game actions
        switch (e.key) {
            case 'w':
            case 'ArrowUp':
                this.handleMovementCommand('n');
                break;
            case 's':
            case 'ArrowDown':
                this.handleMovementCommand('s');
                break;
            case 'a':
            case 'ArrowLeft':
                this.handleMovementCommand('w');
                break;
            case 'd':
            case 'ArrowRight':
                this.handleMovementCommand('e');
                break;
            case ' ': // Space
                this.player.rest();
                this.processTurn();
                this.addMessage(loc.t('cmd_rest_success'), 'system');
                break;
            case 'g':
                this.pickupItem();
                break;
            case 'i':
                this.showInventoryUI();
                break;
            case 'u':
                this.startItemSelection();
                break;
            case 'm':
                this.startMagicSelection();
                break;
            case 'b':
                this.interactWithMerchant();
                break;
            // E (装備表示) と R (装備除去) は、現在の実装ではコマンド入力が必要なため、ここでは直接処理しない
            // 1-9 (アイテム/魔法の直接選択) は、itemSelectionMode/magicSelectionMode で処理されるため、ここでは直接処理しない
            default:
                // 未処理のキーはデフォルト動作を抑制しない
                return;
        }
        e.preventDefault(); // 処理されたキーイベントのデフォルト動作を抑制
    }

    handleCommandInput(e) {
        if (e.key === 'Enter') {
            const commandText = this.commandInput.value.trim();
            if (commandText) {
                this.addMessage(`> ${commandText}`, 'command'); // Display command in message log
                this.commandHistory.unshift(commandText); // Add to history
                this.commandHistoryIndex = -1; // Reset history index
                this.commandInput.value = ''; // Clear input
                this.handleCommand(commandText); // Process command
            }
            e.preventDefault(); // Prevent form submission or other default behavior
        } else if (e.key === 'ArrowUp') {
            if (this.commandHistory.length > 0 && this.commandHistoryIndex < this.commandHistory.length - 1) {
                this.commandHistoryIndex++;
                this.commandInput.value = this.commandHistory[this.commandHistoryIndex];
                e.preventDefault();
            }
        } else if (e.key === 'ArrowDown') {
            if (this.commandHistoryIndex > 0) {
                this.commandHistoryIndex--;
                this.commandInput.value = this.commandHistory[this.commandHistoryIndex];
                e.preventDefault();
            } else if (this.commandHistoryIndex === 0) {
                this.commandHistoryIndex = -1;
                this.commandInput.value = '';
                e.preventDefault();
            }
        }
    }

    handleCommand(commandText) {
        // If waiting for a specific input, handle it first
        if (this.waitingForInput === 'languageSelection') {
            this.processLanguageSelection(commandText);
            return;
        }
        if (this.waitingForInput === 'audioVolumeSelection') {
            this.processAudioVolumeSelection(commandText);
            return;
        }

        const parts = commandText.toLowerCase().split(' ');
        const command = parts[0];
        const args = parts.slice(1);

        switch (command) {
            case 'language':
            case 'lang':
                this.handleLanguageCommand(args);
                break;
            case 'audio':
                this.handleAudioCommand(args);
                break;
            case 'move':
                if (args.length > 0) {
                    this.handleMovementCommand(args[0]);
                } else {
                    this.addMessage(loc.t('cmd_move_no_direction'), 'system');
                }
                break;
            case 'n': case 's': case 'e': case 'w': case 'ne': case 'nw': case 'se': case 'sw':
            case 'up': case 'down': case 'left': case 'right':
                this.handleMovementCommand(command);
                break;
            case 'rest':
            case 'wait':
                this.player.rest();
                this.processTurn();
                this.addMessage(loc.t('cmd_rest_success'), 'system');
                break;
            case 'get':
            case 'pickup':
                this.pickupItem();
                break;
            case 'inventory':
            case 'i':
                this.showInventoryUI();
                break;
            case 'use':
                if (args.length > 0) {
                    const itemIdentifier = args.join(' ');
                    this.handleUseItemCommand(itemIdentifier);
                } else {
                    this.addMessage(loc.t('cmd_use_no_item'), 'system');
                }
                break;
            case 'magic':
            case 'm':
                this.startMagicSelection();
                break;
            case 'equip':
                if (args.length > 0) {
                    const itemIdentifier = args.join(' ');
                    this.handleEquipItemCommand(itemIdentifier);
                } else {
                    this.addMessage(loc.t('cmd_equip_no_item'), 'system');
                }
                break;
            case 'unequip':
                if (args.length > 0) {
                    this.handleUnequipCommand(args[0]);
                } else {
                    this.addMessage(loc.t('cmd_unequip_no_slot'), 'system');
                }
                break;
            case 'shop':
            case 'b':
                this.interactWithMerchant();
                break;
            case 'save':
                this.saveGame();
                break;
            case 'load':
                this.loadGame();
                break;
            case 'help':
                this.addMessage(loc.t('cmd_help_message'), 'system');
                this.addMessage(loc.t('cmd_help_list'), 'system');
                break;
            // Add other commands here later
            default:
                this.addMessage(loc.t('cmd_unknown_command', { command: commandText }), 'system');
                break;
        }
    }

    handleLanguageCommand(args) {
        if (args.length === 0) {
            this.addMessage(loc.t('cmd_lang_prompt'), 'system');
            this.addMessage('1. English', 'system'); // Removed (en)
            this.addMessage('2. 日本語', 'system'); // Removed (ja)
            this.waitingForInput = 'languageSelection'; // Set state to wait for selection
            return;
        }

        // If arguments are provided directly, process them as before (e.g., "language en")
        const selection = args[0];
        if (selection === '1' || selection === 'en') {
            loc.setLanguage('en');
            this.addMessage(loc.t('cmd_lang_set', { lang: 'English' }), 'system');
        } else if (selection === '2' || selection === 'ja') {
            loc.setLanguage('ja');
            this.addMessage(loc.t('cmd_lang_set', { lang: '日本語' }), 'system');
        } else {
            this.addMessage(loc.t('cmd_lang_invalid'), 'system');
        }
        this.waitingForInput = null; // Reset state
    }

    processLanguageSelection(selection) {
        this.waitingForInput = null; // Reset state immediately

        switch (selection.trim()) {
            case '1':
                loc.setLanguage('en');
                this.addMessage(loc.t('cmd_lang_set', { lang: 'English' }), 'system');
                break;
            case '2':
                loc.setLanguage('ja');
                this.addMessage(loc.t('cmd_lang_set', { lang: '日本語' }), 'system');
                break;
            default:
                this.addMessage(loc.t('cmd_lang_invalid'), 'system');
                break;
        }
    }

    handleAudioCommand(args) {
        const subCommand = args[0];
        const value = args[1];

        if (!subCommand) {
            this.addMessage(loc.t('cmd_audio_help'), 'system');
            return;
        }

        switch (subCommand.toLowerCase()) {
            case 'mute':
                if (!this.audioManager.getMuteState()) {
                    this.audioManager.toggleMute();
                    this.addMessage(loc.t('cmd_audio_mute_on'), 'system');
                } else {
                    this.addMessage(loc.t('cmd_audio_already_muted'), 'system');
                }
                break;
            case 'unmute':
                if (this.audioManager.getMuteState()) {
                    this.audioManager.toggleMute();
                    this.addMessage(loc.t('cmd_audio_mute_off'), 'system');
                } else {
                    this.addMessage(loc.t('cmd_audio_already_unmuted'), 'system');
                }
                break;
            case 'volume':
                if (value === undefined) {
                    this.addMessage(loc.t('cmd_audio_volume_current', { volume: Math.round(this.audioManager.masterVolume * 100) }), 'system');
                    this.addMessage(loc.t('cmd_audio_volume_prompt'), 'system');
                    this.waitingForInput = 'audioVolumeSelection';
                } else {
                    this.processAudioVolumeSelection(value);
                }
                break;
            default:
                this.addMessage(loc.t('cmd_audio_invalid_subcommand'), 'system');
                break;
        }
    }

    processAudioVolumeSelection(input) {
        this.waitingForInput = null; // Reset state immediately

        const volume = parseInt(input);
        if (!isNaN(volume) && volume >= 0 && volume <= 100) {
            this.audioManager.setVolume(volume / 100);
            this.addMessage(loc.t('cmd_audio_volume_set', { volume: volume }), 'system');
        } else {
            this.addMessage(loc.t('cmd_audio_volume_invalid'), 'system');
        }
    }

    handleMovementCommand(direction) {
        let dx = 0;
        let dy = 0;
        let moved = false;

        switch (direction) {
            case 'n': case 'north': case 'up':
                dy = -1; moved = true; break;
            case 's': case 'south': case 'down':
                dy = 1; moved = true; break;
            case 'e': case 'east': case 'right':
                dx = 1; moved = true; break;
            case 'w': case 'west': case 'left':
                dx = -1; moved = true; break;
            case 'ne': case 'northeast':
                dx = 1; dy = -1; moved = true; break;
            case 'nw': case 'northwest':
                dx = -1; dy = -1; moved = true; break;
            case 'se': case 'southeast':
                dx = 1; dy = 1; moved = true; break;
            case 'sw': case 'southwest':
                dx = -1; dy = 1; moved = true; break;
        }

        if (moved) {
            this.movePlayer(dx, dy);
        } else {
            this.addMessage(loc.t('cmd_move_invalid_direction'), 'system');
        }
    }

    handleUseItemCommand(itemIdentifier) {
        const index = parseInt(itemIdentifier) - 1;
        let item = null;

        if (!isNaN(index) && index >= 0 && index < this.player.inventory.length) {
            item = this.player.inventory[index];
        } else {
            // Try to find by name
            item = this.player.inventory.find(i => i.name.toLowerCase() === itemIdentifier.toLowerCase());
        }

        if (item) {
            this.useItemByIndex(this.player.inventory.indexOf(item));
        } else {
            this.addMessage(loc.t('cmd_use_item_not_found', { item_name: itemIdentifier }), 'system');
        }
    }

    handleEquipItemCommand(itemIdentifier) {
        const index = parseInt(itemIdentifier) - 1;
        let item = null;

        if (!isNaN(index) && index >= 0 && index < this.player.inventory.length) {
            item = this.player.inventory[index];
        } else {
            // Try to find by name
            item = this.player.inventory.find(i => i.name.toLowerCase() === itemIdentifier.toLowerCase());
        }

        if (item) {
            this.equipItem(item);
        } else {
            this.addMessage(loc.t('cmd_equip_item_not_found', { item_name: itemIdentifier }), 'system');
        }
    }

    handleUnequipCommand(slot) {
        const validSlots = ['weapon', 'armor', 'shield'];
        if (validSlots.includes(slot.toLowerCase())) {
            this.unequipItem(slot.toLowerCase());
        } else {
            this.addMessage(loc.t('cmd_unequip_invalid_slot', { slot: slot }), 'system');
        }
    }
    
    getTrapAt(x, y) {
        return this.traps.find(trap => trap.x === x && trap.y === y);
    }

    triggerTrap(trap) {
        if (trap.triggered) return;

        this.addMessage(loc.t('msg_trap_encountered'), 'system'); // Add this line

        // Saving throw based on Dexterity
        const saveChance = this.player.dexterity * 1.5; // 10 DEX = 15% chance
        if (Math.random() * 100 < saveChance) {
            this.addMessage(loc.t('msg_trap_avoided'), 'system');
            // Trap is still triggered and becomes visible, but has no effect
            trap.triggered = true;
            trap.visible = true;
            this.render(); // Re-render to show the visible trap
            return;
        }

        trap.triggered = true;
        trap.visible = true;
        this.audioManager.playSound('magic');

        switch (trap.type) {
            case 'damage':
                const damage = trap.damage;
                this.player.hp -= damage;
                this.addMessage(loc.t('msg_trap_damage', { trap_name: trap.name, damage: damage }), 'combat');
                if (this.player.hp <= 0) {
                    this.player.hp = 0;
                    this.updateUI();
                    this.gameOver(loc.t('msg_trap_killer', { trap_name: trap.name })); // Need to add this key
                }
                break;
            case 'teleport':
                this.addMessage(loc.t('msg_trap_teleport', { trap_name: trap.name }), 'system');
                const targetRoom = this.rooms[this.random(0, this.rooms.length)];
                let newX, newY;
                let attempts = 0;
                do {
                    newX = this.random(targetRoom.x, targetRoom.x + targetRoom.width);
                    newY = this.random(targetRoom.y, targetRoom.y + targetRoom.height);
                    attempts++;
                } while (this.dungeon[newY][newX] !== '.' && attempts < 50);
                
                this.player.x = newX;
                this.player.y = newY;
                break;
            case 'alarm':
                this.addMessage(loc.t('msg_trap_alarm', { trap_name: trap.name }), 'system');
                break;
        }
    }

    movePlayer(dx, dy) {
        // Check if player is paralyzed
        if (this.player.statusEffects && this.player.statusEffects.paralyzed && 
            this.turn < this.player.statusEffects.paralyzed) {
            this.addMessage(loc.t('msg_paralyzed'));
            this.processTurn(); // Still process the turn even if paralyzed
            return;
        }
        
        // Apply confusion effect to movement
        if (this.player.statusEffects && this.player.statusEffects.confused && 
            this.turn < this.player.statusEffects.confused) {
            // 50% chance to move in a random direction when confused
            if (Math.random() < 0.5) {
                const directions = [
                    {x: -1, y: 0}, {x: 1, y: 0}, {x: 0, y: -1}, {x: 0, y: 1},
                    {x: -1, y: -1}, {x: 1, y: -1}, {x: -1, y: 1}, {x: 1, y: 1}
                ];
                const randomDir = directions[Math.floor(Math.random() * directions.length)];
                dx = randomDir.x;
                dy = randomDir.y;
                this.addMessage(loc.t('msg_confused'));
            }
        }
        
        const newX = this.player.x + dx;
        const newY = this.player.y + dy;
        
        if (!this.isValidMove(newX, newY)) return;

        // 罠のチェック
        const trap = this.getTrapAt(newX, newY);
        if (trap) {
            const originalPlayerX = this.player.x;
            const originalPlayerY = this.player.y;

            this.triggerTrap(trap);
            if (this.gameState === 'dead') return; // 罠で死んだら即終了

            // If player was teleported by the trap, skip normal movement
            if (this.player.x !== originalPlayerX || this.player.y !== originalPlayerY) {
                this.processTurn(); // Process turn after teleport
                return;
            }
        }
        
        // Check for enemies
        const enemy = this.getEnemyAt(newX, newY);
        if (enemy) {
            this.combat(this.player, enemy);
            this.processTurn();
            return;
        }
        
        // Move player
        this.player.x = newX;
        this.player.y = newY;
        
        // Play footstep sound
        this.audioManager.playSound('footstep');
        
        // Check for stairs
        if (this.dungeon[newY][newX] === '%') {
            this.descendStairs();
        }
        
        this.processTurn();
    }
    
    isValidMove(x, y) {
        if (x < 0 || x >= this.mapWidth || y < 0 || y >= this.mapHeight) {
            return false;
        }
        
        const tile = this.dungeon[y][x];
        return tile === '.' || tile === '%'; // floor or stairs
    }
    
    getEnemyAt(x, y) {
        return this.entities.find(entity => 
            entity.type === 'enemy' && entity.x === x && entity.y === y && entity.alive
        );
    }
    
    combat(attacker, defender) {
        const damage = Math.max(1, attacker.attack - defender.defense + this.random(-2, 3));
        defender.hp -= damage;
        
        // Play combat sounds
        if (attacker === this.player) {
            this.audioManager.playSound('swordHit');
            this.addMessage(loc.t('msg_combat_hit_player', { defender_name: defender.name, damage: damage }), 'combat');
        } else {
            this.audioManager.playSound('hurt');
            this.addMessage(loc.t('msg_combat_hit_enemy', { attacker_name: attacker.name, damage: damage }), 'combat');
        }
        
        // Process special attacks when monsters attack the player
        if (attacker.type === 'enemy' && defender === this.player) {
            this.processSpecialAttacks(attacker, defender);
        }
        
        if (defender.hp <= 0) {
            defender.alive = false;
            if (defender === this.player) {
                this.audioManager.playSound('death');
                this.gameOver(attacker.name); // 殺したモンスターの名前を渡す
            } else {
                this.audioManager.playSound('enemyDeath');
                this.addMessage(loc.t('msg_enemy_dies', { defender_name: defender.name }), 'combat');
                console.log(`DEBUG: Before exp gain - Player exp: ${this.player.experience}, Monster exp: ${defender.experience}`);
                this.player.experience += defender.experience;
                console.log(`DEBUG: After exp gain - Player exp: ${this.player.experience}, Needed: ${this.player.experienceToNext}`);
                this.player.gold += defender.gold;
                this.checkLevelUp();
            }
        }
    }
    
    processSpecialAttacks(attacker, defender) {
        // Poison attacks
        if (attacker.specialAttacks && attacker.specialAttacks.includes('poison')) {
            if (Math.random() < 0.25) { // 25% chance
                if (!defender.statusEffects) defender.statusEffects = {};
                defender.statusEffects.poisoned = this.turn + 5; // Lasts 5 turns
                this.audioManager.playSound('poison');
                this.addMessage(loc.t('msg_poison_weakens', { attacker_name: attacker.name }));
            }
        }
        
        // Paralysis attacks
        if (attacker.specialAttacks && attacker.specialAttacks.includes('hold')) {
            if (Math.random() < 0.15) { // 15% chance
                if (!defender.statusEffects) defender.statusEffects = {};
                defender.statusEffects.paralyzed = this.turn + 3; // Lasts 3 turns
                this.audioManager.playSound('magic');
                this.addMessage(loc.t('msg_paralyzes_you', { attacker_name: attacker.name }));
            }
        }
        
        // Confusion attacks (like Medusa)
        if (attacker.specialAttacks && attacker.specialAttacks.includes('confusion')) {
            if (Math.random() < 0.20) { // 20% chance
                if (!defender.statusEffects) defender.statusEffects = {};
                defender.statusEffects.confused = this.turn + 4; // Lasts 4 turns
                this.audioManager.playSound('magic');
                this.addMessage(loc.t('msg_confuses_you', { attacker_name: attacker.name }));
            }
        }
        
        // Draining attacks (Wraith, Vampire)
        if (attacker.specialAttacks && attacker.specialAttacks.includes('drain')) {
            if (Math.random() < 0.30) { // 30% chance
                const drainAmount = Math.floor(Math.random() * 3) + 1;
                defender.maxHp = Math.max(10, defender.maxHp - drainAmount);
                if (defender.hp > defender.maxHp) defender.hp = defender.maxHp;
                this.audioManager.playSound('drain');
                this.addMessage(loc.t('msg_drains_life', { attacker_name: attacker.name }));
            }
        }
        
        // Rust attacks (Aquator)
        if (attacker.specialAttacks && attacker.specialAttacks.includes('rust')) {
            if (Math.random() < 0.20 && defender.equippedArmor) { // 20% chance
                defender.equippedArmor.defense = Math.max(0, defender.equippedArmor.defense - 1);
                this.audioManager.playSound('metalBreak');
                this.addMessage(loc.t('msg_acid_damages_armor', { attacker_name: attacker.name }));
                this.updatePlayerStats();
            }
        }
        
        // Steal attacks (Leprechaun, Nymph)
        if (attacker.canSteal && Math.random() < 0.15) { // 15% chance
            if (attacker.name === 'Nymph') {
                // Nymph steals all gold
                if (defender.gold > 0) {
                    this.audioManager.playSound('steal');
                    this.addMessage(loc.t('msg_steal_all_gold', { thief_name: attacker.name }));
                    defender.gold = 0;
                }
            } else {
                // Leprechaun steals some gold
                const stolenGold = Math.min(defender.gold, Math.floor(Math.random() * 50) + 10);
                if (stolenGold > 0) {
                    defender.gold -= stolenGold;
                    this.audioManager.playSound('steal');
                    this.addMessage(loc.t('msg_steal_gold', { thief_name: attacker.name, stolen_gold: stolenGold }));
                }
            }
        }
    }
    
    processTurn() {
        // Update projectiles before enemies move
        this.updateProjectiles();

        // Process player status effects first
        this.processPlayerStatusEffects();
        
        // Process monster special abilities
        this.processMonsterAbilities();
        
        // Enemy AI
        this.entities.forEach(enemy => {
            if (enemy.type === 'enemy' && enemy.alive) {
                this.moveEnemyTowardsPlayer(enemy);
            }
        });
        
        this.turn++;
        this.render();
        this.updateUI();
    }
    
    processPlayerStatusEffects() {
        if (!this.player.statusEffects) return;
        
        // Process poison
        if (this.player.statusEffects.poisoned && this.turn >= this.player.statusEffects.poisoned) {
            delete this.player.statusEffects.poisoned;
            this.addMessage(loc.t('msg_poison_wears_off'));
        } else if (this.player.statusEffects.poisoned) {
            // Take poison damage
            const poisonDamage = Math.floor(Math.random() * 3) + 1;
            this.player.hp = Math.max(1, this.player.hp - poisonDamage);
            this.audioManager.playSound('hurt');
            this.addMessage(loc.t('msg_poison_damage', { damage: poisonDamage }));
        }
        
        // Process paralysis
        if (this.player.statusEffects.paralyzed && this.turn >= this.player.statusEffects.paralyzed) {
            delete this.player.statusEffects.paralyzed;
            this.addMessage(loc.t('msg_paralysis_wears_off'));
        }
        
        // Process confusion
        if (this.player.statusEffects.confused && this.turn >= this.player.statusEffects.confused) {
            delete this.player.statusEffects.confused;
            this.addMessage(loc.t('msg_confusion_wears_off'));
        }
    }
    
    processMonsterAbilities() {
        this.entities.forEach(enemy => {
            if (enemy.type === 'enemy' && enemy.alive) {
                // Regeneration ability - heal every 4-8 turns
                if (enemy.canRegenerate && 
                    (!enemy.lastRegenTurn || this.turn - enemy.lastRegenTurn >= (4 + Math.floor(Math.random() * 5)))) {
                    const regenAmount = Math.floor(enemy.maxHp * 0.1); // 10% of max HP
                    if (enemy.hp < enemy.maxHp) {
                        enemy.hp = Math.min(enemy.maxHp, enemy.hp + regenAmount);
                        enemy.lastRegenTurn = this.turn;
                        
                        // Show regeneration message if player can see the monster
                        if (this.isMonsterVisible(enemy)) {
                            this.addMessage(loc.t('msg_enemy_regenerates', { enemy_name: enemy.name }));
                        }
                    }
                }
                
                // Invisibility processing - monsters randomly become visible/invisible
                if (enemy.hasInvisibility) {
                    if (Math.random() < 0.05) { // 5% chance per turn to change visibility
                        enemy.isInvisible = !enemy.isInvisible;
                        if (this.isMonsterVisible(enemy) && !enemy.isInvisible) {
                            this.addMessage(loc.t('msg_enemy_appears', { enemy_name: enemy.name }));
                        }
                    }
                }
                
                // Mean monsters become more aggressive when hurt
                if (enemy.isMean && enemy.hp < enemy.maxHp * 0.5) {
                    enemy.speed = enemy.baseSpeed * 1.5; // Move faster when hurt
                }
            }
        });
    }
    
    isMonsterVisible(monster) {
        // Calculate distance to player
        const distance = Math.abs(this.player.x - monster.x) + Math.abs(this.player.y - monster.y);
        
        // Invisible monsters are harder to see
        if (monster.isInvisible) {
            return distance <= 1 && Math.random() < 0.3; // 30% chance to see adjacent invisible monsters
        }
        
        // Normal visibility based on distance and lighting
        return distance <= 8; // Can see monsters within 8 tiles
    }
    
    moveEnemyTowardsPlayer(enemy) {
        // Skip turn occasionally for some monsters (representing confusion, hesitation, etc.)
        if (enemy.isMean && Math.random() < 0.1) {
            return; // Mean monsters sometimes pause to strategize
        }
        
        const dx = Math.sign(this.player.x - enemy.x);
        const dy = Math.sign(this.player.y - enemy.y);
        
        // Check if enemy is adjacent to player
        if (Math.abs(this.player.x - enemy.x) <= 1 && Math.abs(this.player.y - enemy.y) <= 1) {
            this.combat(enemy, this.player);
            return;
        }
        
        // Try to move towards player
        let newX = enemy.x;
        let newY = enemy.y;
        
        // Flying monsters can move over certain obstacles
        const canMoveOverObstacles = enemy.canFly;
        
        if (Math.random() < 0.5) {
            if (dx !== 0 && this.isValidMoveForEnemy(enemy.x + dx, enemy.y, canMoveOverObstacles) && 
                !this.getEnemyAt(enemy.x + dx, enemy.y)) {
                newX = enemy.x + dx;
            } else if (dy !== 0 && this.isValidMoveForEnemy(enemy.x, enemy.y + dy, canMoveOverObstacles) && 
                       !this.getEnemyAt(enemy.x, enemy.y + dy)) {
                newY = enemy.y + dy;
            }
        } else {
            if (dy !== 0 && this.isValidMoveForEnemy(enemy.x, enemy.y + dy, canMoveOverObstacles) && 
                !this.getEnemyAt(enemy.x, enemy.y + dy)) {
                newY = enemy.y + dy;
            } else if (dx !== 0 && this.isValidMoveForEnemy(enemy.x + dx, enemy.y, canMoveOverObstacles) && 
                       !this.getEnemyAt(enemy.x + dx, enemy.y)) {
                newX = enemy.x + dx;
            }
        }
        
        // Special behavior for thieves - try to steal and run away
        if (enemy.canSteal && Math.abs(this.player.x - newX) <= 1 && Math.abs(this.player.y - newY) <= 1) {
            if (Math.random() < 0.3) { // 30% chance to attempt theft
                this.attemptTheft(enemy);
                return; // Don't move after stealing attempt
            }
        }
        
        enemy.x = newX;
        enemy.y = newY;
    }
    
    isValidMoveForEnemy(x, y, canFly) {
        if (x < 0 || x >= this.mapWidth || y < 0 || y >= this.mapHeight) return false;
        
        const cell = this.dungeon[y][x];
        
        // Flying enemies can move over some obstacles
        if (canFly) {
            return cell !== '#'; // Can't fly through solid walls
        }
        
        // Ground enemies follow normal movement rules
        return this.isValidMove(x, y);
    }
    
    attemptTheft(thief) {
        if (this.player.inventory.length === 0) {
            this.addMessage(loc.t('msg_steal_nothing', { thief_name: thief.name }));
            return;
        }
        
        // Steal a random item
        const stolenIndex = Math.floor(Math.random() * this.player.inventory.length);
        const stolenItem = this.player.inventory[stolenIndex];
        
        this.player.inventory.splice(stolenIndex, 1);
        this.addMessage(loc.t('msg_thief_steals_item', { thief_name: thief.name, item_name: stolenItem.name }));
        
        // Thief tries to run away after stealing
        const escapeDirections = [
            {x: -1, y: 0}, {x: 1, y: 0}, {x: 0, y: -1}, {x: 0, y: 1},
            {x: -1, y: -1}, {x: 1, y: -1}, {x: -1, y: 1}, {x: 1, y: 1}
        ];
        
        // Move away from player
        for (let dir of escapeDirections) {
            const newX = thief.x + dir.x;
            const newY = thief.y + dir.y;
            
            if (this.isValidMoveForEnemy(newX, newY, thief.canFly) && !this.getEnemyAt(newX, newY)) {
                // Move further from player
                const currentDist = Math.abs(this.player.x - thief.x) + Math.abs(this.player.y - thief.y);
                const newDist = Math.abs(this.player.x - newX) + Math.abs(this.player.y - newY);
                
                if (newDist > currentDist) {
                    thief.x = newX;
                    thief.y = newY;
                    break;
                }
            }
        }
    }
    
    generateDungeon() {
        this.shopRoom = null;
        // Initialize with walls
        this.dungeon = Array(this.mapHeight).fill().map(() => Array(this.mapWidth).fill('#'));
        
        const rooms = [];
        const numRooms = this.random(5, 10);
        
        // Generate rooms
        for (let i = 0; i < numRooms; i++) {
            const width = this.random(4, 8);
            const height = this.random(4, 8);
            const x = this.random(1, this.mapWidth - width - 1);
            const y = this.random(1, this.mapHeight - height - 1);
            
            const room = { x, y, width, height, isShop: false };
            
            // Check for overlap
            if (!rooms.some(r => this.roomsOverlap(room, r))) {
                this.carveRoom(room);
                rooms.push(room);
            }
        }
        
        // Connect rooms with corridors
        for (let i = 1; i < rooms.length; i++) {
            this.connectRooms(rooms[i-1], rooms[i]);
        }

        // Designate a shop room (20% chance, not on floor 1)
        if (this.floor > 1 && Math.random() < 0.2 && rooms.length > 2) {
            // Avoid first and last room
            const shopRoomIndex = this.random(1, rooms.length - 1);
            this.shopRoom = rooms[shopRoomIndex];
            this.shopRoom.isShop = true;

            // Spawn merchant
            const merchantX = this.shopRoom.x + Math.floor(this.shopRoom.width / 2);
            const merchantY = this.shopRoom.y + Math.floor(this.shopRoom.height / 2);
            this.entities.push({
                name: 'Merchant',
                symbol: '&',
                type: 'npc',
                x: merchantX,
                y: merchantY,
                color: this.colors.merchant,
                alive: true, // for rendering purposes
            });
        }
        
        // Place stairs in last room
        if (rooms.length > 0) {
            let lastRoom = rooms[rooms.length - 1];
            // Avoid placing stairs in a shop
            if (lastRoom.isShop && rooms.length > 1) {
                lastRoom = rooms[rooms.length - 2];
            }
            const stairX = lastRoom.x + Math.floor(lastRoom.width / 2);
            const stairY = lastRoom.y + Math.floor(lastRoom.height / 2);
            this.dungeon[stairY][stairX] = '%';
        }
        
        this.rooms = rooms;
    }
    
    roomsOverlap(room1, room2) {
        return !(room1.x + room1.width < room2.x || 
                room2.x + room2.width < room1.x ||
                room1.y + room1.height < room2.y ||
                room2.y + room2.height < room1.y);
    }
    
    carveRoom(room) {
        for (let y = room.y; y < room.y + room.height; y++) {
            for (let x = room.x; x < room.x + room.width; x++) {
                this.dungeon[y][x] = '.';
            }
        }
    }
    
    connectRooms(room1, room2) {
        const x1 = room1.x + Math.floor(room1.width / 2);
        const y1 = room1.y + Math.floor(room1.height / 2);
        const x2 = room2.x + Math.floor(room2.width / 2);
        const y2 = room2.y + Math.floor(room2.height / 2);
        
        // Horizontal corridor
        const startX = Math.min(x1, x2);
        const endX = Math.max(x1, x2);
        for (let x = startX; x <= endX; x++) {
            this.dungeon[y1][x] = '.';
        }
        
        // Vertical corridor
        const startY = Math.min(y1, y2);
        const endY = Math.max(y1, y2);
        for (let y = startY; y <= endY; y++) {
            this.dungeon[y][x2] = '.';
        }
    }
    
    createPlayer() {
        const firstRoom = this.rooms[0];
        this.player = {
            x: firstRoom.x + Math.floor(firstRoom.width / 2),
            y: firstRoom.y + Math.floor(firstRoom.height / 2),
            hp: 100,
            maxHp: 100,
            mp: 50,
            maxMp: 50,
            baseAttack: 10,  // 基本攻撃力
            baseDefense: 5,  // 基本防御力
            attack: 10,      // 計算後攻撃力
            defense: 5,      // 計算後防御力
            baseDexterity: 10, // 基本器用さ
            dexterity: 10,     // 計算後器用さ
            level: 1,
            experience: 0,
            experienceToNext: 100,
            gold: 0,
            inventory: [],
            spells: ['heal', 'fireball'], // 習得済みの魔法
            equipment: {     // 装備スロット
                weapon: null,
                armor: null,
                shield: null
            },
            symbol: '@',
            color: this.colors.player,
            rest: function() {
                this.hp = Math.min(this.maxHp, this.hp + 2);
                this.mp = Math.min(this.maxMp, this.mp + 1);
            }
        };
    }

    calculateFOV() {
        // Reset visible tiles for current turn
        this.visibleTiles.clear();

        // Ensure fov array is initialized for the current dungeon
        if (this.fov.length === 0 || this.fov.length !== this.mapHeight || this.fov[0].length !== this.mapWidth) {
            this.fov = Array(this.mapHeight).fill(0).map(() => Array(this.mapWidth).fill(false));
        }

        const playerX = this.player.x;
        const playerY = this.player.y;
        const fovRange = 4; // User specified 4 tiles

        // Mark player's tile as visible and explored
        this.fov[playerY][playerX] = true;
        this.visibleTiles.add(`${playerX},${playerY}`);

        // Iterate through all tiles in a square around the player
        for (let y = playerY - fovRange; y <= playerY + fovRange; y++) {
            for (let x = playerX - fovRange; x <= playerX + fovRange; x++) {
                // Check map bounds
                if (x < 0 || x >= this.mapWidth || y < 0 || y >= this.mapHeight) {
                    continue;
                }

                // Check distance (circular FOV)
                const distance = Math.sqrt(Math.pow(x - playerX, 2) + Math.pow(y - playerY, 2));
                if (distance > fovRange) {
                    continue;
                }

                // Perform raycasting from player to (x, y)
                if (this.hasLineOfSight(playerX, playerY, x, y)) {
                    this.fov[y][x] = true;
                    this.visibleTiles.add(`${x},${y}`);
                }
            }
        }
    }

    // Bresenham's Line Algorithm (simplified for LOS checking)
    hasLineOfSight(x0, y0, x1, y1) {
        let dx = Math.abs(x1 - x0);
        let dy = Math.abs(y1 - y0);
        let sx = (x0 < x1) ? 1 : -1;
        let sy = (y0 < y1) ? 1 : -1;
        let err = dx - dy;

        while (true) {
            // If current tile is a wall and not the starting point or ending point, block LOS
            if (this.dungeon[y0][x0] === '#' && !(x0 === this.player.x && y0 === this.player.y) && !(x0 === x1 && y0 === y1)) {
                return false;
            }

            if (x0 === x1 && y0 === y1) {
                break;
            }
            let e2 = 2 * err;
            if (e2 > -dy) { err -= dy; x0 += sx; }
            if (e2 < dx) { err += dx; y0 += sy; }
        }
        return true;
    }
    
    spawnEnemies() {
        // 新しい強化モンスターシステムを使用
        // Spawn enemies in rooms (except first room and shop room)
        for (let i = 1; i < this.rooms.length; i++) {
            const room = this.rooms[i];
            if (room.isShop) continue; // Don't spawn enemies in the shop

            // 階層が上がると敵の数も増える
            const numEnemies = this.random(1, Math.min(4, 2 + Math.floor(this.floor / 3)));
            
            for (let j = 0; j < numEnemies; j++) {
                const x = this.random(room.x + 1, room.x + room.width - 1);
                const y = this.random(room.y + 1, room.y + room.height - 1);
                
                if (this.dungeon[y][x] === '.' && !this.getEnemyAt(x, y)) {
                    // 強化モンスターシステムで敵を生成
                    const enemy = this.createEnhancedMonster(x, y, this.floor);
                    this.entities.push(enemy);
                }
            }
        }
    }
    
    spawnItems() {
        // Filter out gold coins for random spawns, and filter by floor/rarity
        const availableItemTemplates = itemTemplates.filter(template => 
            template.type !== 'gold' && 
            (template.rarity === undefined || (this.floor >= 1 && template.rarity === 'common') || (this.floor >= 5 && template.rarity === 'uncommon') || (this.floor >= 10 && template.rarity === 'rare'))
        );

        // Spawn items randomly in rooms
        this.rooms.forEach(room => {
            if (Math.random() < 0.6 && availableItemTemplates.length > 0) { // 60% chance per room
                const template = availableItemTemplates[this.random(0, availableItemTemplates.length)];
                const x = this.random(room.x + 1, room.x + room.width - 1);
                const y = this.random(room.y + 1, room.y + room.height - 1);
                
                if (this.dungeon[y][x] === '.') {
                    this.items.push({
                        ...template,
                        name: loc.t(template.nameKey), // Localize name
                        x, y,
                        id: this.nextItemId++ // グローバルカウンターでユニークID生成
                    });
                }
            }
        });
    }
    
    spawnTraps() {
        this.traps = [];
        const trapTypes = [
            { name: 'Spike Trap', type: 'damage', damage: 10, symbol: '^', color: '#e74c3c' },
            { name: 'Teleport Trap', type: 'teleport', symbol: '^', color: '#9b59b6' },
            { name: 'Alarm Trap', type: 'alarm', symbol: '^', color: '#f39c12' }
        ];

        // フロア全体に一定数の罠を配置
        const floorTiles = [];
        for (let y = 0; y < this.mapHeight; y++) {
            for (let x = 0; x < this.mapWidth; x++) {
                if (this.dungeon[y][x] === '.') {
                    floorTiles.push({x, y});
                }
            }
        }

        const numTraps = Math.floor(floorTiles.length * 0.03); // 床タイルの3%を罠にする
        for (let i = 0; i < numTraps; i++) {
            const tile = floorTiles[this.random(0, floorTiles.length)];
            
            if (tile && !this.getTrapAt(tile.x, tile.y)) {
                const trapType = trapTypes[this.random(0, trapTypes.length)];
                this.traps.push({
                    ...trapType,
                    x: tile.x,
                    y: tile.y,
                    triggered: false,
                    visible: false
                });
            }
        }
    }

    pickupItem() {
        const item = this.items.find(item => 
            item.x === this.player.x && item.y === this.player.y
        );
        
        if (item) {
            if (item.type === 'gold') {
                this.player.gold += item.value;
                this.audioManager.playSound('gold');
                this.addMessage(loc.t('msg_pickup_gold', { value: item.value }), 'item');
            } else {
                // インベントリに追加する際に新しいIDを割り当て（重複防止）
                const inventoryItem = {
                    ...item,
                    id: this.nextItemId++
                };
                this.player.inventory.push(inventoryItem);
                this.audioManager.playSound('itemPickup');
                this.addMessage(loc.t('msg_pickup_item', { item_name: item.name }), 'item');
            }
            
            this.items = this.items.filter(i => i.id !== item.id);
            this.processTurn();
        } else {
            this.addMessage(loc.t('msg_nothing_to_pickup'), 'system');
        }
    }
    
    useItem() {
        // ポーションを最優先で使用
        const potion = this.player.inventory.find(item => item.type === 'potion');
        if (potion) {
            if (potion.effect === 'heal') {
                this.player.hp = Math.min(this.player.maxHp, this.player.hp + potion.value);
                this.addMessage(loc.t('msg_drink_hp_potion', { potion_name: potion.name, value: potion.value }), 'item');
            } else if (potion.effect === 'mana') {
                this.player.mp = Math.min(this.player.maxMp, this.player.mp + potion.value);
                this.addMessage(loc.t('msg_drink_mp_potion', { potion_name: potion.name, value: potion.value }), 'item');
            }
            
            this.removeItemFromInventory(potion.id);
            this.processTurn();
            return;
        }
        
        // ポーションがない場合は装備アイテムを装備
        const equipableItem = this.player.inventory.find(item => 
            item.type === 'weapon' || item.type === 'armor'
        );
        
        if (equipableItem) {
            this.equipItem(equipableItem);
        } else {
            this.addMessage(loc.t('msg_no_usable_items'), 'system');
        }
    }
    
    // 新しいアイテム選択システム
    startItemSelection() {
        if (this.player.inventory.length === 0) {
            this.addMessage(loc.t('msg_inventory_empty'), 'system');
            return;
        }
        
        this.itemSelectionMode = true;
        this.addMessage(loc.t('msg_select_item_to_use'), 'system');
        
        this.player.inventory.forEach((item, index) => {
            const keyNumber = index + 1;
            let description = `${keyNumber}: ${item.symbol} ${item.name}`;
            
            if (item.type === 'potion') {
                description += ` (${item.effect === 'heal' ? 'HP' : 'MP'} +${item.value})`;
            } else if (item.type === 'weapon') {
                description += ` (Attack +${item.attack})`;
            } else if (item.type === 'armor') {
                description += ` (Defense +${item.defense})`;
            }
            
            this.addMessage(description, 'item');
        });
        
        this.addMessage(loc.t('msg_item_selection_prompt'), 'system');
    }
    
    handleItemSelection(e) {
        const key = e.key.toLowerCase();
        
        if (key === 'escape') {
            this.itemSelectionMode = false;
            this.addMessage(loc.t('msg_item_selection_cancelled'), 'system');
            e.preventDefault();
            return;
        }
        
        // 数字キーの処理
        if (key >= '1' && key <= '9') {
            const index = parseInt(key) - 1;
            this.useItemByIndex(index);
            this.itemSelectionMode = false;
        }
        
        e.preventDefault();
    }
    
    useItemByIndex(index) {
        if (index < 0 || index >= this.player.inventory.length) {
            if (this.itemSelectionMode) {
                this.addMessage(loc.t('msg_invalid_item_number'), 'system');
            }
            return;
        }
        
        const item = this.player.inventory[index];
        
        if (item.type === 'potion') {
            if (item.effect === 'heal') {
                if (this.player.hp >= this.player.maxHp) {
                    this.addMessage(loc.t('msg_hp_full'), 'system');
                    return;
                }
                this.player.hp = Math.min(this.player.maxHp, this.player.hp + item.value);
                this.audioManager.playSound('heal');
                this.addMessage(loc.t('msg_drink_hp_potion', { potion_name: item.name, value: item.value }), 'item');
            } else if (item.effect === 'mana') {
                if (this.player.mp >= this.player.maxMp) {
                    this.addMessage(loc.t('msg_mp_full'), 'system');
                    return;
                }
                this.player.mp = Math.min(this.player.maxMp, this.player.mp + item.value);
                this.audioManager.playSound('mana');
                this.addMessage(loc.t('msg_drink_mp_potion', { potion_name: item.name, value: item.value }), 'item');
            }
            
            // ポーションのみ、使用後にインベントリから削除
            this.removeItemFromInventory(item.id);
            this.processTurn();
            
        } else if (item.type === 'weapon' || item.type === 'armor') {
            // 装備アイテムの場合は equipItem メソッドに処理を委任
            // equipItem 内でインベントリからの削除も処理される
            this.equipItem(item);
            
        } else {
            this.addMessage(loc.t('msg_cannot_use_item'), 'system');
        }
    }

    // ===== 魔法システム =====
    startMagicSelection() {
        if (this.player.spells.length === 0) {
            this.addMessage(loc.t('msg_no_spells'), 'system');
            return;
        }

        this.magicSelectionMode = true;
        this.addMessage(loc.t('msg_cast_spell_title'), 'system');

        this.player.spells.forEach((spellId, index) => {
            const spell = this.spells[spellId];
            if (spell) {
                const keyNumber = index + 1;
                this.addMessage(`${keyNumber}: ${spell.name} (Cost: ${spell.cost} MP)`, 'item');
            }
        });

        this.addMessage(loc.t('msg_spell_selection_prompt'), 'system');
    }

    handleMagicSelection(e) {
        const key = e.key.toLowerCase();

        if (key === 'escape') {
            this.magicSelectionMode = false;
            this.addMessage(loc.t('msg_spell_selection_cancelled'), 'system');
            e.preventDefault();
            return;
        }

        if (key >= '1' && key <= '9') {
            const index = parseInt(key) - 1;
            if (index < this.player.spells.length) {
                const spellId = this.player.spells[index];
                this.castSpell(spellId);
            } else {
                this.addMessage(loc.t('msg_invalid_spell_number'), 'system');
            }
            this.magicSelectionMode = false;
        }
        e.preventDefault();
    }

    castSpell(spellId, options = {}) {
        const spell = this.spells[spellId];
        if (!spell) {
            this.addMessage(loc.t('msg_unknown_spell'), 'system');
            return;
        }

        if (this.player.mp < spell.cost) {
            this.addMessage(loc.t('msg_not_enough_mana'), 'system');
            return;
        }

        this.player.mp -= spell.cost;
        this.audioManager.playSound('magic');

        switch (spell.type) {
            case 'self':
                if (spellId === 'heal') {
                    const healedAmount = Math.min(this.player.maxHp - this.player.hp, spell.heal);
                    this.player.hp += healedAmount;
                    this.addMessage(loc.t('msg_cast_heal', { spell_name: spell.name, healed_amount: healedAmount }), 'item');
                }
                this.processTurn();
                break;

            case 'projectile':
                if (spellId === 'fireball') {
                    this.addMessage(loc.t('msg_fireball_direction_prompt'), 'system');
                    this.gameState = 'targeting';
                    
                    const targetListener = (e) => {
                        const direction = this.getDirectionFromKey(e.key);
                        if (direction) {
                            document.removeEventListener('keydown', targetListener);
                            this.gameState = 'playing';
                            
                            this.projectiles.push({
                                x: this.player.x,
                                y: this.player.y,
                                dx: direction.dx,
                                dy: direction.dy,
                                range: spell.range,
                                damage: spell.damage,
                                symbol: '*',
                                color: '#ff6347' // Tomato
                            });
                            this.addMessage(loc.t('msg_cast_fireball', { spell_name: spell.name }), 'combat');
                            this.processTurn();
                        } else if (e.key === 'Escape') {
                            document.removeEventListener('keydown', targetListener);
                            this.gameState = 'playing';
                            this.player.mp += spell.cost; // Refund MP
                            this.addMessage(loc.t('msg_targeting_cancelled'), 'system');
                        }
                        e.preventDefault();
                    };
                    document.addEventListener('keydown', targetListener);
                }
                break;
        }
    }

    getDirectionFromKey(key) {
        switch(key.toLowerCase()) {
            case 'w': case 'arrowup': return { dx: 0, dy: -1 };
            case 's': case 'arrowdown': return { dx: 0, dy: 1 };
            case 'a': case 'arrowleft': return { dx: -1, dy: 0 };
            case 'd': case 'arrowright': return { dx: 1, dy: 0 };
            default: return null;
        }
    }
    
    // 安全なアイテム削除メソッド
    removeItemFromInventory(itemId) {
        const originalLength = this.player.inventory.length;
        const itemToRemove = this.player.inventory.find(item => item.id === itemId);
        
        if (!itemToRemove) {
            console.warn(`Warning: Item with ID ${itemId} not found in inventory`);
            console.log('Current inventory:', this.player.inventory.map(item => `${item.name}(ID:${item.id})`));
            return false;
        }
        
        console.log(`Attempting to remove ${itemToRemove.name} (ID: ${itemId}) from inventory`);
        this.player.inventory = this.player.inventory.filter(item => item.id !== itemId);
        
        // デバッグ: 削除が正常に行われたかチェック
        if (this.player.inventory.length === originalLength) {
            console.warn(`Warning: Failed to remove item ${itemToRemove.name} (ID: ${itemId}) from inventory`);
            console.log('Inventory after failed removal:', this.player.inventory.map(item => `${item.name}(ID:${item.id})`));
            return false;
        }
        
        console.log(`Successfully removed ${itemToRemove.name} (ID: ${itemId}) from inventory`);
        console.log('Inventory after removal:', this.player.inventory.map(item => `${item.name}(ID:${item.id})`));
        return true;
    }
    
    checkLevelUp() {
        console.log(`DEBUG: checkLevelUp called - Current exp: ${this.player.experience}, Needed: ${this.player.experienceToNext}`);
        if (this.player.experience >= this.player.experienceToNext) {
            this.player.level++;
            this.player.experience -= this.player.experienceToNext;
            this.player.experienceToNext = Math.floor(this.player.experienceToNext * 1.5);
            
            // Level up bonuses
            const hpIncrease = this.random(8, 15);
            const mpIncrease = this.random(3, 8);
            const attackIncrease = this.random(1, 3);
            const defenseIncrease = this.random(1, 2);
            const dexterityIncrease = this.random(0, 2); // 0 or 1
            
            this.player.maxHp += hpIncrease;
            this.player.hp += hpIncrease;
            this.player.maxMp += mpIncrease;
            this.player.mp += mpIncrease;
            this.player.baseAttack += attackIncrease;  // 基本ステータスを更新
            this.player.baseDefense += defenseIncrease; // 基本ステータスを更新
            this.player.baseDexterity += dexterityIncrease;
            
            // 装備込みステータスを再計算
            this.updatePlayerStats();
            
            // Play level up sound
            this.audioManager.playSound('levelUp');
            
            this.addMessage(loc.t('msg_level_up', { level: this.player.level }), 'system');
            this.addMessage(loc.t('msg_level_up_stats', { hp_increase: hpIncrease, mp_increase: mpIncrease, attack_increase: attackIncrease, defense_increase: defenseIncrease, dex_increase: dexterityIncrease }), 'system');
        }
    }
    
    descendStairs() {
        this.floor++; // 階層を増やす
        this.audioManager.playSound('stairs');
        this.addMessage(loc.t('msg_descend_stairs', { floor: this.floor }), 'system');
        
        // Reset FOV and visible tiles for the new floor
        this.fov = [];
        this.visibleTiles.clear();

        this.generateDungeon();
        
        // Place player at start of new level
        const firstRoom = this.rooms[0];
        this.player.x = firstRoom.x + Math.floor(firstRoom.width / 2);
        this.player.y = firstRoom.y + Math.floor(firstRoom.height / 2);
        
        // Clear and respawn entities and items
        this.entities = [];
        this.items = [];
        this.projectiles = [];
        this.traps = [];
        this.spawnEnemies();
        this.spawnItems();
        this.spawnTraps();
    }
    
    gameOver(killer = null) {
        this.gameState = 'dead';
        this.addMessage(loc.t('msg_player_died_game_over'), 'combat');
        
        // ゲームオーバー画面を表示
        setTimeout(() => {
            this.showGameOverScreen(killer);
        }, 1000); // 1秒後に表示
    }
    
    toggleInventory() {
        // Simple inventory display in messages (旧来のメソッド - 後方互換性のために残す)
        this.addMessage(loc.t('msg_inventory_title'), 'system');
        if (this.player.inventory.length === 0) {
            this.addMessage(loc.t('msg_inventory_empty_ui'), 'system');
        } else {
            this.player.inventory.forEach((item, index) => {
                const keyNumber = index + 1;
                let description = `${keyNumber}: ${item.symbol} ${item.name}`;
                
                if (item.type === 'potion') {
                    description += ` (${item.effect === 'heal' ? 'HP' : 'MP'} +${item.value})`;
                } else if (item.type === 'weapon') {
                    description += ` (Attack +${item.attack})`;
                } else if (item.type === 'armor') {
                    description += ` (Defense +${item.defense})`;
                }
                
                this.addMessage(description, 'item');
            });
            this.addMessage(loc.t('msg_inventory_direct_use_prompt'), 'system');
        }
    }
    
    // === 新しいインベントリUIシステム ===
    
    showInventoryUI() {
        this.inventoryUIActive = true;
        this.createInventoryUI();
    }
    
    hideInventoryUI() {
        this.inventoryUIActive = false;
        this.removeInventoryUI();
    }
    
    createInventoryUI() {
        // 既存のインベントリUIがあれば削除
        this.removeInventoryUI();
        
        // オーバーレイ背景を作成
        const overlay = document.createElement('div');
        overlay.id = 'inventoryOverlay';
        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background-color: rgba(0, 0, 0, 0.8);
            z-index: 1000;
            display: flex;
            justify-content: center;
            align-items: center;
        `;
        
        // インベントリウィンドウを作成
        const inventoryWindow = document.createElement('div');
        inventoryWindow.id = 'inventoryWindow';
        inventoryWindow.style.cssText = `
            background-color: #FFFFFF;
            border: 3px solid #000000;
            padding: 20px;
            max-width: 600px;
            max-height: 80vh;
            overflow-y: auto;
            font-family: 'Courier New', monospace;
            color: #000000;
        `;
        
        // ヘッダー
        const header = document.createElement('div');
        header.style.cssText = `
            text-align: center;
            font-size: 18px;
            font-weight: bold;
            margin-bottom: 15px;
            border-bottom: 2px solid #000000;
            padding-bottom: 10px;
        `;
        header.textContent = loc.t('ui_inventory_title_full');
        inventoryWindow.appendChild(header);
        
        // インベントリ内容
        if (this.player.inventory.length === 0) {
            const emptyMsg = document.createElement('div');
            emptyMsg.style.cssText = `
                text-align: center;
                color: #666666;
                padding: 20px;
                font-style: italic;
            `;
            emptyMsg.textContent = loc.t('ui_inventory_empty_msg');
            inventoryWindow.appendChild(emptyMsg);
        } else {
            this.player.inventory.forEach((item, index) => {
                const itemElement = this.createInventoryItemElement(item, index);
                inventoryWindow.appendChild(itemElement);
            });
        }
        
        // 操作案内
        const controls = document.createElement('div');
        controls.style.cssText = `
            margin-top: 15px;
            padding-top: 10px;
            border-top: 1px solid #333333;
            font-size: 12px;
            color: #666666;
            text-align: center;
        `;
        controls.innerHTML = `
            <strong>${loc.t('ui_inventory_controls_title')}</strong><br>
            ${loc.t('ui_inventory_controls_desc')}<br>
            ${loc.t('ui_inventory_controls_direct')}
        `;
        inventoryWindow.appendChild(controls);
        
        overlay.appendChild(inventoryWindow);
        document.body.appendChild(overlay);
        
        // ESCキーでクローズできるようにイベントリスナーを追加
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                this.hideInventoryUI();
            }
        });
    }
    
    createInventoryItemElement(item, index) {
        const itemDiv = document.createElement('div');
        
        // 装備中のアイテムかチェック
        const isEquipped = (this.player.equipment.weapon && this.player.equipment.weapon.id === item.id) ||
                          (this.player.equipment.armor && this.player.equipment.armor.id === item.id) ||
                          (this.player.equipment.shield && this.player.equipment.shield.id === item.id);
        
        itemDiv.style.cssText = `
            display: flex;
            align-items: center;
            padding: 8px;
            margin: 5px 0;
            border: ${isEquipped ? '2px solid #000000' : '1px solid #333333'};
            background-color: ${isEquipped ? '#F5F5F5' : '#FFFFFF'};
            cursor: pointer;
            transition: background-color 0.2s;
        `;
        
        // ホバー効果
        itemDiv.addEventListener('mouseenter', () => {
            itemDiv.style.backgroundColor = isEquipped ? '#EEEEEE' : '#F0F0F0';
        });
        itemDiv.addEventListener('mouseleave', () => {
            itemDiv.style.backgroundColor = isEquipped ? '#F5F5F5' : '#FFFFFF';
        });
        
        // アイテムアイコン
        const icon = document.createElement('span');
        icon.style.cssText = `
            font-size: 16px;
            font-weight: bold;
            width: 30px;
            text-align: center;
            margin-right: 10px;
            color: ${item.color};
        `;
        icon.textContent = item.symbol;
        
        // アイテム情報
        const info = document.createElement('div');
        info.style.cssText = `
            flex: 1;
        `;
        
        const name = document.createElement('div');
        name.style.cssText = `
            font-weight: bold;
            font-size: 14px;
        `;
        name.textContent = `${index + 1}. ${item.name}${isEquipped ? loc.t('ui_equipped_tag') : ''}`;
        
        const description = document.createElement('div');
        description.style.cssText = `
            font-size: 12px;
            color: #666666;
            margin-top: 2px;
        `;
        
        let descText = '';
        if (item.type === 'potion') {
            descText = item.effect === 'heal' ? loc.t('ui_hp_recovery', { value: item.value }) : loc.t('ui_mp_recovery', { value: item.value });
        } else if (item.type === 'weapon') {
            descText = loc.t('ui_attack_power', { value: item.attack });
        } else if (item.type === 'armor') {
            descText = loc.t('ui_defense_power', { value: item.defense });
        } else if (item.type === 'shield') { // Add shield description
            descText = loc.t('ui_defense_power', { value: item.defense });
        }
        description.textContent = descText;
        
        info.appendChild(name);
        info.appendChild(description);
        
        // アクションボタン
        const actions = document.createElement('div');
        actions.style.cssText = `
            display: flex;
            flex-direction: column;
            gap: 5px;
        `;
        
        if (item.type === 'potion') {
            // ポーションの場合は使用制限をチェック
            let canUse = true;
            let useText = loc.t('ui_use_button');
            
            if (item.effect === 'heal' && this.player.hp >= this.player.maxHp) {
                canUse = false;
                useText = loc.t('ui_hp_full_button');
            } else if (item.effect === 'mana' && this.player.mp >= this.player.maxMp) {
                canUse = false;
                useText = loc.t('ui_mp_full_button');
            }
            
            const useBtn = this.createActionButton(useText, canUse ? '#000000' : '#999999', () => {
                if (canUse) {
                    this.useItemByIndex(index);
                    this.updateInventoryUI();
                }
            });
            if (!canUse) {
                useBtn.style.cursor = 'not-allowed';
            }
            actions.appendChild(useBtn);
            
        } else if (item.type === 'weapon' || item.type === 'armor' || item.type === 'shield') { // Add shield
            if (isEquipped) {
                const unequipBtn = this.createActionButton(loc.t('ui_unequip_button'), '#666666', () => {
                    let slot;
                    if (item.type === 'weapon') slot = 'weapon';
                    else if (item.type === 'armor') slot = 'armor';
                    else if (item.type === 'shield') slot = 'shield'; // Determine slot for shield
                    this.unequipItem(slot);
                    this.updateInventoryUI();
                });
                actions.appendChild(unequipBtn);
            } else {
                const equipBtn = this.createActionButton(loc.t('ui_equip_button'), '#000000', () => {
                    this.equipItem(item);
                    this.updateInventoryUI();
                });
                actions.appendChild(equipBtn);
            }
        }
        
        const dropBtn = this.createActionButton(loc.t('ui_drop_button'), '#999999', () => {
            this.dropItem(index);
            this.updateInventoryUI();
        });
        actions.appendChild(dropBtn);
        
        itemDiv.appendChild(icon);
        itemDiv.appendChild(info);
        itemDiv.appendChild(actions);
        
        // アイテムクリックで使用/装備（装備中でない場合のみ）
        itemDiv.addEventListener('click', (e) => {
            if (e.target.tagName !== 'BUTTON') {
                if (item.type === 'potion') {
                    this.useItemByIndex(index);
                } else if ((item.type === 'weapon' || item.type === 'armor' || item.type === 'shield') && !isEquipped) { // Add shield
                    this.equipItem(item);
                }
                this.updateInventoryUI();
            }
        });
        
        return itemDiv;
    }
    
    createActionButton(text, color, onClick) {
        const button = document.createElement('button');
        button.style.cssText = `
            background-color: ${color};
            color: #FFFFFF;
            border: none;
            padding: 4px 8px;
            font-size: 10px;
            font-family: 'Courier New', monospace;
            cursor: pointer;
            min-width: 50px;
        `;
        button.textContent = text;
        button.addEventListener('click', (e) => {
            e.stopPropagation();
            onClick();
        });
        button.addEventListener('mouseenter', () => {
            button.style.opacity = '0.8';
        });
        button.addEventListener('mouseleave', () => {
            button.style.opacity = '1';
        });
        return button;
    }
    
    updateInventoryUI() {
        if (this.inventoryUIActive) {
            this.createInventoryUI(); // 再作成して更新
        }
    }
    
    removeInventoryUI() {
        const overlay = document.getElementById('inventoryOverlay');
        if (overlay) {
            overlay.remove();
        }
    }
    
    handleInventoryInput(e) {
        const key = e.key.toLowerCase();
        
        if (key === 'escape' || key === 'i') {
            this.hideInventoryUI();
        } else if (key >= '1' && key <= '9') {
            const index = parseInt(key) - 1;
            if (index < this.player.inventory.length) {
                const item = this.player.inventory[index];
                if (item.type === 'potion') {
                    this.useItemByIndex(index);
                } else if (item.type === 'weapon' || item.type === 'armor' || item.type === 'shield') { // Add shield
                    this.equipItem(item);
                }
                this.updateInventoryUI();
            }
        }
        
        e.preventDefault();
    }
    
    dropItem(index) {
        if (index < 0 || index >= this.player.inventory.length) {
            return;
        }
        
        const item = this.player.inventory[index];
        
        // アイテムをプレイヤーの足元に配置
        const droppedItem = {
            ...item,
            x: this.player.x,
            y: this.player.y,
            id: this.nextItemId++
        };
        
        this.items.push(droppedItem);
        this.removeItemFromInventory(item.id);
        this.addMessage(loc.t('msg_drop_item', { item_name: item.name }), 'item');
    }

    // ===== ショップシステム =====

    interactWithMerchant() {
        // Check for adjacent merchant
        let merchant = null;
        for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
                if (dx === 0 && dy === 0) continue;
                const entity = this.entities.find(e => e.type === 'npc' && e.name === 'Merchant' && e.x === this.player.x + dx && e.y === this.player.y + dy);
                if (entity) {
                    merchant = entity;
                    break;
                }
            }
            if (merchant) break;
        }

        if (merchant) {
            this.showShopUI();
        } else {
            this.addMessage(loc.t('msg_no_merchant'), 'system');
        }
    }

    generateShopInventory() {
        this.shopInventory = [];
        // Filter out gold coins and filter by floor/rarity for shop
        const availableShopTemplates = itemTemplates.filter(template => 
            template.type !== 'gold' && 
            (template.rarity === undefined || (this.floor >= 1 && template.rarity === 'common') || (this.floor >= 5 && template.rarity === 'uncommon') || (this.floor >= 10 && template.rarity === 'rare'))
        );

        const numItems = this.random(3, 6);
        for (let i = 0; i < numItems; i++) {
            if (availableShopTemplates.length === 0) break;
            const template = availableShopTemplates[this.random(0, availableShopTemplates.length)];
            let item = { ...template, id: this.nextItemId++ };

            const floorBonus = Math.floor(this.floor / 4);
            if (item.type === 'weapon' && floorBonus > 0) {
                item.attack += floorBonus * this.random(1, 3);
                item.name = loc.t(item.nameKey, { bonus: floorBonus }); // Localize name with bonus
                item.basePrice += floorBonus * 50;
            } else if (item.type === 'armor' && floorBonus > 0) {
                item.defense += floorBonus * this.random(1, 2);
                item.name = loc.t(item.nameKey, { bonus: floorBonus }); // Localize name with bonus
                item.basePrice += floorBonus * 40;
            } else {
                item.name = loc.t(item.nameKey); // Localize name without bonus
            }
            
            this.shopInventory.push(item);
        }
    }

    showShopUI() {
        this.generateShopInventory();
        this.shopUIActive = true;
        this.createShopUI();
    }

    hideShopUI() {
        this.shopUIActive = false;
        const overlay = document.getElementById('shopOverlay');
        if (overlay) {
            overlay.remove();
        }
        this.render();
    }

    createShopUI() {
        const existingOverlay = document.getElementById('shopOverlay');
        if (existingOverlay) existingOverlay.remove();

        const overlay = document.createElement('div');
        overlay.id = 'shopOverlay';
        overlay.style.cssText = `
            position: fixed; top: 0; left: 0; width: 100%; height: 100%;
            background-color: rgba(0, 0, 0, 0.85); z-index: 1000;
            display: flex; justify-content: center; align-items: center;
        `;

        const shopWindow = document.createElement('div');
        shopWindow.style.cssText = `
            background-color: #2c3e50; color: #ecf0f1; border: 3px solid #7f8c8d;
            padding: 20px; width: 80%; max-width: 800px; max-height: 90vh;
            font-family: 'Courier New', monospace; display: flex; flex-direction: column;
        `;

        shopWindow.innerHTML = `
            <div style="text-align: center; font-size: 20px; font-weight: bold; margin-bottom: 10px; border-bottom: 1px solid #7f8c8d; padding-bottom: 10px;">${loc.t('ui_shop_title')}</div>
            <div style="text-align: right; margin-bottom: 15px; font-size: 16px;">${loc.t('ui_your_gold')}<span style="color: ${this.colors.gold}; font-weight: bold;">${this.player.gold}</span></div>
        `;

        const content = document.createElement('div');
        content.style.cssText = 'display: flex; flex: 1; overflow-y: auto;';

        const buyPane = document.createElement('div');
        buyPane.style.cssText = 'flex: 1; padding-right: 10px; border-right: 1px solid #7f8c8d;';
        buyPane.innerHTML = `<h3 style="margin-top: 0;">${loc.t('ui_for_sale_title')}</h3>`;

        if (this.shopInventory.length === 0) {
            buyPane.innerHTML += `<div>${loc.t('ui_sold_out')}</div>`;
        } else {
            this.shopInventory.forEach((item, index) => {
                const itemEl = this.createShopItemElement(item, index, 'buy');
                buyPane.appendChild(itemEl);
            });
        }

        const sellPane = document.createElement('div');
        sellPane.style.cssText = 'flex: 1; padding-left: 10px;';
        sellPane.innerHTML = `<h3 style="margin-top: 0;">${loc.t('ui_your_items_title')}</h3>`;

        if (this.player.inventory.length === 0) {
            sellPane.innerHTML += `<div>${loc.t('ui_shop_inventory_empty')}</div>`;
        } else {
            this.player.inventory.forEach((item, index) => {
                const itemEl = this.createShopItemElement(item, index, 'sell');
                sellPane.appendChild(itemEl);
            });
        }

        content.appendChild(buyPane);
        content.appendChild(sellPane);
        shopWindow.appendChild(content);
        
        const controls = document.createElement('div');
        controls.style.cssText = 'text-align: center; margin-top: 15px; font-size: 14px;';
        controls.textContent = loc.t('ui_shop_controls');
        shopWindow.appendChild(controls);

        overlay.appendChild(shopWindow);
        document.body.appendChild(overlay);
    }

    createShopItemElement(item, index, type) {
        const itemEl = document.createElement('div');
        const isBuy = type === 'buy';
        const price = isBuy ? item.basePrice : Math.floor((item.basePrice || 20) * 0.4);
        
        itemEl.style.cssText = 'padding: 8px; margin-bottom: 5px; cursor: pointer; border: 1px solid #34495e;';
        itemEl.innerHTML = `
            <span style="color: ${item.color};">${item.symbol}</span> ${item.name}
            <span style="float: right; color: ${this.colors.gold};">${price} g</span>
        `;

        itemEl.addEventListener('mouseenter', () => { itemEl.style.backgroundColor = '#34495e'; });
        itemEl.addEventListener('mouseleave', () => { itemEl.style.backgroundColor = 'transparent'; });
        itemEl.addEventListener('click', () => {
            if (isBuy) this.buyItem(index);
            else this.sellItem(index);
        });
        return itemEl;
    }

    handleShopInput(e) {
        const key = e.key.toLowerCase();
        if (key === 'escape' || key === 'b') {
            this.hideShopUI();
            e.preventDefault();
        }
    }

    buyItem(index) {
        if (index < 0 || index >= this.shopInventory.length) return;
        const item = this.shopInventory[index];
        if (this.player.gold >= item.basePrice) {
            this.player.gold -= item.basePrice;
            this.player.inventory.push({ ...item, id: this.nextItemId++ });
            this.shopInventory.splice(index, 1);
            this.addMessage(loc.t('msg_bought_item', { item_name: item.name }), 'item');
            this.audioManager.playSound('gold');
            this.createShopUI();
        } else {
            this.addMessage(loc.t('msg_not_enough_gold'), 'system');
        }
    }

    sellItem(index) {
        if (index < 0 || index >= this.player.inventory.length) return;
        const item = this.player.inventory[index];
        
        const isEquipped = (this.player.equipment.weapon && this.player.equipment.weapon.id === item.id) ||
                           (this.player.equipment.armor && this.player.equipment.armor.id === item.id);
        if (isEquipped) {
            this.addMessage(loc.t('msg_cannot_sell_equipped'), 'system');
            return;
        }

        const sellPrice = Math.floor((item.basePrice || 20) * 0.4);
        this.player.gold += sellPrice;
        this.removeItemFromInventory(item.id);
        this.addMessage(loc.t('msg_sold_item', { item_name: item.name, gold: sellPrice }), 'item');
        this.audioManager.playSound('gold');
        this.createShopUI();
    }
    
    // Equipment System
    equipItem(item) {
        if (item.type === 'weapon') {
            // 同じ武器を再装備しようとしている場合はスキップ
            if (this.player.equipment.weapon && this.player.equipment.weapon.id === item.id) {
                this.addMessage(loc.t('msg_item_already_equipped', { item_name: item.name }), 'system');
                return;
            }
            
            // まず、インベントリから装備するアイテムを削除
            if (!this.removeItemFromInventory(item.id)) {
                this.addMessage(loc.t('msg_failed_equip_not_found'), 'system');
                return;
            }
            
            // 既存の武器を外してインベントリに戻す
            if (this.player.equipment.weapon) {
                const unequippedItem = {
                    ...this.player.equipment.weapon,
                    id: this.nextItemId++  // 新しいIDを割り当て
                };
                this.player.inventory.push(unequippedItem);
                this.addMessage(loc.t('msg_unequip_item', { item_name: this.player.equipment.weapon.name }), 'item');
            }
            
            // 新しい武器を装備
            this.player.equipment.weapon = item;
            this.audioManager.playSound('equip');
            this.addMessage(loc.t('msg_equip_weapon', { item_name: item.name, attack_bonus: item.attack }), 'item');
            
        } else if (item.type === 'armor') {
            // 同じ防具を再装備しようとしている場合はスキップ
            if (this.player.equipment.armor && this.player.equipment.armor.id === item.id) {
                this.addMessage(loc.t('msg_item_already_equipped', { item_name: item.name }), 'system');
                return;
            }
            
            // まず、インベントリから装備するアイテムを削除
            if (!this.removeItemFromInventory(item.id)) {
                this.addMessage(loc.t('msg_failed_equip_not_found'), 'system');
                return;
            }
            
            // 既存の防具を外してインベントリに戻す
            if (this.player.equipment.armor) {
                const unequippedItem = {
                    ...this.player.equipment.armor,
                    id: this.nextItemId++  // 新しいIDを割り当て
                };
                this.player.inventory.push(unequippedItem);
                this.addMessage(loc.t('msg_unequip_item', { item_name: this.player.equipment.armor.name }), 'item');
            }
            
            // 新しい防具を装備
        this.player.equipment.armor = item;
        this.audioManager.playSound('equip');
        this.addMessage(loc.t('msg_equip_armor', { item_name: item.name, defense_bonus: item.defense }), 'item');
    } else if (item.type === 'shield') { // Add shield equip logic
        // 同じ盾を再装備しようとしている場合はスキップ
        if (this.player.equipment.shield && this.player.equipment.shield.id === item.id) {
            this.addMessage(loc.t('msg_item_already_equipped', { item_name: item.name }), 'system');
            return;
        }
        
        // まず、インベントリから装備するアイテムを削除
        if (!this.removeItemFromInventory(item.id)) {
            this.addMessage(loc.t('msg_failed_equip_not_found'), 'system');
            return;
        }
        
        // 既存の盾を外してインベントリに戻す
        if (this.player.equipment.shield) {
            const unequippedItem = {
                ...this.player.equipment.shield,
                id: this.nextItemId++  // 新しいIDを割り当て
            };
            this.player.inventory.push(unequippedItem);
            this.addMessage(loc.t('msg_unequip_item', { item_name: this.player.equipment.shield.name }), 'item');
        }
        
        // 新しい盾を装備
        this.player.equipment.shield = item;
        this.audioManager.playSound('equip');
        this.addMessage(loc.t('msg_equip_shield', { item_name: item.name, defense_bonus: item.defense }), 'item');
    }
        
        // ステータスを再計算
        this.updatePlayerStats();
        this.processTurn();
    }
    
    unequipItem(slot) {
        const item = this.player.equipment[slot];
        if (item) {
            // インベントリに戻す際に新しいIDを割り当て（重複防止）
            const inventoryItem = {
                ...item,
                id: this.nextItemId++
            };
            this.player.inventory.push(inventoryItem);
            this.player.equipment[slot] = null;
            this.addMessage(loc.t('msg_unequip_item', { item_name: item.name }), 'item');
            this.updatePlayerStats();
        }
    }
    
    showEquipment() {
        this.addMessage(loc.t('msg_equipment_title'), 'system');
        if (this.player.equipment.weapon) {
            this.addMessage(loc.t('msg_weapon_equipped', { weapon_name: this.player.equipment.weapon.name, attack_bonus: this.player.equipment.weapon.attack }), 'item'); // Need to add this key
        } else {
            this.addMessage(loc.t('msg_weapon_none'), 'system');
        }
        
        if (this.player.equipment.armor) {
            this.addMessage(loc.t('msg_armor_equipped', { armor_name: this.player.equipment.armor.name, defense_bonus: this.player.equipment.armor.defense }), 'item'); // Need to add this key
        } else {
            this.addMessage(loc.t('msg_armor_none'), 'system');
        }

        if (this.player.equipment.shield) { // Add shield equipped display
            this.addMessage(loc.t('msg_shield_equipped', { shield_name: this.player.equipment.shield.name, defense_bonus: this.player.equipment.shield.defense }), 'item'); // Need to add this key
        } else {
            this.addMessage(loc.t('msg_shield_none'), 'system');
        }
    }
    
    removeEquipment() {
        // 武器から優先的に外す
        if (this.player.equipment.weapon) {
            this.unequipItem('weapon');
            this.processTurn();
        } else if (this.player.equipment.armor) {
            this.unequipItem('armor');
            this.processTurn();
        } else if (this.player.equipment.shield) { // Add shield unequip priority
            this.unequipItem('shield');
            this.processTurn();
        } else {
            this.addMessage(loc.t('msg_no_equipment_to_remove'), 'system');
        }
    }
    
    updatePlayerStats() {
        // 基本ステータスから開始
        this.player.attack = this.player.baseAttack;
        this.player.defense = this.player.baseDefense;
        this.player.dexterity = this.player.baseDexterity;
        
        // 装備ボーナスを加算
        if (this.player.equipment.weapon) {
            this.player.attack += this.player.equipment.weapon.attack || 0;
        }
        if (this.player.equipment.armor) {
            this.player.defense += this.player.equipment.armor.defense || 0;
        }
        if (this.player.equipment.shield) { // Add shield defense
            this.player.defense += this.player.equipment.shield.defense || 0;
        }
    }
    
    addMessage(text, type = 'system') {
        this.messages.push({ text, type, turn: this.turn });
        if (this.messages.length > this.maxMessages) {
            this.messages.shift();
        }
        this.updateMessages();
    }
    
    updateMessages() {
        const messagesDiv = document.getElementById('messages');
        messagesDiv.innerHTML = '';
        
        this.messages.slice(-10).forEach(msg => {
            const div = document.createElement('div');
            div.className = `message ${msg.type}`;
            div.textContent = msg.text;
            messagesDiv.appendChild(div);
        });
        
        messagesDiv.scrollTop = messagesDiv.scrollHeight;
    }
    
    updateUI() {
        // Update player stats
        document.getElementById('playerLevel').textContent = this.player.level;
        document.getElementById('playerHP').textContent = this.player.hp;
        document.getElementById('playerMaxHP').textContent = this.player.maxHp;
        document.getElementById('playerMP').textContent = this.player.mp;
        document.getElementById('playerMaxMP').textContent = this.player.maxMp;
        document.getElementById('playerAttack').textContent = this.player.attack;
        document.getElementById('playerDefense').textContent = this.player.defense;
        document.getElementById('playerDexterity').textContent = this.player.dexterity;
        document.getElementById('playerGold').textContent = this.player.gold;
        
        // Update floor display
        document.getElementById('currentFloor').textContent = this.floor;
        
        // Update health bar
        const healthPercent = (this.player.hp / this.player.maxHp) * 100;
        document.getElementById('healthBar').style.width = healthPercent + '%';
        
        // Update mana bar
        const manaPercent = (this.player.mp / this.player.maxMp) * 100;
        document.getElementById('manaBar').style.width = manaPercent + '%';
    }
     render() {
        this.calculateFOV(); // Calculate FOV before rendering
        // ダークモード背景に変更
        this.ctx.fillStyle = this.colors.background;
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // Calculate camera offset to center on player
        const cameraX = this.player.x - Math.floor(this.viewWidth / 2);
        const cameraY = this.player.y - Math.floor(this.viewHeight / 2);

        // Render dungeon based on FOV
        for (let y = 0; y < this.viewHeight; y++) {
            for (let x = 0; x < this.viewWidth; x++) {
                const worldX = x + cameraX;
                const worldY = y + cameraY;

                if (worldX >= 0 && worldX < this.mapWidth && worldY >= 0 && worldY < this.mapHeight) {
                    const isVisible = this.visibleTiles.has(`${worldX},${worldY}`);
                    const isExplored = this.fov[worldY] && this.fov[worldY][worldX]; // Check if explored

                    if (isVisible) {
                        const tile = this.dungeon[worldY][worldX];
                        this.renderTile(x, y, tile, false); // Not dimmed
                    } else if (isExplored) {
                        const tile = this.dungeon[worldY][worldX];
                        this.renderTile(x, y, tile, true); // Dimmed
                    } else {
                        // Unexplored, render nothing (or a solid black tile)
                        this.ctx.fillStyle = this.colors.background; // Solid black for unexplored
                        this.ctx.fillRect(x * this.tileSize, y * this.tileSize, this.tileSize, this.tileSize);
                    }
                }
            }
        }
        
        // Render traps, items, entities only if visible
        this.traps.forEach(trap => {
            const worldX = trap.x;
            const worldY = trap.y;
            if (trap.visible && this.visibleTiles.has(`${worldX},${worldY}`)) { // Only render if visible and trap is visible
                const screenX = trap.x - cameraX;
                const screenY = trap.y - cameraY;
                if (screenX >= 0 && screenX < this.viewWidth && screenY >= 0 && screenY < this.viewHeight) {
                    this.renderEntity(screenX, screenY, trap.symbol, trap.color);
                }
            }
        });
        
        this.items.forEach(item => {
            const worldX = item.x;
            const worldY = item.y;
            if (this.visibleTiles.has(`${worldX},${worldY}`)) { // Only render if visible
                const screenX = item.x - cameraX;
                const screenY = item.y - cameraY;
                if (screenX >= 0 && screenX < this.viewWidth && screenY >= 0 && screenY < this.viewHeight) {
                    this.renderEntity(screenX, screenY, item.symbol, item.color);
                }
            }
        });
        
        this.entities.forEach(entity => {
            const worldX = entity.x;
            const worldY = entity.y;
            if (entity.alive && this.visibleTiles.has(`${worldX},${worldY}`)) { // Only render if visible and alive
                const screenX = entity.x - cameraX;
                const screenY = entity.y - cameraY;
                if (screenX >= 0 && screenX < this.viewWidth && screenY >= 0 && screenY < this.viewHeight) {
                    this.renderEntity(screenX, screenY, entity.symbol, entity.color);
                }
            }
        });

        // Render player (always visible)
        this.renderEntity(this.player.x - cameraX, this.player.y - cameraY, this.player.symbol, this.player.color);
    }

    updateProjectiles() {
        for (let i = this.projectiles.length - 1; i >= 0; i--) {
            const proj = this.projectiles[i];
            proj.x += proj.dx;
            proj.y += proj.dy;
            proj.range--;

            // Check for wall collision
            if (!this.isValidMove(proj.x, proj.y)) {
                this.projectiles.splice(i, 1);
                this.addMessage(loc.t('msg_fireball_fizzles'), 'system');
                continue;
            }

            // Check for enemy collision
            const enemy = this.getEnemyAt(proj.x, proj.y);
            if (enemy) {
                const damage = proj.damage;
                enemy.hp -= damage;
                this.addMessage(loc.t('msg_fireball_hits', { enemy_name: enemy.name, damage: damage }), 'combat');
                if (enemy.hp <= 0) {
                    enemy.alive = false;
                    this.addMessage(loc.t('msg_enemy_vanquished_fireball', { enemy_name: enemy.name }), 'combat');
                    this.player.experience += enemy.experience;
                    this.player.gold += enemy.gold;
                    this.checkLevelUp();
                }
                this.projectiles.splice(i, 1);
                continue;
            }

            // Check for range expiration
            if (proj.range <= 0) {
                this.projectiles.splice(i, 1);
            }
        }
    }

    renderProjectiles(cameraX, cameraY) {
        this.projectiles.forEach(proj => {
            const screenX = proj.x - cameraX;
            const screenY = proj.y - cameraY;

            if (screenX >= 0 && screenX < this.viewWidth && screenY >= 0 && screenY < this.viewHeight) {
                this.renderEntity(screenX, screenY, proj.symbol, proj.color);
            }
        });
    }
     renderTile(x, y, tile, dimmed) {
        const pixelX = x * this.tileSize;
        const pixelY = y * this.tileSize;

        let displayChar = '';
        let color = '';

        switch(tile) {
            case '#':
                displayChar = '#';
                color = dimmed ? this.colors.wallExplored : this.colors.wall; // Use new explored/visible colors
                break;
            case '.':
                displayChar = '.';
                color = dimmed ? this.colors.floorExplored : this.colors.floor; // Use new explored/visible colors
                break;
            case '%':
                displayChar = '%';
                color = dimmed ? this.colors.stairsExplored : this.colors.stairs; // Use new explored/visible colors
                break;
            default:
                // For unknown tiles or background, fill with background color
                this.ctx.fillStyle = this.colors.background;
                this.ctx.fillRect(pixelX, pixelY, this.tileSize, this.tileSize);
                return; // Nothing more to render for this tile
        }

        // First, fill the background of the tile with the general background color
        this.ctx.fillStyle = this.colors.background;
        this.ctx.fillRect(pixelX, pixelY, this.tileSize, this.tileSize);

        // Then, render the character
        this.renderEntity(x, y, displayChar, color);
    }
    
    renderEntity(x, y, symbol, color) {
        const pixelX = x * this.tileSize;
        const pixelY = y * this.tileSize;
        
        this.ctx.fillStyle = color;
        this.ctx.font = `${this.tileSize}px monospace`;
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        this.ctx.fillText(
            symbol, 
            pixelX + this.tileSize / 2, 
            pixelY + this.tileSize / 2
        );
    }
    
    random(min, max) {
        return Math.floor(Math.random() * (max - min)) + min;
    }
    
    // セーブ機能
    // ===== 🆕 セーブ/ロードシステム =====
    saveGame() {
        try {
            const gameData = {
                version: '1.4.0',
                timestamp: new Date().toISOString(),
                player: {
                    ...this.player,
                    inventory: [...this.player.inventory],
                    equipment: {
                        weapon: this.player.equipment.weapon ? {...this.player.equipment.weapon} : null,
                        armor: this.player.equipment.armor ? {...this.player.equipment.armor} : null
                    }
                },
                dungeon: this.dungeon.map(row => [...row]),
                entities: this.entities.map(entity => ({...entity})),
                items: this.items.map(item => ({...item})),
                rooms: this.rooms.map(room => ({...room})),
                turn: this.turn,
                floor: this.floor,
                nextItemId: this.nextItemId,
                messages: [...this.messages]
            };
            
            localStorage.setItem('roguelike_save', JSON.stringify(gameData));
            this.addMessage(loc.t('msg_game_saved'), 'system');
            console.log('🎮 Game saved to localStorage');
        } catch (error) {
            this.addMessage(loc.t('msg_save_failed'), 'system');
            console.error('💥 Save failed:', error);
        }
    }
    
    loadGame() {
        try {
            const savedData = localStorage.getItem('roguelike_save');
            if (!savedData) {
                this.addMessage(loc.t('msg_no_saved_game'), 'system');
                return;
            }
            
            const gameData = JSON.parse(savedData);
            
            // データの復元
            this.player = gameData.player;
            this.dungeon = gameData.dungeon;
            this.entities = gameData.entities;
            this.items = gameData.items;
            this.rooms = gameData.rooms;
            this.turn = gameData.turn || 0;
            this.floor = gameData.floor || 1;
            this.nextItemId = gameData.nextItemId || 0;
            this.messages = gameData.messages || [];
            
            // プレイヤーのメソッドを復元
            this.player.rest = function() {
                this.hp = Math.min(this.maxHp, this.hp + 2);
                this.mp = Math.min(this.maxMp, this.mp + 1);
            };
            
            // レンダリングとUI更新
            this.render();
            this.updateUI();
            
            this.addMessage(loc.t('msg_game_loaded', { floor: this.floor, turn: this.turn }), 'system');
            console.log('🎮 Game loaded from localStorage');
        } catch (error) {
            this.addMessage(loc.t('msg_load_failed'), 'system');
            console.error('💥 Load failed:', error);
        }
    }
    
    // ===== 🆕 強化されたモンスターシステム =====
    createEnhancedMonster(x, y, floor) {
        // オリジナルRogue風のモンスター26種類（A-Z）
        const monsterTypes = [
            // Tier 1 (Floor 1-3)
            { char: 'B', name: 'Bat', hp: 8, attack: 3, defense: 1, exp: 2, abilities: ['fly'] },
            { char: 'E', name: 'Emu', hp: 12, attack: 4, defense: 2, exp: 3, abilities: ['mean'] },
            { char: 'H', name: 'Hobgoblin', hp: 15, attack: 6, defense: 3, exp: 5, abilities: ['mean'] },
            { char: 'K', name: 'Kestrel', hp: 10, attack: 5, defense: 2, exp: 4, abilities: ['fly', 'mean'] },
            { char: 'S', name: 'Snake', hp: 10, attack: 4, defense: 2, exp: 3, abilities: ['mean'] },
            
            // Tier 2 (Floor 4-6)
            { char: 'C', name: 'Centaur', hp: 25, attack: 8, defense: 4, exp: 15, abilities: [] },
            { char: 'I', name: 'Ice Monster', hp: 18, attack: 6, defense: 5, exp: 8, abilities: ['freeze'] },
            { char: 'L', name: 'Leprechaun', hp: 20, attack: 5, defense: 6, exp: 12, abilities: ['steal'] },
            { char: 'O', name: 'Orc', hp: 22, attack: 7, defense: 4, exp: 10, abilities: ['greed'] },
            { char: 'R', name: 'Rattlesnake', hp: 16, attack: 8, defense: 3, exp: 12, abilities: ['poison', 'mean'] },
            
            // Tier 3 (Floor 7-10)
            { char: 'A', name: 'Aquator', hp: 35, attack: 10, defense: 5, exp: 25, abilities: ['rust', 'mean'] },
            { char: 'N', name: 'Nymph', hp: 28, attack: 6, defense: 7, exp: 20, abilities: ['steal_all'] },
            { char: 'Q', name: 'Quagga', hp: 30, attack: 9, defense: 5, exp: 18, abilities: ['mean'] },
            { char: 'T', name: 'Troll', hp: 45, attack: 12, defense: 6, exp: 35, abilities: ['regen', 'mean'] },
            { char: 'Z', name: 'Zombie', hp: 25, attack: 8, defense: 4, exp: 15, abilities: ['mean'] },
            
            // Tier 4 (Floor 11-15)
            { char: 'F', name: 'Venus Flytrap', hp: 50, attack: 14, defense: 7, exp: 45, abilities: ['hold', 'mean'] },
            { char: 'M', name: 'Medusa', hp: 40, attack: 16, defense: 6, exp: 40, abilities: ['confusion', 'mean'] },
            { char: 'P', name: 'Phantom', hp: 35, attack: 12, defense: 8, exp: 50, abilities: ['invisible'] },
            { char: 'U', name: 'Black Unicorn', hp: 55, attack: 18, defense: 4, exp: 60, abilities: ['mean'] },
            { char: 'W', name: 'Wraith', hp: 38, attack: 14, defense: 7, exp: 45, abilities: ['drain'] },
            
            // Tier 5 (Floor 16-20)
            { char: 'G', name: 'Griffin', hp: 70, attack: 20, defense: 8, exp: 80, abilities: ['fly', 'regen', 'mean'] },
            { char: 'V', name: 'Vampire', hp: 60, attack: 22, defense: 6, exp: 90, abilities: ['regen', 'drain', 'mean'] },
            { char: 'X', name: 'Xeroc', hp: 50, attack: 16, defense: 9, exp: 70, abilities: ['mimic'] },
            { char: 'Y', name: 'Yeti', hp: 65, attack: 18, defense: 7, exp: 75, abilities: ['freeze'] },
            
            // Tier 6 (Floor 21+)
            { char: 'D', name: 'Dragon', hp: 120, attack: 30, defense: 10, exp: 200, abilities: ['flame', 'mean'] },
            { char: 'J', name: 'Jabberwock', hp: 100, attack: 28, defense: 12, exp: 180, abilities: ['confusion'] }
        ];
        
        // 階層に基づいてモンスターを選択
        let availableMonsters = monsterTypes.filter(monster => {
            if (floor <= 3) return monster.char.match(/[BEHKS]/);
            if (floor <= 6) return monster.char.match(/[BEHKS]|[CILOR]/);
            if (floor <= 10) return monster.char.match(/[BEHKS]|[CILOR]|[ANQTZ]/);
            if (floor <= 15) return monster.char.match(/[BEHKS]|[CILOR]|[ANQTZ]|[FMPUW]/);
            if (floor <= 20) return monster.char.match(/[BEHKS]|[CILOR]|[ANQTZ]|[FMPUW]|[GVXY]/);
            return monsterTypes; // 21階以降はすべて
        });
        
        if (availableMonsters.length === 0) {
            availableMonsters = [monsterTypes[0]]; // フォールバック
        }
        
        const template = availableMonsters[this.random(0, availableMonsters.length)];
        
        // 階層による強化
        const floorMultiplier = 1 + (floor - 1) * 0.1;
        
        return {
            name: template.name,
            symbol: template.char,
            x: x,
            y: y,
            hp: Math.floor(template.hp * floorMultiplier),
            maxHp: Math.floor(template.hp * floorMultiplier),
            attack: Math.floor(template.attack * floorMultiplier),
            defense: Math.floor(template.defense * floorMultiplier),
            experience: Math.floor(template.exp * floorMultiplier),
            gold: this.random(5, 25) + floor * 2,
            type: 'enemy',
            alive: true,
            color: this.colors.enemy,
            abilities: [...template.abilities],
            // 特殊能力フラグ
            canFly: template.abilities.includes('fly'),
            isInvisible: template.abilities.includes('invisible'),
            canRegenerate: template.abilities.includes('regen'),
            isMean: template.abilities.includes('mean'),
            lastRegenTurn: 0
        };
    }
    
    showGameOverScreen(killer = null) {
        // 画面の高さに応じてサイズを調整
        const screenHeight = window.innerHeight;
        const isSmallScreen = screenHeight < 700;
        
        // オーバーレイの作成
        const overlay = document.createElement('div');
        overlay.id = 'gameOverOverlay';
        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background-color: rgba(0, 0, 0, 0.9);
            display: flex;
            justify-content: center;
            align-items: center;
            z-index: 10000;
            font-family: 'Courier New', monospace;
            color: #FFFFFF;
            padding: 10px;
            box-sizing: border-box;
        `;
        
        // ゲームオーバーウィンドウの作成
        const gameOverWindow = document.createElement('div');
        const fontSize = isSmallScreen ? '10px' : '12px';
        const padding = isSmallScreen ? '15px' : '20px';
        const maxHeight = isSmallScreen ? '95vh' : '90vh';
        
        gameOverWindow.style.cssText = `
            background-color: #2c3e50;
            border: 3px solid: #7f8c8d;
            color: #ecf0f1;
            padding: ${padding};
            max-width: 700px;
            max-height: ${maxHeight};
            text-align: center;
            font-size: ${fontSize};
            line-height: 1.1;
            white-space: pre-line;
            overflow-y: auto;
            box-sizing: border-box;
            border-radius: 5px;
        `;
        
        // お墓のAAアート（コンパクト版）
        const tombstone = `                   __________
                  /          \\
                 /    REST    \\
                /      IN      \\
               /     PEACE      \\
              /                  \\
              |                  |
              |   ${loc.t('gameover_killed_by')}      |
              |                  |
              |      2025        |
             *|     *  *  *      | *
     ________)/\\_//(\/(/\)/\//\/|_)_______`;
        
        // 死因を取得
        let causeOfDeath = loc.t('gameover_cause_mysterious');
        if (killer) {
            // 英語の冠詞を適切に設定
            const vowels = ['A', 'E', 'I', 'O', 'U'];
            const article = vowels.includes(killer.charAt(0).toUpperCase()) ? 'an' : 'a';
            causeOfDeath = `${article} ${killer}`; // This part is still English-specific for the article.
        }
        
        // 墓石の文字部分をカスタマイズ
        const customTombstone = tombstone.replace(loc.t('gameover_killed_by_placeholder'), loc.t('gameover_killed_by'));
        
        // スコア計算
        const score = this.calculateFinalScore();
        
        // 統計情報
        const stats = this.getGameStats();
        
        // HTMLコンテンツの作成（画面サイズに応じて調整）
        const titleSize = isSmallScreen ? '16px' : '18px';
        const causeSize = isSmallScreen ? '12px' : '14px';
        const tombstoneSize = isSmallScreen ? '9px' : '10px';
        const statsSize = isSmallScreen ? '10px' : '11px';
        const controlsSize = isSmallScreen ? '10px' : '12px';
        
        gameOverWindow.innerHTML = `
            <div style="color: #e74c3c; font-size: ${titleSize}; font-weight: bold; margin-bottom: ${isSmallScreen ? '10px' : '15px'};">
                💀 GAME OVER 💀
            </div>
            
            <div style="color: #95a5a6; font-family: monospace; font-size: ${tombstoneSize}; margin-bottom: ${isSmallScreen ? '10px' : '15px'};">
${customTombstone}
            </div>
            
            <div style="color: #f39c12; font-size: ${causeSize}; margin-bottom: ${isSmallScreen ? '8px' : '10px'};">
                <strong>Cause of Death:</strong> ${causeOfDeath}
            </div>
            
            <div style="color: #2ecc71; margin-bottom: ${isSmallScreen ? '10px' : '15px'};">
                <strong>Final Score:</strong> ${score} points
            </div>
            
            <div style="color: #bdc3c7; margin-bottom: ${isSmallScreen ? '10px' : '15px'}; text-align: left; display: inline-block; font-size: ${statsSize};">
                <strong>📊 Statistics:</strong><br>
                Level: ${this.player.level} • Floor: ${this.floor} • Turns: ${this.turn}<br>
                Gold: ${this.player.gold} • EXP: ${this.player.experience}<br>
                Monsters Defeated: ${stats.monstersKilled} • Items: ${stats.itemsFound}<br>
                <br>
                <strong>⚔️ Equipment:</strong><br>
                Weapon: ${this.player.equipment.weapon ? this.player.equipment.weapon.name : 'None'}<br>
                Armor: ${this.player.equipment.armor ? this.player.equipment.armor.name : 'None'}
            </div>
            
            <div style="color: #f1c40f; margin-top: ${isSmallScreen ? '10px' : '15px'}; font-size: ${controlsSize};">
                <strong>🎮 Press [R] to restart • [ESC] to close</strong>
            </div>
        `;
        
        overlay.appendChild(gameOverWindow);
        document.body.appendChild(overlay);
        
        // キーボードイベントリスナーを追加
        const handleGameOverInput = (e) => {
            if (e.key.toLowerCase() === 'r') {
                // ゲームリスタート
                location.reload();
            } else if (e.key === 'Escape') {
                // 画面を閉じる
                overlay.remove();
                document.removeEventListener('keydown', handleGameOverInput);
            }
        };
        
        document.addEventListener('keydown', handleGameOverInput);
        
        // クリックで閉じる
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                overlay.remove();
                document.removeEventListener('keydown', handleGameOverInput);
            }
        });
    }
    
    calculateFinalScore() {
        const stats = this.getGameStats();
        // 最終スコア = (Gold × 5) + (Experience × 2) + (Level × 100) + 
        //             (Floor × 50) - (Turns × 0.1) + 装備ボーナス
        let score = (stats.gold * 5) + (stats.experience * 2) + (stats.level * 100) + (stats.floor * 50) - (stats.turns * 0.1);

        // 装備ボーナス = (武器攻撃力 × 20) + (防具防御力 × 15)
        if (stats.weapon) {
            score += stats.weapon.attack * 20;
        }
        if (stats.armor) {
            score += stats.armor.defense * 15;
        }
        if (stats.shield) { // Add shield defense bonus
            score += stats.shield.defense * 10;
        }

        return Math.max(0, Math.floor(score));
    }
    
    getGameStats() {
        // ゲーム統計情報を取得（簡易版）
        // 実際のゲームではこれらの値を追跡する必要がある
        return {
            monstersKilled: Math.max(0, Math.floor((this.player.experience / 10) - 5)),
            itemsFound: this.player.inventory.length + (this.player.equipment.weapon ? 1 : 0) + (this.player.equipment.armor ? 1 : 0)
        };
    }
}

// Initialize game when page loads
window.onload = function() {
    const game = new Game();
};
