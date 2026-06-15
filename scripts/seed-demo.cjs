/**
 * NeoFit Demo Seed Script
 * ───────────────────────────
 * Populates the dev Supabase database with sample data for testing.
 *
 * Usage:
 *   npm run seed
 *
 * What it seeds:
 *   - 20 members with varied plans/statuses (Active, Expiring Soon, Expired, Pending)
 *   - Check-in history spanning the last 30 days
 *   - SMS queue with sample entries
 *
 * It does NOT touch:
 *   - users table (admin account stays as-is)
 *   - settings table (gym config stays as-is)
 */

require('dotenv').config();
const supabase = require('../server/supabase.cjs');

// ─── Date Helpers ──────────────────────────────────────────────

/** Returns a YYYY-MM-DD string for a date offset from today. */
function daysFromToday(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().split('T')[0];
}

/** Returns an ISO datetime string for a date offset from today at a given hour+minute. */
function dateTimeOffset(days, hours, minutes) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(hours, minutes, 0, 0);
  return d.toISOString();
}

// ─── Plan & Rate Data (mirrors src/rates.ts) ──────────────────

const RATE_TABLE = [
  { category: 'Regular Members',          type: 'No Treadmill',   monthly: 600, semi: 300, daily: 60 },
  { category: 'Regular Members',          type: 'With Treadmill', monthly: 800, semi: 400, daily: 80 },
  { category: 'Student/Senior Members',    type: 'No Treadmill',   monthly: 500, semi: 250, daily: 50 },
  { category: 'Student/Senior Members',    type: 'With Treadmill', monthly: 700, semi: 350, daily: 70 },
  { category: 'Regular Non-Members',       type: 'No Treadmill',   monthly: 700, semi: 350, daily: 70 },
  { category: 'Regular Non-Members',       type: 'With Treadmill', monthly: 900, semi: 450, daily: 80 },
  { category: 'Student/Senior Non-Members', type: 'No Treadmill',   monthly: 600, semi: 300, daily: 60 },
  { category: 'Student/Senior Non-Members', type: 'With Treadmill', monthly: 800, semi: 400, daily: 70 },
];

function planLabel(catIdx, period, typeIdx) {
  const cats = [
    'Regular Members', 'Student/Senior Members',
    'Regular Non-Members', 'Student/Senior Non-Members',
  ];
  const types = ['No Treadmill', 'With Treadmill'];
  const cat = cats[catIdx];
  const displayCat = cat.replace('Members', 'Member').replace('Non-Members', 'Non-Member');
  return `${displayCat} - ${period} (${types[typeIdx]})`;
}

// ─── Member Definitions ───────────────────────────────────────
// 20 members covering all 8 rate categories and all 4 statuses.

