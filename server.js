/**
 * Darou Rahman Chicken — API
 * Serveur Node.js SANS AUCUNE DÉPENDANCE (node:http / node:https uniquement).
 * Lancement : node server.js
 * Persistance : fichier JSON (data/db.json à côté de server.js)
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
/* Livreur principal défini sur l'hébergeur (toujours disponible, même après une remise à zéro
   de la base). Les autres livreurs se créent dans l'espace gérant (db.drivers). */
const DRIVER_TOKEN = process.env.DRIVER_TOKEN || '';
const DRIVER_ID = process.env.DRIVER_ID || 'driver-1';
const DRIVER_NAME = process.env.DRIVER_NAME || 'Livreur DRC';
const DRIVER_PHONE = process.env.DRIVER_PHONE || '';
/* Point de départ des tournées (itinéraire du portail livreur). */
const DEPOT = {
  lat: Number(process.env.DEPOT_LAT) || 14.757605,
  lng: Number(process.env.DEPOT_LNG) || -17.445161,
  label: process.env.DEPOT_LABEL || 'Dépôt DRC · Parcelles Assainies U20'
};
const BOOT_ID = Date.now().toString(36) + '-' + Math.floor(Math.random() * 1e6).toString(36);
const BOOTED_AT = new Date().toISOString();
const IS_HOSTED = Boolean(process.env.RENDER || process.env.NODE_ENV === 'production');
if (IS_HOSTED && (!process.env.ADMIN_TOKEN || ADMIN_TOKEN === 'changeme')) {
  console.error('[sécurité] ADMIN_TOKEN manquant ou par défaut — démarrage refusé.');
  process.exit(1);
}
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

/* Push de la commande au gérant (facultatif : sans variables, rien n'est envoyé). */
const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const TELEGRAM_CHAT = process.env.TELEGRAM_CHAT_ID || '';
const ORDER_WEBHOOK = process.env.ORDER_WEBHOOK_URL || '';
const SHOP_NAME = 'Darou Rahman Chicken';
/* URL publique de l'API (retours de paiement, webhooks). */
const PUBLIC_API = (process.env.PUBLIC_API_URL || process.env.RENDER_EXTERNAL_URL || 'https://drc-api-dj8t.onrender.com').replace(/\/+$/, '');
const APP_SCHEME = 'drcchicken';

/* Codes promo — le code TERANGA est annoncé dans l'application. */
const PROMOS = {
  TERANGA: { percent: 15, min_subtotal: 5000, first_order_only: true, label: '-15% sur votre 1re commande' }
};

const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

/* ------------------------------- Produits ------------------------------- */

const SEED_PRODUCTS = [
  {
    id: 1,
    name: 'Poulet Entier',
    cat: 'entier',
    img: 'p1.jpg',
    price: 4500,
    old: 0,
    unit: 'la pièce (~1,7 kg)',
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
    price: 5000,
    old: 0,
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
    old: 0,
    unit: 'le kg',
    rating: 4.8,
    sold: 2150,
    stock: 64,
    tags: [['green', 'Frais du jour']],
    variants: ['Mélange cuisses/pilons', 'Cuisses seules', 'Pilons seuls'],
    desc: "<p>Le morceau préféré des familles sénégalaises, tendre et savoureux.</p><ul><li>Élevage local sélectionné avec nos partenaires éleveurs</li><li>Découpe du jour pour une fraîcheur garantie</li><li>Chaîne du froid maintenue de l'abattoir à votre cuisine</li><li>Parfait pour le yassa, le thiéboudienne ou le braisé</li></ul>"
  },
  {
    id: 4,
    name: 'Ailes de Poulet',
    cat: 'ailes',
    img: 'p4.jpg',
    price: 3900,
    old: 0,
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
    old: 0,
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
    old: 0,
    unit: 'le plat (~2 kg)',
    rating: 5.0,
    sold: 1876,
    stock: 22,
    tags: [['red', 'Recette du chef'], ['green', 'Prêt à cuire']],
    variants: ['Marinade Yassa', 'Marinade Kebab', 'Marinade Piment doux'],
    desc: "<p>Notre spécialité : un poulet frais mariné par nos chefs, prêt à griller pour vos braisés de quartier.</p><ul><li>Élevage local, poulet frais de qualité</li><li>Marinade maison préparée le jour même</li><li>Chaîne du froid respectée, livré frais</li><li>Environ 2 kg, de quoi régaler 5 à 6 convives</li></ul>"
  },
  {
    id: 7,
    name: 'Escalopes de Poulet',
    cat: 'blancs',
    img: 'p7.jpg',
    price: 6900,
    old: 0,
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
    name: 'Œufs Frais — Plateau de 30',
    cat: 'oeufs',
    img: 'p8.jpg',
    price: 3000,
    old: 0,
    unit: 'le plateau',
    rating: 4.9,
    sold: 3210,
    stock: 80,
    tags: [['yellow', 'Top vente'], ['green', 'Frais']],
    variants: ['Plateau de 30', 'Plateau de 15'],
    desc: "<p>Des œufs frais, pondus par nos poulettes élevées en plein air.</p><ul><li>Élevage local et responsable</li><li>Collecte et conditionnement du jour</li><li>Chaîne du froid et emballage protecteur</li><li>Plateau de 30 œufs, ou demi-plateau de 15</li></ul>"
  },
  {
    /* Vendu sur le site (photo p9) : absent de la graine, il était refusé à la commande. */
    id: 9,
    name: 'Cuisses de Poulet',
    cat: 'cuisses',
    img: 'p9.jpg',
    price: 2750,
    old: 0,
    unit: 'le kg',
    rating: 4.8,
    sold: 0,
    stock: 50,
    tags: [['green', 'Frais du jour'], ['yellow', 'Petit prix']],
    variants: ['Cuisses entières', 'Cuisses en morceaux'],
    desc: "<p>Cuisses de poulet Saf Sap, charnues et savoureuses : le meilleur rapport qualité-prix pour les mijotés, le yassa ou le thiéboudienne.</p><ul><li>Vendues au kilo</li><li>Entières ou en morceaux</li></ul>"
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
/* Migration douce des comptes existants (adresses, statut, email). */
if (!Array.isArray(db.users)) db.users = [];
if (!Array.isArray(db.messages)) db.messages = [];
if (!Array.isArray(db.drivers)) db.drivers = [];
if (!db.oauth || typeof db.oauth !== 'object') db.oauth = {};
db.users.forEach((u) => {
  if (!Array.isArray(u.addresses)) u.addresses = [];
  if (!u.status) u.status = 'active';
  if (typeof u.email !== 'string') u.email = '';
  if (typeof u.token_version !== 'number') u.token_version = 0;
});
ensureEnvDriver();
ensureSeedProducts();
ensureSettings();
saveDb();

/* Réglages de la boutique, pilotés depuis l'application gérant. */
function defaultSettings() {
  return {
    shop_open: true,
    closed_message: 'La boutique est fermée pour le moment. Revenez demain dès 8 h.',
    banner_title: 'Livraison offerte dès 15 000 F',
    banner_text: 'Commande avant 18 h, livrée en 2 h partout à Dakar.',
    delivery_fee: DELIVERY_FEE,
    free_from: FREE_DELIVERY_FROM,
    payment_numbers: PAYMENT_NUMBERS.slice(),
    slots: ['Express 2 h', 'Ce soir 18h–20h', 'Demain 9h–12h'],
    pay_methods: { wave: true, orange_money: true, cod: true },
    updated_at: null
  };
}
function ensureSettings() {
  const d = defaultSettings();
  if (!db.settings || typeof db.settings !== 'object') db.settings = {};
  Object.keys(d).forEach((k) => { if (db.settings[k] === undefined) db.settings[k] = d[k]; });
  if (!db.settings.migrated_v8) {
    /* État de la vitrine drc.sn repris côté serveur : ailes et foie « bientôt », braisé et escalopes masqués. */
    db.products.forEach((p) => {
      if ([4, 5].includes(Number(p.id)) && p.soon === undefined) p.soon = true;
      if ([6, 7].includes(Number(p.id))) p.available = false;
    });
    db.settings.migrated_v8 = true;
  }
}
function S() { return db.settings || defaultSettings(); }
function publicSettings() {
  const s = S();
  return {
    shop_open: s.shop_open !== false, closed_message: s.closed_message, banner_title: s.banner_title, banner_text: s.banner_text,
    delivery_fee: Number(s.delivery_fee) || 0, free_from: Number(s.free_from) || 0,
    payment_numbers: s.payment_numbers, slots: s.slots, pay_methods: s.pay_methods, updated_at: s.updated_at
  };
}

/* Un produit ajouté à la graine apparaît aussi dans une base existante ou restaurée
   (sans toucher aux prix ni aux stocks déjà réglés par le gérant). */
function ensureSeedProducts() {
  SEED_PRODUCTS.forEach((sp) => {
    if (!db.products.some((p) => Number(p.id) === sp.id)) db.products.push(JSON.parse(JSON.stringify(sp)));
  });
  db.products.sort((a, b) => Number(a.id) - Number(b.id));
}

/* Le livreur principal (variables DRIVER_*) existe toujours : après une base vierge ou une
   restauration, il est recréé avec le code défini sur l'hébergeur. */
function ensureEnvDriver() {
  if (!Array.isArray(db.drivers)) db.drivers = [];
  if (!DRIVER_TOKEN) return;
  const existing = db.drivers.find((d) => d.id === DRIVER_ID);
  if (existing) {
    if (!existing.code) existing.code = DRIVER_TOKEN;
    return;
  }
  db.drivers.unshift({
    id: DRIVER_ID, name: DRIVER_NAME, phone: DRIVER_PHONE, code: DRIVER_TOKEN,
    active: true, source: 'env', created_at: new Date().toISOString()
  });
}

/* -------------------------------- Helpers -------------------------------- */

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
    'Permissions-Policy': 'geolocation=(), microphone=(), camera=()',
    'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Admin-Token, x-admin-token, X-Order-Token, x-order-token, X-Message-Role, x-message-role',
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
      if (size > 256 * 1024) {
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

/* ------------------------- Sécurité (limites & comparaisons) ------------------------- */

/* Comparaison à temps constant, tolérante aux longueurs différentes. */
function safeEqual(a, b) {
  const ba = Buffer.from(String(a == null ? '' : a));
  const bb = Buffer.from(String(b == null ? '' : b));
  if (ba.length !== bb.length) {
    crypto.timingSafeEqual(ba, ba);
    return false;
  }
  return crypto.timingSafeEqual(ba, bb);
}

function clientIp(req) {
  const xf = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return xf || (req.socket && req.socket.remoteAddress) || 'unknown';
}

/* Fenêtre glissante en mémoire (instance unique sur Render free). */
const RATE_BUCKETS = new Map();
function rateLimit(req, name, limit, windowMs) {
  const key = name + ':' + clientIp(req);
  const now = Date.now();
  let arr = RATE_BUCKETS.get(key);
  if (!arr) { arr = []; RATE_BUCKETS.set(key, arr); }
  while (arr.length && now - arr[0] >= windowMs) arr.shift();
  if (arr.length >= limit) {
    return { ok: false, retry: Math.max(1, Math.ceil((windowMs - (now - arr[0])) / 1000)) };
  }
  arr.push(now);
  return { ok: true };
}
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of RATE_BUCKETS) {
    while (v.length && now - v[0] > 3600e3) v.shift();
    if (!v.length) RATE_BUCKETS.delete(k);
  }
}, 600e3).unref();

