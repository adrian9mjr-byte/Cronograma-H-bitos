const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync(require('node:path').join(__dirname,'../app.js'),'utf8');
class Clock extends Date {constructor(...args){super(...(args.length?args:['2026-10-13T08:00:00']));}static now(){return new Clock().getTime();}}
const database={};
const context=vm.createContext({Date:Clock,supabase:{createClient:()=>database},React:{createElement(){}},ReactDOM:{createRoot:()=>({render(){}})},document:{getElementById(){}}});
vm.runInContext(source,context);
const call=(fn,...args)=>context[fn](...args);
const now=new Clock(),firstWeek=new Clock('2026-10-05T08:00:00');
let serial=0;
const add=(missions,text,date=now)=>call('addSecondaryLines',missions,text,date,()=>`mission_${++serial}`);

test('batch schedules five pending missions on updated days without overlaps or duplicates',()=>{
  const missions=add([],'A\nB\nC\nD\nE').missions,events={};
  const result=call('scheduleSecondaryBatch',missions,events,missions.map(m=>m.id),now,()=>0);
  assert.equal(result.scheduled.length,5);assert.equal(result.failed.length,0);
  assert.equal(Object.keys(events).length,0);
  const rows=Object.entries(result.events);
  assert.equal(rows.length,5);
  assert.equal(new Set(rows.flatMap(([,es])=>es.map(e=>e.secondaryMissionId))).size,5);
  result.missions.forEach(m=>{
    assert.equal(m.status,'scheduled');assert.equal(m.targetWeek,'2026-10-12');
    assert.equal(m.history['2026-10-12'].status,'scheduled');assert.equal(m.history['2026-10-19'],undefined);
  });
  const repeated=call('scheduleSecondaryBatch',result.missions,result.events,missions.map(m=>m.id),now,()=>0);
  assert.equal(repeated.scheduled.length,0);
  assert.equal(Object.values(repeated.events).flat().length,5);
});

function fullWeekExcept(holes){
  const events={};
  for(const d of call('getWeekDays',now)){
    const dk=call('dateKey',d);events[dk]=[];
    for(let m=360;m<1440;m+=30){
      if((holes[dk]||[]).some(start=>m>=start&&m<start+60)) continue;
      events[dk].push({id:`busy_${dk}_${m}`,h:Math.floor(m/60),half:m%60===30,dur:1});
    }
  }
  return events;
}

test('batch repeats a day with three free hours between secondary missions',()=>{
  const missions=add([],'A\nB').missions;
  const events=fullWeekExcept({'2026-10-14':[480,720]});
  const result=call('scheduleSecondaryBatch',missions,events,missions.map(m=>m.id),now,()=>0);
  assert.equal(result.scheduled.length,2);
  const placed=result.events['2026-10-14'].filter(e=>e.secondaryMissionId);
  assert.equal(call('slotToMinutes',placed[1].h,placed[1].half)-call('eventEndMinutes',placed[0]),180);
});

test('partial batch retargets only successes, keeps two failures pending and excludes other states',()=>{
  const missions=add([],'A\nB\nC\nD\nE\nScheduled\nCompleted\nCancelled').missions;
  ['scheduled','completed','cancelled'].forEach((status,i)=>missions[i+5].status=status);
  const events=fullWeekExcept({'2026-10-14':[480,720,960]});
  const result=call('scheduleSecondaryBatch',missions,events,missions.map(m=>m.id),now,()=>0);
  assert.equal(result.scheduled.length,3);assert.equal(result.failed.length,2);
  assert.equal(Object.values(result.events).flat().filter(e=>e.secondaryMissionId).length,3);
  for(const failed of result.failed){
    const m=result.missions.find(m=>m.id===failed.id);
    assert.equal(m.status,'pending');assert.equal(m.targetWeek,'2026-10-19');assert.equal(m.linkedEventId,null);
  }
  assert.equal(result.missions[6].status,'completed');assert.equal(result.missions[7].status,'cancelled');
  assert.ok(!result.scheduled.includes(missions[5].id));
  assert.ok(!result.scheduled.includes(missions[6].id));
  assert.ok(!result.scheduled.includes(missions[7].id));
});

test('batch skips already linked pending mission and leaves unselected missions untouched',()=>{
  const missions=add([],'A\nB').missions;
  const events={'2026-10-14':[call('secondaryEvent',missions[0],'2026-10-14',480,'existing')]};
  const result=call('scheduleSecondaryBatch',missions,events,[missions[0].id],now,()=>0);
  assert.equal(Object.values(result.events).flat().length,1);
  assert.equal(result.missions[1].targetWeek,'2026-10-19');assert.equal(result.missions[1].status,'pending');
});

