const SUPABASE_URL = 'https://dlssdjsifskthcywhoob.supabase.co';
const SUPABASE_KEY = 'sb_publishable_knmsHYYiwCzGxgQbPt7F4w_vune2eYW';
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
const USER_ID = 'adrian_cronograma';

// Ajuste visual y de horario: HE=24 para que el día termine a las 11:30 PM
const SH=30,HS=6,HE=24;
const SLOTS=[];
for(let h=HS;h<HE;h++){SLOTS.push({h,half:false});SLOTS.push({h,half:true});}
const DAYS_ES=['Domingo','Lunes','Martes','Miercoles','Jueves','Viernes','Sabado'];
const DAYS_SH=['Dom','Lun','Mar','Mie','Jue','Vie','Sab'];
const MON_ES=['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
const MON_SH=['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
const PROJECT_CATS=[
  {id:'movimiento',name:'Movimiento Real',color:'#0F766E',bg:'#CCFBF1',text:'#134E4A'},
  {id:'exploracion',name:'Exploracion negocio',color:'#C2410C',bg:'#FFEDD5',text:'#7C2D12'},
  {id:'platzi',name:'Platzi',color:'#1D9E75',bg:'#E1F5EE',text:'#085041'},
  {id:'utel',name:'UTEL',color:'#6D28D9',bg:'#EDE9FE',text:'#4C1D95'},
  {id:'admin',name:'Mis Notas',color:'#A16207',bg:'#FEF3C7',text:'#78350F'},
  {id:'mente',name:'Nutrir mente',color:'#7F77DD',bg:'#EEEDFE',text:'#26215C'},
  {id:'ejercicio',name:'Ejercicio',color:'#639922',bg:'#EAF3DE',text:'#173404'},
  {id:'trabajo',name:'Trabajo actual',color:'#378ADD',bg:'#E6F1FB',text:'#042C53'},
  {id:'reset',name:'Reset',color:'#888780',bg:'#F1EFE8',text:'#2C2C2A'},
  {id:'vida',name:'Vida personal',color:'#D4537E',bg:'#FBEAF0',text:'#4B1528'},
  {id:'revision',name:'Revision semanal',color:'#475569',bg:'#E2E8F0',text:'#1E293B'},
];
const DEFAULT_CATS=PROJECT_CATS;
const PLANNER_ID='movimiento-real-v1';
const APP_VERSION='V1.2';
const PLAN_START_MIN=8*60+30;
const PLAN_END_MIN=22*60+30;

function mergeProjectCats(saved=[]){
  const byId=new Map((saved||[]).map(c=>[c.id,c]));
  const ids=new Set(PROJECT_CATS.map(c=>c.id));
  const merged=PROJECT_CATS.map(c=>({...c,...(byId.get(c.id)||{}),name:c.name}));
  const extras=(saved||[]).filter(c=>!ids.has(c.id)&&c.id!=='notas');
  return [...merged,...extras];
}

const FIXED_ANCHORS=[
  {id:'reunion_lunes',cat:'trabajo',note:'Reunion de trabajo actual',dow:1,h:10,half:false,dur:2},
  {id:'oficina_martes',cat:'trabajo',note:'Oficina',dow:2,h:10,half:false,dur:10},
  {id:'oficina_jueves',cat:'trabajo',note:'Oficina',dow:4,h:10,half:false,dur:10},
  {id:'partido_jueves',cat:'ejercicio',note:'Partido de futbol',dow:4,h:19,half:false,dur:3},
];

const WEEKLY_TEMPLATES=[
  {id:'balon_lunes',cat:'ejercicio',note:'Manejo de balon',count:1,dur:2,allowedDays:[1],priority:8,intensity:'medium',minStart:8*60+30,maxEnd:9*60+30,preferredStart:8*60+30},
  {id:'gym_miercoles',cat:'ejercicio',note:'Sesion de gym',count:1,dur:3,allowedDays:[3],priority:8,intensity:'medium',minStart:8*60+30,maxEnd:10*60,preferredStart:8*60+30},
  {id:'gym_sabado',cat:'ejercicio',note:'Sesion de gym',count:1,dur:3,allowedDays:[6],priority:8,intensity:'medium',minStart:8*60+30,maxEnd:10*60,preferredStart:8*60+30},
  {id:'cardio_domingo',cat:'ejercicio',note:'Cardio estatico',count:1,dur:2,allowedDays:[0],priority:8,intensity:'medium',minStart:8*60+30,maxEnd:10*60,preferredStart:8*60+30},
  {id:'mr_oferta',cat:'movimiento',note:'Terminar oferta suficientemente buena para mostrar',count:1,dur:3,allowedDays:[1,2,3,4,5],priority:10,intensity:'high'},
  {id:'mr_construccion',cat:'movimiento',note:'Construir activo del sistema comercial',count:2,dur:2,allowedDays:[1,2,3,4,5,6],priority:9,intensity:'high'},
  {id:'mr_externa',cat:'movimiento',note:'Accion externa: avanzar 10 prospectos / 5 contactos / 2 seguimientos',count:2,dur:2,allowedDays:[1,2,3,4,5,6],priority:10,intensity:'high',metric:'external'},
  {id:'exploracion',cat:'exploracion',note:'Validar oportunidad (ej. drones): demanda, costos y numeros',count:1,dur:3,allowedDays:[1,2,3,4,5,6],priority:6,intensity:'high'},
  {id:'platzi',cat:'platzi',note:'Platzi: cerrar curso actual y avanzar al certificado',count:5,dur:2,allowedDays:[1,2,3,4,5,6,0],priority:7,intensity:'medium',maxPerDay:1},
  {id:'utel_revision',cat:'utel',note:'Revisar aula: clases, examenes y fechas',count:1,dur:1,allowedDays:[0],priority:9,intensity:'low'},
  {id:'utel_bloque',cat:'utel',note:'UTEL: examen / actividad / clase',count:2,dur:2,allowedDays:[1,2,3,4,5,6],priority:8,intensity:'high',maxPerDay:1},
  {id:'admin',cat:'admin',note:'Mis Notas: revisar pendientes, tramites, papeleo o ajustes de la app',count:3,dur:2,allowedDays:[1,2,3,4,5,6],priority:7,intensity:'medium',maxPerDay:1},
  {id:'mente',cat:'mente',note:'Nutrir mente + guardar 1 idea util',count:5,dur:1,allowedDays:[1,2,3,4,5,6,0],priority:5,intensity:'low',maxPerDay:1,preferredStart:19*60},
  {id:'reset',cat:'reset',note:'Reset: sin trabajo ni productividad',count:7,dur:1,allowedDays:[1,2,3,4,5,6,0],priority:8,intensity:'low',maxPerDay:1,preferredStart:15*60},
  {id:'vida',cat:'vida',note:'Tiempo personal / pareja / familia sin trabajo',count:2,dur:3,allowedDays:[5,6,0,1,2,3,4],priority:3,intensity:'low',maxPerDay:1,preferredStart:18*60},
  {id:'revision',cat:'revision',note:'Revisar semana + programar la siguiente',count:1,dur:2,allowedDays:[0],priority:10,intensity:'medium',preferredStart:18*60},
];

const WEEKLY_GOALS=[
  {id:'movimiento',label:'Movimiento Real',defaultTarget:5,match:e=>e.cat==='movimiento'},
  {id:'external',label:'Acciones externas',defaultTarget:2,match:e=>e.metric==='external'},
  {id:'platzi',label:'Platzi',defaultTarget:5,match:e=>e.cat==='platzi'},
  {id:'utel',label:'UTEL',defaultTarget:3,match:e=>e.cat==='utel'},
  {id:'admin',label:'Mis Notas',defaultTarget:3,match:e=>e.cat==='admin'},
  {id:'mente',label:'Nutrir mente',defaultTarget:5,match:e=>e.cat==='mente'},
  {id:'reset',label:'Reset',defaultTarget:7,match:e=>e.cat==='reset'},
  {id:'ejercicio',label:'Ejercicio',defaultTarget:5,match:e=>e.cat==='ejercicio'},
  {id:'exploracion',label:'Exploracion negocio',defaultTarget:1,match:e=>e.cat==='exploracion'},
  {id:'revision',label:'Revision semanal',defaultTarget:1,match:e=>e.cat==='revision'},
];
const DEFAULT_GOAL_TARGETS=Object.fromEntries(WEEKLY_GOALS.map(g=>[g.id,g.defaultTarget]));

const DEFAULT_MANUAL_MISSIONS=[
  {id:'certificado_platzi',text:'Conseguir 1 certificado Platzi',done:false},
  {id:'oferta_usable',text:'Dejar una oferta usable lista para mostrar',done:false},
  {id:'prospectos_10',text:'Identificar 10 prospectos',done:false},
  {id:'contactos_5',text:'Realizar 5 contactos reales',done:false},
  {id:'seguimientos_2',text:'Hacer 2 seguimientos',done:false},
];
function freshDefaultMissions(){return DEFAULT_MANUAL_MISSIONS.map(m=>({...m}));}
function weekKeyFromDate(d){return dateKey(getWeekDays(d)[0]);}

function today(){let d=new Date();d.setHours(0,0,0,0);return d;}
function dateKey(d){ return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
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

function slotToMinutes(h,half){return h*60+(half?30:0);}
function minutesToSlot(m){const h=Math.floor(m/60),half=(m%60)>=30;return{h,half};}
function eventEndMinutes(ev){return slotToMinutes(ev.h,ev.half||false)+(ev.dur||1)*30;}
function overlaps(aStart,aEnd,bStart,bEnd){return aStart<bEnd&&bStart<aEnd;}
function cloneEventsMap(src){
  const out={};
  Object.entries(src||{}).forEach(([dk,arr])=>{out[dk]=(arr||[]).map(e=>({...e}));});
  return out;
}
function dateForDow(weekDays,dow){return weekDays.find(d=>d.getDay()===dow);}
function isFreeAt(evMap,dk,startMin,dur){
  const endMin=startMin+dur*30;
  return !(evMap[dk]||[]).some(ev=>{
    const buffer=ev.fixed?30:0; // deja aire antes/despues de compromisos fijos
    return overlaps(startMin,endMin,slotToMinutes(ev.h,ev.half||false)-buffer,eventEndMinutes(ev)+buffer);
  });
}
function countHoursForDay(evMap,dk){return (evMap[dk]||[]).reduce((s,e)=>s+(e.dur||1)*0.5,0);}
function countTemplateForDay(evMap,dk,templateId){return (evMap[dk]||[]).filter(e=>e.templateId===templateId).length;}
function countIntensityForDay(evMap,dk,intensity){return (evMap[dk]||[]).filter(e=>e.intensity===intensity).length;}
function shuffled(arr){return arr.map(v=>({v,r:Math.random()})).sort((a,b)=>a.r-b.r).map(x=>x.v);}
function migrateLegacyEvents(src){
  const out=cloneEventsMap(src||{});
  Object.keys(out).forEach(dk=>{
    out[dk]=out[dk].map(e=>e.cat==='notas'?{...e,cat:'admin'}:e);
  });
  return out;
}

// LECTOR DE ARCHIVOS .ICS DE GOOGLE CALENDAR
function parseICSTime(str) {
  const y = parseInt(str.substring(0,4));
  const m = parseInt(str.substring(4,6)) - 1;
  const d = parseInt(str.substring(6,8));
  const h = parseInt(str.substring(9,11));
  const min = parseInt(str.substring(11,13));
  // Si termina en Z es UTC, sino usamos hora local de forma segura
  if (str.endsWith('Z')) { return new Date(Date.UTC(y, m, d, h, min)); }
  return new Date(y, m, d, h, min);
}

function parseICS(icsData) {
  const lines = icsData.split(/\r\n|\n|\r/);
  const events = [];
  let currentEvent = null;
  
  // Para no saturar, solo traemos eventos desde hace 30 días en adelante
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  lines.forEach(line => {
    if (line.startsWith('BEGIN:VEVENT')) {
      currentEvent = {};
    } else if (line.startsWith('END:VEVENT')) {
      // Solo guardamos si tiene inicio, fin (no es de todo el día) y no es muy viejo
      if (currentEvent && currentEvent.start && currentEvent.end && currentEvent.start > thirtyDaysAgo) {
        events.push(currentEvent);
      }
      currentEvent = null;
    } else if (currentEvent) {
      if (line.startsWith('SUMMARY:')) {
        currentEvent.summary = line.substring(8);
      } else if (line.startsWith('DTSTART')) {
        const match = line.match(/:(\d{8}T\d{6}Z?)/);
        if (match) currentEvent.start = parseICSTime(match[1]);
      } else if (line.startsWith('DTEND')) {
        const match = line.match(/:(\d{8}T\d{6}Z?)/);
        if (match) currentEvent.end = parseICSTime(match[1]);
      }
    }
  });
  return events.sort((a, b) => a.start - b.start);
}

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
  if(error||!data) return{events:{},cats:mergeProjectCats(DEFAULT_CATS),goals:{...DEFAULT_GOAL_TARGETS},weeklyMissions:{}};
  const result={events:{},cats:mergeProjectCats(DEFAULT_CATS),goals:{...DEFAULT_GOAL_TARGETS},weeklyMissions:{}};
  data.forEach(row=>{
    if(row.key==='events') try{result.events=JSON.parse(row.value);}catch(e){}
    if(row.key==='cats') try{result.cats=mergeProjectCats(JSON.parse(row.value));}catch(e){}
    if(row.key==='goals') try{result.goals={...DEFAULT_GOAL_TARGETS,...JSON.parse(row.value)};}catch(e){}
    if(row.key==='weeklyMissions') try{result.weeklyMissions=JSON.parse(row.value)||{};}catch(e){}
  });
  result.events=migrateLegacyEvents(result.events);
  result.cats=mergeProjectCats(result.cats);
  result.goals={...DEFAULT_GOAL_TARGETS,...result.goals};
  result.weeklyMissions=result.weeklyMissions||{};
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

const bi={width:'100%',fontSize:13,padding:'5px 7px',fontFamily:'system-ui',border:'1px solid #ccc',borderRadius:8,background:'#fff',color:'#1a1a1a',marginBottom:0,boxSizing:'border-box'};
const Lbl=({t})=>React.createElement('label',{style:{fontSize:11,color:'#666',display:'block',marginBottom:3,marginTop:10}},t);
const Sel=({val,onChange,opts})=>React.createElement('select',{value:val,onChange:e=>onChange(e.target.value),style:bi},opts.map(([v,l])=>React.createElement('option',{key:v,value:v},l)));
const Inp=({val,onChange,ph})=>React.createElement('input',{value:val,onChange:e=>onChange(e.target.value),placeholder:ph,style:bi});
const InpDate=({val,onChange})=>React.createElement('input',{type:'date',value:val,onChange:e=>onChange(e.target.value),style:bi});
const RepGrid=({days,toggle})=>React.createElement('div',{style:{display:'grid',gridTemplateColumns:'repeat(7,1fr)',gap:3,marginTop:6}},
  DAYS_SH.map((d,i)=>React.createElement('div',{key:i,onClick:()=>toggle(i),style:{padding:'4px 0',textAlign:'center',fontSize:10,border:'1px solid #ccc',borderRadius:4,cursor:'pointer',background:days[i]?'#1a1a1a':'transparent',color:days[i]?'#fff':'#666'}},d))
);

function App(){
  const [cats,setCats]=useState(DEFAULT_CATS);
  const [events,setEvents]=useState({});
  const [view,setView]=useState('day');
  const [cursor,setCursor]=useState(today());
  const [sync,setSync]=useState({dot:'#BA7517',msg:'Cargando...'});
  const [loaded,setLoaded]=useState(false);
  const [modal,setModal]=useState(null);
  const [importModal,setImportModal]=useState(null); // Nuevo estado para la ventana de aprobación
  const [showNCF,setShowNCF]=useState(false);
  const [showSum,setShowSum]=useState(false);
  const [editGoals,setEditGoals]=useState(false);
  const [editMissions,setEditMissions]=useState(false);
  const [weeklyMissions,setWeeklyMissions]=useState({});
  const [newMissionText,setNewMissionText]=useState('');
  const [celebration,setCelebration]=useState(null);
  const [showCatColors,setShowCatColors]=useState(false);
  const [showRepMgr,setShowRepMgr]=useState(false);
  const [plannerMsg,setPlannerMsg]=useState('');
  const [goalTargets,setGoalTargets]=useState({...DEFAULT_GOAL_TARGETS});
  const [notifGranted,setNotifGranted]=useState(false);
  const [ncName,setNcName]=useState('');
  const [ncColor,setNcColor]=useState('#7F77DD');
  
  const [form,setForm]=useState({cat:'movimiento',date:dateKey(today()),note:'',hour:'8_0',dur:2,rep:'none',repDays:[false,false,false,false,false,false,false]});
  
  const [dragEvt,setDragEvt]=useState(null);
  const [dragOver,setDragOver]=useState(null);
  const saveTimer=useRef(null);

  useEffect(()=>{
    (async()=>{
      try{
        const data=await loadFromDB();
        setEvents(data.events);
        setCats(data.cats);
        setGoalTargets(data.goals||{...DEFAULT_GOAL_TARGETS});
        setWeeklyMissions(data.weeklyMissions||{});
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

  useEffect(() => {
    setForm(f => ({ ...f, date: dateKey(cursor) }));
  }, [cursor]);

  function scheduleSave(evts,ct,goals=goalTargets){
    if(saveTimer.current) clearTimeout(saveTimer.current);
    setSync({dot:'#BA7517',msg:'Guardando...'});
    saveTimer.current=setTimeout(async()=>{
      try{
        await Promise.all([saveToDB('events',evts),saveToDB('cats',ct),saveToDB('goals',goals)]);
        const n=new Date();
        setSync({dot:'#1D9E75',msg:`Guardado ${String(n.getHours()).padStart(2,'0')}:${String(n.getMinutes()).padStart(2,'0')}`});
        scheduleEventsNotifications(evts,ct);
      }catch(e){setSync({dot:'#D85A30',msg:'Error al guardar'});}
    },800);
  }

  function setEvts(e){setEvents(e);scheduleSave(e,cats,goalTargets);}
  function setCatsS(c){setCats(c);scheduleSave(events,c,goalTargets);}
  function setGoalTarget(id,value){
    const n=Math.max(0,Math.min(21,parseInt(value,10)||0));
    const next={...goalTargets,[id]:n};
    setGoalTargets(next);
    scheduleSave(events,cats,next);
  }

  function missionsForWeek(wk){
    return (Object.prototype.hasOwnProperty.call(weeklyMissions,wk)?weeklyMissions[wk]:freshDefaultMissions()).map(m=>({...m}));
  }
  async function persistWeeklyMissions(next){
    setWeeklyMissions(next);
    setSync({dot:'#BA7517',msg:'Guardando metas...'});
    try{
      await saveToDB('weeklyMissions',next);
      setSync({dot:'#1D9E75',msg:'Metas guardadas ✓'});
    }catch(e){setSync({dot:'#D85A30',msg:'Error al guardar metas'});}
  }
  function updateMission(wk,id,patch){
    const list=missionsForWeek(wk).map(m=>m.id===id?{...m,...patch}:m);
    persistWeeklyMissions({...weeklyMissions,[wk]:list});
  }
  function toggleMission(wk,id){
    const list=missionsForWeek(wk);
    const current=list.find(m=>m.id===id); if(!current) return;
    const willDone=!current.done;
    const next=list.map(m=>m.id===id?{...m,done:willDone}:m);
    persistWeeklyMissions({...weeklyMissions,[wk]:next});
    if(willDone){
      setCelebration(current.text);
      setTimeout(()=>setCelebration(null),2200);
    }
  }
  function addMission(wk){
    const text=newMissionText.trim(); if(!text) return;
    const list=missionsForWeek(wk);
    const next=[...list,{id:'goal_'+Date.now(),text,done:false}];
    setNewMissionText('');
    persistWeeklyMissions({...weeklyMissions,[wk]:next});
  }
  function deleteMission(wk,id){
    const next=missionsForWeek(wk).filter(m=>m.id!==id);
    persistWeeklyMissions({...weeklyMissions,[wk]:next});
  }

  function updateCategoryColor(id,hex){
    const theme=autoTheme(hex);
    const nextCats=cats.map(c=>c.id===id?{...c,...theme}:c);
    const nextEvents=cloneEventsMap(events);
    Object.keys(nextEvents).forEach(dk=>{
      nextEvents[dk]=nextEvents[dk].map(ev=>{
        if(ev.cat!==id) return ev;
        const copy={...ev}; delete copy.customColor; delete copy.customTheme; return copy;
      });
    });
    setCats(nextCats); setEvents(nextEvents); scheduleSave(nextEvents,nextCats,goalTargets);
  }

  const catById=id=>cats.find(c=>c.id===id)||cats[0];

  function getPlannerWeekDays(){
    const td=today();
    let base=new Date(cursor);
    // Si estamos en el domingo actual, el plan se arma para la semana que empieza manana.
    if(dateKey(base)===dateKey(td)&&base.getDay()===0) base=addDays(base,1);
    return getWeekDays(base);
  }

  function ensureFixedAnchors(base,weekDays){
    const out=cloneEventsMap(base);
    FIXED_ANCHORS.forEach(a=>{
      const d=dateForDow(weekDays,a.dow); if(!d) return;
      const dk=dateKey(d); if(!out[dk]) out[dk]=[];
      const exists=out[dk].some(e=>e.planner===PLANNER_ID&&e.templateId===a.id);
      if(exists) return;
      out[dk]=[...out[dk],{
        id:'mr_fixed_'+Date.now()+'_'+Math.random(),cat:a.cat,note:a.note,h:a.h,half:a.half,dur:a.dur,
        done:false,notif:0,fixed:true,planner:PLANNER_ID,templateId:a.id,tier:'fixed',intensity:'medium'
      }];
    });
    return out;
  }

  function findBestPlannerSlot(evMap,weekDays,tpl){
    const now=new Date();
    const candidates=[];
    weekDays.forEach(d=>{
      if(!tpl.allowedDays.includes(d.getDay())) return;
      const dk=dateKey(d);
      const dayStart=new Date(d); dayStart.setHours(0,0,0,0);
      const todayStart=today();
      if(dayStart<todayStart) return;
      if(tpl.maxPerDay&&countTemplateForDay(evMap,dk,tpl.id)>=tpl.maxPerDay) return;
      const startLimit=Math.max(PLAN_START_MIN,tpl.minStart!==undefined?tpl.minStart:PLAN_START_MIN);
      const endLimit=Math.min(PLAN_END_MIN,tpl.maxEnd!==undefined?tpl.maxEnd:PLAN_END_MIN);
      for(let m=startLimit;m+tpl.dur*30<=endLimit;m+=30){
        const when=new Date(d); when.setHours(Math.floor(m/60),m%60,0,0);
        if(when.getTime()<now.getTime()+10*60*1000) continue;
        if(!isFreeAt(evMap,dk,m,tpl.dur)) continue;
        const dailyHours=countHoursForDay(evMap,dk);
        const sameCat=(evMap[dk]||[]).filter(e=>e.cat===tpl.cat).length;
        const highCount=countIntensityForDay(evMap,dk,'high');
        let score=Math.random()*40;
        score-=dailyHours*4;
        score-=sameCat*8;
        if(tpl.intensity==='high') score-=highCount*18;
        if(tpl.intensity==='high'&&m>=20*60) score-=35;
        if(tpl.cat==='movimiento'&&m>=9*60&&m<=19*60) score+=12;
        if(tpl.metric==='external'&&m>=9*60&&m<=18*60) score+=18;
        if(tpl.preferredStart!==undefined) score-=Math.abs(m-tpl.preferredStart)/30*1.5;
        // Pequena recompensa por repartir la misma actividad en dias distintos.
        score-=countTemplateForDay(evMap,dk,tpl.id)*25;
        candidates.push({dk,m,score});
      }
    });
    if(!candidates.length) return null;
    candidates.sort((a,b)=>b.score-a.score);
    return candidates[0];
  }

  function plannerCountForTemplate(tpl){
    const g=id=>goalTargets[id]!==undefined?goalTargets[id]:DEFAULT_GOAL_TARGETS[id];
    const movement=Math.max(0,g('movimiento'));
    const external=Math.min(Math.max(0,g('external')),movement);
    const offer=movement>external?1:0;
    if(tpl.id==='mr_externa') return external;
    if(tpl.id==='mr_oferta') return offer;
    if(tpl.id==='mr_construccion') return Math.max(0,movement-external-offer);
    if(tpl.id==='platzi') return Math.max(0,g('platzi'));
    if(tpl.id==='utel_revision') return g('utel')>0?1:0;
    if(tpl.id==='utel_bloque') return Math.max(0,g('utel')-1);
    if(tpl.id==='admin') return Math.max(0,g('admin'));
    if(tpl.id==='mente') return Math.max(0,g('mente'));
    if(tpl.id==='reset') return Math.max(0,g('reset'));
    if(tpl.id==='exploracion') return Math.max(0,g('exploracion'));
    if(tpl.id==='revision') return Math.max(0,g('revision'));
    return tpl.count;
  }

  function organizePlannerWeek(reorganize=false){
    const weekDays=getPlannerWeekDays();
    const keys=new Set(weekDays.map(dateKey));
    let ne=cloneEventsMap(events);
    if(reorganize){
      keys.forEach(dk=>{
        if(!ne[dk]) return;
        ne[dk]=ne[dk].filter(e=>!(e.planner===PLANNER_ID&&!e.fixed&&!e.done));
        if(!ne[dk].length) delete ne[dk];
      });
    }
    ne=ensureFixedAnchors(ne,weekDays);
    const unscheduled=[];
    const ordered=[...WEEKLY_TEMPLATES].sort((a,b)=>(b.priority||0)-(a.priority||0));
    ordered.forEach(tpl=>{
      let existing=0;
      weekDays.forEach(d=>{existing+=(ne[dateKey(d)]||[]).filter(e=>e.planner===PLANNER_ID&&e.templateId===tpl.id).length;});
      const need=Math.max(0,plannerCountForTemplate(tpl)-existing);
      for(let i=0;i<need;i++){
        const slot=findBestPlannerSlot(ne,weekDays,tpl);
        if(!slot){unscheduled.push(tpl.note);continue;}
        const sh=minutesToSlot(slot.m);
        if(!ne[slot.dk]) ne[slot.dk]=[];
        ne[slot.dk]=[...ne[slot.dk],{
          id:'mr_auto_'+Date.now()+'_'+Math.random(),cat:tpl.cat,note:tpl.note,h:sh.h,half:sh.half,dur:tpl.dur,
          done:false,notif:0,fixed:false,planner:PLANNER_ID,templateId:tpl.id,tier:'flexible',
          intensity:tpl.intensity||'low',metric:tpl.metric||null,priority:tpl.priority||0
        }];
      }
    });
    setEvts(ne);
    setView('week');
    setCursor(weekDays[0]);
    const start=weekDays[0],end=weekDays[6];
    setPlannerMsg(unscheduled.length
      ?`Semana ${start.getDate()}-${end.getDate()}: organizada, pero quedaron ${unscheduled.length} actividad(es) sin espacio.`
      :`Semana ${start.getDate()}-${end.getDate()}: plan listo. Fijas protegidas y flexibles distribuidas.`);
  }


  function reprogramEvent(dk,id){
    const source=(events[dk]||[]).find(e=>String(e.id)===String(id));
    if(!source){window.alert('No encontre esta actividad.');return;}
    if(source.done){window.alert('La actividad ya esta marcada como completada.');return;}
    if(source.fixed){window.alert('Esta actividad es fija. Desmarca “Fijar actividad” si quieres moverla.');return;}

    const baseDate=new Date(dk+'T12:00:00');
    const week=getWeekDays(baseDate);
    const currentWeekKey=weekKeyFromDate(today());
    if(dateKey(week[0])<currentWeekKey){window.alert('Esta semana ya termino. Mueve la actividad manualmente a la semana actual.');return;}

    const ne=cloneEventsMap(events);
    ne[dk]=(ne[dk]||[]).filter(e=>String(e.id)!==String(id));
    if(ne[dk]&&ne[dk].length===0) delete ne[dk];
    const now=new Date();
    let found=null;
    for(const d of week){
      const targetDk=dateKey(d);
      const dayStart=new Date(d); dayStart.setHours(0,0,0,0);
      if(dayStart<today()) continue;
      let startMin=PLAN_START_MIN;
      if(targetDk===dateKey(now)){
        const nowMin=now.getHours()*60+now.getMinutes()+15;
        startMin=Math.max(startMin,Math.ceil(nowMin/30)*30);
      }
      for(let m=startMin;m+(source.dur||1)*30<=PLAN_END_MIN;m+=30){
        if(!isFreeAt(ne,targetDk,m,source.dur||1)) continue;
        found={dk:targetDk,m}; break;
      }
      if(found) break;
    }
    if(!found){window.alert('No encontre un espacio libre suficiente antes de terminar la semana. Puedes arrastrarla manualmente o liberar un bloque.');return;}
    const slot=minutesToSlot(found.m);
    const moved={...source,h:slot.h,half:slot.half,rescheduled:true,rescheduleCount:(source.rescheduleCount||0)+1};
    if(!ne[found.dk]) ne[found.dk]=[];
    ne[found.dk]=[...ne[found.dk],moved];
    setEvts(ne);
    setPlannerMsg(`↪ ${catById(source.cat).name} reprogramada para ${DAYS_ES[new Date(found.dk+'T12:00:00').getDay()]} ${fmtH(slot.h,slot.half)}.`);
    setView('week'); setCursor(week[0]); setModal(null);
  }

  // Función para manejar el archivo subido
  function handleFileUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      const parsedEvents = parseICS(evt.target.result);
      const defaultCat = cats[0].id;
      setImportModal(parsedEvents.map(ev => ({
        ...ev,
        selected: true,
        cat: defaultCat
      })));
    };
    reader.readAsText(file);
    e.target.value = ''; // Limpiar el input para volver a subir el mismo si se necesita
  }

  // Función para guardar los eventos seleccionados del modal
  function saveImport() {
    let ne = { ...events };
    importModal.forEach(ev => {
      if (!ev.selected) return;
      const dk = dateKey(ev.start);
      const h = ev.start.getHours();
      const half = ev.start.getMinutes() >= 30;
      
      // Calcular duración en bloques de 30 mins
      const durationMs = ev.end.getTime() - ev.start.getTime();
      let dur = Math.round(durationMs / (1000 * 60 * 30));
      if (dur < 1) dur = 1;

      if (!ne[dk]) ne[dk] = [];
      // Usamos propagación (...) para conservar las actividades manuales que ya tenías
      ne[dk] = [...ne[dk], {
        id: Date.now() + '_' + Math.random(),
        cat: ev.cat,
        note: ev.summary,
        h, half, dur, done: false, notif: 0, fixed: true, source: 'calendar-import'
      }];
    });
    setEvts(ne);
    setImportModal(null);
  }

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

  function addRepEvts(base,cat,note,h,half,dur,repType,cd,startDate,notif,fixed=false){
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
        out[dk]=[...out[dk],{id:Date.now()+'_'+Math.random(),cat,note,h,half,dur,done:false,repId,notif:notif||0,fixed:!!fixed}];
      }
      d=addDays(d,1);
    }
    return out;
  }

  function addFromForm(){
    const[h,hf]=form.hour.split('_');
    const half=hf==='1',hi=parseInt(h);
    const dk=form.date;
    let ne={...events};
    
    const startDate = new Date(form.date + 'T12:00:00');

    if(form.rep==='none'){
      if(!ne[dk]) ne[dk]=[];
      ne[dk]=[...ne[dk],{id:Date.now(),cat:form.cat,note:form.note,h:hi,half,dur:form.dur,done:false,notif:0}];
    } else {
      ne=addRepEvts(ne,form.cat,form.note,hi,half,form.dur,form.rep,form.repDays,startDate,0,false);
    }
    setForm(f=>({...f,note:''}));
    setEvts(ne);
  }

  function saveModal(){
    if(!modal) return;
    const co=catById(modal.cat),uc=modal.color!==co.color,theme=uc?autoTheme(modal.color):null;
    let ne={...events};
    if(modal.evtId){
      ne[modal.dk]=(ne[modal.dk]||[]).map(e=>String(e.id)===modal.evtId?{...e,cat:modal.cat,note:modal.note,h:modal.h,half:modal.half,dur:modal.dur,customColor:uc?modal.color:null,customTheme:theme,notif:modal.notif||0,fixed:!!modal.fixed}:e);
    } else {
      if(modal.rep==='none'){
        if(!ne[modal.dk]) ne[modal.dk]=[];
        ne[modal.dk]=[...ne[modal.dk],{id:Date.now(),cat:modal.cat,note:modal.note,h:modal.h,half:modal.half,dur:modal.dur,done:false,customColor:uc?modal.color:null,customTheme:theme,notif:modal.notif||0,fixed:!!modal.fixed}];
      } else {
        ne=addRepEvts(ne,modal.cat,modal.note,modal.h,modal.half,modal.dur,modal.rep,modal.repDays,cursor,modal.notif||0,!!modal.fixed);
      }
    }
    setModal(null);setEvts(ne);
  }

  function delEvt(dk,id){setEvts({...events,[dk]:(events[dk]||[]).filter(e=>String(e.id)!==String(id))});}
  function toggleDone(dk,id){setEvts({...events,[dk]:(events[dk]||[]).map(e=>String(e.id)===String(id)?{...e,done:!e.done}:e)});}

  function deleteCat(id){
    if(PROJECT_CATS.some(c=>c.id===id)){
      window.alert('Esta categoria pertenece al sistema base de Movimiento Real y no se puede borrar. Puedes cambiar el color de una actividad individual si lo necesitas.');
      return;
    }
    setCatsS(cats.filter(c=>c.id!==id));
  }

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
        if(ev.fixed){ setDragEvt(null); setDragOver(null); return; }
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
  const weekKeys=weekDays.map(dateKey);
  const weekAll=[];
  weekKeys.forEach(dk=>(events[dk]||[]).forEach(e=>weekAll.push({...e,dk})));
  const weekGoalStats=WEEKLY_GOALS.map(g=>{
    const matched=weekAll.filter(g.match);
    const target=goalTargets[g.id]!==undefined?goalTargets[g.id]:g.defaultTarget;
    return {...g,target,planned:matched.length,done:matched.filter(e=>e.done).length};
  });

  function EvBlock({ev,dk}){
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
    const compact=ev.dur===1;
    const col = ev.col || 0;
    const maxCols = ev.maxCols || 1;
    const widthPct = 100 / maxCols;
    const leftPct = col * widthPct;
    const fullLabel=baseCat.name+(ev.note?` · ${ev.note}`:'')+(ev.fixed?' 🔒':'')+(ev.metric==='external'?' 🌐':'')+(ev.repId?' ↻':'')+(ev.notif?' 🔔':'');
    const openEditor=()=>setModal({dk,evtId:String(ev.id),cat:ev.cat,note:ev.note||'',h:ev.h,half:ev.half||false,dur:ev.dur,color:ev.customColor||baseCat.color,rep:'none',repDays:[false,false,false,false,false,false,false],notif:ev.notif||0,fixed:!!ev.fixed});
    const actions=[
      ['✓',()=>toggleDone(dk,ev.id),ev.done?th.color+'33':'rgba(0,0,0,0.1)','Completar'],
      ['✎',openEditor,'rgba(0,0,0,0.1)','Editar'],
      ...(!compact&&!ev.fixed&&!ev.done?[['↪',()=>reprogramEvent(dk,ev.id),'rgba(0,0,0,0.1)','Reprogramar en espacio libre']]:[]),
      ['✕',()=>delEvt(dk,ev.id),'rgba(0,0,0,0.1)','Eliminar']
    ];

    return React.createElement('div',{
      draggable:!ev.fixed,
      title:fullLabel+' · '+fmtH(ev.h,ev.half||false)+' · '+dl,
      onClick:()=>{if(compact)openEditor();},
      onDragStart:()=>{if(!ev.fixed)setDragEvt({type:'existing',dk,id:ev.id});},
      onDragEnd:()=>{setDragEvt(null);setDragOver(null);},
      style:{
        position:'absolute',
        left: `calc(${leftPct}% + 2px)`,
        width: `calc(${widthPct}% - 4px)`,
        top, height, borderRadius:5, padding:compact?'3px 48px 3px 4px':'3px 5px', cursor:ev.fixed?'default':'grab', zIndex:2, overflow:'hidden', display:'flex',
        flexDirection:'column', justifyContent:compact?'center':'space-between', background:th.bg, color:th.text,
        borderLeft:`3px solid ${th.color}`, opacity:ev.done?0.5:1, boxShadow:'0 1px 3px rgba(0,0,0,0.15)', pointerEvents: dragEvt ? 'none' : 'auto'
      }
    },
      React.createElement('div',{style:{fontSize:compact?9:12,fontWeight:600,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis',lineHeight:1.2,color:th.text}},
        compact?(ev.note||baseCat.name):fullLabel
      ),
      !compact&&React.createElement('div',{style:{fontSize:10,opacity:0.75,color:th.text}},fmtH(ev.h,ev.half||false)+' · '+dl),
      React.createElement('div',{style:compact?{position:'absolute',right:2,top:3,display:'flex',gap:1,zIndex:4}:{display:'flex',gap:2,marginTop:1}},
        ...actions.map(([ico,fn,bg,label])=>React.createElement('button',{
          key:ico,title:label,
          onMouseDown:e=>e.stopPropagation(),
          onClick:e=>{e.stopPropagation();fn();},
          style:{width:compact?13:14,height:compact?13:14,borderRadius:3,border:'none',cursor:'pointer',fontSize:compact?7:8,display:'flex',alignItems:'center',justifyContent:'center',background:bg,color:th.text,padding:0,flexShrink:0,lineHeight:1}
        },ico))
      )
    );
  }

  function DayCol({dk}){
    const rawEvts=(events[dk]||[]).slice().sort((a,b)=>slotIdx(a.h,a.half||false)-slotIdx(b.h,b.half||false));
    
    const evts = [];
    if(rawEvts.length > 0){
      let lastEnd = null;
      let group = [];

      function packGroup() {
        if(!group.length) return;
        const cols = [];
        group.forEach(ev => {
          let placed = false;
          for(let i=0; i<cols.length; i++){
            if(cols[i][cols[i].length-1].end <= ev.start) {
              cols[i].push(ev);
              ev.col = i;
              placed = true;
              break;
            }
          }
          if(!placed) {
            ev.col = cols.length;
            cols.push([ev]);
          }
        });
        group.forEach(ev => {
          ev.maxCols = cols.length;
          evts.push(ev);
        });
        group = [];
      }

      rawEvts.forEach(raw => {
        const ev = {...raw, start: slotIdx(raw.h, raw.half||false), end: slotIdx(raw.h, raw.half||false) + raw.dur};
        if(lastEnd !== null && ev.start >= lastEnd) {
          packGroup();
          lastEnd = null;
        }
        group.push(ev);
        if(lastEnd === null || ev.end > lastEnd) lastEnd = ev.end;
      });
      packGroup();
    }

    const handleColDragOver = e => {
      e.preventDefault(); e.stopPropagation();
      const rect = e.currentTarget.getBoundingClientRect();
      const y = e.clientY - rect.top;
      const idx = Math.floor(y / SH);
      const h = HS + Math.floor(idx / 2);
      const half = idx % 2 !== 0;
      if(h >= HS && h < HE) { setDragOver(`${dk}_${h}_${half}`); }
    };

    const handleColDrop = e => {
      e.preventDefault(); e.stopPropagation();
      const rect = e.currentTarget.getBoundingClientRect();
      const y = e.clientY - rect.top;
      const idx = Math.floor(y / SH);
      const h = HS + Math.floor(idx / 2);
      const half = idx % 2 !== 0;
      if(h >= HS && h < HE) { handleDrop(dk, h, half); }
    };

    return React.createElement('div',{
      style:{position:'relative',borderLeft:'1px solid #e5e5e5',flex:1,minWidth:0},
      onDragOver: handleColDragOver, onDragLeave:()=>setDragOver(null), onDrop: handleColDrop
    },
      ...SLOTS.map((s,i)=>React.createElement('div',{
        key:i,
        style:{height:SH,borderBottom:s.half?'1px dashed #eee':'1px solid #e5e5e5',cursor:'pointer',background:dragOver===`${dk}_${s.h}_${s.half}`?'#d4f5e9':'transparent'},
        onClick:()=>!dragEvt&&setModal({dk,evtId:null,cat:'platzi',note:'',h:s.h,half:s.half,dur:2,color:'#1D9E75',rep:'none',repDays:[false,false,false,false,false,false,false],notif:0,fixed:false})
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
    React.createElement('style',null,'@keyframes spin{to{transform:rotate(360deg)}} @keyframes goalPop{0%{transform:scale(.75);opacity:0}55%{transform:scale(1.08);opacity:1}100%{transform:scale(1);opacity:1}} @keyframes confettiFall{0%{transform:translateY(-30px) rotate(0deg);opacity:0}15%{opacity:1}100%{transform:translateY(180px) rotate(360deg);opacity:0}} *{box-sizing:border-box}'),

    !notifGranted&&'Notification' in window&&React.createElement('div',{style:{display:'flex',alignItems:'center',gap:8,padding:'8px 12px',background:'#FFF8E1',borderRadius:8,border:'1px solid #FFD54F',marginBottom:10,fontSize:12,color:'#5D4037'}},
      React.createElement('span',{style:{flex:1}},'🔔 Activa las notificaciones para recibir alertas antes de tus actividades'),
      React.createElement('button',{onClick:enableNotifications,style:{...btnBase,background:'#FF8F00',color:'#fff',border:'none',fontSize:11,padding:'4px 10px'}},'Activar')
    ),

    React.createElement('div',{style:{display:'flex',alignItems:'center',gap:6,padding:'6px 12px',background:'#fff',borderRadius:8,border:'1px solid #e5e5e5',marginBottom:10,fontSize:11,color:'#666'}},
      React.createElement('div',{style:{width:7,height:7,borderRadius:'50%',background:sync.dot,flexShrink:0}}),
      React.createElement('span',{style:{flex:1}},sync.msg),
      React.createElement('button',{onClick:()=>setShowRepMgr(true),style:{...btnBase,fontSize:10,padding:'2px 8px',color:'#666'}},`↻ Repeticiones (${repIds.length})`)
    ),

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

    React.createElement('div',{style:{display:'grid',gridTemplateColumns:'160px 1fr',gap:10}},
      React.createElement('div',{style:{display:'flex',flexDirection:'column',gap:5}},
        
        React.createElement('div',{style:{background:'#ecfeff',borderRadius:8,padding:10,border:'1px solid #99f6e4',marginBottom:5}},
          React.createElement('div',{style:{fontSize:11,fontWeight:700,color:'#115e59',marginBottom:3}},`Proyecto Movimiento Real · ${APP_VERSION}`),
          React.createElement('div',{style:{fontSize:9,color:'#0f766e',lineHeight:1.35,marginBottom:4}},
            (()=>{const w=getPlannerWeekDays();return `Planifica ${w[0].getDate()} ${MON_SH[w[0].getMonth()]} — ${w[6].getDate()} ${MON_SH[w[6].getMonth()]}`;})()
          ),
          React.createElement('div',{style:{fontSize:9,color:'#134e4a',lineHeight:1.35,marginBottom:7}},'Las metas semanales se gestionan en el panel de abajo. Cumplir tarjetas mueve el sistema; cumplir metas confirma el resultado.'),
          React.createElement('button',{onClick:()=>organizePlannerWeek(false),style:{...btnBase,width:'100%',fontSize:11,padding:'7px 6px',background:'#0f766e',color:'#fff',border:'none',marginBottom:5}},'🎲 Organizar semana'),
          React.createElement('button',{onClick:()=>{if(window.confirm('¿Reorganizar las actividades flexibles de esta semana? Las fijas y las ya completadas no se moveran.'))organizePlannerWeek(true);},style:{...btnBase,width:'100%',fontSize:10,padding:'5px 6px',background:'#fff',color:'#0f766e',border:'1px solid #5eead4'}},'↻ Reorganizar flexibles'),
          plannerMsg&&React.createElement('div',{style:{fontSize:9,color:'#115e59',lineHeight:1.35,marginTop:6}},plannerMsg)
        ),


        (()=>{
          const wk=dateKey(getPlannerWeekDays()[0]);
          const missions=missionsForWeek(wk);
          const doneCount=missions.filter(m=>m.done).length;
          return React.createElement('div',{style:{background:'#fff7ed',borderRadius:8,padding:10,border:'1px solid #fed7aa',marginBottom:5}},
            React.createElement('div',{style:{display:'flex',alignItems:'center',justifyContent:'space-between',gap:6,marginBottom:6}},
              React.createElement('div',{style:{fontSize:11,fontWeight:700,color:'#9a3412'}},`🏆 Metas semanales · ${doneCount}/${missions.length}`),
              React.createElement('button',{onClick:()=>setEditMissions(!editMissions),style:{...btnBase,fontSize:9,padding:'2px 6px',border:'1px solid #fdba74',color:'#9a3412',background:'#fff'}},editMissions?'✓ Listo':'✎ Editar')
            ),
            ...missions.map(m=>React.createElement('div',{key:m.id,style:{display:'flex',alignItems:'center',gap:5,marginBottom:5}},
              React.createElement('button',{onClick:()=>toggleMission(wk,m.id),title:m.done?'Marcar como pendiente':'Marcar meta cumplida',style:{width:20,height:20,borderRadius:'50%',border:m.done?'none':'1px solid #fdba74',background:m.done?'#16a34a':'#fff',color:m.done?'#fff':'#9a3412',cursor:'pointer',fontSize:11,flexShrink:0}},m.done?'✓':'○'),
              editMissions
                ?React.createElement('input',{value:m.text,onChange:e=>updateMission(wk,m.id,{text:e.target.value}),style:{flex:1,minWidth:0,fontSize:10,padding:'3px 5px',border:'1px solid #fed7aa',borderRadius:5,color:'#7c2d12'}})
                :React.createElement('div',{style:{flex:1,minWidth:0,fontSize:10,lineHeight:1.25,color:m.done?'#15803d':'#7c2d12',textDecoration:m.done?'line-through':'none'}},m.text),
              editMissions&&React.createElement('button',{onClick:()=>deleteMission(wk,m.id),title:'Eliminar meta',style:{border:'none',background:'transparent',color:'#c2410c',cursor:'pointer',fontSize:12,padding:2}},'×')
            )),
            editMissions&&React.createElement('div',{style:{display:'flex',gap:4,marginTop:6}},
              React.createElement('input',{value:newMissionText,onChange:e=>setNewMissionText(e.target.value),onKeyDown:e=>{if(e.key==='Enter')addMission(wk);},placeholder:'Nueva meta semanal...',style:{flex:1,minWidth:0,fontSize:10,padding:'4px 6px',border:'1px solid #fed7aa',borderRadius:5}}),
              React.createElement('button',{onClick:()=>addMission(wk),style:{...btnBase,fontSize:9,padding:'3px 6px',background:'#ea580c',color:'#fff',border:'none'}},'+')
            )
          );
        })(),

        // PASO 2: BOTÓN PARA IMPORTAR ICS A LA IZQUIERDA
        React.createElement('div', {style: {background: '#eef2ff', borderRadius: 8, padding: 10, border: '1px solid #c7d2fe', marginBottom: 5}},
          React.createElement('div', {style: {fontSize: 11, fontWeight: 600, color: '#3730a3', marginBottom: 5}}, 'Google Calendar'),
          React.createElement('label', {style: {...btnBase, display: 'block', textAlign: 'center', background: '#4f46e5', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 11}},
            '📅 Importar .ics',
            React.createElement('input', {type: 'file', accept: '.ics', style: {display: 'none'}, onChange: handleFileUpload})
          )
        ),

        React.createElement('div',{style:{fontSize:10,fontWeight:600,color:'#999',textTransform:'uppercase',letterSpacing:'0.05em'}},'Actividades'),
        ...cats.map(c=>React.createElement('div',{
          key:c.id,
          draggable:true,
          onDragStart:()=>setDragEvt({type:'new',catId:c.id}),
          onClick:()=>setModal({dk:dateKey(cursor),evtId:null,cat:c.id,note:'',h:8,half:false,dur:2,color:c.color,rep:'none',repDays:[false,false,false,false,false,false,false],notif:0,fixed:false}),
          style:{display:'flex',alignItems:'center',gap:7,padding:'7px 10px',borderRadius:8,border:`1px solid ${c.color}55`,cursor:'grab',fontSize:12,fontWeight:500,userSelect:'none',background:c.bg,color:c.text}
        },
          React.createElement('div',{style:{width:8,height:8,borderRadius:'50%',background:c.color,flexShrink:0}}),
          React.createElement('span',{style:{flex:1}},c.name)
        )),
        React.createElement('button',{onClick:()=>setShowCatColors(true),style:{...btnBase,fontSize:10,padding:5,border:'1px solid #ddd',color:'#555',background:'#fff'}},'🎨 Colores de categorias'),
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
          React.createElement(Lbl,{t:'Fecha'}),
          React.createElement(InpDate,{val:form.date,onChange:v=>setForm(f=>({...f,date:v}))}),
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

    // MODAL DE IMPORTACIÓN (Vista Previa - Enfoque A)
    importModal&&React.createElement('div',{onClick:e=>{if(e.target===e.currentTarget)setImportModal(null);},style:overlayStyle},
      React.createElement('div',{style:{...cardStyle, maxWidth: 450}},
        React.createElement('div',{style:{fontSize:16,fontWeight:600,marginBottom:8}},'Revisar e Importar'),
        React.createElement('div',{style:{fontSize:12,color:'#666',marginBottom:12}},`Se encontraron ${importModal.length} eventos. Desmarca los que no quieras añadir.`),
        React.createElement('div',{style:{maxHeight:'50vh',overflowY:'auto', borderTop:'1px solid #eee', borderBottom:'1px solid #eee', padding:'5px 0', marginBottom:12}},
          ...importModal.map((ev, i) => React.createElement('div', {key: i, style: {display: 'flex', gap: 10, alignItems: 'center', padding: '8px 4px', borderBottom: '1px solid #f5f5f5'}},
            React.createElement('input', {type: 'checkbox', checked: ev.selected, style:{cursor:'pointer'}, onChange: e => {
                const newModal = [...importModal];
                newModal[i].selected = e.target.checked;
                setImportModal(newModal);
            }}),
            React.createElement('div', {style: {flex: 1, minWidth:0}},
                React.createElement('div', {style: {fontSize: 13, fontWeight: 500, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', color: ev.selected ? '#1a1a1a' : '#aaa'}}, ev.summary),
                React.createElement('div', {style: {fontSize: 10, color: '#888'}}, `${ev.start.toLocaleDateString()} · ${fmtH(ev.start.getHours(), ev.start.getMinutes() >= 30)} a ${fmtH(ev.end.getHours(), ev.end.getMinutes() >= 30)}`)
            ),
            React.createElement('select', {
              value: ev.cat,
              disabled: !ev.selected,
              onChange: e => {
                  const newModal = [...importModal];
                  newModal[i].cat = e.target.value;
                  setImportModal(newModal);
              },
              style: { fontSize: 11, padding: '4px', borderRadius: 4, border: '1px solid #ccc', maxWidth: 100 }
            }, cats.map(c => React.createElement('option', { key: c.id, value: c.id }, c.name)))
          ))
        ),
        React.createElement('div',{style:{display:'flex',gap:8}},
          React.createElement('button',{onClick:()=>setImportModal(null),style:{...btnBase,flex:1,padding:'7px 0'}},'Cancelar'),
          React.createElement('button',{onClick:saveImport,style:{...btnBase,flex:1,padding:'7px 0',background:'#4f46e5',color:'#fff',border:'none'}},'Importar Seleccionados')
        )
      )
    ),

    showSum&&React.createElement('div',{style:{marginTop:12,background:'#fff',borderRadius:12,border:'1px solid #e5e5e5',padding:14}},
      React.createElement('div',{style:{fontSize:13,fontWeight:500,marginBottom:10}},'Resumen de progreso'),

      (()=>{
        const wk=dateKey(weekDays[0]); const ms=missionsForWeek(wk); const md=ms.filter(m=>m.done).length;
        return React.createElement('div',{style:{background:'#fff7ed',border:'1px solid #fed7aa',borderRadius:10,padding:10,marginBottom:10}},
          React.createElement('div',{style:{fontSize:11,fontWeight:700,color:'#9a3412',marginBottom:6}},`🏆 Metas semanales: ${md}/${ms.length} cumplidas`),
          ...ms.map(m=>React.createElement('div',{key:m.id,style:{fontSize:10,color:m.done?'#15803d':'#7c2d12',marginBottom:3}},`${m.done?'✓':'○'} ${m.text}`))
        );
      })(),
      React.createElement('div',{style:{background:'#ecfeff',border:'1px solid #99f6e4',borderRadius:10,padding:10,marginBottom:12}},
        React.createElement('div',{style:{display:'flex',alignItems:'center',justifyContent:'space-between',gap:8,marginBottom:7}},
          React.createElement('div',{style:{fontSize:11,fontWeight:700,color:'#115e59'}},'Metas de esta semana'),
          React.createElement('button',{onClick:()=>setEditGoals(!editGoals),style:{...btnBase,fontSize:9,padding:'3px 7px',border:'1px solid #5eead4',color:'#0f766e',background:'#fff'}},editGoals?'✓ Listo':'✎ Editar objetivos')
        ),
        editGoals&&React.createElement('div',{style:{fontSize:9,color:'#0f766e',lineHeight:1.35,marginBottom:7}},'Cambia el minimo semanal. Se guarda automaticamente y el nuevo numero se usa la proxima vez que pulses Organizar/Reorganizar cuando aplica.'),
        ...weekGoalStats.map(g=>React.createElement('div',{key:g.id,style:{display:'grid',gridTemplateColumns:editGoals?'1fr 54px auto':'1fr auto',gap:8,alignItems:'center',fontSize:10,marginBottom:5}},
          React.createElement('span',{style:{color:'#134e4a'}},g.label),
          editGoals&&React.createElement('input',{type:'number',min:0,max:21,value:g.target,onChange:e=>setGoalTarget(g.id,e.target.value),style:{width:52,fontSize:10,padding:'2px 4px',border:'1px solid #99f6e4',borderRadius:5,background:'#fff',color:'#134e4a'}}),
          React.createElement('span',{style:{fontWeight:700,color:g.done>=g.target?'#166534':'#0f766e',whiteSpace:'nowrap'}},`${g.done}/${g.target} hechas · ${g.planned} plan.`)
        ))
      ),
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


    showCatColors&&React.createElement('div',{onClick:e=>{if(e.target===e.currentTarget)setShowCatColors(false);},style:overlayStyle},
      React.createElement('div',{style:{...cardStyle,maxWidth:380}},
        React.createElement('div',{style:{fontSize:14,fontWeight:600,marginBottom:4}},'🎨 Colores de categorias'),
        React.createElement('div',{style:{fontSize:10,color:'#777',lineHeight:1.35,marginBottom:12}},'Cambiar un color lo aplica inmediatamente a todas las tarjetas de esa categoria, incluidas las que ya estan en el horario.'),
        ...cats.map(c=>React.createElement('div',{key:c.id,style:{display:'flex',alignItems:'center',gap:8,padding:'7px 0',borderBottom:'1px solid #f1f1f1'}},
          React.createElement('div',{style:{width:18,height:18,borderRadius:'50%',background:c.color,border:'1px solid #ccc',flexShrink:0}}),
          React.createElement('span',{style:{flex:1,fontSize:11,color:'#333'}},c.name),
          React.createElement('input',{type:'color',value:c.color,onChange:e=>updateCategoryColor(c.id,e.target.value),style:{width:36,height:28,padding:0,border:'none',background:'none',cursor:'pointer'}})
        )),
        React.createElement('button',{onClick:()=>setShowCatColors(false),style:{...btnBase,width:'100%',marginTop:12,padding:'7px 0'}},'Cerrar')
      )
    ),

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


    celebration&&React.createElement('div',{style:{position:'fixed',inset:0,zIndex:12000,pointerEvents:'none',display:'flex',alignItems:'center',justifyContent:'center',background:'rgba(255,255,255,0.20)'}},
      ...['🎉','✨','⭐','🏆','🎊','💫','🎉','⭐'].map((x,i)=>React.createElement('div',{key:i,style:{position:'absolute',left:`${8+i*12}%`,top:`${5+(i%3)*8}%`,fontSize:18+(i%3)*5,animation:`confettiFall ${1.2+(i%4)*0.2}s ease-in forwards`,animationDelay:`${i*0.06}s`}},x)),
      React.createElement('div',{style:{animation:'goalPop .45s ease-out',background:'#fff',border:'2px solid #f59e0b',borderRadius:18,padding:'18px 22px',boxShadow:'0 18px 50px rgba(0,0,0,.18)',textAlign:'center',maxWidth:360,margin:16}},
        React.createElement('div',{style:{fontSize:34,marginBottom:4}},'🏆'),
        React.createElement('div',{style:{fontSize:18,fontWeight:800,color:'#92400e'}},'¡Meta cumplida!'),
        React.createElement('div',{style:{fontSize:12,color:'#78350f',marginTop:6,lineHeight:1.35}},celebration)
      )
    ),

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
        React.createElement('label',{style:{display:'flex',alignItems:'center',gap:7,fontSize:11,color:'#555',marginTop:10,cursor:'pointer'}},
          React.createElement('input',{type:'checkbox',checked:!!modal.fixed,onChange:e=>setModal({...modal,fixed:e.target.checked})}),
          React.createElement('span',null,'🔒 Fijar actividad (no mover con arrastre ni reorganizacion)')
        ),
        !modal.evtId&&React.createElement(React.Fragment,null,
          React.createElement(Lbl,{t:'Repeticion'}),
          React.createElement(Sel,{val:modal.rep,onChange:v=>setModal({...modal,rep:v}),opts:[['none','Sin repeticion'],['daily','Todos los dias'],['weekdays','Dias laborales'],['weekend','Fines de semana'],['custom','Dias especificos...']]}),
          modal.rep==='custom'&&React.createElement(RepGrid,{days:modal.repDays,toggle:i=>setModal({...modal,repDays:modal.repDays.map((v,j)=>j===i?!v:v)})})
        ),
        modal.evtId&&!modal.fixed&&React.createElement('button',{onClick:()=>reprogramEvent(modal.dk,modal.evtId),disabled:(events[modal.dk]||[]).find(e=>String(e.id)===String(modal.evtId))?.done,style:{...btnBase,width:'100%',marginTop:12,padding:'7px 0',background:'#fff7ed',color:'#9a3412',border:'1px solid #fdba74'}},'↪ Reprogramar en siguiente espacio libre de esta semana'),
        React.createElement('div',{style:{display:'flex',gap:8,marginTop:14}},
          React.createElement('button',{onClick:()=>setModal(null),style:{...btnBase,flex:1,padding:'7px 0'}},'Cancelar'),
          React.createElement('button',{onClick:saveModal,style:{...btnBase,flex:1,padding:'7px 0',background:'#1a1a1a',color:'#fff',border:'none'}},'Guardar')
        ),
        
        React.createElement('button',{
          onClick:()=>{
            if(window.confirm(`¿Estás seguro de que deseas eliminar la categoría "${catById(modal.cat).name}"?`)){
              deleteCat(modal.cat);
              setModal(null);
            }
          },
          style:{...btnBase, width:'100%', marginTop:10, padding:'8px 0', background:'#E53935', color:'#fff', border:'none', fontWeight:500}
        }, 'Borrar categoría')
      )
    )
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(App));
