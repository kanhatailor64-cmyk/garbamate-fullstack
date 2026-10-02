const path = require('path');
const fs = require('fs');
const { createClient } = require('@libsql/client');

let client = null;

function getDbConfig() {
  if (process.env.TURSO_DATABASE_URL) {
    return {
      url: process.env.TURSO_DATABASE_URL,
      authToken: process.env.TURSO_AUTH_TOKEN || undefined
    };
  }

  // If running in Vercel serverless environment, use /tmp which is writable
  if (process.env.VERCEL) {
    const tmpDbPath = '/tmp/garbamate.db';
    const bundledDbPath = path.join(__dirname, 'garbamate.db');
    if (!fs.existsSync(tmpDbPath) && fs.existsSync(bundledDbPath)) {
      try {
        fs.copyFileSync(bundledDbPath, tmpDbPath);
      } catch (e) {
        console.warn('Could not copy bundled db to /tmp:', e.message);
      }
    }
    return { url: 'file:' + tmpDbPath };
  }

  // Local development
  return { url: 'file:' + path.join(__dirname, 'garbamate.db') };
}

function getClient() {
  if (!client) {
    client = createClient(getDbConfig());
  }
  return client;
}

const db = {
  async init() {
    const c = getClient();
    await c.execute(`
      CREATE TABLE IF NOT EXISTS users(
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE,
        pw TEXT,
        name TEXT,
        age INT,
        gender TEXT,
        college TEXT,
        city TEXT,
        state TEXT,
        skill TEXT,
        style TEXT,
        bio TEXT DEFAULT '',
        photo TEXT,
        emoji TEXT DEFAULT '💃',
        hue INT,
        banned INT DEFAULT 0,
        undo_day TEXT,
        custom_question TEXT DEFAULT '',
        expected_answer TEXT DEFAULT 'Yes'
      );
    `);
    await c.execute(`CREATE TABLE IF NOT EXISTS swipes(id INTEGER PRIMARY KEY AUTOINCREMENT, from_id INT, to_id INT, type TEXT, day TEXT, UNIQUE(from_id, to_id));`);
    await c.execute(`CREATE TABLE IF NOT EXISTS matches(id INTEGER PRIMARY KEY AUTOINCREMENT, a INT, b INT, status TEXT DEFAULT 'unlocked', question TEXT DEFAULT '', expected_answer TEXT DEFAULT '', boy_answer TEXT DEFAULT '', target_answerer_id INT DEFAULT 0, unlocked_by_paid INT DEFAULT 0, UNIQUE(a, b));`);
    await c.execute(`CREATE TABLE IF NOT EXISTS messages(id INTEGER PRIMARY KEY AUTOINCREMENT, from_id INT, to_id INT, text TEXT, t INT);`);
    await c.execute(`CREATE TABLE IF NOT EXISTS reports(id INTEGER PRIMARY KEY AUTOINCREMENT, by_id INT, against_id INT, reason TEXT, t INT);`);
    await c.execute(`CREATE INDEX IF NOT EXISTS i_sw ON swipes(from_id, to_id);`);
    await c.execute(`CREATE INDEX IF NOT EXISTS i_msg ON messages(from_id, to_id);`);
    await c.execute(`CREATE INDEX IF NOT EXISTS i_col ON users(college, city);`);

    // Safe column migrations for existing databases
    try { await c.execute("ALTER TABLE users ADD COLUMN custom_question TEXT DEFAULT ''"); } catch(e){}
    try { await c.execute("ALTER TABLE users ADD COLUMN expected_answer TEXT DEFAULT 'Yes'"); } catch(e){}
    try { await c.execute("ALTER TABLE matches ADD COLUMN status TEXT DEFAULT 'unlocked'"); } catch(e){}
    try { await c.execute("ALTER TABLE matches ADD COLUMN question TEXT DEFAULT ''"); } catch(e){}
    try { await c.execute("ALTER TABLE matches ADD COLUMN expected_answer TEXT DEFAULT ''"); } catch(e){}
    try { await c.execute("ALTER TABLE matches ADD COLUMN boy_answer TEXT DEFAULT ''"); } catch(e){}
    try { await c.execute("ALTER TABLE matches ADD COLUMN target_answerer_id INT DEFAULT 0"); } catch(e){}
    try { await c.execute("ALTER TABLE matches ADD COLUMN unlocked_by_paid INT DEFAULT 0"); } catch(e){}
  },

  async get(sql, args = []) {
    const res = await getClient().execute({ sql, args });
    return res.rows[0] || null;
  },

  async all(sql, args = []) {
    const res = await getClient().execute({ sql, args });
    return res.rows;
  },

  async run(sql, args = []) {
    const res = await getClient().execute({ sql, args });
    return {
      changes: res.rowsAffected,
      lastInsertRowid: Number(res.lastInsertRowid)
    };
  }
};

module.exports = db;
