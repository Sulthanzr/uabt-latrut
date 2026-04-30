import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const profileBucket = process.env.SUPABASE_PROFILE_BUCKET || 'profile-photos';

if (!supabaseUrl || !supabaseServiceRoleKey) {
  console.warn('[supabase] SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY belum diset.');
}

export const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

export function profilePhotoPath(playerId) {
  return `players/${playerId}/profile.jpg`;
}

export async function uploadProfilePhotoToSupabase({ playerId, buffer, contentType }) {
  const path = profilePhotoPath(playerId);

  const { error } = await supabase.storage
    .from(profileBucket)
    .upload(path, buffer, {
      contentType: contentType || 'image/jpeg',
      upsert: true,
      cacheControl: '3600',
    });

  if (error) {
    throw new Error(`Gagal upload ke Supabase: ${error.message}`);
  }

  const { data } = supabase.storage
    .from(profileBucket)
    .getPublicUrl(path);

  return data.publicUrl;
}

export async function deleteProfilePhotoFromSupabase(playerId) {
  const path = profilePhotoPath(playerId);

  const { error } = await supabase.storage
    .from(profileBucket)
    .remove([path]);

  if (error) {
    throw new Error(`Gagal hapus foto di Supabase: ${error.message}`);
  }
}