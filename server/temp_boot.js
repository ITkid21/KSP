const { initializeLocalApp } = require('./utils/localCatalyst');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

async function run() {
  try {
    const app = await initializeLocalApp();
    const TABLE = 'system_users';
    const ADMIN = {
      id: uuidv4(),
      username: 'ksp_admin',
      email: 'admin@ksp.gov.in',
      password: 'KSP@Admin2024!',
      full_name: 'System Administrator',
      badge_number: 'KSP-ADMIN-001',
      department: 'IT Cell',
      role: 'ADMIN',
    };

    const password_hash = await bcrypt.hash(ADMIN.password, 12);
    const now = new Date().toISOString();
    
    const rowData = {
      id:           ADMIN.id,
      username:     ADMIN.username,
      email:        ADMIN.email,
      password_hash,
      full_name:    ADMIN.full_name,
      role:         ADMIN.role,
      department:   ADMIN.department,
      badge_number: ADMIN.badge_number,
      is_active:    true,
      created_at:   now,
      updated_at:   now,
      last_login:   null,
    };

    const table = app.datastore().table(TABLE);
    await table.insertRow(rowData);
    console.log('SUCCESS_ADMIN_CREATED');
    console.log(JSON.stringify(ADMIN));
  } catch (e) {
    console.error("ERROR", e);
  }
}
run();
