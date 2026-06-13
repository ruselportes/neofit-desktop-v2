import { useState } from 'react';
import * as api from '../api';
import { Eye, EyeOff } from 'lucide-react';

interface AccountModalProps {
  email: string;
  onClose: () => void;
  onEmailChange: (newToken: string) => void;
  showNotification: (message: string, type: 'success' | 'error') => void;
}

export default function AccountModal({ email, onClose, onEmailChange, showNotification }: AccountModalProps) {
  const [newEmail, setNewEmail] = useState('');
  const [emailPassword, setEmailPassword] = useState('');
  const [emailError, setEmailError] = useState('');
  const [emailSaving, setEmailSaving] = useState(false);
  const [showEmailPassword, setShowEmailPassword] = useState(false);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const handleEmailChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setEmailError('');
    if (!newEmail) { setEmailError('New email is required.'); return; }
    if (!emailPassword) { setEmailError('Please enter your password to confirm.'); return; }
    setEmailSaving(true);
    try {
      const data = await api.changeEmail(newEmail, emailPassword);
      onEmailChange(data.access_token);
      showNotification('Email updated successfully.', 'success');
      onClose();
    } catch (err: unknown) {
      setEmailError(err instanceof Error ? err.message : 'Failed to update email.');
    } finally {
      setEmailSaving(false);
    }
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError('');
    if (!currentPassword) { setPasswordError('Current password is required.'); return; }
    if (!newPassword) { setPasswordError('New password is required.'); return; }
    if (newPassword.length < 6) { setPasswordError('New password must be at least 6 characters.'); return; }
    if (newPassword !== confirmPassword) { setPasswordError('Passwords do not match.'); return; }
    setPasswordSaving(true);
    try {
      await api.changePassword(currentPassword, newPassword);
      showNotification('Password updated successfully.', 'success');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: unknown) {
      setPasswordError(err instanceof Error ? err.message : 'Failed to update password.');
    } finally {
      setPasswordSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose} aria-label="Close">&times;</button>
        <h2 style={{ marginBottom: '1.5rem' }}>Account Settings</h2>

        {/* Change Email */}
        <div className="modal-section">
          <h3 className="modal-section-title">Change Email</h3>
          <form onSubmit={handleEmailChange}>
            <div className="form-group">
              <label>Current Email</label>
              <input type="email" className="input-field" value={email} disabled />
            </div>
            <div className="form-group">
              <label>New Email</label>
              <input type="email" className="input-field" value={newEmail} onChange={e => setNewEmail(e.target.value)} required />
            </div>
            <div className="form-group">
              <label>Password <span style={{ color: 'var(--text-secondary)', fontWeight: 400, fontSize: '0.8rem' }}>(to confirm changes)</span></label>
              <div style={{ position: 'relative' }}>
                <input type={showEmailPassword ? 'text' : 'password'} className="input-field" value={emailPassword} onChange={e => setEmailPassword(e.target.value)} required style={{ paddingRight: '2rem' }} />
                <button type="button" onClick={() => setShowEmailPassword(!showEmailPassword)} style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '4px', display: 'flex' }} tabIndex={-1}>
                  {showEmailPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
            {emailError && <p className="field-error">{emailError}</p>}
            <button type="submit" className="btn-primary" disabled={emailSaving} style={{ marginTop: '0.5rem' }}>
              {emailSaving ? 'Saving...' : 'Update Email'}
            </button>
          </form>
        </div>

        <div className="modal-divider" />

        {/* Change Password */}
        <div className="modal-section">
          <h3 className="modal-section-title">Change Password</h3>
          <form onSubmit={handlePasswordChange}>
            <div className="form-group">
              <label>Current Password</label>
              <div style={{ position: 'relative' }}>
                <input type={showCurrentPassword ? 'text' : 'password'} className="input-field" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} required style={{ paddingRight: '2rem' }} />
                <button type="button" onClick={() => setShowCurrentPassword(!showCurrentPassword)} style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '4px', display: 'flex' }} tabIndex={-1}>
                  {showCurrentPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
            <div className="form-group">
              <label>New Password</label>
              <div style={{ position: 'relative' }}>
                <input type={showNewPassword ? 'text' : 'password'} className="input-field" value={newPassword} onChange={e => setNewPassword(e.target.value)} required minLength={6} style={{ paddingRight: '2rem' }} />
                <button type="button" onClick={() => setShowNewPassword(!showNewPassword)} style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '4px', display: 'flex' }} tabIndex={-1}>
                  {showNewPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
            <div className="form-group">
              <label>Confirm New Password</label>
              <div style={{ position: 'relative' }}>
                <input type={showConfirmPassword ? 'text' : 'password'} className="input-field" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} required style={{ paddingRight: '2rem' }} />
                <button type="button" onClick={() => setShowConfirmPassword(!showConfirmPassword)} style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '4px', display: 'flex' }} tabIndex={-1}>
                  {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
            {passwordError && <p className="field-error">{passwordError}</p>}
            <button type="submit" className="btn-primary" disabled={passwordSaving} style={{ marginTop: '0.5rem' }}>
              {passwordSaving ? 'Saving...' : 'Update Password'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
