const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const STATES = ['Gujarat', 'Rajasthan', 'Maharashtra', 'Madhya Pradesh', 'Delhi', 'Haryana', 'Punjab', 'Uttar Pradesh', 'Karnataka', 'Other'];
const SKILLS = ['Beginner', 'Intermediate', 'Pro'];
const STYLES = ['Traditional Garba', 'Dandiya Raas', 'Dodhiyu', 'Hudo', 'Modern/Bollywood'];
const NOFILTER = { state: '', skill: '', style: '', college: '', same: false };

let token = localStorage.getItem('gm_token'), me = null, queue = [], left = 50, signup = false, busy = false;
let chat = null, thread = [], sock = null, filters = { ...NOFILTER }, chatPoll = null;

/* ---------- helpers ---------- */
async function api(path, method = 'GET', body) {
  const r = await fetch('/api' + path, { method, headers: { 'Content-Type': 'application/json', ...(token && { Authorization: 'Bearer ' + token }) }, body: body && JSON.stringify(body) });
  const d = await r.json().catch(() => ({}));
  if (r.status === 401 && token) { localStorage.removeItem('gm_token'); location.reload(); }
  if (!r.ok) throw new Error(d.error || 'Something went wrong.');
  return d;
}
function toast(t) { const e = $('#toast'); e.textContent = t; e.classList.add('show'); setTimeout(() => e.classList.remove('show'), 2400); }
function fill(sel, arr, label) { $(sel).innerHTML = (label ? `<option value="">${label}</option>` : '') + arr.map(a => `<option>${a}</option>`).join(''); }
const bg = u => u.photo ? `url("${u.photo}") center/cover` : `linear-gradient(160deg,hsl(${u.hue},65%,30%),hsl(${(u.hue + 50) % 360},80%,55%))`;
const avatar = (u, cls = 'av') => `<div class="${cls}" style='background:${bg(u)}'>${u.photo ? '' : (u.emoji || '💃')}</div>`;
const sameCol = u => u.college.toLowerCase() === me.college.toLowerCase();

fill('#state', STATES, 'State'); fill('#skill', SKILLS); fill('#style', STYLES);
fill('#fState', STATES, 'Any state'); fill('#fSkill', SKILLS, 'Any skill'); fill('#fStyle', STYLES, 'Any style');

/* ---------- auth ---------- */
function setAuthMode(isSignup) {
  signup = isSignup;
  if ($('#tabLogin')) $('#tabLogin').classList.toggle('active', !signup);
  if ($('#tabSignup')) $('#tabSignup').classList.toggle('active', signup);
  $('#signupFields').classList.toggle('hidden', !signup);
  if ($('#termsCheckboxContainer')) $('#termsCheckboxContainer').classList.toggle('hidden', !signup);
  $('#authBtn').textContent = signup ? 'Create account' : 'Log in';
  $('#toggle').textContent = signup ? 'Already have an account? Log in' : "Don't have an account? Sign up";
  $('#err').textContent = '';
}

if ($('#tabLogin')) $('#tabLogin').onclick = () => setAuthMode(false);
if ($('#tabSignup')) $('#tabSignup').onclick = () => setAuthMode(true);
$('#toggle').onclick = () => setAuthMode(!signup);

const savedEmail = localStorage.getItem('gm_last_email');
if (savedEmail) $('#email').value = savedEmail;

if (sessionStorage.getItem('gm_logged_out')) {
  sessionStorage.removeItem('gm_logged_out');
  setTimeout(() => toast('You have been logged out.'), 300);
}

