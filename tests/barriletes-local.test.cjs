const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync(require('node:path').join(__dirname,'../app.js'),'utf8');
const plain=value=>JSON.parse(JSON.stringify(value));
const day='2026-11-16',past='2026-11-09',key='cronograma:barriletes:v1';

function memory(){
  const entries=new Map([['unrelated','unchanged']]);
  return {entries,getItem:k=>entries.get(k)??null,setItem:(k,v)=>entries.set(k,v)};
}
function app(storage=memory(),width=1200){
  const operations=[],slots=[],listeners={},downloads=[];
  let cursor=0,effects=[];
  class Clock extends Date{constructor(...args){super(...(args.length?args:[day+'T12:00:00']));}}
  const React={
    Fragment:Symbol(),
    createElement(type,props,...children){return {type,props:props||{},children};},
    useState(initial){
      const i=cursor++;
      if(!(i in slots))slots[i]=typeof initial==='function'?initial():initial;
      return [slots[i],next=>{slots[i]=typeof next==='function'?next(slots[i]):next;}];
    },
    useRef(value){const i=cursor++;return slots[i]??(slots[i]={current:value});},
    useEffect(effect,deps){
      const i=cursor++,previous=slots[i];
      if(!previous||deps.some((v,j)=>!Object.is(v,previous.deps[j]))){
        const next={deps};slots[i]=next;
        effects.push(()=>{previous?.cleanup?.();next.cleanup=effect();});
      }
    }
  };
  const history={
    events:{[day]:[{id:'fixture-card',cat:'mente',note:'Actividad ficticia',h:22,half:true,dur:1,done:true}]},
    cats:[],goals:{},weeklyMissions:{},weeklyGoalTargets:{[day]:{}},weeklyStars:{[day]:[day]},secondaryMissions:[]
  };
  const rows=Object.entries(history).map(([key,value])=>({key,value:JSON.stringify(value)}));
  const database={from(table){
    operations.push(table);
    return {select(){return this;},eq:async()=>({data:rows,error:null})};
  }};
  const context=vm.createContext({Date:Clock,React,Blob,
    URL:{createObjectURL:blob=>{downloads.push(blob);return 'blob:fixture';},revokeObjectURL(){}},
    window:{localStorage:storage,innerWidth:width,addEventListener:(name,fn)=>listeners[name]=fn,removeEventListener(){}},
    document:{getElementById(){},createElement:()=>({click(){},remove(){}}),body:{appendChild(){}}},
    setInterval:()=>1,clearInterval(){},setTimeout:()=>1,clearTimeout(){},
    supabase:{createClient:()=>database},ReactDOM:{createRoot:()=>({render(){}})}});
  vm.runInContext(source,context);
  return {call:(fn,...args)=>context[fn](...args),storage,operations,downloads,listeners,async render(){
    let tree;
    for(let i=0;i<4;i++){
      cursor=0;effects=[];tree=context.App();effects.forEach(fn=>fn());
      await new Promise(resolve=>setImmediate(resolve));
    }
    return tree;
  }};
}
function nodes(node){
  if(Array.isArray(node))return node.flatMap(nodes);
  if(!node||typeof node!=='object')return [];
  if(typeof node.type==='function')return nodes(node.type({...node.props,children:node.children}));
  return [node,...node.children.flatMap(nodes)];
}
const content=n=>n?.children.flat(Infinity).filter(v=>typeof v==='string').join('')||'';
const button=(tree,label)=>nodes(tree).find(n=>n.type==='button'&&content(n)===label);
const footer=tree=>nodes(tree).find(n=>n.props['aria-label']==='Registro semanal de barriletes');
const cell=(tree,date)=>nodes(tree).find(n=>n.props['aria-label']?.startsWith('Barriletes '+date+':'));
async function week(h){button(await h.render(),'Semana').props.onClick();return h.render();}
async function enterCounts(h,tree,date,long,short){
  cell(tree,date).props.onClick();
  for(const [i,value] of [long,short].entries()){
    const dialog=nodes(await h.render()).find(n=>n.props.role==='dialog');
    nodes(dialog).filter(n=>n.type==='input')[i].props.onChange({target:{value}});
  }
  nodes(await h.render()).find(n=>n.props.role==='dialog').props.onSubmit({preventDefault(){}});
  return h.render();
}
async function importFile(h,tree,text){
  const input=nodes(footer(tree)).find(n=>n.props.type==='file');
  await input.props.onChange({target:{files:[{size:text.length,text:async()=>text}],value:'fixture.json'}});
  return h.render();
}

