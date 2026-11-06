const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync(require('node:path').join(__dirname,'../app.js'),'utf8');
function harness(rows=[],day='2026-11-05'){
  const operations=[],logs=[];
  const failures={};
  const db={from(){
    let op='select',fields='*',payload,filters={};
    const query={
      select(f){fields=f;return query;},
      eq(k,v){filters[k]=v;return query;},
      insert(v){op='insert';payload=v;return query;},
      update(v){op='update';payload=v;return query;},
      then(resolve,reject){return Promise.resolve().then(()=>{
        const key=filters.key||payload?.key;
        operations.push({op,key,payload,fields});
        const error=failures[op]||failures[key];
        if(error)return {data:null,error};
        const matching=rows.filter(r=>Object.entries(filters).every(([k,v])=>r[k]===v));
        if(op==='select')return {data:matching,error:null};
        if(op==='insert'){const row={id:rows.length+1,...payload};rows.push(row);return {data:[row],error:null};}
        matching.forEach(r=>Object.assign(r,payload));return {data:matching,error:null};
      }).then(resolve,reject);}
    };return query;
  }};
  let cursor=0,effects=[];
  const slots=[];
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
      const i=cursor++,prev=slots[i];
      if(!prev||deps.some((v,j)=>!Object.is(v,prev.deps[j]))){
        const next={deps};slots[i]=next;
        effects.push(()=>{prev?.cleanup?.();next.cleanup=effect();});
      }
    }
  };
  const context=vm.createContext({Date:Clock,window:{innerWidth:1200,addEventListener(){},removeEventListener(){}},setInterval:()=>1,clearInterval(){},console:{error:(...args)=>logs.push(args)},supabase:{createClient:()=>db},React,ReactDOM:{createRoot:()=>({render(){}})},document:{getElementById(){}}});
  vm.runInContext(source,context);
  async function render(){
    let tree;
    for(let i=0;i<4;i++){
      cursor=0;effects=[];tree=context.App();effects.forEach(fn=>fn());
      await new Promise(resolve=>setImmediate(resolve));
    }
    return tree;
  }
  return {call:(f,...args)=>context[f](...args),rows,operations,failures,logs,context,render};
}
const row=(key,value,id=1)=>({id,user_id:'adrian_cronograma',key,value:JSON.stringify(value)});

