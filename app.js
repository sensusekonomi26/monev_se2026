// ─── KONFIGURASI ───────────────────────────────────────────────
const SHEET_ID   = '1fv8XwQY5U4SLda8ll27sy4tiq1nNJuBfX76cya0_nGU';
const SHEET_NAME = 'Data Projek';

const COL_PML      = 0;
const COL_PCL      = 1;
const COL_KEC      = 2;
const COL_KODE_SLS = 5;

let COL_PROG_KEL = 9;
let COL_PROG_USA = 13;

// ─── STATE ─────────────────────────────────────────────────────
let allData  = [];
let filtered = [];
let sortMode = 'prog';
let progTab  = 'rata';
let searchQ  = '';

// ─── HELPERS ───────────────────────────────────────────────────
function pColor(v){
  if(v>=100) return {bar:'#10B981',text:'#059669',cls:'bg',label:'Selesai'};
  if(v>=75)  return {bar:'#2563EB',text:'#1D4ED8',cls:'bb',label:'Hampir'};
  if(v>=50)  return {bar:'#F59E0B',text:'#D97706',cls:'ba',label:'Proses'};
  if(v>0)    return {bar:'#EF4444',text:'#DC2626',cls:'br',label:'Tertinggal'};
  return           {bar:'#CBD5E1',text:'#64748B',cls:'bp',label:'Belum Mulai'};
}

function fmt(n){return(n||0).toLocaleString('id-ID');}

function pct(v){return Math.min(v,100)+'%';}

