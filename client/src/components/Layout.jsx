import { NavLink, Outlet, useLocation } from 'react-router-dom';

const navItems = [
  { section: 'Overview', items: [
    { path: '/', icon: '📊', label: 'Dashboard' },
    { path: '/map', icon: '🗺️', label: 'Crime Map' },
  ]},
  { section: 'Analysis', items: [
    { path: '/analytics', icon: '📈', label: 'Analytics' },
    { path: '/predictions', icon: '🔮', label: 'Predictions' },
    { path: '/ai-analyst', icon: '🤖', label: 'AI Analyst' },
    { path: '/copilot', icon: '🕵️', label: 'Investigation Copilot' },
  ]},
  { section: 'Operations', items: [
    { path: '/reports', icon: '📋', label: 'Reports' },
  ]},
];

const adminItems = { section: 'Administration', items: [
  { path: '/admin', icon: '⚙️', label: 'User Management' },
]};

export default function Layout({ user, onLogout }) {
  const location = useLocation();
  const allSections = (user.role === 'super_admin' || user.role === 'ADMIN') ? [...navItems, adminItems] : navItems;

  return (
    <div className="app-layout">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="sidebar-brand-icon">KSP</div>
          <div className="sidebar-brand-text">
            <h1>Crime Intelligence</h1>
            <span>Karnataka Police</span>
          </div>
        </div>

        <nav className="sidebar-nav">
          {allSections.map(section => (
            <div className="sidebar-section" key={section.section}>
              <div className="sidebar-section-title">{section.section}</div>
              {section.items.map(item => (
                <NavLink
                  key={item.path}
                  to={item.path}
                  end={item.path === '/'}
                  className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
                >
                  <span className="sidebar-link-icon">{item.icon}</span>
                  {item.label}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        <div className="sidebar-user">
          <div className="sidebar-user-avatar">
            {user.full_name?.charAt(0) || 'U'}
          </div>
          <div className="sidebar-user-info">
            <div className="sidebar-user-name">{user.full_name}</div>
            <div className="sidebar-user-role">{user.role?.replace('_', ' ')}</div>
          </div>
          <button className="sidebar-logout-btn" onClick={onLogout} title="Logout">⏻</button>
        </div>
      </aside>

      <main className="main-content">
        <Outlet />
      </main>
    </div>
  );
}
