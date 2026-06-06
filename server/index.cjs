const express = require('express');
const cors = require('cors');
const path = require('path');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const dgram = require('dgram');
const os = require('os');


const JWT_SECRET = process.env.JWT_SECRET || 'neofit-desktop-secret-key-2026';

// Determine database path: in production (packaged), store in user data dir
// In development, store in the project root
let dbPath;
try {
  const { app } = require('electron');
  if (app && app.isPackaged) {
    dbPath = path.join(app.getPath('userData'), 'neofit.db');
  } else {
    dbPath = path.join(__dirname, '..', 'neofit.db');
  }
} catch {
  // Not running inside Electron (dev mode or separate server run) - use project root
  dbPath = path.join(__dirname, '..', 'neofit.db');
}

const db = new Database(dbPath);

// Enable WAL mode for better performance
db.pragma('journal_mode = WAL');

// ─── Helper: Calculate member status ────────────────────────
function calculateStatus(member) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const joinedDate = member.joined_date ? new Date(member.joined_date) : null;
  const expiryDate = member.expiry_date ? new Date(member.expiry_date) : null;
  
  if (joinedDate) joinedDate.setHours(0, 0, 0, 0);
  if (expiryDate) expiryDate.setHours(0, 0, 0, 0);
  
  // If joined date is in the future
  if (joinedDate && joinedDate > today) return 'Pending';
  
  // If expired
  if (expiryDate && expiryDate < today) return 'Expired';
  
  // If expiring within 7 days
  if (expiryDate) {
    const daysLeft = Math.ceil((expiryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    if (daysLeft <= 7 && daysLeft >= 0) return 'Expiring Soon';
  }
  
  return 'Active';
}

// ─── Database Setup ─────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'staff',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS members (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    member_id TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    contact TEXT NOT NULL,
    plan TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'Active',
    joined_date DATE,
    expiry_date DATE,
    address TEXT DEFAULT '',
    membership_expiry DATE,
    last_sms_sent DATE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS check_in_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    member_id TEXT NOT NULL,
    member_name TEXT NOT NULL,
    plan TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'Active',
    checked_in_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    gym_name TEXT NOT NULL DEFAULT 'NeoFit Fitness Gym',
    contact TEXT NOT NULL DEFAULT '',
    address TEXT NOT NULL DEFAULT '',
    announcement TEXT NOT NULL DEFAULT '',
    sms_gateway_url TEXT NOT NULL DEFAULT '',
    last_notification_run TEXT
  );

  CREATE TABLE IF NOT EXISTS sms_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    member_id TEXT NOT NULL,
    member_name TEXT NOT NULL,
    contact TEXT NOT NULL,
    message TEXT NOT NULL,
    milestone TEXT,
    status TEXT NOT NULL DEFAULT 'sent',
    error TEXT,
    sent_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// Migrate old checkins table to check_in_logs if it exists
try {
  const oldTableCheck = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='checkins'").get();
  if (oldTableCheck) {
    console.log('Migrating old checkins table to check_in_logs...');
    db.exec(`
      INSERT INTO check_in_logs (id, member_id, member_name, plan, status, checked_in_at)
      SELECT id, member_id, member_name, plan, status, checked_in_at FROM checkins;
      DROP TABLE checkins;
    `);
    console.log('Migration completed successfully.');
  }
} catch (err) {
  console.error('Migration notice (can be ignored if fresh database):', err.message);
}

// Migrate existing DBs: add columns that may not exist yet
try { db.exec('ALTER TABLE members ADD COLUMN last_sms_sent DATE'); } catch {}
try { db.exec('ALTER TABLE settings ADD COLUMN sms_gateway_url TEXT NOT NULL DEFAULT ""'); } catch {}
try { db.exec('ALTER TABLE settings ADD COLUMN last_notification_run TEXT'); } catch {}
try { db.exec('CREATE TABLE IF NOT EXISTS sms_log (id INTEGER PRIMARY KEY AUTOINCREMENT, member_id TEXT NOT NULL, member_name TEXT NOT NULL, contact TEXT NOT NULL, message TEXT NOT NULL, milestone TEXT, status TEXT NOT NULL DEFAULT \'sent\', error TEXT, sent_at DATETIME DEFAULT CURRENT_TIMESTAMP)'); } catch {}

// Seed default admin user if none exists
const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get();
if (userCount.count === 0) {
  const hashedPassword = bcrypt.hashSync('admin123', 10);
  db.prepare('INSERT INTO users (email, password, role) VALUES (?, ?, ?)').run('admin@neofit.com', hashedPassword, 'admin');
  console.log('Default admin created: admin@neofit.com / admin123');
}

// Seed default settings if none exist
const settingsCount = db.prepare('SELECT COUNT(*) as count FROM settings').get();
if (settingsCount.count === 0) {
  db.prepare('INSERT INTO settings (id, gym_name, contact, address, announcement) VALUES (1, ?, ?, ?, ?)').run('NeoFit Fitness Gym', '', '', '');
}

