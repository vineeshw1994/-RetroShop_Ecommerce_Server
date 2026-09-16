import bcrypt from 'bcryptjs';
import { AdminUser } from '../../models/index.js';
import { serializeAdmin } from '../../helpers/serializers.js';
import { revokeAllForActor } from '../../helpers/token.js';
import { toPublicUrl, removeUpload } from '../../middleware/upload.js';
import AppError from '../../utils/AppError.js';
import asyncHandler from '../../utils/asyncHandler.js';

const SALT_ROUNDS = 12;

export const updateProfile = asyncHandler(async (req, res) => {
  const admin = await AdminUser.findByPk(req.admin.id);

  const updates = {};
  if (req.body.name !== undefined) updates.name = req.body.name;
  if (req.body.phone !== undefined) updates.phone = req.body.phone;
  if (req.body.jobTitle !== undefined) updates.jobTitle = req.body.jobTitle;

  if (req.body.email !== undefined && req.body.email !== admin.email) {
    const clash = await AdminUser.findOne({ where: { email: req.body.email } });
    if (clash) throw new AppError('That email is already in use', 409);
    updates.email = req.body.email;
  }

  await admin.update(updates);

  res.json({
    success: true,
    message: 'Profile updated',
    data: { admin: serializeAdmin(admin) },
  });
});

export const updateAvatar = asyncHandler(async (req, res) => {
  if (!req.file) throw new AppError('Please choose an image', 400);

  const admin = await AdminUser.findByPk(req.admin.id);
  const previous = admin.avatar;

  await admin.update({ avatar: toPublicUrl(req.file) });
  removeUpload(previous);

  res.json({
    success: true,
    message: 'Photo updated',
    data: { admin: serializeAdmin(admin) },
  });
});

export const changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  const admin = await AdminUser.scope('withPassword').findByPk(req.admin.id);

  if (!(await bcrypt.compare(currentPassword, admin.passwordHash))) {
    throw new AppError('Your current password is incorrect', 400, [
      { field: 'currentPassword', message: 'Incorrect password' },
    ]);
  }

  await admin.update({
    passwordHash: await bcrypt.hash(newPassword, SALT_ROUNDS),
    mustChangePassword: false,
  });

  await revokeAllForActor('admin', admin.id);

  res.json({
    success: true,
    message: 'Password changed. Please sign in again.',
  });
});
