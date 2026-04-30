import { createClient } from '@supabase/supabase-js';

const supabaseUrl = String(process.env.SUPABASE_URL || '').trim().replace(/\/+$/, '');
const supabaseServiceRoleKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
const profileBucket = String(process.env.SUPABASE_PROFILE_BUCKET || 'profile-photos')
  .trim()
  .replace(/^\/+|\/+$/g, '');

let supabaseClient = null;

function getSupabaseClient() {
  if (!supabaseUrl || !supabaseServiceRoleKey) {
    throw new Error('Konfigurasi Supabase belum lengkap. Cek SUPABASE_URL dan SUPABASE_SERVICE_ROLE_KEY.');
  }

  if (!supabaseUrl.endsWith('.supabase.co')) {
    throw new Error('SUPABASE_URL harus berupa Project URL, contoh: https://xxxxx.supabase.co');
  }

  if (!supabaseClient) {
    supabaseClient = createClient(supabaseUrl, supabaseServiceRoleKey);
  }

  return supabaseClient;
}

function safeId(value) {
  return String(value || '')
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, '');
}

export function profilePhotoPath(playerId) {
  const id = safeId(playerId);

  if (!id) {
    throw new Error('Player ID tidak valid untuk path foto profil.');
  }

  return `players/${id}/profile.jpg`;
}

export async function uploadProfilePhotoToSupabase({ playerId, buffer, contentType }) {
  const supabase = getSupabaseClient();
  const path = profilePhotoPath(playerId);

  console.log('[supabase] upload bucket:', profileBucket);
  console.log('[supabase] upload path:', path);

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
  const supabase = getSupabaseClient();
  const path = profilePhotoPath(playerId);

  const { error } = await supabase.storage
    .from(profileBucket)
    .remove([path]);

  if (error) {
    throw new Error(`Gagal hapus foto di Supabase: ${error.message}`);
  }
}