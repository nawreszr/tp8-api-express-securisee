# TP8 – API Express sécurisée et testée (Zod, Helmet, rate limiting, Vitest)

> **Enseignant :** Wahid Hamdi
> **Auteur :** Nawres Zarrouki

Une API de formulaire de contact volontairement fragile est rendue **robuste** : validation stricte des entrées (Zod), erreurs uniformes sans fuite d'information, en-têtes de sécurité (Helmet), limitation de taille et de débit, puis **preuve par des tests automatisés** (Vitest + Supertest) y compris contre un vrai PostgreSQL lancé avec Docker Compose.

## Sommaire

1. [Objectifs et structure du dépôt](#1-objectifs-et-structure-du-dépôt)
2. [Partie 1 : OWASP API Security Top 10](#2-partie-1--owasp-api-security-top-10)
3. [Partie 2 : validation et gestion des erreurs](#3-partie-2--validation-et-gestion-des-erreurs)
4. [Partie 3 : durcissement HTTP](#4-partie-3--durcissement-http)
5. [Partie 4 : tests de routes et cas négatifs](#5-partie-4--tests-de-routes-et-cas-négatifs)
6. [Partie 5 : intégration avec PostgreSQL et migrations](#6-partie-5--intégration-avec-postgresql-et-migrations)
7. [Défi : intégration continue](#7-défi--intégration-continue)
8. [Résumé des captures](#8-résumé-des-captures)

---

## 1. Objectifs et structure du dépôt

- Situer les risques d'une API avec l'**OWASP API Security Top 10**.
- Valider les entrées avec **Zod** et centraliser les erreurs dans un middleware.
- Ajouter **Helmet**, limiter la taille des requêtes et le débit (**rate limiting**).
- Écrire des tests de routes (**Vitest + Supertest**) avec des cas négatifs.
- Tester contre un vrai **PostgreSQL** (Docker Compose) et appliquer des **migrations**.

**Prérequis :** VM Ubuntu avec Node.js 24, npm, Docker et Compose.

```bash
npm install
npm test
```

Structure du dépôt :

```
  .env.example
  .gitignore
  docker-compose.yml
  migrations/001_create_contacts.sql
  migrations/002_add_contacts_email_index.sql
  package-lock.json
  package.json
  src/app.js
  src/middlewares/errorHandler.js
  src/middlewares/validate.js
  src/migrate.js
  src/repositories/contactRepository.js
  src/routes/contact.js
  src/schemas/contact.js
  src/server.js
  tests/contact.test.mjs
  tests/integration/contact.int.test.mjs
  vitest.config.mjs
  captures/
```

---

## 2. Partie 1 : OWASP API Security Top 10

| Risque OWASP | Concerne notre API ? | Mesure dans ce TP |
|---|---|---|
| API1 Broken Object Level Authorization | Non pour l'instant : pas d'objets par utilisateur ni de route de lecture par identifiant | À traiter si une route `GET /api/contact/:id` est ajoutée |
| API2 Broken Authentication | Non : API publique de formulaire | Hors périmètre du TP |
| API3 Broken Object Property Level Authorization | **Oui** : champs en trop acceptés (mass assignment) | `.strict()` refuse tout champ non prévu |
| API4 Unrestricted Resource Consumption | **Oui** : corps et débit non limités | Rate limiting, taille max du corps (`10kb`), `limit` de pagination à 50 |
| API5 Broken Function Level Authorization | Non : une seule fonction publique | Hors périmètre |
| API6 Unrestricted Access to Sensitive Business Flows | **Oui** : le formulaire peut être spammé | Rate limiting sur `/api/contact` |
| API7 Server Side Request Forgery | Non : aucune requête sortante | Hors périmètre |
| API8 Security Misconfiguration | **Oui** : stack trace divulguée, `x-powered-by` exposé | Helmet, `x-powered-by` désactivé, erreurs sans stack |
| API9 Improper Inventory Management | Faible : surface minimale | Route 404 JSON, aucune route non documentée |
| API10 Unsafe Consumption of APIs | Non : aucune API tierce consommée | Entrées validées avant tout traitement |

**Trois attaques que la version de départ laisse passer :**

1. **Entrées non validées** : champs manquants, types inattendus ou champs en trop sont acceptés (mass assignment).
2. **Divulgation d'informations** : en cas d'erreur, la *stack trace* est renvoyée au client.
3. **Aucune limite de taille ni de débit** : un corps énorme ou une rafale de requêtes épuise les ressources de l'API.

L'injection SQL est évitée par les requêtes paramétrées du repository PostgreSQL.

---

## 3. Partie 2 : validation et gestion des erreurs

Chaîne de middlewares : `helmet` → rate limit → `json` → validation → route → erreur.

**Schéma Zod** (`name` 2 à 100 caractères, `email` valide ≤ 254, `message` 10 à 2000, `.strict()`) :

Fichier `src/schemas/contact.js` :

```javascript
const { z } = require('zod');

const contactSchema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 chars").max(100, "Name too long"),
  email: z.string().trim().email("Invalid email").max(254, "Email too long"),
  message: z.string().trim().min(10, "Message must be at least 10 chars").max(2000, "Message too long")
}).strict(); // .strict() empêche l'ajout de champs non autorisés

module.exports = { contactSchema };
```

**Middleware de validation** : réponse `400` avec `VALIDATION_ERROR` et le détail champ par champ.

Fichier `src/middlewares/validate.js` :

```javascript
module.exports = (schema) => (req, res, next) => {
  const result = schema.safeParse(req.body);
  if (!result.success) {
    return res.status(400).json({
      error: "VALIDATION_ERROR",
      details: result.error.issues.map(e => ({ field: e.path[0], message: e.message }))
    });
  }
  req.body = result.data;
  next();
};
```

**Middleware d'erreur centralisé** : `INVALID_JSON` (400), `PAYLOAD_TOO_LARGE` (413), `INTERNAL_ERROR` (500). La stack trace est journalisée **côté serveur** et n'est jamais renvoyée au client.

Fichier `src/middlewares/errorHandler.js` :

```javascript
module.exports = (err, req, res, next) => {
  console.error(`[SERVER ERROR] ${err.message}`);

  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: "INVALID_JSON" });
  }
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ error: "PAYLOAD_TOO_LARGE" });
  }

  res.status(500).json({ error: "INTERNAL_ERROR" });
};
```

**Route** : `validate(contactSchema)` est branché avant le traitement.

Fichier `src/routes/contact.js` :

```javascript
const express = require('express');
const { contactSchema } = require('../schemas/contact');
const validate = require('../middlewares/validate');

module.exports = (contactRepository) => {
  // Le routeur est maintenant déclaré ICI, pour chaque instance
  const router = express.Router();
  
  router.post('/', validate(contactSchema), async (req, res, next) => {
    try {
      const newContact = await contactRepository.create(req.body);
      res.status(201).json({ success: true, data: newContact });
    } catch (err) {
      next(err);
    }
  });
  
  return router;
};
```

Exemple d'erreur de validation :

```json
{
  "error": "VALIDATION_ERROR",
  "details": [{ "field": "email", "message": "Invalid email" }]
}
```

### Requête invalide refusée

![Requête invalide et réponse VALIDATION_ERROR détaillée](captures/validation-400.png)

---

## 4. Partie 3 : durcissement HTTP

- `app.disable("x-powered-by")` puis `app.use(helmet())` : en-têtes de sécurité, technologie non divulguée.
- `express.json({ limit: "10kb" })` : corps JSON limité en taille.
- `express-rate-limit` **uniquement sur `/api/contact`** (5 requêtes par minute et par IP, en-têtes `RateLimit-*` standard).
- Derrière un reverse proxy (Nginx, Ingress) : `app.set("trust proxy", 1)`, sinon toutes les requêtes semblent venir de la même IP.

Fichier `src/app.js` :

```javascript
const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const contactRoute = require('./routes/contact');
const errorHandler = require('./middlewares/errorHandler');

function createApp({ contactRepository }) {
  const app = express();

  // Durcissement HTTP
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(express.json({ limit: '10kb' }));

  // Healthcheck
  app.get('/api/health', (req, res) => res.status(200).send('OK'));

  // Rate Limiting
  const contactLimiter = rateLimit({
    windowMs: 1 * 60 * 1000,
    max: 5,
    message: { error: "TOO_MANY_REQUESTS" }
  });

  // Routes
  app.use('/api/contact', contactLimiter, contactRoute(contactRepository));

  // 404
  app.use((req, res) => res.status(404).json({ error: "NOT_FOUND" }));

  // Erreur centralisée
  app.use(errorHandler);

  return app;
}

module.exports = createApp;
```

Comparaison des en-têtes avant / après Helmet :

```bash
curl -I http://localhost:4000/api/health
```

![En-têtes HTTP avant et après Helmet](captures/helmet-headers.png)

Test du rate limiting : la boucle se termine par des réponses `429` :

```bash
for i in $(seq 1 7); do
  curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:4000/api/contact \
    -H 'Content-Type: application/json' \
    -d '{"name":"Ada","email":"ada@example.com","message":"Bonjour le monde"}'
done
```

![Boucle curl se terminant par des réponses 429](captures/rate-limit-429.png)

---

## 5. Partie 4 : tests de routes et cas négatifs

| Outil | Rôle |
|---|---|
| Vitest | Lanceur de tests et assertions (`describe`, `it`, `expect`) |
| Supertest | Envoie des requêtes HTTP à l'application sans ouvrir de port |
| Repository en mémoire | Remplace PostgreSQL dans les tests de routes : rapides, sans dépendance |

Chaque `it.todo` est transformé en test réel : requête valide, champs manquants, types inattendus, champs en trop, **JSON tronqué** (`INVALID_JSON`), corps trop gros, tentative d'injection, route 404, et erreur 500 avec un repository dont `create()` lève une exception (la réponse ne contient ni stack ni message d'origine).

_(fichier `tests/contact.test.js` absent du dépôt)_

```bash
npm test
```

![npm test : tous les tests passent, plus aucun todo](captures/tests-ok.png)

Mesure de la couverture :

```bash
npm run test:coverage
```

![Rapport de couverture de code](captures/coverage.png)

---

## 6. Partie 5 : intégration avec PostgreSQL et migrations

Démarrage de la base et application des migrations (le mot de passe vient du `.env`, jamais versionné) :

```bash
cp .env.example .env            # puis changer le mot de passe
set -a; . ./.env; set +a
docker compose up -d --wait
npm run migrate                 # applique les migrations
npm run migrate                 # 2e exécution : rien à faire (idempotent)
```

Fichier `.env.example` :

```bash
DATABASE_URL=postgresql://admin:secretpassword@localhost:5432/api_db
PORT=4000
```

_(fichier `compose.yaml` absent du dépôt)_

**Migrations SQL** (la seconde ajoute un index sur `email`) :

Fichier `migrations/001_create_contacts.sql` :

```sql
CREATE TABLE IF NOT EXISTS contacts (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(254) NOT NULL,
    message TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

Fichier `migrations/002_add_contacts_email_index.sql` :

```sql
CREATE INDEX IF NOT EXISTS idx_contacts_email ON contacts(email);
```

**Test d'intégration** contre le vrai PostgreSQL :

_(fichier `tests/integration/contact.int.test.js` absent du dépôt)_

```bash
npm run test:integration
npm start      # puis curl : requête valide, requête invalide, tentative d'injection
```

![npm run test:integration contre PostgreSQL](captures/integration-ok.png)

---

## 7. Défi : intégration continue

Un workflow **GitHub Actions** lance `npm test`, puis `npm run test:integration` avec un *service container* `postgres:17-alpine`.

_(aucun fichier correspondant dans le dépôt)_

<!-- capture à ajouter : captures/ci-green.png -->

---

## 8. Résumé des captures

| Capture | Contenu |
|---|---|
| `validation-400.png` | Requête invalide et réponse `VALIDATION_ERROR` détaillée |
| `helmet-headers.png` | `curl -I` avant / après Helmet |
| `rate-limit-429.png` | Boucle `curl` se terminant par des `429` |
| `tests-ok.png` | `npm test` : tous les tests passent, plus aucun `todo` |
| `coverage.png` | Rapport de couverture |
| `integration-ok.png` | `npm run test:integration` contre PostgreSQL |
| `ci-green.png` | (Défi) workflow GitHub Actions réussi |
