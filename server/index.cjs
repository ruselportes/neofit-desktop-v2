require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const supabase = require('./supabase.cjs');

const JWT_SECRET = process.env.JWT_SECRET || 'neofit-desktop-secret-key-2026';

function calculateStatus(member) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const joinedDate = member.joined_date ? new Date(member.joined_date) : null;
  const expiryDate = member.expiry_date ? new Date(member.expiry_date) : null;

  if (joinedDate) joinedDate.setHours(0, 0, 0, 0);
  if (expiryDate) expiryDate.setHours(0, 0, 0, 0);

  if (joinedDate && joinedDate > today) return 'Pending';
  if (expiryDate && expiryDate < today) return 'Expired';
  if (expiryDate) {
    const daysLeft = Math.ceil((expiryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    if (daysLeft <= 7 && daysLeft >= 0) return 'Expiring Soon';
  }
  return 'Active';
}

function getLocalDateRange(dateStr) {
  if (!dateStr) {
    const now = new Date();
    dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  }
  const start = new Date(`${dateStr}T00:00:00`);
  const end = new Date(`${dateStr}T23:59:59.999`);
  return { startISO: start.toISOString(), endISO: end.toISOString() };
}

function formatLocalTime(isoStr) {
  if (!isoStr) return '';
  const d = new Date(isoStr);
  if (isNaN(d.getTime())) return '';

  let hours = d.getHours();
  const minutes = String(d.getMinutes()).padStart(2, '0');
  const seconds = String(d.getSeconds()).padStart(2, '0');
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  hours = hours ? hours : 12;
  return `${hours}:${minutes}:${seconds} ${ampm}`;
}

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

async function generateMemberId() {
  const { data } = await supabase
    .from('members')
    .select('member_id')
    .order('id', { ascending: false })
    .limit(1);
  if (!data || data.length === 0) return 'M-001';
  const num = parseInt(data[0].member_id.replace('M-', ''), 10) + 1;
  return `M-${String(num).padStart(3, '0')}`;
}

async function updateAllMemberStatuses() {
  const { data: allMembers } = await supabase.from('members').select('*');
  if (!allMembers) return;
  for (const m of allMembers) {
    const newStatus = calculateStatus(m);
    if (newStatus !== m.status) {
      await supabase.from('members').update({ status: newStatus }).eq('id', m.id);
    }
  }
}

async function computeRevenueForDateRange(year, month) {
  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 0);
  const daysInMonth = endDate.getDate();

  const { data: members } = await supabase.from('members').select('*');

  const startStr = startDate.toISOString().split('T')[0];
  const endStr = endDate.toISOString().split('T')[0];

  const { startISO, endISO } = {
    startISO: new Date(`${startStr}T00:00:00`).toISOString(),
    endISO: new Date(`${endStr}T23:59:59.999`).toISOString(),
  };

  const { data: checkins } = await supabase
    .from('check_in_logs')
    .select('*')
    .gte('checked_in_at', startISO)
    .lte('checked_in_at', endISO)
    .order('checked_in_at', { ascending: true });

  const memberMap = {};
  if (members) for (const m of members) memberMap[m.member_id] = m;

  const dailyMap = {};
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    dailyMap[dateStr] = { checkinRevenue: 0, paymentRevenue: 0, total: 0, checkinCount: 0, paymentCount: 0 };
  }

  const categoryRevenue = {};

  if (checkins) {
    for (const c of checkins) {
      const member = memberMap[c.member_id];
      if (!member) continue;
      const { category, period, type } = parsePlan(member.plan);
      if (period === 'Daily') {
        const rate = lookupRate(category, type);
        const d = new Date(c.checked_in_at);
        const localDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        if (rate && dailyMap[localDate]) {
          dailyMap[localDate].checkinRevenue += rate.daily;
          dailyMap[localDate].total += rate.daily;
          dailyMap[localDate].checkinCount++;
          if (!categoryRevenue[category]) categoryRevenue[category] = 0;
          categoryRevenue[category] += rate.daily;
        }
      }
    }
  }

  if (members) {
    for (const m of members) {
      if (!m.joined_date) continue;
      const { category, period, type } = parsePlan(m.plan);
      const rate = lookupRate(category, type);
      if (!rate) continue;

      const joinedDate = m.joined_date.split('T')[0];
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

      if (!m.plan.includes('Non-Member') && dailyMap[joinedDate]) {
        dailyMap[joinedDate].paymentRevenue += 300;
        dailyMap[joinedDate].total += 300;
        dailyMap[joinedDate].paymentCount++;
        if (!categoryRevenue[category]) categoryRevenue[category] = 0;
        categoryRevenue[category] += 300;
      }
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

  const todayStr = new Date(Date.now()).toISOString().split('T')[0];
  let todayRevenue = 0, thisMonthRevenue = 0, thisYearRevenue = 0;

  for (const day of dailyBreakdown) {
    thisMonthRevenue += day.total;
    if (day.date === todayStr) todayRevenue += day.total;
    if (day.date.startsWith(String(new Date().getFullYear()))) thisYearRevenue += day.total;
  }

  const categoryBreakdown = Object.entries(categoryRevenue)
    .map(([category, revenue]) => ({
      category,
      memberCount: members ? members.filter(m => parsePlan(m.plan).category === category).length : 0,
      monthlyRevenue: Math.round(revenue),
    }))
    .sort((a, b) => b.monthlyRevenue - a.monthlyRevenue);

  return { todayRevenue, thisMonthRevenue, thisYearRevenue, dailyBreakdown, categoryBreakdown, month, year };
}

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
app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password are required.' });

    const { data: user } = await supabase.from('users').select('*').eq('email', email).maybeSingle();
    if (!user || !bcrypt.compareSync(password, user.password)) {
      return res.status(401).json({ error: 'Invalid credentials.' });
    }

    const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '24h' });
    res.json({ access_token: token, role: user.role });
  } catch (err) {
    res.status(500).json({ error: 'Login failed.' });
  }
});

