/**
 * Darou Rahman Chicken — API
 * Serveur Node.js SANS AUCUNE DÉPENDANCE (node:http / node:https uniquement).
 * Lancement : node server.js
 * Persistance : fichier JSON (/root/drc-api/data/db.json)
 */
'use strict';

const http = require('node:http');
const https = require('node:https');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

/* ----------------------------- Configuration ----------------------------- */

const PORT = parseInt(process.env.PORT || '8080', 10);
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'changeme';
const SHOP_PHONE = process.env.SHOP_PHONE || '+221 70 917 09 20';
// Numéros qui reçoivent Wave et Orange Money (séparés par des virgules).
const PAYMENT_NUMBERS = (process.env.PAYMENT_NUMBERS || '70 917 09 20,78 924 95 55,78 471 17 67')
  .split(',').map((s) => s.trim()).filter(Boolean);
const WAVE_API_TOKEN = process.env.WAVE_API_TOKEN || '';
const WAVE_MERCHANT_NAME = process.env.WAVE_MERCHANT_NAME || '';
const ORANGE_MERCHANT_KEY = process.env.ORANGE_MERCHANT_KEY || '';
const ORANGE_MERCHANT_TOKEN = process.env.ORANGE_MERCHANT_TOKEN || '';

const WAVE_ENABLED = Boolean(WAVE_API_TOKEN);
const ORANGE_ENABLED = Boolean(ORANGE_MERCHANT_KEY && ORANGE_MERCHANT_TOKEN);
// Liens de paiement statiques (aucun contrat API requis) : "…/m/abcd?ref={ref}" ou simple URL.
const WAVE_PAY_LINK = process.env.WAVE_PAY_LINK || '';
const ORANGE_PAY_LINK = process.env.ORANGE_PAY_LINK || '';

const DELIVERY_FEE = 2000;
const FREE_DELIVERY_FROM = 15000;
const SHOP_NAME = 'Darou Rahman Chicken';

const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

/* ------------------------------- Produits ------------------------------- */

