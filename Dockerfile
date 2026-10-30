# Darou Rahman Chicken — API (aucune dépendance npm)
FROM node:20-alpine

WORKDIR /app

# Le serveur ne dépend que de la bibliothèque standard de Node.
COPY server.js ./
COPY README.md PAYMENTS.md ./

# Les données (produits, commandes, comptes) vivent dans /app/data.
# Montez un volume ici pour qu'elles survivent aux redéploiements.
RUN mkdir -p /app/data
VOLUME ["/app/data"]

ENV PORT=8080
ENV NODE_ENV=production
EXPOSE 8080

# ADMIN_TOKEN doit être fourni au runtime (sinon "changeme").
CMD ["node", "server.js"]
