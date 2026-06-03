import { useState, useEffect } from 'react';
import * as api from '../api';
import type { DashboardStats, Member } from '../types';

export default function DashboardView({ onNavigate, role }: { onNavigate: (tab: string) => void, role: string | null }) {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [error, setError] = useState<string>('');
  const [alertTab, setAlertTab] = useState<'expired' | 'expiring'>('expired');

  const currency = (n: number) => `₱${n.toLocaleString()}`;

  useEffect(() => {
    api.fetchDashboard()
      .then(setStats)
      .catch(err => {
        console.error(err);
        setError('Failed to load dashboard stats.');
      });
  }, []);

  return (
    <>
      {error && <div className="toast error" style={{marginBottom: '1rem'}}>{error}</div>}
      
      <header className="header">
        <div className="header-title">
          <h2>Welcome Back, {role === 'admin' ? 'Admin' : 'Staff'}</h2>
          <p>Here's what's happening at Neofit today.</p>
        </div>
        <div className="header-actions">
          <button className="btn-primary" onClick={() => onNavigate('members')}>+ Add New Member</button>
        </div>
      </header>

      <section className="stats-grid">
        <div className="stat-card">
          <div className="stat-title">Active Members</div>
          <div className="stat-value">{stats?.activeMembers ?? '—'}</div>
          <div className="stat-change positive">of {stats?.totalMembers ?? 0} total</div>
        </div>
        <div className="stat-card">
          <div className="stat-title">Today's Check-ins</div>
          <div className="stat-value">{stats?.todayCheckIns ?? '—'}</div>
        </div>
        <div className="stat-card">
          <div className="stat-title">Total Members</div>
          <div className="stat-value">{stats?.totalMembers ?? '—'}</div>
        </div>
      </section>

      <section className="stats-grid" style={{ marginTop: '1rem' }}>
        <div className="stat-card" style={{ cursor: 'pointer' }} onClick={() => onNavigate('revenue')}>
          <div className="stat-title">Today's Revenue</div>
          <div className="stat-value" style={{ color: 'var(--accent)' }}>{stats ? currency(stats.todayRevenue) : '—'}</div>
        </div>
        <div className="stat-card" style={{ cursor: 'pointer' }} onClick={() => onNavigate('revenue')}>
          <div className="stat-title">Month Revenue</div>
          <div className="stat-value" style={{ color: 'var(--success)' }}>{stats ? currency(stats.thisMonthRevenue) : '—'}</div>
        </div>
        <div className="stat-card" style={{ cursor: 'pointer' }} onClick={() => onNavigate('revenue')}>
          <div className="stat-title">Year Revenue</div>
          <div className="stat-value" style={{ color: '#00e5ff' }}>{stats ? currency(stats.thisYearRevenue) : '—'}</div>
        </div>
      </section>

      <div className="dashboard-grid">
        <section className="recent-activity" style={{ marginBottom: 0 }}>
          <h3 className="section-title">Live Check-ins Today</h3>
          <div className="table-container">
            <table className="table-dashboard">
              <thead>
                <tr><th>Member</th><th>Time-In</th><th>Plan</th><th>Status</th></tr>
              </thead>
              <tbody>
                {stats?.recentCheckIns && stats.recentCheckIns.length > 0 ? stats.recentCheckIns.map((r) => (
                  <tr key={r.id}>
                    <td><strong>{r.memberName}</strong></td>
                    <td>{r.time}</td>
                    <td>{r.plan}</td>
                    <td><span className={`badge ${r.status.replace(' ', '-').toLowerCase()}`}>{r.status}</span></td>
                  </tr>
                )) : (
                  <tr><td colSpan={4} style={{textAlign:'center',color:'var(--text-muted)',padding:'3rem'}}>No check-ins today yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="recent-activity" style={{ marginBottom: 0 }}>
          <h3 className="section-title">Membership Alerts</h3>
          <div className="alert-tab-container" style={{ marginBottom: '1rem' }}>
            <button 
              className={`alert-tab-btn ${alertTab === 'expired' ? 'active' : ''}`}
              onClick={() => setAlertTab('expired')}
            >
              Expired ({stats?.expiredMembers?.length ?? 0})
            </button>
            <button 
              className={`alert-tab-btn ${alertTab === 'expiring' ? 'active' : ''}`}
              onClick={() => setAlertTab('expiring')}
            >
              Expiring Soon ({stats?.expiringMembers?.length ?? 0})
            </button>
          </div>

          <div className="alert-scroll-container">
            {alertTab === 'expired' ? (
              stats?.expiredMembers && stats.expiredMembers.length > 0 ? stats.expiredMembers.map((m: Member) => {
                const isAnnual = m.membership_expiry && new Date(m.membership_expiry) < new Date();
                const dateToShow = isAnnual && m.status !== 'Expired' ? m.membership_expiry : m.expiry_date;
                const labelToShow = isAnnual && m.status !== 'Expired' ? 'Annual Expired' : 'Plan Expired';
                return (
                  <div key={m.id} className="member-alert-item">
                    <div className="member-alert-info">
                      <strong>{m.name}</strong>
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>📋 {m.plan}</span>
                    </div>
                    <div className="member-alert-meta">
                      <span className="badge expired">{labelToShow}</span>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Since {dateToShow}</span>
                    </div>
                  </div>
                );
              }) : (
                <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '3rem' }}>No expired members.</div>
              )
            ) : (
              stats?.expiringMembers && stats.expiringMembers.length > 0 ? stats.expiringMembers.map((m: Member) => {
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                const mExpiry = m.membership_expiry ? new Date(m.membership_expiry) : null;
                const isAnnual = mExpiry && (mExpiry >= today) && Math.ceil((mExpiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)) <= 7;
                const dateToShow = isAnnual && m.status !== 'Expiring Soon' ? m.membership_expiry : m.expiry_date;
                const labelToShow = isAnnual && m.status !== 'Expiring Soon' ? 'Annual Expiring' : 'Plan Expiring';
                return (
                  <div key={m.id} className="member-alert-item">
                    <div className="member-alert-info">
                      <strong>{m.name}</strong>
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>📋 {m.plan}</span>
                    </div>
                    <div className="member-alert-meta">
                      <span className="badge expiring-soon">{labelToShow}</span>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Expires {dateToShow}</span>
                    </div>
                  </div>
                );
              }) : (
                <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '3rem' }}>No members expiring soon.</div>
              )
            )}
          </div>
        </section>
      </div>
    </>
  );
}
