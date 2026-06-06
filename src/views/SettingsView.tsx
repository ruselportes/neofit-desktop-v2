import { useState, useEffect } from 'react';
import * as api from '../api';
import type { GymSettings } from '../types';

export default function SettingsView({ showNotification }: { showNotification: (message: string, type?: 'success' | 'error') => void }) {
  const [form, setForm] = useState<GymSettings>({
    gymName: '', contact: '', address: '', announcement: '',
    modemPort: 'COM3', modemBaud: 9600, modemEnabled: false, notifyDaysBefore: 3,
  });
  const [testNumber, setTestNumber] = useState('');
  const [testMessage, setTestMessage] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.fetchSettings().then(setForm).catch(() => {});
  }, []);

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

  const handleTestSms = async () => {
    if (!testNumber || !testMessage) { showNotification('Enter number and message.', 'error'); return; }
    try {
      await api.sendTestSms(testNumber, testMessage);
      showNotification('Test SMS sent.');
    } catch (e) {
      showNotification(e instanceof Error ? e.message : 'Failed.', 'error');
    }
  };

  const handleRunNow = async () => {
    try {
      const res = await api.triggerNotifications();
      showNotification(res.message || 'Done.');
    } catch (e) {
      showNotification(e instanceof Error ? e.message : 'Failed.', 'error');
    }
  };

  return (
    <div className="view-container">
      <div className="view-header">
        <h2>Settings</h2>
      </div>

      <div className="card" style={{ maxWidth: 600, margin: '0 auto' }}>
        <h3 style={{ marginBottom: 16 }}>Gym Information</h3>
        <div className="form-group"><label>Gym Name</label><input className="input-field" value={form.gymName} onChange={e => setForm({...form, gymName: e.target.value})} /></div>
        <div className="form-group"><label>Contact</label><input className="input-field" value={form.contact} onChange={e => setForm({...form, contact: e.target.value})} /></div>
        <div className="form-group"><label>Address</label><input className="input-field" value={form.address} onChange={e => setForm({...form, address: e.target.value})} /></div>
        <div className="form-group"><label>Announcement</label><textarea className="input-field" value={form.announcement} onChange={e => setForm({...form, announcement: e.target.value})} rows={3} /></div>
      </div>

      <div className="card" style={{ maxWidth: 600, margin: '1rem auto' }}>
        <h3 style={{ marginBottom: 16 }}>SMS Notifications (USB GSM Modem)</h3>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: 12 }}>
          Plug a USB GSM dongle (Huawei E303, ZTE MF190, etc.) into the server. The modem must be in "serial mode" (not network card mode).
        </p>
        <div className="form-group"><label>COM Port</label><input className="input-field" style={{ maxWidth: 120 }} placeholder="COM3" value={form.modemPort} onChange={e => setForm({...form, modemPort: e.target.value})} /></div>
        <div className="form-group"><label>Baud Rate</label>
          <select className="input-field" style={{ maxWidth: 120 }} value={form.modemBaud} onChange={e => setForm({...form, modemBaud: parseInt(e.target.value)})}>
            <option value={9600}>9600</option>
            <option value={115200}>115200</option>
          </select>
        </div>
        <div className="form-group" style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <label>Enabled</label>
          <input type="checkbox" checked={form.modemEnabled} onChange={e => setForm({...form, modemEnabled: e.target.checked})} />
        </div>
        <div className="form-group"><label>Notify Days Before Expiry</label>
          <select className="input-field" style={{ maxWidth: 120 }} value={form.notifyDaysBefore} onChange={e => setForm({...form, notifyDaysBefore: parseInt(e.target.value)})}>
            <option value={1}>1 day</option>
            <option value={3}>3 days</option>
            <option value={5}>5 days</option>
            <option value={7}>7 days</option>
          </select>
        </div>

        <button className="btn-primary" style={{ marginTop: 8 }} onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : 'Save Settings'}</button>
      </div>

      <div className="card" style={{ maxWidth: 600, margin: '1rem auto' }}>
        <h3 style={{ marginBottom: 16 }}>Test SMS &amp; Manual Run</h3>
        <div className="form-group"><label>Recipient Number</label><input className="input-field" placeholder="09171234501" value={testNumber} onChange={e => setTestNumber(e.target.value)} maxLength={11} /></div>
        <div className="form-group"><label>Test Message</label><textarea className="input-field" placeholder="Your message here..." value={testMessage} onChange={e => setTestMessage(e.target.value)} rows={2} /></div>
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <button className="btn-primary" onClick={handleTestSms}>Send Test SMS</button>
          <button className="btn-primary" style={{ background: 'var(--accent-color)', borderColor: 'var(--accent-color)' }} onClick={handleRunNow}>Run Notifications Now</button>
        </div>
      </div>
    </div>
  );
}
