require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function runMigrations() {
  try {
    // Créer la table de suivi
    await pool.query(`
      CREATE TABLE IF NOT EXISTS _migrations (
        id SERIAL PRIMARY KEY,
        filename VARCHAR(255) UNIQUE NOT NULL,
        applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    const files = fs.readdirSync(path.join(__dirname, '../migrations')).sort();
    
    for (const file of files) {
      const check = await pool.query('SELECT * FROM _migrations WHERE filename = $1', [file]);
      if (check.rows.length === 0) {
        console.log(`Application de la migration : ${file}`);
        const sql = fs.readFileSync(path.join(__dirname, '../migrations', file), 'utf8');
        await pool.query(sql);
        await pool.query('INSERT INTO _migrations (filename) VALUES ($1)', [file]);
      } else {
        console.log(`Déjà appliquée : ${file}`);
      }
    }
    console.log("✅ Migrations terminées avec succès.");
  } catch (err) {
    console.error("❌ Erreur de migration :", err);
  } finally {
    await pool.end();
  }
}

runMigrations();
