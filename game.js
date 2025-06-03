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
        
        this.messages = [];
        this.maxMessages = 50;
        
        this.colors = {
            wall: '#000000',
            floor: '#FFFFFF',
            door: '#000000',
            player: '#000000',
            enemy: '#666666',
            item: '#333333',
            potion: '#333333',
            weapon: '#333333',
            stairs: '#000000'
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
        this.render();
        this.updateUI();
    }
    
    setupEventListeners() {
        document.addEventListener('keydown', (e) => this.handleInput(e));
    }
    
    handleInput(e) {
        if (this.gameState === 'dead') return;
        
        // インベントリUI表示中の処理
        if (this.inventoryUIActive) {
            this.handleInventoryInput(e);
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
            case 'g':
                this.pickupItem();
                break;
            case 'u':
                // Use item (now with selection)
                this.startItemSelection();
                break;
            case 'i':
                this.showInventoryUI();
                break;
            case 'e':
                this.showEquipment();
                break;
            case 'r':
                this.removeEquipment();
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
        
        // Check for stairs
        if (this.dungeon[newY][newX] === 'S') {
            this.descendStairs();
        }
        
        this.processTurn();
    }
    
    isValidMove(x, y) {
        if (x < 0 || x >= this.mapWidth || y < 0 || y >= this.mapHeight) {
            return false;
        }
        
        const tile = this.dungeon[y][x];
        return tile === '.' || tile === 'S'; // floor or stairs
    }
    
    getEnemyAt(x, y) {
        return this.entities.find(entity => 
            entity.type === 'enemy' && entity.x === x && entity.y === y && entity.alive
        );
    }
    
    combat(attacker, defender) {
        const damage = Math.max(1, attacker.attack - defender.defense + this.random(-2, 3));
        defender.hp -= damage;
        
        if (attacker === this.player) {
            this.addMessage(`You hit ${defender.name} for ${damage} damage!`, 'combat');
        } else {
            this.addMessage(`${attacker.name} hits you for ${damage} damage!`, 'combat');
        }
        
        if (defender.hp <= 0) {
            defender.alive = false;
            if (defender === this.player) {
                this.gameOver();
            } else {
                this.addMessage(`${defender.name} dies!`, 'combat');
                this.player.experience += defender.experience;
                this.player.gold += defender.gold;
                this.checkLevelUp();
            }
        }
    }
    
    processTurn() {
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
    
    moveEnemyTowardsPlayer(enemy) {
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
        
        if (Math.random() < 0.5) {
            if (dx !== 0 && this.isValidMove(enemy.x + dx, enemy.y) && !this.getEnemyAt(enemy.x + dx, enemy.y)) {
                newX = enemy.x + dx;
            } else if (dy !== 0 && this.isValidMove(enemy.x, enemy.y + dy) && !this.getEnemyAt(enemy.x, enemy.y + dy)) {
                newY = enemy.y + dy;
            }
        } else {
            if (dy !== 0 && this.isValidMove(enemy.x, enemy.y + dy) && !this.getEnemyAt(enemy.x, enemy.y + dy)) {
                newY = enemy.y + dy;
            } else if (dx !== 0 && this.isValidMove(enemy.x + dx, enemy.y) && !this.getEnemyAt(enemy.x + dx, enemy.y)) {
                newX = enemy.x + dx;
            }
        }
        
        enemy.x = newX;
        enemy.y = newY;
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
            this.dungeon[stairY][stairX] = 'S';
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
                armor: null
            },
            symbol: '@',
            color: this.colors.player,
            rest: function() {
                this.hp = Math.min(this.maxHp, this.hp + 2);
                this.mp = Math.min(this.maxMp, this.mp + 1);
            }
        };
    }
    
    spawnEnemies() {
        const enemyTypes = [
            { name: 'Goblin', symbol: 'g', hp: 15, attack: 5, defense: 1, experience: 10, gold: 5 },
            { name: 'Orc', symbol: 'o', hp: 25, attack: 8, defense: 3, experience: 20, gold: 10 },
            { name: 'Skeleton', symbol: 's', hp: 20, attack: 7, defense: 2, experience: 15, gold: 8 }
        ];
        
        // Spawn enemies in rooms (except first room where player starts)
        for (let i = 1; i < this.rooms.length; i++) {
            const room = this.rooms[i];
            const numEnemies = this.random(1, 3);
            
            for (let j = 0; j < numEnemies; j++) {
                const enemyType = enemyTypes[this.random(0, enemyTypes.length)];
                const x = this.random(room.x + 1, room.x + room.width - 1);
                const y = this.random(room.y + 1, room.y + room.height - 1);
                
                if (this.dungeon[y][x] === '.' && !this.getEnemyAt(x, y)) {
                    this.entities.push({
                        ...enemyType,
                        x, y,
                        type: 'enemy',
                        alive: true,
                        color: this.colors.enemy
                    });
                }
            }
        }
    }
    
    spawnItems() {
        const itemTypes = [
            { name: 'Health Potion', symbol: '!', type: 'potion', effect: 'heal', value: 30, color: this.colors.potion },
            { name: 'Mana Potion', symbol: '!', type: 'potion', effect: 'mana', value: 20, color: this.colors.potion },
            { name: 'Sword', symbol: '/', type: 'weapon', attack: 5, color: this.colors.weapon },
            { name: 'Shield', symbol: ']', type: 'armor', defense: 3, color: this.colors.weapon },
            { name: 'Gold Coin', symbol: '$', type: 'gold', value: 25, color: this.colors.item }
        ];
        
        // Spawn items randomly in rooms
        this.rooms.forEach(room => {
            if (Math.random() < 0.6) { // 60% chance per room
                const itemType = itemTypes[this.random(0, itemTypes.length)];
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
                this.addMessage(`You picked up ${item.value} gold!`, 'item');
            } else {
                // インベントリに追加する際に新しいIDを割り当て（重複防止）
                const inventoryItem = {
                    ...item,
                    id: this.nextItemId++
                };
                this.player.inventory.push(inventoryItem);
                this.addMessage(`You picked up ${item.name}!`, 'item');
            }
            
            this.items = this.items.filter(i => i.id !== item.id);
            this.processTurn();
        } else {
            this.addMessage("There's nothing here to pick up.", 'system');
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
            if (item.effect === 'heal') {
                if (this.player.hp >= this.player.maxHp) {
                    this.addMessage("Your HP is already full.", 'system');
                    return;
                }
                this.player.hp = Math.min(this.player.maxHp, this.player.hp + item.value);
                this.addMessage(`You drink the ${item.name} and recover ${item.value} HP!`, 'item');
            } else if (item.effect === 'mana') {
                if (this.player.mp >= this.player.maxMp) {
                    this.addMessage("Your MP is already full.", 'system');
                    return;
                }
                this.player.mp = Math.min(this.player.maxMp, this.player.mp + item.value);
                this.addMessage(`You drink the ${item.name} and recover ${item.value} MP!`, 'item');
            }
            
            // ポーションのみ、使用後にインベントリから削除
            this.removeItemFromInventory(item.id);
            this.processTurn();
            
        } else if (item.type === 'weapon' || item.type === 'armor') {
            // 装備アイテムの場合は equipItem メソッドに処理を委任
            // equipItem 内でインベントリからの削除も処理される
            this.equipItem(item);
            
        } else {
            this.addMessage("You can't use that item.", 'system');
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
            
            this.addMessage(`Level up! You are now level ${this.player.level}!`, 'system');
            this.addMessage(`HP +${hpIncrease}, MP +${mpIncrease}, Attack +${attackIncrease}, Defense +${defenseIncrease}`, 'system');
        }
    }
    
    descendStairs() {
        this.floor++; // 階層を増やす
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
    
    gameOver() {
        this.gameState = 'dead';
        this.addMessage("You have died! Game Over.", 'combat');
        this.addMessage("Press F5 to restart.", 'system');
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
                          (this.player.equipment.armor && this.player.equipment.armor.name === item.name);
        
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
            
        } else if (item.type === 'weapon' || item.type === 'armor') {
            if (isEquipped) {
                const unequipBtn = this.createActionButton('Unequip', '#666666', () => {
                    this.unequipItem(item.type === 'weapon' ? 'weapon' : 'armor');
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
                } else if ((item.type === 'weapon' || item.type === 'armor') && !isEquipped) {
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
                } else if (item.type === 'weapon' || item.type === 'armor') {
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
            this.addMessage(`You equip ${item.name}! Defense +${item.defense}`, 'item');
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
            this.addMessage(`You unequip ${item.name}.`, 'item');
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
    }
    
    removeEquipment() {
        // 武器から優先的に外す
        if (this.player.equipment.weapon) {
            this.unequipItem('weapon');
            this.processTurn();
        } else if (this.player.equipment.armor) {
            this.unequipItem('armor');
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
    }
    
    render() {
        this.ctx.fillStyle = '#000000';
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
                    this.renderEntity(screenX, screenY, entity.symbol, entity.color);
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
            case 'S':
                this.ctx.fillStyle = this.colors.floor;
                break;
            default:
                this.ctx.fillStyle = '#000000';
        }
        
        this.ctx.fillRect(pixelX, pixelY, this.tileSize, this.tileSize);
        
        // Render stairs symbol
        if (tile === 'S') {
            this.renderEntity(x, y, '>', this.colors.stairs);
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
}

// Initialize game when page loads
window.onload = function() {
    const game = new Game();
};
