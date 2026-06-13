import { useState, useEffect, useCallback } from 'react';
import * as api from '../api';
import type { Member } from '../types';

interface MemberHistoryCheckIn {
  id: number;
  date: string;
  time: string;
  status: string;
}

export default function MembersView({ role, showNotification }: { role: string | null, showNotification: (message: string, type?: 'success' | 'error') => void }) {
  const [members, setMembers] = useState<Member[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All Status');
  const [showModal, setShowModal] = useState(false);
  const [editingMember, setEditingMember] = useState<Member | null>(null);
  const [form, setForm] = useState({ name: '', contact: '', plan: 'Monthly', joined_date: '', expiry_date: '', address: '', membership_expiry: '' });
  const [error, setError] = useState('');
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [detailsMember, setDetailsMember] = useState<Member | null>(null);
  const [memberCheckIns, setMemberCheckIns] = useState<MemberHistoryCheckIn[]>([]);
  const [loadingCheckIns, setLoadingCheckIns] = useState(false);

  const [historyTab, setHistoryTab] = useState<'calendar' | 'list'>('calendar');
  const [calendarYear, setCalendarYear] = useState(new Date().getFullYear());
  const [calendarMonth, setCalendarMonth] = useState(new Date().getMonth());
  const [selectedCalendarDate, setSelectedCalendarDate] = useState<string | null>(null);

  const [renewalType, setRenewalType] = useState<'plan' | 'membership' | null>(null);
  const [renewalForm, setRenewalForm] = useState({
    plan: '',
    start_date: '',
    expiry_date: '',
    membership_expiry: ''
  });

  const loadMembers = useCallback(() => {
    setError('');
    api.fetchMembers(search, statusFilter)
      .then(setMembers)
      .catch(err => {
        console.error(err);
        setError('Failed to load members.');
      });
  }, [search, statusFilter]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { loadMembers(); }, [loadMembers]);

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

  const getRemainingDays = (expiryDate: string, startDate?: string): number => {
    if (!expiryDate) return 0;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const start = startDate ? new Date(startDate) : today;
    start.setHours(0, 0, 0, 0);
    
    const expiry = new Date(expiryDate);
    expiry.setHours(0, 0, 0, 0);
    
    // If the plan has not started yet, calculate duration from start date
    const referenceDate = start > today ? start : today;
    
    const diffTime = expiry.getTime() - referenceDate.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  };
  // Parse plan name into { category, period, type } matching the Rates tab
  const parsePlan = (plan: string) => {
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
  };

  const defaultPlan = 'Regular Member - Monthly (No Treadmill)';

  const openAdd = () => {
    setEditingMember(null);
    const today = new Date().toISOString().split('T')[0];
    setForm({ name: '', contact: '09', plan: defaultPlan, joined_date: today, expiry_date: calcExpiry(defaultPlan, today), address: '', membership_expiry: calcMembershipExpiry(defaultPlan, today) });
    setError('');
    setShowModal(true);
  };

  const openEdit = (m: Member) => {
    setEditingMember(m);
    setForm({
      name: m.name, contact: m.contact, plan: m.plan,
      joined_date: m.joined_date?.split('T')[0] || '',
      expiry_date: m.expiry_date?.split('T')[0] || '',
      address: m.address || '',
      membership_expiry: m.membership_expiry?.split('T')[0] || '',
    });
    setError('');
    setShowModal(true);
  };

  const openDetails = async (m: Member) => {
    setDetailsMember(m);
    setShowDetailsModal(true);
    setHistoryTab('calendar');
    setRenewalType(null);
    const today = new Date();
    setCalendarYear(today.getFullYear());
    setCalendarMonth(today.getMonth());
    setSelectedCalendarDate(today.toLocaleDateString('sv'));
    setLoadingCheckIns(true);
    setMemberCheckIns([]);
    try {
      const data = await api.fetchMemberCheckIns(m.member_id);
      setMemberCheckIns(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingCheckIns(false);
    }
  };

  const prevMonth = () => {
    if (calendarMonth === 0) {
      setCalendarMonth(11);
      setCalendarYear(prev => prev - 1);
    } else {
      setCalendarMonth(prev => prev - 1);
    }
  };

  const nextMonth = () => {
    if (calendarMonth === 11) {
      setCalendarMonth(0);
      setCalendarYear(prev => prev + 1);
    } else {
      setCalendarMonth(prev => prev + 1);
    }
  };

  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];

  const daysInMonth = new Date(calendarYear, calendarMonth + 1, 0).getDate();
  const firstDayIndex = new Date(calendarYear, calendarMonth, 1).getDay();

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

   const handleDayClick = async (dateStr: string, hasCheckIn: boolean) => {
     if (!detailsMember) return;

     // Check if member is expired
     if (detailsMember.status === 'Expired') {
       if (!detailsMember.plan.includes('Non-Member')) {
         startRenewMembership(detailsMember);
       } else {
         startRenewPlan(detailsMember);
       }
       return;
     }

     const todayStr = new Date().toLocaleDateString('sv');

     if (dateStr === todayStr) {
       if (!hasCheckIn) {
         try {
           const newCheckIn = await api.createCheckIn(detailsMember.member_id);
           setMemberCheckIns(prev => [...prev, newCheckIn]);
           setSelectedCalendarDate(dateStr);
         } catch (err) {
           console.error(err);
           showNotification('Failed to check-in.', 'error');
         }
       } else {
         setSelectedCalendarDate(dateStr);
       }
     } else {
       setSelectedCalendarDate(dateStr);
     }
   };

  const submitPlanRenewal = async () => {
    if (!detailsMember) return;
    try {
      setError('');
      const updated = await api.updateMember(detailsMember.id, {
        plan: renewalForm.plan,
        joined_date: renewalForm.start_date,
        expiry_date: renewalForm.expiry_date,
        membership_expiry: renewalForm.membership_expiry
      });
      setDetailsMember(updated);
      setRenewalType(null);
      loadMembers();
      showNotification(`${detailsMember.name}'s plan renewed successfully!`);
    } catch (e: unknown) {
      const errMsg = e instanceof Error ? e.message : 'Failed to renew plan.';
      setError(errMsg);
    }
  };

  const submitMembershipRenewal = async () => {
    if (!detailsMember) return;
    try {
      setError('');
      const updated = await api.updateMember(detailsMember.id, {
        membership_expiry: renewalForm.membership_expiry
      });
      setDetailsMember(updated);
      setRenewalType(null);
      loadMembers();
      showNotification(`${detailsMember.name}'s annual membership renewed successfully!`);
    } catch (e: unknown) {
      const errMsg = e instanceof Error ? e.message : 'Failed to renew annual membership.';
      setError(errMsg);
    }
  };

  const handleContactChange = (value: string) => {
    const digits = value.replace(/\D/g, '');
    if (digits.length <= 2) {
      setForm({ ...form, contact: '09' });
    } else if (digits.startsWith('09')) {
      setForm({ ...form, contact: digits.slice(0, 11) });
    } else {
      setForm({ ...form, contact: '09' + digits.slice(0, 9) });
    }
  };

  const handleSave = async () => {
    try {
      setError('');
      if (!form.name || !form.contact || !form.expiry_date) { setError('Please fill in all fields.'); return; }
      
      if (form.contact.length !== 11 || !form.contact.startsWith('09')) {
        setError('Contact number must be exactly 11 digits (starting with 09).');
        return;
      }

      const trimmedName = form.name.trim().toLowerCase();
      const duplicate = members.find(m => 
        m.name.trim().toLowerCase() === trimmedName && 
        (!editingMember || m.id !== editingMember.id)
      );
      if (duplicate) {
        setError('A member with this name already exists.');
        return;
      }

      if (editingMember) {
        await api.updateMember(editingMember.id, form);
      } else {
        await api.createMember(form);
      }
      setShowModal(false);
      loadMembers();
      showNotification(editingMember ? 'Member updated successfully!' : 'Member added successfully!');
    } catch (e: unknown) {
      const errMsg = e instanceof Error ? e.message : 'Failed to save member.';
      setError(errMsg);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Are you sure you want to delete this member?')) return;
    try {
      await api.deleteMember(id);
      loadMembers();
      showNotification('Member deleted successfully!');
    } catch (e: unknown) {
      const errMsg = e instanceof Error ? e.message : 'Failed to delete member.';
      setError(errMsg);
    }
  };

  return (
    <>
      <header className="header">
        <div className="header-title">
          <h2>Member Management</h2>
          <p>View and manage all gym members.</p>
        </div>
        <div className="header-actions">
          <button className="btn-primary" onClick={openAdd}>+ Add New Member</button>
        </div>
      </header>

      <div className="search-bar">
        <input type="text" className="input-field" placeholder="Search by name, ID, phone..." value={search} onChange={e => setSearch(e.target.value)} style={{maxWidth:'300px'}} />
        <select className="input-field" value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={{maxWidth:'160px'}}>
          <option>All Status</option>
          <option>Active</option>
          <option>Pending</option>
          <option>Expiring Soon</option>
          <option>Expired</option>
          <option>Annual Membership</option>
        </select>
      </div>

      {error && <div className="toast error" style={{marginBottom: '1rem'}}>{error}</div>}

      <div className="table-container">
        <table className="table-members">
          <thead><tr><th>ID</th><th>Name</th><th>Contact</th><th>Address</th><th>Plan</th><th>Membership</th><th>Plan Expiry</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.id} className="clickable-row" onClick={() => openDetails(m)}>
                <td>{m.member_id}</td>
                <td><strong>{m.name}</strong></td>
                <td>{m.contact}</td>
                <td>{m.address || '-'}</td>
                <td>
                  {(() => {
                    const { category, period, type } = parsePlan(m.plan);
                    return (
                      <div>
                        <div style={{ fontWeight: 600, fontSize: '0.875rem' }}>{category}</div>
                        {(period || type) && (
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                            {[period, type].filter(Boolean).join(' · ')}
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </td>
                <td>
                  {!m.plan.includes('Non-Member') ? (() => {
                    const isFuture = m.joined_date && new Date(m.joined_date) > new Date();
                    const days = getRemainingDays(m.membership_expiry || '', m.joined_date);
                    if (days < 0) return <span style={{ color: 'var(--danger)', fontSize: '0.85rem', fontWeight: 600 }}>Expired</span>;
                    return (
                      <div>
                        <span style={{ color: isFuture ? 'var(--text-muted)' : (days <= 30 ? '#ff9800' : 'var(--success)'), fontSize: '0.85rem', fontWeight: 600 }}>
                          {days === 0 ? 'Expires Today' : `${days} day${days !== 1 ? 's' : ''} left`}
                        </span>
                        {isFuture && (
                          <div style={{ fontSize: '0.75rem', color: '#00e5ff', marginTop: '2px', fontWeight: 500 }}>
                            Starts in {getRemainingDays(m.joined_date || '')} days
                          </div>
                        )}
                      </div>
                    );
                  })() : <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>—</span>}
                </td>
                <td>
                  {(() => {
                    const isFuture = m.joined_date && new Date(m.joined_date) > new Date();
                    const days = getRemainingDays(m.expiry_date || '', m.joined_date);
                    if (days < 0) return <span style={{ color: 'var(--danger)', fontSize: '0.85rem', fontWeight: 600 }}>Expired</span>;
                    return (
                      <div>
                        <span style={{ color: isFuture ? 'var(--text-muted)' : (days <= 7 ? '#ff9800' : 'var(--success)'), fontSize: '0.85rem', fontWeight: 600 }}>
                          {days === 0 ? 'Expires Today' : `${days} day${days !== 1 ? 's' : ''} left`}
                        </span>
                        {isFuture && (
                          <div style={{ fontSize: '0.75rem', color: '#00e5ff', marginTop: '2px', fontWeight: 500 }}>
                            Starts in {getRemainingDays(m.joined_date || '')} days
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </td>
                <td>
                  <span className={`badge ${m.status.replace(' ', '-').toLowerCase()}`}>
                    {m.status}
                  </span>
                </td>
                <td>
                  <button className="btn-text" style={{marginRight:'0.5rem'}} onClick={(e) => { e.stopPropagation(); openDetails(m); }}>Details</button>
                  <button className="btn-text" onClick={(e) => { e.stopPropagation(); openEdit(m); }}>Edit</button>
                  {role === 'admin' && (
                    <button className="btn-text" style={{color:'var(--danger)',marginLeft:'0.5rem'}} onClick={(e) => { e.stopPropagation(); handleDelete(m.id); }}>Delete</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

      </div>

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h3>{editingMember ? 'Edit Member' : 'Add New Member'}</h3>
            {error && <p className="form-error">{error}</p>}
            <div className="form-group"><label>Full Name</label><input className="input-field" value={form.name} onChange={e => setForm({...form, name: e.target.value})} /></div>
            <div className="form-group"><label>Contact</label><input type="tel" className="input-field" placeholder="09XXXXXXXXX" value={form.contact} onChange={e => handleContactChange(e.target.value)} maxLength={11} /></div>
            <div className="form-group"><label>Address</label><input className="input-field" value={form.address} onChange={e => setForm({...form, address: e.target.value})} /></div>
            <div className="form-group"><label>Plan</label>
              <select className="input-field" value={form.plan} onChange={e => {
                const newPlan = e.target.value;
                setForm({ ...form, plan: newPlan, expiry_date: calcExpiry(newPlan, form.joined_date), membership_expiry: calcMembershipExpiry(newPlan, form.joined_date) });
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
            <div className="form-group"><label>Joined Date</label><input type="date" className="input-field" value={form.joined_date} onChange={e => {
              const newDate = e.target.value;
              setForm({ ...form, joined_date: newDate, expiry_date: calcExpiry(form.plan, newDate), membership_expiry: calcMembershipExpiry(form.plan, newDate) });
            }} /></div>
            <div className="form-group">
              <label>Plan Expiry Date</label>
              <input 
                type="date" 
                className="input-field" 
                value={form.expiry_date} 
                onChange={e => setForm({ ...form, expiry_date: e.target.value })} 
              />
            </div>
            {!form.plan.includes('Non-Member') && (
              <div className="form-group">
                <label>Annual Membership Expiry</label>
                <input 
                  type="date" 
                  className="input-field" 
                  value={form.membership_expiry} 
                  onChange={e => setForm({ ...form, membership_expiry: e.target.value })} 
                />
              </div>
            )}
            <div className="modal-actions">
              <button className="btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
              <button className="btn-primary" onClick={handleSave}>{editingMember ? 'Update' : 'Add Member'}</button>
            </div>
          </div>
        </div>
      )}

      {showDetailsModal && detailsMember && (
        <div className="modal-overlay" onClick={() => setShowDetailsModal(false)}>
          <div className="modal-content details-modal" onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--glass-border)', paddingBottom: '0.75rem', marginBottom: '1.25rem' }}>
              <h3 style={{ margin: 0 }}>
                Member Details: {detailsMember.name}
              </h3>
              <button 
                onClick={() => setShowDetailsModal(false)}
                style={{ 
                  background: 'none', 
                  border: 'none', 
                  color: 'var(--text-muted)', 
                  fontSize: '1.5rem', 
                  cursor: 'pointer',
                  padding: '0 0.5rem',
                  lineHeight: 1
                }}
              >
                &times;
              </button>
            </div>

            {error && <div className="toast error" style={{ marginBottom: '1rem' }}>{error}</div>}

            <div className="details-layout-grid">
              {/* Left Column: Info & Renewal Forms */}
              <div>
                <h4 style={{ margin: '0 0 0.75rem 0', color: 'var(--text-muted)', textTransform: 'uppercase', fontSize: '0.75rem', letterSpacing: '0.5px' }}>Member Information</h4>
                
                <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '0.6rem', marginBottom: '1.5rem', fontSize: '0.9rem', background: 'rgba(255,255,255,0.02)', padding: '1rem', borderRadius: '8px', border: '1px solid var(--glass-border)' }}>
                  <p style={{ margin: 0 }}><span style={{ color: 'var(--text-muted)' }}>Member ID:</span> <strong>{detailsMember.member_id}</strong></p>
                  <p style={{ margin: 0 }}><span style={{ color: 'var(--text-muted)' }}>Contact:</span> {detailsMember.contact}</p>
                  <p style={{ margin: 0 }}><span style={{ color: 'var(--text-muted)' }}>Address:</span> {detailsMember.address || '-'}</p>
                  <p style={{ margin: 0 }}><span style={{ color: 'var(--text-muted)' }}>Status:</span> <span className={`badge ${detailsMember.status.replace(' ', '-').toLowerCase()}`} style={{ display: 'inline-block' }}>{detailsMember.status}</span></p>
                  <p style={{ margin: 0 }}><span style={{ color: 'var(--text-muted)' }}>Joined Date:</span> {detailsMember.joined_date || '-'}</p>
                  <p style={{ margin: 0 }}><span style={{ color: 'var(--text-muted)' }}>Plan:</span> {detailsMember.plan}</p>
                  <p style={{ margin: 0 }}><span style={{ color: 'var(--text-muted)' }}>Plan Expiry:</span> {detailsMember.expiry_date || '-'}</p>
                  {!detailsMember.plan.includes('Non-Member') && (
                    <p style={{ margin: 0 }}><span style={{ color: 'var(--text-muted)' }}>Annual Expiry:</span> {detailsMember.membership_expiry || '-'}</p>
                  )}
                </div>

                <h4 style={{ margin: '0 0 0.75rem 0', color: 'var(--text-muted)', textTransform: 'uppercase', fontSize: '0.75rem', letterSpacing: '0.5px' }}>Actions</h4>
                <div className="action-buttons-group">
                  <button className="btn-secondary" style={{ flex: 1, fontSize: '0.85rem', padding: '8px 12px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }} onClick={() => startRenewPlan(detailsMember)}>
                    🔄 Renew Plan
                  </button>
                  {!detailsMember.plan.includes('Non-Member') && (
                    <button className="btn-secondary" style={{ flex: 1, fontSize: '0.85rem', padding: '8px 12px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }} onClick={() => startRenewMembership(detailsMember)}>
                      ⭐ Renew Annual
                    </button>
                  )}
                </div>

                {/* Renewal Panel */}
                {renewalType === 'plan' && (
                  <div style={{ background: 'color-mix(in srgb, var(--brand-accent) 4%, transparent)', border: '1px solid color-mix(in srgb, var(--brand-accent) 20%, transparent)', borderRadius: '12px', padding: '1.25rem', marginBottom: '1rem' }}>
                    <h5 style={{ margin: '0 0 1rem 0', color: 'var(--brand-accent)', fontWeight: 600, fontSize: '0.95rem' }}>Plan Renewal</h5>
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
                          setRenewalForm({ ...renewalForm, start_date: d, membership_expiry: calcMembershipExpiry(detailsMember.plan, d) });
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

              {/* Right Column: Check-in History (Separated by border) */}
              <div style={{ borderLeft: '1px solid var(--glass-border)', paddingLeft: '2rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '0.5rem', marginBottom: '1.25rem' }}>
                  <h4 style={{ margin: 0 }}>Check-In History</h4>
                  <div className="segmented-control">
                    <button 
                      className={`segment-btn ${historyTab === 'calendar' ? 'active' : ''}`}
                      onClick={() => setHistoryTab('calendar')}
                    >
                      Calendar
                    </button>
                    <button 
                      className={`segment-btn ${historyTab === 'list' ? 'active' : ''}`}
                      onClick={() => setHistoryTab('list')}
                    >
                      List
                    </button>
                  </div>
                </div>

                {loadingCheckIns ? (
                  <div style={{ textAlign: 'center', padding: '2rem 0', color: 'var(--text-muted)' }}>Loading check-ins...</div>
                ) : historyTab === 'calendar' ? (
                  <div className="calendar-container">
                    <div className="calendar-header">
                      <button className="calendar-nav-btn" onClick={prevMonth}>&larr;</button>
                      <span className="calendar-month-title">{monthNames[calendarMonth]} {calendarYear}</span>
                      <button className="calendar-nav-btn" onClick={nextMonth}>&rarr;</button>
                    </div>
                    
                    <div className="calendar-weekdays">
                      <div>Sun</div><div>Mon</div><div>Tue</div><div>Wed</div><div>Thu</div><div>Fri</div><div>Sat</div>
                    </div>
                    
                    <div className="calendar-grid">
                      {Array.from({ length: firstDayIndex }).map((_, i) => (
                        <div key={`empty-${i}`} className="calendar-day empty"></div>
                      ))}
                      
                       {Array.from({ length: daysInMonth }).map((_, i) => {
                         const day = i + 1;
                         const dateStr = `${calendarYear}-${String(calendarMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                         const hasCheckIn = memberCheckIns.some(c => c.date === dateStr);
                         const isSelected = selectedCalendarDate === dateStr;
                         
                         return (
                           <div 
                             key={`day-${day}`} 
                             className={`calendar-day ${hasCheckIn ? 'checked-in' : ''} ${isSelected ? 'selected' : ''}`}
                             onClick={() => handleDayClick(dateStr, hasCheckIn)}
                           >
                             <span className="day-number">{day}</span>
                             {hasCheckIn && <span className="checkin-dot"></span>}
                           </div>
                         );
                       })}
                    </div>

                    {selectedCalendarDate && (() => {
                      const selectedCheckIn = memberCheckIns.find(c => c.date === selectedCalendarDate);
                      return (
                        <div className={`calendar-detail-card ${selectedCheckIn ? 'has-data' : 'no-data'}`} style={{ marginTop: '1rem' }}>
                          {selectedCheckIn ? (
                            <>
                              <div style={{ fontWeight: 600, fontSize: '0.8rem', textTransform: 'uppercase', color: 'var(--brand-accent)', letterSpacing: '0.5px', marginBottom: '8px' }}>
                                Checked In on {selectedCalendarDate}
                              </div>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div>
                                  <p style={{ margin: 0, fontSize: '0.9rem' }}>
                                    <span style={{ color: 'var(--text-muted)' }}>Time-In:</span> <strong>{selectedCheckIn.time}</strong>
                                  </p>
                                </div>
                                <div>
                                  <span className={`badge ${selectedCheckIn.status.replace(' ', '-').toLowerCase()}`} style={{ fontSize: '0.75rem', padding: '2px 8px' }}>
                                    {selectedCheckIn.status}
                                  </span>
                                </div>
                              </div>
                            </>
                          ) : (
                            <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', fontStyle: 'italic', textAlign: 'center', padding: '0.5rem 0' }}>
                              No check-in record on {selectedCalendarDate}
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                ) : memberCheckIns.length > 0 ? (
                  <div className="table-container" style={{ maxHeight: '280px', overflowY: 'auto' }}>
                    <table style={{ fontSize: '0.9rem' }}>
                      <thead>
                        <tr><th>Date</th><th>Time</th><th>Status</th></tr>
                      </thead>
                      <tbody>
                        {memberCheckIns.map(c => (
                          <tr key={c.id}>
                            <td>{c.date}</td>
                            <td>{c.time}</td>
                            <td><span className={`badge ${c.status.replace(' ', '-').toLowerCase()}`}>{c.status}</span></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div style={{ textAlign: 'center', padding: '2rem 0', color: 'var(--text-muted)', fontSize: '0.9rem', border: '1px dashed var(--glass-border)', borderRadius: '8px' }}>
                    No check-in history found.
                  </div>
                )}
              </div>
            </div>

            <div className="modal-actions" style={{ marginTop: '1.5rem', borderTop: '1px solid var(--glass-border)', paddingTop: '1rem' }}>
              <button className="btn-primary" onClick={() => setShowDetailsModal(false)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
