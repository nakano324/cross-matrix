/**
 * deck.js
 * Handles Deck Maker logic: fetching cards, rendering, deck management.
 */

/* === State === */
const state = {
    allCards: [],
    displayCards: [],
    deck: new Map(), // Key: CardID, Value: Count
    currentDeckId: null, // If editing an existing deck
    filters: {
        search: '',
        faction: '',
        type: '',
        cost: ''
    },
    // Constants
    MAX_COPIES: 4,     // Max copies per card
    MAX_DECK_SIZE: 40 // Target deck size
};

/* === DOM Elements === */
const dom = {
    cardPoolGrid: document.getElementById('cardPoolGrid'),
    deckGrid: document.getElementById('deckGrid'),
    deckCount: document.getElementById('deckCount'),
    mobileDeckCount: document.getElementById('mobileDeckCount'),

    // Deck Meta
    deckNameInput: document.getElementById('deckNameInput'),

    // Filters
    searchInput: document.getElementById('searchInput'),
    factionFilter: document.getElementById('factionFilter'),
    typeFilter: document.getElementById('typeFilter'),
    costFilter: document.getElementById('costFilter'),

    // Actions
    clearDeckBtn: document.getElementById('clearDeckBtn'),
    exportDeckBtn: document.getElementById('exportDeckBtn'),
    saveDeckBtn: document.getElementById('saveDeckBtn'), // New

    // Mobile Toggles
    viewPoolBtn: document.getElementById('viewPoolBtn'),
    viewDeckBtn: document.getElementById('viewDeckBtn'),
    cardPoolPane: document.getElementById('cardPoolPane'),
    deckPane: document.getElementById('deckPane')
};

/* === Initialization === */
async function init() {
    try {
        const response = await fetch('cards.json');
        if (!response.ok) throw new Error('Failed to load cards.json');

        const data = await response.json();
        state.allCards = data;
        state.displayCards = data;

        // Populate specific attributes
        populateFilters(data);

        // Render initial pool
        renderCardPool();
        updateDeckView();

        // Check Login State
        checkLoginState();

        // Check URL Params for Deck ID
        const urlParams = new URLSearchParams(window.location.search);
        const deckId = urlParams.get('id');
        if (deckId) {
            await loadDeck(deckId);
        }

        // Event Listeners
        setupEventListeners();

    } catch (err) {
        console.error(err);
        dom.cardPoolGrid.innerHTML = `<div class="empty-state">Error loading cards: ${err.message}</div>`;
    }
}

function checkLoginState() {
    const token = localStorage.getItem('token');
    if (token) {
        if (dom.saveDeckBtn) dom.saveDeckBtn.style.display = 'inline-block';
    } else {
        if (dom.saveDeckBtn) dom.saveDeckBtn.style.display = 'none';
    }
}

function populateFilters(cards) {
    const factions = new Set();
    const types = new Set();

    cards.forEach(card => {
        if (card.faction) factions.add(card.faction);
        if (card.type) types.add(card.type);
    });

    factions.forEach(f => {
        const opt = document.createElement('option');
        opt.value = f;
        opt.textContent = f;
        dom.factionFilter.appendChild(opt);
    });

    types.forEach(t => {
        const opt = document.createElement('option');
        opt.value = t;
        opt.textContent = t;
        dom.typeFilter.appendChild(opt);
    });
}

function setupEventListeners() {
    // Filters
    const handleFilter = () => {
        state.filters.search = dom.searchInput.value.toLowerCase();
        state.filters.faction = dom.factionFilter.value;
        state.filters.type = dom.typeFilter.value;
        state.filters.cost = dom.costFilter.value;
        applyFilters();
    };

    dom.searchInput.addEventListener('input', handleFilter);
    dom.factionFilter.addEventListener('change', handleFilter);
    dom.typeFilter.addEventListener('change', handleFilter);
    dom.costFilter.addEventListener('change', handleFilter);

    // Deck Actions
    dom.clearDeckBtn.addEventListener('click', () => {
        if (confirm('Clear entire deck?')) {
            state.deck.clear();
            updateDeckView();
        }
    });

    dom.exportDeckBtn.addEventListener('click', exportDeckToClipboard);

    if (dom.saveDeckBtn) {
        dom.saveDeckBtn.addEventListener('click', saveDeck);
    }

    // Mobile Toggles
    if (dom.viewPoolBtn) {
        dom.viewPoolBtn.addEventListener('click', () => switchPane('pool'));
        dom.viewDeckBtn.addEventListener('click', () => switchPane('deck'));
    }
}