test('weekly footer sits after the hour grid and scrolls in alignment on mobile',async()=>{
  const h=app(memory(),390);
  assert.equal(footer(await h.render()),undefined);
  const tree=await week(h),region=footer(tree);
  const wrapper=nodes(tree).find(n=>n.children.includes(region));
  assert.equal(wrapper.props.style.overflowX,'auto');
  const index=wrapper.children.indexOf(region),row=region.children[0];
  for(const grid of [wrapper.children[index-2],wrapper.children[index-1],row]){
    assert.equal(grid.props.style.gridTemplateColumns,'44px repeat(7,1fr)');
    assert.equal(grid.props.style.minWidth,820);
  }
  assert.equal(row.children.length,8);
  assert.ok(nodes(tree).some(n=>n.props.title?.includes('Actividad ficticia del laboratorio')||n.props.title?.includes('Actividad ficticia')));
  assert.equal(h.storage.getItem(key),null);
});
test('saves, edits past days and recovers weekly totals and explicit zero without touching Supabase',async()=>{
  const h=app();
  let tree=await week(h);
  assert.equal(content(cell(tree,day)),'+ Registrar');
  tree=await enterCounts(h,tree,day,'3','2');
  assert.equal(content(cell(tree,day)),'3 L · 2 C');
  assert.ok(nodes(footer(tree)).some(n=>content(n)==='Total: 5'));
  button(tree,'←').props.onClick();
  tree=await h.render();
  tree=await enterCounts(h,tree,past,'0','0');
  assert.equal(content(cell(tree,past)),'0 L · 0 C');
  assert.ok(nodes(footer(tree)).some(n=>content(n)==='Total: 0'));
  const reopened=app(h.storage);
  tree=await week(reopened);
  assert.equal(content(cell(tree,day)),'3 L · 2 C');
  button(tree,'←').props.onClick();
  tree=await reopened.render();
  assert.equal(content(cell(tree,past)),'0 L · 0 C');
  tree=await enterCounts(reopened,tree,past,'0','4');
  assert.equal(content(cell(tree,past)),'4 C');
  assert.ok(nodes(footer(tree)).some(n=>content(n)==='Total: 4'));
  assert.deepEqual(h.operations,['cronograma']);
  assert.deepEqual(reopened.operations,['cronograma']);
  assert.equal(h.storage.getItem('unrelated'),'unchanged');
});
test('export/import JSON preserves local conflicts, ignores identical days and restores missing dates',async()=>{
  const h=app();
  let tree=await enterCounts(h,await week(h),day,'2','1');
  button(tree,'Exportar JSON').props.onClick();
  const backup=await h.downloads[0].text();
  assert.deepEqual(JSON.parse(backup),{format:'cronograma-barriletes',version:1,days:{[day]:{long:2,short:1}}});
  const restored=app();
  tree=await importFile(restored,await week(restored),backup);
  assert.equal(content(cell(tree,day)),'2 L · 1 C');
  const next={...JSON.parse(backup),days:{[day]:{long:9,short:9},[past]:{long:0,short:0}}};
  tree=await importFile(restored,tree,JSON.stringify(next));
  assert.equal(content(cell(tree,day)),'2 L · 1 C');
  assert.ok(nodes(footer(tree)).some(n=>content(n).includes('Conflictos conservados en el navegador: 1')));
  assert.deepEqual(JSON.parse(restored.storage.getItem(key)).days,{[day]:{long:2,short:1},[past]:{long:0,short:0}});
  tree=await importFile(restored,tree,backup);
  assert.ok(nodes(footer(tree)).some(n=>content(n).includes('Ya idénticas: 1')));
});
test('bad quantities or a bad import never write partial data',async()=>{
  const h=app();
  let tree=await week(h);
  for(const raw of ['-1','1.5','1e2','','9007199254740992'])assert.equal(h.call('parseBarrileteCount',raw),null);
  tree=await enterCounts(h,tree,day,'-1','2.5');
  assert.ok(nodes(tree).some(n=>n.props.role==='alert'&&content(n).includes('números enteros')));
  assert.equal(h.storage.getItem(key),null);
  button(tree,'Cancelar').props.onClick();
  tree=await enterCounts(h,await h.render(),day,'2','0');
  const before=h.storage.getItem(key);
  const malformed=h.call('serializeBarriletes',{[past]:{long:1,short:0},'2026-02-30':{long:3,short:0}});
  tree=await importFile(h,tree,malformed);
  assert.ok(nodes(footer(tree)).some(n=>content(n).includes('No se pudo importar')));
  assert.equal(h.storage.getItem(key),before);
});
test('a storage error keeps the editor and original numbers; corrupt local JSON leaves calendar usable',async()=>{
  const storage=memory(),h=app(storage);
  let tree=await enterCounts(h,await week(h),day,'1','2');
  const before=storage.getItem(key);
  storage.setItem=()=>{throw new Error('quota');};
  tree=await enterCounts(h,tree,day,'8','8');
  assert.ok(nodes(tree).some(n=>n.props.role==='alert'&&content(n).includes('No se pudo guardar')));
  assert.equal(storage.getItem(key),before);
  storage.entries.set(key,'corrupt');
  const next=app(storage);
  tree=await week(next);
  assert.equal(cell(tree,day).props.disabled,true);
  assert.ok(button(tree,'Ver resumen ↗'));
  assert.equal(storage.getItem(key),'corrupt');
});
test('a later edit reads the latest saved map and preserves dates written by another tab',()=>{
  const storage=memory(),h=app(storage),other=app(storage);
  h.call('saveLocalBarrileteDay',storage,day,{long:1,short:1});
  other.call('saveLocalBarrileteDay',storage,past,{long:2,short:0});
  h.call('saveLocalBarrileteDay',storage,day,{long:3,short:1});
  assert.deepEqual(plain(h.call('readLocalBarriletes',storage)),{[day]:{long:3,short:1},[past]:{long:2,short:0}});
});