/* Échecs d'authentification gérant : 8 essais ratés → 30 min de blocage. */
const ADMIN_FAILS = new Map();
const ADMIN_FAIL_LIMIT = 8;
const ADMIN_BLOCK_MS = 30 * 60 * 1000;
function adminBlocked(req) {
  const rec = ADMIN_FAILS.get(clientIp(req));
  return Boolean(rec && rec.blockedUntil && rec.blockedUntil > Date.now());
}
function adminFailed(req) {
  if (req._authFailCounted) return;      /* un seul échec compté par requête */
  req._authFailCounted = true;
  const ip = clientIp(req);
  const rec = ADMIN_FAILS.get(ip) || { count: 0, blockedUntil: 0 };
  rec.count += 1;
  secFail();
  if (rec.count >= ADMIN_FAIL_LIMIT) { rec.blockedUntil = Date.now() + ADMIN_BLOCK_MS; rec.count = 0; }
  ADMIN_FAILS.set(ip, rec);
}

/* Codes livreur : insensibles à la casse, aux espaces et aux tirets (« drc 1234 5678 » = « DRC-1234-5678 »). */
function normCode(code) {
  return String(code == null ? '' : code).trim().toUpperCase().replace(/[\s\-_.]/g, '');
}
function driverForCode(code) {
  const given = normCode(code);
  if (given.length < 6) return null;
  let found = null;
  for (const d of db.drivers || []) {
    if (d && d.active !== false && d.code && safeEqual(normCode(d.code), given)) found = found || d;
  }
  return found;
}
/* Sessions d'équipe (gérant / livreur) : le code s'échange une fois contre un jeton signé,
   expirant, révocable. L'appareil ne garde jamais le code lui-même. */
const SEC_LOG = [];            /* tentatives refusées (horodatages), pour l'alerte gérant */
function secFail() { SEC_LOG.push(Date.now()); while (SEC_LOG.length && Date.now() - SEC_LOG[0] > 864e5) SEC_LOG.shift(); }
function codeTag(code) { return crypto.createHash('sha256').update('drc:' + normCode(code)).digest('base64url').slice(0, 12); }
function staffVersion() { return Number((db.settings || {}).staff_session_version) || 0; }
function makeStaffToken(role, driver) {
  const days = role === 'admin' ? 14 : 30;
  const p = { r: role, sv: staffVersion(), exp: Date.now() + days * 864e5 };
  if (role === 'admin') p.ct = codeTag(ADMIN_TOKEN);
  else { p.d = driver.id; p.ct = codeTag(driver.code); }
  const payload = Buffer.from(JSON.stringify(p)).toString('base64url');
  const sig = crypto.createHmac('sha256', authSecret()).update('staff.' + payload).digest('base64url');
  return { token: 'stf.' + payload + '.' + sig, exp: p.exp };
}
function staffFromToken(given) {
  if (!given || !given.startsWith('stf.')) return null;
  const parts = given.split('.');
  if (parts.length !== 3) return null;
  try {
    const expect = crypto.createHmac('sha256', authSecret()).update('staff.' + parts[1]).digest('base64url');
    if (!safeEqual(parts[2], expect)) return null;
    const p = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    if (!p.exp || p.exp < Date.now() || (Number(p.sv) || 0) !== staffVersion()) return null;
    if (p.r === 'admin') return safeEqual(p.ct, codeTag(ADMIN_TOKEN)) ? { role: 'admin' } : null;
    if (p.r === 'driver') {
      const d = (db.drivers || []).find((x) => x && x.id === p.d && x.active !== false && x.code);
      return d && safeEqual(p.ct, codeTag(d.code)) ? { role: 'driver', driver: d } : null;
    }
  } catch (e) { /* jeton illisible */ }
  return null;
}

function isAdmin(req) {
  if (!ADMIN_TOKEN || ADMIN_TOKEN === 'changeme') return false;
  if (adminBlocked(req)) return false;
  const given = String(req.headers['x-admin-token'] || '');
  if (given.startsWith('stf.')) { const st = staffFromToken(given); if (!st) adminFailed(req); return Boolean(st && st.role === 'admin'); }
  const ok = safeEqual(given, ADMIN_TOKEN);
  /* Un code livreur valide n'est pas une tentative ratée : sans ce garde-fou, les
     rafraîchissements du portail livreur bloquaient l'espace gérant (même réseau). */
  if (!ok && given && !driverForCode(given)) adminFailed(req);
  return ok;
}

/* Livreur authentifié par son code (en-tête X-Admin-Token, comme le gérant). */
function currentDriver(req) {
  const given = String(req.headers['x-admin-token'] || '');
  if (!given) return null;
  if (adminBlocked(req)) return null;
  if (given.startsWith('stf.')) { const st = staffFromToken(given); if (!st) adminFailed(req); return st && st.role === 'driver' ? st.driver : null; }
  const d = driverForCode(given);
  if (!d && !safeEqual(given, ADMIN_TOKEN)) adminFailed(req);
  return d;
}
function isDriver(req) {
  return Boolean(currentDriver(req));
}

function orderAccess(req, order) {
  if (isAdmin(req)) return 'admin';
  if (req.headers['x-admin-token']) {
    const d = currentDriver(req);
    return d && order.driver && order.driver.id === d.id ? 'driver' : null;
  }
  const token = String(req.headers['x-order-token'] || '');
  if (token && order.customer_token && safeEqual(token, order.customer_token)) return 'customer';
  /* Le client connecté retrouve la conversation de ses commandes sur tous ses appareils. */
  const user = userFromRequest(req);
  if (user && phoneKey(user.phone) && phoneKey(user.phone) === phoneKey(order.customer && order.customer.phone)) return 'customer';
  return null;
}

/* Fiche livreur exposée au client et au gérant (jamais le code). */
function driverCard(d) {
  if (!d) return null;
  return { id: d.id, name: d.name || 'Livreur DRC', phone: d.phone || '' };
}
function adminDriverRow(d) {
  const mine = db.orders.filter((o) => o.driver && o.driver.id === d.id);
  return {
    id: d.id, name: d.name || '', phone: d.phone || '', code: d.code || '',
    active: d.active !== false, source: d.source || 'admin',
    created_at: d.created_at || null, updated_at: d.updated_at || null,
    active_missions: mine.filter((o) => ['confirmed', 'preparing', 'paid', 'shipping'].includes(o.status)).length,
    delivered: mine.filter((o) => o.status === 'delivered').length
  };
}
function newDriverCode() {
  const n = () => String(crypto.randomInt(0, 10000)).padStart(4, '0');
  let code;
  do { code = 'DRC-' + n() + '-' + n(); } while (driverForCode(code) || safeEqual(normCode(code), normCode(ADMIN_TOKEN)));
  return code;
}

/* Commande sans secret de suivi : pour le gérant, le livreur et le client authentifié. */
function privateOrder(o) {
  if (!o) return null;
  const { customer_token, client_order_id, ...rest } = o;
  /* Position du livreur : seulement si elle est récente (6 min), sinon elle induit en erreur. */
  const dp = o.driver_pos;
  rest.driver_pos = (dp && Number.isFinite(Number(dp.lat)) && Date.now() - new Date(dp.at || 0).getTime() < 6 * 60e3)
    ? { lat: Number(dp.lat), lng: Number(dp.lng), at: dp.at, acc: dp.acc || null } : null;
  return rest;
}

function maskPhone(p) {
  const s = String(p == null ? '' : p);
  if (s.length < 6) return '•••';
  return s.slice(0, 4) + '•••' + s.slice(-2);
}

/* Commande sans données personnelles : utilisée pour tout accès non authentifié. */
function publicOrder(o) {
  if (!o) return null;
  const c = o.customer || {};
  return {
    id: o.id,
    status: o.status,
    created_at: o.created_at,
    items: o.items,
    subtotal: o.subtotal,
    discount: o.discount,
    promo: o.promo,
    delivery_fee: o.delivery_fee,
    total: o.total,
    payment: o.payment,
    payment_status: o.payment_status || (o.status === 'paid' ? 'paid' : 'unpaid'),
    payment_confirmed: o.payment_confirmed === true || o.payment_status === 'paid',
    driver: o.driver ? { name: o.driver.name || 'Livreur DRC', phone: o.driver.phone || '' } : null,
    paid_at: o.paid_at || null,
    payment_refusal_reason: o.payment_refusal_reason || null,
    points_earned: o.points_earned,
    /* Ni nom, ni adresse, ni coordonnées GPS : les numéros de commande se devinent. */
    customer: { zone: c.zone || '', phone_masked: maskPhone(c.phone) }
  };
}

/* Coordonnées de livraison : point choisi sur la carte (Dakar & banlieue). */
function orderSummary(o) {
  const c = o.customer || {};
  const items = (o.items || []).map((i) => '• ' + i.qty + '× ' + i.name +
    (i.variant ? ' (' + i.variant + ')' : '') + ' — ' + ((i.price || 0) * (i.qty || 1)) + ' F').join('\n');
  const pay = o.payment_method === 'cod' ? 'Espèces à la livraison'
    : o.payment_method === 'wave' ? 'Wave' : 'Orange Money';
  return [
    '🛒 Nouvelle commande ' + o.id,
    '👤 ' + (c.name || '—') + ' · ' + (c.phone || '—'),
    c.email ? '✉️ ' + c.email : '',
    '📍 ' + (c.address || c.zone || '—'),
    (c.lat && c.lng) ? '🗺️ https://www.google.com/maps?q=' + c.lat + ',' + c.lng : '',
    c.slot ? '🕒 ' + c.slot : '',
    '💳 ' + pay,
    c.pay_phone ? '📱 ' + c.pay_phone : '',
    '',
    items,
    '',
    'Total : ' + o.total + ' F' + (o.discount ? ' (remise ' + o.discount + ' F)' : '')
  ].filter(Boolean).join('\n');
}

/* Paiement confirmé (webhook, vérification Wave active ou gérant). */
function markOrderPaid(order, by, txn) {
  order.payment_status = 'paid';
  order.payment_confirmed = true;
  order.paid_at = new Date().toISOString();
  if (txn) order.payment_txn = String(txn).slice(0, 80);
  order.payment_review = { action: 'confirm', at: order.paid_at, by: by || 'auto', reason: '' };
  if (['pending', 'awaiting_payment', 'awaiting_payment_manual'].includes(order.status)) order.status = 'confirmed';
  saveDb();
  notifyText('✅ Paiement reçu ' + order.id + ' — ' + order.total + ' F (' + (by || 'auto') + ')');
}