const SEED_PRODUCTS = [
  {
    id: 1,
    name: 'Poulet Entier',
    cat: 'entier',
    img: 'p1.jpg',
    price: 7500,
    old: 9000,
    unit: 'la pièce (~1,8 kg)',
    rating: 4.9,
    sold: 1240,
    stock: 38,
    tags: [['green', 'Frais du jour'], ['yellow', 'Top vente']],
    variants: ['Entier prêt à cuire', 'Entier vidé', '4 morceaux'],
    desc: "<p>Notre fameux Poulet Bicyclette élevé en plein air dans les fermes familiales de la région de Thiès.</p><ul><li>Élevage local, nourri au maïs et aux céréales</li><li>Découpe du jour, préparé à la commande</li><li>Chaîne du froid respectée de la ferme à votre porte</li><li>Environ 1,8 kg, idéal pour 4 à 5 personnes</li></ul>"
  },
  {
    id: 2,
    name: 'Blanc de Poulet (Filet)',
    cat: 'blancs',
    img: 'p2.jpg',
    price: 6500,
    old: 7500,
    unit: 'le kg',
    rating: 4.8,
    sold: 986,
    stock: 52,
    tags: [['green', 'Riche en protéines']],
    variants: ['Filet entier', 'Filet en dés', 'Filet haché'],
    desc: "<p>Le blanc de poulet parfait pour vos recettes légères et riches en protéines.</p><ul><li>Issu d'élevages locaux du Sénégal</li><li>Découpe du jour, sans peau et sans arêtes</li><li>Chaîne du froid contrôlée jusqu'à la livraison</li><li>Conditionné au kilo, sous vide sur demande</li></ul>"
  },
  {
    id: 3,
    name: 'Pilons',
    cat: 'cuisses',
    img: 'p3.jpg',
    price: 4900,
    old: 5900,
    unit: 'le kg',
    rating: 4.8,
    sold: 2150,
    stock: 64,
    tags: [['green', 'Frais du jour'], ['red', '-17%']],
    variants: ['Mélange cuisses/pilons', 'Cuisses seules', 'Pilons seuls'],
    desc: "<p>Le morceau préféré des familles sénégalaises, tendre et savoureux.</p><ul><li>Élevage local sélectionné avec nos partenaires fermiers</li><li>Découpe du jour pour une fraîcheur garantie</li><li>Chaîne du froid maintenue de l'abattoir à votre cuisine</li><li>Parfait pour le yassa, le thiéboudienne ou le braisé</li></ul>"
  },
  {
    id: 4,
    name: 'Ailes de Poulet',
    cat: 'ailes',
    img: 'p4.jpg',
    price: 3900,
    old: 4500,
    unit: 'le kg',
    rating: 4.7,
    sold: 743,
    stock: 41,
    tags: [['yellow', 'Anti-gaspi']],
    variants: ['Ailes entières', 'Ailes coupées'],
    desc: "<p>Des ailes fraîches et charnues, parfaites pour le frit, le braisé ou les sauces.</p><ul><li>Produits issus de l'élevage local sénégalais</li><li>Découpe du jour, soigneusement préparées</li><li>Chaîne du froid respectée du début à la fin</li><li>Excellent rapport qualité-prix anti-gaspi</li></ul>"
  },
  {
    id: 5,
    name: 'Foie & Gésiers',
    cat: 'abats',
    img: 'p5.jpg',
    price: 3200,
    old: 3800,
    unit: 'le kg',
    rating: 4.6,
    sold: 412,
    stock: 27,
    tags: [['green', 'Riche en fer']],
    variants: ['Mélange', 'Foie seul', 'Gésiers seuls'],
    desc: "<p>Des abats frais, riches en fer et en nutriments, appréciés dans toute la cuisine ouest-africaine.</p><ul><li>Origine locale, élevage responsable</li><li>Découpe et nettoyage du jour</li><li>Chaîne du froid garantie jusqu'à livraison</li><li>Idéal en sauce, sautés ou grillés</li></ul>"
  },
  {
    id: 6,
    name: 'Poulet Braisé Mariné (prêt à griller)',
    cat: 'braise',
    img: 'p6.jpg',
    price: 8900,
    old: 10500,
    unit: 'le plat (~2 kg)',
    rating: 5.0,
    sold: 1876,
    stock: 22,
    tags: [['red', 'Recette du chef'], ['green', 'Prêt à cuire']],
    variants: ['Marinade Yassa', 'Marinade Kebab', 'Marinade Piment doux'],
    desc: "<p>Notre spécialité : un poulet fermier mariné par nos chefs, prêt à griller pour vos braisés de quartier.</p><ul><li>Élevage local, poulet fermier de qualité</li><li>Marinade maison préparée le jour même</li><li>Chaîne du froid respectée, livré frais</li><li>Environ 2 kg, de quoi régaler 5 à 6 convives</li></ul>"
  },
  {
    id: 7,
    name: 'Escalopes de Poulet',
    cat: 'blancs',
    img: 'p7.jpg',
    price: 6900,
    old: 7900,
    unit: 'le kg',
    rating: 4.7,
    sold: 528,
    stock: 35,
    tags: [['green', 'Frais du jour']],
    variants: ['Escalopes nature', 'Escalopes panées maison'],
    desc: "<p>Des escalopes tendres et régulières, prêtes à cuisiner en quelques minutes.</p><ul><li>Poulet d'élevage local du Sénégal</li><li>Découpe du jour, finesse régulière</li><li>Chaîne du froid maîtrisée jusqu'à votre porte</li><li>Disponibles nature ou panées maison</li></ul>"
  },
  {
    id: 8,
    name: 'Œufs Fermiers — Plateau de 30',
    cat: 'oeufs',
    img: 'p8.jpg',
    price: 5500,
    old: 6000,
    unit: 'le plateau',
    rating: 4.9,
    sold: 3210,
    stock: 80,
    tags: [['yellow', 'Top vente'], ['green', 'Fermier']],
    variants: ['Plateau de 30', 'Plateau de 15'],
    desc: "<p>Des œufs fermiers frais, pondus par nos poulettes élevées en plein air.</p><ul><li>Élevage local et responsable</li><li>Collecte et conditionnement du jour</li><li>Chaîne du froid et emballage protecteur</li><li>Plateau de 30 œufs, ou demi-plateau de 15</li></ul>"
  }
];

