const SUPABASE_URL = 'https://dlssdjsifskthcywhoob.supabase.co';
const SUPABASE_KEY = 'sb_publishable_knmsHYYiwCzGxgQbPt7F4w_vune2eYW';
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
const USER_ID = 'adrian_cronograma';

// HE=23 asegura que el último bloque sea 10:30pm a 11:00pm
const SH=30,HS=6,HE=23;
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
      }catch(e){
        setSync({dot:'#D85A30',msg:'Error al cargar'});
      }
      setLoaded(true);
    })();
  },[]);

  function scheduleSave(evts,ct){
    if(saveTimer.current) clearTimeout(saveTimer.current);
    setSync({dot:'#BA7517',msg:'Guardando...'});
    saveTimer.current=setTimeout(async()=>{
      try{
        await Promise.all([saveToDB('events',evts),saveToDB('cats',ct)]);
        setSync({dot:'#1D9E75',msg:`Guardado ${new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}`});
      }catch(e){setSync({dot:'#D85A30',msg:'Error al guardar'});}
    },800);
  }

  function setEvts(e){setEvents(e);scheduleSave(e,cats);}
  function setCatsS(c){setCats(c);scheduleSave(events,c);}
  const catById=id=>cats.find(c=>c.id===id)||cats[0];

  function deleteRepId(repId){
    const ne={};
    Object.entries(events).forEach(([dk,evts])=>{
      const f=evts.filter(e=>e.repId!==repId);
      if(f.length>0) ne[dk]=f;
    });
    setEvts(ne);
    setShowRepMgr(false);
  }

  function addRepEvts(base,cat,note,h,half,dur,repType,cd,startDate){
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
        out[dk]=[...out[dk],{id:Date.now()+'_'+Math.random(),cat,note,h,half,dur,done:false,repId,notif:0}];
      }
      d=addDays(d,1);
    }
    return out;
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

  const td=today(),weekDays=getWeekDays(cursor);
  let ptotal=0,pdone=0;
  const progressKeys=view==='day'?[dateKey(cursor)]:weekDays.map(dateKey);
  progressKeys.forEach(k=>{const e=events[k]||[];ptotal+=e.length;pdone+=e.filter(e=>e.done).length;});
  const pct=ptotal?Math.round(pdone/ptotal*100):0;

  const bi={width:'100%',fontSize:13,padding:'5px 7px',fontFamily:'system-ui',border:'1px solid #ccc',borderRadius:8,background:'#fff',marginBottom:0};
  const Lbl=({t})=>React.createElement('label',{style:{fontSize:11,color:'#666',display:'block',marginBottom:3,marginTop:10}},t);
  const Sel=({val,onChange,opts})=>React.createElement('select',{value:val,onChange:e=>onChange(e.target.value),style:bi},opts.map(([v,l])=>React.createElement('option',{key:v,value:v},l)));
  const Inp=({val,onChange,ph})=>React.createElement('input',{value:val,onChange:e=>onChange(e.target.value),placeholder:ph,style:bi});

  function EvBlock({ev,dk}){
    const baseCat=catById(ev.cat);
    const th=ev.customTheme||{bg:baseCat.bg,text:baseCat.text,color:baseCat.color};
    const top=slotIdx(ev.h,ev.half||false)*SH,height=ev.dur*SH-2;
    
    return React.createElement('div',{
      draggable:true,
      onDragStart:(e)=>{
        setDragEvt({type:'existing',dk,id:ev.id});
        e.dataTransfer.setData('text/plain', ''); // Requerido para Firefox
      },
      onDragEnd:()=>setDragEvt(null),
      onClick:(e)=>{
        e.stopPropagation();
        setModal({dk,evtId:String(ev.id),cat:ev.cat,note:ev.note||'',h:ev.h,half:ev.half||false,dur:ev.dur,color:ev.customColor||baseCat.color,rep:'none',repDays:[false,false,false,false,false,false,false]});
      },
      style:{
        position:'absolute',left:2,right:2,top,height,borderRadius:5,padding:'3px 5px',cursor:'grab',zIndex:2,
        background:th.bg,color:th.text,borderLeft:`3px solid ${th.color}`,opacity:ev.done?0.5:1,
        // CLAVE: Evita que el bloque bloquee el "drop" de las celdas de fondo mientras arrastras
        pointerEvents: dragEvt ? 'none' : 'auto'
      }
    },
      React.createElement('div',{style:{fontSize:11,fontWeight:600,overflow:'hidden',textOverflow:'ellipsis'}},baseCat.name+(ev.note?` · ${ev.note}`:'')),
      React.createElement('div',{style:{fontSize:9,opacity:0.8}},fmtH(ev.h,ev.half||false)),
      height>35&&React.createElement('div',{style:{display:'flex',gap:2,marginTop:2}},
        [['✓',(e)=>{e.stopPropagation();setEvts({...events,[dk]:(events[dk]||[]).map(x=>x.id===ev.id?{...x,done:!x.done}:x)});},ev.done?th.color+'33':'rgba(0,0,0,0.1)'],
         ['✕',(e)=>{e.stopPropagation();if(confirm('¿Borrar actividad?'))setEvts({...events,[dk]:(events[dk]||[]).filter(x=>x.id!==ev.id)});},'rgba(0,0,0,0.1)']
        ].map(([ico,fn,bg])=>React.createElement('button',{key:ico,onClick:fn,style:{width:18,height:18,borderRadius:3,border:'none',cursor:'pointer',fontSize:9,background:bg,color:th.text}},ico))
      )
    );
  }

  function DayCol({dk}){
    return React.createElement('div',{
      style:{position:'relative',borderLeft:'1px solid #e5e5e5',flex:1,minWidth:0},
    },
      ...SLOTS.map((s,i)=>React.createElement('div',{
        key:i,
        onDragOver:e=>{e.preventDefault();setDragOver(`${dk}_${s.h}_${s.half}`);},
        onDragLeave:()=>setDragOver(null),
        onDrop:e=>{e.preventDefault();handleDrop(dk,s.h,s.half);},
        onClick:()=>setModal({dk,evtId:null,cat:'platzi',note:'',h:s.h,half:s.half,dur:2,color:'#1D9E75',rep:'none',repDays:[false,false,false,false,false,false,false]}),
        style:{height:SH,borderBottom:s.half?'1px dashed #eee':'1px solid #e5e5e5',cursor:'pointer',background:dragOver===`${dk}_${s.h}_${s.half}`?'#d4f5e9':'transparent'}
      })),
      ...(events[dk]||[]).map(ev=>React.createElement(EvBlock,{key:ev.id,ev,dk}))
    );
  }

  if(!loaded) return React.createElement('div',{style:{textAlign:'center',marginTop:50}},'Cargando cronograma...');

  return React.createElement('div',{style:{padding:12,fontFamily:'system-ui',maxWidth:1000,margin:'0 auto',background:'#f5f5f3',minHeight:'100vh'}},
    // Sync Bar
    React.createElement('div',{style:{display:'flex',gap:6,padding:8,background:'#fff',borderRadius:8,marginBottom:10,fontSize:11,color:'#666',alignItems:'center'}},
      React.createElement('div',{style:{width:8,height:8,borderRadius:'50%',background:sync.dot}}),sync.msg
    ),

    // Header
    React.createElement('div',{style:{display:'flex',justifyContent:'space-between',alignItems:'center',background:'#fff',padding:15,borderRadius:12,marginBottom:10}},
      React.createElement('div',null,
        React.createElement('div',{style:{fontSize:18,fontWeight:600}},`${DAYS_ES[td.getDay()]}, ${td.getDate()} de ${MON_ES[td.getMonth()]}`),
        React.createElement('div',{style:{fontSize:11,color:'#888'}},`Hoy: ${(events[dateKey(td)]||[]).length} actividades`)
      ),
      React.createElement('div',{style:{textAlign:'right'}},
        React.createElement('div',{style:{width:100,height:6,background:'#eee',borderRadius:10,overflow:'hidden'}},
          React.createElement('div',{style:{width:`${pct}%`,height:'100%',background:'#1D9E75'}})
        ),
        React.createElement('div',{style:{fontSize:11,marginTop:4,color:'#888'}},`${pct}% completado`)
      )
    ),

    // Nav
    React.createElement('div',{style:{display:'flex',justifyContent:'space-between',marginBottom:10}},
      React.createElement('div',{style:{display:'flex',gap:4}},
        ['day','week'].map(v=>React.createElement('button',{key:v,onClick:()=>setView(v),style:{padding:'6px 12px',borderRadius:8,border:'none',cursor:'pointer',background:view===v?'#1a1a1a':'#fff',color:view===v?'#fff':'#666'}},v==='day'?'Día':'Semana'))
      ),
      React.createElement('div',{style:{display:'flex',alignItems:'center',gap:8}},
        React.createElement('button',{onClick:()=>setCursor(addDays(cursor,view==='day'?-1:-7)),style:{border:'none',background:'none',cursor:'pointer'}},'←'),
        React.createElement('span',{style:{fontSize:13,fontWeight:500}},view==='day'?dateKey(cursor):'Esta semana'),
        React.createElement('button',{onClick:()=>setCursor(addDays(cursor,view==='day'?1:7)),style:{border:'none',background:'none',cursor:'pointer'}},'→')
      )
    ),

    // Grid Principal
    React.createElement('div',{style:{display:'grid',gridTemplateColumns:'160px 1fr',gap:12}},
      // Sidebar
      React.createElement('div',{style:{display:'flex',flexDirection:'column',gap:6}},
        React.createElement('div',{style:{fontSize:10,fontWeight:600,color:'#999',textTransform:'uppercase'}},'Actividades'),
        ...cats.map(c=>React.createElement('div',{
          key:c.id,draggable:true,onDragStart:()=>setDragEvt({type:'new',catId:c.id}),
          style:{padding:'8px 10px',borderRadius:8,background:c.bg,color:c.text,fontSize:12,cursor:'grab',display:'flex',alignItems:'center',gap:6}
        }, React.createElement('div',{style:{width:8,height:8,borderRadius:'50%',background:c.color}}), c.name)),
        React.createElement('button',{onClick:()=>setShowNCF(!showNCF),style:{background:'none',border:'1px dashed #ccc',padding:8,borderRadius:8,color:'#888',fontSize:11,cursor:'pointer'}},'+ Nueva categoría'),
        showNCF&&React.createElement('div',{style:{background:'#fff',padding:10,borderRadius:8,border:'1px solid #eee'}},
          React.createElement(Inp,{val:ncName,onChange:setNcName,ph:'Nombre...'}),
          React.createElement('input',{type:'color',value:ncColor,onChange:e=>setNcColor(e.target.value),style:{width:'100%',marginTop:5,border:'none',height:25}}),
          React.createElement('button',{onClick:()=>{if(!ncName)return;setCatsS([...cats,{id:'cat_'+Date.now(),name:ncName,...autoTheme(ncColor)}]);setNcName('');setShowNCF(false);},style:{width:'100%',marginTop:8,padding:5,background:'#1a1a1a',color:'#fff',border:'none',borderRadius:5}},'Crear')
        )
      ),

      // Calendario
      React.createElement('div',{style:{background:'#fff',borderRadius:12,border:'1px solid #e5e5e5',overflow:'hidden'}},
        view==='week'&&React.createElement('div',{style:{display:'grid',gridTemplateColumns:'44px repeat(7,1fr)',borderBottom:'1px solid #eee'}},
          React.createElement('div'),
          ...weekDays.map(d=>React.createElement('div',{key:dateKey(d),style:{textAlign:'center',padding:8,fontSize:10,borderLeft:'1px solid #eee'}},
            React.createElement('div',{style:{color:'#999'}},DAYS_SH[d.getDay()]),
            React.createElement('div',{style:{fontWeight:600,fontSize:14}},d.getDate())
          ))
        ),
        React.createElement('div',{style:{display:'grid',gridTemplateColumns:view==='day'?'44px 1fr':'44px repeat(7,1fr)'}},
          React.createElement('div',null, SLOTS.map((s,i)=>React.createElement('div',{key:i,style:{height:SH,fontSize:9,color:'#bbb',textAlign:'right',paddingRight:5}},!s.half?fmtH(s.h,false):''))),
          ...(view==='day'?[React.createElement(DayCol,{key:dateKey(cursor),dk:dateKey(cursor)})]:weekDays.map(d=>React.createElement(DayCol,{key:dateKey(d),dk:dateKey(d)})))
        )
      )
    ),

    // Modal
    modal&&React.createElement('div',{style:{position:'fixed',inset:0,background:'rgba(0,0,0,0.5)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:999},onClick:()=>setModal(null)},
      React.createElement('div',{style:{background:'#fff',padding:20,borderRadius:12,width:300},onClick:e=>e.stopPropagation()},
        React.createElement('div',{style:{fontSize:15,fontWeight:600,marginBottom:10}},modal.evtId?'Editar Actividad':'Nueva Actividad'),
        React.createElement(Lbl,{t:'Nota'}),
        React.createElement(Inp,{val:modal.note,onChange:v=>setModal({...modal,note:v}),ph:'Descripción...'}),
        React.createElement(Lbl,{t:'Hora'}),
        React.createElement(Sel,{val:`${modal.h}_${modal.half?1:0}`,onChange:v=>{const[h,hf]=v.split('_');setModal({...modal,h:parseInt(h),half:hf==='1'});},opts:SLOTS.map(s=>[`${s.h}_${s.half?1:0}`,fmtH(s.h,s.half)])}),
        React.createElement(Lbl,{t:'Duración'}),
        React.createElement(Sel,{val:modal.dur,onChange:v=>setModal({...modal,dur:parseInt(v)}),opts:[[1,'30m'],[2,'1h'],[3,'1.5h'],[4,'2h'],[6,'3h']]}),
        !modal.evtId&&React.createElement(React.Fragment,null,
          React.createElement(Lbl,{t:'Repetir'}),
          React.createElement(Sel,{val:modal.rep,onChange:v=>setModal({...modal,rep:v}),opts:[['none','Sin repetición'],['daily','Diario'],['weekdays','L-V']]})
        ),
        React.createElement('div',{style:{display:'flex',gap:8,marginTop:15}},
          React.createElement('button',{onClick:()=>setModal(null),style:{flex:1,padding:8,borderRadius:8,border:'1px solid #eee',background:'none'}},'Cancelar'),
          React.createElement('button',{onClick:()=>{
            let ne={...events};
            if(modal.evtId){
              ne[modal.dk]=ne[modal.dk].map(x=>String(x.id)===modal.evtId?{...x,note:modal.note,h:modal.h,half:modal.half,dur:modal.dur}:x);
            }else{
              if(modal.rep==='none'){
                ne[modal.dk]=[...(ne[modal.dk]||[]),{id:Date.now(),cat:modal.cat,note:modal.note,h:modal.h,half:modal.half,dur:modal.dur,done:false}];
              }else{ne=addRepEvts(ne,modal.cat,modal.note,modal.h,modal.half,modal.dur,modal.rep,[],cursor);}
            }
            setEvts(ne);setModal(null);
          },style:{flex:1,padding:8,borderRadius:8,border:'none',background:'#1a1a1a',color:'#fff'}},'Guardar')
        ),
        modal.evtId&&React.createElement('button',{
          onClick:()=>{if(confirm('¿Borrar esta actividad?')){setEvts({...events,[modal.dk]:events[modal.dk].filter(x=>String(x.id)!==modal.evtId)});setModal(null);}},
          style:{width:'100%',marginTop:10,padding:8,borderRadius:8,border:'none',background:'#E53935',color:'#fff',fontWeight:600}
        },'Borrar actividad')
      )
    )
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(App));