test('organizer reports planner and secondary failures with accurate count and unchanged constraints',()=>{
  context.__events=fullWeekExcept({});
  context.__missions=add([],'Sin espacio').missions.map(m=>({...m,targetWeek:'2026-10-12'}));
  const functions=source.slice(source.indexOf('  function getPlannerWeekDays()'),source.indexOf('  function reprogramEvent('));
  const result=vm.runInContext(`(()=>{
    const events=__events,cursor=today(),secondaryRef={current:__missions},goalTargets={...DEFAULT_GOAL_TARGETS};
    let failures,message,finalEvents;
    const persistSecondary=()=>{},setEvts=e=>finalEvents=e,setView=()=>{},setCursor=()=>{};
    const setPlannerFailures=items=>failures=items,setPlannerMsg=value=>message=value;
    ${functions}
    organizePlannerWeek();
    return {failures,message,finalEvents};
  })()`,context);
  assert.ok(result.failures.some(item=>item.type==='planner'&&item.label));
  const secondary=result.failures.filter(item=>item.type==='secondary');
  assert.equal(secondary.length,1);assert.equal(secondary[0].label,'Sin espacio');
  assert.equal(secondary[0].reason,'No queda un bloque futuro libre de 1 hora esta semana.');
  assert.ok(result.message.includes(`${result.failures.length} actividad(es)`));
  assert.equal(Object.values(result.finalEvents).flat().filter(e=>!e.fixed&&e.planner).length,0);
  assert.ok(result.failures.filter(item=>item.type==='planner').every(item=>item.reason==='No queda un bloque compatible con sus días, horario y conflictos actuales.'));
});

