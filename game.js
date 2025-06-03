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
        this.gameState = 'playing'; // playing, inventory, dead
        
        this.messages = [];
        this.maxMessages = 50;
        
        this.colors = {
            wall: '#8B4513',
            floor: '#2F2F2F',
            door: '#8B4513',
            player: '#FFD700',
            enemy: '#FF4500',
            item: '#00CED1',
            potion: '#FF69B4',
            weapon: '#C0C0C0',
            stairs: '#FFFFFF'
        };
        
        this.init();
    }
    
    init() {
        this.setupEventListeners();
        this.generateDungeon();
        this.createPlayer();
        this.spawnEnemies();
        this.spawnItems();
        this.addMessage("Welcome to the dungeon! Find the stairs to descend deeper.", 'system');
        this.render();
        this.updateUI();
    }
    
    setupEventListeners() {
        document.addEventListener('keydown', (e) => this.handleInput(e));
    }
    
    handleInput(e) {
        if (this.gameState === 'dead') return;
        
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
                // Use item (simplified)
                this.useItem();
                break;
            case 'i':
                this.toggleInventory();
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
            attack: 10,
            defense: 5,
            level: 1,
            experience: 0,
            experienceToNext: 100,
            gold: 0,
            inventory: [],
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
            { name: 'Mana Potion', symbol: '!', type: 'potion', effect: 'mana', value: 20, color: '#4169E1' },
            { name: 'Sword', symbol: '/', type: 'weapon', attack: 5, color: this.colors.weapon },
            { name: 'Shield', symbol: ']', type: 'armor', defense: 3, color: this.colors.weapon },
            { name: 'Gold Coin', symbol: '$', type: 'gold', value: 25, color: '#FFD700' }
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
                        id: this.items.length
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
                this.player.inventory.push(item);
                this.addMessage(`You picked up ${item.name}!`, 'item');
            }
            
            this.items = this.items.filter(i => i.id !== item.id);
            this.processTurn();
        } else {
            this.addMessage("There's nothing here to pick up.", 'system');
        }
    }
    
    useItem() {
        // Simple use first potion system
        const potion = this.player.inventory.find(item => item.type === 'potion');
        if (potion) {
            if (potion.effect === 'heal') {
                this.player.hp = Math.min(this.player.maxHp, this.player.hp + potion.value);
                this.addMessage(`You drink the ${potion.name} and recover ${potion.value} HP!`, 'item');
            } else if (potion.effect === 'mana') {
                this.player.mp = Math.min(this.player.maxMp, this.player.mp + potion.value);
                this.addMessage(`You drink the ${potion.name} and recover ${potion.value} MP!`, 'item');
            }
            
            this.player.inventory = this.player.inventory.filter(item => item.id !== potion.id);
            this.processTurn();
        } else {
            this.addMessage("You don't have any potions to use.", 'system');
        }
    }
    
    checkLevelUp() {
        if (this.player.experience >= this.player.experienceToNext) {
            this.player.level++;
            this.player.experience -= this.player.experienceToNext;
            this.player.experienceToNext = Math.floor(this.player.experienceToNext * 1.5);
            
            // Level up bonuses
            const hpIncrease = this.random(8, 15);
            const mpIncrease = this.random(3, 8);
            
            this.player.maxHp += hpIncrease;
            this.player.hp += hpIncrease;
            this.player.maxMp += mpIncrease;
            this.player.mp += mpIncrease;
            this.player.attack += this.random(1, 3);
            this.player.defense += this.random(1, 2);
            
            this.addMessage(`Level up! You are now level ${this.player.level}!`, 'system');
            this.addMessage(`HP +${hpIncrease}, MP +${mpIncrease}, Attack and Defense increased!`, 'system');
        }
    }
    
    descendStairs() {
        this.addMessage("You descend deeper into the dungeon...", 'system');
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
        // Simple inventory display in messages
        this.addMessage("=== INVENTORY ===", 'system');
        if (this.player.inventory.length === 0) {
            this.addMessage("Your inventory is empty.", 'system');
        } else {
            this.player.inventory.forEach(item => {
                this.addMessage(`${item.symbol} ${item.name}`, 'item');
            });
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
        
        // Update health bar
        const healthPercent = (this.player.hp / this.player.maxHp) * 100;
        document.getElementById('healthBar').style.width = healthPercent + '%';
        
        // Update mana bar
        const manaPercent = (this.player.mp / this.player.maxMp) * 100;
        document.getElementById('manaBar').style.width = manaPercent + '%';
        
        // Update inventory display
        const inventoryDiv = document.getElementById('inventory');
        inventoryDiv.innerHTML = '';
        this.player.inventory.forEach(item => {
            const div = document.createElement('div');
            div.textContent = `${item.symbol} ${item.name}`;
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
