const { Pool } = require('pg');

// Repository en mémoire pour les tests unitaires
class InMemoryContactRepository {
  constructor() { this.contacts = []; }
  async create(contact) {
    this.contacts.push(contact);
    return contact;
  }
}

// Repository PostgreSQL pour la production
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
class PostgresContactRepository {
  async create(contact) {
    const query = 'INSERT INTO contacts (name, email, message) VALUES ($1, $2, $3) RETURNING *';
    const values = [contact.name, contact.email, contact.message];
    const res = await pool.query(query, values);
    return res.rows[0];
  }
}

module.exports = { InMemoryContactRepository, PostgresContactRepository };
