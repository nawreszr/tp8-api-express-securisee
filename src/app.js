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
