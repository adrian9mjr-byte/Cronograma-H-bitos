const SUPABASE_URL = 'https://dlssdjsifskthcywhoob.supabase.co';
const SUPABASE_KEY = 'sb_publishable_knmsHYYiwCzGxgQbPt7F4w_vune2eYW';
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
const USER_ID = 'adrian_cronograma';

const SH=30,HS=6,HE=22;
const SLOTS=[];
for(let h=HS;h<HE;h++){SLOTS.push({h,half:false});SLOTS.push({h,half:true});}
const DAYS_ES=['Domingo','Lunes','Martes','Miercoles','Jueves','Viernes','Sabado'];
const DAYS_SH=['Dom','Lun','Mar','Mie','Jue','Vie','Sab'];
const MON_ES=['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
const MON_SH=['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
const DEFAULT_CATS=[
  {id:'platzi',name:'Platzi',color:'#1D9E75',bg:'#E1F5EE',text:'#085041'},
  {id:'pruebas',name:'Pruebas',color:'#D85A30',bg:'#FAECE7',text:'#4A1B0C'},
  {id:'notas',name:'Mis Notas',color:'#7F77DD',bg:'#EEEDFE',text:'#26215C'},
  {id:'ejercicio',name:'Ejercicio',color:'#639922',bg:'#EAF3DE',text:'#173404'},
  {id:'trabajo',name:'Trabajo',color:'#378ADD',bg:'#E6F1FB',text:'#042C53'},
  {id:'descanso',name:'Descanso',color:'#888780',bg:'#F1EFE8',text:'#2C2C2A'},
  {id:'relax',name:'Relax',color:'#D4537E',bg:'#FBEAF0',text:'#4B1528'},
];

function today(){let d=new Date();d.setHours(0,0,0,0);return d;}
function dateKey(d){return d.toISOString().slice(0,10);}
function addDays(d,n){let r=new Date(d);r.setDate(r.getDate()+n);return r;}
function getWeekDays(d){let s=new Date(d);let day=s.getDay();let diff=day===0?-6:1-day;s.setDate(s.getDate()+diff);return Array.from({length:7},(_,i)=>addDays(s,i));}
function fmtH(h,half){let ap=h>=12?'pm':'am';let hh=h>12?h-12:(h===0?12:h);return hh+(half?':30':':00')+ap;}
function slotIdx(h,half){return(h-HS)*2+(half?1:0);}
function lighten(hex,a){let r=parseInt(hex.slice(1,3),16),g=parseInt(hex.slice(3,5),16),b=parseInt(hex.slice(5,7),16);return'#'+[Math.min(255,Math.round(r+(255-r)*a)),Math.min(255,Math.round(g+(255-g)*a)),Math.min(255,Math.round(b+(255-b)*a))].map(x=>x.toString(16).padStart(2,'0')).join('');}
function darken(hex,a){let r=parseInt(hex.slice(1,3),16),g=parseInt(hex.slice(3,5),16),b=parseInt(hex.slice(5,7),16);return'#'+[Math.max(0,Math.round(r*(1-a))),Math.max(0,Math.round(g*(1-a))),Math.max(0,Math.round(b*(1-a)))].map(x=>x.toString(16).padStart(2,'0')).join('');}
function autoTheme(hex){return{color:hex,bg:lighten(hex,0.85),text:darken(hex,0.55)};}
function getRepDays(t,cd){
  if(t==='daily')return[0,1,2,3,4,5,6];
  if(t==='weekdays')return[1,2,3,4,5];
  if(t==='weekend')return[0,6];
  if(t==='custom')return cd.reduce((a,v,i)=>v?[...a,i]:a,[]);
  return[];
}

// Notificaciones
function requestNotifPermission(){
  if('Notification' in window && Notification.permission==='default'){
    Notification.requestPermission();
  }
}

function scheduleNotification(title, body, fireAt){
  if(!('Notification' in window) || Notification.permission!=='granted') return null;
  const delay = fireAt - Date.now();
  if(delay < 0) return null;
  return setTimeout(()=>{
    new Notification(title, {body, icon: '/favicon.ico'});
  }, delay);
}

function scheduleEventsNotifications(events, cats){
  // Limpiar timers anteriores
  if(window._notifTimers){
    window._notifTimers.forEach(t=>clearTimeout(t));
  }
  window._notifTimers = [];
  if(!('Notification' in window) || Notification.permission!=='granted') return;
  const now = new Date();
  const todayStr = dateKey(now);
  const tomorrowStr = dateKey(addDays(now, 1));
  [todayStr, tomorrowStr].forEach(dk=>{
    const evts = events[dk]||[];
    evts.forEach(ev=>{
      if(!ev.notif || ev.notif===0) return;
      const catName = (cats.find(c=>c.id===ev.cat)||{name:ev.cat}).name;
      const evDate = new Date(dk);
      evDate.setHours(ev.h, ev.half?30:0, 0, 0);
      const fireAt = evDate.getTime() - (ev.notif * 60 * 1000);
      const t = scheduleNotification(
        `⏰ ${catName}${ev.note?' - '+ev.note:''}`,
        `Empieza en ${ev.notif} minuto${ev.notif>1?'s':''} (${fmtH(ev.h,ev.half||false)})`,
        fireAt
      );
      if(t) window._notifTimers.push(t);
    });
  });
}

async function loadFromDB(){
  const{data,error}=await sb.from('cronograma').select('key,value').eq('user_id',USER_ID);
  if(error||!data) return{events:{},cats:DEFAULT_CATS};
  const result={events:{},cats:DEFAULT_CATS};
  data.forEach(row=>{
    if(row.key==='events') try{result.events=JSON.parse(row.value);}catch(e){}
    if(row.key==='cats') try{result.cats=JSON.parse(row.value);}catch(e){}
  });
  return result;
}

async function saveToDB(key,value){
  const{data}=await sb.from('cronograma').select('id').eq('user_id',USER_ID).eq('key',key).single();
  if(data){
    await sb.from('cronograma').update({value:JSON.stringify(value)}).eq('user_id',USER_ID).eq('key',key);
  } else {
    await sb.from('cronograma').insert({user_id:USER_ID,key,value:JSON.stringify(value)});
  }
}

const {useState,useEffect,useRef}=React;

function App(){
  const [cats,setCats]=useState(DEFAULT_CATS);
  const [events,setEvents]=useState({});
  const [view,setView]=useState('day');
  const [cursor,setCursor]=useState(today());
  const [sync,setSync]=useState({dot:'#BA7517',msg:'Cargando...'});
  const [loaded,setLoaded]=useState(false);
  const [modal,setModal]=useState(null);
  const [showNCF,setShowNCF]=useState(false);
  const [showSum,setShowSum]=useState(false);
  const [showRepMgr,setShowRepMgr]=useState(false);
  const [notifGranted,setNotifGranted]=useState(false);
  const [ncName,setNcName]=useState('');
  const [ncColor,setNcColor]=useState('#7F77DD');
  const [form,setForm]=useState({cat:'platzi',note:'',hour:'8_0',dur:2,rep:'none',repDays:[false,false,false,false,false,false,false]});
  const [dragEvt,setDragEvt]=useState(null);
  const [dragOver,setDragOver]=useState(null);
  const saveTimer=useRef(null);

  useEffect(()=>{
    (async()=>{
      try{
        const data=await loadFromDB();
        setEvents(data.events);
        setCats(data.cats);
        setSync({dot:'#1D9E75',msg:'Datos cargados ✓'});
        scheduleEventsNotifications(data.events, data.cats);
      }catch(e){
        setSync({dot:'#D85A30',msg:'Error al cargar'});
      }
      setLoaded(true);
      if('Notification' in window){
        setNotifGranted(Notification.permission==='granted');
      }
    })();
  },[]);

  function scheduleSave(evts,ct){
    if(saveTimer.current) clearTimeout(saveTimer.current);
    setSync({dot:'#BA7517',msg:'Guardando...'});
    saveTimer.current=setTimeout(async()=>{
      try{
        await Promise.all([saveToDB('events',evts),saveToDB('cats',ct)]);
        const n=new Date();
        setSync({dot:'#1D9E75',msg:`Guardado ${String(n.getHours()).padStart(2,'0')}:${String(n.getMinutes()).padStart(2,'0')}`});
        scheduleEventsNotifications(evts,ct);
      }catch(e){setSync({dot:'#D85A30',msg:'Error al guardar'});}
    },800);
  }

  function setEvts(e){setEvents(e);scheduleSave(e,cats);}
  function setCatsS(c){setCats(c);scheduleSave(events,c);}
  const catById=id=>cats.find(c=>c.id===id)||cats[0];

  function getAllRepIds(){
    const map={};
    Object.entries(events).forEach(([dk,evts])=>{
      evts.forEach(ev=>{
        if(ev.repId){
          if(!map[ev.repId]) map[ev.repId]={repId:ev.repId,cat:ev.cat,h:ev.h,half:ev.half,dur:ev.dur,count:0};
          map[ev.repId].count++;
        }
      });
    });
    return Object.values(map);
  }

  function deleteRepId(repId){
    const ne={};
    Object.entries(events).forEach(([dk,evts])=>{
      const f=evts.filter(e=>e.repId!==repId);
      if(f.length>0) ne[dk]=f;
    });
    setEvts(ne);
    setShowRepMgr(false);
  }

  function addRepEvts(base,cat,note,h,half,dur,repType,cd,startDate,notif){
    const rd=getRepDays(repType,cd);
    if(!rd.length) return base;
    const out={...base};
    const end=addDays(startDate,90);
    let d=new Date(startDate);
    const repId='rep_'+Date.now();
    while(d<=end){
      if(rd.includes(d.getDay())){
        const dk=dateKey(d);
        if(!out[dk]) out[dk]=[];
        out[dk]=[...out[dk],{id:Date.now()+'_'+Math.random(),cat,note,h,half,dur,done:false,repId,notif:notif||0}];
      }
      d=addDays(d,1);
    }
    return out;
  }

  function addFromForm(){
    const[h,hf]=form.hour.split('_');
    const half=hf==='1',hi=parseInt(h),dk=dateKey(cursor);
    let ne={...events};
    if(form.rep==='none'){
      if(!ne[dk]) ne[dk]=[];
      ne[dk]=[...ne[dk],{id:Date.now(),cat:form.cat,note:form.note,h:hi,half,dur:form.dur,done:false,notif:0}];
    } else {
      ne=addRepEvts(ne,form.cat,form.note,hi,half,form.dur,form.rep,form.repDays,cursor,0);
    }
    setForm(f=>({...f,note:''}));
    setEvts(ne);
  }

  function saveModal(){
    if(!modal) return;
    const co=catById(modal.cat),uc=modal.color!==co.color,theme=uc?autoTheme(modal.color):null;
    let ne={...events};
    if(modal.evtId){
      ne[modal.dk]=(ne[modal.dk]||[]).map(e=>String(e.id)===modal.evtId?{...e,cat:modal.cat,note:modal.note,h:modal.h,half:modal.half,dur:modal.dur,customColor:uc?modal.color:null,customTheme:theme,notif:modal.notif||0}:e);
    } else {
      if(modal.rep==='none'){
        if(!ne[modal.dk]) ne[modal.dk]=[];
        ne[modal.dk]=[...ne[modal.dk],{id:Date.now(),cat:modal.cat,note:modal.note,h:modal.h,half:modal.half,dur:modal.dur,done:false,customColor:uc?modal.color:null,customTheme:theme,notif:modal.notif||0}];
      } else {
        ne=addRepEvts(ne,modal.cat,modal.note,modal.h,modal.half,modal.dur,modal.rep,modal.repDays,cursor,modal.notif||0);
      }
    }
    setModal(null);setEvts(ne);
  }

  function delEvt(dk,id){setEvts({...events,[dk]:(events[dk]||[]).filter(e=>String(e.id)!==String(id))});}
  function toggleDone(dk,id){setEvts({...events,[dk]:(events[dk]||[]).map(e=>String(e.id)===String(id)?{...e,done:!e.done}:e)});}

  function createCat(){
    if(!ncName.trim()) return;
    setCatsS([...cats,{id:'cat_'+Date.now(),name:ncName,...autoTheme(ncColor)}]);
    setNcName('');setNcColor('#7F77DD');setShowNCF(false);
  }

  function handleDrop(dk,h,half){
    if(!dragEvt) return;
    let ne={...events};
    if(dragEvt.type==='new'){
      if(!ne[dk]) ne[dk]=[];
      ne[dk]=[...ne[dk],{id:Date.now(),cat:dragEvt.catId,note:'',h,half,dur:2,done:false,notif:0}];
    } else {
      const src=ne[dragEvt.dk]||[],ev=src.find(e=>String(e.id)===String(dragEvt.id));
      if(ev){
        ne[dragEvt.dk]=src.filter(e=>String(e.id)!==String(dragEvt.id));
        if(!ne[dk]) ne[dk]=[];
        ne[dk]=[...ne[dk],{...ev,h,half}];
      }
    }
    setDragEvt(null);setDragOver(null);setEvts(ne);
  }

  async function enableNotifications(){
    const perm = await Notification.requestPermission();
    setNotifGranted(perm==='granted');
  }

  const td=today(),weekDays=getWeekDays(cursor);
  const progressKeys=view==='day'?[dateKey(cursor)]:weekDays.map(dateKey);
  let ptotal=0,pdone=0;
  progressKeys.forEach(k=>{const e=events[k]||[];ptotal+=e.length;pdone+=e.filter(e=>e.done).length;});
  const pct=ptotal?Math.round(pdone/ptotal*100):0;
  let all=[];
  Object.entries(events).forEach(([dk,evts])=>evts.forEach(e=>all.push({...e,dk})));
  const sTotal=all.length,sDone=all.filter(e=>e.done).length,sPct=sTotal?Math.round(sDone/sTotal*100):0;
  const tH=all.reduce((s,e)=>s+e.dur*0.5,0),dH=all.filter(e=>e.done).reduce((s,e)=>s+e.dur*0.5,0);
  const catStats=cats.map(c=>{const ce=all.filter(e=>e.cat===c.id);return{...c,count:ce.length,done:ce.filter(e=>e.done).length,hrs:ce.reduce((s,e)=>s+e.dur*0.5,0)};}).filter(c=>c.count>0).sort((a,b)=>b.hrs-a.hrs);
  const repIds=getAllRepIds();

  const bi={width:'100%',fontSize:13,padding:'5px 7px',fontFamily:'system-ui',border:'1px solid #ccc',borderRadius:8,background:'#fff',color:'#1a1a1a',marginBottom:0,boxSizing:'border-box'};
  const Lbl=({t})=>React.createElement('label',{style:{fontSize:11,color:'#666',display:'block',marginBottom:3,marginTop:10}},t);
  const Sel=({val,onChange,opts})=>React.createElement('select',{value:val,onChange:e=>onChange(e.target.value),style:bi},opts.map(([v,l])=>React.createElement('option',{key:v,value:v},l)));
  const Inp=({val,onChange,ph})=>React.createElement('input',{value:val,onChange:e=>onChange(e.target.value),placeholder:ph,style:bi});
  const RepGrid=({days,toggle})=>React.createElement('div',{style:{display:'grid',gridTemplateColumns:'repeat(7,1fr)',gap:3,marginTop:6}},
    DAYS_SH.map((d,i)=>React.createElement('div',{key:i,onClick:()=>toggle(i),style:{padding:'4px 0',textAlign:'center',fontSize:10,border:'1px solid #ccc',borderRadius:4,cursor:'pointer',background:days[i]?'#1a1a1a':'transparent',color:days[i]?'#fff':'#666'}},d))
  );

  function EvBlock({ev,dk}){
    // Siempre usar fondo claro y texto oscuro para máximo contraste
    const baseCat=catById(ev.cat);
    const th=ev.customTheme?{
      bg:lighten(ev.customColor,0.85),
      text:darken(ev.customColor,0.55),
      color:ev.customColor
    }:{
      bg:baseCat.bg,
      text:baseCat.text,
      color:baseCat.color
    };
    const top=slotIdx(ev.h,ev.half||false)*SH,height=ev.dur*SH-2;
    const dl={1:'30m',2:'1h',3:'1.5h',4:'2h',6:'3h',8:'4h'}[ev.dur]||'';
    return React.createElement('div',{
      draggable:true,
      onDragStart:()=>setDragEvt({type:'existing',dk,id:ev.id}),
      onDragEnd:()=>{setDragEvt(null);setDragOver(null);},
      style:{position:'absolute',left:2,right:2,top,height,borderRadius:5,padding:'3px 5px',cursor:'grab',zIndex:2,overflow:'hidden',display:'flex',flexDirection:'column',justifyContent:'space-between',background:th.bg,color:th.text,borderLeft:`3px solid ${th.color}`,opacity:ev.done?0.5:1,boxShadow:'0 1px 3px rgba(0,0,0,0.15)'}
    },
      React.createElement('div',{style:{fontSize:10,fontWeight:600,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis',lineHeight:1.3,color:th.text}},
        baseCat.name+(ev.note?` · ${ev.note}`:''+(ev.repId?' ↻':'')+(ev.notif?' 🔔':''))
      ),
      React.createElement('div',{style:{fontSize:9,opacity:0.75,color:th.text}},fmtH(ev.h,ev.half||false)+' · '+dl),
      height>32&&React.createElement('div',{style:{display:'flex',gap:2,marginTop:1}},
        [['✓',()=>toggleDone(dk,ev.id),ev.done?th.color+'33':'rgba(0,0,0,0.1)'],
         ['✎',()=>setModal({dk,evtId:String(ev.id),cat:ev.cat,note:ev.note||'',h:ev.h,half:ev.half||false,dur:ev.dur,color:ev.customColor||baseCat.color,rep:'none',repDays:[false,false,false,false,false,false,false],notif:ev.notif||0}),'rgba(0,0,0,0.1)'],
         ['✕',()=>delEvt(dk,ev.id),'rgba(0,0,0,0.1)']
        ].map(([ico,fn,bg])=>React.createElement('button',{key:ico,onClick:fn,style:{width:14,height:14,borderRadius:3,border:'none',cursor:'pointer',fontSize:8,display:'flex',alignItems:'center',justifyContent:'center',background:bg,color:th.text,padding:0,flexShrink:0}},ico))
      )
    );
  }

  function DayCol({dk}){
    const evts=(events[dk]||[]).slice().sort((a,b)=>slotIdx(a.h,a.half||false)-slotIdx(b.h,b.half||false));
    return React.createElement('div',{
      style:{position:'relative',borderLeft:'1px solid #e5e5e5',flex:1,minWidth:0},
      onDragOver:e=>e.preventDefault(),
      onDrop:e=>{e.preventDefault();if(dragEvt&&dragEvt.type==='new')handleDrop(dk,8,false);}
    },
      ...SLOTS.map((s,i)=>React.createElement('div',{
        key:i,
        style:{height:SH,borderBottom:s.half?'1px dashed #eee':'1px solid #e5e5e5',cursor:'pointer',background:dragOver===`${dk}_${s.h}_${s.half}`?'#d4f5e9':'transparent'},
        onDragOver:e=>{e.preventDefault();e.stopPropagation();setDragOver(`${dk}_${s.h}_${s.half}`);},
        onDragLeave:()=>setDragOver(null),
        onDrop:e=>{e.preventDefault();e.stopPropagation();handleDrop(dk,s.h,s.half);},
        onClick:()=>!dragEvt&&setModal({dk,evtId:null,cat:'platzi',note:'',h:s.h,half:s.half,dur:2,color:'#1D9E75',rep:'none',repDays:[false,false,false,false,false,false,false],notif:0})
      })),
      ...evts.map(ev=>React.createElement(EvBlock,{key:ev.id,ev,dk}))
    );
  }

  const overlayStyle={position:'fixed',inset:0,background:'rgba(0,0,0,0.5)',zIndex:9999,display:'flex',alignItems:'center',justifyContent:'center',padding:16};
  const cardStyle={background:'#fff',borderRadius:12,border:'1px solid #e5e5e5',padding:16,width:'100%',maxWidth:320,maxHeight:'85vh',overflowY:'auto',WebkitOverflowScrolling:'touch'};
  const btnBase={fontFamily:'system-ui',border:'1px solid #e5e5e5',background:'transparent',color:'#1a1a1a',borderRadius:8,padding:'6px 12px',cursor:'pointer',fontSize:12};

  if(!loaded) return React.createElement('div',{style:{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',minHeight:'100vh',gap:12,color:'#666',fontSize:14}},
    React.createElement('div',{style:{width:28,height:28,border:'3px solid #eee',borderTopColor:'#1D9E75',borderRadius:'50%',animation:'spin 0.8s linear infinite'}}),
    React.createElement('span',null,'Cargando tu cronograma...'),
    React.createElement('style',null,'@keyframes spin{to{transform:rotate(360deg)}}')
  );

  return React.createElement('div',{style:{padding:'12px',fontFamily:'system-ui',minHeight:'100vh',background:'#f5f5f3',maxWidth:900,margin:'0 auto'}},
    React.createElement('style',null,'@keyframes spin{to{transform:rotate(360deg)}} *{box-sizing:border-box}'),

    // Notif banner si no está activado
    !notifGranted&&'Notification' in window&&React.createElement('div',{style:{display:'flex',alignItems:'center',gap:8,padding:'8px 12px',background:'#FFF8E1',borderRadius:8,border:'1px solid #FFD54F',marginBottom:10,fontSize:12,color:'#5D4037'}},
      React.createElement('span',{style:{flex:1}},'🔔 Activa las notificaciones para recibir alertas antes de tus actividades'),
      React.createElement('button',{onClick:enableNotifications,style:{...btnBase,background:'#FF8F00',color:'#fff',border:'none',fontSize:11,padding:'4px 10px'}},'Activar')
    ),

    // Sync bar
    React.createElement('div',{style:{display:'flex',alignItems:'center',gap:6,padding:'6px 12px',background:'#fff',borderRadius:8,border:'1px solid #e5e5e5',marginBottom:10,fontSize:11,color:'#666'}},
      React.createElement('div',{style:{width:7,height:7,borderRadius:'50%',background:sync.dot,flexShrink:0}}),
      React.createElement('span',{style:{flex:1}},sync.msg),
      React.createElement('button',{onClick:()=>setShowRepMgr(true),style:{...btnBase,fontSize:10,padding:'2px 8px',color:'#666'}},`↻ Repeticiones (${repIds.length})`)
    ),

    // Header
    React.createElement('div',{style:{padding:'12px 16px',background:'#fff',borderRadius:12,border:'1px solid #e5e5e5',marginBottom:10,display:'flex',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:8}},
      React.createElement('div',null,
        React.createElement('div',{style:{fontSize:18,fontWeight:500}},`${DAYS_ES[td.getDay()]}, ${td.getDate()} de ${MON_ES[td.getMonth()]} ${td.getFullYear()}`),
        React.createElement('div',{style:{fontSize:11,color:'#888',marginTop:2}},`Hoy tienes ${(events[dateKey(td)]||[]).length} actividad(es)`)
      ),
      React.createElement('div',{style:{display:'flex',gap:6,alignItems:'center'}},
        React.createElement('div',{style:{width:65,background:'#eee',borderRadius:99,height:5,overflow:'hidden'}},
          React.createElement('div',{style:{height:'100%',width:`${pct}%`,background:'#1D9E75',borderRadius:99}})
        ),
        React.createElement('span',{style:{fontSize:11,color:'#888'}},`${pct}% listo`)
      )
    ),

    // View/Nav
    React.createElement('div',{style:{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:10,gap:8,flexWrap:'wrap'}},
      React.createElement('div',{style:{display:'flex',gap:4}},
        ['day','week'].map(v=>React.createElement('button',{key:v,onClick:()=>setView(v),style:{...btnBase,background:view===v?'#1a1a1a':'transparent',color:view===v?'#fff':'#666'}},v==='day'?'Dia':'Semana'))
      ),
      React.createElement('div',{style:{display:'flex',alignItems:'center',gap:6}},
        React.createElement('button',{onClick:()=>setCursor(addDays(cursor,view==='day'?-1:-7)),style:btnBase},'←'),
        React.createElement('span',{style:{fontSize:12,fontWeight:500,minWidth:110,textAlign:'center'}},
          view==='day'?(dateKey(cursor)===dateKey(td)?'Hoy':DAYS_SH[cursor.getDay()]+' '+cursor.getDate()+' '+MON_SH[cursor.getMonth()]):(getWeekDays(cursor)[0].getDate()+' '+MON_SH[getWeekDays(cursor)[0].getMonth()]+' — '+getWeekDays(cursor)[6].getDate()+' '+MON_SH[getWeekDays(cursor)[6].getMonth()])
        ),
        React.createElement('button',{onClick:()=>setCursor(addDays(cursor,view==='day'?1:7)),style:btnBase},'→')
      )
    ),

    // Main grid
    React.createElement('div',{style:{display:'grid',gridTemplateColumns:'160px 1fr',gap:10}},
      // Sidebar
      React.createElement('div',{style:{display:'flex',flexDirection:'column',gap:5}},
        React.createElement('div',{style:{fontSize:10,fontWeight:600,color:'#999',textTransform:'uppercase',letterSpacing:'0.05em'}},'Actividades'),
        ...cats.map(c=>React.createElement('div',{key:c.id,draggable:true,onDragStart:()=>setDragEvt({type:'new',catId:c.id}),
          onClick:()=>setModal({dk:dateKey(cursor),evtId:null,cat:c.id,note:'',h:8,half:false,dur:2,color:c.color,rep:'none',repDays:[false,false,false,false,false,false,false],notif:0}),
          style:{display:'flex',alignItems:'center',gap:7,padding:'7px 10px',borderRadius:8,border:`1px solid ${c.color}55`,cursor:'grab',fontSize:12,fontWeight:500,userSelect:'none',background:c.bg,color:c.text}},
          React.createElement('div',{style:{width:8,height:8,borderRadius:'50%',background:c.color,flexShrink:0}}),c.name
        )),
        React.createElement('button',{onClick:()=>setShowNCF(!showNCF),style:{...btnBase,fontSize:11,padding:5,border:'1px dashed #ccc',color:'#888'}},'+ Nueva categoria'),
        showNCF&&React.createElement('div',{style:{background:'#f9f9f9',borderRadius:8,padding:10,border:'1px solid #eee'}},
          React.createElement(Lbl,{t:'Nombre'}),
          React.createElement(Inp,{val:ncName,onChange:setNcName,ph:'Mi actividad...'}),
          React.createElement(Lbl,{t:'Color'}),
          React.createElement('div',{style:{display:'flex',alignItems:'center',gap:8,marginTop:4,marginBottom:8}},
            React.createElement('div',{style:{width:26,height:26,borderRadius:'50%',background:ncColor,border:'1px solid #ccc',flexShrink:0}}),
            React.createElement('input',{type:'color',value:ncColor,onChange:e=>setNcColor(e.target.value),style:{flex:1,height:28,padding:0,border:'none',background:'none',cursor:'pointer'}})
          ),
          React.createElement('button',{onClick:createCat,style:{...btnBase,width:'100%',fontSize:11,padding:6}},'Crear')
        ),
        React.createElement('div',{style:{background:'#f9f9f9',borderRadius:8,padding:10,border:'1px solid #eee',marginTop:2}},
          React.createElement(Lbl,{t:'Categoria'}),
          React.createElement(Sel,{val:form.cat,onChange:v=>setForm(f=>({...f,cat:v})),opts:cats.map(c=>[c.id,c.name])}),
          React.createElement(Lbl,{t:'Nota'}),
          React.createElement(Inp,{val:form.note,onChange:v=>setForm(f=>({...f,note:v})),ph:'Descripcion...'}),
          React.createElement(Lbl,{t:'Hora'}),
          React.createElement(Sel,{val:form.hour,onChange:v=>setForm(f=>({...f,hour:v})),opts:SLOTS.map(s=>[`${s.h}_${s.half?1:0}`,fmtH(s.h,s.half)])}),
          React.createElement(Lbl,{t:'Duracion'}),
          React.createElement(Sel,{val:form.dur,onChange:v=>setForm(f=>({...f,dur:parseInt(v)})),opts:[[1,'30 min'],[2,'1 hora'],[3,'1.5h'],[4,'2 horas'],[6,'3 horas'],[8,'4 horas']]}),
          React.createElement(Lbl,{t:'Repetir'}),
          React.createElement(Sel,{val:form.rep,onChange:v=>setForm(f=>({...f,rep:v})),opts:[['none','Sin repeticion'],['daily','Todos los dias'],['weekdays','Dias laborales'],['weekend','Fines de semana'],['custom','Dias especificos...']]}),
          form.rep==='custom'&&React.createElement(RepGrid,{days:form.repDays,toggle:i=>setForm(f=>({...f,repDays:f.repDays.map((v,j)=>j===i?!v:v)}))}),
          React.createElement('button',{onClick:addFromForm,style:{...btnBase,width:'100%',fontSize:12,padding:6,marginTop:8}},'+ Agregar')
        ),
        React.createElement('button',{onClick:()=>setShowSum(!showSum),style:{...btnBase,fontSize:11,padding:'7px 10px'}},'Ver resumen ↗')
      ),

      // Calendar
      React.createElement('div',{style:{background:'#fff',border:'1px solid #e5e5e5',borderRadius:12,overflow:'hidden'}},
        view==='week'&&React.createElement('div',{style:{display:'grid',gridTemplateColumns:`44px repeat(7,1fr)`,borderBottom:'1px solid #e5e5e5'}},
          React.createElement('div',null),
          ...weekDays.map(d=>{const isT=dateKey(d)===dateKey(td);return React.createElement('div',{key:dateKey(d),style:{padding:'5px 3px',textAlign:'center',fontSize:10,color:isT?'#1D9E75':'#999',borderLeft:'1px solid #e5e5e5'}},
            React.createElement('div',null,DAYS_SH[d.getDay()]),
            React.createElement('div',{style:{fontSize:13,fontWeight:500,background:isT?'#1D9E75':'transparent',color:isT?'#fff':'#1a1a1a',borderRadius:'50%',width:22,height:22,display:'flex',alignItems:'center',justifyContent:'center',margin:'2px auto 0'}},d.getDate())
          );})
        ),
        React.createElement('div',{style:{display:'grid',gridTemplateColumns:view==='day'?'44px 1fr':`44px repeat(7,1fr)`}},
          React.createElement('div',{style:{display:'flex',flexDirection:'column'}},
            ...SLOTS.map((s,i)=>React.createElement('div',{key:i,style:{height:SH,display:'flex',alignItems:'flex-start',justifyContent:'flex-end',padding:'1px 4px 0 0',fontSize:9,color:'#bbb',flexShrink:0}},!s.half?fmtH(s.h,false):''))
          ),
          ...(view==='day'?[React.createElement(DayCol,{key:dateKey(cursor),dk:dateKey(cursor)})]:weekDays.map(d=>React.createElement(DayCol,{key:dateKey(d),dk:dateKey(d)})))
        )
      )
    ),

    // Summary
    showSum&&React.createElement('div',{style:{marginTop:12,background:'#fff',borderRadius:12,border:'1px solid #e5e5e5',padding:14}},
      React.createElement('div',{style:{fontSize:13,fontWeight:500,marginBottom:10}},'Resumen de progreso'),
      React.createElement('div',{style:{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:6,marginBottom:10}},
        ...[['Actividades',sTotal],['Completadas',sDone],['Cumplimiento',sPct+'%'],['Horas plan.',tH.toFixed(1)+'h'],['Horas comp.',dH.toFixed(1)+'h'],['Pendientes',sTotal-sDone]].map(([l,v])=>
          React.createElement('div',{key:l,style:{background:'#f9f9f9',borderRadius:8,padding:'7px 10px',border:'1px solid #eee'}},
            React.createElement('div',{style:{fontSize:9,color:'#999',marginBottom:1}},l),
            React.createElement('div',{style:{fontSize:17,fontWeight:500}},v)
          )
        )
      ),
      ...catStats.map(c=>React.createElement('div',{key:c.id,style:{display:'flex',alignItems:'center',gap:6,fontSize:11,marginBottom:4}},
        React.createElement('span',{style:{minWidth:72,color:c.text}},c.name),
        React.createElement('div',{style:{flex:1,height:4,background:'#eee',borderRadius:99,overflow:'hidden'}},
          React.createElement('div',{style:{height:'100%',width:`${catStats[0]?.hrs?Math.round(c.hrs/catStats[0].hrs*100):0}%`,background:c.color,borderRadius:99}})
        ),
        React.createElement('span',{style:{minWidth:60,textAlign:'right',color:'#999',fontSize:11}},`${c.hrs.toFixed(1)}h · ${c.done}/${c.count}`)
      )),
      React.createElement('button',{onClick:()=>setShowSum(false),style:{...btnBase,marginTop:10,fontSize:11,padding:'5px 12px'}},'Cerrar')
    ),

    // Rep Manager
    showRepMgr&&React.createElement('div',{onClick:e=>{if(e.target===e.currentTarget)setShowRepMgr(false);},style:overlayStyle},
      React.createElement('div',{style:cardStyle},
        React.createElement('div',{style:{fontSize:14,fontWeight:500,marginBottom:4}},'↻ Gestionar repeticiones'),
        React.createElement('div',{style:{fontSize:11,color:'#888',marginBottom:12}},'Elimina todas las ocurrencias de un solo toque.'),
        repIds.length===0
          ?React.createElement('div',{style:{fontSize:12,color:'#999',textAlign:'center',padding:'20px 0'}},'No hay repeticiones activas.')
          :React.createElement(React.Fragment,null,...repIds.map(r=>{
            const c=catById(r.cat),dl={1:'30m',2:'1h',3:'1.5h',4:'2h',6:'3h',8:'4h'}[r.dur]||'';
            return React.createElement('div',{key:r.repId,style:{display:'flex',alignItems:'center',gap:8,padding:'8px 10px',borderRadius:8,border:`1px solid ${c.color}44`,background:c.bg,marginBottom:6}},
              React.createElement('div',{style:{width:8,height:8,borderRadius:'50%',background:c.color,flexShrink:0}}),
              React.createElement('div',{style:{flex:1}},
                React.createElement('div',{style:{fontSize:12,fontWeight:500,color:c.text}},c.name),
                React.createElement('div',{style:{fontSize:10,color:c.text,opacity:0.7}},`${fmtH(r.h,r.half||false)} · ${dl} · ${r.count} ocurrencias`)
              ),
              React.createElement('button',{onClick:()=>deleteRepId(r.repId),style:{fontSize:10,padding:'3px 8px',border:`1px solid ${c.color}`,borderRadius:6,background:'transparent',color:c.text,cursor:'pointer',flexShrink:0}},'Borrar todas')
            );
          })),
        React.createElement('button',{onClick:()=>setShowRepMgr(false),style:{...btnBase,width:'100%',marginTop:8,fontSize:12,padding:'6px 0'}},'Cerrar')
      )
    ),

    // Event Modal
    modal&&React.createElement('div',{onClick:e=>{if(e.target===e.currentTarget)setModal(null);},style:overlayStyle},
      React.createElement('div',{style:cardStyle},
        React.createElement('div',{style:{fontSize:14,fontWeight:500,marginBottom:10}},modal.evtId?'Editar actividad':'Nueva actividad'),
        React.createElement(Lbl,{t:'Categoria'}),
        React.createElement(Sel,{val:modal.cat,onChange:v=>setModal({...modal,cat:v,color:catById(v).color}),opts:cats.map(c=>[c.id,c.name])}),
        React.createElement(Lbl,{t:'Color'}),
        React.createElement('div',{style:{display:'flex',alignItems:'center',gap:8,marginTop:4}},
          React.createElement('div',{style:{width:26,height:26,borderRadius:'50%',background:modal.color,border:'1px solid #ccc',flexShrink:0}}),
          React.createElement('input',{type:'color',value:modal.color,onChange:e=>setModal({...modal,color:e.target.value}),style:{flex:1,height:28,padding:0,border:'none',background:'none',cursor:'pointer'}}),
          React.createElement('button',{onClick:()=>setModal({...modal,color:catById(modal.cat).color}),style:{...btnBase,fontSize:10,padding:'3px 8px'}},'Reset')
        ),
        React.createElement(Lbl,{t:'Nota'}),
        React.createElement(Inp,{val:modal.note,onChange:v=>setModal({...modal,note:v}),ph:'Descripcion...'}),
        React.createElement(Lbl,{t:'Hora'}),
        React.createElement(Sel,{val:`${modal.h}_${modal.half?1:0}`,onChange:v=>{const[h,hf]=v.split('_');setModal({...modal,h:parseInt(h),half:hf==='1'});},opts:SLOTS.map(s=>[`${s.h}_${s.half?1:0}`,fmtH(s.h,s.half)])}),
        React.createElement(Lbl,{t:'Duracion'}),
        React.createElement(Sel,{val:modal.dur,onChange:v=>setModal({...modal,dur:parseInt(v)}),opts:[[1,'30 min'],[2,'1 hora'],[3,'1.5h'],[4,'2 horas'],[6,'3 horas'],[8,'4 horas']]}),
        React.createElement(Lbl,{t:'🔔 Notificarme antes'}),
        React.createElement(Sel,{val:modal.notif||0,onChange:v=>setModal({...modal,notif:parseInt(v)}),opts:[[0,'Sin notificacion'],[5,'5 minutos antes'],[10,'10 minutos antes'],[15,'15 minutos antes'],[30,'30 minutos antes'],[60,'1 hora antes']]}),
        !modal.evtId&&React.createElement(React.Fragment,null,
          React.createElement(Lbl,{t:'Repeticion'}),
          React.createElement(Sel,{val:modal.rep,onChange:v=>setModal({...modal,rep:v}),opts:[['none','Sin repeticion'],['daily','Todos los dias'],['weekdays','Dias laborales'],['weekend','Fines de semana'],['custom','Dias especificos...']]}),
          modal.rep==='custom'&&React.createElement(RepGrid,{days:modal.repDays,toggle:i=>setModal({...modal,repDays:modal.repDays.map((v,j)=>j===i?!v:v)})})
        ),
        React.createElement('div',{style:{display:'flex',gap:8,marginTop:14}},
          React.createElement('button',{onClick:()=>setModal(null),style:{...btnBase,flex:1,padding:'7px 0'}},'Cancelar'),
          React.createElement('button',{onClick:saveModal,style:{...btnBase,flex:1,padding:'7px 0',background:'#1a1a1a',color:'#fff',border:'none'}},'Guardar')
        )
      )
    )
  );
}
ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(App));
