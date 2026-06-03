const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '..', 'neofit.db');
const db = new Database(dbPath);

db.pragma('journal_mode = WAL');

// Clear existing data
db.exec('DELETE FROM check_in_logs');
db.exec('DELETE FROM members');

const YEAR = 2026;
const MONTH = 6; // June

const pad = (n) => String(n).padStart(2, '0');

const plans = [
  // Monthly members (8)
  { name: 'John Doe', plan: 'Regular Member - Monthly (No Treadmill)', address: '123 Main St' },
  { name: 'Jane Smith', plan: 'Regular Member - Monthly (With Treadmill)', address: '456 Oak Rd' },
  { name: 'Mike Johnson', plan: 'Student/Senior Member - Monthly (No Treadmill)', address: '789 Pine Ave' },
  { name: 'Emily Davis', plan: 'Student/Senior Member - Monthly (With Treadmill)', address: '101 Maple Blvd' },
  { name: 'David Brown', plan: 'Regular Non-Member - Monthly (No Treadmill)', address: '202 Birch Ct' },
  { name: 'Sarah Wilson', plan: 'Regular Non-Member - Monthly (With Treadmill)', address: '303 Cedar Dr' },
  { name: 'Anna Taylor', plan: 'Student/Senior Non-Member - Monthly (No Treadmill)', address: '404 Elm St' },
  { name: 'Robert Lee', plan: 'Student/Senior Non-Member - Monthly (With Treadmill)', address: '505 Oak Ave' },
  // Semi-Monthly members (4)
  { name: 'Lisa Anderson', plan: 'Regular Member - Semi-Monthly (No Treadmill)', address: '606 Pine Rd' },
  { name: 'James Martin', plan: 'Regular Member - Semi-Monthly (With Treadmill)', address: '707 Birch Ln' },
  { name: 'Mary Jackson', plan: 'Student/Senior Non-Member - Semi-Monthly (No Treadmill)', address: '808 Maple Dr' },
  { name: 'William White', plan: 'Regular Non-Member - Semi-Monthly (With Treadmill)', address: '909 Cedar Ct' },
  // Daily members (4)
  { name: 'Patricia Harris', plan: 'Regular Member - Daily (No Treadmill)', address: '111 Walnut St' },
  { name: 'Thomas Clark', plan: 'Student/Senior Member - Daily (With Treadmill)', address: '222 Spruce Ave' },
  { name: 'Jennifer Lewis', plan: 'Regular Non-Member - Daily (No Treadmill)', address: '333 Ash Blvd' },
  { name: 'Charles Walker', plan: 'Student/Senior Non-Member - Daily (With Treadmill)', address: '444 Fir Ct' },
];

const rateTable = {
  'Regular Member - Monthly (No Treadmill)': { monthly: 600, semi: 300, daily: 60 },
  'Regular Member - Monthly (With Treadmill)': { monthly: 800, semi: 400, daily: 80 },
  'Student/Senior Member - Monthly (No Treadmill)': { monthly: 500, semi: 250, daily: 50 },
  'Student/Senior Member - Monthly (With Treadmill)': { monthly: 700, semi: 350, daily: 70 },
  'Regular Non-Member - Monthly (No Treadmill)': { monthly: 700, semi: 350, daily: 70 },
  'Regular Non-Member - Monthly (With Treadmill)': { monthly: 900, semi: 450, daily: 90 },
  'Student/Senior Non-Member - Monthly (No Treadmill)': { monthly: 600, semi: 300, daily: 60 },
  'Student/Senior Non-Member - Monthly (With Treadmill)': { monthly: 800, semi: 400, daily: 80 },
  'Regular Member - Semi-Monthly (No Treadmill)': { monthly: 600, semi: 300, daily: 60 },
  'Regular Member - Semi-Monthly (With Treadmill)': { monthly: 800, semi: 400, daily: 80 },
  'Student/Senior Non-Member - Semi-Monthly (No Treadmill)': { monthly: 600, semi: 300, daily: 60 },
  'Regular Non-Member - Semi-Monthly (With Treadmill)': { monthly: 900, semi: 450, daily: 90 },
  'Regular Member - Daily (No Treadmill)': { monthly: 600, semi: 300, daily: 60 },
  'Student/Senior Member - Daily (With Treadmill)': { monthly: 700, semi: 350, daily: 70 },
  'Regular Non-Member - Daily (No Treadmill)': { monthly: 700, semi: 350, daily: 70 },
  'Student/Senior Non-Member - Daily (With Treadmill)': { monthly: 800, semi: 400, daily: 80 },
};