// Seed demo members (one for each of the 24 plans) if SEED_DEMO env var is true
if (process.env.SEED_DEMO === 'true') {
  console.log('Seeding 24 demo members and historical check-in logs...');
  
  // Clear tables to start fresh and avoid unique constraint conflicts
  db.exec('DELETE FROM check_in_logs');
  db.exec('DELETE FROM members');
  
  const demoPlans = [
    { name: 'John Doe', plan: 'Regular Member - Monthly (No Treadmill)', contact: '09171234501', address: '123 Main St, Quezon City' },
    { name: 'Jane Smith', plan: 'Regular Member - Monthly (With Treadmill)', contact: '09171234502', address: '456 Oak Rd, Makati City' },
    { name: 'Michael Johnson', plan: 'Regular Member - Semi-Monthly (No Treadmill)', contact: '09171234503', address: '789 Pine Ave, Pasig City' },
    { name: 'Emily Davis', plan: 'Regular Member - Semi-Monthly (With Treadmill)', contact: '09171234504', address: '101 Maple Blvd, Mandaluyong City' },
    { name: 'David Brown', plan: 'Regular Member - Daily (No Treadmill)', contact: '09171234505', address: '202 Birch Ct, Taguig City' },
    { name: 'Sarah Miller', plan: 'Regular Member - Daily (With Treadmill)', contact: '09171234506', address: '303 Cedar Dr, Parañaque City' },
    { name: 'James Wilson', plan: 'Student/Senior Member - Monthly (No Treadmill)', contact: '09171234507', address: '404 Redwood Ln, Las Piñas City' },
    { name: 'Patricia Moore', plan: 'Student/Senior Member - Monthly (With Treadmill)', contact: '09171234508', address: '505 Willow Way, Muntinlupa City' },
    { name: 'Robert Taylor', plan: 'Student/Senior Member - Semi-Monthly (No Treadmill)', contact: '09171234509', address: '606 Cypress St, Valenzuela City' },
    { name: 'Linda Anderson', plan: 'Student/Senior Member - Semi-Monthly (With Treadmill)', contact: '09171234510', address: '707 Alder Ave, Caloocan City' },
    { name: 'William Thomas', plan: 'Student/Senior Member - Daily (No Treadmill)', contact: '09171234511', address: '808 Spruce St, Malabon City' },
    { name: 'Elizabeth Jackson', plan: 'Student/Senior Member - Daily (With Treadmill)', contact: '09171234512', address: '909 Fir Rd, Navotas City' },
    { name: 'Richard White', plan: 'Regular Non-Member - Monthly (No Treadmill)', contact: '09171234513', address: '111 Ash St, Marikina City' },
    { name: 'Barbara Harris', plan: 'Regular Non-Member - Monthly (With Treadmill)', contact: '09171234514', address: '222 Beech Blvd, San Juan City' },
    { name: 'Joseph Martin', plan: 'Regular Non-Member - Semi-Monthly (No Treadmill)', contact: '09171234515', address: '333 Elm Rd, Pasay City' },
    { name: 'Susan Thompson', plan: 'Regular Non-Member - Semi-Monthly (With Treadmill)', contact: '09171234516', address: '444 Larch Ct, Manila' },
    { name: 'Thomas Garcia', plan: 'Regular Non-Member - Daily (No Treadmill)', contact: '09171234517', address: '555 Linden Dr, Quezon City' },
    { name: 'Jessica Martinez', plan: 'Regular Non-Member - Daily (With Treadmill)', contact: '09171234518', address: '666 Poplar St, Makati City' },
    { name: 'Charles Robinson', plan: 'Student/Senior Non-Member - Monthly (No Treadmill)', contact: '09171234519', address: '777 Sycamore Ave, Pasig City' },
    { name: 'Karen Clark', plan: 'Student/Senior Non-Member - Monthly (With Treadmill)', contact: '09171234520', address: '888 Walnut St, Mandaluyong City' },
    { name: 'Christopher Rodriguez', plan: 'Student/Senior Non-Member - Semi-Monthly (No Treadmill)', contact: '09171234521', address: '999 Chestnut Dr, Taguig City' },
    { name: 'Nancy Lewis', plan: 'Student/Senior Non-Member - Semi-Monthly (With Treadmill)', contact: '09171234522', address: '124 Magnolia St, Parañaque City' },
    { name: 'Daniel Lee', plan: 'Student/Senior Non-Member - Daily (No Treadmill)', contact: '09171234523', address: '135 Palm Rd, Las Piñas City' },
    { name: 'Lisa Walker', plan: 'Student/Senior Non-Member - Daily (With Treadmill)', contact: '09171234524', address: '146 Olive Ct, Muntinlupa City' }
  ];

  const insertStmt = db.prepare(`
    INSERT INTO members (member_id, name, contact, plan, status, joined_date, expiry_date, address, membership_expiry)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const checkInStmt = db.prepare(`
    INSERT INTO check_in_logs (member_id, member_name, plan, status, checked_in_at)
    VALUES (?, ?, ?, ?, ?)
  `);

  demoPlans.forEach((m, index) => {
    const member_id = `M-${String(index + 1).padStart(3, '0')}`;
    
    // Stagger join dates to generate interesting histories
    let joinedDaysAgo = 0;
    if (m.plan.includes('Daily')) {
      joinedDaysAgo = index % 3; // Daily members joined 0 to 2 days ago
    } else if (m.plan.includes('Semi-Monthly')) {
      joinedDaysAgo = (index % 13) + 2; // Semi-monthly members joined 2 to 14 days ago
    } else {
      joinedDaysAgo = (index % 24) + 5; // Monthly members joined 5 to 28 days ago
    }

    const joinedDate = new Date();
    joinedDate.setDate(joinedDate.getDate() - joinedDaysAgo);
    const joined_date_str = joinedDate.toISOString().split('T')[0];

    // Calculate expiry dates
    const expDate = new Date(joinedDate);
    if (m.plan.includes('Daily')) {
      expDate.setDate(expDate.getDate() + 1);
    } else if (m.plan.includes('Semi-Monthly')) {
      expDate.setDate(expDate.getDate() + 15);
    } else if (m.plan.includes('Monthly')) {
      expDate.setMonth(expDate.getMonth() + 1);
    }
    const expiry_date = expDate.toISOString().split('T')[0];

    let membership_expiry = null;
    if (!m.plan.includes('Non-Member')) {
      const md = new Date(joinedDate);
      md.setFullYear(md.getFullYear() + 1);
      membership_expiry = md.toISOString().split('T')[0];
    }

    const status = calculateStatus({ joined_date: joined_date_str, expiry_date });

    insertStmt.run(member_id, m.name, m.contact, m.plan, status, joined_date_str, expiry_date, m.address, membership_expiry);

    // Generate historical check-ins from joinedDate up to the minimum of (today, expiryDate)
    const startDate = new Date(joinedDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const endDate = new Date(expDate);
    if (endDate > today) {
      endDate.setTime(today.getTime());
    }

    const currentLoopDate = new Date(startDate);
    while (currentLoopDate <= endDate) {
      // 70% probability of checking in on any given day
      if (Math.random() < 0.7) {
        // Pick a random workout window: morning (7-10) or evening (16-19)
        const isMorning = Math.random() < 0.5;
        const hour = isMorning 
          ? Math.floor(Math.random() * 4) + 7   // 7, 8, 9, 10
          : Math.floor(Math.random() * 4) + 16; // 16, 17, 18, 19
        const minute = Math.floor(Math.random() * 60);
        const second = Math.floor(Math.random() * 60);

        const checkInLocal = new Date(currentLoopDate);
        checkInLocal.setHours(hour, minute, second, 0);

        // Convert to UTC string for SQLite
        const checked_in_at_utc = checkInLocal.toISOString().replace('T', ' ').substring(0, 19);

        // Calculate member status on the check-in day
        let logStatus = 'Active';
        const daysLeftOnCheckinDay = Math.ceil((expDate.getTime() - checkInLocal.getTime()) / (1000 * 60 * 60 * 24));
        if (daysLeftOnCheckinDay <= 7 && daysLeftOnCheckinDay >= 0) {
          logStatus = 'Expiring Soon';
        } else if (daysLeftOnCheckinDay < 0) {
          logStatus = 'Expired';
        }

        checkInStmt.run(member_id, m.name, m.plan, logStatus, checked_in_at_utc);
      }
      
      // Move to the next day
      currentLoopDate.setDate(currentLoopDate.getDate() + 1);
    }
  });
  console.log('Seeded 24 demo members and historical check-in logs successfully.');
}

// ─── Helper: Generate Member ID ─────────────────────────────
function generateMemberId() {
  const last = db.prepare('SELECT member_id FROM members ORDER BY id DESC LIMIT 1').get();
  if (!last) return 'M-001';
  const num = parseInt(last.member_id.replace('M-', ''), 10) + 1;
  return `M-${String(num).padStart(3, '0')}`;
}

// ─── Helper: Format Local Datetime to 12h AM/PM ───────────────
function formatLocalTime(localDtStr) {
  if (!localDtStr) return '';
  const d = new Date(localDtStr.replace(' ', 'T'));
  if (isNaN(d.getTime())) return '';
  
  let hours = d.getHours();
  const minutes = String(d.getMinutes()).padStart(2, '0');
  const seconds = String(d.getSeconds()).padStart(2, '0');
  const ampm = hours >= 12 ? 'PM' : 'AM';
  
  hours = hours % 12;
  hours = hours ? hours : 12; // the hour '0' should be '12'
  
  return `${hours}:${minutes}:${seconds} ${ampm}`;
}


// ─── SMS / Email-to-SMS ──────────────────────────────────
const CARRIER_MAP = [
  { prefixes: ['0905','0906','0915','0916','0917','0926','0927','0935','0936','0937','0945','0955','0965','0966','0967','0975','0977','0978','0979','0995','0996','0997'], domains: ['globe.com.ph'] },
  { prefixes: ['0907','0908','0909','0910','0912','0918','0919','0920','0921','0928','0929','0930','0938','0939','0940','0946','0947','0948','0949','0950','0951','0961','0963','0968','0969','0970','0971','0972','0973','0974','0980','0981','0982','0989','0990','0998','0999'], domains: ['smart.com.ph', 'tnt.ph', 'mysmart.com.ph'] },
  { prefixes: ['0922','0923','0924','0925','0931','0932','0933','0934','0941','0942','0943','0944','0952','0953','0954','0956','0957','0958','0959','0960','0962','0963'], domains: ['sun.com.ph'] },
  { prefixes: ['0895','0896','0897','0898','0991','0992','0993','0994'], domains: ['dito.ph'] },
];

function detectCarrier(contact) {
  const prefix = contact.slice(0, 4);
  const entry = CARRIER_MAP.find(c => c.prefixes.includes(prefix));
  return entry ? entry.domains : null;
}

function buildSmsAddresses(contact) {
  const domains = detectCarrier(contact);
  if (!domains) return [];
  return domains.map(d => `${contact}@${d}`);
}

async function sendSmsViaGateway(settings, to, message) {
  if (!settings.sms_gateway_url) return false;
  const url = settings.sms_gateway_url.replace(/\/$/, '') + '/send-sms';
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ to, message }),
  });
  if (!res.ok) throw new Error(`Gateway returned HTTP ${res.status}`);
  return true;
}

async function sendExpiryNotifications() {
  const settings = db.prepare('SELECT * FROM settings WHERE id = 1').get();
  if (!settings || !settings.sms_gateway_url) return 0;

  const today = new Date().toLocaleDateString('sv');
  let sent = 0;
  const milestones = [7, 3, 1];

  for (const days of milestones) {
    const members = db.prepare(`
      SELECT * FROM members
      WHERE (expiry_date = date('now', '+?' || ' days')
         OR (membership_expiry IS NOT NULL AND membership_expiry = date('now', '+?' || ' days')))
        AND (last_sms_sent IS NULL OR last_sms_sent != ?)
    `).all(days, days, today);

    const milestone = days + 'd';
    const label = days === 1 ? 'tomorrow' : `in ${days} days`;
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() + days);
    const targetStr = targetDate.toISOString().split('T')[0];

    for (const m of members) {
      const isPlan = m.expiry_date === targetStr;
      const msg = `Hi ${m.name}, your ${isPlan ? 'plan' : 'membership'} expires ${label}. Please renew. - NeoFit Fitness`;
      const logStmt = db.prepare('INSERT INTO sms_log (member_id, member_name, contact, message, milestone, status) VALUES (?, ?, ?, ?, ?, ?)');
      try {
        await sendSmsViaGateway(settings, m.contact, msg);
        db.prepare('UPDATE members SET last_sms_sent = ? WHERE id = ?').run(today, m.id);
        logStmt.run(m.member_id, m.name, m.contact, msg, milestone, 'sent');
        sent++;
      } catch (e) {
        logStmt.run(m.member_id, m.name, m.contact, msg, milestone, 'failed', e.message);
        console.error('SMS failed for', m.name, e.message);
      }
    }
  }

  db.prepare('UPDATE settings SET last_notification_run = ? WHERE id = 1').run(today);
  return sent;
}


// ─── Auth Middleware ─────────────────────────────────────────
function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

// ─── Express App ────────────────────────────────────────────
const app = express();
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || origin.startsWith('http://localhost') || origin === 'file://' || origin.startsWith('app://')) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  }
}));
app.use(express.json());

// ─── Auth Routes ────────────────────────────────────────────
app.post('/api/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password are required.' });
  
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user || !bcrypt.compareSync(password, user.password)) {
    return res.status(401).json({ error: 'Invalid credentials.' });
  }
  
  const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '24h' });
  res.json({ access_token: token, role: user.role });
});

app.post('/api/logout', authMiddleware, (_req, res) => {
  res.json({ message: 'Logged out successfully.' });
});

// ─── User Profile Routes ────────────────────────────────────
app.get('/api/users/me', authMiddleware, (req, res) => {
  try {
    const user = db.prepare('SELECT id, email, role, created_at FROM users WHERE id = ?').get(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found.' });
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch user profile.' });
  }
});

app.put('/api/users/me/password', authMiddleware, (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current password and new password are required.' });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'New password must be at least 6 characters.' });
    }

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
    if (!user || !bcrypt.compareSync(currentPassword, user.password)) {
      return res.status(401).json({ error: 'Current password is incorrect.' });
    }

    const hashed = bcrypt.hashSync(newPassword, 10);
    db.prepare('UPDATE users SET password = ? WHERE id = ?').run(hashed, req.user.id);
    res.json({ message: 'Password updated successfully.' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update password.' });
  }
});

app.put('/api/users/me/email', authMiddleware, (req, res) => {
  try {
    const { newEmail, password } = req.body;
    if (!newEmail || !password) {
      return res.status(400).json({ error: 'New email and password are required.' });
    }

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
    if (!user || !bcrypt.compareSync(password, user.password)) {
      return res.status(401).json({ error: 'Password is incorrect.' });
    }

    const existing = db.prepare('SELECT id FROM users WHERE email = ? AND id != ?').get(newEmail, req.user.id);
    if (existing) {
      return res.status(409).json({ error: 'Email is already in use.' });
    }

    db.prepare('UPDATE users SET email = ? WHERE id = ?').run(newEmail, req.user.id);

    // Issue new token with updated email so user stays logged in
    const token = jwt.sign({ id: user.id, email: newEmail, role: user.role }, JWT_SECRET, { expiresIn: '24h' });
    res.json({ access_token: token, email: newEmail });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update email.' });
  }
});

// ─── Dashboard ──────────────────────────────────────────────
app.get('/api/dashboard', authMiddleware, (_req, res) => {
  try {
    const allMembers = db.prepare('SELECT * FROM members').all();
    for (const m of allMembers) {
      const newStatus = calculateStatus(m);
      if (newStatus !== m.status) {
        db.prepare('UPDATE members SET status = ? WHERE id = ?').run(newStatus, m.id);
      }
    }
    
    const totalMembers = db.prepare('SELECT COUNT(*) as count FROM members').get().count;
    const activeMembers = db.prepare("SELECT COUNT(*) as count FROM members WHERE status = 'Active'").get().count;
    
    const today = new Date().toLocaleDateString('sv');
    const todayCheckIns = db.prepare("SELECT COUNT(*) as count FROM check_in_logs WHERE DATE(checked_in_at, 'localtime') = ?").get(today).count;
    
    const recentCheckInsRaw = db.prepare(`
      SELECT c.id, c.member_name as memberName, 
             DATETIME(c.checked_in_at, 'localtime') as local_dt, c.plan, c.status
      FROM check_in_logs c
      WHERE DATE(c.checked_in_at, 'localtime') = ?
      ORDER BY c.checked_in_at DESC
      LIMIT 10
    `).all(today);
    
    const recentCheckIns = recentCheckInsRaw.map(c => ({
      id: c.id,
      memberName: c.memberName,
      time: formatLocalTime(c.local_dt),
      plan: c.plan,
      status: c.status
    }));

    const expiringMembers = db.prepare(`
    SELECT id, member_id, name, contact, plan, status, expiry_date, membership_expiry 
    FROM members
    WHERE status = 'Expiring Soon'
       OR (membership_expiry IS NOT NULL AND membership_expiry BETWEEN date('now', 'localtime') AND date('now', 'localtime', '+7 days'))
    ORDER BY CASE WHEN status = 'Expiring Soon' THEN expiry_date ELSE membership_expiry END ASC
    `).all();

    const expiredMembers = db.prepare(`
    SELECT id, member_id, name, contact, plan, status, expiry_date, membership_expiry 
    FROM members
    WHERE status = 'Expired'
       OR (membership_expiry IS NOT NULL AND membership_expiry < date('now', 'localtime'))
    ORDER BY CASE WHEN status = 'Expired' THEN expiry_date ELSE membership_expiry END DESC
    LIMIT 50
    `).all();

    const now = new Date();
    const revYear = now.getFullYear();
    const revMonth = now.getMonth() + 1;
    const revData = computeRevenueForDateRange(db, revYear, revMonth);
    let revYearTotal = revData.thisMonthRevenue;
    for (let m = 1; m <= 12; m++) {
      if (m !== revMonth) {
        const md = computeRevenueForDateRange(db, revYear, m);
        revYearTotal += md.thisMonthRevenue;
      }
    }

    res.json({ 
      activeMembers, 
      totalMembers, 
      todayCheckIns, 
      recentCheckIns,
      expiringMembers,
      expiredMembers,
      todayRevenue: revData.todayRevenue,
      thisMonthRevenue: revData.thisMonthRevenue,
      thisYearRevenue: revYearTotal
    });
  } catch (e) {
    console.error('Dashboard error:', e);
    res.status(500).json({ error: e.message });
  }
});

// ─── Members ────────────────────────────────────────────────
app.get('/api/members', authMiddleware, (req, res) => {
  const { search, status } = req.query;
  
  // Update all statuses first
  const allMembers = db.prepare('SELECT * FROM members').all();
  for (const m of allMembers) {
    const newStatus = calculateStatus(m);
    if (newStatus !== m.status) {
      db.prepare('UPDATE members SET status = ? WHERE id = ?').run(newStatus, m.id);
    }
  }
  
  let query = 'SELECT * FROM members WHERE 1=1';
  const params = [];
  
  if (search) {
    query += ' AND (name LIKE ? OR member_id LIKE ? OR contact LIKE ?';
    const s = `%${search}%`;
    params.push(s, s, s);
    
    // Smart ID matching:
    // If search is just a number (e.g., "12" or "3"), pad it to match "M-012" or "M-003"
    const digitMatch = search.trim().match(/^(\d+)$/);
    if (digitMatch) {
      const paddedId = `M-${digitMatch[1].padStart(3, '0')}`;
      query += ' OR member_id = ?';
      params.push(paddedId);
    }
    
    // If search is "M12" or "m12" (no hyphen), convert to "M-012"
    const mMatch = search.trim().match(/^[Mm](\d+)$/);
    if (mMatch) {
      const paddedId = `M-${mMatch[1].padStart(3, '0')}`;
      query += ' OR member_id = ?';
      params.push(paddedId);
    }

    // If search is "M-12" or "m-12" (with hyphen but unpadded), convert to "M-012"
    const hyphenMatch = search.trim().match(/^[Mm]-(\d+)$/);
    if (hyphenMatch) {
      const paddedId = `M-${hyphenMatch[1].padStart(3, '0')}`;
      query += ' OR member_id = ?';
      params.push(paddedId);
    }
    
    query += ')';
  }
  
  if (status && status !== 'All Status') {
    if (status === 'Annual Membership') {
      query += " AND plan NOT LIKE '%Non-Member%'";
    } else {
      query += ' AND status = ?';
      params.push(status);
    }
  }

  if (req.query.plan) {
    const planFilter = req.query.plan;
    if (planFilter.includes('Non-Members')) {
      query += ' AND plan LIKE ?';
      params.push(`%${planFilter.replace(' Non-Members', '')}%`);
      query += ' AND plan LIKE ?';
      params.push('%Non-Member%');
    } else if (planFilter.includes('Members')) {
      query += ' AND plan LIKE ?';
      params.push(`%${planFilter.replace(' Members', '')}%`);
      query += ' AND plan NOT LIKE ?';
      params.push('%Non-Member%');
    } else {
      query += ' AND plan LIKE ?';
      params.push(`%${planFilter}%`);
    }
  }
  
  query += ' ORDER BY id DESC';
  const members = db.prepare(query).all(...params);

  // If year & month provided, compute actual monthly revenue per member
  if (req.query.year && req.query.month) {
    const year = parseInt(req.query.year);
    const month = parseInt(req.query.month);
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
    const endDate = new Date(year, month, 0).toISOString().split('T')[0];
    const daysInMonth = new Date(year, month, 0).getDate();

    // Pre-compute payment schedule for this month
    const allMembers = db.prepare('SELECT * FROM members').all();
    const payMap = {}; // member_id -> total payment revenue this month
    for (const m of allMembers) {
      if (!m.joined_date) continue;
      const { category, period, type } = parsePlan(m.plan);
      const rate = lookupRate(category, type);
      if (!rate) continue;
      const joinedDate = m.joined_date.split('T')[0];
      let totalPay = 0;
      if (joinedDate >= startDate && joinedDate <= endDate) {
        if (period === 'Monthly') totalPay += rate.monthly;
        else if (period === 'Daily') totalPay += rate.daily;
        else if (period === 'Semi-Monthly') totalPay += rate.semi;
        if (!m.plan.includes('Non-Member')) totalPay += 300;
      }
      if (period === 'Semi-Monthly') {
        const joinD = new Date(joinedDate);
        for (let i = 1; i <= 48; i++) {
          const nextPay = new Date(joinD);
          nextPay.setDate(nextPay.getDate() + i * 15);
          const payStr = nextPay.toISOString().split('T')[0];
          if (payStr > endDate) break;
          if (payStr >= startDate) totalPay += rate.semi;
        }
      }
      payMap[m.member_id] = totalPay;
    }

    // Daily check-in revenue for this month
    const checkinRevMap = {};
    const checkins = db.prepare(`
      SELECT c.member_id, COUNT(*) as cnt
      FROM check_in_logs c
      WHERE DATE(c.checked_in_at, 'localtime') BETWEEN ? AND ?
      GROUP BY c.member_id
    `).all(startDate, endDate);
    for (const c of checkins) checkinRevMap[c.member_id] = c.cnt;

    const result = members.map(m => {
      const { category, period, type } = parsePlan(m.plan);
      const rate = lookupRate(category, type);
      let revenue = 0;
      if (period === 'Daily' && rate) {
        const ciCount = checkinRevMap[m.member_id] ?? 0;
        revenue = ciCount * rate.daily + (payMap[m.member_id] ?? 0);
      } else {
        revenue = payMap[m.member_id] ?? 0;
      }
      return { ...m, monthly_revenue: revenue };
    });
    return res.json(result);
  }

  // No year/month — show the raw period rate (not an estimated monthly)
  const result = members.map(m => {
    const parsed = parsePlan(m.plan);
    const rate = lookupRate(parsed.category, parsed.type);
    let amount = 0;
    if (rate) {
      if (parsed.period === 'Monthly') amount = rate.monthly;
      else if (parsed.period === 'Semi-Monthly') amount = rate.semi;
      else if (parsed.period === 'Daily') amount = rate.daily;
    }
    return { ...m, monthly_revenue: amount };
  });
  res.json(result);
});

app.post('/api/members', authMiddleware, (req, res) => {
  const { name, contact, plan, joined_date, expiry_date, address, membership_expiry } = req.body;
  if (!name || !contact || !plan) return res.status(400).json({ error: 'Name, contact, and plan are required.' });
  
  const existingName = db.prepare('SELECT id FROM members WHERE LOWER(name) = LOWER(?)').get(name.trim());
  if (existingName) {
    return res.status(400).json({ error: 'A member with this name already exists.' });
  }
  
  const member_id = generateMemberId();
  const tempMember = { joined_date, expiry_date };
  const status = calculateStatus(tempMember);
  
  db.prepare(`
    INSERT INTO members (member_id, name, contact, plan, status, joined_date, expiry_date, address, membership_expiry)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(member_id, name.trim(), contact, plan, status, joined_date || null, expiry_date || null, address || '', membership_expiry || null);
  
  const member = db.prepare('SELECT * FROM members WHERE member_id = ?').get(member_id);
  res.status(201).json(member);
});

