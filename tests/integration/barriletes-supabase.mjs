// Requires explicit opt-in and two fictitious pre-provisioned Auth users.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomInt} from 'node:crypto';

const env=process.env;
const origin=new URL(env.BARRILETES_TEST_URL);
const app=readFileSync(new URL('../../app.js',import.meta.url),'utf8');
const production=new URL(app.match(/const SUPABASE_URL\s*=\s*'([^']+)'/)[1]);
assert.notEqual(origin.hostname,production.hostname,'Never use production');
assert.ok(origin.protocol==='https:'||origin.origin==='http://127.0.0.1:54321','Test use only');
assert.equal(env.BARRILETES_CONFIRM_ISOLATED,origin.origin,'Explicitly confirm the isolated project URL');
const key=env.BARRILETES_TEST_PUBLISHABLE_KEY;
assert.ok(key?.startsWith('sb_publishable_'),'Use a publishable key; do not use privileged keys');
const [ownerEmail,otherEmail]=[env.BARRILETES_TEST_OWNER_EMAIL,env.BARRILETES_TEST_OTHER_EMAIL];
assert.ok(ownerEmail&&otherEmail&&ownerEmail!==otherEmail);
assert.ok(env.BARRILETES_TEST_OWNER_PASSWORD&&env.BARRILETES_TEST_OTHER_PASSWORD);
async function request(path,{method='GET',token,body}={}){
  const response=await fetch(new URL(path,origin),{
    method,headers:{apikey:key,...(token?{Authorization:'Bearer '+token}:{}),...(body?{'Content-Type':'application/json'}:{})},
    body:body?JSON.stringify(body):undefined,redirect:'error',signal:AbortSignal.timeout(15000)
  });
  let data;try{data=await response.json();}catch{}
  return {status:response.status,data};
}
async function login(email,password){
  const r=await request('/auth/v1/token?grant_type=password',{method:'POST',body:{email,password}});
  assert.equal(r.status,200,'Login of test fixture failed');
  assert.ok(r.data?.access_token&&r.data?.refresh_token);
  return r.data;
}
const rpc=(name,body,token)=>request('/rest/v1/rpc/'+name,{method:'POST',body,token});
const week=(start,token)=>rpc('read_barriletes_week',{p_start:start},token);
const put=(day,long,short,token)=>rpc('put_barrilete_day',{p_day:day,p_long:long,p_short:short},token);
const historical=async()=>{
  const r=await request('/rest/v1/cronograma?select=id,user_id,key,value&user_id=eq.adrian_cronograma&order=id.asc');
  assert.equal(r.status,200,'Load the seven entirely synthetic fixtures through the historical path');
  assert.deepEqual(r.data.map(row=>row.key).sort(),['cats','events','goals','secondaryMissions','weeklyGoalTargets','weeklyMissions','weeklyStars']);
  return r.data;
};
const before=await historical();
let a=await login(ownerEmail,env.BARRILETES_TEST_OWNER_PASSWORD);
const b=await login(ownerEmail,env.BARRILETES_TEST_OWNER_PASSWORD);
const other=await login(otherEmail,env.BARRILETES_TEST_OTHER_PASSWORD);
try{
  const first=new Date(Date.UTC(2070,0,6+randomInt(0,1000)*7));
  const upcoming=i=>new Date(first.getTime()+i*86400000).toISOString().slice(0,10);
  const read=token=>week(upcoming(0),token);
  assert.equal((await read()).status,401);
  assert.equal((await put(upcoming(0),8,0)).status,401);
  assert.equal((await read(other.access_token)).status,403);
  assert.equal((await put(upcoming(0),8,0,other.access_token)).status,403);
  assert.equal((await read(a.access_token)).status,200);
  const saved=await Promise.all([put(upcoming(0),3,1,a.access_token),put(upcoming(1),0,2,b.access_token)]);
  assert.ok(saved.every(r=>r.status===200));
  assert.equal((await put(upcoming(0),0,0,a.access_token)).status,200);
  assert.ok((await put(upcoming(0),-1,0,a.access_token)).status>=400);
  const refreshed=await request('/auth/v1/token?grant_type=refresh_token',{method:'POST',body:{refresh_token:a.refresh_token}});
  assert.equal(refreshed.status,200);
  a=refreshed.data;
  const rows=(await read(a.access_token)).data;
  assert.deepEqual(rows.find(r=>r.day===upcoming(0)),{day:upcoming(0),long_count:0,short_count:0});
  assert.deepEqual(rows.find(r=>r.day===upcoming(1)),{day:upcoming(1),long_count:0,short_count:2});
  const forged=await request('/rest/v1/barriletes_daily',{method:'POST',token:a.access_token,
    body:{owner_uid:other.user.id,day:upcoming(2),long_count:1,short_count:1}});
  assert.equal(forged.status,403);
  assert.deepEqual(await historical(),before);
  const logout=await request('/auth/v1/logout?scope=local',{method:'POST',token:a.access_token});
  assert.ok(logout.status===200||logout.status===204);
  assert.ok((await request('/auth/v1/token?grant_type=refresh_token',{method:'POST',body:{refresh_token:a.refresh_token}})).status>=400);
  assert.equal((await read(b.access_token)).status,200);
  console.log('OK Auth sessions, refresh, local sign-out, REST/RLS, concurrent dates and unchanged historical rows.');
}finally{
  for(const t of [a,b,other])await request('/auth/v1/logout?scope=local',{method:'POST',token:t.access_token}).catch(()=>{});
}
