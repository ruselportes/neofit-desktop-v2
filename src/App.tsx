import { useState, useEffect } from 'react';
import { Home, Users, Monitor, DollarSign, TrendingUp, Sun, Moon, LogOut } from 'lucide-react';
import './index.css';

// Import Views
import DashboardView from './views/DashboardView.tsx';
import MembersView from './views/MembersView.tsx';
import AttendanceView from './views/AttendanceView.tsx';

import RatesView from './views/RatesView.tsx';
import RevenueView from './views/RevenueView.tsx';
import LoginView from './views/LoginView.tsx';
import AccountModal from './views/AccountModal.tsx';
import * as api from './api';

// --- Main App ---
function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [theme, setTheme] = useState<string>(() => {
    const saved = localStorage.getItem('theme');
    return saved || 'dark';
  });
  const [token, setToken] = useState<string | null>(localStorage.getItem('token'));
  const [role, setRole] = useState<string | null>(localStorage.getItem('role'));
  const [notification, setNotification] = useState<{ message: string, type: 'success' | 'error' } | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() => {
    return localStorage.getItem('sidebarCollapsed') === 'true';
  });
  const [sidebarWidth, setSidebarWidth] = useState<number>(() => {
    const saved = localStorage.getItem('sidebarWidth');
    return saved ? parseInt(saved, 10) : 320;
  });
  const [isResizing, setIsResizing] = useState(false);
  const [showAccountModal, setShowAccountModal] = useState(false);
  const [currentUser, setCurrentUser] = useState<{ id: number; email: string; role: string } | null>(null);

  const startResizing = (mouseDownEvent: React.MouseEvent) => {
    mouseDownEvent.preventDefault();
    setIsResizing(true);
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;
      let newWidth = e.clientX;
      if (newWidth < 150) {
        setSidebarCollapsed(true);
        setIsResizing(false);
      } else {
        setSidebarCollapsed(false);
        if (newWidth > 400) newWidth = 400; // upper limit
        setSidebarWidth(newWidth);
        localStorage.setItem('sidebarWidth', String(newWidth));
      }
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    if (isResizing) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing]);

  const toggleSidebarCollapse = () => {
    setSidebarCollapsed(prev => {
      localStorage.setItem('sidebarCollapsed', String(!prev));
      return !prev;
    });
  };

  const showNotification = (message: string, type: 'success' | 'error' = 'success') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 3000);
  };

  const handleLogin = (newToken: string, newRole: string) => {
    localStorage.setItem('token', newToken);
    localStorage.setItem('role', newRole);
    setToken(newToken);
    setRole(newRole);
  };

  const handleEmailChange = (newToken: string) => {
    localStorage.setItem('token', newToken);
    setToken(newToken);
    fetchCurrentUser();
  };

  const fetchCurrentUser = async () => {
    try {
      const user = await api.fetchCurrentUser();
      setCurrentUser(user);
    } catch {
      setCurrentUser(null);
    }
  };

  useEffect(() => {
    if (token) {
      fetchCurrentUser();
    } else {
      setCurrentUser(null);
    }
  }, [token]);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    localStorage.setItem('theme', theme);
    // Tell Electron main process to switch native title bar theme
    const api = (window as unknown as { electronAPI?: { setNativeTheme?: (theme: string) => void } }).electronAPI;
    if (api?.setNativeTheme) {
      api.setNativeTheme(theme);
    }
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => prev === 'dark' ? 'light' : 'dark');
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('role');
    setToken(null);
    setRole(null);
    setActiveTab('dashboard');
  };

  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard': return <DashboardView onNavigate={setActiveTab} role={role} />;
      case 'members': return <MembersView role={role} showNotification={showNotification} />;
      case 'attendance': return <AttendanceView showNotification={showNotification} />;
      case 'rates': return <RatesView />;
      case 'revenue': return <RevenueView />;
      default: return <DashboardView onNavigate={setActiveTab} role={role} />;
    }
  };

  if (!token) {
    return <LoginView onLogin={handleLogin} />;
  }

  return (
    <div className="app-container">
      {/* Mobile Top Header */}
      <header className="mobile-header">
        <button className="menu-toggle" onClick={() => setIsSidebarOpen(true)} aria-label="Open menu">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="3" y1="12" x2="21" y2="12"></line>
            <line x1="3" y1="6" x2="21" y2="6"></line>
            <line x1="3" y1="18" x2="21" y2="18"></line>
          </svg>
        </button>
        <div className="brand" style={{ marginBottom: 0 }}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="6" y="11" width="12" height="2" fill="var(--brand-accent)" />
            <rect x="3" y="7" width="3" height="10" rx="1" fill="var(--brand-accent)" />
            <rect x="18" y="7" width="3" height="10" rx="1" fill="var(--brand-accent)" />
            <rect x="1" y="9" width="2" height="6" rx="0.5" fill="var(--brand-accent)" opacity="0.7"/>
            <rect x="21" y="9" width="2" height="6" rx="0.5" fill="var(--brand-accent)" opacity="0.7"/>
          </svg>
          <h1 style={{ fontSize: '1.25rem' }}>NEO<span className="brand-accent">FIT</span></h1>
        </div>
        <div style={{ width: 24 }}></div> {/* Spacer to center the logo */}
      </header>

      {/* Sidebar Overlay for Mobile */}
      <div className={`sidebar-overlay ${isSidebarOpen ? 'show' : ''}`} onClick={() => setIsSidebarOpen(false)}></div>

      <aside 
        className={`sidebar ${isSidebarOpen ? 'open' : ''} ${sidebarCollapsed ? 'collapsed' : ''}`}
        style={{ 
          width: sidebarCollapsed ? undefined : `${sidebarWidth}px`,
          transition: isResizing ? 'none' : undefined 
        }}
      >
        <div className="sidebar-header">
          <div className="brand" onClick={toggleSidebarCollapse} style={{ cursor: 'pointer' }} title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect x="6" y="11" width="12" height="2" fill="var(--brand-accent)" />
              <rect x="3" y="7" width="3" height="10" rx="1" fill="var(--brand-accent)" />
              <rect x="18" y="7" width="3" height="10" rx="1" fill="var(--brand-accent)" />
              <rect x="1" y="9" width="2" height="6" rx="0.5" fill="var(--brand-accent)" opacity="0.7"/>
              <rect x="21" y="9" width="2" height="6" rx="0.5" fill="var(--brand-accent)" opacity="0.7"/>
            </svg>
            <h1>NEO<span className="brand-accent">FIT</span></h1>
          </div>
          <button className="sidebar-close" onClick={() => setIsSidebarOpen(false)} aria-label="Close menu">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
        <ul className="nav-links">
          {(['dashboard', 'members', 'attendance', 'rates', 'revenue'] as const).map(tab => {
            const iconMap: Record<string, React.ReactNode> = {
              dashboard: <Home size={18} />,
              members: <Users size={18} />,
              attendance: <Monitor size={18} />,
              rates: <DollarSign size={18} />,
              revenue: <TrendingUp size={18} />,
            };
            return (
              <li 
                key={tab} 
                className={`nav-item ${activeTab === tab ? 'active' : ''}`} 
                onClick={() => { setActiveTab(tab); setIsSidebarOpen(false); }}
                title={sidebarCollapsed ? tab.charAt(0).toUpperCase() + tab.slice(1) : undefined}
              >
                <span className="nav-icon">{iconMap[tab]}</span>
                <span className="nav-label">{tab.charAt(0).toUpperCase() + tab.slice(1)}</span>
              </li>
            );
          })}
        </ul>
        
        <div className="sidebar-footer">
          <button 
            className="sidebar-action-btn" 
            onClick={() => { toggleTheme(); setIsSidebarOpen(false); }}
            title={sidebarCollapsed ? (theme === 'dark' ? 'Light Mode' : 'Dark Mode') : undefined}
          >
            <span className="nav-icon">{theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}</span>
            <span className="nav-label">{theme === 'dark' ? 'Light Mode' : 'Dark Mode'}</span>
          </button>

          <button 
            className="sidebar-action-btn" 
            onClick={() => { handleLogout(); setIsSidebarOpen(false); }}
            style={{ color: 'var(--danger)' }}
            title={sidebarCollapsed ? 'Logout' : undefined}
          >
            <span className="nav-icon"><LogOut size={18} /></span>
            <span className="nav-label">Logout</span>
          </button>

          {currentUser && (
            <div className="sidebar-user">
              <button
                className="avatar-btn"
                onClick={() => { setShowAccountModal(true); setIsSidebarOpen(false); }}
                title={currentUser.email}
              >
                {currentUser.email.charAt(0).toUpperCase()}
              </button>
              <span className="user-email">{currentUser.email}</span>
            </div>
          )}
        </div>

        {/* Vertical Resize Handle */}
        <div 
          className="sidebar-resize-handle" 
          onMouseDown={startResizing} 
        />
      </aside>
      <main className="main-content">{renderContent()}</main>
      
      {notification && (
        <div style={{
          position: 'fixed',
          top: '20px',
          right: '20px',
          background: notification.type === 'success' ? '#4caf50' : '#f44336',
          color: 'white',
          padding: '1rem 1.5rem',
          borderRadius: '8px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          zIndex: 10000,
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem'
        }}>
          {notification.type === 'success' ? '✅' : '❌'}
          {notification.message}
        </div>
      )}

      {showAccountModal && currentUser && (
        <AccountModal
          email={currentUser.email}
          onClose={() => setShowAccountModal(false)}
          onEmailChange={handleEmailChange}
          showNotification={showNotification}
        />
      )}
    </div>
  );
}

export default App;