app.post('/api/logout', authMiddleware, (_req, res) => {
  res.json({ message: 'Logged out successfully.' });
});

// ─── User Profile Routes ────────────────────────────────────
app.get('/api/users/me', authMiddleware, async (req, res) => {
  try {
    const { data: user } = await supabase.from('users').select('id, email, role, created_at').eq('id', req.user.id).maybeSingle();
    if (!user) return res.status(404).json({ error: 'User not found.' });
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch user profile.' });
  }
});

app.put('/api/users/me/password', authMiddleware, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current password and new password are required.' });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'New password must be at least 6 characters.' });
    }

    const { data: user } = await supabase.from('users').select('*').eq('id', req.user.id).maybeSingle();
    if (!user || !bcrypt.compareSync(currentPassword, user.password)) {
      return res.status(401).json({ error: 'Current password is incorrect.' });
    }

    const hashed = bcrypt.hashSync(newPassword, 10);
    const { error } = await supabase.from('users').update({ password: hashed }).eq('id', req.user.id);
    if (error) throw error;
    res.json({ message: 'Password updated successfully.' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update password.' });
  }
});

app.put('/api/users/me/email', authMiddleware, async (req, res) => {
  try {
    const { newEmail, password } = req.body;
    if (!newEmail || !password) {
      return res.status(400).json({ error: 'New email and password are required.' });
    }

    const { data: user } = await supabase.from('users').select('*').eq('id', req.user.id).maybeSingle();
    if (!user || !bcrypt.compareSync(password, user.password)) {
      return res.status(401).json({ error: 'Password is incorrect.' });
    }

    const { data: existing } = await supabase.from('users').select('id').eq('email', newEmail).neq('id', req.user.id).maybeSingle();
    if (existing) {
      return res.status(409).json({ error: 'Email is already in use.' });
    }

    const { error } = await supabase.from('users').update({ email: newEmail }).eq('id', req.user.id);
    if (error) throw error;

    const token = jwt.sign({ id: user.id, email: newEmail, role: user.role }, JWT_SECRET, { expiresIn: '24h' });
    res.json({ access_token: token, email: newEmail });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update email.' });
  }
});