app.put('/api/members/:id', authMiddleware, (req, res) => {
  const { id } = req.params;
  const { name, contact, plan, joined_date, expiry_date, address, membership_expiry } = req.body;
  
  const existing = db.prepare('SELECT * FROM members WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Member not found.' });
  
  if (name && name.trim().toLowerCase() !== existing.name.toLowerCase()) {
    const duplicate = db.prepare('SELECT id FROM members WHERE LOWER(name) = LOWER(?) AND id != ?').get(name.trim(), id);
    if (duplicate) {
      return res.status(400).json({ error: 'A member with this name already exists.' });
    }
  }

  const tempMember = { joined_date: joined_date || existing.joined_date, expiry_date: expiry_date || existing.expiry_date };
  const status = calculateStatus(tempMember);
  
  db.prepare(`
    UPDATE members SET name = ?, contact = ?, plan = ?, status = ?, joined_date = ?, expiry_date = ?, address = ?, membership_expiry = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(
    name ? name.trim() : existing.name,
    contact || existing.contact,
    plan || existing.plan,
    status,
    joined_date || existing.joined_date,
    expiry_date || existing.expiry_date,
    address !== undefined ? address : existing.address,
    membership_expiry || existing.membership_expiry,
    id
  );
  
  const updated = db.prepare('SELECT * FROM members WHERE id = ?').get(id);
  res.json(updated);
});

app.delete('/api/members/:id', authMiddleware, (req, res) => {
  const { id } = req.params;
  const existing = db.prepare('SELECT * FROM members WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Member not found.' });
  
  db.prepare('DELETE FROM members WHERE id = ?').run(id);
  res.status(204).end();
});

app.get('/api/members/:memberId/checkins', authMiddleware, (req, res) => {
  const { memberId } = req.params;
  const member = db.prepare('SELECT 1 FROM members WHERE member_id = ?').get(memberId);
  if (!member) return res.status(404).json({ error: 'Member not found.' });
  
  const checkinsRaw = db.prepare(`
    SELECT id, checked_in_at, DATETIME(checked_in_at, 'localtime') as local_dt, status
    FROM check_in_logs 
    WHERE member_id = ?
    ORDER BY checked_in_at DESC
  `).all(memberId);
  
  const checkins = checkinsRaw.map(c => ({
    id: c.id,
    time: formatLocalTime(c.local_dt),
    date: c.local_dt ? c.local_dt.split(' ')[0] : '',
    status: c.status
  }));
  
  res.json(checkins);
});

// ─── Check-ins ──────────────────────────────────────────────
app.get('/api/checkins', authMiddleware, (req, res) => {
  const queryDate = req.query.date || new Date().toLocaleDateString('sv');
  const checkInsRaw = db.prepare(`
    SELECT c.id, c.member_id as memberId, c.member_name as memberName,
           c.plan, DATETIME(c.checked_in_at, 'localtime') as local_dt, c.status
    FROM check_in_logs c
    WHERE DATE(c.checked_in_at, 'localtime') = ?
    ORDER BY c.checked_in_at DESC
  `).all(queryDate);

  const checkIns = checkInsRaw.map(c => {
    const parsed = parsePlan(c.plan);
    const rate = lookupRate(parsed.category, parsed.type);
    const amount = rate && parsed.period === 'Daily' ? rate.daily : 0;
    return {
      id: c.id,
      memberId: c.memberId,
      memberName: c.memberName,
      time: formatLocalTime(c.local_dt),
      status: c.status,
      amount,
    };
  });

  res.json(checkIns);
});

app.post('/api/checkins', authMiddleware, (req, res) => {
  const { member_id } = req.body;
  if (!member_id) return res.status(400).json({ error: 'Member ID is required.' });
  
  const member = db.prepare('SELECT * FROM members WHERE member_id = ?').get(member_id);
  if (!member) return res.status(404).json({ error: `Member ${member_id} not found.` });
  
  // Check if member has already checked in today (using local time)
  const todayDate = new Date().toLocaleDateString('sv');
  const alreadyCheckedIn = db.prepare(`
    SELECT 1 FROM check_in_logs 
    WHERE member_id = ? AND DATE(checked_in_at, 'localtime') = ?
  `).get(member.member_id, todayDate);
  
  if (alreadyCheckedIn) {
    return res.status(400).json({ error: `Member ${member.name} has already timed in today.` });
  }
  
  // Update status
  const currentStatus = calculateStatus(member);
  if (currentStatus === 'Expired') {
    return res.status(403).json({ error: `Member ${member.name}'s membership has expired.` });
  }

  if (currentStatus !== member.status) {
    db.prepare('UPDATE members SET status = ? WHERE id = ?').run(currentStatus, member.id);
  }
  
  db.prepare(`
    INSERT INTO check_in_logs (member_id, member_name, plan, status) VALUES (?, ?, ?, ?)
  `).run(member.member_id, member.name, member.plan, currentStatus);
  
  res.status(201).json({ memberName: member.name, status: currentStatus });
});