const MEMBER_DEFS = [
  // ── Active members (expiry 30-60 days from now) ──
  { name: 'Juan Dela Cruz',        contact: '09171234567', plan: planLabel(0, 'Monthly', 0), joined: -90,  expiry: 45,  address: '123 Rizal St, Manila' },
  { name: 'Maria Santos',          contact: '09181234567', plan: planLabel(0, 'Monthly', 1), joined: -60,  expiry: 50,  address: '456 Mabini St, Quezon City' },
  { name: 'Pedro Gonzales',        contact: '09191234567', plan: planLabel(1, 'Monthly', 0), joined: -45,  expiry: 35,  address: '789 Bonifacio St, Makati' },
  { name: 'Ana Reyes',             contact: '09201234567', plan: planLabel(1, 'Monthly', 1), joined: -30,  expiry: 60,  address: '101 Aguinaldo St, Pasig' },
  { name: 'Carlos Mendoza',        contact: '09211234567', plan: planLabel(0, 'Semi-Monthly', 0), joined: -20, expiry: 40, address: '202 Luna St, Mandaluyong' },

  // ── Expiring Soon members (expiry within 7 days) ──
  { name: 'Mariel Fernandez',      contact: '09221234567', plan: planLabel(0, 'Monthly', 0), joined: -85,  expiry: 3,   address: '303 Palma St, Manila' },
  { name: 'Ramon Villanueva',      contact: '09231234567', plan: planLabel(0, 'Monthly', 1), joined: -60,  expiry: 5,   address: '404 Soler St, Caloocan' },
  { name: 'Luzviminda Ramirez',    contact: '09241234567', plan: planLabel(1, 'Monthly', 0), joined: -40,  expiry: 1,   address: '505 Dimasalang St, Manila' },
  { name: 'Ricardo Salvador',      contact: '09251234567', plan: planLabel(2, 'Daily', 0),   joined: -25,  expiry: 6,   address: '606 P. Ocampo St, Makati' },

  // ── Expired members (expiry in the past) ──
  { name: 'Teresa Ignacio',        contact: '09261234567', plan: planLabel(0, 'Monthly', 1), joined: -120, expiry: -15, address: '707 Taft Ave, Manila' },
  { name: 'Gregorio Bautista',     contact: '09271234567', plan: planLabel(2, 'Semi-Monthly', 0), joined: -90, expiry: -10, address: '808 EDSA, Quezon City' },
  { name: 'Fely Cortez',           contact: '09281234567', plan: planLabel(1, 'Monthly', 0), joined: -80,  expiry: -5,  address: '909 Shaw Blvd, Pasig' },
  { name: 'Dante Mercado',         contact: '09291234567', plan: planLabel(3, 'Daily', 1),   joined: -60,  expiry: -3,  address: '1001 Ortigas Ave, Mandaluyong' },
  { name: 'Nena Evangelista',      contact: '09301234567', plan: planLabel(2, 'Monthly', 1), joined: -100, expiry: -30, address: '1102 Araneta Ave, Quezon City' },

  // ── Pending members (future join date) ──
  { name: 'Oscar De Leon',         contact: '09311234567', plan: planLabel(0, 'Monthly', 0), joined: 5,   expiry: 35,  address: '1203 España Blvd, Manila' },
  { name: 'Perla Gomez',           contact: '09321234567', plan: planLabel(0, 'Monthly', 1), joined: 10,  expiry: 40,  address: '1304 Katipunan Ave, Quezon City' },
  { name: 'Rudy Santiago',         contact: '09331234567', plan: planLabel(2, 'Daily', 0),   joined: 7,   expiry: 8,   address: '1405 Aurora Blvd, Pasig' },

  // ── Extra: Daily and Semi-Monthly active members ──
  { name: 'Lorna Valdez',          contact: '09341234567', plan: planLabel(0, 'Daily', 0),   joined: -15, expiry: -14, address: '1506 A. Flores St, Manila' },
  { name: 'Benito Alcantara',      contact: '09351234567', plan: planLabel(1, 'Semi-Monthly', 1), joined: -30, expiry: 20, address: '1607 Beata St, Manila' },
  { name: 'Aurora Hernandez',      contact: '09361234567', plan: planLabel(0, 'Monthly', 0), joined: -10, expiry: 55, address: '1708 Nagtahan St, Manila' },
];

// ─── Status Calculation ────────────────────────────────────────

