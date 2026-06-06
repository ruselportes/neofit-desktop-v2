import { useState, useEffect } from 'react';
import * as api from '../api';
import type { GymSettings, SmsLogEntry } from '../types';

export default function SettingsView({ showNotification }: { showNotification: (message: string, type?: 'success' | 'error') => void }) {
  const [form, setForm] = useState<GymSettings>({
    gymName: '', address: '', announcement: '',
    smtpHost: '', smtpPort: 587, smtpUser: '', smtpPass: '', smtpFrom: '',
    smtpEnabled: false,
  });
  const [saving, setSaving] = useState(false);
  const [sendingAnnouncement, setSendingAnnouncement] = useState(false);
  const [logs, setLogs] = useState<SmsLogEntry[]>([]);
  const [logPage, setLogPage] = useState(1);
  const [logTotal, setLogTotal] = useState(0);
  const logLimit = 50;

  useEffect(() => {
    api.fetchSettings().then(setForm).catch(() => {});
  }, []);

  useEffect(() => {
    api.fetchSmsLogs(logPage, logLimit).then(r => { setLogs(r.logs); setLogTotal(r.total); }).catch(() => {});
  }, [logPage]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.saveSettings(form);
      showNotification('Settings saved.');
    } catch (e) {
      showNotification(e instanceof Error ? e.message : 'Failed to save.', 'error');
    }
    setSaving(false);
  };

  const handleSendAnnouncement = async () => {
    if (!form.announcement.trim()) { showNotification('Write an announcement first.', 'error'); return; }
    setSendingAnnouncement(true);
    try {
      const res = await api.sendAnnouncement();
      showNotification(res.message || 'Sent.');
      api.fetchSmsLogs(logPage, logLimit).then(r => { setLogs(r.logs); setLogTotal(r.total); }).catch(() => {});
    } catch (e) {
      showNotification(e instanceof Error ? e.message : 'Failed.', 'error');
    }
    setSendingAnnouncement(false);
  };

  const totalPages = Math.ceil(logTotal / logLimit);

  const formatTime = (t: string) => {
    const d = new Date(t.replace(' ', 'T') + 'Z');
    return d.toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="view-container">
      <div className="view-header">
        <h2>Settings</h2>
      </div>

      <div className="card" style={{ maxWidth: 600, margin: '0 auto' }}>
        <h3 style={{ marginBottom: 16 }}>Gym Information</h3>
        <div className="form-group"><label>Gym Name</label><input className="input-field" value={form.gymName} onChange={e => setForm({...form, gymName: e.target.value})} /></div>
        <div className="form-group"><label>Address</label><input className="input-field" value={form.address} onChange={e => setForm({...form, address: e.target.value})} /></div>
        <div className="form-group"><label>Announcement</label>
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            <textarea className="input-field" value={form.announcement} onChange={e => setForm({...form, announcement: e.target.value})} rows={3} style={{ flex: 1 }} />
            <button className="btn-primary" style={{ padding: '6px 14px', fontSize: '0.8rem', whiteSpace: 'nowrap', marginTop: 0 }} onClick={handleSendAnnouncement} disabled={sendingAnnouncement}>
              {sendingAnnouncement ? 'Sending...' : 'Send to All'}
            </button>
          </div>
        </div>
      </div>

      <div className="card" style={{ maxWidth: 600, margin: '1rem auto' }}>
        <h3 style={{ marginBottom: 16 }}>SMS Notifications (Email-to-SMS Gateway)</h3>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: 12 }}>
          Configure SMTP to send expiry notifications as SMS via carrier email gateways (e.g. 0917xxxxxxx@globe.com.ph).
          Notifications are sent automatically at <strong>7 days</strong>, <strong>3 days</strong>, and <strong>1 day</strong> before expiry.
        </p>
        <div className="form-group"><label>SMTP Host</label><input className="input-field" placeholder="smtp.gmail.com" value={form.smtpHost} onChange={e => setForm({...form, smtpHost: e.target.value})} /></div>
        <div className="form-group"><label>SMTP Port</label><input type="number" className="input-field" value={form.smtpPort} onChange={e => setForm({...form, smtpPort: parseInt(e.target.value) || 587})} /></div>
        <div className="form-group"><label>SMTP User</label><input className="input-field" placeholder="your@email.com" value={form.smtpUser} onChange={e => setForm({...form, smtpUser: e.target.value})} /></div>
        <div className="form-group"><label>SMTP Password</label><input type="password" className="input-field" value={form.smtpPass} onChange={e => setForm({...form, smtpPass: e.target.value})} /></div>
        <div className="form-group"><label>From Email</label><input className="input-field" placeholder="gym@neofit.com" value={form.smtpFrom} onChange={e => setForm({...form, smtpFrom: e.target.value})} /></div>
        <div className="form-group" style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <label>Enabled</label>
          <input type="checkbox" checked={form.smtpEnabled} onChange={e => setForm({...form, smtpEnabled: e.target.checked})} />
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>— When checked, the system automatically sends expiry SMS at 7d, 3d, and 1d before each member's expiry. Uncheck to disable all SMS.</span>
        </div>
        <button className="btn-primary" style={{ marginTop: 8 }} onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : 'Save Settings'}</button>
      </div>

      <div className="card" style={{ maxWidth: 800, margin: '1rem auto' }}>
        <h3 style={{ marginBottom: 16 }}>SMS Logs</h3>
        {logs.length === 0 ? (
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>No SMS have been sent yet. The system will automatically send notifications at 8 AM daily.</p>
        ) : (
          <>
            <div style={{ overflowX: 'auto' }}>
              <table className="table" style={{ width: '100%', fontSize: '0.85rem' }}>
                <thead>
                  <tr>
                    <th>Member</th>
                    <th>Contact</th>
                    <th>Message</th>
                    <th>Type</th>
                    <th>Status</th>
                    <th>Time</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map(log => (
                    <tr key={log.id}>
                      <td>{log.member_name}</td>
                      <td style={{ fontFamily: 'monospace' }}>{log.contact}</td>
                      <td style={{ maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={log.message}>{log.message}</td>
                      <td>{log.milestone}</td>
                      <td>
                        {log.status === 'sent'
                          ? <span style={{ color: '#4caf50' }}>✅ Sent</span>
                          : <span style={{ color: '#f44336' }} title={log.error || ''}>❌ Failed</span>}
                      </td>
                      <td>{formatTime(log.sent_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {totalPages > 1 && (
              <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8, marginTop: 12 }}>
                <button className="btn-primary" style={{ padding: '4px 12px', fontSize: '0.8rem' }} disabled={logPage <= 1} onClick={() => setLogPage(logPage - 1)}>Prev</button>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{logPage} / {totalPages}</span>
                <button className="btn-primary" style={{ padding: '4px 12px', fontSize: '0.8rem' }} disabled={logPage >= totalPages} onClick={() => setLogPage(logPage + 1)}>Next</button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
