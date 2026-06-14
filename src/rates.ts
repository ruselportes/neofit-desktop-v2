// ─── Constants ─────────────────────────────────────────────────

const MS_PER_DAY = 1000 * 60 * 60 * 24;
const MEMBER_ID_PREFIX = 'M-';

export const ANNUAL_MEMBERSHIP_FEE = 300;
export const EXPIRING_SOON_DAYS = 7;

export const rateTable: Rate[] = [
  { category: 'Regular Members', type: 'No Treadmill', monthly: 600, semi: 300, daily: 60 },
  { category: 'Regular Members', type: 'With Treadmill', monthly: 800, semi: 400, daily: 80 },
  { category: 'Student/Senior Members', type: 'No Treadmill', monthly: 500, semi: 250, daily: 50 },
  { category: 'Student/Senior Members', type: 'With Treadmill', monthly: 700, semi: 350, daily: 70 },
  { category: 'Regular Non-Members', type: 'No Treadmill', monthly: 700, semi: 350, daily: 70 },
  { category: 'Regular Non-Members', type: 'With Treadmill', monthly: 900, semi: 450, daily: 90 },
  { category: 'Student/Senior Non-Members', type: 'No Treadmill', monthly: 600, semi: 300, daily: 60 },
  { category: 'Student/Senior Non-Members', type: 'With Treadmill', monthly: 800, semi: 400, daily: 80 },
];

// ─── Interfaces ────────────────────────────────────────────────

export interface Rate {
  category: string;
  type: string;
  monthly: number;
  semi: number;
  daily: number;
}

export interface ParsedPlan {
  category: string;
  period: string;
  type: string;
}

export interface MemberStatusInput {
  joined_date?: string | null;
  expiry_date?: string | null;
}

// ─── Internal Helpers ──────────────────────────────────────────

