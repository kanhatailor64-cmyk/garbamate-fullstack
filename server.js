const express = require('express');
const http = require('http');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Server } = require('socket.io');
const db = require('./db');

const SECRET = process.env.JWT_SECRET || 'gm_jwt_prod_key_77b4205d8f31e9c20a';
if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET && !process.env.VERCEL) {
  console.error('FATAL: JWT_SECRET environment variable is missing. Server refusing to start.');
  process.exit(1);
}
const PORT = process.env.PORT || 3000;
const LIMIT = 50;
const STATES = ['Gujarat', 'Rajasthan', 'Maharashtra', 'Madhya Pradesh', 'Delhi', 'Haryana', 'Punjab', 'Uttar Pradesh', 'Karnataka', 'Other'];
const SKILLS = ['Beginner', 'Intermediate', 'Pro'];
const STYLES = ['Traditional Garba', 'Dandiya Raas', 'Dodhiyu', 'Hudo', 'Modern/Bollywood'];

/* ---------- helpers ---------- */
const today = () => new Date().toISOString().slice(0, 10);
const str = (v, n) => String(v ?? '').trim().slice(0, n);
const pub = u => (!u ? null : {
  id: u.id,
  name: u.name,
  age: u.age,
  gender: u.gender,
  college: u.college,
  city: u.city,
  state: u.state,
  skill: u.skill,
  style: u.style,
  bio: u.bio,
  photo: u.photo,
  emoji: u.emoji,
  hue: u.hue,
  custom_question: u.custom_question || ''
});
const sign = u => jwt.sign({ id: u.id }, SECRET, { expiresIn: '30d' });
const used = async id => {
  const row = await db.get('SELECT COUNT(*) as c FROM swipes WHERE from_id=? AND day=?', [id, today()]);
  return row ? Number(row.c) : 0;
};
const matched = async (x, y) => {
  const [a, b] = [x, y].sort((p, q) => p - q);
  const row = await db.get('SELECT 1 FROM matches WHERE a=? AND b=? AND status="unlocked"', [a, b]);
  return !!row;
};
const clean = t => t.replace(/\b(fuck|shit|bitch|asshole|bastard)\b/gi, '***');

const hits = new Map();
const rate = (req, res, next) => {
  const n = Date.now();
  const a = (hits.get(req.ip) || []).filter(t => n - t < 9e5);
  a.push(n);
  hits.set(req.ip, a);
  a.length > 30 ? res.status(429).json({ error: 'Too many attempts. Try again in a few minutes.' }) : next();
};

const auth = async (req, res, next) => {
  try {
    const { id } = jwt.verify((req.headers.authorization || '').replace('Bearer ', ''), SECRET);
    const u = await db.get('SELECT * FROM users WHERE id=?', [id]);
    if (!u || u.banned) throw 0;
    req.user = u;
    next();
  } catch {
    res.status(401).json({ error: 'Please log in again.' });
  }
};

/* ---------- app + sockets ---------- */
const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

let dbInitPromise = null;
const ensureDb = () => {
  if (!dbInitPromise) {
    dbInitPromise = db.init().catch(err => {
      console.error('Database initialization error:', err);
      dbInitPromise = null;
      throw err;
    });
  }
  return dbInitPromise;
};

