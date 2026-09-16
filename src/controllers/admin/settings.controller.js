import { getStoreSettings, updateStoreSettings } from '../../services/settings.service.js';
import asyncHandler from '../../utils/asyncHandler.js';

export const getSettings = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await getStoreSettings() });
});

export const patchSettings = asyncHandler(async (req, res) => {
  const data = await updateStoreSettings(req.body);

  res.json({
    success: true,
    message: 'Shop settings updated',
    data,
  });
});