$('#authForm').onsubmit = async e => {
  e.preventDefault();
  const body = { email: $('#email').value.trim(), password: $('#password').value };
  if (signup) {
    const gender = $('#gender').value;
    if (!gender || !['Female', 'Male', 'Other'].includes(gender)) {
      $('#err').textContent = 'Please select your gender.';
      return;
    }
    const age = +$('#age').value;
    if (!age || age < 18) {
      $('#err').textContent = 'You must be at least 18 years old to use GarbaMate.';
      return;
    }
    const termsChecked = $('#signupTermsCheck') && $('#signupTermsCheck').checked;
    if (!termsChecked) {
      $('#err').textContent = 'You must review and accept the Terms & Legal Disclaimer to sign up.';
      openTermsModal(true);
      return;
    }
    Object.assign(body, {
      name: $('#name').value.trim(),
      age,
      gender,
      college: $('#college').value.trim(),
      city: $('#city').value.trim(),
      state: $('#state').value,
      skill: $('#skill').value,
      style: $('#style').value,
      bio: $('#bio').value.trim()
    });
  }
  try {
    token = (await api(signup ? '/register' : '/login', 'POST', body)).token;
    localStorage.setItem('gm_token', token);
    localStorage.setItem('gm_last_email', body.email);
    $('#err').textContent = '';
    await boot();
  } catch (x) { $('#err').textContent = x.message; }
};
async function boot() {
  const d = await api('/me'); me = d.user; left = d.left;
  $('#auth').classList.add('hidden'); $('#main').classList.remove('hidden');
  if (typeof io !== 'undefined') {
    try {
      sock = io({ auth: { token }, reconnectionAttempts: 3, timeout: 4000 });
      sock.on('msg', m => {
        if (chat && chat.id === m.from_id) {
          if (!thread.some(x => x.id === m.id)) { thread.push(m); drawMsgs(); }
        } else toast('New message 💬');
      });
      sock.on('match', d => showMatch(d, d.matchData));
      sock.on('match_status_change', () => {
        if (!$('#tab-matches').classList.contains('hidden')) renderMatches();
      });
    } catch (e) {
      console.warn('Socket connection inactive, using polling fallback');
    }
  }
  tab('discover'); await load();
}
const logout = () => {
  localStorage.removeItem('gm_token');
  sessionStorage.setItem('gm_logged_out', '1');
  location.reload();
};

/* ---------- deck ---------- */
async function load() {
  const q = new URLSearchParams({ ...filters, same: filters.same ? 1 : 0 });
  try { queue = (await api('/discover?' + q)).users; } catch (x) { toast(x.message); }
  renderDeck();
}
function card(u) {
  const c = document.createElement('div'); c.className = 'card';
  c.innerHTML = `<div class="pic" style='background:${bg(u)}'>${u.photo ? '' : `<span>${u.emoji || '💃'}</span>`}<b class="stamp like">GARBA!</b><b class="stamp nope">NAH</b></div>
  <div class="info"><h2>${esc(u.name)}, ${u.age}</h2>
  <div>🎓 ${esc(u.college)}${sameCol(u) ? ' (Same college)' : ''}</div>
  <div>📍 ${esc(u.city)}, ${esc(u.state)}</div>
  <div>🪩 ${esc(u.skill)} · ${esc(u.style)}</div>
  <div class="bio">${esc(u.bio)}</div></div>`;
  return c;
}
function renderDeck() {
  const deck = $('#deck'), list = queue.slice(0, 3);
  deck.innerHTML = '';
  if (!list.length) deck.innerHTML = '<div class="empty">No more people for now.<br>Try changing filters or check back soon.</div>';
  list.reverse().forEach((u, i) => {
    const depth = list.length - 1 - i, c = card(u);
    if (depth) c.style.transform = `scale(${1 - depth * .05}) translateY(${depth * 12}px)`; else drag(c);
    deck.appendChild(c);
  });
  $('#counter').textContent = `${left} swipes left today`;
}
function drag(c) {
  let sx = 0, dx = 0, on = false;
  const like = c.querySelector('.like'), nope = c.querySelector('.nope');
  c.onpointerdown = e => { if (busy) return; on = true; sx = e.clientX; c.setPointerCapture(e.pointerId); c.style.transition = 'none'; };
  c.onpointermove = e => {
    if (!on) return; dx = e.clientX - sx;
    c.style.transform = `translateX(${dx}px) rotate(${Math.max(-15, Math.min(15, dx / 10))}deg)`;
    like.style.opacity = Math.max(0, dx / 120); nope.style.opacity = Math.max(0, -dx / 120);
  };
  c.onpointerup = () => {
    if (!on) return; on = false; c.style.transition = '';
    if (dx > 120) swipe('like'); else if (dx < -120) swipe('pass');
    else { c.style.transform = ''; like.style.opacity = nope.style.opacity = 0; }
    dx = 0;
  };
}
async function swipe(type) {
  const u = queue[0]; if (!u || busy) return; busy = true;
  const c = $('#deck').lastElementChild, dir = type === 'pass' ? -1 : 1;
  if (c && c.classList.contains('card')) { c.style.transition = ''; c.style.transform = `translateX(${dir * 600}px) rotate(${dir * 25}deg)`; c.style.opacity = 0; }
  queue.shift();
  try {
    const r = await api('/swipe', 'POST', { targetId: u.id, type }); left = r.left;
    if (r.match) setTimeout(() => showMatch(r.user, r.matchData), 250);
  } catch (x) { queue.unshift(u); toast(x.message); }
  setTimeout(async () => { if (queue.length < 3) await load(); else renderDeck(); busy = false; }, 250);
}
async function undo() {
  if (busy) return;
  try { const r = await api('/undo', 'POST'); queue.unshift(r.user); left = r.left; renderDeck(); } catch (x) { toast(x.message); }
}
$('#bLike').onclick = () => swipe('like'); $('#bPass').onclick = () => swipe('pass');
$('#bSuper').onclick = () => swipe('super'); $('#bUndo').onclick = undo;
document.onkeydown = e => {
  if ($('#main').classList.contains('hidden') || $('#tab-discover').classList.contains('hidden') || !$('#chatModal').classList.contains('hidden')) return;
  if (e.key === 'ArrowRight') swipe('like'); if (e.key === 'ArrowLeft') swipe('pass');
};

