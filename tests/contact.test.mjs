import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import createApp from '../src/app.js';
import { InMemoryContactRepository } from '../src/repositories/contactRepository.js';

describe('API /api/contact', () => {
  let app;
  let repo;

  beforeEach(() => {
    repo = new InMemoryContactRepository();
    app = createApp({ contactRepository: repo });
  });

  it('devrait accepter une requête valide (201)', async () => {
    const res = await request(app)
      .post('/api/contact')
      .send({ name: "Ada", email: "ada@example.com", message: "Bonjour le monde, ceci est un test." });
    expect(res.status).toBe(201);
  });

  it('devrait rejeter une requête invalide (400)', async () => {
    const res = await request(app)
      .post('/api/contact')
      .send({ name: "A", email: "pas-un-email", message: "Court" });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("VALIDATION_ERROR");
  });

  it('devrait rejeter un JSON tronqué (400 INVALID_JSON)', async () => {
    const res = await request(app)
      .post('/api/contact')
      .set('Content-Type', 'application/json')
      .send('{"name": "Ada",');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("INVALID_JSON");
  });

  it('devrait retourner 500 sans stack trace', async () => {
    repo.create = async () => { throw new Error("Crash BDD secret"); };
    const res = await request(app)
      .post('/api/contact')
      .send({ name: "Ada", email: "ada@example.com", message: "Message valide pour le test." });
    expect(res.status).toBe(500);
    expect(res.body.error).toBe("INTERNAL_ERROR");
    expect(res.text).not.toContain("Crash BDD secret");
  });
});