function parsePlan(plan) {
  const isNonMember = plan.includes('Non-Member');
  const isStudentSenior = plan.includes('Student/Senior');
  const period = plan.includes('Daily') ? 'Daily'
    : plan.includes('Semi-Monthly') ? 'Semi-Monthly' : 'Monthly';
  const type = plan.includes('With Treadmill') ? 'With Treadmill' : 'No Treadmill';
  return { isNonMember, isStudentSenior, period, type };
}

function calcExpiry(plan, joinedDate) {
  const d = new Date(joinedDate);
  if (plan.includes('Daily')) d.setDate(d.getDate() + 1);
  else if (plan.includes('Semi-Monthly')) d.setDate(d.getDate() + 15);
  else if (plan.includes('Monthly')) d.setMonth(d.getMonth() + 1);
  return d.toISOString().split('T')[0];
}

function calcMembershipExpiry(plan, joinedDate) {
  if (plan.includes('Non-Member')) return null;
  const d = new Date(joinedDate);
  d.setFullYear(d.getFullYear() + 1);
  return d.toISOString().split('T')[0];
}

const insertMember = db.prepare(`
  INSERT INTO members (member_id, name, plan, status, joined_date, expiry_date, address, membership_expiry)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`);

const insertCheckin = db.prepare(`
  INSERT INTO check_in_logs (member_id, member_name, plan, status, checked_in_at)
  VALUES (?, ?, ?, ?, ?)
`);

const today = new Date();
const todayStr = today.toISOString().split('T')[0];

// Seed members with joined_dates spread across May 20 - June 3 (so all are on/ before today)
const joinDates = [
  { day: 20, month: 5 }, // May 20
  { day: 25, month: 5 }, // May 25
  { day: 28, month: 5 }, // May 28
  { day: 1, month: 6 },  // Jun 1
  { day: 2, month: 6 },  // Jun 2
  { day: 3, month: 6 },  // Jun 3
  { day: 30, month: 5 }, // May 30
];

plans.forEach((p, index) => {
  const memberId = `M-${String(index + 1).padStart(3, '0')}`;
  const jd = joinDates[index % joinDates.length];
  const joinedDate = `${jd.month === 5 ? '2026-05' : '2026-06'}-${pad(jd.day)}`;
  const expiryDate = calcExpiry(p.plan, joinedDate);
  const membershipExpiry = calcMembershipExpiry(p.plan, joinedDate);
  const { period } = parsePlan(p.plan);

  insertMember.run(memberId, p.name, p.plan, 'Active', joinedDate, expiryDate, p.address, membershipExpiry);
  console.log(`Created: ${p.name} (${memberId}) — ${period} — joined ${joinedDate}`);

  // For Daily members: create check-in logs from join date to today (but not beyond expiry)
  if (period === 'Daily') {
    const start = new Date(joinedDate);
    if (start > today) {
      console.log(`  → 0 check-ins (future join)`);
      return;
    }
    const end = new Date(Math.min(new Date(expiryDate).getTime(), today.getTime()));

    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const hour = Math.floor(Math.random() * 4) + 7;
      const minute = Math.floor(Math.random() * 60);
      d.setHours(hour, minute, 0, 0);
      const checkinUtc = d.toISOString().replace('T', ' ').substring(0, 19);
      insertCheckin.run(memberId, p.name, p.plan, 'Active', checkinUtc);
    }
    const checkinCount = Math.floor((end - start) / (1000 * 60 * 60 * 24)) + 1;
    console.log(`  → ${checkinCount} check-in(s) created`);
  }
});

console.log('\n✅ Demo data seeded successfully!');
console.log(`Total members: ${plans.length}`);
console.log(`Month: ${YEAR}-${pad(MONTH)}`);
