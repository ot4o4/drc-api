// Parcours complet client → gérant → livreur → client, sur une API locale (aucun appel à la production).
// usage : node tools/e2e.mjs <webBase> <apiBase> <codeGerant> <codeLivreur> <dossierCaptures> [portCDP]
import { writeFileSync, mkdirSync } from 'node:fs';

const [WEB, API, ADMIN_CODE, DRIVER_CODE, OUT, CDP_PORT = '9334'] = process.argv.slice(2);
mkdirSync(OUT, { recursive: true });
const checks = [];
const errors = [];
const ok = (name, cond, detail = '') => { checks.push({ name, ok: Boolean(cond), detail }); console.log((cond ? '✔ ' : '✖ ') + name + (detail ? ' — ' + detail : '')); };

const list = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json();
const page = list.find((t) => t.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r));
let seq = 0; const pending = new Map();
ws.addEventListener('message', (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); return; }
  if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails?.exception?.description || m.params.exceptionDetails?.text);
  if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error' && !/favicon|tile\.openstreetmap|nominatim|routing\.openstreetmap|ERR_NAME|net::ERR_/.test(m.params.entry.text + (m.params.entry.url || ''))) errors.push(m.params.entry.text + ' ' + (m.params.entry.url || ''));
});
const send = (method, params = {}) => new Promise((res, rej) => { const i = ++seq; pending.set(i, (m) => (m.error ? rej(new Error(method + ' ' + JSON.stringify(m.error))) : res(m.result))); ws.send(JSON.stringify({ id: i, method, params })); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function ev(expression) {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true, userGesture: true });
  if (r.exceptionDetails) throw new Error('JS: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text) + '\n   in: ' + expression.slice(0, 160));
  return r.result.value;
}
async function waitFor(expression, timeout = 15000, label = expression) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    try { if (await ev(expression)) return true; } catch {}
    await sleep(250);
  }
  throw new Error('Délai dépassé : ' + label);
}
async function go(url) { await send('Page.navigate', { url }); await sleep(1800); }
async function shot(name) {
  const s = await send('Page.captureScreenshot', { format: 'png', fromSurface: true });
  writeFileSync(`${OUT}/${name}.png`, Buffer.from(s.data, 'base64'));
}
async function typeInto(selector, text) {
  await ev(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); el.focus(); el.value = ''; return true; })()`);
  await send('Input.insertText', { text });
}
async function click(selector) {
  const box = await ev(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return null; el.scrollIntoView({block:'center'}); const r = el.getBoundingClientRect(); return {x: r.x + r.width / 2, y: r.y + r.height / 2}; })()`);
  if (!box) throw new Error('Élément absent : ' + selector);
  await sleep(150);
  for (const type of ['mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', { type, x: box.x, y: box.y, button: 'left', clickCount: 1 });
}

