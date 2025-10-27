export const itemTemplates = [
    // Potions
    {
        id: 'health_potion',
        nameKey: 'item_name_health_potion',
        symbol: '!',
        type: 'potion',
        effect: 'heal',
        value: 30,
        color: '#9b59b6',
        basePrice: 50
    },
    {
        id: 'mana_potion',
        nameKey: 'item_name_mana_potion',
        symbol: '!',
        type: 'potion',
        effect: 'mana',
        value: 20,
        color: '#9b59b6',
        basePrice: 40
    },
    {
        id: 'super_health_potion',
        nameKey: 'item_name_super_health_potion',
        symbol: '!',
        type: 'potion',
        effect: 'heal',
        value: 60,
        color: '#e74c3c',
        basePrice: 120,
        rarity: 'rare'
    },
    {
        id: 'super_mana_potion',
        nameKey: 'item_name_super_mana_potion',
        symbol: '!',
        type: 'potion',
        effect: 'mana',
        value: 40,
        color: '#3498db',
        basePrice: 100,
        rarity: 'rare'
    },

    // Weapons
    {
        id: 'dagger',
        nameKey: 'item_name_dagger',
        symbol: ')',
        type: 'weapon',
        attack: 3,
        color: '#e67e22',
        basePrice: 40
    },
    {
        id: 'short_sword',
        nameKey: 'item_name_short_sword',
        symbol: ')',
        type: 'weapon',
        attack: 5,
        color: '#e67e22',
        basePrice: 80
    },
    {
        id: 'long_sword',
        nameKey: 'item_name_long_sword',
        symbol: ')',
        type: 'weapon',
        attack: 8,
        color: '#e67e22',
        basePrice: 150,
        rarity: 'uncommon'
    },
    {
        id: 'axe',
        nameKey: 'item_name_axe',
        symbol: ')',
        type: 'weapon',
        attack: 7,
        color: '#e67e22',
        basePrice: 120,
        rarity: 'uncommon'
    },
    {
        id: 'mace',
        nameKey: 'item_name_mace',
        symbol: ')',
        type: 'weapon',
        attack: 6,
        color: '#e67e22',
        basePrice: 100
    },

    // Armor
    {
        id: 'leather_armor',
        nameKey: 'item_name_leather_armor',
        symbol: ']',
        type: 'armor',
        defense: 2,
        color: '#3498db',
        basePrice: 70
    },
    {
        id: 'chain_mail',
        nameKey: 'item_name_chain_mail',
        symbol: ']',
        type: 'armor',
        defense: 4,
        color: '#3498db',
        basePrice: 130,
        rarity: 'uncommon'
    },
    {
        id: 'plate_mail',
        nameKey: 'item_name_plate_mail',
        symbol: ']',
        type: 'armor',
        defense: 6,
        color: '#3498db',
        basePrice: 200,
        rarity: 'rare'
    },

    // Shields
    {
        id: 'buckler',
        nameKey: 'item_name_buckler',
        symbol: ']',
        type: 'shield',
        defense: 2,
        color: '#3498db',
        basePrice: 60
    },

    // Gold (special type, not really an item to be picked up in the same way)
    {
        id: 'gold_coin',
        nameKey: 'item_name_gold_coin',
        symbol: '*',
        type: 'gold',
        value: 25,
        color: '#f1c40f',
        basePrice: 25
    }
];