/** Resets a Date to midnight local time. */
function normalizeDate(d: Date): Date {
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Formats a Date to YYYY-MM-DD string. */
function formatDateStr(d: Date): string {
  return d.toISOString().split('T')[0];
}

// ─── Public API ────────────────────────────────────────────────

/**
 * Determines the plan status: 'Active', 'Pending', 'Expiring Soon', or 'Expired'.
 *
 * Status rules:
 * - If joined_date is in the future → 'Pending'
 * - If expiry_date is in the past → 'Expired'
 * - If expiry_date is within {@link EXPIRING_SOON_DAYS} days → 'Expiring Soon'
 * - Otherwise → 'Active'
 *
 * @param member - Member date information
 * @returns The computed plan status
 */
export function calculateStatus(member: MemberStatusInput): string {
  const today = normalizeDate(new Date());

  const joinedDate = member.joined_date ? normalizeDate(new Date(member.joined_date)) : null;
  const expiryDate = member.expiry_date ? normalizeDate(new Date(member.expiry_date)) : null;

  if (joinedDate && joinedDate > today) return 'Pending';
  if (expiryDate && expiryDate < today) return 'Expired';
  if (expiryDate) {
    const daysLeft = Math.ceil((expiryDate.getTime() - today.getTime()) / MS_PER_DAY);
    if (daysLeft >= 0 && daysLeft <= EXPIRING_SOON_DAYS) return 'Expiring Soon';
  }
  return 'Active';
}

/**
 * Parses a plan name string into its category, period, and type components.
 *
 * @example
 * parsePlan("Regular Member - Monthly (No Treadmill)")
 * // → { category: "Regular Members", period: "Monthly", type: "No Treadmill" }
 *
 * @param plan - The full plan name string
 * @returns The parsed plan components
 */
export function parsePlan(plan: string): ParsedPlan {
  const isNonMember = plan.includes('Non-Member');
  const isStudentSenior = plan.includes('Student/Senior');

  let category: string;
  if (isStudentSenior) {
    category = isNonMember ? 'Student/Senior Non-Members' : 'Student/Senior Members';
  } else {
    category = isNonMember ? 'Regular Non-Members' : 'Regular Members';
  }

  let period: string;
  if (plan.includes('Daily')) {
    period = 'Daily';
  } else if (plan.includes('Semi-Monthly')) {
    period = 'Semi-Monthly';
  } else if (plan.includes('Monthly')) {
    period = 'Monthly';
  } else {
    period = '';
  }

  let type: string;
  if (plan.includes('With Treadmill')) {
    type = 'With Treadmill';
  } else if (plan.includes('No Treadmill')) {
    type = 'No Treadmill';
  } else {
    type = '';
  }

  return { category, period, type };
}

/**
 * Looks up the Rate for a given category and type from the rate table.
 *
 * @param category - The membership category
 * @param type - The plan type (e.g., "With Treadmill", "No Treadmill")
 * @returns The matching Rate, or undefined if not found
 */
export function lookupRate(category: string, type: string): Rate | undefined {
  return rateTable.find(r => r.category === category && r.type === type);
}

/**
 * Returns the annual membership fee (₱300).
 */
export function getAnnualMembershipFee(): number {
  return ANNUAL_MEMBERSHIP_FEE;
}

/**
 * Calculates the plan expiry date string (YYYY-MM-DD) based on plan type and joined date.
 *
 * - Daily plans: joined_date + 1 day
 * - Semi-Monthly plans: joined_date + 15 days
 * - Monthly plans: joined_date + 1 month
 *
 * @param plan - The plan name (used to determine duration)
 * @param joinedDate - The start date (YYYY-MM-DD)
 * @returns Expiry date string, or empty string if input is invalid
 */
export function calcExpiry(plan: string, joinedDate: string): string {
  if (!joinedDate) return '';
  const d = new Date(joinedDate);

  if (plan.includes('Daily')) {
    d.setDate(d.getDate() + 1);
  } else if (plan.includes('Semi-Monthly')) {
    d.setDate(d.getDate() + 15);
  } else if (plan.includes('Monthly')) {
    d.setMonth(d.getMonth() + 1);
  } else {
    return '';
  }

  return formatDateStr(d);
}

/**
 * Calculates the annual membership expiry date string (YYYY-MM-DD).
 * Non-member plans do not get annual membership expiry.
 *
 * @param plan - The plan name
 * @param joinedDate - The start date (YYYY-MM-DD)
 * @returns Annual membership expiry date, or empty string for non-members or empty input
 */
export function calcMembershipExpiry(plan: string, joinedDate: string): string {
  if (!joinedDate || plan.includes('Non-Member')) return '';
  const d = new Date(joinedDate);
  d.setFullYear(d.getFullYear() + 1);
  return formatDateStr(d);
}

/**
 * Returns the number of remaining days from today (or a reference start date)
 * until the given expiry date. Returns 0 if no expiry date is provided.
 *
 * @param expiryDate - The expiry date (YYYY-MM-DD)
 * @param startDate - Optional reference start date; if provided and in the future, used instead of today
 * @returns Number of days remaining (can be negative for past dates)
 */
export function getRemainingDays(expiryDate: string, startDate?: string): number {
  if (!expiryDate) return 0;

  const today = normalizeDate(new Date());
  const start = startDate ? normalizeDate(new Date(startDate)) : today;
  const expiry = normalizeDate(new Date(expiryDate));

  // If the plan has not started yet, calculate duration from start date
  const referenceDate = start > today ? start : today;

  return Math.ceil((expiry.getTime() - referenceDate.getTime()) / MS_PER_DAY);
}

/**
 * Returns a date range (start/end ISO strings) for a given date string (YYYY-MM-DD).
 * If no date is provided, defaults to today.
 *
 * @param dateStr - The date in YYYY-MM-DD format (optional, defaults to today)
 * @returns Object with startISO and endISO strings
 */
export function getLocalDateRange(dateStr?: string): { startISO: string; endISO: string } {
  if (!dateStr) {
    const now = new Date();
    dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  }

  const start = new Date(`${dateStr}T00:00:00`);
  const end = new Date(`${dateStr}T23:59:59.999`);
  return { startISO: start.toISOString(), endISO: end.toISOString() };
}

/**
 * Formats an ISO datetime string to 12-hour time format (h:mm:ss AM/PM).
 *
 * @param isoStr - ISO datetime string or null/undefined
 * @returns Formatted time string, or empty string for null/invalid input
 */
export function formatLocalTime(isoStr: string | null | undefined): string {
  if (isoStr == null) return '';

  const d = new Date(isoStr);
  if (isNaN(d.getTime())) return '';

  const hours24 = d.getHours();
  const minutes = String(d.getMinutes()).padStart(2, '0');
  const seconds = String(d.getSeconds()).padStart(2, '0');
  const ampm = hours24 >= 12 ? 'PM' : 'AM';
  const hours12 = hours24 % 12 || 12;

  return `${hours12}:${minutes}:${seconds} ${ampm}`;
}

/**
 * Generates the next member ID (e.g., "M-001" → "M-002").
 *
 * @param lastMemberId - The last member ID (e.g., "M-001"). If omitted, returns "M-001"
 * @returns The next member ID string
 */
export function generateNextMemberId(lastMemberId?: string): string {
  if (!lastMemberId) return `${MEMBER_ID_PREFIX}001`;
  const num = parseInt(lastMemberId.replace(MEMBER_ID_PREFIX, ''), 10) + 1;
  return `${MEMBER_ID_PREFIX}${String(num).padStart(3, '0')}`;
}
