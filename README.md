# Darou Rahman Chicken — API

API REST du commerce en ligne **Darou Rahman Chicken** (livraison de viande de poulet à Dakar, Sénégal).
Serveur **Node.js sans aucune dépendance** (module `node:http` uniquement) : pas de `npm install`, pas de `node_modules`.

---

## 1. Installation et lancement

Prérequis : **Node.js 18 ou supérieur** (Node.js 26 recommandé).

```bash
cd /root/drc-api
node server.js
```

Le serveur démarre sur le port **8080** par défaut. Vérification :

```bash
curl http://localhost:8080/api/health
# {"ok":true,"shop":"Darou Rahman Chicken","payments":{"wave":false,"orange_money":false,"cod":true}}
```

Les données (produits, commandes) sont persistées dans `data/db.json` (créé automatiquement au premier lancement).

### Variables d'environnement

Voir `.env.example` pour la liste complète. Résumé :

| Variable | Défaut | Description |
|---|---|---|
| `PORT` | `8080` | Port d'écoute |
| `ADMIN_TOKEN` | `changeme` | Jeton d'administration (en-tête `x-admin-token`) — **à changer en production** |
| `SHOP_PHONE` | `+221 77 000 00 00` | Numéro affiché pour les paiements manuels |
| `WAVE_API_TOKEN` | *(vide)* | Jeton Bearer de la Wave Checkout API |
| `WAVE_MERCHANT_NAME` | *(vide)* | Nom marchand Wave (optionnel) |
| `ORANGE_MERCHANT_KEY` | *(vide)* | Clé marchande Orange Money Web Payment API |
| `ORANGE_MERCHANT_TOKEN` | *(vide)* | Jeton Bearer Orange Money |

> ⚠️ Ce serveur ne lit **pas** automatiquement un fichier `.env` (aucune dépendance).
> Pour utiliser `.env` : `set -a; . ./.env; set +a; node server.js`
> ou définissez les variables dans votre unité systemd / tableau de bord Railway / Render.

### Lancer en production

**systemd** (`/etc/systemd/system/drc-api.service`) :

```ini
[Unit]
Description=API Darou Rahman Chicken
After=network.target

[Service]
WorkingDirectory=/root/drc-api
ExecStart=/usr/bin/node /root/drc-api/server.js
Environment=PORT=8080
Environment=ADMIN_TOKEN=votre-jeton-secret
Environment=SHOP_PHONE=+221 77 000 00 00
Environment=WAVE_API_TOKEN=
Environment=ORANGE_MERCHANT_KEY=
Environment=ORANGE_MERCHANT_TOKEN=
Restart=always
User=root

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now drc-api
```

**pm2** (si vous préférez pm2) :

```bash
npm install -g pm2
pm2 start server.js --name drc-api
pm2 save && pm2 startup
```

**Note importante sur les fichiers de données** : la persistance utilise `data/db.json`.
Sur Railway/Render, le disque est éphémère sauf si vous montez un **volume persistant** sur le dossier `data/`.

---

## 2. Brancher de vraies identifiants marchands

### Wave (Wave Checkout API)

Lorsqu'un client choisit « Wave » et que `WAVE_API_TOKEN` est défini, le serveur appelle :

```
POST https://api.wave.com/v1/checkout/sessions
Authorization: Bearer <WAVE_API_TOKEN>
Content-Type: application/json

{
  "amount": "12500",          // montant total en XOF (entier)
  "currency": "XOF",
  "success_url": "https://darourahman.sn/merci?ref=DRC-2026-0001"
}
```

La réponse contient un champ `url` : c'est le lien de paiement renvoyé au client
(`payment.type = "link"` dans `POST /api/orders`).