test('multiline import cleans bullets, appends, and deduplicates only active exact text',()=>{
  let result=add([], 'Lavar moto\nlavar ropa\nCortarme el pelo');
  assert.equal(result.added,3);
  result=add(result.missions,' LAVAR   MOTO\n• Comprar shampoo\n\n* lavar ropa\n-   ');
  assert.equal(result.added,1);assert.equal(result.duplicates,2);assert.equal(result.missions.length,4);
  const closed=result.missions.map(m=>({...m,status:m.text==='Lavar moto'?'completed':'cancelled'}));
  assert.equal(add(closed,'lavar moto\nComprar shampoo').added,2);
  assert.equal(add([],'Comprar candado\nComprar candado para moto').added,2);
});
test('safe parsing supports old, missing, corrupt and malformed data',()=>{
  for(const value of [undefined,'broken','{}','null','[null,{"id":3}]']) assert.equal(call('parseSecondaryMissions',value).length,0);
  const rows=add([],'Acción').missions;
  assert.equal(call('parseSecondaryMissions',JSON.stringify(rows))[0].id,rows[0].id);
});
test('random scheduling spreads first across days, then prefers three-hour separation',()=>{
  const events={},week=call('getWeekDays',now),ids=[];
  for(let i=0;i<5;i++){
    const slot=call('pickSecondarySlot',events,week,now,()=>0);
    ids.push(slot.dk);
    const e=call('secondaryEvent',{id:`m${i}`,text:'Action'},slot.dk,slot.m,`e${i}`);
    events[slot.dk]=[...(events[slot.dk]||[]),e];assert.equal(e.dur,2);
  }
  assert.equal(new Set(ids).size,5);
  const oneDay=[week[1]],dk=call('dateKey',week[1]);
  const second=call('pickSecondarySlot',events,oneDay,now,()=>0);
  const previous=call('slotToMinutes',events[dk][0].h,events[dk][0].half);
  assert.ok(second.m-previous>=240); // Una hora de actividad y tres horas de separación libre.
});
test('schedule respects now, visible hours, conflicts and fixed buffers; full weeks return null',()=>{
  const week=call('getWeekDays',now),dk=call('dateKey',now);
  const events={[dk]:[{id:'fixed',h:8,half:false,dur:2,fixed:true}]};
  const slot=call('pickSecondarySlot',events,[now],now,()=>0);
  assert.equal(slot.m,570);assert.equal(slot.dk,dk);
  for(const d of week) events[call('dateKey',d)]=[{h:6,half:false,dur:36}];
  assert.equal(call('pickSecondarySlot',events,week,now,()=>0),null);
  assert.equal(call('pickSecondarySlot',{},[new Clock('2026-10-12')],now,()=>0),null);
  const nearEnd=new Clock('2026-10-13T23:30:00');
  assert.equal(call('pickSecondarySlot',{},[nearEnd],nearEnd,()=>0),null);
});
test('day selection is independent of each day slot count',()=>{
  const a=new Clock('2026-10-14T12:00:00'),b=new Clock('2026-10-15T12:00:00');
  const events={'2026-10-15':[{h:7,half:false,dur:34}]};
  const picked=call('pickSecondarySlot',events,[a,b],now,()=>.5);
  assert.equal(picked.dk,'2026-10-15');
});
test('rollover keeps one ID and immutable previous outcomes; repeated rollover is idempotent',()=>{
  const m=add([],'Coser ropa',firstWeek).missions[0];
  const event=call('secondaryEvent',m,'2026-10-06',600,'event1');
  let rows=call('reconcileSecondaryMissions',[m],{'2026-10-06':[event]},firstWeek);
  assert.equal(rows[0].status,'scheduled');
  rows=call('rolloverSecondaryMissions',rows,now);
  assert.equal(rows[0].status,'pending');assert.equal(rows[0].weeksCarried,1);
  assert.equal(rows[0].history['2026-10-05'].status,'unfulfilled');
  assert.equal(rows[0].id,m.id);assert.equal(rows[0].linkedEventId,null);
  assert.equal(call('rolloverSecondaryMissions',rows,now)[0].weeksCarried,1);
  const thirdWeek=new Clock('2026-10-20T12:00:00');
  rows=call('rolloverSecondaryMissions',rows,thirdWeek);
  const done={...event,id:'event3',done:true};
  rows=call('reconcileSecondaryMissions',rows,{'2026-10-06':[event],'2026-10-20':[done]},thirdWeek);
  assert.equal(rows[0].weeksCarried,2);assert.equal(rows[0].status,'completed');
  assert.equal(rows[0].history['2026-10-05'].status,'unfulfilled');
  assert.equal(rows[0].history['2026-10-12'].status,'unfulfilled');
  assert.equal(rows[0].history['2026-10-19'].status,'completed');
  assert.equal(call('rolloverSecondaryMissions',rows,new Clock('2026-11-01'))[0].status,'completed');
});
test('moving, deleting and toggling a linked event update one mission and dynamic stars',()=>{
  const m=add([],'Lavar moto').missions[0],event=call('secondaryEvent',m,'2026-10-13',600,'linked');
  const normal={id:'normal',h:8,dur:2,done:true};
  let events={'2026-10-13':[normal,event]},rows=call('reconcileSecondaryMissions',[m],events,now);
  assert.equal(call('completedDaysForWeek',events,now).length,0);
  events['2026-10-13'][1]={...event,done:true};rows=call('reconcileSecondaryMissions',rows,events,now);
  assert.equal(rows[0].status,'completed');assert.equal(call('completedDaysForWeek',events,now).length,1);
  events['2026-10-13'][1]=event;rows=call('reconcileSecondaryMissions',rows,events,now);
  assert.equal(rows[0].status,'scheduled');
  const moved=call('eventsAfterDrop',events,{type:'existing',dk:'2026-10-13',id:'linked'},'2026-10-14',10,false);
  assert.equal(moved.changed,true);rows=call('reconcileSecondaryMissions',rows,moved.events,now);
  assert.equal(rows.length,1);assert.equal(rows[0].scheduledDate,'2026-10-14');assert.equal(rows[0].linkedEventId,'linked');
  assert.equal(call('completedDaysForWeek',moved.events,now).length,1);
  delete moved.events['2026-10-14'];rows=call('reconcileSecondaryMissions',rows,moved.events,now);
  assert.equal(rows[0].status,'pending');assert.equal(rows[0].id,m.id);
  const cancelled={...rows[0],status:'cancelled'};
  assert.equal(call('reconcileSecondaryMissions',[cancelled],events,now)[0].status,'cancelled');
});
test('reprogram options and invalid drag preserve mission link and source',()=>{
  const m=add([],'Action').missions[0],event=call('secondaryEvent',m,'2026-10-13',600,'linked');
  const slot=call('pickRandomReprogramSlot',{},call('getWeekDays',now),2,'2026-10-13',[],now,()=>0);
  assert.notEqual(slot.dk,'2026-10-13');
  const moved={...event,...call('minutesToSlot',slot.m)};
  assert.equal(call('reconcileSecondaryMissions',[m],{[slot.dk]:[moved]},now)[0].id,m.id);
  const events={'2026-10-13':[event],'2026-10-14':[{h:10,dur:2,fixed:true}]};
  const invalid=call('eventsAfterDrop',events,{type:'existing',dk:'2026-10-13',id:'linked'},'2026-10-14',10,false);
  assert.equal(invalid.changed,false);assert.equal(invalid.events,events);
});

