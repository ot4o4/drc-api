'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {spawn}=require('node:child_process');

const PORT=18780+Math.floor(Math.random()*1000);
const BASE=`http://127.0.0.1:${PORT}`;
let dir,proc;
const admin={'X-Admin-Token':'admin-test'};
const driver={'X-Admin-Token':'driver-test'};

async function start(){
  fs.mkdirSync(dir,{recursive:true});
  fs.copyFileSync(path.join(__dirname,'..','server.js'),path.join(dir,'server.js'));
  proc=spawn(process.execPath,[path.join(dir,'server.js')],{env:{...process.env,PORT:String(PORT),ADMIN_TOKEN:'admin-test',DRIVER_TOKEN:'driver-test',DRIVER_ID:'driver-1'},stdio:['ignore','pipe','pipe']});
  for(let i=0;i<50;i++){
    try{const r=await fetch(BASE+'/api/health');if(r.ok)return;}catch{}
    await new Promise(r=>setTimeout(r,100));
  }
  throw new Error('server did not start');
}
async function stop(){if(proc&&!proc.killed){proc.kill();await new Promise(r=>proc.once('exit',r));}}
function payload(){return {customer:{name:'Test Client',phone:'+221770000001',zone:'Dakar',address:'Test',lat:14.735,lng:-17.47},items:[{id:1,name:'Faux prix',price:0,qty:1}],payment_method:'cod',client_order_id:'client-uuid-1'};}
async function create(body=payload()){
  const r=await fetch(BASE+'/api/orders',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  assert.equal(r.status,201);return (await r.json()).order;
}
async function assign(id,driverId='driver-1'){
  const r=await fetch(BASE+'/api/admin/orders/'+id,{method:'PATCH',headers:{...admin,'Content-Type':'application/json'},body:JSON.stringify({driver:{id:driverId,name:'Modou',phone:'+221770000002'}})});
  assert.equal(r.status,200);
}
async function message(id,text,headers){return fetch(BASE+`/api/orders/${id}/messages`,{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify({text})});}

test.before(async()=>{dir=fs.mkdtempSync(path.join(os.tmpdir(),'drc-sync-'));await start();});
test.after(async()=>{await stop();fs.rmSync(dir,{recursive:true,force:true});});

test('prix, frais et idempotence sont contrôlés par le serveur',async()=>{
  const order=await create();
  assert.equal(order.subtotal,4500);assert.equal(order.delivery_fee,2000);assert.equal(order.total,6500);
  assert.ok(order.customer_token.length>=32);
  const retry=await fetch(BASE+'/api/orders',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload())});
  assert.equal(retry.status,200);assert.equal((await retry.json()).order.id,order.id);
});

test('rôles, attribution et transitions livreur',async()=>{
  const own=await create({...payload(),client_order_id:'own-order'}),other=await create({...payload(),client_order_id:'other-order'});
  await assign(own.id);await assign(other.id,'driver-2');
  const list=await fetch(BASE+'/api/driver/orders',{headers:driver});
  assert.equal(list.status,200);assert.deepEqual((await list.json()).orders.map(o=>o.id),[own.id]);
  assert.equal((await fetch(BASE+'/api/admin/orders',{headers:driver})).status,401);
  const premature=await fetch(BASE+'/api/driver/orders/'+own.id,{method:'PATCH',headers:{...driver,'Content-Type':'application/json'},body:JSON.stringify({status:'delivered'})});
  assert.equal(premature.status,409);
});

test('messagerie client/livreur et paiement confirmé',async()=>{
  const order=await create({...payload(),client_order_id:'chat-order'});await assign(order.id);
  const customer={'X-Order-Token':order.customer_token};
  assert.equal((await message(order.id,'Bonjour',customer)).status,201);
  assert.equal((await message(order.id,'Usurpation',{...driver,'X-Message-Role':'admin'})).status,403);
  assert.equal((await message(order.id,'Réponse',{...driver,'X-Message-Role':'driver'})).status,201);
  const history=await fetch(BASE+`/api/orders/${order.id}/messages`,{headers:customer});
  assert.deepEqual((await history.json()).map(m=>m.sender_role),['customer','driver']);
  const paid=await fetch(BASE+'/api/admin/orders/'+order.id,{method:'PATCH',headers:{...admin,'Content-Type':'application/json'},body:JSON.stringify({payment_confirmed:true})});
  assert.equal((await paid.json()).order.payment_confirmed,true);
});

test('la fenêtre par défaut inclut le 201e message',async()=>{
  const order=await create({...payload(),client_order_id:'long-chat'});const headers={'X-Order-Token':order.customer_token};
  for(let i=1;i<=201;i++)assert.equal((await message(order.id,'m'+i,headers)).status,201);
  const r=await fetch(BASE+`/api/orders/${order.id}/messages`,{headers:headers});const rows=await r.json();
  assert.equal(rows.length,200);assert.equal(rows[0].text,'m2');assert.equal(rows.at(-1).text,'m201');
});

test('commande et messages persistent après redémarrage',async()=>{
  const order=await create({...payload(),client_order_id:'persistent-order'});
  await message(order.id,'Persistant',{'X-Order-Token':order.customer_token});
  await stop();await start();
  const r=await fetch(BASE+`/api/orders/${order.id}/messages`,{headers:{'X-Order-Token':order.customer_token}});
  assert.equal(r.status,200);assert.equal((await r.json())[0].text,'Persistant');
});