/* ------------------------------ Persistance ------------------------------ */

function loadDb() {
  try {
    if (fs.existsSync(DB_FILE)) {
      const raw = fs.readFileSync(DB_FILE, 'utf8');
      const db = JSON.parse(raw);
      if (!Array.isArray(db.products) || db.products.length === 0) {
        db.products = SEED_PRODUCTS;
      }
      if (!Array.isArray(db.orders)) db.orders = [];
      if (!db.sequences || typeof db.sequences !== 'object') db.sequences = {};
      return db;
    }
  } catch (e) {
    console.error('[db] Lecture impossible, réinitialisation :', e.message);
  }
  return { products: SEED_PRODUCTS, orders: [], sequences: {} };
}

function saveDb() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2), 'utf8');
  fs.renameSync(tmp, DB_FILE);
}

const db = loadDb();
saveDb();

/* -------------------------------- Helpers -------------------------------- */

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Admin-Token, x-admin-token',
    'Access-Control-Max-Age': '86400'
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > 1024 * 1024) {
        reject(new Error('payload_too_large'));
        req.destroy();
        return;
      }
      data += chunk;
    });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

function parseJsonBody(text) {
  try {
    return JSON.parse(text || '{}');
  } catch {
    return null;
  }
}

function nextOrderId() {
  const year = new Date().getFullYear();
  const key = String(year);
  const seq = (db.sequences[key] || 0) + 1;
  db.sequences[key] = seq;
  return `DRC-${year}-${String(seq).padStart(4, '0')}`;
}

function paymentInstructionsText(method) {
  const label = method === 'wave' ? 'Wave' : 'Orange Money';
  return `Envoyez le montant total à l'un de ces numéros ${label} : ${PAYMENT_NUMBERS.join(' · ')} — indiquez la référence DRC-XXXX dans le motif, puis nous confirmons votre commande.`;
}