Pour obtenir un jeton marchand Wave :
1. Créez un compte marchand sur [https://www.wave.com](https://www.wave.com) (Sénégal).
2. Dans le tableau de bord développeur Wave, générez une **clé secrète API** (mode test puis mode production).
3. Renseignez-la dans `WAVE_API_TOKEN` (et `WAVE_MERCHANT_NAME` avec le nom de votre boutique).

### Orange Money (Orange Money Web Payment API)

Lorsqu'un client choisit « Orange Money » et que `ORANGE_MERCHANT_KEY` + `ORANGE_MERCHANT_TOKEN` sont définis, le serveur :

1. **Crée le paiement** :
   ```
   POST https://api.orange.com/orange-money-webpayment/webpayment
   Authorization: Bearer <ORANGE_MERCHANT_TOKEN>
   {
     "merchant_key": "<ORANGE_MERCHANT_KEY>",
     "currency": "952",           // code ISO XOF
     "order_id": "DRC-2026-0001",
     "amount": 12500,
     "return_url": "https://darourahman.sn/merci?ref=DRC-2026-0001",
     "notif_url": "https://api.darourahman.sn/api/payments/webhook/orange_money",
     "lang": "fr",
     "reference": "Darou Rahman Chicken"
   }
   ```
   La réponse contient `payment_url`, renvoyé au client comme lien de paiement.
2. **Reçoit la notification** sur `POST /api/payments/webhook/orange_money` (voir section Webhook).
   En production, ajoutez un **appel de sondage** (« poll ») de l'API Orange pour confirmer le statut
   si la notification est perdue : interrogez l'endpoint de statut de transaction Orange avec le `pay_token`.

Pour obtenir vos identifiants Orange Money :
1. Inscrivez-vous sur [https://developer.orange.com](https://developer.orange.com).
2. Souscrivez à l'offre **Orange Money Web Payment** pour le Sénégal.
3. Récupérez votre `merchant_key` et générez un jeton d'accès OAuth2 (`client_id` / `client_secret` → `access_token`).
4. Renseignez `ORANGE_MERCHANT_KEY` et `ORANGE_MERCHANT_TOKEN`.

### Paiement à la livraison (espèces)

Toujours actif (`cod: true`). Aucune configuration requise.

### Repli automatique

Si les identifiants sont absents **ou** si l'appel à l'API du fournisseur échoue,
la commande bascule automatiquement sur `payment.type = "instructions"` :
le numéro `SHOP_PHONE` est renvoyé avec un texte d'instructions en français
et le statut `awaiting_payment_manual`. La commande reste donc toujours valide.

---

## 3. Contrat d'API

| Méthode | Route | Description |
|---|---|---|
| GET | `/api/health` | Santé du service + moyens de paiement disponibles |
| GET | `/api/products` | Catalogue (8 produits) |
| POST | `/api/orders` | Créer une commande |
| GET | `/api/orders/:id` | Détail d'une commande (`DRC-YYYY-NNNN`) |
| GET | `/api/orders?phone=...` | Commandes d'un client par téléphone |
| GET | `/api/admin/orders` | Toutes les commandes (en-tête `x-admin-token`) |
| GET | `/api/admin/stats` | Tableau de bord gérant (jour, CA, à traiter, stocks bas) |
| PATCH | `/api/admin/orders/:id` | Changer le statut d'une commande (`{"status": "shipping"}`) |
| GET | `/api/admin/products` | Catalogue complet pour le gérant (stock, disponibilité) |
| PATCH | `/api/admin/products/:id` | Modifier prix / stock / disponibilité d'un produit |
| POST | `/api/payments/webhook/:provider` | Webhook de confirmation de paiement |

Toutes les routes `/api/admin/*` exigent l'en-tête `x-admin-token` (valeur de `ADMIN_TOKEN`)
et répondent `401 {"error":"unauthorized"}` sinon.

Statuts acceptés par `PATCH /api/admin/orders/:id` :
`pending`, `confirmed`, `preparing`, `shipping`, `delivered`, `cancelled`, `paid`.
Un produit avec `available: false` disparaît du catalogue public `/api/products`.

### POST /api/orders

Corps :

```json
{
  "items": [{"id": 1, "name": "Poulet Bicyclette Fermier Entier", "price": 7500, "qty": 2, "variant": "Entier prêt à cuire"}],
  "customer": {"name": "Awa Diop", "phone": "+221 77 123 45 67", "zone": "Plateau", "note": "Livrer après 18h"},
  "payment_method": "wave"
}
```

- `payment_method` : `wave`, `orange_money` ou `cod`.
- Frais de livraison : **2 000 FCFA** si le sous-total < **15 000 FCFA**, sinon **offerts**.
- Réponse `201` avec l'objet `order` (identifiant `DRC-YYYY-NNNN`, `status`, `total`, `delivery_fee`, `payment`).
- Réponse `400 {"error":"invalid"}` si `items` est vide, si `customer.name` ou `customer.phone` manque,
  ou si `payment_method` n'est pas dans la liste autorisée.

Statuts possibles : `confirmed` (paiement à la livraison), `awaiting_payment` (lien de paiement envoyé),
`awaiting_payment_manual` (instructions manuelles), `paid` (confirmé par webhook).

### Webhook paiements — `/api/payments/webhook/:provider`

Stub de développement : il ne valide **aucune signature**. Il cherche la référence de commande
dans les champs `reference` ou `metadata.reference` du corps JSON et marque la commande `paid`.

> ⚠️ **AVANT LA PRODUCTION** : implémentez la **validation de signature** des webhooks
> (en-tête `Authorization`/signature HMAC côté Wave, vérification de l'origine et du jeton
> de notification côté Orange Money), ainsi que la vérification côté fournisseur du statut réel
> du paiement. Sans cela, n'importe qui peut marquer une commande comme payée.

---

## 4. Déploiement

### VPS (recommandé — le plus simple)

1. Louez un VPS (DigitalOcean, OVH, Scaleway…) avec Ubuntu/Debian.
2. Installez Node.js 26, copiez le dossier `/root/drc-api` sur le serveur.
3. Configurez l'unité systemd ci-dessus avec vos variables d'environnement.
4. (Optionnel mais recommandé) Installez **Caddy** ou **nginx** en reverse-proxy avec HTTPS :
   ```
   api.darourahman.sn {
       reverse_proxy localhost:8080
   }
   ```

### Railway

1. Poussez ce dossier sur un dépôt GitHub.
2. Sur [https://railway.app](https://railway.app) : *New Project → Deploy from GitHub*.
3. Railway détecte Node.js ; commandes : **Build** `npm install` (vide, aucune dépendance), **Start** `node server.js`.
4. Ajoutez vos variables d'environnement dans *Variables* (`PORT` est fourni automatiquement par Railway).
5. Ajoutez un **volume persistant** monté sur `data/` pour conserver les commandes.

### Render

1. [https://render.com](https://render.com) : *New → Web Service* → connectez le dépôt GitHub.
2. Runtime **Node**, commande de démarrage : `node server.js`.
3. Renseignez les variables d'environnement dans *Environment*.
4. Le disque Render est éphémère : utilisez un **disque persistant** sur `data/`, ou basculez
   la persistance vers une base de données externe si le volume devient important.

---

## 5. Pointer l'application Android vers ce serveur

L'application (WebView) lit la clé `localStorage` **`drc_api`** pour connaître l'URL de base de l'API.

**Depuis l'app, sans rebuild** : *Compte → Espace gérant → « Serveur de l'app »*, collez l'URL
publique (`https://...`), puis **Enregistrer l'URL du serveur**. L'app se recharge et passe
en 🟢 En ligne. Le champ est aussi accessible avant connexion, donc une URL erronée se corrige
toujours depuis l'app.

Équivalent technique (console WebView, tests) :

```javascript
localStorage.setItem('drc_api', 'http://192.168.1.10:8080');
```

Le serveur accepte les requêtes cross-origin depuis `file://` (CORS `*`).

---

## 6. Documents Play Store

Le dossier `playstore/` contient les documents prêts à publier :

- `playstore/privacy-policy.md` — politique de confidentialité (à héberger sur GitHub Pages).
- `playstore/listing.md` — fiche Play Store (titre, descriptions, classification, data safety).

---

## 7. Support

Boutique **Darou Rahman Chicken**, Dakar, Sénégal — téléphone : `+221 77 000 00 00`.