// ─── Payment transactions ─────────────────────────────────
app.get('/api/payments', authMiddleware, (req, res) => {
  const queryDate = req.query.date;
  if (!queryDate) return res.status(400).json({ error: 'date query param is required (YYYY-MM-DD)' });

  const members = db.prepare('SELECT * FROM members').all();
  const payments = [];

  for (const m of members) {
    if (!m.joined_date) continue;
    const { category, period, type } = parsePlan(m.plan);
    const rate = lookupRate(category, type);
    if (!rate) continue;

    const joinedDate = m.joined_date.split('T')[0];
    let amount = 0;

    if (joinedDate === queryDate) {
      if (period === 'Daily') amount += rate.daily;
      else if (period === 'Monthly') amount += rate.monthly;
      else if (period === 'Semi-Monthly') amount += rate.semi;
      // Annual membership fee
      if (!m.plan.includes('Non-Member')) amount += 300;
    } else if (period === 'Semi-Monthly') {
      const joinD = new Date(joinedDate);
      for (let i = 1; i <= 48; i++) {
        const nextPay = new Date(joinD);
        nextPay.setDate(nextPay.getDate() + i * 15);
        const payStr = nextPay.toISOString().split('T')[0];
        if (payStr > queryDate) break;
        if (payStr === queryDate) { amount += rate.semi; break; }
      }
    }

    if (amount > 0) {
      payments.push({
        member_id: m.member_id,
        name: m.name,
        plan: m.plan,
        period,
        amount,
      });
    }
  }

  payments.sort((a, b) => b.amount - a.amount);
  res.json(payments);
});