test('when separation is impossible scheduling uses the remaining conflict-free block',()=>{
  const day=new Clock('2026-10-14T12:00:00');
  const events={'2026-10-14':[{h:6,dur:2,secondaryMissionId:'existing'},{h:8,dur:32}]};
  const slot=call('pickSecondarySlot',events,[day],now,()=>0);
  assert.equal(slot.m,420);
});
test('archived cards cannot be dragged into a later week',()=>{
  const event=call('secondaryEvent',{id:'archived',text:'Action'},'2026-10-06',600,'old');
  const events={'2026-10-06':[event]};
  const result=call('eventsAfterDrop',events,{type:'existing',dk:'2026-10-06',id:'old'},'2026-10-14',10,false);
  assert.equal(result.changed,false);assert.equal(result.events,events);
});
test('database loading keeps safe fallback and tolerates missing or corrupt mission JSON',async()=>{
  for(const response of [{data:null,error:{message:'offline'}},{data:[],error:null},{data:[{key:'secondaryMissions',value:'corrupt'}],error:null}]){
    database.from=()=>({select(){return this},eq:async()=>response});
    const loaded=await call('loadFromDB');
    assert.equal(loaded.secondaryMissions.length,0);
    assert.equal(Object.keys(loaded.events).length,0);
    assert.ok(loaded.weeklyGoalTargets);
  }
});
test('persistence propagates query and write errors instead of reporting false success',async()=>{
  database.from=()=>({select(){return this},eq(){return this},maybeSingle:async()=>({data:null,error:new Error('offline')})});
  await assert.rejects(call('saveToDB','secondaryMissions',[]),/offline/);
  database.from=()=>({select(){return this},eq(){return this},maybeSingle:async()=>({data:null,error:null}),insert:async()=>({error:new Error('write failed')})});
  await assert.rejects(call('saveToDB','secondaryMissions',[]),/write failed/);
});

