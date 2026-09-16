import bcrypt from 'bcryptjs';
import { AdminUser } from '../models/index.js';
import { ALL_PERMISSIONS } from '../config/permissions.js';
import config from '../config/index.js';

/**
 * Admins cannot self-register, so the first super admin is created here from
 * the values in `.env`. Runs on every boot but only ever inserts once.
 */
export const ensureSuperAdmin = async () => {
  const existing = await AdminUser.findOne({ where: { role: 'super_admin' } });

  if (existing) {
    // Keep the seeded account at full access even if the catalogue grows.
    if ((existing.permissions || []).length !== ALL_PERMISSIONS.length) {
      await existing.update({ permissions: ALL_PERMISSIONS });
    }
    return existing;
  }

  const admin = await AdminUser.create({
    name: config.superAdmin.name,
    email: config.superAdmin.email,
    passwordHash: await bcrypt.hash(config.superAdmin.password, 12),
    role: 'super_admin',
    permissions: ALL_PERMISSIONS,
    jobTitle: 'Owner',
    isActive: true,
  });

  console.log('----------------------------------------------------');
  console.log(' Super admin created');
  console.log(`   email:    ${config.superAdmin.email}`);
  console.log(`   password: ${config.superAdmin.password}`);
  console.log(' Change this password after your first sign in.');
  console.log('----------------------------------------------------');

  return admin;
};

export default ensureSuperAdmin;