/* ---------- match ---------- */
function showMatch(u, matchData) {
  const m = $('#matchModal');
  m.querySelector('.pair').innerHTML = avatar(me) + avatar(u);
  m.classList.remove('hidden');
  for (let i = 0; i < 24; i++) {
    const s = document.createElement('span'); s.className = 'conf'; s.textContent = ['🎊', '✨', '🪔', '🌼'][i % 4];
    s.style.left = Math.random() * 100 + '%'; s.style.animationDelay = Math.random() * .8 + 's';
    m.appendChild(s); setTimeout(() => s.remove(), 3500);
  }

  const qSec = $('#mQuestionSection');
  const chatBtn = $('#mChat');

  if (matchData && matchData.requiresMyAnswer) {
    qSec.classList.remove('hidden');
    $('#mQuestionBox').textContent = `"${matchData.question}"`;
    $('#mQuestionStatus').className = 'hidden';
    qSec.querySelector('.qm-btn-row').classList.remove('hidden');
    chatBtn.classList.add('hidden');

    const handleAnswer = async (ans) => {
      try {
        const res = await api('/matches/' + matchData.matchId + '/answer', 'POST', { answer: ans });
        qSec.querySelector('.qm-btn-row').classList.add('hidden');
        const st = $('#mQuestionStatus');
        st.classList.remove('hidden');
        if (res.ok) {
          st.innerHTML = '<span class="qm-status-badge unlocked">🔓 Match Confirmed & Chat Unlocked!</span>';
          chatBtn.classList.remove('hidden');
          u.matchStatus = 'unlocked';
        } else {
          st.innerHTML = '<span class="qm-status-badge locked">🔒 Answer didn\'t match — Chat Locked</span>';
        }
      } catch (e) { toast(e.message); }
    };

    $('#mBtnYes').onclick = () => handleAnswer('Yes');
    $('#mBtnNo').onclick = () => handleAnswer('No');
  } else {
    qSec.classList.add('hidden');
    chatBtn.classList.remove('hidden');
  }

  chatBtn.onclick = () => { m.classList.add('hidden'); openChat(u); };
  $('#mKeep').onclick = () => m.classList.add('hidden');
}

/* ---------- tabs ---------- */
function tab(name) {
  document.querySelectorAll('.tab').forEach(t => t.classList.add('hidden'));
  $('#tab-' + name).classList.remove('hidden');
  document.querySelectorAll('nav button').forEach(b => b.classList.toggle('on', b.dataset.tab === name));
  if (name === 'matches') renderMatches(); if (name === 'profile') renderProfile();
}
document.querySelectorAll('nav button').forEach(b => b.onclick = () => tab(b.dataset.tab));

