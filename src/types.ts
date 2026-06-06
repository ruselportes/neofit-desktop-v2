export interface Member {
  id: number;
  member_id: string;
  name: string;
  contact: string;
  plan: string;
  status: string;
  joined_date?: string;
  expiry_date?: string;
  address?: string;
  membership_expiry?: string;
  last_sms_sent?: string;
}

export interface CheckIn {
  id: number;
  memberId: string;
  memberName: string;
  time: string;
  status: string;
}

export interface RecentCheckIn {
  id: number;
  memberName: string;
  time: string;
  plan: string;
  status: string;
}

export interface DashboardStats {
  activeMembers: number;
  totalMembers: number;
  todayCheckIns: number;
  recentCheckIns: RecentCheckIn[];
  expiringMembers: Member[];
  expiredMembers: Member[];
  todayRevenue: number;
  thisMonthRevenue: number;
  thisYearRevenue: number;
}

export interface GymSettings {
  gymName: string;
  contact: string;
  address: string;
  announcement: string;
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  smtpPass: string;
  smtpFrom: string;
  smtpEnabled: boolean;
}

export interface SmsLogEntry {
  id: number;
  member_id: string;
  member_name: string;
  contact: string;
  message: string;
  milestone: string;
  status: 'sent' | 'failed';
  error: string | null;
  sent_at: string;
}
