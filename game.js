// ===== ROGUE GAME ENGINE =====
// A full-featured roguelike game implementation

class Game {
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
        this.inventoryUIActive = false; // 専用インベントリUI表示フラグ
        this.nextItemId = 0; // グローバルアイテムIDカウンター
        
        // Initialize audio system
        this.audioManager = new AudioManager();
        
        this.messages = [];
        this.maxMessages = 50;
        
        this.colors = {
            background: '#1a1a1a',        // ダークグレー背景
            wall: '#4a4a4a',              // ミディアムグレーの壁
            floor: '#2d2d2d',             // ダークグレーの床
            door: '#6a9bd1',              // ソフトブルーのドア/通路
            player: '#7dd87d',            // 明るい緑のプレイヤー
            enemy: '#e74c3c',             // 温かい赤の敵
            item: '#f39c12',              // 温かいオレンジのアイテム
            potion: '#9b59b6',            // 紫のポーション
            weapon: '#e67e22',            // オレンジの武器
            armor: '#3498db',             // 青の防具
            ring: '#f39c12',              // 金色の指輪
            gold: '#f1c40f',              // 金色のゴールド
            stairs: '#ecf0f1',            // ライトグレーの階段
            text: '#ecf0f1',              // メインテキスト色
            textSecondary: '#bdc3c7',     // セカンダリテキスト色
            ui: '#34495e'                 // UI要素色
        };
        