async function renderMatches() {
  const { users } = await api('/matches');
  let html = '';

  if (me.gender === 'Female') {
    html += `
      <div class="girl-q-card">
        <div class="gq-top">
          <span class="gq-title">🎯 Your Match Question</span>
          <button class="chip" id="btnEditGQ">⚙️ ${me.custom_question ? 'Edit Question' : 'Set Question'}</button>
        </div>
        ${me.custom_question
          ? `<p class="gq-question">"${esc(me.custom_question)}"</p>
             <div class="gq-meta">Required Answer: <span class="gq-ans-badge ${me.expected_answer?.toLowerCase() === 'no' ? 'no' : 'yes'}">${esc(me.expected_answer || 'Yes')}</span></div>`
          : `<p class="gq-placeholder">Set a custom question that boys must answer (Yes/No) before matching with you!</p>`
        }
      </div>
    `;
  }

  html += '<h3 style="margin:6px 0">Your matches</h3>';
  
  if (users.length) {
    html += users.map((u, i) => {
      let badgeHtml = '';
      if (u.matchStatus === 'unlocked') {
        badgeHtml = '<span class="match-badge unlocked">💬 Unlocked</span>';
      } else if (u.matchStatus === 'pending_question') {
        if (u.requiresMyAnswer) {
          badgeHtml = '<span class="match-badge pending-action">❓ Answer Question</span>';
        } else {
          badgeHtml = '<span class="match-badge waiting">⏳ Awaiting Answer</span>';
        }
      } else if (u.matchStatus === 'locked') {
        badgeHtml = '<span class="match-badge locked">🔒 Chat Locked</span>';
      }

      return `
        <div class="item" data-i="${i}">
          ${avatar(u)}
          <div style="flex:1;min-width:0">
            <b>${esc(u.name)}</b>
            <div class="sub">${esc(u.college)} · ${esc(u.city)}</div>
          </div>
          <div class="item-status-col">${badgeHtml}</div>
        </div>
      `;
    }).join('');
  } else {
    html += '<p class="sub" style="margin-top:20px">No matches yet. Swipe right on people you want to dance with.</p>';
  }

  $('#tab-matches').innerHTML = html;

  if ($('#btnEditGQ')) {
    $('#btnEditGQ').onclick = openEditQuestionModal;
  }

  document.querySelectorAll('#tab-matches .item').forEach(el => {
    const u = users[el.dataset.i];
    el.onclick = () => {
      if (u.matchStatus === 'unlocked') {
        openChat(u);
      } else if (u.matchStatus === 'pending_question') {
        if (u.requiresMyAnswer) {
          openQuestionModal(u);
        } else {
          toast(`Waiting for ${u.name} to answer your question.`);
        }
      } else if (u.matchStatus === 'locked') {
        openLockedModal(u);
      }
    };
  });
}

/* Question Modals Logic */
let currentAnsweringMatch = null;

function openQuestionModal(u) {
  currentAnsweringMatch = u;
  $('#qmAvatar').innerHTML = avatar(u);
  $('#qmTitle').textContent = `${u.name}'s Match Question`;
  $('#qmSubtitle').textContent = `Answer her custom question to confirm the match and unlock chat:`;
  $('#qmQuestionBox').textContent = `"${u.matchQuestion || 'Do you want to match?'}"`;

  $('#qmChoiceSection').classList.remove('hidden');
  $('#qmChoiceSection').querySelector('.qm-btn-row').classList.remove('hidden');
  $('#qmResultSection').classList.add('hidden');

  $('#questionModal').classList.remove('hidden');
}

