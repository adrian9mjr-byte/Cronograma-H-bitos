const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync(require('node:path').join(__dirname,'../app.js'),'utf8');
function harness(rows=[]){
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
  const context=vm.createContext({console:{error:(...args)=>logs.push(args)},supabase:{createClient:()=>db},React:{createElement(){}},ReactDOM:{createRoot:()=>({render(){}})},document:{getElementById(){}}});
  vm.runInContext(source,context);
  return {call:(f,...args)=>context[f](...args),rows,operations,failures,logs,context};
}
const row=(key,value,id=1)=>({id,user_id:'adrian_cronograma',key,value:JSON.stringify(value)});

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