// ─── Settings ───────────────────────────────────────────────
app.get('/api/settings', authMiddleware, (_req, res) => {
  const settings = db.prepare('SELECT * FROM settings WHERE id = 1').get();
  if (!settings) return res.json({ gymName: 'NeoFit Fitness Gym', address: '', announcement: '', smsGatewayUrl: '' });
  res.json({
    gymName: settings.gym_name,
    address: settings.address,
    announcement: settings.announcement,
    smsGatewayUrl: settings.sms_gateway_url,
  });
});

app.put('/api/settings', authMiddleware, (req, res) => {
  const { gymName, address, announcement, smsGatewayUrl } = req.body;
  db.prepare(`
    UPDATE settings SET gym_name = ?, address = ?, announcement = ?,
      sms_gateway_url = ? WHERE id = 1
  `).run(
    gymName || '', address || '', announcement || '',
    smsGatewayUrl || '',
  );
  res.json({ message: 'Settings saved.' });
});

// ─── SMS Logs ────────────────────────────────────────────
app.get('/api/sms/logs', authMiddleware, (req, res) => {
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 50));
  const offset = (page - 1) * limit;
  const total = db.prepare('SELECT COUNT(*) as count FROM sms_log').get().count;
  const logs = db.prepare(`
    SELECT * FROM sms_log ORDER BY sent_at DESC LIMIT ? OFFSET ?
  `).all(limit, offset);
  res.json({ logs, total, page, limit });
});