async function submitMatchAnswer(ans) {
  if (!currentAnsweringMatch) return;
  const u = currentAnsweringMatch;
  try {
    const res = await api(`/matches/${u.matchId}/answer`, 'POST', { answer: ans });
    $('#qmChoiceSection').classList.add('hidden');
    $('#qmResultSection').classList.remove('hidden');

    const badge = $('#qmResultBadge');
    const msg = $('#qmResultMsg');
    const proceed = $('#qmProceedBtn');

    if (res.ok) {
      badge.className = 'qm-status-badge unlocked';
      badge.innerHTML = '🔓 Match Confirmed & Chat Unlocked!';
      msg.textContent = '🎉 Your answer matched! You can now start chatting.';
      proceed.textContent = '💬 Open Chat';
      proceed.onclick = () => {
        $('#questionModal').classList.add('hidden');
        u.matchStatus = 'unlocked';
        openChat(u);
      };
    } else {
      badge.className = 'qm-status-badge locked';
      badge.innerHTML = '🔒 Match Not Confirmed — Chat Locked';
      msg.textContent = '❌ Your answer did not match her required answer. Chat is locked.';
      proceed.textContent = 'Back to Matches';
      proceed.onclick = () => {
        $('#questionModal').classList.add('hidden');
        renderMatches();
      };
    }
  } catch (x) {
    toast(x.message);
  }
}

$('#qmBtnYes').onclick = () => submitMatchAnswer('Yes');
$('#qmBtnNo').onclick = () => submitMatchAnswer('No');
$('#qmCloseBtn').onclick = () => {
  $('#questionModal').classList.add('hidden');
  renderMatches();
};

function openLockedModal(u) {
  $('#lcmDesc').textContent = `The match question was not answered correctly. Chat between you and ${u.name} remains locked.`;
  $('#lockedChatModal').classList.remove('hidden');
}
$('#lcmCloseBtn').onclick = () => $('#lockedChatModal').classList.add('hidden');

function openEditQuestionModal() {
  $('#eqText').value = me.custom_question || '';
  const isNo = (me.expected_answer || 'Yes').toLowerCase() === 'no';
  document.querySelectorAll('input[name="eqAnswerRadio"]').forEach(r => {
    r.checked = (r.value === (isNo ? 'No' : 'Yes'));
  });
  $('#editQuestionModal').classList.remove('hidden');
}

$('#eqSaveBtn').onclick = async () => {
  const q = $('#eqText').value.trim();
  const selectedRadio = document.querySelector('input[name="eqAnswerRadio"]:checked');
  const a = selectedRadio ? selectedRadio.value : 'Yes';
  try {
    const res = await api('/me/question', 'PUT', { question: q, expected_answer: a });
    me = res.user;
    $('#editQuestionModal').classList.add('hidden');
    toast('Match question saved! 🎯');
    renderMatches();
  } catch (e) { toast(e.message); }
};

$('#eqRemoveBtn').onclick = async () => {
  try {
    const res = await api('/me/question', 'PUT', { question: '', expected_answer: 'Yes' });
    me = res.user;
    $('#editQuestionModal').classList.add('hidden');
    toast('Match question removed. Open matching enabled.');
    renderMatches();
  } catch (e) { toast(e.message); }
};

$('#eqCancelBtn').onclick = () => $('#editQuestionModal').classList.add('hidden');