app.use(express.json({ limit: '1mb' }));
app.use((req, res, next) => {
  res.set({ 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY' });
  next();
});

// Middleware to ensure DB is initialized
app.use(async (req, res, next) => {
  try {
    await ensureDb();
    next();
  } catch (e) {
    res.status(500).json({ error: 'Database service unavailable. Please check your database settings.' });
  }
});

app.use(express.static(path.join(__dirname, 'public')));

io.use((s, next) => {
  try {
    s.uid = jwt.verify(s.handshake.auth.token, SECRET).id;
    next();
  } catch {
    next(new Error('auth'));
  }
});
io.on('connection', s => s.join('u' + s.uid));

/* ---------- auth routes ---------- */
app.post('/api/register', rate, async (req, res) => {
  const b = req.body, email = str(b.email, 120).toLowerCase(), age = +b.age;
  if (!/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ error: 'Enter a valid email.' });
  if (!(age >= 18 && age < 80)) return res.status(400).json({ error: 'You must be 18 or older.' });
  if (String(b.password || '').length < 6) return res.status(400).json({ error: 'Password needs at least 6 characters.' });
  const name = str(b.name, 40), college = str(b.college, 80), city = str(b.city, 60);
  if (!name || !college || !city || !STATES.includes(b.state)) return res.status(400).json({ error: 'Fill name, college, city and state.' });
  if (!['Female', 'Male', 'Other'].includes(b.gender)) return res.status(400).json({ error: 'Please select your gender (Female, Male, or Other).' });
  
  const existing = await db.get('SELECT 1 FROM users WHERE email=?', [email]);
  if (existing) return res.status(409).json({ error: 'This email is already registered.' });

  const r = await db.run(
    'INSERT INTO users(email,pw,name,age,gender,college,city,state,skill,style,bio,hue) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',
    [
      email,
      bcrypt.hashSync(String(b.password), 10),
      name,
      age,
      b.gender,
      college,
      city,
      b.state,
      SKILLS.includes(b.skill) ? b.skill : 'Beginner',
      STYLES.includes(b.style) ? b.style : STYLES[0],
      str(b.bio, 150),
      Math.floor(Math.random() * 360)
    ]
  );
  res.json({ token: sign({ id: r.lastInsertRowid }) });
});

app.post('/api/login', rate, async (req, res) => {
  const email = str(req.body.email, 120).toLowerCase();
  const u = await db.get('SELECT * FROM users WHERE email=?', [email]);
  if (!u) {
    return res.status(401).json({ error: 'No account found with this email. Please click "Sign Up" to create an account.' });
  }
  if (u.banned) {
    return res.status(403).json({ error: 'This account has been suspended.' });
  }
  if (!bcrypt.compareSync(String(req.body.password || ''), u.pw)) {
    return res.status(401).json({ error: 'Wrong password. Please try again.' });
  }
  res.json({ token: sign(u) });
});

/* ---------- profile ---------- */
app.get('/api/me', auth, async (req, res) => {
  const swipedToday = await used(req.user.id);
  res.json({
    user: {
      ...pub(req.user),
      custom_question: req.user.custom_question || '',
      expected_answer: req.user.expected_answer || 'Yes'
    },
    left: LIMIT - swipedToday
  });
});

function validatePhoto(photo) {
  if (typeof photo !== 'string') return null;
  if (photo.length > 700000) return null;
  const match = photo.match(/^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/);
  if (!match) return null;
  if (/script|svg|html|xml|onerror|onload/i.test(photo)) return null;
  return photo;
}

app.put('/api/me', auth, async (req, res) => {
  const b = req.body, u = req.user;
  const photo = b.photo !== undefined ? (validatePhoto(b.photo) || (b.photo === '' ? '' : u.photo)) : u.photo;
  const customQuestion = b.custom_question !== undefined ? str(b.custom_question, 200).trim() : (u.custom_question || '');
  const expectedAnswer = b.expected_answer !== undefined ? (String(b.expected_answer).trim().toLowerCase() === 'no' ? 'No' : 'Yes') : (u.expected_answer || 'Yes');

  await db.run(
    'UPDATE users SET name=?,bio=?,college=?,city=?,state=?,skill=?,style=?,photo=?,custom_question=?,expected_answer=? WHERE id=?',
    [
      str(b.name, 40) || u.name,
      b.bio === undefined ? u.bio : str(b.bio, 150),
      str(b.college, 80) || u.college,
      str(b.city, 60) || u.city,
      STATES.includes(b.state) ? b.state : u.state,
      SKILLS.includes(b.skill) ? b.skill : u.skill,
      STYLES.includes(b.style) ? b.style : u.style,
      photo,
      customQuestion,
      expectedAnswer,
      u.id
    ]
  );
  const updated = await db.get('SELECT * FROM users WHERE id=?', [u.id]);
  res.json({
    user: {
      ...pub(updated),
      custom_question: updated.custom_question || '',
      expected_answer: updated.expected_answer || 'Yes'
    }
  });
});

app.put('/api/me/question', auth, async (req, res) => {
  const me = req.user;
  const question = str(req.body.question || '', 200).trim();
  const rawExpected = String(req.body.expected_answer || 'Yes').trim().toLowerCase();
  const expectedAnswer = rawExpected === 'no' ? 'No' : 'Yes';

  await db.run('UPDATE users SET custom_question=?, expected_answer=? WHERE id=?', [question, expectedAnswer, me.id]);
  const updated = await db.get('SELECT * FROM users WHERE id=?', [me.id]);
  res.json({
    ok: true,
    user: {
      ...pub(updated),
      custom_question: updated.custom_question || '',
      expected_answer: updated.expected_answer || 'Yes'
    }
  });
});

app.delete('/api/me', auth, async (req, res) => {
  const id = req.user.id;
  await db.run('DELETE FROM swipes WHERE from_id=? OR to_id=?', [id, id]);
  await db.run('DELETE FROM matches WHERE a=? OR b=?', [id, id]);
  await db.run('DELETE FROM messages WHERE from_id=? OR to_id=?', [id, id]);
  await db.run('DELETE FROM users WHERE id=?', [id]);
  res.json({ ok: true });
});

/* ---------- discover + swipe ---------- */
app.get('/api/discover', auth, async (req, res) => {
  const q = req.query, me = req.user, w = [], p = [];
  if (STATES.includes(q.state)) { w.push('state=?'); p.push(q.state); }
  if (SKILLS.includes(q.skill)) { w.push('skill=?'); p.push(q.skill); }
  if (STYLES.includes(q.style)) { w.push('style=?'); p.push(q.style); }
  if (q.college) { w.push('college LIKE ?'); p.push('%' + str(q.college, 60).replace(/[%_]/g, '') + '%'); }
  if (q.same === '1') { w.push('LOWER(college)=LOWER(?)'); p.push(me.college); }

  const whereClause = w.length ? 'AND ' + w.join(' AND ') : '';
  const sql = `SELECT * FROM users WHERE id!=? AND banned=0 AND id NOT IN (SELECT to_id FROM swipes WHERE from_id=?) ${whereClause}
    ORDER BY (photo IS NOT NULL AND photo != '' AND photo != 'null') DESC,
             (SELECT COUNT(*) FROM swipes s WHERE s.from_id=users.id AND s.to_id=? AND s.type='super') DESC,
             (LOWER(college)=LOWER(?)) DESC,
             RANDOM() LIMIT 20`;
  const rows = await db.all(sql, [me.id, me.id, ...p, me.id, me.college]);
  res.json({ users: rows.map(pub) });
});

app.post('/api/swipe', auth, async (req, res) => {
  const me = req.user, { targetId, type } = req.body;
  if (!['like', 'pass', 'super'].includes(type)) return res.status(400).json({ error: 'Bad swipe.' });
  const t = await db.get('SELECT * FROM users WHERE id=? AND banned=0', [+targetId]);
  if (!t || t.id === me.id) return res.status(400).json({ error: 'Person not found.' });
  
  const n = await used(me.id);
  if (n >= LIMIT) return res.status(429).json({ error: 'Daily swipe limit reached. Come back tomorrow!' });

  let match = false;
  let matchData = null;
  const swipeRes = await db.run('INSERT OR IGNORE INTO swipes(from_id,to_id,type,day) VALUES(?,?,?,?)', [me.id, t.id, type, today()]);
  if (swipeRes.changes && type !== 'pass') {
    const back = await db.get("SELECT 1 FROM swipes WHERE from_id=? AND to_id=? AND type!='pass'", [t.id, me.id]);
    if (back) {
      const [a, b] = [me.id, t.id].sort((x, y) => x - y);
      
      let status = 'unlocked';
      let question = '';
      let expected_answer = '';
      let target_answerer_id = 0;

      if (t.gender === 'Female' && t.custom_question && t.custom_question.trim()) {
        status = 'pending_question';
        question = t.custom_question.trim();
        expected_answer = t.expected_answer || 'Yes';
        target_answerer_id = me.id;
      } else if (me.gender === 'Female' && me.custom_question && me.custom_question.trim() && t.gender === 'Male') {
        status = 'pending_question';
        question = me.custom_question.trim();
        expected_answer = me.expected_answer || 'Yes';
        target_answerer_id = t.id;
      }

      await db.run(
        'INSERT OR IGNORE INTO matches(a,b,status,question,expected_answer,target_answerer_id) VALUES(?,?,?,?,?,?)',
        [a, b, status, question, expected_answer, target_answerer_id]
      );

      const mRow = await db.get('SELECT * FROM matches WHERE a=? AND b=?', [a, b]);
      match = true;
      matchData = {
        matchId: mRow ? mRow.id : null,
        status: mRow ? mRow.status : status,
        question: mRow ? mRow.question : question,
        requiresMyAnswer: (mRow ? mRow.status === 'pending_question' && mRow.target_answerer_id === me.id : false)
      };
    }
  }

  if (match) {
    try {
      io.to('u' + t.id).emit('match', {
        ...pub(me),
        matchData: {
          matchId: matchData ? matchData.matchId : null,
          status: matchData ? matchData.status : 'unlocked',
          question: matchData ? matchData.question : '',
          requiresMyAnswer: (matchData && matchData.status === 'pending_question' && matchData.target_answerer_id === t.id)
        }
      });
    } catch (e) {}
  }
  res.json({ match, user: match ? pub(t) : null, matchData, left: LIMIT - n - 1 });
});

app.post('/api/undo', auth, async (req, res) => {
  const me = req.user;
  if (me.undo_day === today()) return res.status(429).json({ error: 'Free undo already used today.' });
  const s = await db.get('SELECT * FROM swipes WHERE from_id=? ORDER BY id DESC LIMIT 1', [me.id]);
  if (!s) return res.status(400).json({ error: 'Nothing to undo.' });

  const [a, b] = [me.id, s.to_id].sort((x, y) => x - y);
  const matchRow = await db.get('SELECT * FROM matches WHERE a=? AND b=?', [a, b]);
  if (matchRow && matchRow.status === 'locked') {
    return res.status(400).json({ error: 'Cannot undo a locked match.' });
  }

  await db.run('DELETE FROM swipes WHERE id=?', [s.id]);
  await db.run('DELETE FROM matches WHERE a=? AND b=?', [a, b]);
  await db.run('UPDATE users SET undo_day=? WHERE id=?', [today(), me.id]);

  const target = await db.get('SELECT * FROM users WHERE id=?', [s.to_id]);
  const swipedToday = await used(me.id);
  res.json({ user: pub(target), left: LIMIT - swipedToday });
});

/* ---------- matches + chat ---------- */
const getMatchRecord = async (x, y) => {
  const [a, b] = [x, y].sort((p, q) => p - q);
  return await db.get('SELECT * FROM matches WHERE a=? AND b=?', [a, b]);
};

app.get('/api/matches', auth, async (req, res) => {
  const id = req.user.id;
  const rows = await db.all(
    `SELECT m.id as match_id, m.status as match_status, m.question as match_question,
            m.target_answerer_id, m.boy_answer, m.unlocked_by_paid,
            u.*
     FROM matches m
     JOIN users u ON u.id=(CASE WHEN m.a=? THEN m.b ELSE m.a END)
     WHERE m.a=? OR m.b=?
     ORDER BY m.id DESC`,
    [id, id, id]
  );
  res.json({
    users: rows.map(r => ({
      ...pub(r),
      matchId: r.match_id,
      matchStatus: r.match_status || 'unlocked',
      matchQuestion: r.match_question || '',
      requiresMyAnswer: (r.match_status === 'pending_question' && r.target_answerer_id === id),
      waitingForTheirAnswer: (r.match_status === 'pending_question' && r.target_answerer_id !== id),
      unlockedByPaid: !!r.unlocked_by_paid
    }))
  });
});

app.post('/api/matches/:id/answer', auth, async (req, res) => {
  const me = req.user;
  const matchId = +req.params.id;
  const raw = String(req.body.answer || '').trim().toLowerCase();

  if (!['yes', 'no'].includes(raw)) {
    return res.status(400).json({ error: "Answer must be strictly 'Yes' or 'No'." });
  }
  const answer = raw === 'yes' ? 'Yes' : 'No';

  const m = await db.get('SELECT * FROM matches WHERE id=? AND (a=? OR b=?)', [matchId, me.id, me.id]);
  if (!m) return res.status(404).json({ error: 'Match not found.' });

  if (m.status !== 'pending_question') {
    return res.status(400).json({ error: `This match is already ${m.status}.` });
  }

  if (m.target_answerer_id && m.target_answerer_id !== me.id) {
    return res.status(403).json({ error: 'Only the designated partner can answer this question.' });
  }

  const partnerId = m.a === me.id ? m.b : m.a;
  const isCorrect = answer.toLowerCase() === String(m.expected_answer || 'Yes').trim().toLowerCase();
  const newStatus = isCorrect ? 'unlocked' : 'locked';

  await db.run('UPDATE matches SET status=?, boy_answer=? WHERE id=?', [newStatus, answer, m.id]);

  try {
    io.to('u' + partnerId).emit('match_status_change', {
      matchId: m.id,
      status: newStatus,
      byUserId: me.id
    });
  } catch (e) {}

  res.json({
    ok: isCorrect,
    status: newStatus,
    message: isCorrect
      ? 'Correct answer! Match confirmed and chat unlocked.'
      : 'Answer did not match the required answer. Chat is locked.'
  });
});

app.delete('/api/matches/:id', auth, async (req, res) => {
  const [a, b] = [req.user.id, +req.params.id].sort((x, y) => x - y);
  await db.run('DELETE FROM matches WHERE a=? AND b=?', [a, b]);
  res.json({ ok: true });
});

app.get('/api/messages/:id', auth, async (req, res) => {
  const me = req.user.id, o = +req.params.id;
  const m = await getMatchRecord(me, o);
  if (!m) return res.status(403).json({ error: 'You can only chat with matches.' });
  if (m.status !== 'unlocked') {
    return res.status(403).json({
      error: m.status === 'locked'
        ? 'Chat is locked because the question answer did not match.'
        : 'Chat is locked until the match question is answered.'
    });
  }
  const rows = await db.all(
    'SELECT * FROM messages WHERE (from_id=? AND to_id=?) OR (from_id=? AND to_id=?) ORDER BY id',
    [me, o, o, me]
  );
  res.json({ messages: rows });
});

app.post('/api/messages', auth, async (req, res) => {
  const me = req.user, to = +req.body.to, text = clean(str(req.body.text, 500));
  if (!text) return res.status(400).json({ error: 'Type a message first.' });
  const t = await db.get('SELECT * FROM users WHERE id=?', [to]);
  const matchRec = await getMatchRecord(me.id, to);
  if (!t || !matchRec) return res.status(403).json({ error: 'You can only chat with matches.' });
  if (matchRec.status !== 'unlocked') {
    return res.status(403).json({
      error: matchRec.status === 'locked'
        ? 'Chat is locked because the question answer did not match.'
        : 'Chat is locked until the match question is answered.'
    });
  }

  const now = Date.now();
  const ins = await db.run('INSERT INTO messages(from_id,to_id,text,t) VALUES(?,?,?,?)', [me.id, to, text, now]);
  const m = { id: ins.lastInsertRowid, from_id: me.id, to_id: to, text, t: now };
  try { io.to('u' + to).emit('msg', m); } catch (e) {}
  res.json({ message: m });
});

/* ---------- safety + admin ---------- */
app.post('/api/report', auth, async (req, res) => {
  const against = +req.body.against;
  await db.run('INSERT INTO reports(by_id,against_id,reason,t) VALUES(?,?,?,?)', [req.user.id, against, str(req.body.reason, 100), Date.now()]);
  const [a, b] = [req.user.id, against].sort((x, y) => x - y);
  await db.run('DELETE FROM matches WHERE a=? AND b=?', [a, b]);
  res.json({ ok: true });
});

const allowedAdmins = new Set();
if (process.env.ADMIN_EMAIL) {
  process.env.ADMIN_EMAIL.toLowerCase().split(',').forEach(e => {
    if (e.trim()) allowedAdmins.add(e.trim());
  });
}

const admin = (req, res, next) => {
  const userEmail = (req.user?.email || '').toLowerCase().trim();
  if (userEmail && allowedAdmins.has(userEmail)) {
    return next();
  }
  res.status(403).json({ error: 'Admins only.' });
};

app.get('/api/admin/reports', auth, admin, async (req, res) => {
  const reports = await db.all(
    'SELECT r.*, u.name as against_name FROM reports r LEFT JOIN users u ON u.id=r.against_id ORDER BY r.id DESC LIMIT 100'
  );
  const countRow = await db.get('SELECT COUNT(*) as c FROM users');
  res.json({ reports, users: countRow ? countRow.c : 0 });
});

app.post('/api/admin/ban/:id', auth, admin, async (req, res) => {
  await db.run('UPDATE users SET banned=1 WHERE id=?', [+req.params.id]);
  res.json({ ok: true });
});

/* ---------- start / export ---------- */
if (require.main === module && !process.env.VERCEL) {
  server.listen(PORT, () => console.log(`GarbaMate running on http://localhost:${PORT}`));
}

module.exports = app;