/* === Logic === */
function applyFilters() {
    const { search, faction, type, cost } = state.filters;

    state.displayCards = state.allCards.filter(card => {
        // Name/Text search
        const matchSearch = !search ||
            card.name.toLowerCase().includes(search) ||
            (card.ability && card.ability.toLowerCase().includes(search));

        // Faction
        const matchFaction = !faction || card.faction === faction;

        // Type
        const matchType = !type || card.type === type;

        // Cost
        let matchCost = true;
        if (cost) {
            if (cost === '7+') {
                matchCost = card.cost >= 7;
            } else {
                matchCost = card.cost == cost;
            }
        }

        return matchSearch && matchFaction && matchType && matchCost;
    });

    renderCardPool();
}

function switchPane(active) {
    if (active === 'pool') {
        dom.cardPoolPane.classList.add('active');
        dom.deckPane.classList.remove('active');
        dom.viewPoolBtn.classList.add('active');
        dom.viewDeckBtn.classList.remove('active');
    } else {
        dom.cardPoolPane.classList.remove('active');
        dom.deckPane.classList.add('active');
        dom.viewPoolBtn.classList.remove('active');
        dom.viewDeckBtn.classList.add('active');
    }
}

/* === API Integration === */

async function saveDeck() {
    const token = localStorage.getItem('token');
    if (!token) {
        alert('ログインしてください');
        return;
    }

    const name = dom.deckNameInput.value.trim() || 'No Name Deck';

    // Prepare card list
    const cards = [];
    state.deck.forEach((count, id) => {
        cards.push({ cardId: id, count });
    });

    if (cards.length === 0) {
        alert('デッキが空です');
        return;
    }

    const payload = {
        name,
        cards,
        id: state.currentDeckId // null if new
    };


    // API_BASE_URL is defined in config.js


    try {
        dom.saveDeckBtn.textContent = 'Saving...';
        dom.saveDeckBtn.disabled = true;

        const res = await fetch(`${API_BASE_URL}/api/decks`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(payload)
        });

        if (!res.ok) throw new Error('Failed to save');

        const savedDeck = await res.json();
        state.currentDeckId = savedDeck._id; // Update ID for future updates
        showToast('Deck Saved!');

    } catch (err) {
        console.error(err);
        if (err.message === 'Failed to fetch') {
            alert('サーバーに接続できません。\nサーバーが起動しているか確認してください。');
        } else {
            alert('保存に失敗しました: ' + err.message);
        }
    } finally {
        dom.saveDeckBtn.textContent = 'Save';
        dom.saveDeckBtn.disabled = false;
    }
}

async function loadDeck(id) {
    // API_BASE_URL is defined in config.js
    try {
        const res = await fetch(`${API_BASE_URL}/api/decks/${id}`);
        if (!res.ok) throw new Error('Deck not found');

        const deckData = await res.json();

        // Restore state
        state.currentDeckId = deckData._id;
        dom.deckNameInput.value = deckData.name;

        state.deck.clear();
        deckData.cards.forEach(c => {
            state.deck.set(c.cardId, c.count);
        });

        updateDeckView();
        // Maybe toast?
        console.log('Deck loaded:', deckData.name);

    } catch (err) {
        console.error(err);
        showToast('Error loading deck');
    }
}


/* === Rendering === */
function renderCardPool() {
    dom.cardPoolGrid.innerHTML = '';

    if (state.displayCards.length === 0) {
        dom.cardPoolGrid.innerHTML = '<div class="empty-state">No cards found matching filters.</div>';
        return;
    }

    const fragment = document.createDocumentFragment();
    state.displayCards.forEach(card => {
        const el = createCardElement(card, 'pool');
        fragment.appendChild(el);
    });
    dom.cardPoolGrid.appendChild(fragment);
}