async function notifyText(text) {
  try {
    if (ORDER_WEBHOOK) {
      await fetch(ORDER_WEBHOOK, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ summary: text }) });
    }
    if (TELEGRAM_TOKEN && TELEGRAM_CHAT) {
      await fetch('https://api.telegram.org/bot' + TELEGRAM_TOKEN + '/sendMessage', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: TELEGRAM_CHAT, text, disable_web_page_preview: true })
      });
    }
  } catch (e) { console.error('[notif] échec :', e.message); }
}

/* Vérification active d'une session Wave Checkout (sans attendre le webhook), au plus toutes les 8 s. */
const WAVE_CHECKS = new Map();
async function refreshWavePayment(order) {
  if (!WAVE_ENABLED || !order || order.payment_status === 'paid') return;
  const sid = order.payment && order.payment.session_id;
  if (!sid) return;
  const last = WAVE_CHECKS.get(order.id) || 0;
  if (Date.now() - last < 8000) return;
  WAVE_CHECKS.set(order.id, Date.now());
  try {
    const r = await httpsRequest({ url: 'https://api.wave.com/v1/checkout/sessions/' + encodeURIComponent(sid), method: 'GET', headers: { Authorization: 'Bearer ' + WAVE_API_TOKEN }, timeoutMs: 6000 });
    const d = r.json || {};
    if (d.payment_status === 'succeeded' && (!d.client_reference || d.client_reference === order.id)) {
      if (!(Number(d.amount) + 0.5 < Number(order.total))) markOrderPaid(order, 'wave', d.transaction_id || sid);
    }
  } catch (e) { console.error('[wave] vérification', order.id, e.message); }
}

async function notifyManager(o) {
  try {
    if (ORDER_WEBHOOK) {
      await fetch(ORDER_WEBHOOK, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ summary: orderSummary(o), order: o })
      });
    }
    if (TELEGRAM_TOKEN && TELEGRAM_CHAT) {
      await fetch('https://api.telegram.org/bot' + TELEGRAM_TOKEN + '/sendMessage', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: TELEGRAM_CHAT, text: orderSummary(o), disable_web_page_preview: true })
      });
    }
  } catch (e) {
    console.error('[notif] échec envoi gérant :', e.message);
  }
}

function buildCustomer(c) {
  const gps = String(c.gps || '').split(',').map(v => v.trim());
  const lat = Number(c.lat ?? gps[0]), lng = Number(c.lng ?? gps[1]);
  const hasGeo = Number.isFinite(lat) && Number.isFinite(lng) &&
    lat >= 12 && lat <= 17 && lng >= -18 && lng <= -11;
  return {
    name: String(c.name || '').trim().slice(0, 60),
    phone: String(c.phone || '').trim().slice(0, 20),
    zone: String(c.zone || '').slice(0, 60),
    note: String(c.note || '').slice(0, 500),
    slot: String(c.slot || '').slice(0, 60),
    pay_phone: String(c.pay_phone || '').slice(0, 20),
    email: String(c.email || '').slice(0, 80),
    address: String(c.address || '').slice(0, 180),
    lat: hasGeo ? Number(lat.toFixed(6)) : null,
    lng: hasGeo ? Number(lng.toFixed(6)) : null,
    gps_accuracy: Math.max(0, Number(c.gps_accuracy) || 0)
  };
}

function nextOrderId() {
  const year = new Date().getFullYear();
  const key = String(year);
  const seq = (db.sequences[key] || 0) + 1;
  db.sequences[key] = seq;
  return `DRC-${year}-${String(seq).padStart(4, '0')}`;
}

function payNumbers() {
  const n = db && db.settings && Array.isArray(db.settings.payment_numbers) ? db.settings.payment_numbers.filter(Boolean) : [];
  return n.length ? n : PAYMENT_NUMBERS;
}
/* Stock : retiré à la commande, rendu à l'annulation (une seule fois dans chaque sens). */
function applyStock(order, sign) {
  if (sign < 0 && order.stock_applied) return;
  if (sign > 0 && !order.stock_applied) return;
  (order.items || []).forEach((it) => {
    const p = db.products.find((x) => Number(x.id) === Number(it.id));
    if (p && Number.isFinite(Number(p.stock))) p.stock = Math.max(0, Number(p.stock) + sign * (Number(it.qty) || 0));
  });
  order.stock_applied = sign < 0;
}

function paymentInstructionsText(method) {
  const label = method === 'wave' ? 'Wave' : 'Orange Money';
  return `Envoyez le montant total à l'un de ces numéros ${label} : ${payNumbers().join(' · ')} — indiquez la référence DRC-XXXX dans le motif, puis nous confirmons votre commande.`;
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
      success_url: `${PUBLIC_API}/pay/return?ref=${encodeURIComponent(order.id)}&r=ok`,
      error_url: `${PUBLIC_API}/pay/return?ref=${encodeURIComponent(order.id)}&r=ko`,
      ...(WAVE_MERCHANT_NAME ? { business_name: WAVE_MERCHANT_NAME } : {})
    }
  });
  if (res.json && (res.json.wave_launch_url || res.json.url)) {
    order._wave_session = res.json.id || null;
    return res.json.wave_launch_url || res.json.url;
  }
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
      return_url: `${PUBLIC_API}/pay/return?ref=${encodeURIComponent(order.id)}&r=ok`,
      notif_url: `${PUBLIC_API}/api/payments/webhook/orange_money`,
      lang: 'fr',
      reference: SHOP_NAME
    }
  });
  if (res.json && (res.json.payment_url || res.json.pay_url)) {
    return res.json.payment_url || res.json.pay_url;
  }
  throw new Error(`orange_error_${res.status}`);
}

/* Lien marchand statique : {ref}/{amount} remplacés ; sinon le montant est ajouté en ?amount=
   (les liens marchands Wave « pay.wave.com/m/… » ouvrent l'appli Wave avec le montant prérempli). */
function staticPayUrl(link, orderId, total) {
  let url = link.replace('{ref}', encodeURIComponent(orderId));
  if (url.includes('{amount}')) return url.replace('{amount}', total ? String(total) : '');
  if (total && /pay\.wave\.com\//.test(url) && !/[?&]amount=/.test(url)) {
    url += (url.includes('?') ? '&' : '?') + 'amount=' + encodeURIComponent(String(total));
  }
  return url;
}

function buildFallbackPayment(method, orderId = '', total = 0) {
  const label = method === 'wave' ? 'Wave' : 'Orange Money';
  const link = method === 'wave' ? WAVE_PAY_LINK : ORANGE_PAY_LINK;
  // Lien de paiement statique (Wave Business / Orange Money) : utilisable sans contrat API.
  // Le jeton {ref} est remplacé par la référence de commande si le lien le prévoit.
  if (link) {
    return {
      type: 'link',
      mode: 'merchant_link',
      numbers: payNumbers(),
      amount: total,
      url: staticPayUrl(link, orderId, total),
      number: null,
      reference: orderId,
      instructions: `Paiement ${label} sécurisé. Indiquez la référence ${orderId} dans le motif.`
    };
  }
  return {
    type: 'instructions',
    url: null,
    number: payNumbers()[0] || SHOP_PHONE,
    numbers: payNumbers(),
    reference: '',
    instructions: `${label} : envoyez le montant total à l'un de ces numéros (${payNumbers().join(' · ')}) en indiquant la référence de votre commande dans le motif, puis nous confirmerons votre commande.`
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
/* Clé téléphone réduite aux 9 chiffres locaux (tolère +221 / 00221 / espaces). */
function phoneKey(v) {
  const d = String(v || '').replace(/\D/g, '');
  return d.length >= 9 ? d.slice(-9) : '';
}
/* Valide un code promo contre l'historique du numéro et le sous-total. */
function evaluatePromo(code, phone, subtotal) {
  const key = String(code || '').trim().toUpperCase();
  const promo = PROMOS[key];
  if (!promo) return { ok: false, error: 'unknown_code' };
  const sub = Number(subtotal) || 0;
  if (sub < promo.min_subtotal) {
    return { ok: false, error: 'min_subtotal', min_subtotal: promo.min_subtotal };
  }
  if (promo.first_order_only) {
    const k = phoneKey(phone);
    const alreadyOrdered = k && db.orders.some(
      (o) => phoneKey(o.customer && o.customer.phone) === k && o.status !== 'cancelled'
    );
    if (alreadyOrdered) return { ok: false, error: 'already_used' };
  }
  return {
    ok: true, code: key, label: promo.label, percent: promo.percent,
    discount: Math.round((sub * promo.percent) / 100)
  };
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
  const payload = Buffer.from(JSON.stringify({ uid: user.id, tv: Number(user.token_version) || 0, exp: Date.now() + 30 * 864e5 })).toString('base64url');
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
    const user = db.users.find((u) => u.id === data.uid) || null;
    if (!user) return null;
    if ((Number(data.tv) || 0) !== (Number(user.token_version) || 0)) return null;
    if (user.status === 'disabled') return null;
    return user;
  } catch (e) { return null; }
}
function publicUser(u) {
  return {
    id: u.id,
    name: u.name,
    phone: u.phone,
    email: u.email || '',
    points: Math.max(0, Number(u.points) || 0),
    status: u.status || 'active',
    addresses: Array.isArray(u.addresses) ? u.addresses : [],
    created_at: u.created_at || null
  };
}

/* Utilisateur authentifié et actif, ou réponse 401/403 déjà envoyée. */
function requireUser(req, res) {
  const u = userFromRequest(req);
  if (!u) { sendJson(res, 401, { error: 'unauthorized' }); return null; }
  if (u.status === 'disabled') { sendJson(res, 403, { error: 'account_disabled' }); return null; }
  return u;
}

function validEmail(v) {
  const e = String(v || '').trim();
  if (!e) return '';
  if (e.length > 120) return null;
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e) ? e : null;
}

function sanitizeAddress(body) {
  const zone = String(body.zone || '').trim().slice(0, 60);
  const details = String(body.details || '').trim().slice(0, 160);
  const label = String(body.label || '').trim().slice(0, 30) || 'Adresse';
  const rawPhone = body.phone ? normalizePhone(body.phone) : '';
  const lat = Number(body.lat), lng = Number(body.lng);
  const hasGeo = Number.isFinite(lat) && Number.isFinite(lng) &&
    lat >= 12 && lat <= 17 && lng >= -18 && lng <= -11;
  if (!zone) return { error: 'zone_required' };
  if (body.phone && !rawPhone) return { error: 'invalid_phone' };
  return { value: {
    label, zone, details, phone: rawPhone || '', is_default: Boolean(body.is_default),
    lat: hasGeo ? Number(lat.toFixed(6)) : null,
    lng: hasGeo ? Number(lng.toFixed(6)) : null
  } };
}

