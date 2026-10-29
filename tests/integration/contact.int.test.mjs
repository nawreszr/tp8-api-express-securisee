import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import createApp from '../../src/app.js';
import { PostgresContactRepository } from '../../src/repositories/contactRepository.js';
import pg from 'pg';

describe('Intégration avec PostgreSQL', () => {
  let app;
  let pool;

  beforeAll(() => {
    // Grâce à vitest.config.mjs, DATABASE_URL est déjà chargé ici
    pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
    const repo = new PostgresContactRepository();
    app = createApp({ contactRepository: repo });
  });

  afterAll(async () => {
    await pool.query('TRUNCATE contacts RESTART IDENTITY');
    await pool.end();
  });

  it('devrait enregistrer un contact dans la vraie BDD', async () => {
    const res = await request(app)
      .post('/api/contact')
      .send({ name: "Integration Test", email: "int@test.com", message: "Ceci est un test d'intégration." });
    
    expect(res.status).toBe(201);

    const dbRes = await pool.query('SELECT * FROM contacts WHERE email = $1', ['int@test.com']);
    expect(dbRes.rows.length).toBe(1);
    expect(dbRes.rows[0].name).toBe("Integration Test");
  });
});
