import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { Op } from 'sequelize';
import { AdminUser } from '../../models/index.js';
import {
  PERMISSION_MODULES,
  ALL_PERMISSIONS,
  DEFAULT_STAFF_PERMISSIONS,
  sanitizePermissions,
} from '../../config/permissions.js';
import { serializeAdmin } from '../../helpers/serializers.js';
import { revokeAllForActor } from '../../helpers/token.js';
import { getPagination, buildMeta } from '../../utils/pagination.js';
import { toPublicUrl, removeUpload } from '../../middleware/upload.js';
import { sendStaffInviteEmail } from '../../services/email.service.js';
import AppError from '../../utils/AppError.js';
import asyncHandler from '../../utils/asyncHandler.js';

const SALT_ROUNDS = 12;

/** Readable temporary password that still satisfies the password policy. */
const generateTempPassword = () =>
  `Rs${crypto.randomBytes(4).toString('hex')}${crypto.randomInt(10, 99)}A`;

export const getPermissionCatalogue = asyncHandler(async (req, res) => {
  res.json({
    success: true,
    data: { modules: PERMISSION_MODULES, defaults: DEFAULT_STAFF_PERMISSIONS },
  });
});

export const listStaff = asyncHandler(async (req, res) => {
  const { page, limit, offset } = getPagination(req.query, 15);
  const where = {};

  if (req.query.search) {
    const term = `%${req.query.search.trim()}%`;
    where[Op.or] = [
      { name: { [Op.like]: term } },
      { email: { [Op.like]: term } },
      { jobTitle: { [Op.like]: term } },
    ];
  }

  if (req.query.role) where.role = req.query.role;
  if (req.query.status === 'active') where.isActive = true;
  if (req.query.status === 'disabled') where.isActive = false;

  const { rows, count } = await AdminUser.findAndCountAll({
    where,
    include: [{ model: AdminUser, as: 'createdBy', attributes: ['id', 'name'] }],
    order: [
      ['role', 'ASC'],
      ['createdAt', 'DESC'],
    ],
    limit,
    offset,
  });

  res.json({
    success: true,
    data: rows.map((row) => ({
      ...serializeAdmin(row),
      createdBy: row.createdBy ? { id: row.createdBy.id, name: row.createdBy.name } : null,
    })),
    meta: buildMeta({ count, page, limit }),
  });
});

export const getStaff = asyncHandler(async (req, res) => {
  const staff = await AdminUser.findByPk(req.params.id, {
    include: [{ model: AdminUser, as: 'createdBy', attributes: ['id', 'name'] }],
  });

  if (!staff) throw new AppError('Staff member not found', 404);

  res.json({
    success: true,
    data: {
      staff: serializeAdmin(staff),
      modules: PERMISSION_MODULES,
    },
  });
});

/**
 * Create a staff account. Only the super admin can reach this route, and only
 * the super admin may grant full access by choosing the `super_admin` role.
 */
export const createStaff = asyncHandler(async (req, res) => {
  const { name, email, phone, jobTitle, role = 'staff', fullAccess } = req.body;

  const existing = await AdminUser.findOne({ where: { email } });
  if (existing) {
    throw new AppError('A staff account with that email already exists', 409, [
      { field: 'email', message: 'Email already in use' },
    ]);
  }

  if (!['staff', 'super_admin'].includes(role)) {
    throw new AppError('Choose a valid role', 422);
  }

  const permissions =
    role === 'super_admin'
      ? ALL_PERMISSIONS
      : fullAccess === true || fullAccess === 'true'
        ? ALL_PERMISSIONS
        : sanitizePermissions(req.body.permissions);

  const tempPassword = req.body.password || generateTempPassword();

  const staff = await AdminUser.create({
    name,
    email,
    phone: phone || null,
    jobTitle: jobTitle || null,
    role,
    permissions,
    passwordHash: await bcrypt.hash(tempPassword, SALT_ROUNDS),
    mustChangePassword: !req.body.password,
    createdById: req.admin.id,
    avatar: req.file ? toPublicUrl(req.file) : null,
  });

  await sendStaffInviteEmail(staff.email, staff.name, tempPassword);

  res.status(201).json({
    success: true,
    message: `${staff.name} can now sign in. Their temporary password has been emailed.`,
    data: {
      staff: serializeAdmin(staff),
      // Surfaced once so the super admin can pass it on directly if needed.
      temporaryPassword: req.body.password ? undefined : tempPassword,
    },
  });
});

