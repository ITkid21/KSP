import { useState, useEffect } from 'react';

const API_URL = '/api';

export default function Admin() {
  const [activeTab, setActiveTab] = useState('users'); // 'users' or 'audit'
  const [users, setUsers] = useState([]);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddUser, setShowAddUser] = useState(false);
  const [newUser, setNewUser] = useState({ username: '', password: '', email: '', full_name: '', role: 'officer', department: '', badge_number: '' });

  const fetchData = async () => {
    setLoading(true);
    const token = localStorage.getItem('ksp_token');
    const headers = { 'Authorization': `Bearer ${token}` };
    try {
      if (activeTab === 'users') {
        const res = await fetch(`${API_URL}/auth/users`, { headers });
        if (res.ok) setUsers(await res.json());
      } else {
        const res = await fetch(`${API_URL}/analytics/audit-logs?limit=100`, { headers });
        if (res.ok) {
          const data = await res.json();
          setLogs(data.logs);
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [activeTab]);

  const handleAddUser = async (e) => {
    e.preventDefault();
    const token = localStorage.getItem('ksp_token');
    try {
      const res = await fetch(`${API_URL}/auth/register`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(newUser)
      });
      if (res.ok) {
        alert('User created successfully');
        setShowAddUser(false);
        setNewUser({ username: '', password: '', email: '', full_name: '', role: 'officer', department: '', badge_number: '' });
        fetchData();
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to create user');
      }
    } catch (err) {
      alert('Error creating user');
    }
  };

  const handleDeactivate = async (id) => {
    if (!window.confirm('Are you sure you want to deactivate this user?')) return;
    const token = localStorage.getItem('ksp_token');
    try {
      const res = await fetch(`${API_URL}/auth/users/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        fetchData();
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to deactivate user');
      }
    } catch (err) {
      alert('Error deactivating user');
    }
  };

  return (
    <div className="page-body">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <div>
          <h2 style={{ fontSize: '18px', fontWeight: 'bold' }}>Administration Panel</h2>
          <p style={{ fontSize: '12px', color: '#94a3b8' }}>System configuration and access control</p>
        </div>
        {activeTab === 'users' && (
          <button className="btn btn-primary" onClick={() => setShowAddUser(true)}>+ Add User</button>
        )}
      </div>

      <div className="tabs">
        <button className={`tab ${activeTab === 'users' ? 'active' : ''}`} onClick={() => setActiveTab('users')}>User Management</button>
        <button className={`tab ${activeTab === 'audit' ? 'active' : ''}`} onClick={() => setActiveTab('audit')}>System Audit Logs</button>
      </div>

      {loading ? (
        <div className="loading"><div className="spinner"></div>Loading...</div>
      ) : activeTab === 'users' ? (
        <div className="chart-card">
          <div className="data-table-wrapper" style={{ maxHeight: '600px', overflowY: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Full Name</th>
                  <th>Username</th>
                  <th>Role</th>
                  <th>Department</th>
                  <th>Badge #</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map(u => (
                  <tr key={u.id}>
                    <td><strong>{u.full_name}</strong></td>
                    <td>{u.username}</td>
                    <td><span className={`badge badge-${u.role === 'super_admin' ? 'critical' : u.role === 'analyst' ? 'info' : 'success'}`}>{u.role.replace('_', ' ')}</span></td>
                    <td>{u.department || '-'}</td>
                    <td>{u.badge_number || '-'}</td>
                    <td>
                      {u.is_active ? <span className="badge badge-success">Active</span> : <span className="badge badge-critical">Inactive</span>}
                    </td>
                    <td>
                      {u.is_active ? (
                        <button className="btn btn-sm btn-danger" onClick={() => handleDeactivate(u.id)}>Deactivate</button>
                      ) : (
                        <button className="btn btn-sm btn-secondary" disabled>Inactive</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="chart-card">
          <div className="data-table-wrapper" style={{ maxHeight: '600px', overflowY: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>User</th>
                  <th>Action</th>
                  <th>Resource</th>
                  <th>Details</th>
                  <th>IP Address</th>
                </tr>
              </thead>
              <tbody>
                {logs.map(l => (
                  <tr key={l.id}>
                    <td>{new Date(l.created_at).toLocaleString()}</td>
                    <td>{l.full_name || l.username || l.user_id}</td>
                    <td><span className="badge badge-info">{l.action}</span></td>
                    <td>{l.resource}</td>
                    <td>{l.details}</td>
                    <td>{l.ip_address || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showAddUser && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header">
              <h3>Create New User</h3>
              <button className="modal-close" onClick={() => setShowAddUser(false)}>✕</button>
            </div>
            <div className="modal-body">
              <form onSubmit={handleAddUser}>
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Full Name *</label>
                    <input type="text" className="form-input" required value={newUser.full_name} onChange={e => setNewUser({...newUser, full_name: e.target.value})} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Username *</label>
                    <input type="text" className="form-input" required value={newUser.username} onChange={e => setNewUser({...newUser, username: e.target.value})} />
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Email *</label>
                    <input type="email" className="form-input" required value={newUser.email} onChange={e => setNewUser({...newUser, email: e.target.value})} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Password *</label>
                    <input type="password" className="form-input" required value={newUser.password} onChange={e => setNewUser({...newUser, password: e.target.value})} />
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Role</label>
                    <select className="form-select" value={newUser.role} onChange={e => setNewUser({...newUser, role: e.target.value})}>
                      <option value="officer">Police Officer</option>
                      <option value="station_house_officer">Station House Officer</option>
                      <option value="analyst">Crime Analyst</option>
                      <option value="super_admin">Super Admin</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Department</label>
                    <input type="text" className="form-input" value={newUser.department} onChange={e => setNewUser({...newUser, department: e.target.value})} />
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Badge Number</label>
                  <input type="text" className="form-input" value={newUser.badge_number} onChange={e => setNewUser({...newUser, badge_number: e.target.value})} />
                </div>
                <div className="modal-footer" style={{ marginTop: '20px', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                  <button type="button" className="btn btn-secondary" onClick={() => setShowAddUser(false)}>Cancel</button>
                  <button type="submit" className="btn btn-primary">Create User</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
