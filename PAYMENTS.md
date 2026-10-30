# Paiements — Wave & Orange Money (Sénégal)

## 1. Wave (recommandé — le plus rapide)

**API : Wave Checkout** — https://docs.wave.com/checkout · Base : `https://api.wave.com`

1. Créer un **Wave Business Account** (wave.com/senegal, section Business).
2. Portail développeur → **API keys** → créer une clé avec accès *Checkout* (+ *Webhooks*).
   Format : `wave_sn_prod_...` (prod) / `wave_sn_test_...` (test).
3. Activer les webhooks vers `https://<votre-domaine>/api/payments/webhook/wave`
   (événements `checkout.session.completed`, `checkout.session.payment_failed`) —
   la signature HMAC-SHA256 est vérifiée par le serveur si `WAVE_WEBHOOK_SECRET` est défini.

**Variables serveur :**
- `WAVE_API_TOKEN` = clé API
- `WAVE_WEBHOOK_SECRET` = secret webhook (recommandé)
- `WAVE_MERCHANT_NAME` = nom affiché (optionnel)

**Flux :** l'app crée la commande → l'API renvoie `wave_launch_url` → redirection vers
l'app Wave → paiement → webhook `checkout.session.completed` → statut `paid`.

**Délai :** quelques jours (compte business + validation).

---

## 2. Orange Money (Orange Sonatel)

**API : Orange Money Web Payment / M-Payment** — https://developer.orange.com/apis/om-webpay
Portail Sénégal : https://developer.orange-sonatel.com/dev/docs/orange-money

1. **S'inscrire** sur developer.orange-sonatel.com, créer une application (test).
2. **Devenir marchand Orange Money** (obligatoire) : dossier en agence ou par mail
   `DemandeOMB2B@orange-sonatel.com` — pièces requises :
   - RCCM (Registre de Commerce et du Crédit Mobilier)
   - NINEA
   - CNI/passeport des personnes du RCCM + gestionnaire
   - RIB (Relevé d'Identité Bancaire)
   - Descriptif de l'activité (nom de l'app/site)
   - Fiche d'identification partenaire remplie et signée
3. Recevoir les identifiants OAuth (`client_id` / `client_secret`), tester, puis production.

**Variables serveur :**
- `ORANGE_CLIENT_ID` + `ORANGE_CLIENT_SECRET` (OAuth2 client_credentials — le serveur
  récupère le token automatiquement), **ou** `ORANGE_MERCHANT_TOKEN` si token déjà obtenu
- `ORANGE_MERCHANT_KEY` = clé marchand

**Flux :** l'app crée la commande → l'API renvoie `payment_url` (page de paiement Sonatel
hébergée, personnalisable) → le client valide avec un **OTP** généré par USSD →
`notif_url` (`/api/payments/webhook/orange_money`) → statut `paid`.

**Frais :** ~1% de commission, reversement à **J+5** sur le compte bancaire.

---

## Sans clés pour l'instant

Le serveur bascule automatiquement sur les **instructions de paiement manuelles**
(envoi au numéro indiqué + référence de commande) — fonctionnel dès aujourd'hui.

**Alternative rapide** : un agrégateur (LigdiCash, PayDunya) couvre Wave SN + Orange Money
avec un seul compte — utile si les dossiers marchands traînent.

---

## Lien de paiement statique (sans contrat API)

Si vous avez un **lien de paiement** Wave Business ou Orange Money (créé depuis l'app
marchand, sans passer par l'API), collez-le dans les variables d'environnement :

```
WAVE_PAY_LINK=https://pay.wave.com/m/XXXXXXXX
ORANGE_PAY_LINK=https://orange-money.example/lien
```

Le jeton `{ref}` est remplacé par le numéro de commande :

```
WAVE_PAY_LINK=https://pay.wave.com/m/XXXXXXXX?ref={ref}
```

Comportement : la commande passe en `awaiting_payment`, l'app affiche un bouton
**« Ouvrir le paiement sécurisé »** avec ce lien, et la référence est rappelée au client.

> Sans `{ref}`, le lien s'ouvre tel quel : le client doit saisir lui-même le montant et
> la référence. Avec `{ref}`, la référence est pré-remplie quand le fournisseur l'accepte.