function nodes(node){
  if(Array.isArray(node))return node.flatMap(nodes);
  if(!node||typeof node!=='object')return [];
  if(typeof node.type==='function')return nodes(node.type({...node.props,children:node.children}));
  return [node,...node.children.flatMap(nodes)];
}
function content(n){return n?.children?.flat(Infinity).filter(v=>typeof v==='string').join('')||'';}
const pause='2026-10-26',resume='2026-11-02';
const date=new Date('2026-11-05T12:00:00');
const pausedMission=(id,text)=>({id,text,normalizedText:text.toLowerCase(),createdAt:'2026-10-12T12:00:00Z',status:'pending',targetWeek:pause,weeksCarried:2,scheduledWeek:null,scheduledDate:null,linkedEventId:null,history:{'2026-10-19':{text,status:'unfulfilled'},[pause]:{text,status:'paused'}}});
const plain=o=>JSON.parse(JSON.stringify(o));
test('three marked missions skip penalty; earlier failure and completed mission survive repeated reconciliation',()=>{
  const h=harness(),completed={...pausedMission('done','COMPLETADA'),status:'completed',targetWeek:'2026-10-19',history:{'2026-10-19':{text:'COMPLETADA',status:'completed'}}};
  const missions=[pausedMission('a','ACCION A'),pausedMission('b','ACCION B'),pausedMission('c','ACCION C'),completed];
  const parsed=h.call('parseSecondaryMissions',missions);
  const result=plain(h.call('reconcileSecondaryMissions',parsed,{},date));
  assert.deepEqual(result[3],completed);
  for(const m of result.slice(0,3)){
    assert.equal(m.history[pause].status,'paused');assert.equal(m.history['2026-10-19'].status,'unfulfilled');
    assert.equal(m.targetWeek,resume);assert.equal(m.history[resume].status,'pending');assert.equal(m.weeksCarried,2);
  }
  assert.deepEqual(plain(h.call('reconcileSecondaryMissions',result,{},date)),result);
  assert.equal(h.call('secondaryEligibleForWeek',parsed[0],pause),false);
  assert.equal(h.call('secondaryWeekSummary',result,pause).total,0);
  assert.equal(h.call('secondaryHistoryStatus','paused').label,'Pausa');
});
test('App initial load, history navigation and reload never write events during mission rollover',async()=>{
  const calendar={'2026-10-13':[{id:'historical',cat:'legacy-id',note:'Tarjeta histórica',done:true,h:8,dur:2}],'2026-11-05':[{id:'recent',cat:'other',note:'Tarjeta reciente',done:false,h:9,dur:2}]};
  const rows=[row('events',calendar,1),row('secondaryMissions',[pausedMission('a','ACCION A')],2),row('weeklyGoalTargets',{[resume]:{}},3),row('weeklyStars',{'2026-10-12':['2026-10-13']},4),row('weeklyMissions',{'2026-10-12':[{id:'w',text:'Meta histórica',done:true}]},5)];
  const app=harness(rows);
  let tree=nodes(await app.render());
  const open=tree.find(n=>n.type==='button'&&content(n)==='Ver resumen ↗');
  assert.ok(open);open.props.onClick();
  tree=nodes(await app.render());
  const back=tree.find(n=>n.type==='button'&&n.props['aria-label']==='Semana anterior');
  assert.ok(back);back.props.onClick();
  tree=nodes(await app.render());
  assert.ok(tree.some(n=>content(n)==='Ⅱ ACCION A — Pausa'));
  assert.ok(tree.some(n=>content(n).includes('Sin acciones evaluables')));
  tree.find(n=>n.type==='button'&&n.props['aria-label']==='Semana siguiente').props.onClick();
  tree=nodes(await app.render());
  assert.ok(tree.some(n=>content(n)==='○ ACCION A — Pendiente'));
  assert.deepEqual(app.operations.filter(o=>o.op!=='select').map(o=>o.key),['secondaryMissions']);
  assert.deepEqual(JSON.parse(rows[0].value),calendar);
  const reopened=harness(rows);
  let reopenedTree=nodes(await reopened.render());
  reopenedTree.find(n=>n.type==='button'&&content(n)==='Semana').props.onClick();
  for(let i=0;i<3;i++){
    reopenedTree=nodes(await reopened.render());
    reopenedTree.find(n=>n.type==='button'&&!n.props['aria-label']&&content(n)==='←').props.onClick();
  }
  reopenedTree=nodes(await reopened.render());
  assert.ok(reopenedTree.some(n=>n.props.title?.includes('Categoría histórica no disponible · Tarjeta histórica')));
  assert.ok(reopened.operations.every(o=>o.op==='select'));
  const loaded=await reopened.call('loadFromDB');
  assert.deepEqual(plain(loaded.events),calendar);
  const neutral=reopened.call('categoryForActivity',loaded.cats,loaded.events['2026-10-13'][0].cat);
  assert.equal(neutral.name,'Categoría histórica no disponible');assert.equal(neutral.id,'legacy-id');
  assert.deepEqual(plain(loaded.weeklyStars),{'2026-10-12':['2026-10-13']});
  assert.deepEqual(plain(loaded.weeklyMissions),{'2026-10-12':[{id:'w',text:'Meta histórica',done:true}]});
});
test('App with failed initial read never starts a calendar or default write',async()=>{
  const h=harness();h.failures.select=new Error('offline');
  assert.ok(nodes(await h.render()).some(n=>content(n)==='Reintentar carga'));
  assert.deepEqual(h.operations.map(o=>o.op),['select']);
});
test('editing the current week cannot recalculate untouched historical star records',()=>{
  const h=harness();
  const history={'2026-10-12':['2026-10-13']},before={'2026-11-05':[{done:false}]},after={'2026-11-05':[{done:true}]};
  assert.deepEqual(plain(h.call('updateStarsForChangedWeeks',before,after,history)),{...history,[resume]:['2026-11-05']});
});

