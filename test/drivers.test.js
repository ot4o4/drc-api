'use strict';
/* Livreurs gérés par le gérant, verrouillage, confidentialité et promo — reprise du 08/11/2026. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const PORT = 19780 + Math.floor(Math.random() * 1000);
const BASE = `http://127.0.0.1:${PORT}`;
const ADMIN = { 'X-Admin-Token': 'admin-test-code' };
const ENV_DRIVER = { 'X-Admin-Token': 'DRC-1111-2222' };
let dir, proc;

async function start() {
  fs.mkdirSync(dir, { recursive: true });
  fs.copyFileSync(path.join(__dirname, '..', 'server.js'), path.join(dir, 'server.js'));
  proc = spawn(process.execPath, [path.join(dir, 'server.js')], {
    env: { ...process.env, PORT: String(PORT), ADMIN_TOKEN: 'admin-test-code', DRIVER_TOKEN: 'DRC-1111-2222',
      DRIVER_ID: 'driver-1', DRIVER_NAME: 'Modou Fall', DRIVER_PHONE: '+221 77 000 00 01', RENDER_EXTERNAL_URL: '' },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  for (let i = 0; i < 50; i++) {
    try { const r = await fetch(BASE + '/api/health'); if (r.ok) return; } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('server did not start');
}
async function stop() { if (proc && !proc.killed) { proc.kill(); await new Promise((r) => proc.once('exit', r)); } }
const json = (headers = {}) => ({ 'Content-Type': 'application/json', ...headers });
let seq = 0;
function payload(extra = {}) {
  seq += 1;
  return {
    customer: { name: 'Awa Diop', phone: '+221 77 123 45 ' + String(10 + seq), zone: 'Ouakam', address: 'Rue OKM-12, Ouakam', lat: 14.72, lng: -17.48 },
    items: [{ id: 1, qty: 2 }], payment_method: 'cod', client_order_id: 'cid-' + seq + '-' + Date.now(), ...extra
  };
}
async function create(body = payload()) {
  const r = await fetch(BASE + '/api/orders', { method: 'POST', headers: json(), body: JSON.stringify(body) });
  assert.equal(r.status, 201);
  return (await r.json()).order;
}
async function patchOrder(id, body) {
  return fetch(BASE + '/api/admin/orders/' + id, { method: 'PATCH', headers: json(ADMIN), body: JSON.stringify(body) });
}

test.before(async () => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'drc-drivers-')); await start(); });
test.after(async () => { await stop(); fs.rmSync(dir, { recursive: true, force: true }); });

test('le livreur principal existe dès le démarrage et le santé le signale', async () => {
  const h = await (await fetch(BASE + '/api/health')).json();
  assert.equal(h.drivers.configured, true);
  assert.ok(h.depot && h.depot.lat && h.boot && h.boot.id);
  const r = await fetch(BASE + '/api/admin/drivers', { headers: ADMIN });
  const { drivers } = await r.json();
  assert.equal(drivers[0].id, 'driver-1');
  assert.equal(drivers[0].name, 'Modou Fall');
  assert.equal(drivers[0].code, 'DRC-1111-2222');
});

test('les rafraîchissements du livreur ne bloquent jamais l’espace gérant', async () => {
  for (let i = 0; i < 14; i++) {
    const r = await fetch(BASE + '/api/driver/orders', { headers: ENV_DRIVER });
    assert.equal(r.status, 200);
  }
  assert.equal((await fetch(BASE + '/api/admin/stats', { headers: ADMIN })).status, 200);
});

test('code livreur tolérant à la casse, aux espaces et aux tirets', async () => {
  for (const code of ['drc-1111-2222', 'DRC 1111 2222', 'drc11112222']) {
    const r = await fetch(BASE + '/api/driver/orders', { headers: { 'X-Admin-Token': code } });
    assert.equal(r.status, 200, code);
    assert.equal((await r.json()).driver.name, 'Modou Fall');
  }
});

test('le gérant crée un livreur, l’attribue, change son code et le désactive', async () => {
  const created = await fetch(BASE + '/api/admin/drivers', { method: 'POST', headers: json(ADMIN), body: JSON.stringify({ name: 'Ibrahima Ndiaye', phone: '+221 78 000 00 02' }) });
  assert.equal(created.status, 201);
  const drv = (await created.json()).driver;
  assert.match(drv.code, /^DRC-\d{4}-\d{4}$/);

  const mine = await create(), other = await create();
  assert.equal((await patchOrder(mine.id, { driver_id: drv.id, status: 'preparing' })).status, 200);
  assert.equal((await patchOrder(other.id, { driver_id: 'driver-1' })).status, 200);

  const me = { 'X-Admin-Token': drv.code };
  const list = await (await fetch(BASE + '/api/driver/orders', { headers: me })).json();
  assert.deepEqual(list.orders.map((o) => o.id), [mine.id]);
  assert.equal(list.orders[0].driver.name, 'Ibrahima Ndiaye');
  assert.equal(list.orders[0].customer.address, 'Rue OKM-12, Ouakam');
  assert.equal(list.orders[0].customer_token, undefined);
  assert.equal((await fetch(BASE + '/api/driver/orders/' + other.id, { method: 'PATCH', headers: json(me), body: JSON.stringify({ status: 'shipping' }) })).status, 403);

  const reset = await (await fetch(BASE + '/api/admin/drivers/' + drv.id, { method: 'PATCH', headers: json(ADMIN), body: JSON.stringify({ reset_code: true }) })).json();
  assert.notEqual(reset.driver.code, drv.code);
  assert.equal((await fetch(BASE + '/api/driver/orders', { headers: me })).status, 401);
  assert.equal((await fetch(BASE + '/api/driver/orders', { headers: { 'X-Admin-Token': reset.driver.code } })).status, 200);

  await fetch(BASE + '/api/admin/drivers/' + drv.id, { method: 'PATCH', headers: json(ADMIN), body: JSON.stringify({ active: false }) });
  assert.equal((await fetch(BASE + '/api/driver/orders', { headers: { 'X-Admin-Token': reset.driver.code } })).status, 401);
  assert.equal((await patchOrder(other.id, { driver_id: drv.id })).status, 400);
});

test('récupération dès la confirmation, livraison en espèces encaissée par le livreur', async () => {
  const o = await create();
  assert.equal(o.status, 'confirmed');
  await patchOrder(o.id, { driver_id: 'driver-1' });
  const pick = await fetch(BASE + '/api/driver/orders/' + o.id, { method: 'PATCH', headers: json(ENV_DRIVER), body: JSON.stringify({ status: 'shipping' }) });
  assert.equal(pick.status, 200);
  const done = await (await fetch(BASE + '/api/driver/orders/' + o.id, { method: 'PATCH', headers: json(ENV_DRIVER), body: JSON.stringify({ status: 'delivered' }) })).json();
  assert.equal(done.order.status, 'delivered');
  assert.equal(done.order.payment_status, 'cod_collected');
  const pay = await fetch(BASE + '/api/admin/orders/' + o.id + '/payment', { method: 'POST', headers: json(ADMIN), body: JSON.stringify({ action: 'confirm' }) });
  assert.equal((await pay.json()).order.payment_status, 'paid');
});

test('une requête refusée ne modifie pas la commande', async () => {
  const o = await create();
  const r = await patchOrder(o.id, { status: 'shipping' });
  assert.equal(r.status, 400);
  const fresh = (await (await fetch(BASE + '/api/admin/orders', { headers: ADMIN })).json()).orders.find((x) => x.id === o.id);
  assert.equal(fresh.status, 'confirmed');
});

test('le gérant refuse un paiement avec motif : commande annulée', async () => {
  const o = await create(payload({ payment_method: 'wave' }));
  const r = await fetch(BASE + '/api/admin/orders/' + o.id + '/payment', { method: 'POST', headers: json(ADMIN), body: JSON.stringify({ action: 'refuse', reason: 'Aucun transfert reçu' }) });
  const body = await r.json();
  assert.equal(body.order.status, 'cancelled');
  assert.equal(body.order.payment_refusal_reason, 'Aucun transfert reçu');
});

test('suivi public sans adresse ni GPS, jeton jamais exposé hors création', async () => {
  const o = await create();
  const pub = (await (await fetch(BASE + '/api/orders/' + o.id)).json()).order;
  assert.equal(pub.customer.address, undefined);
  assert.equal(pub.customer.lat, undefined);
  assert.equal(pub.customer.name, undefined);
  const adm = (await (await fetch(BASE + '/api/admin/orders', { headers: ADMIN })).json()).orders;
  assert.ok(adm.every((x) => x.customer_token === undefined));
  const own = (await (await fetch(BASE + '/api/orders/' + o.id, { headers: { 'X-Order-Token': o.customer_token } })).json()).order;
  assert.equal(own.customer.address, 'Rue OKM-12, Ouakam');
});

test('client connecté : conversation sur tous ses appareils', async () => {
  const reg = await fetch(BASE + '/api/auth/register', { method: 'POST', headers: json(), body: JSON.stringify({ name: 'Fatou Sall', phone: '77 555 44 33', password: 'secret123' }) });
  assert.equal(reg.status, 201);
  const { token } = await reg.json();
  const o = await create(payload({ customer: { name: 'Fatou Sall', phone: '+221 77 555 44 33', zone: 'Mermoz', lat: 14.7, lng: -17.47 } }));
  const bearer = { Authorization: 'Bearer ' + token };
  const sent = await fetch(BASE + `/api/orders/${o.id}/messages`, { method: 'POST', headers: json(bearer), body: JSON.stringify({ text: 'Je suis au portail bleu' }) });
  assert.equal(sent.status, 201);
  assert.equal((await sent.json()).sender_role, 'customer');
  const intruder = await fetch(BASE + `/api/orders/${o.id}/messages`);
  assert.equal(intruder.status, 403);
});

test('code promo du site (promo_code) appliqué, puis refusé sans bloquer la commande', async () => {
  const phone = '+221 76 111 22 33';
  const first = await create(payload({ promo_code: 'TERANGA', customer: { name: 'Promo Test', phone, zone: 'Plateau', lat: 14.67, lng: -17.43 } }));
  assert.equal(first.discount, Math.round(9000 * 0.15));
  const second = await create(payload({ promo_code: 'TERANGA', customer: { name: 'Promo Test', phone, zone: 'Plateau', lat: 14.67, lng: -17.43 } }));
  assert.equal(second.discount, 0);
  assert.equal(second.promo_rejected, 'already_used');
});

test('restauration : livreurs conservés et livreur principal garanti', async () => {
  const backup = await (await fetch(BASE + '/api/admin/backup', { headers: ADMIN })).json();
  assert.ok(backup.counts.drivers >= 2);
  const wiped = { ...backup.db, drivers: [] };
  const r = await fetch(BASE + '/api/admin/restore', { method: 'POST', headers: json(ADMIN), body: JSON.stringify({ db: wiped }) });
  assert.equal(r.status, 200);
  assert.equal((await fetch(BASE + '/api/driver/orders', { headers: ENV_DRIVER })).status, 200);
  await fetch(BASE + '/api/admin/restore', { method: 'POST', headers: json(ADMIN), body: JSON.stringify(backup) });
  const after = await (await fetch(BASE + '/api/admin/drivers', { headers: ADMIN })).json();
  assert.equal(after.drivers.length, backup.counts.drivers);
});
