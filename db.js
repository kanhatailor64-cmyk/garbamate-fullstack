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
        demo INT DEFAULT 0,
        likes_back INT DEFAULT 0,
        banned INT DEFAULT 0,
        undo_day TEXT
      );
    `);
    await c.execute(`CREATE TABLE IF NOT EXISTS swipes(id INTEGER PRIMARY KEY AUTOINCREMENT, from_id INT, to_id INT, type TEXT, day TEXT, UNIQUE(from_id, to_id));`);
    await c.execute(`CREATE TABLE IF NOT EXISTS matches(id INTEGER PRIMARY KEY AUTOINCREMENT, a INT, b INT, UNIQUE(a, b));`);
    await c.execute(`CREATE TABLE IF NOT EXISTS messages(id INTEGER PRIMARY KEY AUTOINCREMENT, from_id INT, to_id INT, text TEXT, t INT);`);
    await c.execute(`CREATE TABLE IF NOT EXISTS reports(id INTEGER PRIMARY KEY AUTOINCREMENT, by_id INT, against_id INT, reason TEXT, t INT);`);
    await c.execute(`CREATE INDEX IF NOT EXISTS i_sw ON swipes(from_id, to_id);`);
    await c.execute(`CREATE INDEX IF NOT EXISTS i_msg ON messages(from_id, to_id);`);
    await c.execute(`CREATE INDEX IF NOT EXISTS i_col ON users(college, city);`);

    const demoCheck = await c.execute('SELECT 1 FROM users WHERE demo=1 LIMIT 1');
    if (demoCheck.rows.length === 0) {
      const demos = [
        ['Riya', 20, 'Female', 'Nirma University', 'Ahmedabad', 'Gujarat', 'Pro', 'Traditional Garba', 'Garba is my cardio. Dodhiyu queen.', '💃', 340],
        ['Kabir', 21, 'Male', 'MS University', 'Vadodara', 'Gujarat', 'Intermediate', 'Dandiya Raas', 'Dandiya sticks ready, partner needed!', '🕺', 30],
        ['Meera', 19, 'Female', 'Gujarat University', 'Ahmedabad', 'Gujarat', 'Beginner', 'Modern/Bollywood', 'First Navratri outside home, teach me!', '🪔', 280],
        ['Aarav', 22, 'Male', 'Pune University', 'Pune', 'Maharashtra', 'Pro', 'Hudo', 'Hudo and chai lover.', '🥁', 200],
        ['Ishita', 20, 'Female', 'SVNIT', 'Surat', 'Gujarat', 'Intermediate', 'Traditional Garba', 'Chaniya choli shopping buddy too.', '🌸', 320],
        ['Dev', 21, 'Male', 'LNMIIT', 'Jaipur', 'Rajasthan', 'Beginner', 'Dandiya Raas', 'Two left feet, big heart.', '🎶', 120],
        ['Naina', 19, 'Female', 'Mumbai University', 'Mumbai', 'Maharashtra', 'Intermediate', 'Modern/Bollywood', 'Bollywood garba nights!', '✨', 10],
        ['Yash', 23, 'Male', 'Nirma University', 'Ahmedabad', 'Gujarat', 'Pro', 'Traditional Garba', 'Garba trainer, 3 years running.', '🔥', 160],
        ['Tanvi', 20, 'Female', 'DAVV', 'Indore', 'Madhya Pradesh', 'Beginner', 'Dandiya Raas', 'Looking for a friendly Dandiya partner.', '🌼', 300],
        ['Rohan', 22, 'Male', 'Delhi University', 'Delhi', 'Delhi', 'Intermediate', 'Dodhiyu', 'Delhi Navratri pandal explorer.', '🎉', 240]
      ];
      for (let i = 0; i < demos.length; i++) {
        const d = demos[i];
        await c.execute({
          sql: 'INSERT INTO users(email,pw,name,age,gender,college,city,state,skill,style,bio,emoji,hue,demo,likes_back) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,1,?)',
          args: [`demo${i + 1}@garbamate.local`, 'x', ...d, i % 4 !== 3 ? 1 : 0]
        });
      }
    }
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
