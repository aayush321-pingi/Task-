(function(){
  // --- State ---
  const DEFAULT_COLUMNS = [
    { key: 'name', label: 'Name', visible: true },
    { key: 'email', label: 'Email', visible: true },
    { key: 'age', label: 'Age', visible: true },
    { key: 'role', label: 'Role', visible: true }
  ];

  const sampleRows = [
    { id: genId(), name: 'Alice Johnson', email: 'alice@example.com', age: 28, role: 'Developer' },
    { id: genId(), name: 'Bob Smith', email: 'bob@example.com', age: 35, role: 'Manager' },
    { id: genId(), name: 'Carol White', email: 'carol@example.com', age: 22, role: 'Intern' },
    { id: genId(), name: 'David Brown', email: 'david@example.com', age: 41, role: 'Director' },
    { id: genId(), name: 'Eve Black', email: 'eve@example.com', age: 30, role: 'Designer' }
  ];

  // persistent storage keys
  const KEY_COLUMNS = 'static_table_columns_v1';
  const KEY_THEME = 'static_table_theme_v1';

  let state = {
    columns: loadColumns(),
    rows: sampleRows.slice(),
    search: '',
    sort: { key: null, dir: null },
    page: 0,
    pageSize: 10,
    edits: {}, // {id: { field: value }}
  };

  // advanced helpers
  let fuse = null; // Fuse.js instance for fuzzy search
  function resetFuse(){
    try{
      if(window.Fuse){
        const options = { keys: state.columns.map(c=>c.key), threshold: 0.35 };
        fuse = new Fuse(state.rows, options);
      } else {
        fuse = null;
      }
    }catch(e){ fuse = null }
  }

  // --- elements ---
  const thead = document.getElementById('thead');
  const tbody = document.getElementById('tbody');
  const searchInput = document.getElementById('search');
  const prevPageBtn = document.getElementById('prevPage');
  const nextPageBtn = document.getElementById('nextPage');
  const pageInfo = document.getElementById('pageInfo');
  const rowsCount = document.getElementById('rowsCount');
  const manageBtn = document.getElementById('manageBtn');
  const modal = document.getElementById('modal');
  const colList = document.getElementById('colList');
  const newKey = document.getElementById('newKey');
  const newLabel = document.getElementById('newLabel');
  const addCol = document.getElementById('addCol');
  const closeModal = document.getElementById('closeModal');
  const saveAllBtn = document.getElementById('saveAll');
  const cancelAllBtn = document.getElementById('cancelAll');
  const importBtn = document.getElementById('importBtn');
  const csvFile = document.getElementById('csvFile');
  const exportBtn = document.getElementById('exportBtn');
  const themeToggle = document.getElementById('themeToggle');

  // --- init theme ---
  (function initTheme(){
    const t = localStorage.getItem(KEY_THEME) || 'light';
    if(t==='dark') document.documentElement.classList.add('dark');
    themeToggle.checked = t === 'dark';
    themeToggle.addEventListener('change', (e)=>{
      const dark = e.target.checked;
      if(dark) document.documentElement.classList.add('dark'); else document.documentElement.classList.remove('dark');
      localStorage.setItem(KEY_THEME, dark ? 'dark' : 'light');
    })
  })();

  // --- wiring ---
  const reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  // debounce search to improve performance
  let searchTimer = null;
  searchInput.addEventListener('input', (e)=>{
    const val = e.target.value || '';
    clearTimeout(searchTimer);
    searchTimer = setTimeout(()=>{ state.search = val; state.page = 0; render(); }, reducedMotion ? 0 : 160);
  });
  prevPageBtn.addEventListener('click', ()=>{ if(state.page>0){ state.page--; render() } });
  nextPageBtn.addEventListener('click', ()=>{ const max = Math.ceil(filteredRows().length/state.pageSize)-1; if(state.page < max){ state.page++; render() } });
  manageBtn.addEventListener('click', ()=>{ modal.classList.add('visible'); renderModal() });
  closeModal.addEventListener('click', ()=>{ modal.classList.remove('visible') });

  addCol.addEventListener('click', ()=>{
    const key = (newKey.value||'').trim(); const label = (newLabel.value||'').trim();
    if(!key||!label){ alert('Provide key and label'); return }
    if(state.columns.some(c=>c.key===key)){ alert('Key exists'); return }
    state.columns.push({key,label,visible:true}); saveColumns(); newKey.value=''; newLabel.value=''; renderModal(); render();
  });

  saveAllBtn.addEventListener('click', ()=>{ // apply edits
    for(const id in state.edits){ const e = state.edits[id]; const r = state.rows.find(rr=>rr.id===id); if(r) Object.assign(r,e); }
    state.edits = {}; updateEditButtons(); render();
  });
  cancelAllBtn.addEventListener('click', ()=>{ state.edits={}; updateEditButtons(); render(); });

  importBtn.addEventListener('click', ()=> csvFile.click());
  csvFile.addEventListener('change', (ev)=>{
    const f = ev.target.files[0]; if(!f) return;
    // show skeleton if file large or rows threshold
    const showSkeleton = true;
    if(showSkeleton && !reducedMotion){ showSkeletonFor(450) }
    Papa.parse(f, {header:true,skipEmptyLines:true,complete:res=>{
      if(res.errors && res.errors.length){ alert('CSV parse errors: '+res.errors[0].message); return }
      const imported = res.data.map(r=>Object.assign({id: genId()}, r));
      state.rows = state.rows.concat(imported);
      state.page = 0; render();
    }, error: err=>{ alert('Failed to parse: '+err.message) }});
    csvFile.value='';
  });

  exportBtn.addEventListener('click', ()=>{
    const visible = state.columns.filter(c=>c.visible);
    const keys = visible.map(c=>c.key);
    const header = visible.map(c=>c.label);
    // use filtered+sorted+current-page rows
    const data = pagedRows().map(r=> keys.map(k=> r[k] ?? ''));
    const csv = Papa.unparse({fields: header, data});
    const blob = new Blob([csv], {type:'text/csv'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href=url; a.download='table-export.csv'; a.click(); URL.revokeObjectURL(url);
  });

  // enable drag-and-drop reorder inside modal using SortableJS
  function enableSortable(){
    try{
      if(window.Sortable && colList){
        // destroy existing Sortable if present
        if(colList._sortable){ colList._sortable.destroy(); colList._sortable = null }
        colList._sortable = Sortable.create(colList, { animation: reducedMotion ? 0 : 150, onEnd: function(evt){
          const keys = Array.from(colList.querySelectorAll('.col-item')).map(div=> div.getAttribute('data-key'));
          const ordered = keys.map(k=> state.columns.find(c=>c.key===k)).filter(Boolean);
          state.columns = ordered; saveColumns(); renderModal(); animateHeaderReorder(); render();
        }});
      }
    }catch(e){/* ignore */}
  }

  // --- helpers ---
  function genId(){ return Math.random().toString(36).slice(2,9) }
  function loadColumns(){ try{ const raw = localStorage.getItem(KEY_COLUMNS); if(!raw) return DEFAULT_COLUMNS.slice(); const parsed = JSON.parse(raw); // basic validation
    if(!Array.isArray(parsed)) return DEFAULT_COLUMNS.slice(); return parsed; }catch(e){return DEFAULT_COLUMNS.slice()} }
  function saveColumns(){ try{ localStorage.setItem(KEY_COLUMNS, JSON.stringify(state.columns)) }catch(e){}
  }

  // header animation on reorder
  function animateHeaderReorder(){
    if(reducedMotion) return;
    thead.classList.add('header-anim');
    setTimeout(()=> thead.classList.remove('header-anim'), 420);
  }

  // skeleton handling
  let skeletonTimeout = null;
  function showSkeletonFor(ms){
    if(reducedMotion) return;
    clearTimeout(skeletonTimeout);
    tbody.innerHTML = '';
    const skwrap = document.createElement('div'); skwrap.className='skeleton-wrap';
    // show 6 placeholder rows
    for(let i=0;i<6;i++){ const div = document.createElement('div'); div.className='skeleton-row'; skwrap.appendChild(div) }
    const tr = document.createElement('tr'); const td = document.createElement('td'); td.colSpan = Math.max(1, state.columns.filter(c=>c.visible).length + 1); td.appendChild(skwrap); tr.appendChild(td); tbody.appendChild(tr);
    skeletonTimeout = setTimeout(()=>{ render(); }, ms);
  }

  // chart preloader control
  let chart = null; let chartReady = false;
  function renderChart(){
    try{
      const ctxEl = document.getElementById('chart');
      const parent = ctxEl.parentElement;
      // show preloader
      if(!chartReady){
        const pre = document.createElement('div'); pre.className='chart-preloader'; pre.id='chart-pre'; pre.innerHTML = '<div class="spinner"></div>';
        if(!parent.querySelector('#chart-pre')) parent.insertBefore(pre, ctxEl);
      }

      const rows = filteredRows();
      const roleCounts = {};
      const ages = [];
      rows.forEach(r=>{ const role = r.role || 'Unknown'; roleCounts[role] = (roleCounts[role]||0)+1; if(!isNaN(Number(r.age))) ages.push(Number(r.age)); });

      const labels = Object.keys(roleCounts);
      const data = Object.values(roleCounts);
      if(chart) chart.destroy();

      // Render bar chart for role counts
      chart = new Chart(ctxEl.getContext('2d'), {
        type: 'bar',
        data: { labels: labels, datasets: [{ label: 'Role counts', data: data, backgroundColor: 'rgba(25,118,210,0.85)' }] },
        options: { responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}}, scales:{y:{beginAtZero:true}} }
      });

      // Render pie chart for age distribution
      const ageCtx = document.getElementById('ageChart').getContext('2d');
      const ageData = ages.reduce((acc, age) => {
        const range = `${Math.floor(age / 10) * 10}-${Math.floor(age / 10) * 10 + 9}`;
        acc[range] = (acc[range] || 0) + 1;
        return acc;
      }, {});

      const ageLabels = Object.keys(ageData);
      const ageCounts = Object.values(ageData);

      new Chart(ageCtx, {
        type: 'pie',
        data: {
          labels: ageLabels,
          datasets: [{
            data: ageCounts,
            backgroundColor: ['#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF', '#FF9F40']
          }]
        },
        options: {
          responsive: true,
          plugins: {
            legend: {
              position: 'top',
            }
          }
        }
      });

      chartReady = true;
      const preEl = document.getElementById('chart-pre'); if(preEl) preEl.remove();
    }catch(e){/* ignore */}
  }

  function filteredRows(){
    const q = (state.search||'').trim();
    if(!q) return state.rows.slice();
    try{
      if(window.Fuse && fuse){
        const res = fuse.search(q);
        return res.map(r=>r.item);
      }
    }catch(e){/* fall back */}
    const low = q.toLowerCase();
    return state.rows.filter(r => state.columns.some(c=> String(r[c.key]||'').toLowerCase().includes(low)) );
  }

  function sortedRows(){
    const arr = filteredRows();
    if(!state.sort.key) return arr;
    const k = state.sort.key; const dir = state.sort.dir === 'asc' ? 1 : -1;
    arr.sort((a,b)=>{ const va=a[k] ?? ''; const vb=b[k] ?? ''; return String(va).localeCompare(String(vb), undefined, {numeric:true}) * dir });
    return arr;
  }

  function pagedRows(){
    const s = sortedRows(); const start = state.page * state.pageSize; return s.slice(start, start + state.pageSize);
  }

  function updateEditButtons(){ const has = Object.keys(state.edits||{}).length>0; saveAllBtn.disabled=!has; cancelAllBtn.disabled=!has }

  // header reflow animation when visible columns change
  function animateHeader(){ if(reducedMotion) return; thead.classList.add('header-anim'); setTimeout(()=>thead.classList.remove('header-anim'), 320) }

  // --- render ---
  function render(){
    // rebuild fuse index & chart for advanced UX
    resetFuse();
    renderHeader();
    // if large dataset show skeleton briefly
    if(!reducedMotion && state.rows.length > 400){ showSkeletonFor(380); renderChart(); return }
    renderBody(); updatePageInfo(); rowsCount.textContent = `${filteredRows().length} row(s)`; updateEditButtons();
    renderChart();
  }

  function renderHeader(){
    const visible = state.columns.filter(c=>c.visible);
    const tr = document.createElement('tr');
    visible.forEach(c=>{
      const th = document.createElement('th'); th.textContent = c.label;
      th.style.cursor='pointer';
      const span = document.createElement('span'); span.className='sort';
      if(state.sort.key===c.key){ span.textContent = state.sort.dir==='asc' ? '▲' : '▼' } else { span.textContent = '' }
      th.appendChild(span);
      th.addEventListener('click', ()=>{
        if(state.sort.key===c.key){ state.sort.dir = state.sort.dir==='asc' ? 'desc' : 'asc' } else { state.sort.key = c.key; state.sort.dir='asc' }
        render();
      });
      tr.appendChild(th);
    });
    const act = document.createElement('th'); act.textContent='Actions'; tr.appendChild(act);
    thead.innerHTML=''; thead.appendChild(tr);
  }

  function renderBody(){
    const visible = state.columns.filter(c=>c.visible);
    const rows = pagedRows();
    // efficient clear
    tbody.innerHTML = '';
    const frag = document.createDocumentFragment();
    rows.forEach(row => {
      const tr = document.createElement('tr');
      tr.setAttribute('data-id', row.id);
      tr.classList.add('row-enter');
      tr.addEventListener('dblclick', ()=> startRowEditing(row.id));
      visible.forEach(col=>{
        const td = document.createElement('td');
        if(state.edits[row.id] && (col.key in state.edits[row.id])){
          const v = state.edits[row.id][col.key];
          const inp = document.createElement('input'); inp.className='inline-input'; inp.value = v; inp.addEventListener('input', e=> applyEdit(row.id,col.key,e.target.value));
          td.appendChild(inp);
        } else if(state.edits[row.id]){
          const value = (state.edits[row.id][col.key] !== undefined) ? state.edits[row.id][col.key] : (row[col.key] ?? '');
          td.textContent = String(value);
        } else {
          td.textContent = String(row[col.key] ?? '');
        }
        tr.appendChild(td);
      });
      // actions
      const atd = document.createElement('td');
      const del = document.createElement('button'); del.className='ghost'; del.textContent='Delete'; del.addEventListener('click', ()=>{ if(confirm('Delete this row?')){ animateDeleteRow(row.id) } });
      atd.appendChild(del);
      tr.appendChild(atd);
      frag.appendChild(tr);
      // trigger enter animation
      requestAnimationFrame(()=>{ setTimeout(()=> tr.classList.remove('row-enter'), reducedMotion ? 0 : 18) });
    });
    tbody.appendChild(frag);
  }

  function startRowEditing(id){
    // copy current row into edits
    if(!state.edits[id]){
      const row = state.rows.find(r=>r.id===id); if(!row) return; state.edits[id] = Object.assign({}, row);
    }
    render(); updateEditButtons();
  }

  function applyEdit(id, key, value){
    if(!state.edits[id]) state.edits[id] = {};
    // simple validation for age
    if(key==='age' && value!==''){
      const num = Number(value);
      if(Number.isNaN(num)){ /* keep string but you might show validation */ }
    }
    state.edits[id][key] = value;
    updateEditButtons();
  }

  function renderModal(){
    colList.innerHTML='';
    state.columns.forEach((c, idx)=>{
      const div = document.createElement('div'); div.className='col-item';
      div.setAttribute('data-key', c.key);
      const left = document.createElement('div');
      const chk = document.createElement('input'); chk.type='checkbox'; chk.checked = !!c.visible; chk.addEventListener('change', ()=>{ c.visible = chk.checked; saveColumns(); render(); animateHeader(); });
      left.appendChild(chk);
      const label = document.createElement('span'); label.textContent = ' ' + c.label + ' ('+c.key+')'; left.appendChild(label);
      div.appendChild(left);
      const right = document.createElement('div');
      const up = document.createElement('button'); up.textContent='▲'; up.className='ghost'; up.disabled = idx===0; up.addEventListener('click', ()=>{ if(idx>0){ state.columns.splice(idx-1,0,state.columns.splice(idx,1)[0]); saveColumns(); renderModal(); animateHeaderReorder(); render(); }});
      const down = document.createElement('button'); down.textContent='▼'; down.className='ghost'; down.disabled = idx===state.columns.length-1; down.addEventListener('click', ()=>{ if(idx<state.columns.length-1){ state.columns.splice(idx+1,0,state.columns.splice(idx,1)[0]); saveColumns(); renderModal(); animateHeaderReorder(); render(); }});
      const del = document.createElement('button'); del.textContent='Delete'; del.className='ghost'; del.addEventListener('click', ()=>{ if(confirm('Remove column '+c.label+'? This will NOT delete the data in rows.')){ state.columns.splice(idx,1); saveColumns(); renderModal(); animateHeaderReorder(); render(); }});
      right.appendChild(up); right.appendChild(down); right.appendChild(del);
      div.appendChild(right);
      colList.appendChild(div);
    });
    // attach Sortable behavior
    enableSortable();
  }

  // animate deletion of a row for smooth UX
  function animateDeleteRow(id){
    const tr = tbody.querySelector(`[data-id="${id}"]`);
    if(tr){
      tr.classList.add('row-exit');
      setTimeout(()=>{
        state.rows = state.rows.filter(r=>r.id!==id);
        delete state.edits[id];
        render();
      }, reducedMotion ? 0 : 320);
    } else {
      // fallback
      state.rows = state.rows.filter(r=>r.id!==id);
      delete state.edits[id];
      render();
    }
  }

  function updatePageInfo(){
    const total = filteredRows().length; const pages = Math.max(1, Math.ceil(total/state.pageSize)); pageInfo.textContent = `Page ${state.page+1} / ${pages}`;
  }

  // initial setup
  resetFuse(); render();

  // expose for debugging in browser console
  window.__staticTableState = state;
})();
