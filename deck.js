/**
 * deck.js
 * Handles Deck Maker logic: fetching cards, rendering, deck management.
 */

/* === State === */
const state = {
    allCards: [],
    displayCards: [],
    deck: new Map(), // Key: CardID, Value: Count
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

    // Filters
    searchInput: document.getElementById('searchInput'),
    factionFilter: document.getElementById('factionFilter'),
    typeFilter: document.getElementById('typeFilter'),
    costFilter: document.getElementById('costFilter'),

    // Actions
    clearDeckBtn: document.getElementById('clearDeckBtn'),
    exportDeckBtn: document.getElementById('exportDeckBtn'),

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

        // Event Listeners
        setupEventListeners();

    } catch (err) {
        console.error(err);
        dom.cardPoolGrid.innerHTML = `<div class="empty-state">Error loading cards: ${err.message}</div>`;
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

/* === Rendering === */
function renderCardPool() {
    dom.cardPoolGrid.innerHTML = '';

    // Performance optimization: limit rendering if too many? For now render all (up to ~700 is fine usually)
    // Or simpler: just render.

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

    // Optional: Warn or Block if over 40. For now just warn visually (handled in updateDeckView) but allow adding.

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
    toast.textContent = msg;
    toast.classList.add('show');
    setTimeout(() => {
        toast.classList.remove('show');
    }, 2000);
}

// Start
init();
