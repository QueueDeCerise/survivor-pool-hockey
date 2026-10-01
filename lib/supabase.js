import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-anon-key';

export const supabase = createClient(url, key, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});

// Récupère toutes les lignes (Supabase limite à 1000 par requête)
export async function fetchAll(buildQuery, pageSize = 1000) {
  let from = 0;
  const rows = [];
  for (;;) {
    const { data, error } = await buildQuery().range(from, from + pageSize - 1);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < pageSize) break;
    from += pageSize;
  }
  return rows;
}

export function frError(error) {
  const m = (error && (error.message || String(error))) || 'Erreur inconnue';
  if (/Invalid login credentials/i.test(m)) return 'Courriel ou mot de passe invalide.';
  if (/Email not confirmed/i.test(m)) return 'Confirme ton adresse courriel avant de te connecter (vérifie ta boîte de réception).';
  if (/already registered|already been registered/i.test(m)) return 'Cette adresse courriel est déjà inscrite. Connecte-toi plutôt.';
  if (/Password should be at least/i.test(m)) return 'Le mot de passe est trop court.';
  if (/rate limit/i.test(m)) return 'Trop de tentatives. Réessaie dans quelques minutes.';
  if (/row-level security/i.test(m)) return 'Action non autorisée.';
  return m;
}