        this.init();
    }
    
    init() {
        this.setupEventListeners();
        this.generateDungeon();
        this.createPlayer();
        this.spawnEnemies();
        this.spawnItems();
        this.addMessage(`Welcome to the dungeon! (Floor ${this.floor})`, 'system');
        this.addMessage("Find the stairs to descend deeper.", 'system');
        this.addMessage("Press any key to enable audio...", 'system');
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
            this.addMessage("Audio enabled! 🎵", 'system');
        }
    }
    
    setupEventListeners() {
        document.addEventListener('keydown', (e) => this.handleInput(e));
        
        // Audio controls
        const volumeSlider = document.getElementById('volumeSlider');
        const muteButton = document.getElementById('muteButton');
        const volumeValue = document.getElementById('volumeValue');
        
        volumeSlider.addEventListener('input', (e) => {
            const volume = e.target.value / 100;
            this.audioManager.setVolume(volume);
            volumeValue.textContent = `${e.target.value}%`;
        });
        
        muteButton.addEventListener('click', () => {
            const isMuted = this.audioManager.toggleMute();
            muteButton.textContent = isMuted ? '🔇 Unmute' : '🔊 Mute';
        });
    }
    
    handleInput(e) {
        if (this.gameState === 'dead') return;
        
        // Initialize audio on first input
        if (!this.audioInitialized) {
            this.initializeAudio();
        }
        
        // インベントリUI表示中の処理
        if (this.inventoryUIActive) {
            this.handleInventoryInput(e);
            return;
        }
        
        // スクロール選択モードの処理
        if (this.scrollSelectionMode) {
            this.handleScrollSelection(e);
            return;
        }
        
        // アイテム選択モードの処理
        if (this.itemSelectionMode) {
            this.handleItemSelection(e);
            return;
        }
        
        let moved = false;
        let dx = 0, dy = 0;
        
        switch(e.key.toLowerCase()) {
            case 'w':
            case 'arrowup':
                dy = -1;
                moved = true;
                break;
            case 's':
            case 'arrowdown':
                dy = 1;
                moved = true;
                break;
            case 'a':
            case 'arrowleft':
                dx = -1;
                moved = true;
                break;
            case 'd':
            case 'arrowright':
                dx = 1;
                moved = true;
                break;
            case ' ':
                // Wait/Rest
                this.player.rest();
                this.processTurn();
                break;
            case 'u':
                this.startItemSelection();
                break;
            case 'i':
                this.showInventoryUI();
                break;
            case 'e':
                this.showEquipment();
                break;
            case 'r':
                this.readScroll();
                break;
            case 'u':
                this.removeEquipment();
                break;
            // 🆕 セーブ/ロード機能
            case 'ctrl+s':
                this.saveGame();
                break;
            case 'ctrl+l':
                this.loadGame();
                break;
            // 数字キーでのダイレクトアイテム使用
            case '1': case '2': case '3': case '4': case '5':
            case '6': case '7': case '8': case '9':
                this.useItemByIndex(parseInt(e.key) - 1);
                break;
        }
        
        if (moved) {
            this.movePlayer(dx, dy);
        }
        
        e.preventDefault();
    }
    
    movePlayer(dx, dy) {
        // Check if player is paralyzed
        if (this.player.statusEffects && this.player.statusEffects.paralyzed && 
            this.turn < this.player.statusEffects.paralyzed) {
            this.addMessage("You are paralyzed and cannot move!");
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
                this.addMessage("You stumble around in confusion!");
            }
        }
        
        const newX = this.player.x + dx;
        const newY = this.player.y + dy;
        
        if (!this.isValidMove(newX, newY)) return;
        
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
        
        // Check for items and automatically pick them up
        this.autoPickupItems();
        
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
            this.addMessage(`You hit ${defender.name} for ${damage} damage!`, 'combat');
        } else {
            this.audioManager.playSound('hurt');
            this.addMessage(`${attacker.name} hits you for ${damage} damage!`, 'combat');
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
                this.addMessage(`${defender.name} dies!`, 'combat');
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
                this.addMessage(`${attacker.name}'s poison weakens you!`);
            }
        }
        
        // Paralysis attacks
        if (attacker.specialAttacks && attacker.specialAttacks.includes('hold')) {
            if (Math.random() < 0.15) { // 15% chance
                if (!defender.statusEffects) defender.statusEffects = {};
                defender.statusEffects.paralyzed = this.turn + 3; // Lasts 3 turns
                this.audioManager.playSound('magic');
                this.addMessage(`${attacker.name} paralyzes you!`);
            }
        }
        
        // Confusion attacks (like Medusa)
        if (attacker.specialAttacks && attacker.specialAttacks.includes('confusion')) {
            if (Math.random() < 0.20) { // 20% chance
                if (!defender.statusEffects) defender.statusEffects = {};
                defender.statusEffects.confused = this.turn + 4; // Lasts 4 turns
                this.audioManager.playSound('magic');
                this.addMessage(`${attacker.name} confuses you!`);
            }
        }
        
        // Draining attacks (Wraith, Vampire)
        if (attacker.specialAttacks && attacker.specialAttacks.includes('drain')) {
            if (Math.random() < 0.30) { // 30% chance
                const drainAmount = Math.floor(Math.random() * 3) + 1;
                defender.maxHp = Math.max(10, defender.maxHp - drainAmount);
                if (defender.hp > defender.maxHp) defender.hp = defender.maxHp;
                this.audioManager.playSound('drain');
                this.addMessage(`${attacker.name} drains your life force!`);
            }
        }
        
        // Rust attacks (Aquator)
        if (attacker.specialAttacks && attacker.specialAttacks.includes('rust')) {
            if (Math.random() < 0.20 && defender.equippedArmor) { // 20% chance
                defender.equippedArmor.defense = Math.max(0, defender.equippedArmor.defense - 1);
                this.audioManager.playSound('metalBreak');
                this.addMessage(`${attacker.name}'s acid damages your armor!`);
                this.updatePlayerStats();
            }
        }
        
        // Steal attacks (Leprechaun, Nymph)
        if (attacker.canSteal && Math.random() < 0.15) { // 15% chance
            if (attacker.name === 'Nymph') {
                // Nymph steals all gold
                if (defender.gold > 0) {
                    this.audioManager.playSound('steal');
                    this.addMessage(`${attacker.name} charms you and steals all your gold!`);
                    defender.gold = 0;
                }
            } else {
                // Leprechaun steals some gold
                const stolenGold = Math.min(defender.gold, Math.floor(Math.random() * 50) + 10);
                if (stolenGold > 0) {
                    defender.gold -= stolenGold;
                    this.audioManager.playSound('steal');
                    this.addMessage(`${attacker.name} steals ${stolenGold} gold!`);
                }
            }
        }
    }
    
    processTurn() {
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
        
        // Process poison damage
        if (this.player.statusEffects.poisoned > 0) {
            this.player.statusEffects.poisoned--;
            this.player.hp = Math.max(1, this.player.hp - this.random(1, 3));
            if (this.player.statusEffects.poisoned === 0) {
                this.addMessage("You feel better now.", 'system');
            }
        }
        
        // Reduce all status effect durations
        Object.keys(this.player.statusEffects).forEach(effect => {
            if (this.player.statusEffects[effect] > 0) {
                this.player.statusEffects[effect]--;
                
                // Notify when effects wear off
                if (this.player.statusEffects[effect] === 0) {
                    switch (effect) {
                        case 'confused':
                            this.addMessage("You feel less confused.", 'system');
                            break;
                        case 'hallucinating':
                            this.addMessage("The strange visions fade away.", 'system');
                            break;
                        case 'blind':
                            this.addMessage("You can see again!", 'system');
                            break;
                        case 'levitating':
                            this.addMessage("You float gently to the ground.", 'system');
                            break;
                        case 'hasted':
                            this.addMessage("You feel yourself slow down.", 'system');
                            break;
                        case 'seeInvisible':
                            this.addMessage("Your eyes stop tingling.", 'system');
                            break;
                        case 'detectMonsters':
                            this.addMessage("You no longer sense monsters.", 'system');
                            break;
                        case 'detectMagic':
                            this.addMessage("You no longer sense magic.", 'system');
                            break;
                    }
                }
            }
        });
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
                            this.addMessage(`${enemy.name} regenerates health!`);
                        }
                    }
                }
                
                // Invisibility processing - monsters randomly become visible/invisible
                if (enemy.hasInvisibility) {
                    if (Math.random() < 0.05) { // 5% chance per turn to change visibility
                        enemy.isInvisible = !enemy.isInvisible;
                        if (this.isMonsterVisible(enemy) && !enemy.isInvisible) {
                            this.addMessage(`${enemy.name} suddenly appears!`);
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
        // 状態効果のチェック
        if (enemy.frozen > 0) {
            enemy.frozen--;
            return; // 凍結中は移動できない
        }
        
        if (enemy.sleeping > 0) {
            enemy.sleeping--;
            // 睡眠中でもプレイヤーが隣接すると起きる可能性
            const distance = Math.abs(this.player.x - enemy.x) + Math.abs(this.player.y - enemy.y);
            if (distance <= 1 && Math.random() < 0.5) {
                enemy.sleeping = 0;
                this.addMessage(`The ${enemy.name} wakes up!`, 'combat');
            } else {
                return; // 睡眠中は移動できない
            }
        }
        
        // Skip turn occasionally for some monsters (representing confusion, hesitation, etc.)
        if (enemy.isMean && Math.random() < 0.1) {
            return; // Mean monsters sometimes pause to strategize
        }
        
        const dx = Math.sign(this.player.x - enemy.x);
        const dy = Math.sign(this.player.y - enemy.y);
        
        // 混乱状態の処理
        if (enemy.confused > 0) {
            enemy.confused--;
            // 混乱中はランダムな方向に移動
            const directions = [{x: -1, y: 0}, {x: 1, y: 0}, {x: 0, y: -1}, {x: 0, y: 1}];
            const randomDir = directions[Math.floor(Math.random() * directions.length)];
            const newX = enemy.x + randomDir.x;
            const newY = enemy.y + randomDir.y;
            
            if (this.isValidMoveForEnemy(newX, newY, enemy.canFly) && !this.getEnemyAt(newX, newY)) {
                enemy.x = newX;
                enemy.y = newY;
            }
            return;
        }
        
        // 恐怖状態の処理
        if (enemy.scared > 0) {
            enemy.scared--;
            // 恐怖中はプレイヤーから逃げる
            const escapeDx = -dx;
            const escapeDy = -dy;
            const newX = enemy.x + escapeDx;
            const newY = enemy.y + escapeDy;
            
            if (this.isValidMoveForEnemy(newX, newY, enemy.canFly) && !this.getEnemyAt(newX, newY)) {
                enemy.x = newX;
                enemy.y = newY;
            }
            return;
        }
        
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
            this.addMessage(`${thief.name} tries to steal but you have nothing!`);
            return;
        }
        
        // Steal a random item
        const stolenIndex = Math.floor(Math.random() * this.player.inventory.length);
        const stolenItem = this.player.inventory[stolenIndex];
        
        this.player.inventory.splice(stolenIndex, 1);
        this.addMessage(`${thief.name} steals your ${stolenItem.name}!`);
        
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
            
            const room = { x, y, width, height };
            
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
        
        // Place stairs in last room
        if (rooms.length > 0) {
            const lastRoom = rooms[rooms.length - 1];
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
            level: 1,
            experience: 0,
            experienceToNext: 100,
            gold: 0,
            inventory: [],
            equipment: {     // 装備スロット
                weapon: null,
                armor: null,
                leftRing: null,   // 左手の指輪
                rightRing: null   // 右手の指輪
            },
            // ステータス効果システム
            statusEffects: {
                confused: 0,        // 混乱状態の残りターン数
                hallucinating: 0,   // 幻覚状態の残りターン数
                poisoned: 0,        // 毒状態の残りターン数
                blind: 0,           // 盲目状態の残りターン数
                levitating: 0,      // 浮遊状態の残りターン数
                hasted: 0,          // 加速状態の残りターン数
                seeInvisible: 0,    // 透明視認の残りターン数
                detectMonsters: 0,  // モンスター探知の残りターン数
                detectMagic: 0      // 魔法探知の残りターン数
            },
            strength: 16,           // 筋力
            maxStrength: 16,        // 最大筋力
            symbol: '@',
            color: this.colors.player,
            rest: function() {
                this.hp = Math.min(this.maxHp, this.hp + 2);
                this.mp = Math.min(this.maxMp, this.mp + 1);
            }
        };
    }
    
    spawnEnemies() {
        // 新しい強化モンスターシステムを使用
        // Spawn enemies in rooms (except first room where player starts)
        for (let i = 1; i < this.rooms.length; i++) {
            const room = this.rooms[i];
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
        // オリジナル Rogue 5.4.4 準拠のポーション定義
        const potionTypes = [
            { name: 'confusion', effect: 'confusion', weight: 7 },
            { name: 'hallucination', effect: 'hallucination', weight: 8 },
            { name: 'poison', effect: 'poison', weight: 8 },
            { name: 'gain strength', effect: 'gain_strength', weight: 13 },
            { name: 'see invisible', effect: 'see_invisible', weight: 3 },
            { name: 'healing', effect: 'healing', weight: 13 },
            { name: 'monster detection', effect: 'monster_detection', weight: 6 },
            { name: 'magic detection', effect: 'magic_detection', weight: 6 },
            { name: 'raise level', effect: 'raise_level', weight: 2 },
            { name: 'extra healing', effect: 'extra_healing', weight: 5 },
            { name: 'haste self', effect: 'haste_self', weight: 5 },
            { name: 'restore strength', effect: 'restore_strength', weight: 13 },
            { name: 'blindness', effect: 'blindness', weight: 5 },
            { name: 'levitation', effect: 'levitation', weight: 6 }
        ];

        // オリジナル Rogue 5.4.4 準拠のスクロール定義
        const scrollTypes = [
            { name: 'monster confusion', effect: 'monster_confusion', weight: 7 },
            { name: 'magic mapping', effect: 'magic_mapping', weight: 4 },
            { name: 'hold monster', effect: 'hold_monster', weight: 2 },
            { name: 'sleep', effect: 'sleep', weight: 3 },
            { name: 'enchant armor', effect: 'enchant_armor', weight: 7 },
            { name: 'identify potion', effect: 'identify_potion', weight: 10 },
            { name: 'identify scroll', effect: 'identify_scroll', weight: 10 },
            { name: 'identify weapon', effect: 'identify_weapon', weight: 6 },
            { name: 'identify armor', effect: 'identify_armor', weight: 7 },
            { name: 'identify ring, wand or staff', effect: 'identify_ring', weight: 10 },
            { name: 'scare monster', effect: 'scare_monster', weight: 3 },
            { name: 'food detection', effect: 'food_detection', weight: 2 },
            { name: 'teleportation', effect: 'teleportation', weight: 5 },
            { name: 'enchant weapon', effect: 'enchant_weapon', weight: 8 },
            { name: 'create monster', effect: 'create_monster', weight: 4 },
            { name: 'remove curse', effect: 'remove_curse', weight: 7 },
            { name: 'aggravate monsters', effect: 'aggravate_monsters', weight: 3 },
            { name: 'protect armor', effect: 'protect_armor', weight: 2 }
        ];

        // オリジナル Rogue 5.4.4 準拠の指輪定義
        const ringTypes = [
            { name: 'protection', effect: 'ring_protection', power: 1, weight: 9 },
            { name: 'add strength', effect: 'ring_add_strength', power: 1, weight: 9 },
            { name: 'sustain strength', effect: 'ring_sustain_strength', power: 0, weight: 5 },
            { name: 'searching', effect: 'ring_searching', power: 0, weight: 10 },
            { name: 'see invisible', effect: 'ring_see_invisible', power: 0, weight: 10 },
            { name: 'adornment', effect: 'ring_adornment', power: 0, weight: 1 },
            { name: 'aggravate monster', effect: 'ring_aggravate_monster', power: 0, weight: 10 },
            { name: 'dexterity', effect: 'ring_dexterity', power: 1, weight: 8 },
            { name: 'increase damage', effect: 'ring_increase_damage', power: 1, weight: 8 },
            { name: 'regeneration', effect: 'ring_regeneration', power: 0, weight: 4 },
            { name: 'slow digestion', effect: 'ring_slow_digestion', power: 0, weight: 9 },
            { name: 'teleportation', effect: 'ring_teleportation', power: 0, weight: 5 },
            { name: 'stealth', effect: 'ring_stealth', power: 0, weight: 7 },
            { name: 'maintain armor', effect: 'ring_maintain_armor', power: 0, weight: 5 }
        ];

        const itemTypes = [];
        
        // ポーション追加
        potionTypes.forEach(potion => {
            itemTypes.push({
                name: `Potion of ${potion.name}`,
                symbol: '!',
                type: 'potion',
                effect: potion.effect,
                color: this.colors.potion,
                weight: potion.weight
            });
        });
        
        // スクロール追加  
        scrollTypes.forEach(scroll => {
            itemTypes.push({
                name: `Scroll of ${scroll.name}`,
                symbol: '?',
                type: 'scroll', 
                effect: scroll.effect,
                color: this.colors.item,
                weight: scroll.weight
            });
        });

        // 指輪追加
        ringTypes.forEach(ring => {
            itemTypes.push({
                name: `Ring of ${ring.name}`,
                symbol: '=',
                type: 'ring',
                effect: ring.effect,
                power: ring.power,
                color: this.colors.ring,
                weight: ring.weight
            });
        });

        // 既存のアイテム追加
        itemTypes.push(
            { name: 'Sword', symbol: ')', type: 'weapon', attack: 5, color: this.colors.weapon, weight: 7 },
            { name: 'Shield', symbol: ']', type: 'armor', defense: 3, color: this.colors.weapon, weight: 7 },
            { name: 'Gold Coin', symbol: '*', type: 'gold', value: 25, color: this.colors.item, weight: 15 }
        );
        
        // 重み付きランダム選択関数
        const selectWeightedItem = (items) => {
            const totalWeight = items.reduce((sum, item) => sum + (item.weight || 1), 0);
            let random = Math.random() * totalWeight;
            
            for (const item of items) {
                random -= (item.weight || 1);
                if (random <= 0) {
                    return item;
                }
            }
            return items[items.length - 1];
        };
        
        // Spawn items randomly in rooms
        this.rooms.forEach(room => {
            if (Math.random() < 0.6) { // 60% chance per room
                const itemType = selectWeightedItem(itemTypes);
                const x = this.random(room.x + 1, room.x + room.width - 1);
                const y = this.random(room.y + 1, room.y + room.height - 1);
                
                if (this.dungeon[y][x] === '.') {
                    this.items.push({
                        ...itemType,
                        x, y,
                        id: this.nextItemId++ // グローバルカウンターでユニークID生成
                    });
                }
            }
        });
    }
    
    pickupItem() {
        const item = this.items.find(item => 
            item.x === this.player.x && item.y === this.player.y
        );
        
        if (item) {
            if (item.type === 'gold') {
                this.player.gold += item.value;
                this.audioManager.playSound('gold');
                this.addMessage(`You picked up ${item.value} gold!`, 'item');
            } else {
                // インベントリに追加する際に新しいIDを割り当て（重複防止）
                const inventoryItem = {
                    ...item,
                    id: this.nextItemId++
                };
                this.player.inventory.push(inventoryItem);
                this.audioManager.playSound('itemPickup');
                this.addMessage(`You picked up ${item.name}!`, 'item');
            }
            
            this.items = this.items.filter(i => i.id !== item.id);
            this.processTurn();
        } else {
            this.addMessage("There's nothing here to pick up.", 'system');
        }
    }
    
    // 自動アイテム取得メソッド（移動時に呼び出される）
    autoPickupItems() {
        const item = this.items.find(item => 
            item.x === this.player.x && item.y === this.player.y
        );
        
        if (item) {
            if (item.type === 'gold') {
                this.player.gold += item.value;
                this.audioManager.playSound('gold');
                this.addMessage(`You picked up ${item.value} gold!`, 'item');
            } else {
                // インベントリに追加する際に新しいIDを割り当て（重複防止）
                const inventoryItem = {
                    ...item,
                    id: this.nextItemId++
                };
                this.player.inventory.push(inventoryItem);
                this.audioManager.playSound('itemPickup');
                this.addMessage(`You picked up ${item.name}!`, 'item');
            }
            
            this.items = this.items.filter(i => i.id !== item.id);
        }
    }
    
    useItem() {
        // ポーションを最優先で使用
        const potion = this.player.inventory.find(item => item.type === 'potion');
        if (potion) {
            if (potion.effect === 'heal') {
                this.player.hp = Math.min(this.player.maxHp, this.player.hp + potion.value);
                this.addMessage(`You drink the ${potion.name} and recover ${potion.value} HP!`, 'item');
            } else if (potion.effect === 'mana') {
                this.player.mp = Math.min(this.player.maxMp, this.player.mp + potion.value);
                this.addMessage(`You drink the ${potion.name} and recover ${potion.value} MP!`, 'item');
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
            this.addMessage("You don't have any usable items.", 'system');
        }
    }
    
    // 新しいアイテム選択システム
    startItemSelection() {
        if (this.player.inventory.length === 0) {
            this.addMessage("Your inventory is empty.", 'system');
            return;
        }
        
        this.itemSelectionMode = true;
        this.addMessage("=== SELECT ITEM TO USE ===", 'system');
        
        this.player.inventory.forEach((item, index) => {
            const keyNumber = index + 1;
            let description = `${keyNumber}: ${item.symbol} ${item.name}`;
            
            if (item.type === 'potion') {
                description += ` (${item.effect === 'heal' ? 'HP' : 'MP'} +${item.value})`;
            } else if (item.type === 'weapon') {
                description += ` (Attack +${item.attack})`;
            } else if (item.type === 'armor') {
                description += ` (Defense +${item.defense})`;
            } else if (item.type === 'ring') {
                // 指輪の効果説明
                switch(item.effect) {
                    case 'ring_protection':
                        description += ` (Defense +${item.power || 1})`;
                        break;
                    case 'ring_add_strength':
                        description += ` (Attack +${item.power || 1})`;
                        break;
                    case 'ring_increase_damage':
                        description += ` (Damage +${item.power || 1})`;
                        break;
                    default:
                        description += ` (Magical ring)`;
                        break;
                }
            }
            
            this.addMessage(description, 'item');
        });
        
        this.addMessage("Press 1-9 to use item, or ESC to cancel.", 'system');
    }
    
    handleItemSelection(e) {
        const key = e.key.toLowerCase();
        
        if (key === 'escape') {
            this.itemSelectionMode = false;
            this.addMessage("Item selection cancelled.", 'system');
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
                this.addMessage("Invalid item number.", 'system');
            }
            return;
        }
        
        const item = this.player.inventory[index];
        
        if (item.type === 'potion') {
            this.usePotionEffect(item);
            this.removeItemFromInventory(item.id);
            this.processTurn();
            
        } else if (item.type === 'scroll') {
            this.useScrollEffect(item);
            this.removeItemFromInventory(item.id);
            this.processTurn();
            
        } else if (item.type === 'weapon' || item.type === 'armor' || item.type === 'ring') {
            // 装備アイテムの場合は equipItem メソッドに処理を委任
            // equipItem 内でインベントリからの削除も処理される
            this.equipItem(item);
            
        } else {
            this.addMessage("You can't use that item.", 'system');
        }
    }
    
    // ===== ポーション効果システム =====
    usePotionEffect(item) {
        const effect = item.effect;
        this.addMessage(`You drink the ${item.name}.`, 'item');
        this.audioManager.playSound('heal');
        
        switch (effect) {
            case 'healing':
                const healAmount = this.random(1, 8) + 1;
                this.player.hp = Math.min(this.player.maxHp, this.player.hp + healAmount);
                this.addMessage(`You feel better! (+${healAmount} HP)`, 'system');
                break;
                
            case 'extra_healing':
                const extraHealAmount = this.random(8, 16) + 8;
                this.player.hp = Math.min(this.player.maxHp, this.player.hp + extraHealAmount);
                this.addMessage(`You feel much better! (+${extraHealAmount} HP)`, 'system');
                break;
                
            case 'gain_strength':
                this.player.strength++;
                this.player.maxStrength++;
                this.addMessage("You feel stronger!", 'system');
                break;
                
            case 'restore_strength':
                if (this.player.strength < this.player.maxStrength) {
                    this.player.strength = this.player.maxStrength;
                    this.addMessage("Your strength is restored!", 'system');
                } else {
                    this.addMessage("Nothing happens.", 'system');
                }
                break;
                
            case 'raise_level':
                this.player.level++;
                this.player.experienceToNext = Math.floor(this.player.experienceToNext * 1.5);
                const hpIncrease = this.random(8, 15);
                const mpIncrease = this.random(3, 8);
                this.player.maxHp += hpIncrease;
                this.player.hp += hpIncrease;
                this.player.maxMp += mpIncrease;
                this.player.mp += mpIncrease;
                this.player.baseAttack += this.random(1, 3);
                this.player.baseDefense += this.random(1, 2);
                this.updatePlayerStats();
                this.addMessage("You feel more experienced! You gained a level!", 'system');
                break;
                
            case 'haste_self':
                this.player.statusEffects.hasted = this.random(40, 80);
                this.addMessage("You feel yourself speed up!", 'system');
                break;
                
            case 'see_invisible':
                this.player.statusEffects.seeInvisible = this.random(400, 600);
                this.addMessage("Your eyes begin to tingle!", 'system');
                break;
                
            case 'monster_detection':
                this.player.statusEffects.detectMonsters = this.random(40, 80);
                this.addMessage("You sense monsters around you!", 'system');
                break;
                
            case 'magic_detection':
                this.player.statusEffects.detectMagic = this.random(40, 80);
                this.addMessage("You sense magic around you!", 'system');
                break;
                
            case 'levitation':
                this.player.statusEffects.levitating = this.random(80, 120);
                this.addMessage("You start to float in the air!", 'system');
                break;
                
            case 'confusion':
                this.player.statusEffects.confused = this.random(20, 40);
                this.addMessage("You feel confused!", 'system');
                break;
                
            case 'hallucination':
                this.player.statusEffects.hallucinating = this.random(300, 500);
                this.addMessage("You begin to hallucinate...", 'system');
                break;
                
            case 'poison':
                this.player.statusEffects.poisoned = this.random(10, 20);
                this.addMessage("You feel very sick!", 'system');
                break;
                
            case 'blindness':
                this.player.statusEffects.blind = this.random(800, 1000);
                this.addMessage("A cloak of darkness falls around you!", 'system');
                break;
                
            default:
                this.addMessage("Nothing happens.", 'system');
                break;
        }
    }
    
    // ===== スクロール効果システム =====
    useScrollEffect(item) {
        const effect = item.effect;
        this.addMessage(`You read the ${item.name}.`, 'item');
        this.audioManager.playSound('heal'); // スクロール用の音があれば変更
        
        switch (effect) {
            case 'monster_confusion':
                this.confuseNearbyMonsters();
                this.addMessage("You hear a high pitched humming noise.", 'system');
                break;
                
            case 'magic_mapping':
                this.revealDungeon();
                this.addMessage("You have a strange feeling for a moment, then it passes.", 'system');
                break;
                
            case 'hold_monster':
                this.freezeNearbyMonsters();
                this.addMessage("The monsters around you freeze!", 'system');
                break;
                
            case 'sleep':
                this.sleepNearbyMonsters();
                this.addMessage("You hear a faint cry of anguish in the distance.", 'system');
                break;
                
            case 'enchant_armor':
                if (this.player.equipment.armor) {
                    this.player.equipment.armor.defense += this.random(1, 3);
                    this.updatePlayerStats();
                    this.addMessage(`Your ${this.player.equipment.armor.name} glows for a moment!`, 'system');
                } else {
                    this.addMessage("Your skin crawls for a moment.", 'system');
                }
                break;
                
            case 'enchant_weapon':
                if (this.player.equipment.weapon) {
                    this.player.equipment.weapon.attack += this.random(1, 3);
                    this.updatePlayerStats();
                    this.addMessage(`Your ${this.player.equipment.weapon.name} glows for a moment!`, 'system');
                } else {
                    this.addMessage("Your hands tingle for a moment.", 'system');
                }
                break;
                
            case 'identify_potion':
            case 'identify_scroll':
            case 'identify_weapon':
            case 'identify_armor':
            case 'identify_ring':
                this.addMessage("This is an identify scroll.", 'system');
                // TODO: 実際の識別システムを実装する際に詳細を追加
                break;
                
            case 'scare_monster':
                this.scareNearbyMonsters();
                this.addMessage("You hear maniacal laughter in the distance.", 'system');
                break;
                
            case 'food_detection':
                this.addMessage("Your nose tingles.", 'system');
                // TODO: 食べ物探知機能を実装する際に追加
                break;
                
            case 'teleportation':
                this.teleportPlayer();
                this.addMessage("You feel a strange sensation!", 'system');
                break;
                
            case 'create_monster':
                this.createNearbyMonster();
                this.addMessage("You hear a faint cry of anguish in the distance.", 'system');
                break;
                
            case 'remove_curse':
                this.addMessage("You feel as if somebody is watching over you.", 'system');
                // TODO: 呪い解除システムを実装する際に追加
                break;
                
            case 'aggravate_monsters':
                this.aggravateMonsters();
                this.addMessage("You hear a high pitched humming noise.", 'system');
                break;
                
            case 'protect_armor':
                if (this.player.equipment.armor) {
                    this.addMessage(`Your ${this.player.equipment.armor.name} is covered by a shimmering gold shield!`, 'system');
                    // TODO: 装備保護システムを実装する際に追加
                } else {
                    this.addMessage("Your skin crawls for a moment.", 'system');
                }
                break;
                
            default:
                this.addMessage("Nothing happens.", 'system');
                break;
        }
    }
    
    // スクロール効果用の追加ヘルパーメソッド
    freezeNearbyMonsters() {
        let count = 0;
        this.entities.forEach(entity => {
            const distance = Math.abs(entity.x - this.player.x) + Math.abs(entity.y - this.player.y);
            if (distance <= 5 && entity.type === 'enemy' && entity.alive) {
                entity.frozen = this.random(10, 20);
                count++;
            }
        });
        return count;
    }
    
    sleepNearbyMonsters() {
        let count = 0;
        this.entities.forEach(entity => {
            const distance = Math.abs(entity.x - this.player.x) + Math.abs(entity.y - this.player.y);
            if (distance <= 5 && entity.type === 'enemy' && entity.alive) {
                entity.sleeping = this.random(15, 30);
                count++;
            }
        });
        return count;
    }
    
    scareNearbyMonsters() {
        let count = 0;
        this.entities.forEach(entity => {
            const distance = Math.abs(entity.x - this.player.x) + Math.abs(entity.y - this.player.y);
            if (distance <= 5 && entity.type === 'enemy' && entity.alive) {
                entity.scared = this.random(20, 40);
                count++;
            }
        });
        return count;
    }
    
    createNearbyMonster() {
        // プレイヤーの近くにモンスターを生成
        for (let attempts = 0; attempts < 20; attempts++) {
            const x = this.player.x + this.random(-3, 4);
            const y = this.player.y + this.random(-3, 4);
            
            if (this.isValidMove(x, y) && !this.getEnemyAt(x, y)) {
                const monster = this.createEnhancedMonster(x, y, this.floor);
                this.entities.push(monster);
                break;
            }
        }
    }
    
    aggravateMonsters() {
        this.entities.forEach(entity => {
            if (entity.type === 'enemy' && entity.alive) {
                entity.isMean = true;
                entity.aggravated = this.random(50, 100);
            }
        });
    }

    // ===== スクロール読み込みシステム =====
    readScroll() {
        const scrolls = this.player.inventory.filter(item => item.type === 'scroll');
        
        if (scrolls.length === 0) {
            this.addMessage("You don't have any scrolls to read.", 'system');
            return;
        }
        
        if (scrolls.length === 1) {
            // 1つしかない場合は直接使用
            this.useScrollEffect(scrolls[0]);
            this.removeItemFromInventory(scrolls[0].id);
            this.processTurn();
        } else {
            // 複数ある場合は選択画面を表示
            this.scrollSelectionMode = true;
            this.addMessage("=== SELECT SCROLL TO READ ===", 'system');
            
            scrolls.forEach((scroll, index) => {
                const keyNumber = index + 1;
                this.addMessage(`${keyNumber}: ${scroll.symbol} ${scroll.name}`, 'item');
            });
            
            this.addMessage("Press 1-9 to read scroll, or ESC to cancel.", 'system');
        }
    }
    
    handleScrollSelection(e) {
        const key = e.key.toLowerCase();
        
        if (key === 'escape') {
            this.scrollSelectionMode = false;
            this.addMessage("Scroll reading cancelled.", 'system');
            e.preventDefault();
            return;
        }
        
        // 数字キーの処理
        if (key >= '1' && key <= '9') {
            const scrolls = this.player.inventory.filter(item => item.type === 'scroll');
            const index = parseInt(key) - 1;
            
            if (index < scrolls.length) {
                const scroll = scrolls[index];
                this.useScrollEffect(scroll);
                this.removeItemFromInventory(scroll.id);
                this.processTurn();
            } else {
                this.addMessage("Invalid scroll number.", 'system');
            }
            
            this.scrollSelectionMode = false;
        }
        
        e.preventDefault();
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
            
            this.player.maxHp += hpIncrease;
            this.player.hp += hpIncrease;
            this.player.maxMp += mpIncrease;
            this.player.mp += mpIncrease;
            this.player.baseAttack += attackIncrease;  // 基本ステータスを更新
            this.player.baseDefense += defenseIncrease; // 基本ステータスを更新
            
            // 装備込みステータスを再計算
            this.updatePlayerStats();
            
            // Play level up sound
            this.audioManager.playSound('levelUp');
            
            this.addMessage(`Level up! You are now level ${this.player.level}!`, 'system');
            this.addMessage(`HP +${hpIncrease}, MP +${mpIncrease}, Attack +${attackIncrease}, Defense +${defenseIncrease}`, 'system');
        }
    }
    
    descendStairs() {
        this.floor++; // 階層を増やす
        this.audioManager.playSound('stairs');
        this.addMessage(`You descend deeper into the dungeon... (Floor ${this.floor})`, 'system');
        this.generateDungeon();
        
        // Place player at start of new level
        const firstRoom = this.rooms[0];
        this.player.x = firstRoom.x + Math.floor(firstRoom.width / 2);
        this.player.y = firstRoom.y + Math.floor(firstRoom.height / 2);
        
        // Clear and respawn entities and items
        this.entities = [];
        this.items = [];
        this.spawnEnemies();
        this.spawnItems();
    }
    
    gameOver(killer = null) {
        this.gameState = 'dead';
        this.addMessage("You have died! Game Over.", 'combat');
        
        // ゲームオーバー画面を表示
        setTimeout(() => {
            this.showGameOverScreen(killer);
        }, 1000); // 1秒後に表示
    }
    
    toggleInventory() {
        // Simple inventory display in messages (旧来のメソッド - 後方互換性のために残す)
        this.addMessage("=== INVENTORY ===", 'system');
        if (this.player.inventory.length === 0) {
            this.addMessage("Your inventory is empty.", 'system');
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
                } else if (item.type === 'ring') {
                    // 指輪の効果説明
                    switch(item.effect) {
                        case 'ring_protection':
                            description += ` (Defense +${item.power || 1})`;
                            break;
                        case 'ring_add_strength':
                            description += ` (Attack +${item.power || 1})`;
                            break;
                        case 'ring_increase_damage':
                            description += ` (Damage +${item.power || 1})`;
                            break;
                        default:
                            description += ` (Magical ring)`;
                            break;
                    }
                }
                
                this.addMessage(description, 'item');
            });
            this.addMessage("Press 1-9 to use item directly, or U to enter selection mode.", 'system');
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
        header.textContent = '🎒 INVENTORY';
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
            emptyMsg.textContent = 'Your inventory is empty.';
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
            <strong>Controls:</strong><br>
            Click on items to interact • ESC or I to close<br>
            1-9: Use item directly
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
        const isEquipped = (this.player.equipment.weapon && this.player.equipment.weapon.name === item.name) ||
                          (this.player.equipment.armor && this.player.equipment.armor.name === item.name) ||
                          (this.player.equipment.leftRing && this.player.equipment.leftRing.name === item.name) ||
                          (this.player.equipment.rightRing && this.player.equipment.rightRing.name === item.name);
        
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
        name.textContent = `${index + 1}. ${item.name}${isEquipped ? ' [EQUIPPED]' : ''}`;
        
        const description = document.createElement('div');
        description.style.cssText = `
            font-size: 12px;
            color: #666666;
            margin-top: 2px;
        `;
        
        let descText = '';
        if (item.type === 'potion') {
            descText = `${item.effect === 'heal' ? 'HP' : 'MP'} Recovery +${item.value}`;
        } else if (item.type === 'weapon') {
            descText = `Attack Power +${item.attack}`;
        } else if (item.type === 'armor') {
            descText = `Defense Power +${item.defense}`;
        } else if (item.type === 'ring') {
            // 指輪の効果説明
            switch(item.effect) {
                case 'ring_protection':
                    descText = `Defense +${item.power || 1}`;
                    break;
                case 'ring_add_strength':
                    descText = `Attack +${item.power || 1}`;
                    break;
                case 'ring_increase_damage':
                    descText = `Damage +${item.power || 1}`;
                    break;
                case 'ring_sustain_strength':
                    descText = 'Prevents strength loss';
                    break;
                case 'ring_searching':
                    descText = 'Improves search ability';
                    break;
                case 'ring_see_invisible':
                    descText = 'See invisible creatures';
                    break;
                default:
                    descText = 'Magical ring';
                    break;
            }
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
            let useText = 'Use';
            
            if (item.effect === 'heal' && this.player.hp >= this.player.maxHp) {
                canUse = false;
                useText = 'HP Full';
            } else if (item.effect === 'mana' && this.player.mp >= this.player.maxMp) {
                canUse = false;
                useText = 'MP Full';
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
            
        } else if (item.type === 'weapon' || item.type === 'armor' || item.type === 'ring') {
            if (isEquipped) {
                let slotToUnequip = '';
                if (item.type === 'weapon') slotToUnequip = 'weapon';
                else if (item.type === 'armor') slotToUnequip = 'armor';
                else if (item.type === 'ring') {
                    // 指輪の場合、どちらの手にあるかチェック
                    if (this.player.equipment.leftRing && this.player.equipment.leftRing.name === item.name) {
                        slotToUnequip = 'leftRing';
                    } else if (this.player.equipment.rightRing && this.player.equipment.rightRing.name === item.name) {
                        slotToUnequip = 'rightRing';
                    }
                }
                
                const unequipBtn = this.createActionButton('Unequip', '#666666', () => {
                    this.unequipItem(slotToUnequip);
                    this.updateInventoryUI();
                });
                actions.appendChild(unequipBtn);
            } else {
                const equipBtn = this.createActionButton('Equip', '#000000', () => {
                    this.equipItem(item);
                    this.updateInventoryUI();
                });
                actions.appendChild(equipBtn);
            }
        }
        
        const dropBtn = this.createActionButton('Drop', '#999999', () => {
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
                } else if ((item.type === 'weapon' || item.type === 'armor' || item.type === 'ring') && !isEquipped) {
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
                } else if (item.type === 'weapon' || item.type === 'armor' || item.type === 'ring') {
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
        this.addMessage(`You drop ${item.name}.`, 'item');
    }
    
    // Equipment System
    equipItem(item) {
        if (item.type === 'weapon') {
            // 同じ武器を再装備しようとしている場合はスキップ
            if (this.player.equipment.weapon && this.player.equipment.weapon.id === item.id) {
                this.addMessage(`${item.name} is already equipped.`, 'system');
                return;
            }
            
            // まず、インベントリから装備するアイテムを削除
            if (!this.removeItemFromInventory(item.id)) {
                this.addMessage("Failed to equip item - item not found in inventory.", 'system');
                return;
            }
            
            // 既存の武器を外してインベントリに戻す
            if (this.player.equipment.weapon) {
                const unequippedItem = {
                    ...this.player.equipment.weapon,
                    id: this.nextItemId++  // 新しいIDを割り当て
                };
                this.player.inventory.push(unequippedItem);
                this.addMessage(`You unequip ${this.player.equipment.weapon.name}.`, 'item');
            }
            
            // 新しい武器を装備
            this.player.equipment.weapon = item;
            this.audioManager.playSound('equip');
            this.addMessage(`You equip ${item.name}! Attack +${item.attack}`, 'item');
            
        } else if (item.type === 'armor') {
            // 同じ防具を再装備しようとしている場合はスキップ
            if (this.player.equipment.armor && this.player.equipment.armor.id === item.id) {
                this.addMessage(`${item.name} is already equipped.`, 'system');
                return;
            }
            
            // まず、インベントリから装備するアイテムを削除
            if (!this.removeItemFromInventory(item.id)) {
                this.addMessage("Failed to equip item - item not found in inventory.", 'system');
                return;
            }
            
            // 既存の防具を外してインベントリに戻す
            if (this.player.equipment.armor) {
                const unequippedItem = {
                    ...this.player.equipment.armor,
                    id: this.nextItemId++  // 新しいIDを割り当て
                };
                this.player.inventory.push(unequippedItem);
                this.addMessage(`You unequip ${this.player.equipment.armor.name}.`, 'item');
            }
            
            // 新しい防具を装備
            this.player.equipment.armor = item;
            this.audioManager.playSound('equip');
            this.addMessage(`You equip ${item.name}! Defense +${item.defense}`, 'item');
            
        } else if (item.type === 'ring') {
            // 同じ指輪を再装備しようとしている場合はスキップ
            if ((this.player.equipment.leftRing && this.player.equipment.leftRing.id === item.id) ||
                (this.player.equipment.rightRing && this.player.equipment.rightRing.id === item.id)) {
                this.addMessage(`${item.name} is already equipped.`, 'system');
                return;
            }
            
            // 左手に指輪を優先装備
            if (!this.player.equipment.leftRing) {
                // まず、インベントリから装備するアイテムを削除
                if (!this.removeItemFromInventory(item.id)) {
                    this.addMessage("Failed to equip ring - item not found in inventory.", 'system');
                    return;
                }
                
                this.player.equipment.leftRing = item;
                this.audioManager.playSound('equip');
                this.addMessage(`You put on ${item.name} on your left hand.`, 'item');
                
            } else if (!this.player.equipment.rightRing) {
                // 右手に装備
                if (!this.removeItemFromInventory(item.id)) {
                    this.addMessage("Failed to equip ring - item not found in inventory.", 'system');
                    return;
                }
                
                this.player.equipment.rightRing = item;
                this.audioManager.playSound('equip');
                this.addMessage(`You put on ${item.name} on your right hand.`, 'item');
                
            } else {
                // 両手が塞がっている場合、左手の指輪を外して新しい指輪を装備
                const unequippedRing = {
                    ...this.player.equipment.leftRing,
                    id: this.nextItemId++
                };
                this.player.inventory.push(unequippedRing);
                this.addMessage(`You remove ${this.player.equipment.leftRing.name} from your left hand.`, 'item');
                
                // インベントリから新しい指輪を削除
                if (!this.removeItemFromInventory(item.id)) {
                    this.addMessage("Failed to equip ring - item not found in inventory.", 'system');
                    return;
                }
                
                this.player.equipment.leftRing = item;
                this.audioManager.playSound('equip');
                this.addMessage(`You put on ${item.name} on your left hand.`, 'item');
            }
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
            
            if (slot === 'leftRing' || slot === 'rightRing') {
                const handName = slot === 'leftRing' ? 'left' : 'right';
                this.addMessage(`You remove ${item.name} from your ${handName} hand.`, 'item');
            } else {
                this.addMessage(`You unequip ${item.name}.`, 'item');
            }
            
            this.updatePlayerStats();
        }
    }
    
    showEquipment() {
        this.addMessage("=== EQUIPMENT ===", 'system');
        if (this.player.equipment.weapon) {
            this.addMessage(`Weapon: ${this.player.equipment.weapon.symbol} ${this.player.equipment.weapon.name} (+${this.player.equipment.weapon.attack} Attack)`, 'item');
        } else {
            this.addMessage("Weapon: None", 'system');
        }
        
        if (this.player.equipment.armor) {
            this.addMessage(`Armor: ${this.player.equipment.armor.symbol} ${this.player.equipment.armor.name} (+${this.player.equipment.armor.defense} Defense)`, 'item');
        } else {
            this.addMessage("Armor: None", 'system');
        }
        
        if (this.player.equipment.leftRing) {
            this.addMessage(`Left Ring: ${this.player.equipment.leftRing.symbol} ${this.player.equipment.leftRing.name}`, 'item');
        } else {
            this.addMessage("Left Ring: None", 'system');
        }
        
        if (this.player.equipment.rightRing) {
            this.addMessage(`Right Ring: ${this.player.equipment.rightRing.symbol} ${this.player.equipment.rightRing.name}`, 'item');
        } else {
            this.addMessage("Right Ring: None", 'system');
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
        } else if (this.player.equipment.leftRing) {
            this.unequipItem('leftRing');
            this.processTurn();
        } else if (this.player.equipment.rightRing) {
            this.unequipItem('rightRing');
            this.processTurn();
        } else {
            this.addMessage("You have no equipment to remove.", 'system');
        }
    }
    
    updatePlayerStats() {
        // 基本ステータスから開始
        this.player.attack = this.player.baseAttack;
        this.player.defense = this.player.baseDefense;
        
        // 装備ボーナスを加算
        if (this.player.equipment.weapon) {
            this.player.attack += this.player.equipment.weapon.attack || 0;
        }
        if (this.player.equipment.armor) {
            this.player.defense += this.player.equipment.armor.defense || 0;
        }
        
        // 指輪効果を適用
        this.applyRingEffects();
    }
    
    // 指輪効果適用システム
    applyRingEffects() {
        const rings = [this.player.equipment.leftRing, this.player.equipment.rightRing].filter(ring => ring);
        
        rings.forEach(ring => {
            const power = ring.power || 1;
            
            switch(ring.effect) {
                case 'ring_protection':
                    this.player.defense += power;
                    break;
                case 'ring_add_strength':
                    this.player.attack += power;
                    break;
                case 'ring_increase_damage':
                    this.player.attack += power;
                    break;
                case 'ring_dexterity':
                    // 命中率向上効果（将来の実装用）
                    break;
                case 'ring_regeneration':
                    // HP自動回復効果（将来の実装用）
                    break;
                case 'ring_sustain_strength':
                    // 筋力低下防止効果（将来の実装用）
                    break;
                case 'ring_searching':
                    // 探索能力向上効果（将来の実装用）
                    break;
                case 'ring_see_invisible':
                    // 透明な敵の視認効果（将来の実装用）
                    break;
                case 'ring_stealth':
                    // ステルス効果（将来の実装用）
                    break;
                case 'ring_teleportation':
                    // ランダムテレポート効果（将来の実装用）
                    break;
                case 'ring_slow_digestion':
                    // 空腹度減少緩和効果（将来の実装用）
                    break;
                case 'ring_maintain_armor':
                    // 防具劣化防止効果（将来の実装用）
                    break;
                case 'ring_aggravate_monster':
                    // モンスター強化効果（呪いの指輪）
                    break;
                case 'ring_adornment':
                    // 装飾指輪（効果なし）
                    break;
            }
        });
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
        document.getElementById('playerGold').textContent = this.player.gold;
        
        // Update floor display
        document.getElementById('currentFloor').textContent = this.floor;
        
        // Update health bar
        const healthPercent = (this.player.hp / this.player.maxHp) * 100;
        document.getElementById('healthBar').style.width = healthPercent + '%';
        
        // Update mana bar
        const manaPercent = (this.player.mp / this.player.maxMp) * 100;
        document.getElementById('manaBar').style.width = manaPercent + '%';
        
        // Update inventory display
        const inventoryDiv = document.getElementById('inventory');
        inventoryDiv.innerHTML = '';
        this.player.inventory.forEach((item, index) => {
            const div = document.createElement('div');
            const keyNumber = index + 1;
            div.textContent = `${keyNumber}: ${item.symbol} ${item.name}`;
            inventoryDiv.appendChild(div);
        });
        
        // Update status effects display
        this.updateStatusEffectsDisplay();
    }
    
    updateStatusEffectsDisplay() {
        const statusList = document.getElementById('statusList');
        if (!statusList) return;
        
        const activeEffects = [];
        
        if (this.player.statusEffects) {
            Object.entries(this.player.statusEffects).forEach(([effect, duration]) => {
                if (duration > 0) {
                    let displayName = '';
                    let emoji = '';
                    
                    switch (effect) {
                        case 'confused':
                            displayName = 'Confused';
                            emoji = '😵';
                            break;
                        case 'hallucinating':
                            displayName = 'Hallucinating';
                            emoji = '🌈';
                            break;
                        case 'poisoned':
                            displayName = 'Poisoned';
                            emoji = '🤢';
                            break;
                        case 'blind':
                            displayName = 'Blind';
                            emoji = '🕶️';
                            break;
                        case 'levitating':
                            displayName = 'Levitating';
                            emoji = '🕴️';
                            break;
                        case 'hasted':
                            displayName = 'Hasted';
                            emoji = '💨';
                            break;
                        case 'seeInvisible':
                            displayName = 'See Invisible';
                            emoji = '👁️';
                            break;
                        case 'detectMonsters':
                            displayName = 'Detect Monsters';
                            emoji = '🐺';
                            break;
                        case 'detectMagic':
                            displayName = 'Detect Magic';
                            emoji = '✨';
                            break;
                    }
                    
                    if (displayName) {
                        activeEffects.push(`${emoji} ${displayName} (${duration})`);
                    }
                }
            });
        }
        
        if (activeEffects.length === 0) {
            statusList.textContent = 'No effects active';
            statusList.style.color = '#999';
        } else {
            statusList.innerHTML = activeEffects.join('<br>');
            statusList.style.color = '#ecf0f1';
        }
    }
     render() {
        // ダークモード背景に変更
        this.ctx.fillStyle = this.colors.background;
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // Calculate camera offset to center on player
        const cameraX = this.player.x - Math.floor(this.viewWidth / 2);
        const cameraY = this.player.y - Math.floor(this.viewHeight / 2);

        // Render dungeon
        for (let y = 0; y < this.viewHeight; y++) {
            for (let x = 0; x < this.viewWidth; x++) {
                const worldX = x + cameraX;
                const worldY = y + cameraY;

                if (worldX >= 0 && worldX < this.mapWidth && worldY >= 0 && worldY < this.mapHeight) {
                    const tile = this.dungeon[worldY][worldX];
                    this.renderTile(x, y, tile);
                }
            }
        }
        
        // Render items
        this.items.forEach(item => {
            const screenX = item.x - cameraX;
            const screenY = item.y - cameraY;
            
            if (screenX >= 0 && screenX < this.viewWidth && screenY >= 0 && screenY < this.viewHeight) {
                this.renderEntity(screenX, screenY, item.symbol, item.color);
            }
        });
        
        // Render entities
        this.entities.forEach(entity => {
            if (entity.alive) {
                const screenX = entity.x - cameraX;
                const screenY = entity.y - cameraY;
                
                if (screenX >= 0 && screenX < this.viewWidth && screenY >= 0 && screenY < this.viewHeight) {
                    // 幻覚効果：モンスターが違って見える
                    if (this.player.statusEffects.hallucinating > 0) {
                        const hallucinationSymbols = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 
                                                     'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z'];
                        const randomSymbol = hallucinationSymbols[Math.floor(Math.random() * hallucinationSymbols.length)];
                        const randomColor = Math.random() > 0.5 ? this.colors.enemy : this.colors.weapon;
                        this.renderEntity(screenX, screenY, randomSymbol, randomColor);
                    } else {
                        this.renderEntity(screenX, screenY, entity.symbol, entity.color);
                    }
                }
            }
        });
        
        // Render player
        const playerScreenX = this.player.x - cameraX;
        const playerScreenY = this.player.y - cameraY;
        this.renderEntity(playerScreenX, playerScreenY, this.player.symbol, this.player.color);
    }
     renderTile(x, y, tile) {
        const pixelX = x * this.tileSize;
        const pixelY = y * this.tileSize;

        switch(tile) {
            case '#':
                this.ctx.fillStyle = this.colors.wall;
                break;
            case '.':
                this.ctx.fillStyle = this.colors.floor;
                break;
            case '%':
                this.ctx.fillStyle = this.colors.floor;
                break;
            default:
                this.ctx.fillStyle = this.colors.background;
        }

        this.ctx.fillRect(pixelX, pixelY, this.tileSize, this.tileSize);

        // Render stairs symbol
        if (tile === '%') {
            this.renderEntity(x, y, '%', this.colors.stairs);
        }
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
            this.addMessage('Game saved successfully!', 'system');
            console.log('🎮 Game saved to localStorage');
        } catch (error) {
            this.addMessage('Failed to save game!', 'system');
            console.error('💥 Save failed:', error);
        }
    }
    
    loadGame() {
        try {
            const savedData = localStorage.getItem('roguelike_save');
            if (!savedData) {
                this.addMessage('No saved game found!', 'system');
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
            
            this.addMessage(`Game loaded! (Floor ${this.floor}, Turn ${this.turn})`, 'system');
            console.log('🎮 Game loaded from localStorage');
        } catch (error) {
            this.addMessage('Failed to load game!', 'system');
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
              |   killed by      |
              |                  |
              |      2025        |
             *|     *  *  *      | *
     ________)/\\\\_//(\\/(/\\)/\\//\\/|_)_______`;
        
        // 死因を取得
        let causeOfDeath = "mysterious circumstances";
        if (killer) {
            // 英語の冠詞を適切に設定
            const vowels = ['A', 'E', 'I', 'O', 'U'];
            const article = vowels.includes(killer.charAt(0).toUpperCase()) ? 'an' : 'a';
            causeOfDeath = `${article} ${killer}`;
        }
        
        // 墓石の文字部分をカスタマイズ
        const customTombstone = tombstone.replace('killed by a', `killed by`);
        
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
        // オリジナルRogueスタイルのスコア計算
        let score = 0;
        score += this.player.gold * 1; // ゴールド
        score += this.player.experience * 2; // 経験値
        score += (this.player.level - 1) * 100; // レベル
        score += this.floor * 50; // 到達階層
        score += this.turn * 1; // 生存ターン数
        
        // 装備品ボーナス
        if (this.player.equipment.weapon) {
            score += this.player.equipment.weapon.attack * 25;
        }
        if (this.player.equipment.armor) {
            score += this.player.equipment.armor.defense * 25;
        }
        
        return score;
    }
    
    getGameStats() {
        // ゲーム統計情報を取得（簡易版）
        // 実際のゲームではこれらの値を追跡する必要がある
        return {
            monstersKilled: Math.max(0, Math.floor((this.player.experience / 10) - 5)),
            itemsFound: this.player.inventory.length + (this.player.equipment.weapon ? 1 : 0) + (this.player.equipment.armor ? 1 : 0)
        };
    }
    
    // スクロール効果用ヘルパーメソッド
    confuseNearbyMonsters() {
        this.entities.forEach(entity => {
            const distance = Math.abs(entity.x - this.player.x) + Math.abs(entity.y - this.player.y);
            if (distance <= 5 && entity.type === 'enemy') {
                entity.confused = this.random(10, 20);
            }
        });
    }
    
    revealDungeon() {
        // 全ダンジョンを探索済みにする
        for (let y = 0; y < this.height; y++) {
            for (let x = 0; x < this.width; x++) {
                this.explored[y][x] = true;
            }
        }
    }
    
    teleportPlayer() {
        // ランダムな部屋にテレポート
        const room = this.rooms[this.random(0, this.rooms.length)];
        let attempts = 0;
        let newX, newY;
        
        do {
            newX = this.random(room.x + 1, room.x + room.width - 1);
            newY = this.random(room.y + 1, room.y + room.height - 1);
            attempts++;
        } while (this.dungeon[newY][newX] !== '.' && attempts < 50);
        
        if (this.dungeon[newY][newX] === '.') {
            this.player.x = newX;
            this.player.y = newY;
        }
    }
}

// Initialize game when page loads
window.onload = function() {
    const game = new Game();
};