await send('Page.enable'); await send('Runtime.enable'); await send('Log.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });

try {
  /* ---------------- 1. Client : commande réelle par le tunnel du site ---------------- */
  await go(WEB + '/');
  await ev(`(() => { localStorage.clear(); sessionStorage.clear(); localStorage.setItem('drc_api', ${JSON.stringify(API)}); return true; })()`);
  await go(WEB + '/');
  await waitFor('typeof apiOnline !== "undefined" && apiOnline === true && PRODUCTS.length > 0', 20000, 'API en ligne côté client');
  await ev(`(() => { addToCart(PRODUCTS.find(p => p.id === 1), 2, 0); openCheckout(); return true; })()`);
  await waitFor('typeof mapPicks !== "undefined" && !!mapPicks.ck', 20000, 'carte du tunnel');
  await typeInto('#ck-name', 'Awa Diop');
  await typeInto('#ck-phone', '77 123 45 67');
  await ev(`(() => { applyPick('ck', 14.7108, -17.4677, '', true); return true; })()`);
  await waitFor(`!!(mapPicks.ck._addr && mapPicks.ck._addr.label)`, 12000, 'adresse inverse').catch(() => {});
  await click('.pay[data-method="cod"]');
  await click('#ck-confirm');
  await waitFor(`document.getElementById('page-success') && document.getElementById('page-success').classList.contains('open') || /DRC-\\d{4}-\\d{4}/.test(document.getElementById('success-card').innerText)`, 20000, 'écran de confirmation');
  const orderId = await ev(`(document.getElementById('success-card').innerText.match(/DRC-\\d{4}-\\d{4}/) || [''])[0]`);
  ok('client : commande créée via le tunnel', /DRC-\d{4}-\d{4}/.test(orderId), orderId);
  const tokenSaved = await ev(`!!(JSON.parse(localStorage.getItem('drc_order_tokens') || '{}')[${JSON.stringify(orderId)}])`);
  ok('client : jeton de suivi mémorisé', tokenSaved);
  await shot('1-client-confirmation');

  /* ---------------- 2. Gérant : réception, livreurs, attribution ---------------- */
  await go(WEB + '/admin/');
  await typeInto('#code', ADMIN_CODE);
  await click('.gate-card button[type=submit]');
  await waitFor(`!document.getElementById('app').classList.contains('hidden') && document.getElementById('orders-body').innerText.includes(${JSON.stringify(orderId)})`, 15000, 'commande visible chez le gérant');
  ok('gérant : la commande arrive dans la liste', true);
  ok('gérant : logo chargé (chemin absolu)', await ev(`(() => { const i = document.querySelector('header.top img'); return i.complete && i.naturalWidth > 0; })()`));
  ok('gérant : « Livreur à attribuer » signalé', await ev(`document.getElementById('orders-body').innerText.includes('Livreur à attribuer')`));
  await shot('2-gerant-commandes');

  await click('.tab[data-tab="drivers"]');
  await waitFor(`document.querySelectorAll('#drivers-grid .drv-card').length >= 1`, 10000, 'cartes livreurs');
  await ev(`(() => { [...document.querySelectorAll('#drivers-grid .drv-card button')].find(b => b.textContent.includes('Afficher le code')).click(); return true; })()`);
  await sleep(300);
  const shownCode = await ev(`document.querySelector('#drivers-grid .drv-card code').textContent`);
  ok('gérant : le code du livreur principal est lisible', shownCode === DRIVER_CODE, shownCode === DRIVER_CODE ? 'code identique à DRIVER_TOKEN' : 'différent');
  await typeInto('#drv-name', 'Ibrahima Ndiaye');
  await typeInto('#drv-phone', '+221 78 000 00 02');
  await click('.drv-add button[type=submit]');
  await waitFor(`document.getElementById('drivers-grid').innerText.includes('Ibrahima Ndiaye')`, 10000, 'nouveau livreur');
  const newCode = await ev(`(() => { const c = [...document.querySelectorAll('#drivers-grid .drv-card')].find(x => x.innerText.includes('Ibrahima')); return c.querySelector('code').textContent; })()`);
  ok('gérant : nouveau livreur créé avec un code', /^DRC-\d{4}-\d{4}$/.test(newCode), newCode);
  await shot('3-gerant-livreurs');

  await click('.tab[data-tab="orders"]');
  await ev(`(() => { [...document.querySelectorAll('.olink')].find(b => b.textContent === ${JSON.stringify(orderId)}).click(); return true; })()`);
  await waitFor(`!!document.getElementById('driver-select')`, 8000, 'fiche commande');
  await ev(`(() => { const s = document.getElementById('driver-select'); s.value = 'driver-1'; s.dispatchEvent(new Event('change')); return true; })()`);
  await click('.assign-row .btn-save');
  await waitFor(`document.getElementById('order-sheet').innerText.includes('Modou Fall')`, 8000, 'livreur attribué');
  ok('gérant : mission confiée en un clic (liste des livreurs)', true);
  await typeInto('#admin-chat-input', 'Bonjour Awa, votre commande est en préparation.');
  await ev(`(() => { [...document.querySelectorAll('#admin-chat .btn-save')].pop().click(); return true; })()`);
  await waitFor(`document.getElementById('admin-chat-messages').innerText.includes('en préparation')`, 8000, 'message gérant');
  await shot('4-gerant-fiche-commande');
  await ev(`closeOrder()`);
  await ev(`(() => { const sel = [...document.querySelectorAll('#orders-body tr')].find(tr => tr.innerText.includes(${JSON.stringify(orderId)})).querySelector('select.status'); sel.value = 'preparing'; sel.dispatchEvent(new Event('change')); return true; })()`);
  await sleep(900);

  /* ---------------- 3. Livreur : connexion, mission, carte, messages, statuts ---------------- */
  await go(WEB + '/livreur/');
  await typeInto('#lg-code', DRIVER_CODE.toLowerCase().replace(/-/g, ' '));
  await click('#lg-btn');
  await waitFor(`!document.getElementById('view-app').classList.contains('hidden') && document.getElementById('orders').innerText.includes(${JSON.stringify(orderId)})`, 15000, 'mission visible chez le livreur');
  ok('livreur : connexion avec le code (minuscules, espaces)', true);
  ok('livreur : salutation personnalisée', await ev(`document.getElementById('tournee-title').textContent.includes('Modou')`), await ev(`document.getElementById('tournee-title').textContent`));
  const cardText = await ev(`document.getElementById('orders').innerText`);
  ok('livreur : adresse réelle affichée', !cardText.includes('Adresse non renseignée'), cardText.split('\n').slice(0, 6).join(' | '));
  ok('livreur : espèces à encaisser', cardText.includes('À ENCAISSER'));
  await shot('5-livreur-missions');
  await ev(`(() => { document.querySelector('[data-action="track"][data-id=${JSON.stringify(orderId)}]').click(); return true; })()`);
  await waitFor(`document.getElementById('mission-tracking').classList.contains('open')`, 8000, 'suivi de mission');
  await waitFor(`!document.getElementById('mission-map').classList.contains('hidden') && !!document.querySelector('#mission-map .leaflet-tile-pane')`, 15000, 'carte Leaflet').catch(() => {});
  ok('livreur : carte Leaflet chargée', await ev(`!!window.L && !!document.querySelector('#mission-map.leaflet-container')`));
  await waitFor(`document.getElementById('driver-chat-messages').innerText.includes('en préparation')`, 8000, 'message du gérant visible').catch(() => {});
  ok('livreur : voit le message du gérant', await ev(`document.getElementById('driver-chat-messages').innerText.includes('en préparation')`));
  await typeInto('#driver-chat-input', 'Bonjour, je récupère votre commande, j’arrive dans 20 minutes.');
  await ev(`sendDriverMessage()`);
  await waitFor(`document.getElementById('driver-chat-messages').innerText.includes('20 minutes')`, 8000, 'message livreur');
  await shot('6-livreur-suivi');
  await ev(`(() => { document.querySelector('#tracking-action button[data-status="shipping"]').click(); return true; })()`);
  await waitFor(`!!document.querySelector('#tracking-action button[data-status="delivered"]')`, 8000, 'passage en livraison');
  ok('livreur : colis récupéré → en livraison', true);
  await ev(`(() => { document.querySelector('#tracking-action button[data-status="delivered"]').click(); return true; })()`);
  await waitFor(`document.getElementById('tracking-hero').innerText.includes('LIVRÉE')`, 8000, 'livraison confirmée');
  ok('livreur : livraison confirmée', true);

  /* ---------------- 4. Client : suivi synchronisé ---------------- */
  await go(WEB + '/');
  await waitFor('apiOnline === true', 20000, 'API client');
  await ev(`(() => { if (typeof go === 'function') go('orders'); return true; })()`);
  await waitFor(`remoteOrders.some(o => o.id === ${JSON.stringify(orderId)} && o.status === 'delivered')`, 15000, 'statut livré côté client');
  await ev(`trackOrder(${JSON.stringify(orderId)})`);
  await waitFor(`document.getElementById('chat-messages') && document.getElementById('chat-messages').innerText.includes('20 minutes')`, 10000, 'message du livreur côté client');
  const sheet = await ev(`document.getElementById('sheet-body').innerText`);
  ok('client : statut « Livrée » affiché', /Livrée/.test(sheet));
  ok('client : livreur affiché', sheet.includes('Modou Fall'));
  ok('client : messages du livreur et de la boutique', sheet.includes('20 minutes') && sheet.includes('en préparation'));
  ok('client : paiement à la livraison reconnu', (await ev(`document.getElementById('orders-list') ? document.getElementById('orders-list').innerText : ''`)).includes('Payé à la livraison'));
  await shot('7-client-suivi');

  /* ---------------- 5. Gérant : encaissement des espèces ---------------- */
  await go(WEB + '/admin/');
  await waitFor(`document.getElementById('orders-body').innerText.includes('Espèces chez le livreur')`, 15000, 'espèces chez le livreur');
  ok('gérant : espèces signalées chez le livreur', true);
  await shot('8-gerant-encaissement');
} catch (e) {
  ok('déroulé sans blocage', false, e.message);
  await shot('erreur').catch(() => {});
}

const jsErrors = errors.filter(Boolean);
ok('aucune erreur JavaScript', jsErrors.length === 0, jsErrors.slice(0, 3).join(' || '));
writeFileSync(`${OUT}/rapport.json`, JSON.stringify({ checks, errors: jsErrors }, null, 2));
const failed = checks.filter((c) => !c.ok).length;
console.log(`\n${checks.length - failed}/${checks.length} vérifications OK`);
ws.close();
process.exit(failed ? 1 : 0);