function calculateStatus(joinedDate, expiryDate) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const joined = joinedDate ? new Date(joinedDate) : null;
  const expiry = expiryDate ? new Date(expiryDate) : null;
  if (joined) joined.setHours(0, 0, 0, 0);
  if (expiry) expiry.setHours(0, 0, 0, 0);

  if (joined && joined > today) return 'Pending';
  if (expiry && expiry < today) return 'Expired';
  if (expiry) {
    const daysLeft = Math.ceil((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    if (daysLeft <= 7 && daysLeft >= 0) return 'Expiring Soon';
  }
  return 'Active';
}

// ─── Main Seed Logic ───────────────────────────────────────────

async function seed() {
  console.log('╔═══════════════════════════════════════╗');
  console.log('║   NeoFit Demo Database Seed Script   ║');
  console.log('╚═══════════════════════════════════════╝\n');

  // 1. Verify connection
  const { error: connError } = await supabase.from('users').select('id').limit(1).maybeSingle();
  if (connError) {
    console.error('❌ Cannot connect to Supabase. Make sure .env is configured and schema is applied.');
    console.error(`   Error: ${connError.message}`);
    process.exit(1);
  }
  console.log('✅ Connected to Supabase\n');

  // 2. Clear existing demo data (keep users + settings)
  console.log('Clearing existing demo data...');
  await supabase.from('check_in_logs').delete().neq('id', 0);
  await supabase.from('sms_queue').delete().neq('id', 0);
  await supabase.from('members').delete().neq('id', 0);
  console.log('✅ Cleared members, check-ins, and SMS queue\n');

  // 3. Seed members
  console.log(`Seeding ${MEMBER_DEFS.length} members...`);
  let seededCount = 0;
  for (const def of MEMBER_DEFS) {
    const joinedDate = daysFromToday(def.joined);
    const expiryDate = def.expiry !== undefined ? daysFromToday(def.expiry) : null;
    const membershipExpiry = def.plan.includes('Non-Member') ? null : daysFromToday(def.joined + 365);
    const status = calculateStatus(joinedDate, expiryDate);

    // Generate member_id sequentially
    const memberId = `M-${String(seededCount + 1).padStart(3, '0')}`;

    const { error } = await supabase.from('members').insert({
      member_id: memberId,
      name: def.name,
      contact: def.contact,
      plan: def.plan,
      status,
      joined_date: joinedDate,
      expiry_date: expiryDate,
      address: def.address || '',
      membership_expiry: membershipExpiry,
      created_at: new Date(def.joined < 0 ? daysFromToday(def.joined) : daysFromToday(-1)).toISOString(),
      updated_at: new Date().toISOString(),
    });

    if (error) {
      console.error(`   ❌ Failed to seed ${def.name}: ${error.message}`);
    } else {
      seededCount++;
      console.log(`   ✅ ${memberId} ${def.name.padEnd(20)} ${status.padEnd(14)} ${def.plan}`);
    }
  }
  console.log(`\n✅ ${seededCount} members seeded\n`);

  // 4. Fetch seeded members for check-in generation
  const { data: seededMembers } = await supabase.from('members').select('*');
  if (!seededMembers || seededMembers.length === 0) {
    console.error('❌ No members in database, cannot seed check-ins.');
    process.exit(1);
  }

  // 5. Seed check-in logs (last 30 days)
  console.log('Seeding check-in history (last 30 days)...');
  let checkinCount = 0;

  // Only active/expiring soon members check in regularly
  const activeMembers = seededMembers.filter(m =>
    m.status === 'Active' || m.status === 'Expiring Soon'
  );

  // Daily-plan members check in more frequently (they pay per visit)
  const dailyMembers = seededMembers.filter(m => m.plan.includes('Daily'));
  // Regular-plan members check in 2-4 times per week
  const regularMembers = seededMembers.filter(m =>
    !m.plan.includes('Daily') && (m.status === 'Active' || m.status === 'Expiring Soon')
  );

  for (let dayOffset = -30; dayOffset < 0; dayOffset++) {
    // Skip Sundays (day 0 = Sunday)
    const d = new Date(); d.setDate(d.getDate() + dayOffset);
    if (d.getDay() === 0) continue;

    // Check-ins for daily members (almost daily)
    for (const m of dailyMembers) {
      // 70% chance of checking in on non-Sunday days
      if (Math.random() < 0.7) {
        // Morning check-in (6 AM - 10 AM)
        const ciTime = dateTimeOffset(dayOffset, 6 + Math.floor(Math.random() * 4), Math.floor(Math.random() * 60));
        const { error } = await supabase.from('check_in_logs').insert({
          member_id: m.member_id,
          member_name: m.name,
          plan: m.plan,
          status: m.status,
          checked_in_at: ciTime,
        });
        if (!error) checkinCount++;
      }
    }

    // Check-ins for regular members (2-4 times per week)
    for (const m of regularMembers) {
      // 35% chance per day (avg ~2.5x/week)
      if (Math.random() < 0.35) {
        const ciTime = dateTimeOffset(dayOffset, 5 + Math.floor(Math.random() * 6), Math.floor(Math.random() * 60));
        const { error } = await supabase.from('check_in_logs').insert({
          member_id: m.member_id,
          member_name: m.name,
          plan: m.plan,
          status: m.status,
          checked_in_at: ciTime,
        });
        if (!error) checkinCount++;
      }
    }
  }

  // Add some check-ins for expired members (before they expired)
  const expiredMembers = seededMembers.filter(m => m.status === 'Expired');
  for (const m of expiredMembers) {
    if (!m.expiry_date) continue;
    const expiryDate = new Date(m.expiry_date);
    const today = new Date();
    // Create check-ins for the month before expiry
    for (let dayOffset = -30; dayOffset < -1; dayOffset++) {
      const ciDate = new Date(expiryDate);
      ciDate.setDate(ciDate.getDate() + dayOffset);
      if (ciDate > today) continue;
      if (ciDate.getDay() === 0) continue;
      if (Math.random() < 0.3) {
        const ciTime = ciDate.toISOString().split('T')[0] + 'T' +
          String(6 + Math.floor(Math.random() * 4)).padStart(2, '0') + ':' +
          String(Math.floor(Math.random() * 60)).padStart(2, '0') + ':00.000Z';
        const { error } = await supabase.from('check_in_logs').insert({
          member_id: m.member_id,
          member_name: m.name,
          plan: m.plan,
          status: m.status,
          checked_in_at: ciTime,
        });
        if (!error) checkinCount++;
      }
    }
  }

  console.log(`✅ ${checkinCount} check-in records created\n`);

  // 6. Seed a few sample SMS queue entries for phone app testing
  console.log('Seeding sample SMS queue entries...');
  const sampleSms = [
    { recipient: '09171234567', message: 'Hi Juan, your plan expires in 3 days. Please renew. - NeoFit Fitness', member_name: 'Juan Dela Cruz' },
    { recipient: '09221234567', message: 'Hi Mariel, your plan expires in 3 days. Please renew. - NeoFit Fitness', member_name: 'Mariel Fernandez' },
  ];
  let smsCount = 0;
  for (const sms of sampleSms) {
    const { error } = await supabase.from('sms_queue').insert({
      recipient: sms.recipient,
      message: sms.message,
      member_name: sms.member_name,
      status: 'pending',
      created_at: new Date().toISOString(),
    });
    if (!error) smsCount++;
  }
  console.log(`✅ ${smsCount} SMS queue entries created\n`);

  // 7. Print summary
  const { count: memberTotal } = await supabase.from('members').select('*', { count: 'exact', head: true });
  const { count: checkinTotal } = await supabase.from('check_in_logs').select('*', { count: 'exact', head: true });
  const { count: activeTotal } = await supabase.from('members').select('*', { count: 'exact', head: true }).eq('status', 'Active');
  const { count: expiringTotal } = await supabase.from('members').select('*', { count: 'exact', head: true }).eq('status', 'Expiring Soon');
  const { count: expiredTotal } = await supabase.from('members').select('*', { count: 'exact', head: true }).eq('status', 'Expired');
  const { count: pendingTotal } = await supabase.from('members').select('*', { count: 'exact', head: true }).eq('status', 'Pending');

  console.log('╔═══════════════════════════════════════╗');
  console.log('║           Seed Complete!              ║');
  console.log('╚═══════════════════════════════════════╝');
  console.log(` Members:     ${memberTotal || 0}`);
  console.log(`   Active:     ${activeTotal || 0}`);
  console.log(`   Expiring:   ${expiringTotal || 0}`);
  console.log(`   Expired:    ${expiredTotal || 0}`);
  console.log(`   Pending:    ${pendingTotal || 0}`);
  console.log(` Check-ins:   ${checkinTotal || 0}`);
  console.log(` SMS queued:  ${smsCount}`);
  console.log('');
  console.log(' Login: admin@neofit.com / admin123');
  console.log('─────────────────────────────────────────\n');
}

seed().catch(err => {
  console.error('Fatal seed error:', err);
  process.exit(1);
});