function updateDeckView() {
    dom.deckGrid.innerHTML = '';
    let totalCount = 0;

    const fragment = document.createDocumentFragment();

    // Sort deck contents by ID or Cost? Let's sort by Cost then ID
    const deckEntries = Array.from(state.deck.entries()); // [ [id, count], ... ]

    // Get full card objects
    const deckCards = deckEntries.map(([id, count]) => {
        const card = state.allCards.find(c => c.id === id);
        return { card, count };
    }).filter(item => item.card); // filter out undefined if id not found

    // Sort
    deckCards.sort((a, b) => {
        if (a.card.cost !== b.card.cost) return a.card.cost - b.card.cost;
        return a.card.id.localeCompare(b.card.id);
    });

    deckCards.forEach(({ card, count }) => {
        totalCount += count;
        const el = createCardElement(card, 'deck', count);
        fragment.appendChild(el);
    });

    if (totalCount === 0) {
        dom.deckGrid.innerHTML = '<div class="empty-state">Deck is empty.</div>';
    } else {
        dom.deckGrid.appendChild(fragment);
    }

    // Update counts
    dom.deckCount.textContent = `${totalCount} / ${state.MAX_DECK_SIZE}`;
    dom.mobileDeckCount.textContent = totalCount;

    // Visual feedback on size
    if (totalCount > state.MAX_DECK_SIZE) {
        dom.deckCount.style.color = '#ff6b6b'; // Warning
    } else {
        dom.deckCount.style.color = 'var(--acc)';
    }
}

function createCardElement(card, mode, count = 1) {
    const div = document.createElement('div');
    div.className = 'dm-card';
    if (mode === 'deck') div.classList.add('deck-card-wrap');

    // Image
    const img = document.createElement('img');
    img.src = card.image;
    img.alt = card.name;
    img.loading = 'lazy';
    div.appendChild(img);

    // Count Badge (Deck Mode)
    if (mode === 'deck' && count > 1) {
        const badge = document.createElement('div');
        badge.className = 'count-badge';
        badge.textContent = count;
        div.appendChild(badge);
    }

    // Click Handler
    div.addEventListener('click', () => {
        if (mode === 'pool') {
            addToDeck(card.id);
        } else {
            removeFromDeck(card.id);
        }
    });

    return div;
}

/* === Deck Management === */
function addToDeck(cardId) {
    const currentCount = state.deck.get(cardId) || 0;
    if (currentCount >= state.MAX_COPIES) {
        showToast(`Max ${state.MAX_COPIES} copies allowed!`);
        return;
    }

    // Calculate total deck size
    let total = 0;
    for (let c of state.deck.values()) total += c;

    // Optional: Warn or Block if over 40.
    state.deck.set(cardId, currentCount + 1);
    updateDeckView();
}

function removeFromDeck(cardId) {
    const currentCount = state.deck.get(cardId);
    if (!currentCount) return;

    if (currentCount === 1) {
        state.deck.delete(cardId);
    } else {
        state.deck.set(cardId, currentCount - 1);
    }
    updateDeckView();
}

function exportDeckToClipboard() {
    let total = 0;
    for (let c of state.deck.values()) total += c;
    if (total === 0) {
        showToast('Deck is empty!');
        return;
    }

    let text = `Deck List (${total} cards)\n\n`;

    const deckEntries = Array.from(state.deck.entries());
    const deckCards = deckEntries.map(([id, count]) => {
        const card = state.allCards.find(c => c.id === id);
        return { card, count };
    }).filter(item => item.card);

    deckCards.sort((a, b) => a.card.cost - b.card.cost);

    deckCards.forEach(({ card, count }) => {
        text += `${count}x ${card.name} (${card.id})\n`;
    });

    navigator.clipboard.writeText(text).then(() => {
        showToast('Deck list copied to clipboard!');
    }).catch(err => {
        console.error('Failed to copy', err);
        showToast('Failed to copy to clipboard');
    });
}

function showToast(msg) {
    const toast = document.getElementById('toast');
    if (!toast) return;
    toast.textContent = msg;
    toast.classList.add('show');
    setTimeout(() => {
        toast.classList.remove('show');
    }, 2000);
}

// Start
init();
