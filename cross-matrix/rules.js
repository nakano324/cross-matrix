// ゆるいスラッグ化（日本語対応）
function slugify(text) {
  return (text || "")
    .toString().trim().toLowerCase()
    .replace(/[　\s]+/g, "-")
    .replace(/[^\w\-ぁ-んァ-ヴー一-龠]/g, "")
    .replace(/\-+/g, "-").replace(/^\-+|\-+$/g, "");
}

// config は読めなくても {} を返す（file:/// でも落ちない）
async function loadConfig(){
  try{
    const res = await fetch('rules-config.json');
    if(!res.ok) throw new Error('config not ok');
    return await res.json();
  }catch(e){
    console.warn('[rules] config load skipped:', e);
    return {};
  }
}

function el(tag, attrs={}, children=[]){
  const n = document.createElement(tag);
  for(const [k,v] of Object.entries(attrs)){
    if(k==='class') n.className=v;
    else if(k==='html') n.innerHTML=v;
    else n.setAttribute(k,v);
  }
  for(const c of [].concat(children)){
    if(typeof c==='string') n.appendChild(document.createTextNode(c));
    else if(c) n.appendChild(c);
  }
  return n;
}

// h2/h3 に id を保証（重複は連番）
function ensureHeadingIds() {
  const scope = document.querySelector('#content') || document;
  const hs = scope.querySelectorAll('h2, h3');
  const used = new Set();
  hs.forEach(h=>{
    if(!h.id || used.has(h.id)){
      let id = slugify(h.textContent || h.innerText) || 'sec';
      let base = id, i = 2;
      while(used.has(id)) id = `${base}-${i++}`;
      h.id = id;
    }
    used.add(h.id);
  });
  return hs;
}

// h2+h3 を TOC へ。ScrollSpy は見出し単位で監視
function buildTOC(){
  const toc = document.getElementById('tocLinks');
  if(!toc) return;
  toc.innerHTML = '';

  const hs = ensureHeadingIds();
  hs.forEach(h=>{
    const a = document.createElement('a');
    a.href = `#${h.id}`;
    a.textContent = (h.textContent || '').trim();
    if(h.tagName.toLowerCase()==='h3') a.classList.add('sub'); // サブ項目
    toc.appendChild(a);
  });

  const links = Array.from(toc.querySelectorAll('a'));
  const map = new Map(links.map(a => [a.getAttribute('href').slice(1), a]));
  const obs = new IntersectionObserver(entries=>{
    entries.forEach(e=>{
      const a = map.get(e.target.id);
      if(!a) return;
      if(e.isIntersecting){
        links.forEach(x=>x.classList.remove('active'));
        a.classList.add('active');
      }
    });
  }, {rootMargin:'-40% 0px -55% 0px', threshold:0});
  document.querySelectorAll('#content h2[id], #content h3[id]').forEach(n=>obs.observe(n));
}

async function main(){
  // ① コンフィグは「読めたら反映、失敗しても続行」
  const conf = await loadConfig();
  const gn = document.getElementById('gameName');
  const lu = document.getElementById('lastUpdated');
  if(gn && conf.game_name) gn.textContent = conf.game_name;
  if(lu && conf.last_updated) lu.textContent = '最終更新 — ' + conf.last_updated;

  // ② 勝利条件・キーワード（あれば反映）
  const wins = conf.win_conditions || [];
  const makeLi = t=>{ const li=document.createElement('li'); li.textContent=t; return li; };
  wins.forEach(t=> document.getElementById('winList')?.appendChild(makeLi(t)));
  wins.forEach(t=> document.getElementById('winList2')?.appendChild(makeLi(t)));

  const kwList = document.getElementById('kwList');
  if (kwList && conf.keywords) {
    kwList.innerHTML = '';

    // 代表語を先頭に出したい場合
    const preferred = ['瞬撃','飛車','角','香車','多点'];
    const allKeys = Object.keys(conf.keywords);
    const head = preferred.filter(k => allKeys.includes(k));
    const tail = allKeys.filter(k => !head.includes(k))
                        .sort((a,b)=>a.localeCompare(b,'ja'));
    const keys = [...head, ...tail];

    for (const k of keys) {
      const title = k.replace(/_x$/, '〈x〉'); // 表示名整形
      kwList.appendChild(el('div', { class: 'kw' }, [
        el('h4', {}, [title]),
        el('p',  {}, [conf.keywords[k]])
      ]));
    }
  }

  // ③ コンフィグの成否に関わらず TOC を作る
  buildTOC();
}

main();

function setupTOCToggle(){
  const btn = document.getElementById('tocToggle');
  const toc = document.getElementById('toc');
  if(!btn || !toc) return;
  btn.addEventListener('click', ()=>{
    toc.classList.toggle('is-open');
    btn.textContent = toc.classList.contains('is-open') ? '目次を閉じる' : '目次を開く';
  });
}

// 既存 main() の末尾あたりで：
buildTOC();
setupTOCToggle();