// ─── Dashboard ──────────────────────────────────────────────
app.get('/api/dashboard', authMiddleware, async (_req, res) => {
  try {
    await updateAllMemberStatuses();

    const { count: totalMembers } = await supabase.from('members').select('*', { count: 'exact', head: true });
    const { count: activeMembers } = await supabase.from('members').select('*', { count: 'exact', head: true }).eq('status', 'Active');

    const { startISO, endISO } = getLocalDateRange();
    const { count: todayCheckIns } = await supabase.from('check_in_logs').select('*', { count: 'exact', head: true }).gte('checked_in_at', startISO).lte('checked_in_at', endISO);

    const { data: recentCheckInsRaw } = await supabase
      .from('check_in_logs')
      .select('id, member_name, checked_in_at, plan, status')
      .gte('checked_in_at', startISO)
      .lte('checked_in_at', endISO)
      .order('checked_in_at', { ascending: false })
      .limit(10);

    const recentCheckIns = (recentCheckInsRaw || []).map(c => ({
      id: c.id,
      memberName: c.member_name,
      time: formatLocalTime(c.checked_in_at),
      plan: c.plan,
      status: c.status,
    }));

    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    const sevenDaysLater = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 7);
    const sevenDaysStr = `${sevenDaysLater.getFullYear()}-${String(sevenDaysLater.getMonth() + 1).padStart(2, '0')}-${String(sevenDaysLater.getDate()).padStart(2, '0')}`;

    const { data: expiringMembers } = await supabase
      .from('members')
      .select('id, member_id, name, contact, plan, status, expiry_date, membership_expiry')
      .or(`status.eq.Expiring Soon,and(membership_expiry.gte.${todayStr},membership_expiry.lte.${sevenDaysStr})`)
      .order('expiry_date', { ascending: true, nullsFirst: false });

    const { data: expiredMembers } = await supabase
      .from('members')
      .select('id, member_id, name, contact, plan, status, expiry_date, membership_expiry')
      .or(`status.eq.Expired,and(membership_expiry.lt.${todayStr})`)
      .order('expiry_date', { ascending: false, nullsFirst: false })
      .limit(50);

    const now = new Date();
    const revYear = now.getFullYear();
    const revMonth = now.getMonth() + 1;
    const revData = await computeRevenueForDateRange(revYear, revMonth);
    let revYearTotal = revData.thisMonthRevenue;
    for (let m = 1; m <= 12; m++) {
      if (m !== revMonth) {
        const md = await computeRevenueForDateRange(revYear, m);
        revYearTotal += md.thisMonthRevenue;
      }
    }

    res.json({
      activeMembers: activeMembers || 0,
      totalMembers: totalMembers || 0,
      todayCheckIns: todayCheckIns || 0,
      recentCheckIns,
      expiringMembers: expiringMembers || [],
      expiredMembers: expiredMembers || [],
      todayRevenue: revData.todayRevenue,
      thisMonthRevenue: revData.thisMonthRevenue,
      thisYearRevenue: revYearTotal,
    });
  } catch (e) {
    console.error('Dashboard error:', e);
    res.status(500).json({ error: e.message });
  }
});