function renderProfile() {
  let questionSectionHtml = '';
  if (me.gender === 'Female') {
    questionSectionHtml = `
      <div class="girl-q-card" style="margin:16px 0;text-align:left">
        <div class="gq-top">
          <span class="gq-title">🎯 Custom Match Question</span>
        </div>
        <p class="sub" style="font-size:12px;margin:0 0 8px">Boys must answer this question before matching with you:</p>
        <input id="pqQuestion" placeholder="e.g., Do you know traditional 3-taali Garba?" value="${esc(me.custom_question || '')}" maxlength="200" style="margin-bottom:8px">
        <div style="display:flex;align-items:center;gap:16px;margin-bottom:10px">
          <span style="font-size:13px;font-weight:600;color:var(--ink)">Required Answer:</span>
          <label style="font-size:14px;cursor:pointer"><input type="radio" name="pqRadio" value="Yes" ${me.expected_answer !== 'No' ? 'checked' : ''}> <b>Yes</b></label>
          <label style="font-size:14px;cursor:pointer"><input type="radio" name="pqRadio" value="No" ${me.expected_answer === 'No' ? 'checked' : ''}> <b>No</b></label>
        </div>
        <button class="btn sm" id="btnSavePq">Save Question</button>
        ${me.custom_question ? '<button class="btn ghost sm" id="btnClearPq" style="margin-top:6px">Remove Question</button>' : ''}
      </div>
    `;
  }

  $('#tab-profile').innerHTML = `<div class="pro">${avatar(me)}<h3>${esc(me.name)}, ${me.age}</h3>
  <p>🎓 ${esc(me.college)}</p><p>📍 ${esc(me.city)}, ${esc(me.state)}</p><p>🪩 ${esc(me.skill)} · ${esc(me.style)}</p><p class="sub">${esc(me.bio)}</p>
  ${questionSectionHtml}
  <input type="file" id="photo" accept="image/*" class="hidden">
  <button class="btn" id="photoBtn">Change photo</button>
  <button class="btn ghost" id="logout" style="color:#5B0E2D;border-color:#5B0E2D">Log out</button>
  <button class="btn ghost" id="del" style="color:#D7263D;border-color:#D7263D">Delete account</button>
  <div class="pro-credits">
    <div class="pro-credits-title">🪔 GarbaMate Creators</div>
    <div class="pro-credits-names">Athrva tailor • Varshith reddy • Anuvesha rastogi • Viraj salunkhe (oreo)</div>
  </div>
  </div>`;
  
  if ($('#btnSavePq')) {
    $('#btnSavePq').onclick = async () => {
      const q = $('#pqQuestion').value.trim();
      const a = document.querySelector('input[name="pqRadio"]:checked')?.value || 'Yes';
      try {
        const res = await api('/me/question', 'PUT', { question: q, expected_answer: a });
        me = res.user;
        toast('Match question saved! 🎯');
        renderProfile();
      } catch (x) { toast(x.message); }
    };
  }
  if ($('#btnClearPq')) {
    $('#btnClearPq').onclick = async () => {
      try {
        const res = await api('/me/question', 'PUT', { question: '', expected_answer: 'Yes' });
        me = res.user;
        toast('Question removed');
        renderProfile();
      } catch (x) { toast(x.message); }
    };
  }

  $('#photoBtn').onclick = () => $('#photo').click();
  $('#photo').onchange = e => {
    const f = e.target.files[0]; if (!f) return;
    const img = new Image(); img.onload = async () => {
      const cv = document.createElement('canvas'), r = 500 / Math.max(img.width, img.height, 500);
      cv.width = img.width * r; cv.height = img.height * r; cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
      try { me = (await api('/me', 'PUT', { photo: cv.toDataURL('image/jpeg', .7) })).user; renderProfile(); } catch (x) { toast(x.message); }
    }; img.src = URL.createObjectURL(f);
  };
  $('#logout').onclick = logout;
  $('#del').onclick = async () => { if (confirm('Delete your account permanently?')) { await api('/me', 'DELETE'); logout(); } };
}

/* ---------- chat ---------- */
async function openChat(u) {
  if (u.matchStatus && u.matchStatus !== 'unlocked') {
    if (u.matchStatus === 'locked') return openLockedModal(u);
    if (u.requiresMyAnswer) return openQuestionModal(u);
    return toast(`Waiting for ${u.name} to answer your match question.`);
  }
  chat = u; $('#cName').textContent = u.name; $('#chatModal').classList.remove('hidden');
  thread = []; drawMsgs();
  try { thread = (await api('/messages/' + u.id)).messages || []; } catch (x) { toast(x.message); }
  drawMsgs();
  clearInterval(chatPoll);
  chatPoll = setInterval(async () => {
    if (!chat || chat.id !== u.id) return clearInterval(chatPoll);
    try {
      const d = await api('/messages/' + u.id);
      const msgs = d.messages || [];
      if (msgs.length > thread.length) {
        thread = msgs;
        drawMsgs();
      }
    } catch (e) {}
  }, 3000);
}
function drawMsgs() {
  $('#msgs').innerHTML = (thread.length ? '' : '<p class="sub" style="text-align:center">You matched! Say hello 👋</p>') +
    thread.map(x => `<div class="m ${x.from_id === me.id ? 'me' : ''}">${esc(x.text)}</div>`).join('');
  $('#msgs').scrollTop = 1e9;
}
$('#msgForm').onsubmit = async e => {
  e.preventDefault();
  const text = $('#msgIn').value.trim(); if (!text || !chat) return; $('#msgIn').value = '';
  try {
    const res = await api('/messages', 'POST', { to: chat.id, text });
    if (res.message && !thread.some(x => x.id === res.message.id)) {
      thread.push(res.message);
      drawMsgs();
    }
  } catch (x) { toast(x.message); }
};
const closeChat = () => {
  clearInterval(chatPoll);
  chatPoll = null;
  $('#chatModal').classList.add('hidden');
  chat = null;
  if (!$('#tab-matches').classList.contains('hidden')) renderMatches();
};
$('#cBack').onclick = closeChat;
$('#cUnmatch').onclick = async () => { if (confirm('Unmatch this person?')) { await api('/matches/' + chat.id, 'DELETE'); closeChat(); } };
$('#cReport').onclick = async () => {
  const r = prompt('Report reason: fake / harassment / inappropriate / other'); if (!r) return;
  await api('/report', 'POST', { against: chat.id, reason: r }); toast('Reported. Thank you for keeping GarbaMate safe.'); closeChat();
};

