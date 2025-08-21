async function loadConfig(){
  const res = await fetch('rules-config.json');
  return await res.json();
}

function el(tag, attrs={}, children=[]){
  const n = document.createElement(tag);
  for(const [k,v] of Object.entries(attrs)){ if(k==='class') n.className=v; else if(k==='html') n.innerHTML=v; else n.setAttribute(k,v); }
  for(const c of [].concat(children)){ if(typeof c==='string') n.appendChild(document.createTextNode(c)); else if(c) n.appendChild(c); }
  return n;
}

function buildTOC(){
  const toc = document.getElementById('tocLinks');
  const hs = document.querySelectorAll('#content .section h2');
  hs.forEach(h=>{
    const sec = h.closest('.section');
    const id = sec.id;
    const a = el('a',{href:'#'+id},[h.firstChild.textContent.trim()]);
    toc.appendChild(a);
  });
  // scroll spy
  const links = toc.querySelectorAll('a');
  const obs = new IntersectionObserver(entries => {
    entries.forEach(e=>{
      const id = '#'+e.target.id;
      links.forEach(a=>a.classList.toggle('active', a.getAttribute('href')===id && e.isIntersecting));
    });
  }, {rootMargin:'-40% 0px -55% 0px', threshold:0});
  document.querySelectorAll('#content .section').forEach(sec=>obs.observe(sec));
}

async function main(){
  const conf = await loadConfig();
  document.getElementById('gameName').textContent = conf.game_name || '（ゲームタイトル）';
  document.getElementById('lastUpdated').textContent = '最終更新 — ' + (conf.last_updated || '');
  // win conditions
  const wins = conf.win_conditions || [];
  const makeLi = t=>{ const li=document.createElement('li'); li.textContent=t; return li; };
  wins.forEach(t=> document.getElementById('winList').appendChild(makeLi(t)));
  wins.forEach(t=> document.getElementById('winList2').appendChild(makeLi(t)));
  // keywords
  const kwList = document.getElementById('kwList');
  const kws = conf.keywords || {};
  Object.entries(kws).forEach(([k,v])=>{
    kwList.appendChild(el('div',{class:'kw'},[
      el('h4',{},[k]),
      el('p',{},[v])
    ]));
  });
  buildTOC();
}

main();