/* Appel HTTP sortant (Wave / Orange Money), sans dépendance. */
function httpsRequest({ url, method = 'POST', headers = {}, body = null, timeoutMs = 10000 }) {
  return new Promise((resolve, reject) => {
    let parsed;
    try {
      parsed = new URL(url);
    } catch (e) {
      reject(e);
      return;
    }
    const payload = body == null ? null : (typeof body === 'string' ? body : JSON.stringify(body));
    const req = https.request(
      {
        hostname: parsed.hostname,
        port: parsed.port || 443,
        path: parsed.pathname + parsed.search,
        method,
        headers: Object.assign(
          { 'Content-Type': 'application/json', 'Accept': 'application/json' },
          payload ? { 'Content-Length': Buffer.byteLength(payload) } : {},
          headers
        ),
        timeout: timeoutMs
      },
      (res) => {
        let data = '';
        res.on('data', (c) => { data += c; });
        res.on('end', () => {
          let json = null;
          try { json = JSON.parse(data); } catch { /* réponse non-JSON */ }
          resolve({ status: res.statusCode, json, raw: data });
        });
      }
    );
    req.on('timeout', () => { req.destroy(new Error('timeout')); });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

/* Création d'un lien de paiement Wave (Checkout API). */
async function createWaveCheckout(order) {
  const res = await httpsRequest({
    url: 'https://api.wave.com/v1/checkout/sessions',
    method: 'POST',
    headers: { Authorization: `Bearer ${WAVE_API_TOKEN}` },
    body: {
      amount: String(order.total),
      currency: 'XOF',
      client_reference: order.id,
      success_url: `https://darourahman.sn/merci?ref=${encodeURIComponent(order.id)}`,
      error_url: `https://darourahman.sn/erreur?ref=${encodeURIComponent(order.id)}`,
      ...(WAVE_MERCHANT_NAME ? { business_name: WAVE_MERCHANT_NAME } : {})
    }
  });
  if (res.json && (res.json.wave_launch_url || res.json.url)) return res.json.wave_launch_url || res.json.url;
  throw new Error(`wave_error_${res.status}`);
}

/* Création d'un paiement Orange Money (Web Payment API). */
async function orangeBearerToken() {
  if (ORANGE_MERCHANT_TOKEN) return ORANGE_MERCHANT_TOKEN;
  const id = process.env.ORANGE_CLIENT_ID || '';
  const secret = process.env.ORANGE_CLIENT_SECRET || '';
  if (!id || !secret) throw new Error('credentials_missing');
  const basic = Buffer.from(`${id}:${secret}`).toString('base64');
  const tok = await httpsRequest({
    url: 'https://api.orange.com/oauth/v3/token',
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    rawBody: 'grant_type=client_credentials'
  });
  if (tok.json && tok.json.access_token) return tok.json.access_token;
  throw new Error(`orange_token_error_${tok.status}`);
}

async function createOrangePayment(order) {
  const bearer = await orangeBearerToken();
  const res = await httpsRequest({
    url: 'https://api.orange.com/orange-money-webpayment/webpayment',
    method: 'POST',
    headers: { Authorization: `Bearer ${bearer}` },
    body: {
      merchant_key: ORANGE_MERCHANT_KEY,
      currency: '952', // XOF
      order_id: order.id,
      amount: order.total,
      return_url: `https://darourahman.sn/merci?ref=${encodeURIComponent(order.id)}`,
      notif_url: `https://api.darourahman.sn/api/payments/webhook/orange_money`,
      lang: 'fr',
      reference: SHOP_NAME
    }
  });
  if (res.json && (res.json.payment_url || res.json.pay_url)) {
    return res.json.payment_url || res.json.pay_url;
  }
  throw new Error(`orange_error_${res.status}`);
}

function buildFallbackPayment(method, orderId = '') {
  const label = method === 'wave' ? 'Wave' : 'Orange Money';
  const link = method === 'wave' ? WAVE_PAY_LINK : ORANGE_PAY_LINK;
  // Lien de paiement statique (Wave Business / Orange Money) : utilisable sans contrat API.
  // Le jeton {ref} est remplacé par la référence de commande si le lien le prévoit.
  if (link) {
    return {
      type: 'link',
      url: link.replace('{ref}', encodeURIComponent(orderId)).replace('{amount}', ''),
      number: null,
      reference: orderId,
      instructions: `Paiement ${label} sécurisé. Indiquez la référence ${orderId} dans le motif.`
    };
  }
  return {
    type: 'instructions',
    url: null,
    number: PAYMENT_NUMBERS[0] || SHOP_PHONE,
    numbers: PAYMENT_NUMBERS,
    reference: '',
    instructions: `${label} : envoyez le montant total à l'un de ces numéros (${PAYMENT_NUMBERS.join(' · ')}) en indiquant la référence de votre commande dans le motif, puis nous confirmerons votre commande.`
  };
}


/* --------------------------------- Auth ---------------------------------- */

db.users = Array.isArray(db.users) ? db.users : [];
db.oauth = db.oauth || {};

function normalizePhone(v) {
  const d = String(v || '').replace(/[\s.\-()]/g, '').replace(/^00/, '+');
  const m = d.match(/^(\+?221)?7\d{8}$/);
  return m ? (d.startsWith('+') ? d : (d.length === 9 ? '+221' + d : '+' + d)) : null;
}
function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString('hex');
  return salt + ':' + crypto.scryptSync(pw, salt, 32).toString('hex');
}
function verifyPassword(pw, stored) {
  const parts = String(stored || '').split(':');
  if (parts.length !== 2) return false;
  const test = crypto.scryptSync(pw, parts[0], 32).toString('hex');
  try { return crypto.timingSafeEqual(Buffer.from(test), Buffer.from(parts[1])); }
  catch (e) { return false; }
}
function authSecret() {
  if (!db.auth_secret) { db.auth_secret = crypto.randomBytes(32).toString('hex'); saveDb(); }
  return db.auth_secret;
}
function makeToken(user) {
  const payload = Buffer.from(JSON.stringify({ uid: user.id, exp: Date.now() + 30 * 864e5 })).toString('base64url');
  const sig = crypto.createHmac('sha256', authSecret()).update(payload).digest('base64url');
  return payload + '.' + sig;
}
function userFromRequest(req) {
  const h = req.headers['authorization'] || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : '';
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  try {
    const expect = crypto.createHmac('sha256', authSecret()).update(parts[0]).digest('base64url');
    if (!crypto.timingSafeEqual(Buffer.from(parts[1]), Buffer.from(expect))) return null;
    const data = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
    if (!data.exp || data.exp < Date.now()) return null;
    return db.users.find((u) => u.id === data.uid) || null;
  } catch (e) { return null; }
}
function publicUser(u) { return { id: u.id, name: u.name, phone: u.phone }; }
function ensureGoogleUser() {
  let u = db.users.find((x) => x.google);
  if (!u) {
    u = {
      id: 'g' + Date.now().toString(36), name: 'Client Google', phone: '+221700000000',
      pass_hash: hashPassword(crypto.randomBytes(12).toString('hex')),
      google: true, created_at: new Date().toISOString()
    };
    db.users.push(u); saveDb();
  }
  return u;
}

/* -------------------------------- Routes --------------------------------- */

async function handleRequest(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = url.pathname.replace(/\/+$/, '') || '/';
  const method = req.method || 'GET';

  // CORS preflight sur toutes les routes
  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Admin-Token, x-admin-token',
      'Access-Control-Max-Age': '86400'
    });
    res.end();
    return;
  }

  try {
    /* 1. Santé */
    if (method === 'GET' && pathname === '/api/health') {
      sendJson(res, 200, {
        ok: true,
        shop: SHOP_NAME,
        payments: { wave: WAVE_ENABLED, orange_money: ORANGE_ENABLED, cod: true }
      });
      return;
    }

    /* 2. Catalogue */
    if (method === 'GET' && pathname === '/api/products') {
      sendJson(res, 200, { products: db.products.filter((p) => p.available !== false) });
      return;
    }

    /* 3. Création de commande */
    if (method === 'POST' && pathname === '/api/orders') {
      const body = parseJsonBody(await readBody(req));
      if (!body) return sendJson(res, 400, { error: 'invalid' });

      const items = Array.isArray(body.items) ? body.items : [];
      const customer = body.customer || {};
      const paymentMethod = body.payment_method;
      const allowed = ['wave', 'orange_money', 'cod'];

      if (
        items.length === 0 ||
        !customer.name || typeof customer.name !== 'string' || !customer.name.trim() ||
        !customer.phone || typeof customer.phone !== 'string' || !customer.phone.trim() ||
        !allowed.includes(paymentMethod)
      ) {
        return sendJson(res, 400, { error: 'invalid' });
      }

      const cleanItems = items.map((it) => ({
        id: Number(it.id) || 0,
        name: String(it.name || ''),
        price: Number(it.price) || 0,
        qty: Math.max(1, Number(it.qty) || 1),
        variant: String(it.variant || '')
      }));

      const subtotal = cleanItems.reduce((sum, it) => sum + it.price * it.qty, 0);
      const deliveryFee = subtotal < FREE_DELIVERY_FROM ? DELIVERY_FEE : 0;
      const total = subtotal + deliveryFee;

      const orderId = nextOrderId();
      const order = {
        id: orderId,
        status: 'pending',
        created_at: new Date().toISOString(),
        items: cleanItems,
        customer: {
          name: customer.name.trim(),
          phone: customer.phone.trim(),
          zone: String(customer.zone || ''),
          note: String(customer.note || '')
        },
        payment_method: paymentMethod,
        subtotal,
        delivery_fee: deliveryFee,
        total,
        payment: null
      };

      if (paymentMethod === 'cod') {
        order.status = 'confirmed';
        order.payment = {
          type: 'instructions',
          url: null,
          number: null,
          reference: orderId,
          instructions: 'Paiement à la livraison : préparez le montant total en espèces, notre livreur vous remet la commande contre paiement.'
        };
      } else {
        const label = paymentMethod === 'wave' ? 'Wave' : 'Orange Money';
        let url = null;
        try {
          if (paymentMethod === 'wave' && WAVE_ENABLED) {
            url = await createWaveCheckout(order);
          } else if (paymentMethod === 'orange_money' && ORANGE_ENABLED) {
            url = await createOrangePayment(order);
          } else {
            throw new Error('credentials_missing');
          }
        } catch (e) {
          console.error(`[paiement] Échec ${label} (${e.message}) → fallback instructions`);
          url = null;
        }

        if (url) {
          order.status = 'awaiting_payment';
          order.payment = {
            type: 'link',
            url,
            number: null,
            reference: orderId,
            instructions: `Cliquez sur le lien ${label} pour payer votre commande en toute sécurité.`
          };
        } else {
          const fallback = buildFallbackPayment(paymentMethod, orderId);
          order.status = fallback.type === 'link' ? 'awaiting_payment' : 'awaiting_payment_manual';
          order.payment = fallback;
          if (fallback.type === 'link') {
            console.log(`[paiement] ${label} via lien statique pour ${orderId}`);
          } else {
            order.payment.instructions = paymentInstructionsText(paymentMethod).replace('DRC-XXXX', orderId);
          }
        }
      }

      db.orders.push(order);
      saveDb();
      return sendJson(res, 201, { order });
    }

    /* 5. Commandes par téléphone (doit être testé avant /api/orders/:id) */
    if (method === 'GET' && pathname === '/api/orders' && url.searchParams.has('phone')) {
      const phone = url.searchParams.get('phone').trim();
      const orders = db.orders.filter((o) => o.customer && o.customer.phone === phone);
      return sendJson(res, 200, { orders });
    }

    /* 4. Détail d'une commande */
    const orderMatch = pathname.match(/^\/api\/orders\/([^/]+)$/);
    if (method === 'GET' && orderMatch) {
      const id = decodeURIComponent(orderMatch[1]);
      const order = db.orders.find((o) => o.id === id);
      if (!order) return sendJson(res, 404, { error: 'not_found' });
      return sendJson(res, 200, { order });
    }

    /* 6. Administration */
    if (method === 'GET' && pathname === '/api/admin/orders') {
      const token = req.headers['x-admin-token'];
      if (!token || token !== ADMIN_TOKEN) {
        return sendJson(res, 401, { error: 'unauthorized' });
      }
      return sendJson(res, 200, { orders: db.orders });
    }

    /* 6b. Administration — statistiques, statuts de commande, produits */
    const isAdminReq = String(req.headers['x-admin-token'] || '') === ADMIN_TOKEN;

    if (method === 'GET' && pathname === '/api/admin/stats') {
      if (!isAdminReq) return sendJson(res, 401, { error: 'unauthorized' });
      const today = new Date().toISOString().slice(0, 10);
      const todays = db.orders.filter((o) => String(o.created_at || '').slice(0, 10) === today);
      const revenue = todays
        .filter((o) => o.status !== 'cancelled')
        .reduce((sum, o) => sum + (Number(o.total) || 0), 0);
      const countBy = {};
      db.orders.forEach((o) => { countBy[o.status || 'pending'] = (countBy[o.status || 'pending'] || 0) + 1; });
      return sendJson(res, 200, {
        today_orders: todays.length,
        today_revenue: revenue,
        total_orders: db.orders.length,
        pending: db.orders.filter((o) => ['pending', 'confirmed', 'preparing', 'awaiting_payment_manual', 'awaiting_payment'].includes(o.status || 'pending')).length,
        shipping: db.orders.filter((o) => o.status === 'shipping').length,
        by_status: countBy,
        products: db.products.length,
        low_stock: db.products.filter((p) => Number(p.stock) > 0 && Number(p.stock) <= 5).length
      });
    }

    const adminOrderMatch = pathname.match(/^\/api\/admin\/orders\/([^/]+)$/);
    if (adminOrderMatch && (method === 'PATCH' || method === 'POST')) {
      if (!isAdminReq) return sendJson(res, 401, { error: 'unauthorized' });
      const id = decodeURIComponent(adminOrderMatch[1]);
      const order = db.orders.find((o) => o.id === id);
      if (!order) return sendJson(res, 404, { error: 'not_found' });
      const body = parseJsonBody(await readBody(req)) || {};
      const allowed = ['pending', 'confirmed', 'preparing', 'shipping', 'delivered', 'cancelled', 'paid'];
      if (body.status) {
        if (!allowed.includes(body.status)) return sendJson(res, 400, { error: 'invalid_status' });
        order.status = body.status;
      }
      if (typeof body.note === 'string') order.admin_note = body.note.slice(0, 500);
      order.updated_at = new Date().toISOString();
      if (body.status === 'delivered') order.delivered_at = order.updated_at;
      saveDb();
      return sendJson(res, 200, { order });
    }

    if (method === 'GET' && pathname === '/api/admin/products') {
      if (!isAdminReq) return sendJson(res, 401, { error: 'unauthorized' });
      return sendJson(res, 200, {
        products: db.products.map((p) => ({
          id: p.id, name: p.name, cat: p.cat, price: p.price, old: p.old,
          stock: p.stock, unit: p.unit, available: p.available !== false
        }))
      });
    }

    const adminProductMatch = pathname.match(/^\/api\/admin\/products\/([^/]+)$/);
    if (adminProductMatch && (method === 'PATCH' || method === 'POST')) {
      if (!isAdminReq) return sendJson(res, 401, { error: 'unauthorized' });
      const id = decodeURIComponent(adminProductMatch[1]);
      const product = db.products.find((p) => String(p.id) === id);
      if (!product) return sendJson(res, 404, { error: 'not_found' });
      const body = parseJsonBody(await readBody(req)) || {};
      if (body.price !== undefined) {
        const price = Number(body.price);
        if (!Number.isFinite(price) || price < 0) return sendJson(res, 400, { error: 'invalid_price' });
        product.price = Math.round(price);
      }
      if (body.stock !== undefined) {
        const stock = Number(body.stock);
        if (!Number.isFinite(stock) || stock < 0) return sendJson(res, 400, { error: 'invalid_stock' });
        product.stock = Math.round(stock);
      }
      if (body.available !== undefined) product.available = Boolean(body.available);
      if (typeof body.name === 'string' && body.name.trim()) product.name = body.name.trim().slice(0, 80);
      product.updated_at = new Date().toISOString();
      saveDb();
      return sendJson(res, 200, {
        product: { id: product.id, name: product.name, price: product.price,
          stock: product.stock, available: product.available !== false }
      });
    }

    /* 6c. Sauvegarde / restauration (utile quand l'hébergeur n'a pas de disque) */
    if (method === 'GET' && pathname === '/api/admin/backup') {
      if (!isAdminReq) return sendJson(res, 401, { error: 'unauthorized' });
      return sendJson(res, 200, {
        version: 1,
        exported_at: new Date().toISOString(),
        counts: { products: db.products.length, orders: db.orders.length, users: (db.users || []).length },
        db
      });
    }

    if (method === 'POST' && pathname === '/api/admin/restore') {
      if (!isAdminReq) return sendJson(res, 401, { error: 'unauthorized' });
      const body = parseJsonBody(await readBody(req)) || {};
      const incoming = body.db || body;
      if (!incoming || !Array.isArray(incoming.products) || !Array.isArray(incoming.orders)) {
        return sendJson(res, 400, { error: 'invalid_backup' });
      }
      db.products = incoming.products;
      db.orders = incoming.orders;
      db.users = Array.isArray(incoming.users) ? incoming.users : [];
      db.sequences = incoming.sequences && typeof incoming.sequences === 'object' ? incoming.sequences : {};
      db.oauth = incoming.oauth && typeof incoming.oauth === 'object' ? incoming.oauth : {};
      if (typeof incoming.auth_secret === 'string' && incoming.auth_secret) db.auth_secret = incoming.auth_secret;
      saveDb();
      return sendJson(res, 200, {
        ok: true,
        counts: { products: db.products.length, orders: db.orders.length, users: db.users.length }
      });
    }

    /* 7. Webhook paiements (stub — voir README) */
    const webhookMatch = pathname.match(/^\/api\/payments\/webhook\/([^/]+)$/);
    if (method === 'POST' && webhookMatch) {
      const bodyText = await readBody(req);
      const waveSecret = process.env.WAVE_WEBHOOK_SECRET || '';
      if (webhookMatch[1] === 'wave' && waveSecret) {
        const sig = String(req.headers['wave-signature'] || '');
        const m = sig.match(/t=(\d+),v1=([a-f0-9]+)/i);
        const ok = m && Math.abs(Date.now() / 1000 - Number(m[1])) < 300 &&
          crypto.createHmac('sha256', waveSecret).update(m[1] + '.' + bodyText).digest('hex') === m[2];
        if (!ok) return sendJson(res, 401, { error: 'bad_signature' });
      }
      const body = parseJsonBody(bodyText);
      let reference = null;
      if (body && typeof body === 'object') {
        if (typeof body.reference === 'string') reference = body.reference;
        else if (body.metadata && typeof body.metadata.reference === 'string') reference = body.metadata.reference;
      }
      if (reference) {
        const order = db.orders.find((o) => o.id === reference || (o.payment && o.payment.reference === reference));
        if (order) {
          order.status = 'paid';
          order.paid_at = new Date().toISOString();
          saveDb();
        }
      }
      return sendJson(res, 200, { ok: true });
    }

    /* 8. Authentification */
    if (pathname === '/api/auth/register' && method === 'POST') {
      const body = parseJsonBody(await readBody(req)) || {};
      const name = String(body.name || '').trim();
      const phone = normalizePhone(body.phone);
      const password = String(body.password || '');
      if (name.length < 3 || !phone || password.length < 6) return sendJson(res, 400, { error: 'invalid' });
      if (db.users.some((u) => u.phone === phone)) return sendJson(res, 409, { error: 'phone_exists' });
      const user = { id: 'u' + Date.now().toString(36) + Math.floor(Math.random() * 999), name, phone, pass_hash: hashPassword(password), created_at: new Date().toISOString() };
      db.users.push(user); saveDb();
      return sendJson(res, 201, { token: makeToken(user), user: publicUser(user) });
    }
    if (pathname === '/api/auth/login' && method === 'POST') {
      const body = parseJsonBody(await readBody(req)) || {};
      const phone = normalizePhone(body.phone);
      const password = String(body.password || '');
      const user = phone ? db.users.find((u) => u.phone === phone) : null;
      if (!user || !verifyPassword(password, user.pass_hash)) return sendJson(res, 401, { error: 'invalid_credentials' });
      return sendJson(res, 200, { token: makeToken(user), user: publicUser(user) });
    }
    if (pathname === '/api/auth/me' && method === 'GET') {
      const user = userFromRequest(req);
      if (!user) return sendJson(res, 401, { error: 'unauthorized' });
      return sendJson(res, 200, { user: publicUser(user) });
    }
    if (pathname === '/api/auth/google/start' && method === 'POST') {
      const state = crypto.randomBytes(12).toString('hex');
      db.oauth[state] = { status: 'pending', created: Date.now() };
      saveDb();
      return sendJson(res, 200, { demo: true, state });
    }
    const gDemo = pathname.match(/^\/api\/auth\/google\/demo\/([^/]+)$/);
    if (method === 'GET' && gDemo) {
      const state = decodeURIComponent(gDemo[1]);
      if (db.oauth[state]) {
        const user = ensureGoogleUser();
        db.oauth[state] = { status: 'done', token: makeToken(user), user: publicUser(user) };
        saveDb();
      }
      return sendJson(res, 200, { ok: true });
    }
    const gStatus = pathname.match(/^\/api\/auth\/google\/status\/([^/]+)$/);
    if (method === 'GET' && gStatus) {
      const st = db.oauth[decodeURIComponent(gStatus[1])];
      if (!st) return sendJson(res, 200, { status: 'failed' });
      return sendJson(res, 200, st.status === 'done' ? { status: 'done', token: st.token, user: st.user } : { status: st.status });
    }

    sendJson(res, 404, { error: 'not_found' });
  } catch (e) {
    console.error('[serveur] Erreur :', e);
    if (!res.headersSent) sendJson(res, 500, { error: 'server_error' });
  }
}

const server = http.createServer((req, res) => {
  handleRequest(req, res);
});

server.listen(PORT, () => {
  console.log(`${SHOP_NAME} — API démarrée sur http://localhost:${PORT}`);
  console.log(`Paiements : Wave=${WAVE_ENABLED ? 'activé' : 'non configuré'} | Orange Money=${ORANGE_ENABLED ? 'activé' : 'non configuré'} | Paiement à la livraison=activé`);
});