/* ---------- filters ---------- */
$('#filterBtn').onclick = () => {
  $('#fState').value = filters.state; $('#fSkill').value = filters.skill; $('#fStyle').value = filters.style;
  $('#fCollege').value = filters.college; $('#fSame').checked = filters.same; $('#filterModal').classList.remove('hidden');
};
$('#fApply').onclick = () => {
  filters = { state: $('#fState').value, skill: $('#fSkill').value, style: $('#fStyle').value, college: $('#fCollege').value.trim(), same: $('#fSame').checked };
  $('#filterModal').classList.add('hidden'); load();
};
$('#fReset').onclick = () => { filters = { ...NOFILTER }; $('#filterModal').classList.add('hidden'); load(); };

/* ---------- terms & legal disclaimer ---------- */
function openTermsModal(canClose = true) {
  const m = $('#termsModal');
  if (!m) return;
  m.classList.remove('hidden');
  const closeBtn = $('#termsModalCloseBtn');
  if (closeBtn) closeBtn.classList.toggle('hidden', !canClose);

  const accepted = localStorage.getItem('gm_terms_accepted') === '1';
  const chk = $('#termsCheck');
  const btn = $('#termsAcceptBtn');
  if (chk) chk.checked = accepted;
  if (btn) {
    btn.disabled = !accepted;
    btn.style.opacity = accepted ? '1' : '0.5';
    btn.style.cursor = accepted ? 'pointer' : 'not-allowed';
  }
}

function initTerms() {
  const chk = $('#termsCheck');
  const btn = $('#termsAcceptBtn');
  const closeBtn = $('#termsModalCloseBtn');
  const authTermsBtn = $('#authTermsBtn');
  const viewTermsLink = $('#viewTermsLink');
  const signupTermsCheck = $('#signupTermsCheck');

  if (chk && btn) {
    chk.onchange = () => {
      btn.disabled = !chk.checked;
      btn.style.opacity = chk.checked ? '1' : '0.5';
      btn.style.cursor = chk.checked ? 'pointer' : 'not-allowed';
    };
    btn.onclick = () => {
      localStorage.setItem('gm_terms_accepted', '1');
      if (signupTermsCheck) signupTermsCheck.checked = true;
      $('#termsModal').classList.add('hidden');
      toast('Terms & Legal Disclaimer accepted.');
    };
  }

  if (closeBtn) {
    closeBtn.onclick = () => {
      if (localStorage.getItem('gm_terms_accepted') === '1') {
        $('#termsModal').classList.add('hidden');
      } else {
        toast('You must accept the terms to proceed.');
      }
    };
  }

  if (authTermsBtn) {
    authTermsBtn.onclick = (e) => {
      e.preventDefault();
      openTermsModal(true);
    };
  }

  if (viewTermsLink) {
    viewTermsLink.onclick = (e) => {
      e.preventDefault();
      openTermsModal(true);
    };
  }

  // Mandatory modal popup on page load if terms have not yet been accepted
  if (localStorage.getItem('gm_terms_accepted') !== '1') {
    openTermsModal(false);
  }
}

/* ---------- boot ---------- */
initTerms();
if (token) boot().catch(() => { localStorage.removeItem('gm_token'); });