function setDefaultAddress(user, addressId) {
  user.addresses.forEach((a) => { a.is_default = a.id === addressId; });
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
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Admin-Token, x-admin-token, X-Order-Token, x-order-token, X-Message-Role, x-message-role',
      'Access-Control-Max-Age': '86400'
    });
    res.end();
    return;
  }

  try {
    /* 0. Limite globale anti-abus : 300 requêtes / minute / IP */
    const rl = rateLimit(req, 'all', 300, 60e3);
    if (!rl.ok) {
      res.setHeader('Retry-After', String(rl.retry));
      return sendJson(res, 429, { error: 'rate_limited', retry_after: rl.retry });
    }

    /* 1. Santé */
    if (method === 'GET' && pathname === '/api/health') {
      sendJson(res, 200, {
        ok: true,
        shop: SHOP_NAME,
        payments: {
          wave: WAVE_ENABLED || Boolean(WAVE_PAY_LINK),
          orange_money: ORANGE_ENABLED || Boolean(ORANGE_PAY_LINK),
          cod: true
        },
        auth: { google: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) },
        notify: { telegram: Boolean(TELEGRAM_TOKEN && TELEGRAM_CHAT), webhook: Boolean(ORDER_WEBHOOK) },
        drivers: { configured: (db.drivers || []).some((d) => d.active !== false && d.code) },
        depot: DEPOT,
        boot: { id: BOOT_ID, at: BOOTED_AT },
        version: '7.9'
      });
      return;
    }

    /* 1b. Réglages publics (boutique ouverte, bandeau, frais de livraison, numéros de paiement). */
    if (method === 'GET' && pathname === '/api/settings') {
      return sendJson(res, 200, { settings: publicSettings() });
    }

    /* 2. Catalogue */
    if (method === 'GET' && pathname === '/api/products') {
      sendJson(res, 200, { products: db.products.filter((p) => p.available !== false) });
      return;
    }

    /* 2b. Validation d'un code promo (sans création de commande) */
    if (method === 'POST' && pathname === '/api/promo/validate') {
      const body = parseJsonBody(await readBody(req)) || {};
      const verdict = evaluatePromo(body.code, body.phone, body.subtotal);
      return sendJson(res, verdict.ok ? 200 : 400, verdict);
    }

    /* 3. Création de commande */
    if (method === 'POST' && pathname === '/api/orders') {
      const rlCreate = rateLimit(req, 'order_create', 15, 60e3);
      if (!rlCreate.ok) {
        res.setHeader('Retry-After', String(rlCreate.retry));
        return sendJson(res, 429, { error: 'rate_limited', retry_after: rlCreate.retry });
      }
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

      if (S().shop_open === false) return sendJson(res, 409, { error: 'shop_closed', message: S().closed_message });
      if (S().pay_methods && S().pay_methods[paymentMethod] === false) return sendJson(res, 409, { error: 'payment_method_disabled' });
      const clientOrderId = String(body.client_order_id || '').trim().slice(0, 100);
      if (clientOrderId) {
        const existing = db.orders.find(o => o.client_order_id === clientOrderId);
        if (existing) return sendJson(res, 200, { order: existing, customer_token: existing.customer_token });
      }
      /* Le site envoie « promo_code », l'application « promo » : les deux sont acceptés. */
      const promoCode = String(body.promo || body.promo_code || '').trim();

      // Les prix sont re-résolus depuis la base : un client ne peut pas les falsifier.
      const resolvedItems = [];
      for (const it of items) {
        const idNum = Number(it && it.id) || 0;
        const product = db.products.find((p) => Number(p.id) === idNum);
        if (!product || product.available === false || product.soon === true) {
          return sendJson(res, 400, { error: 'invalid_item', id: idNum });
        }
        resolvedItems.push({
          id: product.id,
          name: product.name || String(it.name || ''),
          price: Number(product.price) || 0,
          qty: Math.max(1, Math.min(50, Number(it.qty) || 1)),
          variant: String(it.variant || '').slice(0, 60)
        });
      }
      const cleanItems = resolvedItems;
      const subtotal = cleanItems.reduce((sum, it) => sum + it.price * it.qty, 0);
      const st = S();
      const deliveryFee = subtotal < (Number(st.free_from) || 0) ? (Number(st.delivery_fee) || 0) : 0;

      let discount = 0;
      let promo = null;
      let promoRejected = null;
      if (promoCode) {
        const verdict = evaluatePromo(promoCode, customer.phone, subtotal);
        if (!verdict.ok && body.promo) {
          return sendJson(res, 400, {
            error: 'invalid_promo', reason: verdict.error,
            ...(verdict.min_subtotal ? { min_subtotal: verdict.min_subtotal } : {})
          });
        }
        if (!verdict.ok) {
          /* Site web : la commande passe sans remise plutôt que d'échouer, et le client est prévenu. */
          promoRejected = verdict.error;
        } else {
          discount = verdict.discount;
          promo = { code: verdict.code, label: verdict.label, percent: verdict.percent };
        }
      }
      const total = Math.max(0, subtotal - discount) + deliveryFee;

      const orderId = nextOrderId();
      const order = {
        id: orderId,
        client_order_id: clientOrderId || null,
        customer_token: crypto.randomBytes(24).toString('base64url'),
        status: 'pending',
        created_at: new Date().toISOString(),
        items: cleanItems,
        customer: buildCustomer(customer),
        payment_method: paymentMethod,
        subtotal,
        discount,
        promo,
        delivery_fee: deliveryFee,
        total,
        payment: null,
        payment_status: paymentMethod === 'cod' ? 'cod_pending' : 'awaiting',
        payment_confirmed: false,
        driver: null
      };
      if (promoRejected) order.promo_rejected = promoRejected;

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
            mode: 'checkout',
            session_id: order._wave_session || null,
            amount: total,
            url,
            number: null,
            reference: orderId,
            instructions: `Cliquez sur le lien ${label} pour payer votre commande en toute sécurité.`
          };
        } else {
          const fallback = buildFallbackPayment(paymentMethod, orderId, total);
          order.status = fallback.type === 'link' ? 'awaiting_payment' : 'awaiting_payment_manual';
          order.payment = fallback;
          if (fallback.type === 'link') {
            console.log(`[paiement] ${label} via lien statique pour ${orderId}`);
          } else {
            order.payment.instructions = paymentInstructionsText(paymentMethod).replace('DRC-XXXX', orderId);
          }
        }
      }

      delete order._wave_session;
      applyStock(order, -1);
      db.orders.push(order);
      // Fidélité : 1 point par 100 F payés, crédité au compte du même numéro.
      const buyer = db.users.find((u) => normalizePhone(u.phone) === normalizePhone(customer.phone));
      order.points_earned = Math.floor(total / 100);
      if (buyer) buyer.points = (Number(buyer.points) || 0) + order.points_earned;
      saveDb();
      notifyManager(order);
      return sendJson(res, 201, { order });
    }

    /* 5. Commandes par téléphone (doit être testé avant /api/orders/:id) */
    if (method === 'GET' && pathname === '/api/orders' && url.searchParams.has('phone')) {
      const rlPhone = rateLimit(req, 'orders_phone', 60, 60e3);
      if (!rlPhone.ok) {
        res.setHeader('Retry-After', String(rlPhone.retry));
        return sendJson(res, 429, { error: 'rate_limited', retry_after: rlPhone.retry });
      }
      const asked = normalizePhone(url.searchParams.get('phone')) || String(url.searchParams.get('phone') || '').trim();
      const key = phoneKey(asked);
      const orders = db.orders
        .filter((o) => key && phoneKey(o.customer && o.customer.phone) === key)
        .map(publicOrder);
      return sendJson(res, 200, { orders });
    }

    /* 3b. Commandes du client connecté (sans exposer le numéro en clair) */
    if (method === 'GET' && pathname === '/api/orders' && !url.searchParams.has('phone')) {
      const user = userFromRequest(req);
      if (!user) return sendJson(res, 401, { error: 'unauthorized' });
      const key = phoneKey(user.phone);
      const orders = db.orders.filter((o) => phoneKey(o.customer && o.customer.phone) === key).map(privateOrder);
      return sendJson(res, 200, { orders });
    }

    /* 3c. Position du livreur pendant la livraison (portail livreur / app gérant). */
    const posMatch = pathname.match(/^\/api\/orders\/([^/]+)\/driver-position$/);
    if (posMatch && method === 'POST') {
      const order = db.orders.find((o) => o.id === decodeURIComponent(posMatch[1]));
      if (!order) return sendJson(res, 404, { error: 'not_found' });
      const access = orderAccess(req, order);
      if (access !== 'driver' && access !== 'admin') return sendJson(res, 403, { error: 'forbidden' });
      const body = parseJsonBody(await readBody(req)) || {};
      const lat = Number(body.lat), lng = Number(body.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < 12 || lat > 17 || lng < -18 || lng > -11) {
        return sendJson(res, 400, { error: 'invalid_position' });
      }
      order.driver_pos = { lat: Number(lat.toFixed(6)), lng: Number(lng.toFixed(6)), acc: Math.max(0, Number(body.acc) || 0), at: new Date().toISOString() };
      saveDb();
      return sendJson(res, 200, { ok: true });
    }

    /* 4a. Page de retour après paiement (Wave / Orange Money) → renvoie dans l'application. */
    // Profil iOS « Web Clip » : drc.sn/app/drc.mobileconfig servi avec le bon type MIME
    // (GitHub Pages l'envoie en application/octet-stream, Safari ne propose alors pas l'installation).
    if ((method === 'GET' || method === 'HEAD') && (pathname === '/ios/drc.mobileconfig' || pathname === '/ios')) {
      try {
        const now = Date.now();
        if (!global.__drcClip || now - global.__drcClip.at > 3600e3) {
          const r = await fetch('https://drc.sn/app/drc.mobileconfig', { cache: 'no-store' });
          if (!r.ok) throw new Error('HTTP ' + r.status);
          global.__drcClip = { at: now, buf: Buffer.from(await r.arrayBuffer()) };
        }
        res.writeHead(200, {
          'Content-Type': 'application/x-apple-aspen-config',
          'Content-Disposition': 'attachment; filename="DarouRahmaneChicken.mobileconfig"',
          'Cache-Control': 'public, max-age=600',
          'Access-Control-Allow-Origin': '*',
        });
        return res.end(global.__drcClip.buf);
      } catch (e) {
        res.writeHead(302, { Location: 'https://drc.sn/app/iphone.html' });
        return res.end();
      }
    }
    if (method === 'GET' && pathname === '/pay/return') {
      const ref = String(url.searchParams.get('ref') || '').replace(/[^A-Za-z0-9-]/g, '').slice(0, 40);
      const okPay = url.searchParams.get('r') !== 'ko';
      const deep = APP_SCHEME + '://order/' + ref;
      const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Darou Rahmane Chicken</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#F4EFE8;font-family:system-ui,sans-serif;color:#232020;text-align:center}
.c{padding:32px 24px;max-width:360px}.i{width:72px;height:72px;border-radius:50%;margin:0 auto 18px;display:grid;place-items:center;font-size:34px;background:${okPay ? '#FF8A4C' : '#E9E3DA'};color:#fff}
h1{font-size:24px;margin:0 0 8px}p{color:#7a716a;line-height:1.45}a{display:block;margin-top:22px;padding:16px;border-radius:999px;background:#232020;color:#fff;text-decoration:none;font-weight:600}</style></head>
<body><div class="c"><div class="i">${okPay ? '✓' : '!'}</div><h1>${okPay ? 'Paiement envoyé' : 'Paiement non abouti'}</h1>
<p>${okPay ? 'Commande ' + ref + ' : retournez dans l’application, la confirmation s’affiche automatiquement.' : 'Le paiement de la commande ' + ref + ' n’a pas abouti. Retournez dans l’application pour réessayer.'}</p>
<a href="${deep}">Retour à l’application</a></div><script>setTimeout(function(){location.href=${JSON.stringify(deep)}},600)</script></body></html>`;
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(html);
      return;
    }

    /* 4b. Le client déclare avoir payé (transfert Wave / Orange Money vers un numéro) → le gérant vérifie. */
    const claimMatch = pathname.match(/^\/api\/orders\/([^/]+)\/payment-claim$/);
    if (method === 'POST' && claimMatch) {
      const rlClaim = rateLimit(req, 'pay_claim', 12, 10 * 60e3);
      if (!rlClaim.ok) return sendJson(res, 429, { error: 'rate_limited', retry_after: rlClaim.retry });
      const order = db.orders.find((o) => o.id === decodeURIComponent(claimMatch[1]));
      if (!order) return sendJson(res, 404, { error: 'not_found' });
      if (orderAccess(req, order) !== 'customer') return sendJson(res, 403, { error: 'forbidden' });
      if (order.payment_status === 'paid') return sendJson(res, 409, { error: 'already_paid', order: privateOrder(order) });
      if (order.status === 'cancelled') return sendJson(res, 409, { error: 'cancelled' });
      const body = parseJsonBody(await readBody(req)) || {};
      const payPhone = String(body.pay_phone || '').replace(/[^\d+ ]/g, '').trim().slice(0, 20);
      const txn = String(body.txn || '').trim().slice(0, 60);
      const to = String(body.to || '').replace(/[^\d ]/g, '').trim().slice(0, 20);
      if (!payPhone && !txn) return sendJson(res, 400, { error: 'invalid' });
      order.payment_claim = { at: new Date().toISOString(), pay_phone: payPhone, txn, to, method: order.payment_method };
      order.payment_status = order.payment_status === 'refused' ? 'awaiting' : (order.payment_status || 'awaiting');
      if (order.customer && payPhone && !order.customer.pay_phone) order.customer.pay_phone = payPhone;
      saveDb();
      notifyText('💸 Paiement déclaré ' + order.id + ' — ' + order.total + ' F via ' + (order.payment_method === 'wave' ? 'Wave' : 'Orange Money') +
        (payPhone ? ' depuis ' + payPhone : '') + (to ? ' vers ' + to : '') + (txn ? ' · réf ' + txn : '') + ' → à vérifier dans l’espace gérant.');
      return sendJson(res, 200, { order: privateOrder(order) });
    }

    /* 4. Détail d'une commande */
    const orderMatch = pathname.match(/^\/api\/orders\/([^/]+)$/);
    if (method === 'GET' && orderMatch) {
      const rlOrder = rateLimit(req, 'order_detail', 90, 60e3);
      if (!rlOrder.ok) {
        res.setHeader('Retry-After', String(rlOrder.retry));
        return sendJson(res, 429, { error: 'rate_limited', retry_after: rlOrder.retry });
      }
      const id = decodeURIComponent(orderMatch[1]);
      const order = db.orders.find((o) => o.id === id);
      if (!order) return sendJson(res, 404, { error: 'not_found' });
      await refreshWavePayment(order);
      const user = userFromRequest(req);
      const owner = Boolean(user && phoneKey(user.phone) === phoneKey(order.customer && order.customer.phone));
      return sendJson(res, 200, { order: (owner || orderAccess(req, order)) ? privateOrder(order) : publicOrder(order) });
    }

    /* 5b. Conversation persistante d'une commande. */
    const messageMatch = pathname.match(/^\/api\/orders\/([^/]+)\/messages$/);
    if (messageMatch && (method === 'GET' || method === 'POST')) {
      const order = db.orders.find(o => o.id === decodeURIComponent(messageMatch[1]));
      if (!order) return sendJson(res, 404, { error: 'not_found' });
      const access = orderAccess(req, order);
      if (!access) return sendJson(res, 403, { error: 'forbidden' });
      if (method === 'GET') {
        const after = Math.max(0, Number(url.searchParams.get('after')) || 0);
        let rows = db.messages.filter(m => m.order_id === order.id && m.id > after).sort((a, b) => a.id - b.id);
        rows = after ? rows.slice(0, 200) : rows.slice(-200);
        return sendJson(res, 200, rows);
      }
      const body = parseJsonBody(await readBody(req)) || {};
      const text = String(body.text || '').trim();
      if (!text || text.length > 1000) return sendJson(res, 422, { error: 'invalid_message' });
      const declared = String(req.headers['x-message-role'] || '');
      if (declared && declared !== access) return sendJson(res, 403, { error: 'invalid_role' });
      const senderName = access === 'customer' ? order.customer.name : access === 'driver' ? order.driver.name : 'Gérant DRC';
      const message = {
        id: db.messages.reduce((max, m) => Math.max(max, Number(m.id) || 0), 0) + 1,
        order_id: order.id,
        sender_role: access,
        sender_name: senderName,
        text,
        created_at: new Date().toISOString()
      };
      db.messages.push(message);
      saveDb();
      return sendJson(res, 201, message);
    }

    /* 5b. Connexion de l'équipe : code → jeton de session (lent et limité contre les essais en série) */
    if (method === 'POST' && pathname === '/api/staff/session') {
      const rlS = rateLimit(req, 'staff_login', 10, 10 * 60e3);
      if (!rlS.ok || adminBlocked(req)) {
        const retry = rlS.ok ? Math.ceil(ADMIN_BLOCK_MS / 1000) : rlS.retry;
        res.setHeader('Retry-After', String(retry));
        return sendJson(res, 429, { error: 'rate_limited', retry_after: retry });
      }
      let body = {};
      try { body = JSON.parse(await readBody(req) || '{}') || {}; } catch (e) { body = {}; }
      const code = String((body && body.code) || '').slice(0, 64);
      const want = String((body && body.role) || '');
      let out = null;
      if (want !== 'driver' && ADMIN_TOKEN && ADMIN_TOKEN !== 'changeme' && safeEqual(code.trim(), ADMIN_TOKEN)) out = { role: 'admin', ...makeStaffToken('admin') };
      else if (want !== 'admin') { const d = driverForCode(code); if (d) out = { role: 'driver', name: d.name || '', ...makeStaffToken('driver', d) }; }
      if (!out) {
        adminFailed(req);
        await new Promise((r) => setTimeout(r, 900 + Math.floor(Math.random() * 600)));
        return sendJson(res, 401, { error: 'unauthorized' });
      }
      return sendJson(res, 200, out);
    }

    /* 6. Administration */
    if (method === 'GET' && pathname === '/api/admin/orders') {
      const rlAdmin = rateLimit(req, 'admin', 120, 10 * 60e3);
      if (!rlAdmin.ok) {
        res.setHeader('Retry-After', String(rlAdmin.retry));
        return sendJson(res, 429, { error: 'rate_limited', retry_after: rlAdmin.retry });
      }
      if (!isAdmin(req)) return sendJson(res, 401, { error: 'unauthorized' });
      return sendJson(res, 200, { orders: db.orders.map(privateOrder) });
    }

    /* 6b. Administration — statistiques, statuts de commande, produits */
    const isAdminReq = isAdmin(req);

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
        payments_to_review: db.orders.filter((o) => o.payment_status === 'awaiting' || ['awaiting_payment', 'awaiting_payment_manual'].includes(o.status || '')).length,
        products: db.products.length,
        users: db.users.length,
        drivers: (db.drivers || []).filter((d) => d.active !== false).length,
        to_assign: db.orders.filter((o) => ['confirmed', 'preparing', 'paid'].includes(o.status) && !o.driver).length,
        low_stock: db.products.filter((p) => Number(p.stock) > 0 && Number(p.stock) <= 5).length
      });
    }

    /* 6a. Livreur — uniquement les missions qui lui sont attribuées. */
    const DRIVER_STATUSES = ['confirmed', 'preparing', 'paid', 'shipping', 'delivered'];
    if (method === 'GET' && (pathname === '/api/driver/orders' || pathname === '/api/driver/me')) {
      const me = currentDriver(req);
      if (!me) return sendJson(res, 401, { error: 'unauthorized' });
      const orders = db.orders
        .filter((o) => o.driver && o.driver.id === me.id && DRIVER_STATUSES.includes(o.status))
        .map(privateOrder);
      return sendJson(res, 200, { driver: driverCard(me), depot: DEPOT, orders });
    }
    const driverOrderMatch = pathname.match(/^\/api\/driver\/orders\/([^/]+)$/);
    if (driverOrderMatch && method === 'PATCH') {
      const me = currentDriver(req);
      if (!me) return sendJson(res, 401, { error: 'unauthorized' });
      const order = db.orders.find(o => o.id === decodeURIComponent(driverOrderMatch[1]));
      if (!order) return sendJson(res, 404, { error: 'not_found' });
      if (!order.driver || order.driver.id !== me.id) return sendJson(res, 403, { error: 'forbidden' });
      const body = parseJsonBody(await readBody(req)) || {};
      const next = body.status;
      /* Récupération au dépôt dès que la commande est confirmée, puis livraison. */
      const valid = (['confirmed', 'preparing', 'paid'].includes(order.status) && next === 'shipping') ||
        (order.status === 'shipping' && next === 'delivered');
      if (!valid) return sendJson(res, 409, { error: 'invalid_transition', status: order.status });
      const now = new Date().toISOString();
      order.status = next;
      order.updated_at = now;
      if (next === 'shipping') order.picked_up_at = now;
      if (next === 'delivered') {
        order.delivered_at = now;
        /* Espèces : le livreur a remis la commande contre paiement. */
        if (order.payment_method === 'cod' && order.payment_status !== 'paid') order.payment_status = 'cod_collected';
      }
      saveDb();
      return sendJson(res, 200, { order: privateOrder(order) });
    }

    const adminOrderMatch = pathname.match(/^\/api\/admin\/orders\/([^/]+)$/);
    if (adminOrderMatch && (method === 'PATCH' || method === 'POST')) {
      if (!isAdminReq) return sendJson(res, 401, { error: 'unauthorized' });
      const id = decodeURIComponent(adminOrderMatch[1]);
      const order = db.orders.find((o) => o.id === id);
      if (!order) return sendJson(res, 404, { error: 'not_found' });
      const body = parseJsonBody(await readBody(req)) || {};
      const allowed = ['pending', 'confirmed', 'preparing', 'shipping', 'delivered', 'cancelled', 'paid'];
      /* Tout est validé avant la moindre écriture : une requête refusée ne laisse rien à moitié modifié. */
      if (body.status && !allowed.includes(body.status)) return sendJson(res, 400, { error: 'invalid_status' });
      if (body.driver_id !== undefined && body.driver === undefined) {
        body.driver = body.driver_id ? { id: body.driver_id } : null;
      }
      let nextDriver = order.driver || null;
      if (body.driver !== undefined) {
        if (body.driver === null || body.driver === '') nextDriver = null;
        else {
          const d = body.driver || {};
          const known = (db.drivers || []).find((x) => x.id === String(d.id || ''));
          if (known && known.active === false) return sendJson(res, 400, { error: 'driver_inactive' });
          const name = String(d.name || (known && known.name) || '').trim();
          const phone = String(d.phone || (known && known.phone) || '').trim();
          if (!d.id || !name) return sendJson(res, 400, { error: 'invalid_driver' });
          if (!known && !phone) return sendJson(res, 400, { error: 'invalid_driver' });
          nextDriver = { id: String(d.id).slice(0, 100), name: name.slice(0, 80), phone: phone.slice(0, 30) };
        }
      }
      if (body.status === 'shipping' && !nextDriver) return sendJson(res, 400, { error: 'driver_required' });

      const now = new Date().toISOString();
      if (body.driver !== undefined) {
        const changed = (nextDriver && nextDriver.id) !== (order.driver && order.driver.id);
        order.driver = nextDriver;
        if (changed) order.assigned_at = nextDriver ? now : null;
      }
      if (body.status) {
        if (body.status === 'cancelled' && order.status !== 'cancelled') applyStock(order, +1);
        if (order.status === 'cancelled' && body.status !== 'cancelled') applyStock(order, -1);
        order.status = body.status;
        if (body.status === 'paid') {
          order.payment_status = 'paid';
          order.payment_confirmed = true;
          order.paid_at = order.paid_at || now;
        }
        if (body.status === 'delivered') order.delivered_at = now;
        else order.delivered_at = null;
      }
      if (typeof body.payment_confirmed === 'boolean') {
        order.payment_confirmed = body.payment_confirmed;
        order.payment_status = body.payment_confirmed ? 'paid'
          : (order.payment_method === 'cod' ? 'cod_pending' : 'awaiting');
        order.paid_at = body.payment_confirmed ? (order.paid_at || now) : null;
      }
      if (typeof body.note === 'string') order.admin_note = body.note.slice(0, 500);
      order.updated_at = now;
      saveDb();
      return sendJson(res, 200, { order: privateOrder(order) });
    }

    /* 6c. Encaissement — le gérant confirme ou refuse un paiement */
    const adminPaymentMatch = pathname.match(/^\/api\/admin\/orders\/([^/]+)\/payment$/);
    if (adminPaymentMatch && method === 'POST') {
      if (!isAdminReq) return sendJson(res, 401, { error: 'unauthorized' });
      const id = decodeURIComponent(adminPaymentMatch[1]);
      const order = db.orders.find((o) => o.id === id);
      if (!order) return sendJson(res, 404, { error: 'not_found' });
      const body = parseJsonBody(await readBody(req)) || {};
      if (body.action !== 'confirm' && body.action !== 'refuse') {
        return sendJson(res, 400, { error: 'invalid_action' });
      }
      const alreadyPaid = order.payment_status === 'paid' || order.status === 'paid';
      if (alreadyPaid) return sendJson(res, 409, { error: 'already_paid', order: privateOrder(order) });
      if (body.action === 'refuse' && order.payment_status === 'cod_collected') {
        return sendJson(res, 409, { error: 'already_collected', order: privateOrder(order) });
      }
      const now = new Date().toISOString();
      if (body.action === 'confirm') {
        order.payment_status = 'paid';
        order.paid_at = now;
        if (['pending', 'awaiting_payment', 'awaiting_payment_manual'].includes(order.status || 'pending')) {
          order.status = 'confirmed';
        }
        order.payment_review = { action: 'confirm', at: now, by: 'gerant' };
        order.payment_confirmed = true;
      } else {
        const reason = String(body.reason || '').trim().slice(0, 300) || 'Paiement non reçu';
        applyStock(order, +1);
        order.payment_status = 'refused';
        order.refused_at = now;
        order.payment_refusal_reason = reason;
        order.status = 'cancelled';
        order.payment_review = { action: 'refuse', at: now, reason, by: 'gerant' };
        order.payment_confirmed = false;
      }
      order.updated_at = now;
      saveDb();
      return sendJson(res, 200, { order: privateOrder(order) });
    }

    /* 6c-bis. Livreurs — création, codes d'accès, activation (gérant uniquement). */
    if (method === 'GET' && pathname === '/api/admin/drivers') {
      if (!isAdminReq) return sendJson(res, 401, { error: 'unauthorized' });
      return sendJson(res, 200, { drivers: (db.drivers || []).map(adminDriverRow) });
    }
    if (method === 'POST' && pathname === '/api/admin/drivers') {
      if (!isAdminReq) return sendJson(res, 401, { error: 'unauthorized' });
      const body = parseJsonBody(await readBody(req)) || {};
      const name = String(body.name || '').trim().slice(0, 80);
      const phone = String(body.phone || '').trim().slice(0, 30);
      if (name.length < 2) return sendJson(res, 400, { error: 'invalid_name' });
      if (phone.replace(/\D/g, '').length < 7) return sendJson(res, 400, { error: 'invalid_phone' });
      if ((db.drivers || []).length >= 30) return sendJson(res, 400, { error: 'too_many_drivers' });
      let code = String(body.code || '').trim().slice(0, 40);
      if (code) {
        if (normCode(code).length < 6) return sendJson(res, 400, { error: 'code_too_short' });
        if (driverForCode(code) || safeEqual(normCode(code), normCode(ADMIN_TOKEN))) return sendJson(res, 409, { error: 'code_in_use' });
      } else code = newDriverCode();
      const driver = {
        id: 'drv-' + Date.now().toString(36) + crypto.randomInt(100, 999),
        name, phone, code, active: true, source: 'admin', created_at: new Date().toISOString()
      };
      db.drivers.push(driver);
      saveDb();
      return sendJson(res, 201, { driver: adminDriverRow(driver) });
    }
    const adminDriverMatch = pathname.match(/^\/api\/admin\/drivers\/([^/]+)$/);
    if (adminDriverMatch && (method === 'PATCH' || method === 'POST')) {
      if (!isAdminReq) return sendJson(res, 401, { error: 'unauthorized' });
      const driver = (db.drivers || []).find((d) => d.id === decodeURIComponent(adminDriverMatch[1]));
      if (!driver) return sendJson(res, 404, { error: 'not_found' });
      const body = parseJsonBody(await readBody(req)) || {};
      if (body.name !== undefined) {
        const name = String(body.name || '').trim().slice(0, 80);
        if (name.length < 2) return sendJson(res, 400, { error: 'invalid_name' });
        driver.name = name;
      }
      if (body.phone !== undefined) {
        const phone = String(body.phone || '').trim().slice(0, 30);
        if (phone && phone.replace(/\D/g, '').length < 7) return sendJson(res, 400, { error: 'invalid_phone' });
        driver.phone = phone;
      }
      if (body.active !== undefined) driver.active = Boolean(body.active);
      if (body.reset_code) driver.code = newDriverCode();
      else if (body.code !== undefined) {
        const code = String(body.code || '').trim().slice(0, 40);
        if (normCode(code).length < 6) return sendJson(res, 400, { error: 'code_too_short' });
        const other = driverForCode(code);
        if ((other && other.id !== driver.id) || safeEqual(normCode(code), normCode(ADMIN_TOKEN))) return sendJson(res, 409, { error: 'code_in_use' });
        driver.code = code;
      }
      driver.updated_at = new Date().toISOString();
      /* Nom et téléphone affichés au client : les missions en cours suivent la fiche. */
      db.orders.forEach((o) => {
        if (o.driver && o.driver.id === driver.id && !['delivered', 'cancelled'].includes(o.status)) {
          o.driver = { id: driver.id, name: driver.name, phone: driver.phone || o.driver.phone || '' };
        }
      });
      saveDb();
      return sendJson(res, 200, { driver: adminDriverRow(driver) });
    }

    if (pathname === '/api/admin/settings' && method === 'GET') {
      if (!isAdminReq) return sendJson(res, 401, { error: 'unauthorized' });
      return sendJson(res, 200, { settings: publicSettings() });
    }
    if (pathname === '/api/admin/settings' && (method === 'PATCH' || method === 'POST')) {
      if (!isAdminReq) return sendJson(res, 401, { error: 'unauthorized' });
      const b = parseJsonBody(await readBody(req)) || {};
      const st = S();
      if (b.shop_open !== undefined) st.shop_open = Boolean(b.shop_open);
      ['closed_message', 'banner_title', 'banner_text'].forEach((k) => {
        if (typeof b[k] === 'string') st[k] = b[k].trim().slice(0, k === 'banner_title' ? 60 : 200);
      });
      if (b.delivery_fee !== undefined) {
        const v = Number(b.delivery_fee); if (!Number.isFinite(v) || v < 0 || v > 50000) return sendJson(res, 400, { error: 'invalid_fee' });
        st.delivery_fee = Math.round(v);
      }
      if (b.free_from !== undefined) {
        const v = Number(b.free_from); if (!Number.isFinite(v) || v < 0 || v > 1000000) return sendJson(res, 400, { error: 'invalid_free_from' });
        st.free_from = Math.round(v);
      }
      if (Array.isArray(b.payment_numbers)) {
        const nums = b.payment_numbers.map((x) => String(x || '').replace(/[^\d ]/g, '').trim()).filter((x) => x.replace(/\D/g, '').length >= 9).slice(0, 5);
        if (!nums.length) return sendJson(res, 400, { error: 'invalid_numbers' });
        st.payment_numbers = nums;
      }
      if (Array.isArray(b.slots)) {
        const sl = b.slots.map((x) => String(x || '').trim().slice(0, 40)).filter(Boolean).slice(0, 6);
        if (sl.length) st.slots = sl;
      }
      if (b.pay_methods && typeof b.pay_methods === 'object') {
        const pm = Object.assign({}, st.pay_methods);
        ['wave', 'orange_money', 'cod'].forEach((k) => { if (b.pay_methods[k] !== undefined) pm[k] = Boolean(b.pay_methods[k]); });
        if (!pm.wave && !pm.orange_money && !pm.cod) return sendJson(res, 400, { error: 'no_payment_method' });
        st.pay_methods = pm;
      }
      st.updated_at = new Date().toISOString();
      db.settings = st;
      saveDb();
      return sendJson(res, 200, { settings: publicSettings() });
    }
    /* Pouls léger pour les notifications de l'application gérant (tâche de fond). */
    if (pathname === '/api/admin/sessions/revoke' && method === 'POST') {
      if (!isAdminReq) return sendJson(res, 401, { error: 'unauthorized' });
      db.settings = db.settings || {};
      db.settings.staff_session_version = staffVersion() + 1;
      saveDb();
      return sendJson(res, 200, { ok: true, token: makeStaffToken('admin').token });
    }

    if (pathname === '/api/admin/pulse' && method === 'GET') {
      if (!isAdminReq) return sendJson(res, 401, { error: 'unauthorized' });
      const dayAgo = Date.now() - 864e5;
      const sorted = db.orders.slice().sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
      const claims = db.orders.filter((o) => o.payment_claim && o.payment_status !== 'paid' && o.status !== 'cancelled')
        .map((o) => ({ id: o.id, at: o.payment_claim.at, total: o.total }));
      const today = new Date().toISOString().slice(0, 10);
      return sendJson(res, 200, {
        latest: sorted.slice(0, 8).map((o) => ({ id: o.id, at: o.created_at, total: o.total, name: (o.customer && o.customer.name) || '', method: o.payment_method, status: o.status })),
        claims,
        today_orders: db.orders.filter((o) => String(o.created_at || '').slice(0, 10) === today).length,
        to_review: db.orders.filter((o) => o.payment_method !== 'cod' && o.payment_status !== 'paid' && !['cancelled'].includes(o.status)).length,
        shop_open: S().shop_open !== false,
        security: { failed_24h: SEC_LOG.filter((t) => t > dayAgo).length, blocked_ips: [...ADMIN_FAILS.values()].filter((r) => r.blockedUntil > Date.now()).length }
      });
    }

    if (method === 'GET' && pathname === '/api/admin/products') {
      if (!isAdminReq) return sendJson(res, 401, { error: 'unauthorized' });
      return sendJson(res, 200, {
        products: db.products.map((p) => ({
          id: p.id, name: p.name, cat: p.cat, img: p.img, price: p.price, old: p.old,
          stock: p.stock, unit: p.unit, available: p.available !== false, soon: p.soon === true, sold: p.sold
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
      if (body.soon !== undefined) product.soon = Boolean(body.soon);
      if (typeof body.unit === 'string' && body.unit.trim()) product.unit = body.unit.trim().slice(0, 40);
      if (typeof body.name === 'string' && body.name.trim()) product.name = body.name.trim().slice(0, 80);
      product.updated_at = new Date().toISOString();
      saveDb();
      return sendJson(res, 200, {
        product: { id: product.id, name: product.name, price: product.price,
          stock: product.stock, unit: product.unit, available: product.available !== false, soon: product.soon === true }
      });
    }

    /* 6d. Administration — gestion des clients */
    function adminUserRow(u) {
      const key = phoneKey(u.phone);
      const orders = db.orders.filter(
        (o) => phoneKey(o.customer && o.customer.phone) === key && o.status !== 'cancelled'
      );
      return {
        id: u.id,
        name: u.name,
        phone: u.phone,
        email: u.email || '',
        points: Math.max(0, Number(u.points) || 0),
        status: u.status || 'active',
        created_at: u.created_at || null,
        last_login: u.last_login || null,
        addresses: (u.addresses || []).length,
        orders_count: orders.length,
        total_spent: orders.reduce((sum, o) => sum + (Number(o.total) || 0), 0)
      };
    }

    if (method === 'GET' && pathname === '/api/admin/users') {
      if (!isAdminReq) return sendJson(res, 401, { error: 'unauthorized' });
      const q = String(url.searchParams.get('q') || '').trim().toLowerCase();
      let users = db.users.map(adminUserRow);
      if (q) {
        users = users.filter((u) =>
          String(u.name || '').toLowerCase().includes(q) ||
          String(u.phone || '').includes(q) ||
          String(u.email || '').toLowerCase().includes(q)
        );
      }
      users.sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
      return sendJson(res, 200, { users, total: db.users.length });
    }

    const adminUserMatch = pathname.match(/^\/api\/admin\/users\/([^/]+)$/);
    if (adminUserMatch && method === 'GET') {
      if (!isAdminReq) return sendJson(res, 401, { error: 'unauthorized' });
      const user = db.users.find((u) => u.id === decodeURIComponent(adminUserMatch[1]));
      if (!user) return sendJson(res, 404, { error: 'not_found' });
      const key = phoneKey(user.phone);
      const orders = db.orders.filter((o) => phoneKey(o.customer && o.customer.phone) === key);
      return sendJson(res, 200, {
        user: Object.assign(adminUserRow(user), {
          addresses: user.addresses || [],
          orders
        })
      });
    }
    if (adminUserMatch && method === 'PATCH') {
      if (!isAdminReq) return sendJson(res, 401, { error: 'unauthorized' });
      const user = db.users.find((u) => u.id === decodeURIComponent(adminUserMatch[1]));
      if (!user) return sendJson(res, 404, { error: 'not_found' });
      const body = parseJsonBody(await readBody(req)) || {};
      if (body.status !== undefined) {
        if (!['active', 'disabled'].includes(body.status)) return sendJson(res, 400, { error: 'invalid_status' });
        user.status = body.status;
        if (body.status === 'disabled') user.token_version = (Number(user.token_version) || 0) + 1;
      }
      if (body.points !== undefined) {
        const pts = Number(body.points);
        if (!Number.isFinite(pts) || pts < 0 || pts > 1000000) return sendJson(res, 400, { error: 'invalid_points' });
        user.points = Math.round(pts);
      }
      if (typeof body.name === 'string' && body.name.trim().length >= 3) user.name = body.name.trim().slice(0, 60);
      user.updated_at = new Date().toISOString();
      saveDb();
      return sendJson(res, 200, { user: adminUserRow(user) });
    }
    const adminResetMatch = pathname.match(/^\/api\/admin\/users\/([^/]+)\/reset-password$/);
    if (adminResetMatch && method === 'POST') {
      if (!isAdminReq) return sendJson(res, 401, { error: 'unauthorized' });
      const user = db.users.find((u) => u.id === decodeURIComponent(adminResetMatch[1]));
      if (!user) return sendJson(res, 404, { error: 'not_found' });
      const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
      let temp = '';
      const bytes = crypto.randomBytes(10);
      for (let i = 0; i < 10; i++) temp += alphabet[bytes[i] % alphabet.length];
      user.pass_hash = hashPassword(temp);
      user.token_version = (Number(user.token_version) || 0) + 1;
      user.password_reset_at = new Date().toISOString();
      saveDb();
      return sendJson(res, 200, { ok: true, password: temp });
    }

    /* 6c. Sauvegarde / restauration (utile quand l'hébergeur n'a pas de disque) */
    if (method === 'GET' && pathname === '/api/admin/backup') {
      if (!isAdminReq) return sendJson(res, 401, { error: 'unauthorized' });
      return sendJson(res, 200, {
        version: 1,
        exported_at: new Date().toISOString(),
        counts: { products: db.products.length, orders: db.orders.length, users: (db.users || []).length, drivers: (db.drivers || []).length, messages: (db.messages || []).length },
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
      db.messages = Array.isArray(incoming.messages) ? incoming.messages : [];
      db.drivers = Array.isArray(incoming.drivers) ? incoming.drivers : [];
      ensureEnvDriver();
      ensureSeedProducts();
      db.users = Array.isArray(incoming.users) ? incoming.users : [];
      db.sequences = incoming.sequences && typeof incoming.sequences === 'object' ? incoming.sequences : {};
      db.oauth = incoming.oauth && typeof incoming.oauth === 'object' ? incoming.oauth : {};
      if (typeof incoming.auth_secret === 'string' && incoming.auth_secret) db.auth_secret = incoming.auth_secret;
      if (incoming.settings && typeof incoming.settings === 'object') db.settings = incoming.settings;
      else if (db.settings) db.settings.migrated_v8 = false;   /* ancienne sauvegarde : réappliquer la migration aux produits restaurés */
      ensureSettings();
      saveDb();
      return sendJson(res, 200, {
        ok: true,
        counts: { products: db.products.length, orders: db.orders.length, users: db.users.length, drivers: db.drivers.length, messages: db.messages.length }
      });
    }

    /* 7. Webhook paiements (stub — voir README) */
    const webhookMatch = pathname.match(/^\/api\/payments\/webhook\/([^/]+)$/);
    if (method === 'POST' && webhookMatch) {
      const bodyText = await readBody(req);
      const provider = webhookMatch[1];
      const waveSecret = process.env.WAVE_WEBHOOK_SECRET || '';
      const orangeSecret = process.env.ORANGE_WEBHOOK_SECRET || '';
      const configured = provider === 'wave' ? Boolean(waveSecret) : provider === 'orange_money' ? Boolean(orangeSecret) : false;
      if (!configured) {
        /* Aucun secret : on refuse tout webhook plutôt que de marquer une commande payée sur parole. */
        return sendJson(res, 503, { error: 'webhook_not_configured' });
      }
      if (provider === 'wave') {
        /* Deux stratégies Wave : « Signing secret » (en-tête Wave-Signature, HMAC de timestamp + corps brut)
           ou « Shared secret » (Authorization: Bearer <secret>). */
        const sig = String(req.headers['wave-signature'] || '');
        const auth = String(req.headers['authorization'] || '');
        let ok = false;
        if (sig) {
          const t = (sig.match(/t=(\d+)/) || [])[1];
          const v1s = [...sig.matchAll(/v1=([a-f0-9]+)/gi)].map((m) => m[1]);
          if (t && v1s.length && Math.abs(Date.now() / 1000 - Number(t)) < 300) {
            const expected = crypto.createHmac('sha256', waveSecret).update(t + bodyText).digest('hex');
            ok = v1s.some((v) => safeEqual(expected, v));
          }
        } else if (/^Bearer\s+/i.test(auth)) {
          ok = safeEqual(auth.replace(/^Bearer\s+/i, '').trim(), waveSecret);
        }
        if (!ok) return sendJson(res, 401, { error: 'bad_signature' });
      } else {
        const given = String(req.headers['x-orange-secret'] || '');
        if (!safeEqual(given, orangeSecret)) return sendJson(res, 401, { error: 'bad_signature' });
      }
      const body = parseJsonBody(bodyText);
      let reference = null;
      let amount = null;
      let succeeded = true;
      let txn = '';
      if (body && typeof body === 'object') {
        const d = body.data && typeof body.data === 'object' ? body.data : null;
        if (provider === 'wave' && d) {
          /* checkout.session.completed : data.client_reference = n° de commande DRC */
          if (body.type && body.type !== 'checkout.session.completed') succeeded = false;
          if (d.payment_status && d.payment_status !== 'succeeded') succeeded = false;
          reference = typeof d.client_reference === 'string' ? d.client_reference : null;
          amount = Number(d.amount);
          txn = String(d.transaction_id || d.id || '');
        } else {
          if (typeof body.reference === 'string') reference = body.reference;
          else if (typeof body.order_id === 'string') reference = body.order_id;
          else if (body.metadata && typeof body.metadata.reference === 'string') reference = body.metadata.reference;
          if (body.status && !/^(SUCCESS|SUCCESSFULL|SUCCEEDED|PAID)$/i.test(String(body.status))) succeeded = false;
          if (body.amount != null) amount = Number(body.amount);
          txn = String(body.txnid || body.transaction_id || '');
        }
      }
      if (reference && succeeded) {
        const order = db.orders.find((o) => o.id === reference || (o.payment && o.payment.reference === reference));
        if (order && order.payment_status !== 'paid') {
          if (amount != null && Number.isFinite(amount) && amount + 0.5 < Number(order.total)) {
            order.payment_review = { action: 'underpaid', at: new Date().toISOString(), by: provider, reason: 'Montant reçu ' + amount + ' F < ' + order.total + ' F' };
            saveDb();
          } else {
            markOrderPaid(order, provider, txn);
          }
        }
      }
      return sendJson(res, 200, { ok: true });
    }

    /* 8. Authentification */
    if (pathname === '/api/auth/register' && method === 'POST') {
      const rlReg = rateLimit(req, 'register', 6, 10 * 60e3);
      if (!rlReg.ok) {
        res.setHeader('Retry-After', String(rlReg.retry));
        return sendJson(res, 429, { error: 'rate_limited', retry_after: rlReg.retry });
      }
      const body = parseJsonBody(await readBody(req)) || {};
      const name = String(body.name || '').trim().slice(0, 60);
      const phone = normalizePhone(body.phone);
      const password = String(body.password || '');
      if (name.length < 3 || !phone || password.length < 6 || password.length > 128) return sendJson(res, 400, { error: 'invalid' });
      if (db.users.some((u) => u.phone === phone)) return sendJson(res, 409, { error: 'phone_exists' });
      // Les commandes passées avant l'inscription rapportent aussi leurs points.
      const key = phoneKey(phone);
      const pastOrders = db.orders.filter(
        (o) => phoneKey(o.customer && o.customer.phone) === key && o.status !== 'cancelled'
      );
      const seedPoints = pastOrders.reduce((sum, o) => sum + Math.floor((Number(o.total) || 0) / 100), 0);
      const email = validEmail(body.email);
      if (email === null) return sendJson(res, 400, { error: 'invalid_email' });
      const user = {
        id: 'u' + Date.now().toString(36) + Math.floor(Math.random() * 999),
        name, phone, email,
        pass_hash: hashPassword(password),
        points: seedPoints,
        status: 'active',
        addresses: [],
        token_version: 0,
        created_at: new Date().toISOString(),
        last_login: new Date().toISOString()
      };
      db.users.push(user); saveDb();
      return sendJson(res, 201, { token: makeToken(user), user: publicUser(user) });
    }
    if (pathname === '/api/auth/login' && method === 'POST') {
      const rlLogin = rateLimit(req, 'login', 10, 10 * 60e3);
      if (!rlLogin.ok) {
        res.setHeader('Retry-After', String(rlLogin.retry));
        return sendJson(res, 429, { error: 'rate_limited', retry_after: rlLogin.retry });
      }
      const body = parseJsonBody(await readBody(req)) || {};
      const phone = normalizePhone(body.phone);
      const password = String(body.password || '');
      if (phone) {
        const rlPhone = rateLimit(req, 'login_phone_' + phone, 6, 10 * 60e3);
        if (!rlPhone.ok) {
          res.setHeader('Retry-After', String(rlPhone.retry));
          return sendJson(res, 429, { error: 'rate_limited', retry_after: rlPhone.retry });
        }
      }
      const user = phone ? db.users.find((u) => u.phone === phone) : null;
      if (!user || !verifyPassword(password, user.pass_hash)) return sendJson(res, 401, { error: 'invalid_credentials' });
      if (user.status === 'disabled') return sendJson(res, 403, { error: 'account_disabled' });
      user.last_login = new Date().toISOString();
      saveDb();
      return sendJson(res, 200, { token: makeToken(user), user: publicUser(user) });
    }
    if (pathname === '/api/auth/me' && method === 'GET') {
      const user = requireUser(req, res);
      if (!user) return;
      return sendJson(res, 200, { user: publicUser(user) });
    }
    if (pathname === '/api/auth/me' && method === 'PATCH') {
      const user = requireUser(req, res);
      if (!user) return;
      const rl = rateLimit(req, 'profile', 30, 10 * 60e3);
      if (!rl.ok) { res.setHeader('Retry-After', String(rl.retry)); return sendJson(res, 429, { error: 'rate_limited', retry_after: rl.retry }); }
      const body = parseJsonBody(await readBody(req)) || {};
      if (body.name !== undefined) {
        const name = String(body.name || '').trim().slice(0, 60);
        if (name.length < 3) return sendJson(res, 400, { error: 'invalid_name' });
        user.name = name;
      }
      if (body.email !== undefined) {
        const email = validEmail(body.email);
        if (email === null) return sendJson(res, 400, { error: 'invalid_email' });
        user.email = email;
      }
      user.updated_at = new Date().toISOString();
      saveDb();
      return sendJson(res, 200, { user: publicUser(user) });
    }
    if (pathname === '/api/auth/password' && method === 'POST') {
      const user = requireUser(req, res);
      if (!user) return;
      const rl = rateLimit(req, 'password_change', 10, 10 * 60e3);
      if (!rl.ok) { res.setHeader('Retry-After', String(rl.retry)); return sendJson(res, 429, { error: 'rate_limited', retry_after: rl.retry }); }
      const body = parseJsonBody(await readBody(req)) || {};
      const current = String(body.current || '');
      const next = String(body.new || '');
      if (!verifyPassword(current, user.pass_hash)) return sendJson(res, 401, { error: 'invalid_current_password' });
      if (next.length < 6 || next.length > 128) return sendJson(res, 400, { error: 'invalid_password' });
      user.pass_hash = hashPassword(next);
      user.token_version = (Number(user.token_version) || 0) + 1;  /* déconnecte les autres appareils */
      user.updated_at = new Date().toISOString();
      saveDb();
      return sendJson(res, 200, { ok: true, token: makeToken(user), user: publicUser(user) });
    }

    /* Carnet d'adresses du client */
    if (pathname === '/api/addresses' && method === 'GET') {
      const user = requireUser(req, res);
      if (!user) return;
      return sendJson(res, 200, { addresses: user.addresses || [] });
    }
    if (pathname === '/api/addresses' && method === 'POST') {
      const user = requireUser(req, res);
      if (!user) return;
      const rl = rateLimit(req, 'addresses', 60, 60e3);
      if (!rl.ok) { res.setHeader('Retry-After', String(rl.retry)); return sendJson(res, 429, { error: 'rate_limited', retry_after: rl.retry }); }
      const body = parseJsonBody(await readBody(req)) || {};
      if (user.addresses.length >= 8) return sendJson(res, 400, { error: 'too_many_addresses' });
      const parsed = sanitizeAddress(body);
      if (parsed.error) return sendJson(res, 400, { error: parsed.error });
      const address = Object.assign({ id: 'a' + Date.now().toString(36) + Math.floor(Math.random() * 999), created_at: new Date().toISOString() }, parsed.value);
      user.addresses.push(address);
      if (user.addresses.length === 1 || address.is_default) setDefaultAddress(user, address.id);
      saveDb();
      return sendJson(res, 201, { address, addresses: user.addresses });
    }
    const addressMatch = pathname.match(/^\/api\/addresses\/([^/]+)$/);
    if (addressMatch && method === 'PATCH') {
      const user = requireUser(req, res);
      if (!user) return;
      const id = decodeURIComponent(addressMatch[1]);
      const address = user.addresses.find((a) => a.id === id);
      if (!address) return sendJson(res, 404, { error: 'not_found' });
      const body = parseJsonBody(await readBody(req)) || {};
      if (body.label !== undefined) address.label = String(body.label || 'Adresse').trim().slice(0, 30) || 'Adresse';
      if (body.zone !== undefined) {
        const zone = String(body.zone || '').trim().slice(0, 60);
        if (!zone) return sendJson(res, 400, { error: 'zone_required' });
        address.zone = zone;
      }
      if (body.details !== undefined) address.details = String(body.details || '').trim().slice(0, 160);
      if (body.lat !== undefined && body.lng !== undefined) {
        const lat = Number(body.lat), lng = Number(body.lng);
        const ok = Number.isFinite(lat) && Number.isFinite(lng) && lat >= 12 && lat <= 17 && lng >= -18 && lng <= -11;
        if (ok) { address.lat = Number(lat.toFixed(6)); address.lng = Number(lng.toFixed(6)); }
      }
      if (body.phone !== undefined) {
        const phone = body.phone ? normalizePhone(body.phone) : '';
        if (body.phone && !phone) return sendJson(res, 400, { error: 'invalid_phone' });
        address.phone = phone || '';
      }
      if (body.is_default) setDefaultAddress(user, address.id);
      address.updated_at = new Date().toISOString();
      saveDb();
      return sendJson(res, 200, { address, addresses: user.addresses });
    }
    if (addressMatch && method === 'DELETE') {
      const user = requireUser(req, res);
      if (!user) return;
      const id = decodeURIComponent(addressMatch[1]);
      const idx = user.addresses.findIndex((a) => a.id === id);
      if (idx < 0) return sendJson(res, 404, { error: 'not_found' });
      const wasDefault = user.addresses[idx].is_default;
      user.addresses.splice(idx, 1);
      if (wasDefault && user.addresses.length) setDefaultAddress(user, user.addresses[0].id);
      saveDb();
      return sendJson(res, 200, { ok: true, addresses: user.addresses });
    }
    if (pathname === '/api/auth/google/start' && method === 'POST') {
      /* OAuth Google réel uniquement si les identifiants sont configurés.
         Aucun mode « démo » : il permettait de se connecter sans mot de passe. */
      if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
        return sendJson(res, 200, { configured: false });
      }
      const state = crypto.randomBytes(16).toString('hex');
      db.oauth[state] = { status: 'pending', created: Date.now() };
      saveDb();
      const redirect = (process.env.PUBLIC_URL || ('https://' + (req.headers.host || 'localhost'))) + '/api/auth/google/callback';
      const params = new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID,
        redirect_uri: redirect,
        response_type: 'code',
        scope: 'openid email profile',
        state,
        access_type: 'online',
        prompt: 'select_account'
      });
      return sendJson(res, 200, { configured: true, state, url: 'https://accounts.google.com/o/oauth2/v2/auth?' + params.toString() });
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

/* Plan gratuit Render : sans trafic pendant 15 min l'instance s'endort, et son disque est éphémère
   (la base repart de zéro au réveil). Un appel périodique à sa propre URL publique la garde éveillée. */
const SELF_URL = (process.env.KEEP_ALIVE_URL || process.env.RENDER_EXTERNAL_URL || '').replace(/\/+$/, '');
if (SELF_URL && process.env.KEEP_ALIVE !== '0') {
  setInterval(() => {
    https.get(SELF_URL + '/api/health', (r) => r.resume()).on('error', (e) => console.error('[keep-alive]', e.message));
  }, 9 * 60e3).unref();
  console.log('Keep-alive actif → ' + SELF_URL + '/api/health toutes les 9 min');
}
