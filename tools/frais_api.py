#!/usr/bin/env python3
"""Remplace « fermier » par « frais » dans le catalogue de l'API en production (produits seulement).

Sauvegarde → transformation des produits → restauration. Les commandes, clients, livreurs et réglages
sont renvoyés tels quels (copie fraîche prise juste avant la restauration).
Usage : frais_api.py [--dry-run]
"""
import json, os, re, sys, time, urllib.request

URL = 'https://drc-api-dj8t.onrender.com'
TOKEN = open(os.path.expanduser('~/.secrets/admin_token')).read().strip()
BKDIR = os.path.expanduser('~/backups/drc')
DRY = '--dry-run' in sys.argv

RULES = [
    (r'Des œufs fermiers frais', 'Des œufs frais'),
    (r'nos partenaires fermiers', 'nos partenaires éleveurs'),
    (r'\bFermières\b', 'Fraîches'), (r'\bfermières\b', 'fraîches'),
    (r'\bFermière\b', 'Fraîche'), (r'\bfermière\b', 'fraîche'),
    (r'\bFermiers\b', 'Frais'), (r'\bfermiers\b', 'frais'),
    (r'\bFermier\b', 'Frais'), (r'\bfermier\b', 'frais'),
    (r'\b([Ff])rais frais\b', r'\1rais'),
]

def fix(s):
    for a, b in RULES:
        s = re.sub(a, b, s)
    return s

def walk(v, path, changes):
    if isinstance(v, str):
        n = fix(v)
        if n != v:
            changes.append((path, v, n))
        return n
    if isinstance(v, list):
        return [walk(x, f'{path}[{i}]', changes) for i, x in enumerate(v)]
    if isinstance(v, dict):
        return {k: walk(x, f'{path}.{k}', changes) for k, x in v.items()}
    return v

def call(method, path, body=None, timeout=90):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(URL + path, data=data, method=method,
                                 headers={'X-Admin-Token': TOKEN, 'Content-Type': 'application/json'})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode())

def backup(tag):
    for attempt in range(3):
        try:
            d = call('GET', '/api/admin/backup')
            if 'db' in d:
                os.makedirs(BKDIR, exist_ok=True)
                f = os.path.join(BKDIR, f'drc-db-{time.strftime("%Y%m%d-%H%M%S")}-{tag}.json')
                with open(f, 'w') as fh:
                    json.dump(d, fh, ensure_ascii=False)
                os.chmod(f, 0o600)
                return d, f
        except Exception as e:
            print('  sauvegarde, tentative', attempt + 1, 'échouée :', type(e).__name__)
            time.sleep(5)
    sys.exit('aucune sauvegarde — rien n\'est modifié')

try:
    urllib.request.urlopen(URL + '/api/health', timeout=90).read()
except Exception:
    pass

b1, f1 = backup('avant-frais')
print('sauvegarde :', f1, b1['counts'])
ch = []
walk(b1['db']['products'], 'products', ch)
for p, a, n in ch:
    print(f'  {p}\n    - {a[:150]}\n    + {n[:150]}')
if DRY or not ch:
    print('dry-run' if DRY else 'rien à changer'); sys.exit(0)

b2, f2 = backup('avant-frais-2')          # copie la plus fraîche possible juste avant d'écrire
if b2['counts'] != b1['counts']:
    print('  (les données ont bougé entre les deux sauvegardes, on part de la plus récente)', b2['counts'])
db = b2['db']
ch2 = []
db['products'] = walk(db['products'], 'products', ch2)
r = call('POST', '/api/admin/restore', {'db': db})
print('restauration :', r)
after = call('GET', '/api/admin/backup')
print('contrôle :', after['counts'], '(avant :', b2['counts'], ')')
left = [p.get('id') for p in after['db']['products'] if re.search('fermi', json.dumps(p, ensure_ascii=False), re.I)]
print('produits contenant encore « fermi » :', left or 'aucun')
