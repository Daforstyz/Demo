const CFG = {
  api: 'https://ptlapi.arthurzy-1234.workers.dev',
  owner: location.hostname.endsWith('.github.io') ? location.hostname.split('.')[0] : 'YOUR_GITHUB_USER',
  repo: location.hostname.endsWith('.github.io') ? (location.pathname.split('/')[1] || location.hostname) : 'YOUR_REPO',
  branch: 'main',
  // TODO: ย้ายการตรวจรหัสแอดมินไปที่ Worker แล้วลบสองบรรทัดนี้ (ต้องแก้ login.html ด้วย)
  adminUser: 'admin',
  adminHash: 'bc78e58d55cde1346e68f8e5fe588dedf62fa457aa646a500a53347faff6ee24',
  mail: { service: '', template: '', key: '' }
};

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => '&#' + c.charCodeAt(0) + ';');

const P = {
  home: 'M3 11l9-8 9 8M5 10v10h14V10',
  clock: 'M12 7v5l3 2M3 12a9 9 0 1018 0 9 9 0 00-18 0',
  user: 'M12 12a4 4 0 100-8 4 4 0 000 8zM4 21c0-4 4-6 8-6s8 2 8 6',
  out: 'M9 21H5V3h4M16 17l5-5-5-5M21 12H9',
  book: 'M4 4h12a4 4 0 014 4v13H8a4 4 0 01-4-4zM4 17a4 4 0 014-4h12',
  shield: 'M12 3l8 3v6c0 5-4 8-8 9-4-1-8-4-8-9V6z',
  check: 'M5 12l5 5 9-10',
  file: 'M6 3h9l4 4v14H6zM14 3v5h5',
  plus: 'M12 5v14M5 12h14',
  trash: 'M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14',
  edit: 'M4 20h4L19 9l-4-4L4 16z'
};
const ic = n => `<svg class="ic" viewBox="0 0 24 24"><path d="${P[n]}"/></svg>`;

const th = d => {
  if (!d) return '-';
  d = new Date(d);
  return String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0') + '/' + (d.getFullYear() + 543);
};

// วันที่ตามเวลาเครื่อง (เดิมใช้ UTC ทำให้ช่วงเช้าตรู่ได้วันเมื่อวาน)
const today = () => {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
};

const sha = async s =>
  [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))]
    .map(x => x.toString(16).padStart(2, '0')).join('');

const me = () => {
  try { return JSON.parse(sessionStorage.me || 'null'); } catch { return null; }
};

function guard(role) {
  const m = me();
  if (!m || m.role !== role) {
    location.href = 'login.html';
    throw new Error('ต้องเข้าสู่ระบบก่อน');
  }
  return m;
}

function logout() {
  sessionStorage.clear();
  location.href = 'login.html';
}

function nav(on) {
  const a = me().role === 'admin';
  const L = a
    ? [['index.html', 'home', 'หน้าแรก'], ['Admin.html', 'shield', 'จัดการระบบ']]
    : [['index.html', 'home', 'หน้าแรก'], ['borrow.html', 'book', 'ยืม-คืน'], ['History.html', 'clock', 'ประวัติ'], ['Register.html', 'user', 'โปรไฟล์']];
  document.body.insertAdjacentHTML('afterbegin',
    `<header class="top"><b>${ic('book')} ระบบยืมคืน</b>${L.map(([h, i, t]) =>
      `<a class="${h == on ? 'on' : ''}" href="${h}">${ic(i)}${t}</a>`).join('')}<button onclick="logout()">${ic('out')}ออก</button></header>`);
}

/* ===== ข้อมูล: ผ่าน Cloudflare Worker เท่านั้น (ตัดโหมด GitHub token ออกแล้ว) ===== */
// แนบ token ที่ Worker ออกให้หลังล็อกอิน (ถ้า Worker ยังไม่ตรวจ ก็ไม่เสียหาย)
const HD = () => {
  const h = { 'Content-Type': 'application/json' };
  if (sessionStorage.tok) h.Authorization = 'Bearer ' + sessionStorage.tok;
  return h;
};

const b64 = s => {
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
};
const unb = s => new TextDecoder().decode(Uint8Array.from(atob(s.replace(/\n/g, '')), c => c.charCodeAt(0)));

async function load(n, def) {
  const r = await fetch(CFG.api + '?n=' + encodeURIComponent(n) + '&t=' + Date.now(), { headers: HD(), cache: 'no-store' });
  if (r.status == 404) return { d: def, sha: null };
  if (r.status == 401 || r.status == 403) {
    sessionStorage.removeItem('tok');
    throw new Error('เซิร์ฟเวอร์ปฏิเสธคำขอ กรุณาเข้าสู่ระบบใหม่');
  }
  if (!r.ok) throw new Error('เซิร์ฟเวอร์ตอบ ' + r.status);
  const j = await r.json();
  return { d: JSON.parse(unb(j.content)), sha: j.sha };
}

async function upd(n, def, fn) {
  for (let i = 0; i < 3; i++) {
    const { d, sha } = await load(n, def);
    const nd = fn(d) || d;
    const r = await fetch(CFG.api + '?n=' + encodeURIComponent(n), {
      method: 'PUT',
      headers: HD(),
      body: JSON.stringify({
        message: 'update ' + n,
        content: b64(JSON.stringify(nd, null, 1)),
        sha: sha || undefined,
        branch: CFG.branch
      })
    });
    if (r.ok) return nd;
    if (r.status == 401 || r.status == 403) throw new Error('ไม่มีสิทธิ์บันทึกข้อมูล กรุณาเข้าสู่ระบบใหม่');
    if (r.status != 409 && r.status != 422) throw new Error('เซิร์ฟเวอร์ตอบ ' + r.status);
  }
  throw new Error('บันทึกไม่สำเร็จ ลองใหม่');
}

async function mail(to, subject, p) {
  if (!CFG.mail.key || !to) return;
  await fetch('https://api.emailjs.com/api/v1.0/email/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      service_id: CFG.mail.service,
      template_id: CFG.mail.template,
      user_id: CFG.mail.key,
      template_params: { to_email: to, subject, message: Object.entries(p).map(([k, v]) => k + ': ' + v).join('\n') }
    })
  }).catch(() => {});
}

const LV = ['ปวช1', 'ปวช2', 'ปวช3', 'ปวส1', 'ปวส2'];

const FORM = (u = {}) => `<label>ชื่อ</label><input id="first" required value="${esc(u.first)}">
<label>นามสกุล</label><input id="last" required value="${esc(u.last)}">
<label>ระดับชั้น</label><select id="level">${LV.map(l => `<option ${u.level == l ? 'selected' : ''}>${l}</option>`).join('')}</select>
<label>กลุ่มเรียน</label><input id="group" required value="${esc(u.group)}">
<label>แผนกวิชา</label><input id="dept" required value="${esc(u.dept)}">
<label>สาขาวิชา</label><input id="major" required value="${esc(u.major)}">
<label>วันเดือนปีเกิด (เช่น 12/08/2551)</label><input id="dob" required pattern="\\d{2}/\\d{2}/\\d{4}" placeholder="12/08/2551" value="${esc(u.dob)}">
<label>อีเมล (สำหรับรับแจ้งเตือน)</label><input id="email" type="email" required value="${esc(u.email)}">`;

const GET = () => Object.fromEntries(
  ['first', 'last', 'level', 'group', 'dept', 'major', 'dob', 'email'].map(k => [k, $('#' + k).value.trim()])
);

document.head.append(Object.assign(document.createElement('script'), { src: 'extras.js' }));