// ─── Temporary Testing Routes ────────────────────────────
app.post('/api/sms/test', authMiddleware, async (req, res) => {
  try {
    const { to, message } = req.body;
    if (!to || !message) return res.status(400).json({ error: 'Recipient number and message are required.' });
    const settings = db.prepare('SELECT * FROM settings WHERE id = 1').get();
    if (!settings || !settings.sms_gateway_url) return res.status(400).json({ error: 'SMS Gateway URL is not configured.' });
    const logStmt = db.prepare('INSERT INTO sms_log (member_id, member_name, contact, message, milestone, status) VALUES (?, ?, ?, ?, ?, ?)');
    try {
      await sendSmsViaGateway(settings, to, message);
      logStmt.run('MANUAL', 'Manual Test', to, message, 'test', 'sent');
      res.json({ message: '✅ SMS sent via phone gateway — check your phone.' });
    } catch (e) {
      logStmt.run('MANUAL', 'Manual Test', to, message, 'test', 'failed', e.message);
      res.status(500).json({ error: '❌ Gateway failed: ' + e.message });
    }
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/notify/run', authMiddleware, async (_req, res) => {
  try {
    const count = await sendExpiryNotifications();
    res.json({ message: `Notifications sent to ${count} member(s).` });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Phone-triggered notifications (unprotected, shared secret) ──
app.post('/api/notify/run-from-phone', async (req, res) => {
  const secret = req.query.secret || req.body?.secret;
  const expectedSecret = process.env.PHONE_SECRET || 'neofit-default';
  if (secret !== expectedSecret) {
    return res.status(403).json({ error: 'Invalid secret' });
  }
  try {
    const count = await sendExpiryNotifications();
    res.json({ sent: count });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Announcement ────────────────────────────────────────
app.post('/api/announcement/send', authMiddleware, async (_req, res) => {
  try {
    const settings = db.prepare('SELECT * FROM settings WHERE id = 1').get();
    if (!settings || !settings.sms_gateway_url) return res.status(400).json({ error: 'SMS Gateway URL is not configured. Set it in Settings first.' });
    if (!settings.announcement) return res.status(400).json({ error: 'No announcement to send. Write an announcement first.' });

    const members = db.prepare("SELECT * FROM members WHERE contact != '' AND contact IS NOT NULL").all();
    let sent = 0;
    const logStmt = db.prepare('INSERT INTO sms_log (member_id, member_name, contact, message, milestone, status) VALUES (?, ?, ?, ?, ?, ?)');

    for (const m of members) {
      const msg = `📢 ${settings.announcement} - NeoFit Fitness`;
      try {
        await sendSmsViaGateway(settings, m.contact, msg);
        logStmt.run(m.member_id, m.name, m.contact, msg, 'announcement', 'sent');
        sent++;
      } catch (e) {
        logStmt.run(m.member_id, m.name, m.contact, msg, 'announcement', 'failed', e.message);
      }
    }

    res.json({ message: `Announcement sent to ${sent} of ${members.length} member(s).` });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Revenue ─────────────────────────────────────────────
const { Document: DocxDocument, Packer: DocxPacker, Paragraph: DocxParagraph, Table: DocxTable, TableRow: DocxTableRow, TableCell: DocxTableCell, TextRun: DocxTextRun, WidthType: DocxWidthType, AlignmentType: DocxAlignmentType, BorderStyle: DocxBorderStyle, HeadingLevel: DocxHeadingLevel } = require('docx');

const RATE_TABLE = [
  { category: 'Regular Members', type: 'No Treadmill', monthly: 600, semi: 300, daily: 60 },
  { category: 'Regular Members', type: 'With Treadmill', monthly: 800, semi: 400, daily: 80 },
  { category: 'Student/Senior Members', type: 'No Treadmill', monthly: 500, semi: 250, daily: 50 },
  { category: 'Student/Senior Members', type: 'With Treadmill', monthly: 700, semi: 350, daily: 70 },
  { category: 'Regular Non-Members', type: 'No Treadmill', monthly: 700, semi: 350, daily: 70 },
  { category: 'Regular Non-Members', type: 'With Treadmill', monthly: 900, semi: 450, daily: 90 },
  { category: 'Student/Senior Non-Members', type: 'No Treadmill', monthly: 600, semi: 300, daily: 60 },
  { category: 'Student/Senior Non-Members', type: 'With Treadmill', monthly: 800, semi: 400, daily: 80 },
];

function parsePlan(plan) {
  const isNonMember = plan.includes('Non-Member');
  const isStudentSenior = plan.includes('Student/Senior');
  const category = isStudentSenior
    ? (isNonMember ? 'Student/Senior Non-Members' : 'Student/Senior Members')
    : (isNonMember ? 'Regular Non-Members' : 'Regular Members');
  const period = plan.includes('Daily') ? 'Daily'
    : plan.includes('Semi-Monthly') ? 'Semi-Monthly'
    : plan.includes('Monthly') ? 'Monthly' : '';
  const type = plan.includes('With Treadmill') ? 'With Treadmill'
    : plan.includes('No Treadmill') ? 'No Treadmill' : '';
  return { category, period, type };
}

function lookupRate(category, type) {
  return RATE_TABLE.find(r => r.category === category && r.type === type);
}

function computeRevenueForDateRange(db, year, month) {
  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 0);
  const daysInMonth = endDate.getDate();

  const members = db.prepare('SELECT * FROM members').all();

  const startStr = startDate.toISOString().split('T')[0];
  const endStr = endDate.toISOString().split('T')[0];

  const checkins = db.prepare(`
    SELECT c.*, DATE(c.checked_in_at, 'localtime') as checkin_date
    FROM check_in_logs c
    WHERE DATE(c.checked_in_at, 'localtime') BETWEEN ? AND ?
    ORDER BY c.checked_in_at
  `).all(startStr, endStr);

  const memberMap = {};
  for (const m of members) memberMap[m.member_id] = m;

  const dailyMap = {};
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    dailyMap[dateStr] = { checkinRevenue: 0, paymentRevenue: 0, total: 0, checkinCount: 0, paymentCount: 0 };
  }

  // Track actual revenue per category
  const categoryRevenue = {};

  // Process check-ins (daily plan members only)
  for (const c of checkins) {
    const member = memberMap[c.member_id];
    if (!member) continue;
    const { category, period, type } = parsePlan(member.plan);
    if (period === 'Daily') {
      const rate = lookupRate(category, type);
      if (rate && dailyMap[c.checkin_date]) {
        dailyMap[c.checkin_date].checkinRevenue += rate.daily;
        dailyMap[c.checkin_date].total += rate.daily;
        dailyMap[c.checkin_date].checkinCount++;
        if (!categoryRevenue[category]) categoryRevenue[category] = 0;
        categoryRevenue[category] += rate.daily;
      }
    }
  }

  // Process member payments
  for (const m of members) {
    if (!m.joined_date) continue;
    const { category, period, type } = parsePlan(m.plan);
    const rate = lookupRate(category, type);
    if (!rate) continue;

    const joinedDate = m.joined_date.split('T')[0];

    // Payment on joined_date (plan rate)
    if (dailyMap[joinedDate]) {
      let amount = 0;
      if (period === 'Daily') amount = rate.daily;
      else if (period === 'Monthly') amount = rate.monthly;
      else if (period === 'Semi-Monthly') amount = rate.semi;
      if (amount > 0) {
        dailyMap[joinedDate].paymentRevenue += amount;
        dailyMap[joinedDate].total += amount;
        dailyMap[joinedDate].paymentCount++;
        if (!categoryRevenue[category]) categoryRevenue[category] = 0;
        categoryRevenue[category] += amount;
      }
    }

    // Semi-monthly recurring (every 15 days from join)
    if (period === 'Semi-Monthly') {
      const joinD = new Date(joinedDate);
      for (let i = 1; i <= 48; i++) {
        const nextPay = new Date(joinD);
        nextPay.setDate(nextPay.getDate() + i * 15);
        const payStr = nextPay.toISOString().split('T')[0];
        if (!dailyMap[payStr]) break;
        dailyMap[payStr].paymentRevenue += rate.semi;
        dailyMap[payStr].total += rate.semi;
        dailyMap[payStr].paymentCount++;
        if (!categoryRevenue[category]) categoryRevenue[category] = 0;
        categoryRevenue[category] += rate.semi;
        if (nextPay > endDate) break;
      }
    }

    // Annual membership fee (₱300 for Members)
    if (!m.plan.includes('Non-Member') && dailyMap[joinedDate]) {
      dailyMap[joinedDate].paymentRevenue += 300;
      dailyMap[joinedDate].total += 300;
      dailyMap[joinedDate].paymentCount++;
      if (!categoryRevenue[category]) categoryRevenue[category] = 0;
      categoryRevenue[category] += 300;
    }
  }

  const dailyBreakdown = Object.entries(dailyMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, data]) => ({
      date,
      checkinRevenue: data.checkinRevenue,
      paymentRevenue: data.paymentRevenue,
      total: data.total,
      checkinCount: data.checkinCount,
      paymentCount: data.paymentCount,
    }));

  const todayStr = new Date().toISOString().split('T')[0];
  const currentYear = String(new Date().getFullYear());
  let todayRevenue = 0, thisMonthRevenue = 0, thisYearRevenue = 0;

  for (const day of dailyBreakdown) {
    thisMonthRevenue += day.total;
    if (day.date === todayStr) todayRevenue += day.total;
    if (day.date.startsWith(currentYear)) thisYearRevenue += day.total;
  }

  // Category breakdown from actual revenue
  const categoryBreakdown = Object.entries(categoryRevenue)
    .map(([category, revenue]) => {
      const count = members.filter(m => parsePlan(m.plan).category === category).length;
      return { category, memberCount: count, monthlyRevenue: Math.round(revenue) };
    })
    .sort((a, b) => b.monthlyRevenue - a.monthlyRevenue);

  return { todayRevenue, thisMonthRevenue, thisYearRevenue, dailyBreakdown, categoryBreakdown, month, year };
}

app.get('/api/revenue', authMiddleware, (req, res) => {
  const now = new Date();
  const year = parseInt(req.query.year) || now.getFullYear();
  const month = parseInt(req.query.month) || (now.getMonth() + 1);
  const data = computeRevenueForDateRange(db, year, month);

  let yearTotal = 0;
  for (let m = 1; m <= 12; m++) {
    if (m === month) {
      yearTotal += data.thisMonthRevenue;
    } else {
      const md = computeRevenueForDateRange(db, year, m);
      yearTotal += md.thisMonthRevenue;
    }
  }
  data.thisYearRevenue = yearTotal;

  res.json(data);
});

app.get('/api/revenue/export', authMiddleware, async (req, res) => {
  try {
    const now = new Date();
    const year = parseInt(req.query.year) || now.getFullYear();
    const month = parseInt(req.query.month) || (now.getMonth() + 1);
    const data = computeRevenueForDateRange(db, year, month);

    let yearTotal = 0;
    for (let m = 1; m <= 12; m++) {
      if (m === month) {
        yearTotal += data.thisMonthRevenue;
      } else {
        const md = computeRevenueForDateRange(db, year, m);
        yearTotal += md.thisMonthRevenue;
      }
    }
    data.thisYearRevenue = yearTotal;

    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const monthName = monthNames[month - 1];

    const currency = (n) => `₱${n.toLocaleString()}`;

    // Helper: create a single table cell
    const cell = (text, opts = {}) => {
      const runs = [new DocxTextRun({ text: String(text), bold: opts.bold, size: opts.size || 20 })];
      return new DocxTableCell({
        children: [new DocxParagraph({ children: runs, alignment: opts.alignment || DocxAlignmentType.LEFT })],
        width: opts.width ? { size: opts.width, type: DocxWidthType.DXA } : undefined,
        borders: opts.noBorder ? undefined : {
          top: { style: DocxBorderStyle.SINGLE, size: 1 },
          bottom: { style: DocxBorderStyle.SINGLE, size: 1 },
          left: { style: DocxBorderStyle.SINGLE, size: 1 },
          right: { style: DocxBorderStyle.SINGLE, size: 1 },
        },
        shading: opts.shading ? { fill: opts.shading } : undefined,
      });
    };

    const headerRow = (headers, widths) => {
      return new DocxTableRow({
        children: headers.map((h, i) => cell(h, { bold: true, shading: 'E0E0E0', width: widths?.[i] })),
      });
    };

    const dataRows = data.dailyBreakdown.map(day => {
      return new DocxTableRow({
        children: [
          cell(day.date, { width: 3000 }),
          cell(currency(day.total), { width: 3000, alignment: DocxAlignmentType.RIGHT }),
        ],
      });
    });

    const doc = new DocxDocument({
      sections: [{
        children: [
          new DocxParagraph({
            children: [new DocxTextRun({ text: 'NeoFit Fitness Gym', bold: true, size: 36 })],
            alignment: DocxAlignmentType.CENTER,
          }),
          new DocxParagraph({
            children: [new DocxTextRun({ text: 'Revenue Report', bold: true, size: 28 })],
            alignment: DocxAlignmentType.CENTER,
          }),
          new DocxParagraph({
            children: [new DocxTextRun({ text: `${monthName} ${year}`, size: 24 })],
            alignment: DocxAlignmentType.CENTER,
          }),
          new DocxParagraph({
            children: [new DocxTextRun({ text: `Generated: ${now.toLocaleDateString('en-PH')} ${now.toLocaleTimeString('en-PH')}`, size: 18, italics: true })],
            alignment: DocxAlignmentType.CENTER,
          }),
          new DocxParagraph({ children: [new DocxTextRun({ text: '' })] }),

          // Summary Section
          new DocxParagraph({
            children: [new DocxTextRun({ text: 'Summary', bold: true, size: 26 })],
            heading: DocxHeadingLevel.HEADING_2,
          }),
          new DocxParagraph({ children: [new DocxTextRun({ text: `Today's Revenue: ${currency(data.todayRevenue)}`, size: 22 })] }),
          new DocxParagraph({ children: [new DocxTextRun({ text: `Month-to-Date Revenue: ${currency(data.thisMonthRevenue)}`, size: 22 })] }),
          new DocxParagraph({ children: [new DocxTextRun({ text: `Year-to-Date Revenue: ${currency(data.thisYearRevenue)}`, size: 22 })] }),
          new DocxParagraph({ children: [new DocxTextRun({ text: '' })] }),

          // Daily Breakdown Table
          new DocxParagraph({
            children: [new DocxTextRun({ text: 'Daily Revenue Breakdown', bold: true, size: 26 })],
            heading: DocxHeadingLevel.HEADING_2,
          }),
          new DocxTable({
            rows: [headerRow(['Date', 'Daily'], [3000, 3000]), ...dataRows],
          }),
        ],
      }],
    });

    const buffer = await DocxPacker.toBuffer(doc);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="NeoFit_Revenue_${monthName}_${year}.docx"`);
    res.send(buffer);
  } catch (err) {
    console.error('Revenue export error:', err);
    res.status(500).json({ error: 'Failed to generate revenue report.' });
  }
});

// ─── Daily SMS Scheduler ────────────────────────────────
function startSmsScheduler() {
  const checkAndRun = async () => {
    const settings = db.prepare('SELECT * FROM settings WHERE id = 1').get();
    if (!settings || !settings.sms_gateway_url) return;
    const now = new Date();
    const today = now.toLocaleDateString('sv');
    if (now.getHours() === 8 && settings.last_notification_run !== today) {
      try {
        const count = await sendExpiryNotifications();
        if (count > 0) console.log(`SMS scheduler: sent ${count} notification(s)`);
      } catch (e) {
        console.error('SMS scheduler error:', e.message);
      }
    }
  };
  checkAndRun();
  setInterval(checkAndRun, 60 * 60 * 1000);
}

// ─── UDP Discovery Listener ──────────────────────────────
function startDiscoveryListener() {
  const server = dgram.createSocket('udp4');
  server.on('message', (msg, rinfo) => {
    if (msg.toString().trim() === 'NeoFitDiscover') {
      const localIp = getLocalIpAddress();
      const response = `NeoFitResponse:http://${localIp}:${PORT}`;
      server.send(response, rinfo.port, rinfo.address);
      console.log(`Discovery: responded to ${rinfo.address}:${rinfo.port}`);
    }
  });
  server.on('error', (err) => {
    console.error('Discovery server error:', err.message);
  });
  server.bind(3002, () => {
    console.log('Discovery listener on UDP port 3002');
  });
}

function getLocalIpAddress() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return '127.0.0.1';
}

// ─── Start Server ───────────────────────────────────────────
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`NeoFit API server running on http://localhost:${PORT}`);
  console.log(`Database: ${dbPath}`);
  startSmsScheduler();
  startDiscoveryListener();
});

module.exports = app;
