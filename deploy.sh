#!/usr/bin/env bash
# Déploie l'API Darou Rahmane Chicken sur Render SANS perdre les données (plan gratuit = disque éphémère) :
#   sauvegarde → push (déploiement automatique Render) → attente du bon commit → restauration → contrôle.
#   ./deploy.sh        (depuis ~/drc-api, après git commit)
set -euo pipefail
cd "$(dirname "$0")"

SVC="${SVC:-srv-dbicoc7lk1mc73fu7g2g}"
URL="${URL:-https://drc-api-dj8t.onrender.com}"
RKEY="$(cat "$HOME/.secrets/render_key")"
ADM="$(cat "$HOME/.secrets/admin_token")"
BKDIR="$HOME/backups/drc"
STAMP="$(date +%Y%m%d-%H%M%S)"
BK="$BKDIR/drc-db-$STAMP-predeploy.json"
mkdir -p "$BKDIR"; chmod 700 "$BKDIR"

if [ -n "$(git status --porcelain)" ]; then
  echo "⚠️  Modifications non commitées — commit d'abord." >&2; exit 1
fi
HEAD_SHA="$(git rev-parse HEAD)"; HEAD_SHORT="${HEAD_SHA:0:7}"

echo "→ 1/6 sauvegarde des données en production"
curl -s -o /dev/null -m 90 "$URL/api/health" || true      # réveil (jusqu'à ~50 s sur le plan gratuit)
SAVED=0
for attempt in 1 2 3; do
  if curl -sf -m 90 -H "X-Admin-Token: $ADM" "$URL/api/admin/backup" -o "$BK" &&
     python3 -c "import json,sys;d=json.load(open('$BK'));sys.exit(0 if 'db' in d else 1)"; then
    chmod 600 "$BK"
    python3 -c "import json;d=json.load(open('$BK'));print('   ', d['counts'])"
    SAVED=1; break
  fi
  echo "   tentative $attempt échouée — nouvelle tentative…"; sleep 5
done
if [ "$SAVED" != "1" ]; then
  echo "   ⚠️ aucune sauvegarde — déploiement ANNULÉ pour ne pas perdre les données"; rm -f "$BK"; exit 1
fi

echo "→ 2/6 push de $HEAD_SHORT sur master"
git push -q origin HEAD:master

echo "→ 3/6 déploiement Render du commit $HEAD_SHORT"
DEP=""
for i in $(seq 1 12); do      # le déploiement automatique (GitHub App) démarre en général en quelques secondes
  DEP="$(curl -s -H "Authorization: Bearer $RKEY" "https://api.render.com/v1/services/$SVC/deploys?limit=5" |
    python3 -c "import json,sys
for e in json.load(sys.stdin):
    d=e['deploy']
    if (d.get('commit') or {}).get('id','').startswith('$HEAD_SHORT'): print(d['id']); break")"
  [ -n "$DEP" ] && break; sleep 5
done
if [ -z "$DEP" ]; then
  DEP="$(curl -sf -m 30 -X POST "https://api.render.com/v1/services/$SVC/deploys" -H "Authorization: Bearer $RKEY" \
    -H "Content-Type: application/json" -d '{"clearCache":"do_not_clear"}' | python3 -c "import json,sys;print(json.load(sys.stdin)['id'])")"
  echo "   déclenché manuellement : $DEP"
else
  echo "   déploiement automatique : $DEP"
fi

echo "→ 4/6 attente de la mise en ligne"
for i in $(seq 1 90); do
  STATUS="$(curl -s -H "Authorization: Bearer $RKEY" "https://api.render.com/v1/services/$SVC/deploys/$DEP" |
    python3 -c "import json,sys;print(json.load(sys.stdin).get('status',''))")"
  case "$STATUS" in
    live) echo "   live"; break ;;
    build_failed|update_failed|canceled|deactivated) echo "   ✗ $STATUS — les données d'origine restent sur l'ancienne instance" >&2; exit 1 ;;
  esac
  sleep 8
done
for i in $(seq 1 30); do curl -sf -m 15 "$URL/api/health" >/dev/null && break; sleep 5; done

echo "→ 5/6 restauration des données"
NOW="$(curl -sf -m 60 -H "X-Admin-Token: $ADM" "$URL/api/admin/stats" | python3 -c "import json,sys;d=json.load(sys.stdin);print(d['total_orders'] + d['users'])")"
WAS="$(python3 -c "import json;d=json.load(open('$BK'))['counts'];print(d['orders'] + d['users'])")"
if [ "$NOW" -lt "$WAS" ]; then
  curl -sf -m 60 -X POST "$URL/api/admin/restore" -H "X-Admin-Token: $ADM" -H "Content-Type: application/json" \
    --data-binary @"$BK" | python3 -c "import json,sys;print('   restauré :', json.load(sys.stdin)['counts'])"
else
  echo "   base intacte ($NOW ≥ $WAS) — rien à restaurer"
fi

echo "→ 6/6 contrôle"
curl -s -m 30 "$URL/api/health" | python3 -c "import json,sys;d=json.load(sys.stdin);print('   version', d.get('version'), '· livreurs configurés :', (d.get('drivers') or {}).get('configured'))"
echo "✅ $URL ($HEAD_SHORT) — sauvegarde : $BK"