function esc(s){
  return String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function highlight(text, q){
  if(!q) return esc(text);
  const safe = esc(text);
  const re = new RegExp('('+q.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+')','gi');
  return safe.replace(re,'<mark>$1</mark>');
}

function parseProgres(raw){
  if(raw==null||raw==='') return 0;
  if(typeof raw==='string'){
    const s=raw.trim().replace('%','').replace(',','.');
    const n=parseFloat(s);
    if(isNaN(n)) return 0;
    if(n>0&&n<=1.5) return Math.round(n*100);
    return Math.round(n);
  }
  const n=parseFloat(raw);
  if(isNaN(n)) return 0;
  if(n>0&&n<=1.5) return Math.round(n*100);
  return Math.round(n);
}

function setSync(ok){
  const now=new Date();
  const t=[now.getHours(),now.getMinutes(),now.getSeconds()].map(x=>String(x).padStart(2,'0')).join(':');
  document.getElementById('lastSync').textContent=ok?'Update: '+t:'Gagal memuat';
  document.getElementById('syncDot').style.background=ok?'#10B981':'#EF4444';
}

function showErr(msg){
  document.getElementById('errorMsg').textContent=msg;
  document.getElementById('error-banner').style.display='block';
  setSync(false);
}

function toggleSidebar(){
  window.innerWidth<=768
    ?document.body.classList.toggle('sidebar-open')
    :document.body.classList.toggle('sidebar-collapsed');
}

// ─── LOAD DATA ─────────────────────────────────────────────────
async function loadData(){
  const icon=document.getElementById('refreshIcon');
  icon.classList.add('spin');
  document.getElementById('loading').style.display='flex';
  document.getElementById('error-banner').style.display='none';
  document.getElementById('loaderSub').textContent='Mengambil sheet "'+SHEET_NAME+'"...';

  try{
    const sheetNames=[SHEET_NAME,'data projek','Data projek','DATA PROJEK'];
    let json=null;

    for(const sn of sheetNames){
      try{
        const url=`https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json&sheet=${encodeURIComponent(sn)}`;
        const res=await fetch(url);
        if(!res.ok) continue;
        const txt=await res.text();
        const match=txt.match(/google\.visualization\.Query\.setResponse\(([\s\S]*?)\);?\s*$/);
        if(!match) continue;
        const j=JSON.parse(match[1]);
        if(j.table&&j.table.rows&&j.table.rows.length>1){json=j;break;}
      }catch(e){}
    }

    if(!json) throw new Error('Tidak dapat membaca sheet. Pastikan sheet sudah diset "Anyone with link can view".');

    const rows=json.table.rows;
    const N=rows.length;

    const gv=(row,idx)=>{const v=row?.c?.[idx]?.v;return v!=null?String(v).trim():'';};
    const gn=(row,idx)=>{const v=row?.c?.[idx]?.v;return v!=null?v:null;};

    // Deteksi kolom progres dari header
    if(rows[0]&&rows[0].c){
      const hdr=rows[0].c;
      let progCount=0;
      for(let ci=0;ci<hdr.length;ci++){
        const h=String(hdr[ci]?.v||hdr[ci]?.f||'').toUpperCase().trim();
        if(h.includes('PROGRES')){
          progCount++;
          if(progCount===1) COL_PROG_KEL=ci;
          if(progCount===2) COL_PROG_USA=ci;
        }
      }
    }

    const headerWords=new Set(['nama pml','nama pcl','kecamatan','kelurahan','wilayah sls','kode sls','progres','pengisian']);
    const rawPML=[], rawPCL=[], rawKEC=[];
    for(let i=0;i<N;i++){
      rawPML.push(gv(rows[i],COL_PML));
      rawPCL.push(gv(rows[i],COL_PCL));
      rawKEC.push(gv(rows[i],COL_KEC).toUpperCase());
    }

    // Forward-fill kolom kosong
    const ffPML=[...rawPML], ffPCL=[...rawPCL], ffKEC=[...rawKEC];
    for(let i=1;i<N;i++){
      const pp=ffPML[i-1],pc=ffPCL[i-1],pk=ffKEC[i-1];
      if(!ffPML[i]&&pp&&!headerWords.has(pp.toLowerCase())) ffPML[i]=pp;
      if(!ffPCL[i]&&pc&&!headerWords.has(pc.toLowerCase())) ffPCL[i]=pc;
      if(!ffKEC[i]&&pk&&!headerWords.has(pk.toLowerCase())) ffKEC[i]=pk;
    }

    // Grouping per PCL
    const pclMap=new Map();
    for(let i=1;i<N;i++){
      const pml=ffPML[i], pcl=ffPCL[i], kec=ffKEC[i];
      if(!pcl||!kec) continue;
      if(headerWords.has(pcl.toLowerCase())||headerWords.has(pml.toLowerCase())) continue;
      const pclLow=pcl.toLowerCase();
      if(pclLow.includes('nama pcl')||pclLow==='pcl') continue;

      const key=`${pcl.trim()}||${kec.trim()}`;
      if(!pclMap.has(key)){
        pclMap.set(key,{namaPML:pml||'—',namaPCL:pcl,kec:kec.trim(),slsCount:0,progKel:null,progUsa:null});
      }
      const e=pclMap.get(key);
      const kodeSLS=gv(rows[i],COL_KODE_SLS);
      if(kodeSLS) e.slsCount++;
      if(!e.namaPML||e.namaPML==='—') e.namaPML=pml||'—';
      const rKel=gn(rows[i],COL_PROG_KEL);
const rUsa=gn(rows[i],COL_PROG_USA);
const pKel=parseProgres(rKel);
const pUsa=parseProgres(rUsa);
if(rKel!=null && rKel!=='' && pKel>0 && e.progKel===null)
  e.progKel=pKel;
if(rUsa!=null && rUsa!=='' && pUsa>0 && e.progUsa===null)
  e.progUsa=pUsa;
    }

    if(!pclMap.size) throw new Error('Tidak ada baris data valid.');

    allData=[...pclMap.values()].map(e=>{
      const progKel=e.progKel??0;
      const progUsa=e.progUsa??0;
      return {...e,progKel,progUsa,progRata:Math.round((progKel+progUsa)/2)};
    }).filter(d=>d.namaPCL&&d.kec);

    if(!allData.length) throw new Error('Data kosong setelah grouping.');

    applyFilters();
    setSync(true);

    // Auto refresh setiap 5 menit
    setTimeout(loadData, 5*60*1000);

  }catch(e){
    showErr(e.message);
    console.error(e);
  }finally{
    document.getElementById('loading').style.display='none';
    icon.classList.remove('spin');
  }
}

// ─── FILTER ────────────────────────────────────────────────────
function onKecChange(){
  const kec=document.getElementById('fKec').value;
  const selPML=document.getElementById('fPML');
  const selPCL=document.getElementById('fPCL');

  // Reset dropdown PCL
  selPCL.disabled=true;
  selPCL.innerHTML='<option value="">— Pilih PML Dulu —</option>';

  if(kec){
    const pmls=[...new Set(allData.filter(d=>d.kec===kec).map(d=>d.namaPML).filter(Boolean))].sort();
    selPML.disabled=false;
    selPML.innerHTML='<option value="">Semua PML</option>'+pmls.map(p=>`<option value="${p}">${p}</option>`).join('');
  }else{
    selPML.disabled=true;
    selPML.innerHTML='<option value="">— Pilih Kecamatan Dulu —</option>';
  }
  applyFilters();
}

function onPMLChange(){
  const kec=document.getElementById('fKec').value;
  const pml=document.getElementById('fPML').value;
  const selPCL=document.getElementById('fPCL');

  if(pml){
    const pcls=[...new Set(
      allData.filter(d=>(!kec||d.kec===kec)&&d.namaPML===pml).map(d=>d.namaPCL).filter(Boolean)
    )].sort();
    selPCL.disabled=false;
    selPCL.innerHTML='<option value="">Semua PCL</option>'+pcls.map(p=>`<option value="${p}">${p}</option>`).join('');
  }else{
    selPCL.disabled=true;
    selPCL.innerHTML='<option value="">— Pilih PML Dulu —</option>';
  }
  applyFilters();
}

// ─── SEARCH ────────────────────────────────────────────────────
function onSearch(){
  const val=document.getElementById('searchInput').value;
  searchQ=val.trim();
  document.getElementById('searchClear').style.display=searchQ?'block':'none';
  const tag=document.getElementById('searchTag');
  if(searchQ){
    tag.style.display='inline-flex';
    document.getElementById('searchTagText').textContent='Hasil: "'+searchQ+'"';
  }else{
    tag.style.display='none';
  }
  applyFilters();
}

function onSearchKey(e){
  if(e.key==='Escape') clearSearch();
}

function clearSearch(){
  document.getElementById('searchInput').value='';
  searchQ='';
  document.getElementById('searchClear').style.display='none';
  document.getElementById('searchTag').style.display='none';
  applyFilters();
}

function applyFilters(){
  const kec=document.getElementById('fKec').value;
  const pml=document.getElementById('fPML').value;
  const pcl=document.getElementById('fPCL').value;
  const q=searchQ.toLowerCase();

  filtered=allData.filter(d=>{
    if(kec&&d.kec!==kec) return false;
    if(pml&&d.namaPML!==pml) return false;
    if(pcl&&d.namaPCL!==pcl) return false;
    if(q){
      const haystack=(d.namaPCL+' '+d.namaPML+' '+d.kec).toLowerCase();
      return haystack.includes(q);
    }
    return true;
  });
  renderAll();
}

function resetFilters(){
  document.getElementById('fKec').value='';
  const sp=document.getElementById('fPML');
  sp.innerHTML='<option value="">— Pilih Kecamatan Dulu —</option>';
  sp.disabled=true;
  const sc=document.getElementById('fPCL');
  sc.innerHTML='<option value="">— Pilih PML Dulu —</option>';
  sc.disabled=true;
  clearSearch();
}

// ─── SORT & TAB ────────────────────────────────────────────────
function setSort(m){
  sortMode=m;
  ['sortProg','sortPcl','sortKec'].forEach(id=>document.getElementById(id).classList.remove('active'));
  document.getElementById(m==='prog'?'sortProg':m==='pcl'?'sortPcl':'sortKec').classList.add('active');
  renderCards();
}

function setProgTab(t){
  progTab=t;
  const map={rata:'tabR',keluarga:'tabK',usaha:'tabU'};
  const cls={rata:'active-r',keluarga:'active-k',usaha:'active-u'};
  Object.values(map).forEach(id=>{document.getElementById(id).className='prog-tab';});
  document.getElementById(map[t]).className='prog-tab '+cls[t];
  renderStats();
  renderCards();
}

function getMainProg(d){
  if(progTab==='keluarga') return d.progKel;
  if(progTab==='usaha')    return d.progUsa;
  return d.progRata;
}

// ─── RENDER ────────────────────────────────────────────────────
function renderAll(){
  renderStats();
  renderCards();
  renderTitle();
}

function renderStats(){
  const d=filtered, n=d.length;
  const vals=d.map(r=>getMainProg(r));
  const active=vals.filter(v=>v>0);
  const avg=active.length?Math.round(active.reduce((s,v)=>s+v,0)/active.length):0;
  document.getElementById('sTotalPCL').textContent=fmt(n);
  document.getElementById('sAvgProg').textContent=avg+'%';
  document.getElementById('sSelesai').textContent=fmt(vals.filter(v=>v>=100).length);
  document.getElementById('sBelum').textContent=fmt(d.filter(r=>r.progKel===0&&r.progUsa===0).length);
}

function renderTitle(){
  const kec=document.getElementById('fKec').value;
  const pml=document.getElementById('fPML').value;
  const pcl=document.getElementById('fPCL').value;
  const tabLabel={rata:'Rata-rata',keluarga:'Keluarga',usaha:'Usaha'};
  const kecLabel=kec?kec.split(' ').map(w=>w[0]+w.slice(1).toLowerCase()).join(' '):'Semua Kecamatan';
  let t='Progress Per PCL';
  if(kec) t+=' — Kec. '+kecLabel;
  if(pml&&!pcl) t+=' (PML: '+pml+')';
  if(pcl) t+=' — '+pcl;
  if(searchQ) t+=' · Cari: "'+searchQ+'"';
  document.getElementById('secTitle').textContent=t;
  document.getElementById('secCount').textContent=fmt(filtered.length)+' PCL · tampil progres '+tabLabel[progTab];
}

function renderCards(){
  const grid=document.getElementById('petugasGrid');
  const q=searchQ;

  if(!filtered.length){
    const msg=q?`Tidak ada PCL yang cocok dengan "<b>${esc(q)}</b>"`:'Coba ubah atau reset filter';
    grid.innerHTML=`<div class="empty"><div class="empty-ico">🔍</div><div class="empty-ttl">Tidak ada data</div><div>${msg}</div></div>`;
    return;
  }

  const sorted=[...filtered].sort((a,b)=>{
    if(sortMode==='prog') return getMainProg(b)-getMainProg(a);
    if(sortMode==='pcl')  return (a.namaPCL||'').localeCompare(b.namaPCL||'','id');
    return (a.kec||'').localeCompare(b.kec||'','id');
  });

  grid.innerHTML=sorted.map((d,i)=>{
    const mainProg=getMainProg(d);
    const c=pColor(mainProg);
    const delay=(i%20)*25;
    const kecLabel=d.kec?d.kec.split(' ').map(w=>w[0]+w.slice(1).toLowerCase()).join(' '):'-';
    const cKel=pColor(d.progKel);
    const cUsa=pColor(d.progUsa);
    const hlPCL=highlight(d.namaPCL||'—', q);
    const hlPML=highlight(d.namaPML||'—', q);

    return `<div class="pc" style="animation-delay:${delay}ms">
  <div class="pc-pml">PML: <span>${hlPML}</span></div>
  <div class="pc-body">
    <div class="pc-nama" title="${esc(d.namaPCL||'—')}">${hlPCL}</div>
    <div class="pc-kec">📍 ${kecLabel} &nbsp;·&nbsp; ${d.slsCount} SLS</div>
    <div class="prog-section">
      <div class="prog-row">
        <div class="prog-label-row">
          <span class="prog-label">🏠 Keluarga</span>
          <span class="prog-val" style="color:${cKel.text}">${d.progKel}%</span>
        </div>
        <div class="prog-bar-bg"><div class="prog-bar-fill" style="width:${pct(d.progKel)};background:${cKel.bar}"></div></div>
      </div>
      <div class="prog-row">
        <div class="prog-label-row">
          <span class="prog-label">🏪 Usaha</span>
          <span class="prog-val" style="color:${cUsa.text}">${d.progUsa}%</span>
        </div>
        <div class="prog-bar-bg"><div class="prog-bar-fill" style="width:${pct(d.progUsa)};background:${cUsa.bar}"></div></div>
      </div>
    </div>
    <div class="pc-summary">
      <div>
        <div style="font-size:10px;color:var(--text3);margin-bottom:1px">Rata-rata</div>
        <div class="pc-avg" style="color:${c.text}">${d.progRata}%</div>
      </div>
      <span class="badge ${c.cls}">${c.label}</span>
    </div>
  </div>
</div>`;
  }).join('');
}

// ─── INIT ──────────────────────────────────────────────────────
loadData();
