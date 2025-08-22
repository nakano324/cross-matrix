// CardDex client-side filtering (no framework)
const els = {
  q: document.getElementById('q'),
  costMin: document.getElementById('costMin'),
  costMax: document.getElementById('costMax'),
  faction: document.getElementById('faction'),
  ctype: document.getElementById('ctype'),
  rarity: document.getElementById('rarity'),
  sort: document.getElementById('sort'),
  reset: document.getElementById('reset'),
  count: document.getElementById('count'),
  grid: document.getElementById('grid'),
  tpl: document.getElementById('card-tpl'),
};

let CARDS = [];

async function load() {
  const res = await fetch('cards.json');
  CARDS = await res.json();
  hydrateFacetOptions();
  render();
}

function unique(arr){ return [...new Set(arr)]; }

function hydrateFacetOptions(){
  // factions
  const factions = unique(CARDS.map(c => c.faction)).filter(Boolean).sort();
  for(const f of factions){
    const o = document.createElement('option');
    o.value = f; o.textContent = f;
    els.faction.appendChild(o);
  }
}

function normalize(s){ return (s || '').toString().toLowerCase(); }

function inRange(v, a, b){ return (v ?? 0) >= a && (v ?? 0) <= b; }

function filterCards(){
  const q = normalize(els.q.value);
  const cmin = parseInt(els.costMin.value || '0', 10);
  const cmax = parseInt(els.costMax.value || '20', 10);
  const factions = Array.from(els.faction.selectedOptions).map(o => o.value).filter(Boolean);
  const ctype = els.ctype.value;
  const rarity = els.rarity.value;

  return CARDS.filter(card => {
    if(!inRange(card.cost ?? 0, cmin, cmax)) return false;
    if(ctype && card.type !== ctype) return false;
    if(rarity && card.rarity !== rarity) return false;
    if(factions.length && !factions.includes(card.faction)) return false;

    if(q){
      const hay = normalize([card.name, card.ability, card.flavor, card.keywords?.join(' ')].join(' '));
      if(!hay.includes(q)) return false;
    }
    return true;
  });
}

function sortCards(list){
  const s = els.sort.value;
  const key = s.split('_')[0];
  const dir = s.split('_')[1] === 'desc' ? -1 : 1;
  return list.sort((a,b)=>{
    let va, vb;
    if(key==='name'){ va = normalize(a.name); vb = normalize(b.name); }
    else if(key==='cost'){ va = a.cost ?? 0; vb = b.cost ?? 0; }
    else if(key==='power'){ va = a.power ?? 0; vb = b.power ?? 0; }
    else { va = 0; vb = 0; }
    if(va<vb) return -1*dir;
    if(va>vb) return 1*dir;
    return 0;
  });
}

function render(){
  const items = sortCards(filterCards());
  els.grid.innerHTML = '';
  els.count.textContent = `${items.length} 件`;

  const frag = document.createDocumentFragment();
  for(const c of items){
    const node = els.tpl.content.cloneNode(true);
    const img = node.querySelector('.thumb');
    img.src = c.image || 'https://placehold.co/600x800/png?text=No+Image';
    img.alt = c.name;

    node.querySelector('.rarity').textContent = c.rarity || '';
    node.querySelector('.name').textContent = c.name;
    node.querySelector('.cost').textContent = `Cost ${c.cost ?? '-'}`;
    node.querySelector('.power').textContent = c.type === 'エンティティ' ? `Power ${c.power ?? '-'}` : c.type;
    node.querySelector('.type').textContent = c.type;
    node.querySelector('.faction').textContent = c.faction || '';
    node.querySelector('.ability').textContent = c.ability || '';

    frag.appendChild(node);
  }
  els.grid.appendChild(frag);
}

// Reset
els.reset.addEventListener('click', ()=>{
  els.q.value='';
  els.costMin.value=0;
  els.costMax.value=20;
  els.faction.selectedIndex = -1;
  els.ctype.value='';
  els.rarity.value='';
  els.sort.value='name_asc';
  render();
});

// Bind inputs
['q','costMin','costMax','faction','ctype','rarity','sort'].forEach(id=>{
  els[id].addEventListener('input', render);
  els[id].addEventListener('change', render);
});

load();
