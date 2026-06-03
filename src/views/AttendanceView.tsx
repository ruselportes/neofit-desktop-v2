import { useState, useEffect, useCallback } from 'react';
import * as api from '../api';
import type { CheckIn, Member } from '../types';

export default function AttendanceView({ showNotification }: { showNotification: (message: string, type?: 'success' | 'error') => void }) {
  const today = new Date().toLocaleDateString('sv');
  const [selectedDate, setSelectedDate] = useState(today);
  const [memberId, setMemberId] = useState('M-');
  const [checkIns, setCheckIns] = useState<CheckIn[]>([]);

  const [renewalMember, setRenewalMember] = useState<Member | null>(null);
  const [renewalType, setRenewalType] = useState<'plan' | 'membership' | null>(null);
  const [renewalForm, setRenewalForm] = useState({
    plan: '',
    start_date: '',
    expiry_date: '',
    membership_expiry: ''
  });
  const [renewalError, setRenewalError] = useState('');

  const handleMemberIdChange = (value: string) => {
    if (!value.startsWith('M-')) {
      setMemberId('M-');
      return;
    }
    const afterPrefix = value.slice(2).replace(/\D/g, '');
    setMemberId('M-' + afterPrefix.slice(0, 3));
  };

  const loadCheckIns = useCallback(() => {
    api.fetchCheckIns(selectedDate)
      .then(setCheckIns)
      .catch(err => {
        console.error(err);
      });
  }, [selectedDate]);

  useEffect(() => { loadCheckIns(); }, [loadCheckIns]);

  const calcExpiry = (plan: string, joinedDate: string): string => {
    if (!joinedDate) return '';
    const d = new Date(joinedDate);
    if (plan.includes('Daily')) {
      d.setDate(d.getDate() + 1);
    } else if (plan.includes('Semi-Monthly')) {
      d.setDate(d.getDate() + 15);
    } else if (plan.includes('Monthly')) {
      d.setMonth(d.getMonth() + 1);
    }
    return d.toISOString().split('T')[0];
  };

  const calcMembershipExpiry = (plan: string, joinedDate: string): string => {
    if (!joinedDate || plan.includes('Non-Member')) return '';
    const d = new Date(joinedDate);
    d.setFullYear(d.getFullYear() + 1);
    return d.toISOString().split('T')[0];
  };

  const getRenewalDefaultStartDate = (expiryStr: string | null): string => {
    const todayStr = new Date().toLocaleDateString('sv');
    if (!expiryStr) return todayStr;
    const expiry = new Date(expiryStr);
    const today = new Date(todayStr);
    if (expiry > today) {
      const nextDay = new Date(expiry);
      nextDay.setDate(nextDay.getDate() + 1);
      return nextDay.toLocaleDateString('sv');
    }
    return todayStr;
  };

  const startRenewPlan = (m: Member) => {
    const defaultStart = getRenewalDefaultStartDate(m.expiry_date?.split('T')[0] || null);
    setRenewalForm({
      plan: m.plan,
      start_date: defaultStart,
      expiry_date: calcExpiry(m.plan, defaultStart),
      membership_expiry: m.membership_expiry?.split('T')[0] || ''
    });
    setRenewalType('plan');
  };

  const startRenewMembership = (m: Member) => {
    const defaultStart = getRenewalDefaultStartDate(m.membership_expiry?.split('T')[0] || null);
    setRenewalForm({
      plan: m.plan,
      start_date: defaultStart,
      expiry_date: m.expiry_date?.split('T')[0] || '',
      membership_expiry: calcMembershipExpiry(m.plan, defaultStart)
    });
    setRenewalType('membership');
  };

  const submitPlanRenewal = async () => {
    if (!renewalMember) return;
    try {
      setRenewalError('');
      const updated = await api.updateMember(renewalMember.id, {
        plan: renewalForm.plan,
        joined_date: renewalForm.start_date,
        expiry_date: renewalForm.expiry_date,
        membership_expiry: renewalForm.membership_expiry
      });
      setRenewalMember(null);
      setRenewalType(null);
      showNotification(`${updated.name}'s plan renewed successfully!`);
    } catch (e: unknown) {
      const errMsg = e instanceof Error ? e.message : 'Failed to renew plan.';
      setRenewalError(errMsg);
    }
  };

  const submitMembershipRenewal = async () => {
    if (!renewalMember) return;
    try {
      setRenewalError('');
      const updated = await api.updateMember(renewalMember.id, {
        membership_expiry: renewalForm.membership_expiry
      });
      setRenewalMember(null);
      setRenewalType(null);
      showNotification(`${updated.name}'s annual membership renewed successfully!`);
    } catch (e: unknown) {
      const errMsg = e instanceof Error ? e.message : 'Failed to renew annual membership.';
      setRenewalError(errMsg);
    }
  };

  const handleCheckIn = async () => {
    if (selectedDate !== today) return;
    if (!memberId.trim()) return;

    let member: Member | undefined;
    try {
      const members = await api.fetchMembers(memberId.trim());
      member = members[0];
    } catch {
      // proceed even if fetch fails
    }

    if (member) {
      // Plan expired → block check-in and show renewal modal
      if (member.status === 'Expired') {
        setRenewalMember(member);
        setRenewalError('');
        if (member.plan.includes('Non-Member')) {
          startRenewPlan(member);
        } else if (member.membership_expiry && new Date(member.membership_expiry) < new Date(new Date().toLocaleDateString('sv'))) {
          startRenewMembership(member);
        } else {
          startRenewPlan(member);
        }
        return;
      }

      // Membership expired but plan active → non-blocking membership renewal prompt
      const membershipExpired = !!member.membership_expiry &&
        !member.plan.includes('Non-Member') &&
        new Date(member.membership_expiry) < new Date(new Date().toLocaleDateString('sv'));
      if (membershipExpired) {
        setRenewalMember(member);
        setRenewalError('');
        startRenewMembership(member);
      }
    }

    try {
      const result = await api.createCheckIn(memberId.trim());
      showNotification(`${result.memberName} checked in successfully!`);
      setMemberId('M-');
      loadCheckIns();
    } catch (e: unknown) {
      const errMsg = e instanceof Error ? e.message : 'Failed to check in.';
      showNotification(errMsg, 'error');
    }
  };

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto' }}>
      <header className="header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div className="header-title">
          <h2>Attendance Tracker</h2>
          <p>Monitor live gym check-ins.</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', background: 'var(--glass-bg)', padding: '6px 14px', borderRadius: '8px', border: '1px solid var(--glass-border)' }}>
          <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Date:</label>
          <input
            type="date"
            className="input-field"
            value={selectedDate}
            onChange={e => setSelectedDate(e.target.value)}
            style={{ width: '150px', padding: '4px 8px', fontSize: '0.85rem', margin: 0, height: 'auto', background: 'transparent', border: 'none', color: 'var(--text-main)' }}
          />
        </div>
      </header>


      {selectedDate !== today && (
        <div style={{ 
          textAlign: 'center', 
          color: '#ff9800', 
          background: 'rgba(255, 152, 0, 0.1)', 
          border: '1px solid rgba(255, 152, 0, 0.3)',
          borderRadius: '8px',
          padding: '12px',
          marginBottom: '1.5rem',
          fontSize: '0.9rem',
          fontWeight: 500
        }}>
          ⚠️ Viewing past logs. Manual check-in is disabled.
        </div>
      )}

      <div className="search-bar" style={{ justifyContent: 'center', opacity: selectedDate !== today ? 0.6 : 1 }}>
        <input
          type="text" className="input-field" placeholder="M-001"
          value={memberId} onChange={e => handleMemberIdChange(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleCheckIn()}
          style={{ maxWidth: '300px' }}
          maxLength={5}
          disabled={selectedDate !== today}
        />
        <button className="btn-primary" onClick={handleCheckIn} disabled={selectedDate !== today}>Check In</button>
      </div>

      <div style={{ marginTop: '2.5rem' }}>
        <h3 className="section-title">{selectedDate === today ? "Today's Log" : `Logs for ${selectedDate}`}</h3>
        {checkIns.length > 0 ? (
          <div className="table-container">
            <table className="table-dashboard">
              <thead><tr><th>Member</th><th>ID</th><th>Time-In</th><th>Status</th></tr></thead>
              <tbody>
                {checkIns.map((c) => (
                  <tr key={c.id}>
                    <td><strong>{c.memberName}</strong></td>
                    <td>{c.memberId}</td>
                    <td>{c.time}</td>
                    <td><span className={`badge ${c.status.replace(' ','-').toLowerCase()}`}>{c.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div style={{ 
            textAlign: 'center', 
            color: 'var(--text-muted)', 
            padding: '3rem 1rem', 
            border: '1px dashed var(--glass-border)', 
            borderRadius: '8px',
            background: 'var(--glass-bg)',
            fontSize: '0.95rem'
          }}>
            No check-in logs found for this date.
          </div>
        )}
      </div>

      {renewalMember && (
        <div className="modal-overlay" onClick={() => { setRenewalMember(null); setRenewalType(null); }}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '500px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--glass-border)', paddingBottom: '0.75rem', marginBottom: '1.25rem' }}>
              <h3 style={{ margin: 0, color: '#ff5722' }}>
                {renewalMember.status === 'Expired' ? 'Plan Expired' : 'Annual Membership Expired'} - {renewalMember.name}
              </h3>
              <button
                onClick={() => { setRenewalMember(null); setRenewalType(null); }}
                style={{
                  background: 'none', border: 'none', color: 'var(--text-muted)',
                  fontSize: '1.5rem', cursor: 'pointer', padding: '0 0.5rem', lineHeight: 1
                }}
              >
                &times;
              </button>
            </div>

            <p style={{ margin: '0 0 1rem 0', fontSize: '0.9rem', color: 'var(--text-muted)' }}>
              {renewalMember.status === 'Expired'
                ? `${renewalMember.name}'s plan has expired. Please renew to continue.`
                : `${renewalMember.name}'s annual membership has expired. Renew to keep benefits.`}
            </p>

            {renewalError && <div className="toast error" style={{ marginBottom: '1rem' }}>{renewalError}</div>}

            {renewalType === 'plan' && (
              <div style={{ background: 'rgba(255, 87, 34, 0.04)', border: '1px solid rgba(255, 87, 34, 0.2)', borderRadius: '12px', padding: '1.25rem', marginBottom: '1rem' }}>
                <h5 style={{ margin: '0 0 1rem 0', color: 'var(--accent)', fontWeight: 600, fontSize: '0.95rem' }}>Plan Renewal</h5>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '0.8rem', marginBottom: '1rem' }}>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label>New Plan</label>
                    <select className="input-field" value={renewalForm.plan} onChange={e => {
                      const p = e.target.value;
                      setRenewalForm({ ...renewalForm, plan: p, expiry_date: calcExpiry(p, renewalForm.start_date), membership_expiry: calcMembershipExpiry(p, renewalForm.start_date) });
                    }}>
                      <optgroup label="━━ Members (Annual Fee Paid) ━━">
                        <option>Regular Member - Monthly (No Treadmill)</option>
                        <option>Regular Member - Monthly (With Treadmill)</option>
                        <option>Regular Member - Semi-Monthly (No Treadmill)</option>
                        <option>Regular Member - Semi-Monthly (With Treadmill)</option>
                        <option>Regular Member - Daily (No Treadmill)</option>
                        <option>Regular Member - Daily (With Treadmill)</option>
                        <option>Student/Senior Member - Monthly (No Treadmill)</option>
                        <option>Student/Senior Member - Monthly (With Treadmill)</option>
                        <option>Student/Senior Member - Semi-Monthly (No Treadmill)</option>
                        <option>Student/Senior Member - Semi-Monthly (With Treadmill)</option>
                        <option>Student/Senior Member - Daily (No Treadmill)</option>
                        <option>Student/Senior Member - Daily (With Treadmill)</option>
                      </optgroup>
                      <optgroup label="━━ Non-Members ━━">
                        <option>Regular Non-Member - Monthly (No Treadmill)</option>
                        <option>Regular Non-Member - Monthly (With Treadmill)</option>
                        <option>Regular Non-Member - Semi-Monthly (No Treadmill)</option>
                        <option>Regular Non-Member - Semi-Monthly (With Treadmill)</option>
                        <option>Regular Non-Member - Daily (No Treadmill)</option>
                        <option>Regular Non-Member - Daily (With Treadmill)</option>
                        <option>Student/Senior Non-Member - Monthly (No Treadmill)</option>
                        <option>Student/Senior Non-Member - Monthly (With Treadmill)</option>
                        <option>Student/Senior Non-Member - Semi-Monthly (No Treadmill)</option>
                        <option>Student/Senior Non-Member - Semi-Monthly (With Treadmill)</option>
                        <option>Student/Senior Non-Member - Daily (No Treadmill)</option>
                        <option>Student/Senior Non-Member - Daily (With Treadmill)</option>
                      </optgroup>
                    </select>
                  </div>
                  <div className="renewal-grid-2col">
                    <div className="form-group" style={{ margin: 0 }}>
                      <label>Start Date</label>
                      <input type="date" className="input-field" value={renewalForm.start_date} onChange={e => {
                        const d = e.target.value;
                          setRenewalForm({ ...renewalForm, start_date: d, expiry_date: calcExpiry(renewalForm.plan, d), membership_expiry: calcMembershipExpiry(renewalForm.plan, d) });
                        }} />
                    </div>
                    <div className="form-group" style={{ margin: 0 }}>
                      <label>New Expiry Date</label>
                      <input type="date" className="input-field" value={renewalForm.expiry_date} onChange={e => setRenewalForm({ ...renewalForm, expiry_date: e.target.value })} />
                    </div>
                  </div>
                  {!renewalForm.plan.includes('Non-Member') && (
                    <div className="form-group" style={{ margin: 0, marginTop: '0.8rem' }}>
                      <label>Annual Membership Expiry</label>
                      <input type="date" className="input-field" value={renewalForm.membership_expiry} onChange={e => setRenewalForm({ ...renewalForm, membership_expiry: e.target.value })} />
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                  <button className="btn-secondary" style={{ padding: '6px 12px', fontSize: '0.85rem' }} onClick={() => setRenewalType(null)}>Cancel</button>
                  <button className="btn-primary" style={{ padding: '6px 14px', fontSize: '0.85rem' }} onClick={submitPlanRenewal}>Confirm Renewal</button>
                </div>
              </div>
            )}

            {renewalType === 'membership' && (
              <div style={{ background: 'rgba(0, 229, 255, 0.04)', border: '1px solid rgba(0, 229, 255, 0.2)', borderRadius: '12px', padding: '1.25rem', marginBottom: '1rem' }}>
                <h5 style={{ margin: '0 0 1rem 0', color: '#00e5ff', fontWeight: 600, fontSize: '0.95rem' }}>Annual Membership Renewal</h5>
                <div className="renewal-grid-2col" style={{ marginBottom: '1rem' }}>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label>Start Date</label>
                    <input type="date" className="input-field" value={renewalForm.start_date} onChange={e => {
                      const d = e.target.value;
                      setRenewalForm({ ...renewalForm, start_date: d, membership_expiry: calcMembershipExpiry(renewalMember.plan, d) });
                    }} />
                  </div>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label>New Expiry Date</label>
                    <input type="date" className="input-field" value={renewalForm.membership_expiry} onChange={e => setRenewalForm({ ...renewalForm, membership_expiry: e.target.value })} />
                  </div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                  <button className="btn-secondary" style={{ padding: '6px 12px', fontSize: '0.85rem' }} onClick={() => setRenewalType(null)}>Cancel</button>
                  <button className="btn-primary" style={{ padding: '6px 14px', fontSize: '0.85rem', background: '#00e5ff', borderColor: '#00e5ff', boxShadow: '0 2px 8px rgba(0,229,255,0.2)' }} onClick={submitMembershipRenewal}>Confirm Renewal</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
