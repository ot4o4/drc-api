# Portails Darou Rahmane Chicken — client, gérant, livreur

Une seule API (`https://drc-api-dj8t.onrender.com`) et une seule base pour les trois sites :

| Portail | Adresse | Accès |
|---|---|---|
| Boutique (client) | https://darourahmane-chicken.onrender.com/ | libre ; compte client facultatif |
| Espace gérant | https://darourahmane-chicken.onrender.com/admin/ | code gérant (`ADMIN_TOKEN` sur Render) |
| Portail livreur | https://darourahmane-chicken.onrender.com/livreur/ | code du livreur (onglet **Livreurs** de l'espace gérant) |

## Parcours d'une commande

1. Le client commande sur la boutique (point GPS sur la carte, paiement Wave / Orange Money / espèces).
2. Le gérant la voit arriver (alerte), confirme ou refuse le paiement (refus = motif + annulation),
   ouvre la fiche et **attribue un livreur** dans la liste.
3. Le livreur la voit aussitôt dans « À récupérer » (adresse, GPS, itinéraire depuis le dépôt,
   montant à encaisser), écrit au client, puis « Colis récupéré » → « Confirmer la livraison ».
4. Le client suit chaque étape, voit son livreur (appel / WhatsApp) et la conversation.
5. Paiement à la livraison : la commande passe en « Espèces chez le livreur » ; le gérant clique
   « ✓ Reçu » quand l'argent lui est remis.

## Livreurs et codes

- Le **livreur principal** vient des variables Render `DRIVER_TOKEN` (son code), `DRIVER_ID`
  (`driver-1`), `DRIVER_NAME`, `DRIVER_PHONE`. Il est recréé automatiquement si la base repart de zéro.
- Les autres livreurs se créent dans l'espace gérant → **Livreurs** → « Ajouter un livreur » :
  un code `DRC-1234-5678` est généré. Boutons : Afficher le code, Copier, Envoyer par WhatsApp,
  Modifier, Nouveau code (l'ancien cesse de fonctionner), Désactiver.
- Les codes ne tiennent compte ni des majuscules, ni des espaces, ni des tirets.
- Un code livreur valide ne compte jamais comme tentative ratée côté gérant (8 échecs → 30 min de blocage par IP).

## Données et sauvegardes

Le service est sur le plan **gratuit** de Render : disque éphémère, la base repart de la graine à
chaque déploiement ou redémarrage. D'où :

- `./deploy.sh` : sauvegarde → push → attente du bon commit → restauration (jamais de déploiement sans sauvegarde) ;
- l'API s'appelle elle-même toutes les 9 min (`RENDER_EXTERNAL_URL`) pour ne pas s'endormir ;
- `GET /api/health` expose `boot.id` : un changement = redémarrage, à surveiller.

Solution définitive : passer le service en **Starter + disque 1 Go** (le `render.yaml` déclare déjà
le disque monté sur `data/`).

## Tests

```bash
node --test test/                       # API : 16 tests (rôles, livreurs, verrouillage, promo, restauration…)
node tools/e2e-portails.mjs <web> <api> <code-gérant> <code-livreur> <dossier-captures> [port-cdp]
```

Le parcours navigateur se lance contre une API **locale** (jamais la production) : `node server.js`
avec des codes de test, `python3 -m http.server` sur le dépôt `drc-web`, puis Chromium headless
`--remote-debugging-port`.