test('capture defaults to next week and never records a missed capture week',()=>{
  const captured=new Clock('2026-10-14T12:00:00');
  const m=add([],'Lavar moto',captured).missions[0];
  assert.equal(m.targetWeek,'2026-10-19');assert.equal(m.weeksCarried,0);
  assert.equal(m.history['2026-10-12'],undefined);
  const unchanged=call('rolloverSecondaryMissions',[m],captured)[0];
  assert.equal(unchanged.targetWeek,'2026-10-19');assert.equal(unchanged.weeksCarried,0);
  const targetStarted=call('rolloverSecondaryMissions',[m],new Clock('2026-10-19T12:00:00'))[0];
  assert.equal(targetStarted.weeksCarried,0);assert.equal(targetStarted.history['2026-10-12'],undefined);
});
test('first true rollover is after target week and remains idempotent',()=>{
  const m=add([],'Lavar moto',new Clock('2026-10-14T12:00:00')).missions[0];
  const rows=call('rolloverSecondaryMissions',[m],new Clock('2026-10-26T12:00:00'));
  assert.equal(rows[0].targetWeek,'2026-10-26');assert.equal(rows[0].weeksCarried,1);
  assert.equal(rows[0].history['2026-10-19'].status,'unfulfilled');
  assert.equal(rows[0].history['2026-10-12'],undefined);
  const repeated=call('rolloverSecondaryMissions',rows,new Clock('2026-10-29T12:00:00'));
  assert.equal(repeated[0].weeksCarried,1);
});
test('program this week changes target only when a linked event is inserted',()=>{
  const captured=new Clock('2026-10-14T12:00:00'),m=add([],'Lavar moto',captured).missions[0];
  const event=call('secondaryEvent',m,'2026-10-15',600,'now');
  const changed=call('reconcileSecondaryMissions',[m],{'2026-10-15':[event]},captured)[0];
  assert.equal(changed.targetWeek,'2026-10-12');assert.equal(changed.status,'scheduled');
  assert.equal(changed.history['2026-10-12'].status,'scheduled');
  assert.equal(changed.history['2026-10-19'],undefined);
  assert.equal(call('rolloverSecondaryMissions',[changed],new Clock('2026-10-19T12:00:00'))[0].weeksCarried,1);
  assert.equal(call('reconcileSecondaryMissions',[m],{},captured)[0].targetWeek,'2026-10-19');
});
test('manual future date targets its own week without capture-week history',()=>{
  const captured=new Clock('2026-10-14T12:00:00'),m=add([],'Action',captured).missions[0];
  for(const dk of ['2026-10-22','2026-10-29']){
    const event=call('secondaryEvent',m,dk,600,dk);
    const scheduled=call('reconcileSecondaryMissions',[m],{[dk]:[event]},captured)[0];
    assert.equal(scheduled.targetWeek,call('weekKeyFromDate',new Clock(dk+'T12:00:00')));
    assert.equal(Object.keys(scheduled.history).length,1);
    assert.equal(scheduled.history['2026-10-12'],undefined);assert.equal(scheduled.weeksCarried,0);
  }
});
test('closed app rolls all missed target weeks and completion preserves their results',()=>{
  const m=add([],'Coser ropa',new Clock('2026-10-14T12:00:00')).missions[0];
  const reopened=new Clock('2026-11-02T12:00:00');
  const rows=call('rolloverSecondaryMissions',[m],reopened);
  assert.equal(rows[0].weeksCarried,2);assert.equal(rows[0].targetWeek,'2026-11-02');
  assert.equal(rows[0].history['2026-10-12'],undefined);
  assert.equal(rows[0].history['2026-10-19'].status,'unfulfilled');
  assert.equal(rows[0].history['2026-10-26'].status,'unfulfilled');
  assert.equal(call('rolloverSecondaryMissions',rows,reopened)[0].weeksCarried,2);
  const event={...call('secondaryEvent',m,'2026-11-03',600,'done'),done:true};
  const completed=call('reconcileSecondaryMissions',rows,{'2026-11-03':[event]},reopened)[0];
  assert.equal(completed.history['2026-11-02'].status,'completed');
  assert.equal(completed.history['2026-10-19'].status,'unfulfilled');
  assert.equal(completed.history['2026-10-26'].status,'unfulfilled');
});
test('organizer eligibility excludes future targets and includes outstanding earlier targets',()=>{
  const m=add([],'Action',new Clock('2026-10-14T12:00:00')).missions[0];
  assert.equal(call('secondaryEligibleForWeek',m,'2026-10-12'),false);
  assert.equal(call('secondaryEligibleForWeek',m,'2026-10-19'),true);
  assert.equal(call('secondaryEligibleForWeek',m,'2026-10-26'),true);
  assert.equal(call('secondaryEligibleForWeek',{...m,status:'scheduled'},'2026-10-19'),false);
});
test('initial PR records migrate targets safely and generic drops cannot create orphans',()=>{
  const m=add([],'Action',new Clock('2026-10-14T12:00:00')).missions[0];
  const {targetWeek,...legacy}=m;
  legacy.carryWeek='2026-10-12';legacy.history={'2026-10-12':{text:m.text,status:'pending'}};
  const parsed=call('parseSecondaryMissions',[legacy])[0];
  assert.equal(parsed.targetWeek,'2026-10-19');assert.equal(parsed.carryWeek,undefined);
  assert.equal(parsed.history['2026-10-12'],undefined);
  assert.equal(call('parseSecondaryMissions',[{...legacy,status:'scheduled',scheduledWeek:'2026-10-12'}])[0].targetWeek,'2026-10-12');
  const events={};const drop=call('eventsAfterDrop',events,{type:'new',catId:'secondary'},'2026-10-14',10,false);
  assert.equal(drop.changed,false);assert.equal(drop.events,events);
});
test('history status labels distinguish pending, scheduled, unfulfilled, completed and cancelled',()=>{
  for(const [state,icon,label,color] of [
    ['pending','○','Pendiente','#581c87'],
    ['scheduled','◷','Programada','#6b21a8'],
    ['unfulfilled','○','No cumplida','#581c87'],
    ['completed','✓','Completada','#15803d'],
    ['cancelled','✕','Cancelada','#6b7280']
  ]){
    const display=call('secondaryHistoryStatus',state);
    assert.equal(display.icon,icon);assert.equal(display.label,label);assert.equal(display.color,color);
  }
});