// ─── Members ────────────────────────────────────────────────
app.get('/api/members', authMiddleware, async (req, res) => {
  try {
    await updateAllMemberStatuses();

    let query = supabase.from('members').select('*');
    const hasParam = p => req.query[p] !== undefined && req.query[p] !== '';

    if (hasParam('search') || hasParam('status') || hasParam('plan')) {
      const search = req.query.search;
      const status = req.query.status;
      const planFilter = req.query.plan;

      const orConditions = [];

      if (search) {
        const s = search.trim();
        orConditions.push(`name.ilike.%${s}%`);
        orConditions.push(`member_id.ilike.%${s}%`);
        orConditions.push(`contact.ilike.%${s}%`);

        const digitMatch = s.match(/^(\d+)$/);
        if (digitMatch) {
          orConditions.push(`member_id.eq.M-${digitMatch[1].padStart(3, '0')}`);
        }
        const mMatch = s.match(/^[Mm](\d+)$/);
        if (mMatch) {
          orConditions.push(`member_id.eq.M-${mMatch[1].padStart(3, '0')}`);
        }
        const hyphenMatch = s.match(/^[Mm]-(\d+)$/);
        if (hyphenMatch) {
          orConditions.push(`member_id.eq.M-${hyphenMatch[1].padStart(3, '0')}`);
        }
      }

      if (orConditions.length > 0) {
        query = query.or(orConditions.join(','));
      }

      if (status && status !== 'All Status') {
        if (status === 'Annual Membership') {
          query = query.not.ilike('plan', '%Non-Member%');
        } else {
          query = query.eq('status', status);
        }
      }

      if (planFilter) {
        if (planFilter.includes('Non-Members')) {
          const base = planFilter.replace(' Non-Members', '');
          query = query.ilike('plan', `%${base}%`).ilike('plan', '%Non-Member%');
        } else if (planFilter.includes('Members')) {
          const base = planFilter.replace(' Members', '');
          query = query.ilike('plan', `%${base}%`).not.ilike('plan', '%Non-Member%');
        } else {
          query = query.ilike('plan', `%${planFilter}%`);
        }
      }
    }

    query = query.order('id', { ascending: false });
    const { data: members } = await query;

    if (!members) return res.json([]);

    if (hasParam('year') && hasParam('month')) {
      const year = parseInt(req.query.year);
      const month = parseInt(req.query.month);
      const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
      const endDate = new Date(year, month, 0).toISOString().split('T')[0];

      const { data: allM } = await supabase.from('members').select('*');
      const payMap = {};
      if (allM) {
        for (const m of allM) {
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
      }

      const { startISO: ciStart, endISO: ciEnd } = {
        startISO: new Date(`${startDate}T00:00:00`).toISOString(),
        endISO: new Date(`${endDate}T23:59:59.999`).toISOString(),
      };
      const { data: checkins } = await supabase
        .from('check_in_logs')
        .select('member_id')
        .gte('checked_in_at', ciStart)
        .lte('checked_in_at', ciEnd);
      const checkinRevMap = {};
      if (checkins) {
        for (const c of checkins) {
          checkinRevMap[c.member_id] = (checkinRevMap[c.member_id] || 0) + 1;
        }
      }

      const result = members.map(m => {
        const { category, period, type } = parsePlan(m.plan);
        const rate = lookupRate(category, type);
        let revenue = 0;
        if (period === 'Daily' && rate) {
          const ciCount = checkinRevMap[m.member_id] || 0;
          revenue = ciCount * rate.daily + (payMap[m.member_id] || 0);
        } else {
          revenue = payMap[m.member_id] || 0;
        }
        return { ...m, monthly_revenue: revenue };
      });
      return res.json(result);
    }

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
  } catch (err) {
    console.error('Members list error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/members', authMiddleware, async (req, res) => {
  try {
    const { name, contact, plan, joined_date, expiry_date, address, membership_expiry } = req.body;
    if (!name || !contact || !plan) return res.status(400).json({ error: 'Name, contact, and plan are required.' });

    const { data: existingName } = await supabase.from('members').select('id').ilike('name', name.trim()).maybeSingle();
    if (existingName) {
      return res.status(400).json({ error: 'A member with this name already exists.' });
    }

    const member_id = await generateMemberId();
    const tempMember = { joined_date, expiry_date };
    const status = calculateStatus(tempMember);

    const { data: member, error } = await supabase.from('members').insert({
      member_id,
      name: name.trim(),
      contact,
      plan,
      status,
      joined_date: joined_date || null,
      expiry_date: expiry_date || null,
      address: address || '',
      membership_expiry: membership_expiry || null,
    }).select().single();

    if (error) throw error;
    res.status(201).json(member);
  } catch (err) {
    console.error('Create member error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/members/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, contact, plan, joined_date, expiry_date, address, membership_expiry } = req.body;

    const { data: existing } = await supabase.from('members').select('*').eq('id', id).maybeSingle();
    if (!existing) return res.status(404).json({ error: 'Member not found.' });

    if (name && name.trim().toLowerCase() !== existing.name.toLowerCase()) {
      const { data: duplicate } = await supabase.from('members').select('id').ilike('name', name.trim()).neq('id', id).maybeSingle();
      if (duplicate) {
        return res.status(400).json({ error: 'A member with this name already exists.' });
      }
    }

    const tempMember = { joined_date: joined_date || existing.joined_date, expiry_date: expiry_date || existing.expiry_date };
    const status = calculateStatus(tempMember);

    const { data: updated, error } = await supabase.from('members').update({
      name: name ? name.trim() : existing.name,
      contact: contact || existing.contact,
      plan: plan || existing.plan,
      status,
      joined_date: joined_date || existing.joined_date,
      expiry_date: expiry_date || existing.expiry_date,
      address: address !== undefined ? address : existing.address,
      membership_expiry: membership_expiry || existing.membership_expiry,
      updated_at: new Date().toISOString(),
    }).eq('id', id).select().single();

    if (error) throw error;
    res.json(updated);
  } catch (err) {
    console.error('Update member error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/members/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { data: existing, error: fetchErr } = await supabase.from('members').select('*').eq('id', id).maybeSingle();
    if (fetchErr) throw fetchErr;
    if (!existing) return res.status(404).json({ error: 'Member not found.' });

    const { error } = await supabase.from('members').delete().eq('id', id);
    if (error) throw error;
    res.status(204).end();
  } catch (err) {
    console.error('Delete member error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/members/:memberId/checkins', authMiddleware, async (req, res) => {
  try {
    const { memberId } = req.params;
    const { data: member } = await supabase.from('members').select('member_id').eq('member_id', memberId).maybeSingle();
    if (!member) return res.status(404).json({ error: 'Member not found.' });

    const { data: checkinsRaw } = await supabase
      .from('check_in_logs')
      .select('id, checked_in_at, status')
      .eq('member_id', memberId)
      .order('checked_in_at', { ascending: false });

    const checkins = (checkinsRaw || []).map(c => {
      const d = new Date(c.checked_in_at);
      const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      return {
        id: c.id,
        time: formatLocalTime(c.checked_in_at),
        date: dateStr,
        status: c.status,
      };
    });

    res.json(checkins);
  } catch (err) {
    console.error('Member checkins error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── Check-ins ──────────────────────────────────────────────
app.get('/api/checkins', authMiddleware, async (req, res) => {
  try {
    const queryDate = req.query.date || new Date().toISOString().split('T')[0];
    const { startISO, endISO } = getLocalDateRange(queryDate);

    const { data: checkInsRaw } = await supabase
      .from('check_in_logs')
      .select('id, member_id, member_name, plan, checked_in_at, status')
      .gte('checked_in_at', startISO)
      .lte('checked_in_at', endISO)
      .order('checked_in_at', { ascending: false });

    const checkIns = (checkInsRaw || []).map(c => {
      const parsed = parsePlan(c.plan);
      const rate = lookupRate(parsed.category, parsed.type);
      const amount = rate && parsed.period === 'Daily' ? rate.daily : 0;
      return {
        id: c.id,
        memberId: c.member_id,
        memberName: c.member_name,
        time: formatLocalTime(c.checked_in_at),
        status: c.status,
        amount,
      };
    });

    res.json(checkIns);
  } catch (err) {
    console.error('Checkins error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/checkins', authMiddleware, async (req, res) => {
  try {
    const { member_id } = req.body;
    if (!member_id) return res.status(400).json({ error: 'Member ID is required.' });

    const { data: member, error: fetchError } = await supabase.from('members').select('*').eq('member_id', member_id).maybeSingle();
    if (fetchError) throw fetchError;
    if (!member) return res.status(404).json({ error: `Member ${member_id} not found.` });

    const { startISO, endISO } = getLocalDateRange();
    const { data: alreadyCheckedIn } = await supabase
      .from('check_in_logs')
      .select('id')
      .eq('member_id', member.member_id)
      .gte('checked_in_at', startISO)
      .lte('checked_in_at', endISO)
      .maybeSingle();

    if (alreadyCheckedIn) {
      return res.status(400).json({ error: `Member ${member.name} has already timed in today.` });
    }

    const currentStatus = calculateStatus(member);

    if (currentStatus === 'Expired') {
      return res.status(403).json({ error: `Member ${member.name}'s membership has expired.` });
    }

    if (currentStatus !== member.status) {
      await supabase.from('members').update({ status: currentStatus }).eq('id', member.id);
    }

    await supabase.from('check_in_logs').insert({
      member_id: member.member_id,
      member_name: member.name,
      plan: member.plan,
      status: currentStatus,
      checked_in_at: new Date().toISOString(),
    });

    res.status(201).json({ memberName: member.name, status: currentStatus });
  } catch (err) {
    console.error('Checkin error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── Payment transactions ─────────────────────────────────
app.get('/api/payments', authMiddleware, async (req, res) => {
  try {
    const queryDate = req.query.date;
    if (!queryDate) return res.status(400).json({ error: 'date query param is required (YYYY-MM-DD)' });

    const { data: members } = await supabase.from('members').select('*');
    const payments = [];

    if (members) {
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
    }

    payments.sort((a, b) => b.amount - a.amount);
    res.json(payments);
  } catch (err) {
    console.error('Payments error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── Settings ───────────────────────────────────────────────
app.get('/api/settings', authMiddleware, async (_req, res) => {
  try {
    const { data: settings } = await supabase.from('settings').select('*').eq('id', 1).maybeSingle();
    if (!settings) return res.json({ gymName: 'NeoFit Fitness Gym', contact: '', address: '', announcement: '' });
    res.json({
      gymName: settings.gym_name,
      contact: settings.contact,
      address: settings.address,
      announcement: settings.announcement,
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch settings.' });
  }
});

app.put('/api/settings', authMiddleware, async (req, res) => {
  try {
    const { gymName, contact, address, announcement } = req.body;
    const { error } = await supabase.from('settings').update({
      gym_name: gymName || '',
      contact: contact || '',
      address: address || '',
      announcement: announcement || '',
    }).eq('id', 1);
    if (error) throw error;
    res.json({ message: 'Settings saved.' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to save settings.' });
  }
});

// ─── Revenue ─────────────────────────────────────────────
const { Document: DocxDocument, Packer: DocxPacker, Paragraph: DocxParagraph, Table: DocxTable, TableRow: DocxTableRow, TableCell: DocxTableCell, TextRun: DocxTextRun, WidthType: DocxWidthType, AlignmentType: DocxAlignmentType, BorderStyle: DocxBorderStyle, HeadingLevel: DocxHeadingLevel } = require('docx');

app.get('/api/revenue', authMiddleware, async (req, res) => {
  try {
    const now = new Date();
    const year = parseInt(req.query.year) || now.getFullYear();
    const month = parseInt(req.query.month) || (now.getMonth() + 1);
    const data = await computeRevenueForDateRange(year, month);

    let yearTotal = 0;
    for (let m = 1; m <= 12; m++) {
      if (m === month) {
        yearTotal += data.thisMonthRevenue;
      } else {
        const md = await computeRevenueForDateRange(year, m);
        yearTotal += md.thisMonthRevenue;
      }
    }
    data.thisYearRevenue = yearTotal;

    res.json(data);
  } catch (err) {
    console.error('Revenue error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/revenue/export', authMiddleware, async (req, res) => {
  try {
    const now = new Date();
    const year = parseInt(req.query.year) || now.getFullYear();
    const month = parseInt(req.query.month) || (now.getMonth() + 1);
    const data = await computeRevenueForDateRange(year, month);

    let yearTotal = 0;
    for (let m = 1; m <= 12; m++) {
      if (m === month) {
        yearTotal += data.thisMonthRevenue;
      } else {
        const md = await computeRevenueForDateRange(year, m);
        yearTotal += md.thisMonthRevenue;
      }
    }
    data.thisYearRevenue = yearTotal;

    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const monthName = monthNames[month - 1];

    const currency = (n) => `₱${n.toLocaleString()}`;

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

          new DocxParagraph({
            children: [new DocxTextRun({ text: 'Summary', bold: true, size: 26 })],
            heading: DocxHeadingLevel.HEADING_2,
          }),
          new DocxParagraph({ children: [new DocxTextRun({ text: `Today's Revenue: ${currency(data.todayRevenue)}`, size: 22 })] }),
          new DocxParagraph({ children: [new DocxTextRun({ text: `Month-to-Date Revenue: ${currency(data.thisMonthRevenue)}`, size: 22 })] }),
          new DocxParagraph({ children: [new DocxTextRun({ text: `Year-to-Date Revenue: ${currency(data.thisYearRevenue)}`, size: 22 })] }),
          new DocxParagraph({ children: [new DocxTextRun({ text: '' })] }),

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

// ─── Start Server ───────────────────────────────────────────
async function init() {
  const { error: userCheckError } = await supabase.from('users').select('id').limit(1).maybeSingle();
  if (userCheckError) {
    console.error('Supabase tables not found. Please run server/supabase-schema.sql in the Supabase SQL Editor first.');
    console.error('Error:', userCheckError.message);
    process.exit(1);
  }

  const { data: existingUser } = await supabase.from('users').select('id').limit(1).maybeSingle();
  if (!existingUser) {
    const hashedPassword = bcrypt.hashSync('admin123', 10);
    const { error } = await supabase.from('users').insert({ email: 'admin@neofit.com', password: hashedPassword, role: 'admin' });
    if (!error) console.log('Default admin created: admin@neofit.com / admin123');
  }

  const { data: existingSettings } = await supabase.from('settings').select('id').eq('id', 1).maybeSingle();
  if (!existingSettings) {
    await supabase.from('settings').insert({ id: 1, gym_name: 'NeoFit Fitness Gym', contact: '', address: '', announcement: '' });
  }

  const PORT = process.env.PORT || 3001;
  app.listen(PORT, () => {
    console.log(`NeoFit API server running on http://localhost:${PORT}`);
    console.log('Connected to Supabase');
  });
}

init().catch(err => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});

module.exports = app;