export const updateStaff = asyncHandler(async (req, res) => {
  const staff = await AdminUser.findByPk(req.params.id);
  if (!staff) throw new AppError('Staff member not found', 404);

  if (staff.role === 'super_admin' && staff.id !== req.admin.id) {
    throw new AppError('Another super admin account cannot be edited here', 403);
  }

  const updates = {};
  if (req.body.name !== undefined) updates.name = req.body.name;
  if (req.body.phone !== undefined) updates.phone = req.body.phone;
  if (req.body.jobTitle !== undefined) updates.jobTitle = req.body.jobTitle;

  if (req.body.email !== undefined && req.body.email !== staff.email) {
    const clash = await AdminUser.findOne({ where: { email: req.body.email } });
    if (clash) throw new AppError('That email is already in use', 409);
    updates.email = req.body.email;
  }

  // The super admin must not demote or lock out their own account.
  if (staff.id !== req.admin.id) {
    if (req.body.role !== undefined) {
      if (!['staff', 'super_admin'].includes(req.body.role)) {
        throw new AppError('Choose a valid role', 422);
      }
      updates.role = req.body.role;
    }

    if (req.body.isActive !== undefined) {
      updates.isActive = req.body.isActive === true || req.body.isActive === 'true';
    }

    const targetRole = updates.role || staff.role;
    if (targetRole === 'super_admin') {
      updates.permissions = ALL_PERMISSIONS;
    } else if (req.body.fullAccess === true || req.body.fullAccess === 'true') {
      updates.permissions = ALL_PERMISSIONS;
    } else if (req.body.permissions !== undefined) {
      updates.permissions = sanitizePermissions(req.body.permissions);
    }
  }

  const previousAvatar = staff.avatar;
  if (req.file) updates.avatar = toPublicUrl(req.file);

  await staff.update(updates);
  if (req.file) removeUpload(previousAvatar);

  // Losing rights or being disabled should take effect immediately.
  if (updates.permissions || updates.role || updates.isActive === false) {
    await revokeAllForActor('admin', staff.id);
  }

  res.json({
    success: true,
    message: `${staff.name} updated`,
    data: serializeAdmin(staff),
  });
});

export const updateStaffPermissions = asyncHandler(async (req, res) => {
  const staff = await AdminUser.findByPk(req.params.id);
  if (!staff) throw new AppError('Staff member not found', 404);

  if (staff.id === req.admin.id) {
    throw new AppError('You cannot change your own permissions', 403);
  }

  if (staff.role === 'super_admin') {
    throw new AppError('Super admins always have full access', 409);
  }

  const permissions =
    req.body.fullAccess === true || req.body.fullAccess === 'true'
      ? ALL_PERMISSIONS
      : sanitizePermissions(req.body.permissions);

  await staff.update({ permissions });
  await revokeAllForActor('admin', staff.id);

  res.json({
    success: true,
    message: `Permissions updated for ${staff.name}`,
    data: serializeAdmin(staff),
  });
});

export const resetStaffPassword = asyncHandler(async (req, res) => {
  const staff = await AdminUser.findByPk(req.params.id);
  if (!staff) throw new AppError('Staff member not found', 404);

  const tempPassword = generateTempPassword();

  await staff.update({
    passwordHash: await bcrypt.hash(tempPassword, SALT_ROUNDS),
    mustChangePassword: true,
  });

  await revokeAllForActor('admin', staff.id);
  await sendStaffInviteEmail(staff.email, staff.name, tempPassword);

  res.json({
    success: true,
    message: `A new temporary password has been emailed to ${staff.name}`,
    data: { temporaryPassword: tempPassword },
  });
});

export const deleteStaff = asyncHandler(async (req, res) => {
  const staff = await AdminUser.findByPk(req.params.id);
  if (!staff) throw new AppError('Staff member not found', 404);

  if (staff.id === req.admin.id) {
    throw new AppError('You cannot delete your own account', 403);
  }

  if (staff.role === 'super_admin') {
    const superAdminCount = await AdminUser.count({ where: { role: 'super_admin' } });
    if (superAdminCount <= 1) {
      throw new AppError('The last super admin account cannot be deleted', 409);
    }
  }

  const avatar = staff.avatar;
  await revokeAllForActor('admin', staff.id);
  await staff.destroy();
  removeUpload(avatar);

  res.json({ success: true, message: `${staff.name} removed` });
});