test('load errors/null response never become an empty successful calendar',async()=>{
  const h=harness();h.failures.select={code:'42501',message:'permission denied',details:'RLS',hint:'Check policy'};
  await assert.rejects(h.call('loadFromDB'),e=>e.code==='42501');
  assert.equal(h.operations.filter(o=>o.op!=='select').length,0);
  assert.equal(h.logs[0][1].code,'42501');
});
test('successful zero-row load provides valid defaults',async()=>{
  const result=await harness().call('loadFromDB');
  assert.equal(Object.keys(result.events).length,0);assert.ok(result.weeklyGoalTargets);assert.equal(result.secondaryMissions.length,0);
});
test('null response is not interpreted as an empty table',async()=>{
  const h=harness();
  vm.runInContext("sb.from=()=>({select(){return this},eq:async()=>({data:null,error:null})})",h.context);
  await assert.rejects(h.call('loadFromDB'),/Respuesta de carga inválida/);
});
test('ambiguous duplicate values fail closed independent of row order; identical duplicates load',async()=>{
  const rows=[row('events',{},1),row('events',{'2026-10-27':[{id:'old',h:9,dur:2}]},2)];
  for(const values of [rows,[...rows].reverse()])await assert.rejects(harness(values).call('loadFromDB'),e=>e.code==='CONFLICTING_DUPLICATES');
  assert.equal(Object.keys((await harness([row('events',{},1),row('events',{},2)]).call('loadFromDB')).events).length,0);
});
test('corrupt events and weekly targets fail closed instead of writing empty replacements',async()=>{
  for(const key of ['events','weeklyGoalTargets']){
    const h=harness([{...row(key,{}),value:'invalid JSON'}]);
    await assert.rejects(h.call('loadFromDB'),e=>e.code==='INVALID_STORED_DATA');
    assert.equal(h.operations.length,1);
  }
});
for(const count of [0,1,3])test(`save with ${count} existing rows confirms insert/update without singular queries`,async()=>{
  const h=harness(Array.from({length:count},(_,i)=>row('events',{},i+1)));
  const value={'2026-10-28':[{id:'new',h:8,dur:2}]};
  await h.call('saveToDB','events',value);
  assert.equal(h.operations[1].op,count?'update':'insert');
  assert.equal(h.rows.length,count||1);
  assert.ok(h.rows.every(r=>r.value===JSON.stringify(value)));
});
for(const op of ['select','insert','update'])test(`${op} errors propagate without an unsafe fallback insert`,async()=>{
  const h=harness(op==='update'?[row('events',{})]:[]);
  h.failures[op]=new Error(`${op} failed`);
  await assert.rejects(h.call('saveToDB','events',{}),new RegExp(`${op} failed`));
  if(op==='select')assert.equal(h.operations.length,1);
});
test('concurrent saves for a missing key serialize existence checks and insert only once',async()=>{
  const h=harness();
  await Promise.all([h.call('saveToDB','events',{version:1}),h.call('saveToDB','events',{version:2})]);
  assert.equal(h.rows.length,1);assert.equal(JSON.parse(h.rows[0].value).version,2);
  assert.equal(h.operations.filter(o=>o.op==='insert').length,1);
});
test('update with no returned rows is not reported as saved',async()=>{
  const h=harness();
  vm.runInContext(`sb.from=()=>{
    let update=false;const q={select(){return q},eq(){return q},update(){update=true;return q},then(resolve){resolve({data:update?[]:[{id:1}],error:null})}};return q;
  }`,h.context);
  await assert.rejects(h.call('saveToDB','events',{}),/no confirmó/);
});
test('browser Web Locks wraps existence check and write for the same key',async()=>{
  const h=harness(),locks=[];
  h.context.navigator={locks:{request:async(name,write)=>{locks.push(name);return write();}}};
  await h.call('saveToDB','events',{});
  assert.equal(locks.length,1);assert.ok(locks[0].endsWith(':events'));
});
test('controller is inactive after initial load failure and refuses all default writes',async()=>{
  const h=harness();h.failures.select=new Error('offline');
  const controller=h.call('createPersistenceController',(...args)=>h.call('saveToDB',...args));
  await assert.rejects(h.call('loadFromDB'));
  assert.equal(controller.enqueue({events:{},weeklyGoalTargets:{},weeklyStars:{},secondaryMissions:[]}),false);
  await controller.flush();assert.equal(h.operations.length,1);
});
test('newer events received while an older save is in flight always win',async()=>{
  let release,started;
  const entered=new Promise(r=>started=r),gate=new Promise(r=>release=r),writes=[],states=[];
  const controller=harness().call('createPersistenceController',async(key,value)=>{
    if(value.version===1){started();await gate;}writes.push([key,value]);
  },s=>states.push(s));
  controller.activate();controller.enqueue({events:{version:1}});await entered;
  controller.enqueue({events:{version:2},weeklyStars:{week:['day']}});
  controller.enqueue({events:{version:3}});release();
  while(controller.hasPending())await new Promise(r=>setImmediate(r));
  assert.equal(writes.filter(([key])=>key==='events').at(-1)[1].version,3);
  assert.equal(writes.filter(([key])=>key==='events').length,2);
  assert.equal(states.at(-1).pending,0);assert.equal(states.at(-1).error,null);
});
test('weekly target failure retains latest pending state; retry saves targets, missions and events',async()=>{
  const h=harness([row('weeklyGoalTargets',{old:1})]);h.failures.weeklyGoalTargets=new Error('offline');
  const states=[],c=h.call('createPersistenceController',(...args)=>h.call('saveToDB',...args),s=>states.push(s));
  c.activate();c.enqueue({weeklyGoalTargets:{old:1,new:2},secondaryMissions:[{id:'m'}],events:{day:[{id:'e',secondaryMissionId:'m'}]}});
  await c.flush();await new Promise(r=>setImmediate(r));
  assert.equal(JSON.parse(h.rows[0].value).old,1);assert.equal(states.at(-1).error.key,'weeklyGoalTargets');assert.equal(c.hasPending(),true);
  c.enqueue({events:{day:[{id:'latest',secondaryMissionId:'m'}]}});
  assert.ok(states.at(-1).error); // An unrelated edit cannot turn a failed save green.
  delete h.failures.weeklyGoalTargets;await c.retry();
  assert.equal(c.hasPending(),false);
  assert.equal(JSON.parse(h.rows.find(r=>r.key==='events').value).day[0].id,'latest');
  assert.equal(JSON.parse(h.rows.find(r=>r.key==='secondaryMissions').value)[0].id,'m');
  assert.equal(JSON.parse(h.rows[0].value).new,2);
});
test('queue snapshots cannot mutate under a delayed write',async()=>{
  const seen=[],c=harness().call('createPersistenceController',async(k,v)=>seen.push(v));
  const events={day:[{id:'a'}]};c.activate();c.enqueue({events});events.day[0].id='mutated';
  await c.flush();assert.equal(seen[0].day[0].id,'a');
});
