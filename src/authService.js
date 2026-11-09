import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from "./supabaseClient";
import { createClient } from "@supabase/supabase-js";


// --- Journal en direct (visible dans l'admin) ----------------------------------
// Chaque etape importante (clic Google, compte cree, connexion, echec) est notee avec
// l'heure exacte. L'admin voit tout en direct et peut recontacter sur WhatsApp les
// personnes qui n'ont pas reussi a creer leur compte. Jamais bloquant pour l'app.
export function journal(evt) {
  try {
    const ligne = {
      etape: evt.etape,
      methode: evt.methode || null,
      user_id: evt.user_id || null,
      email: evt.email ? String(evt.email).slice(0, 200) : null,
      prenom: evt.prenom ? String(evt.prenom).slice(0, 80) : null,
      telephone: evt.telephone ? String(evt.telephone).replace(/\s/g, "").slice(0, 30) : null,
      message: evt.message ? String(evt.message).slice(0, 500) : null,
      appareil: (typeof navigator !== "undefined" ? navigator.userAgent : "").slice(0, 300) || null,
    };
    supabase.from("journal_inscriptions").insert(ligne).then(() => {}, () => {});
  } catch (_e) { /* le journal ne doit jamais casser l'app */ }
}

// --- Connexion avec Google ------------------------------------------------------
export async function signInWithGoogle() {
  journal({ etape: "google_clic", methode: "google" });
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: window.location.origin + "/", queryParams: { prompt: "select_account" } },
  });
  if (error) {
    journal({ etape: "echec", methode: "google", message: "Google : " + (error.message || "erreur inconnue") });
    return { ok: false, err: "La connexion Google n'a pas marche. Reessaie, ou cree ton compte avec ton numero." };
  }
  return { ok: true }; // la page part vers Google puis revient sur THT
}

// Le bouton Google ne s'affiche que si Google est active dans Supabase
// (Authentication > Providers > Google). Ainsi il apparait tout seul le jour ou c'est configure.
export async function googleActif() {
  try {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/settings`, { headers: { apikey: SUPABASE_ANON_KEY } });
    if (!r.ok) return false;
    const j = await r.json();
    return !!(j && j.external && j.external.google);
  } catch (_e) {
    return false;
  }
}

// Session Google ouverte mais profil THT pas encore cree (il manque le numero WhatsApp).
export async function sessionGoogleSansProfil() {
  const { data } = await supabase.auth.getSession();
  const u = data.session?.user;
  if (!u) return null;
  const { data: profile } = await supabase.from("users").select("id").eq("id", u.id).maybeSingle();
  if (profile) return null;
  const meta = u.user_metadata || {};
  const info = { id: u.id, email: u.email || meta.email || "", nom: meta.full_name || meta.name || "", photo: meta.avatar_url || meta.picture || null };
  journal({ etape: "google_connecte", methode: "google", user_id: u.id, email: info.email, prenom: info.nom });
  return info;
}

export async function finaliserCompteGoogle(prenom, tel, parrainCode) {
  const { data } = await supabase.auth.getSession();
  const u = data.session?.user;
  if (!u) return { ok: false, err: "Ta session Google a expire. Recommence avec Continuer avec Google." };
  const meta = u.user_metadata || {};
  const photoUrl = meta.avatar_url || meta.picture || null;
  const telephone = tel.replace(/\s/g, "");
  const { error } = await supabase.from("users").insert({
    id: u.id, prenom, telephone, pin_hash: "google_oauth", photo_url: photoUrl, plan: "free", parraine_par: null,
    parrain_code: u.id.replace(/-/g, "").slice(0, 8).toUpperCase(),
  });
  if (error) {
    const doublon = (error.code === "23505") || /duplicate|unique/i.test(error.message || "");
    journal({ etape: "echec", methode: "google", user_id: u.id, email: u.email, prenom, telephone, message: (doublon ? "Numero deja utilise : " : "Profil : ") + (error.message || "") });
    return { ok: false, err: doublon ? "Ce numero a deja un compte THT. Connecte-toi avec ton numero et ton PIN." : "Erreur de creation du compte. Reessaie." };
  }
  if (parrainCode && parrainCode.trim()) await supabase.rpc("lier_parrain", { p_code: parrainCode.trim() });
  journal({ etape: "compte_cree", methode: "google", user_id: u.id, email: u.email, prenom, telephone });
  const { count: linkedCount } = await supabase.from("membres").select("*", { count: "exact", head: true }).eq("user_id", u.id);
  return { ok: true, user: { id: u.id, prenom, tel: telephone, photo: photoUrl, plan: "free", role: "user", langue: "fr", linkedCount: linkedCount || 0, google: true } };
}

const telToEmail = (tel) => tel.replace(/[^\d]/g, "") + "@kolo.local";
const pinToPassword = (pin) => `k${pin}Kolo!`;

export async function registerUser(tel, pin, prenom, photoFile, parrainCode) {
  const email = telToEmail(tel);
  const password = pinToPassword(pin);

  const { data: authData, error: authErr } = await supabase.auth.signUp({ email, password });
  if (authErr) {
    if (authErr.message.includes("already registered") || authErr.message.includes("already been registered")) {
      journal({ etape: "echec", methode: "telephone", prenom, telephone: tel, message: "Numero deja inscrit" });
      return { ok: false, err: "Ce numéro est déjà inscrit. Connecte-toi !" };
    }
    journal({ etape: "echec", methode: "telephone", prenom, telephone: tel, message: "Inscription : " + authErr.message });
    return { ok: false, err: "Erreur d'inscription. Réessaie." };
  }

  const userId = authData.user.id;

  let photoUrl = null;
  if (photoFile) {
    try {
      const ext = (photoFile.name.split(".").pop() || "jpg").toLowerCase();
      const path = `users/${userId}-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("photos").upload(path, photoFile, { upsert: true });
      if (!upErr) {
        const { data } = supabase.storage.from("photos").getPublicUrl(path);
        photoUrl = data.publicUrl;
      }
    } catch (_e) {}
  }

  const { error: profileErr } = await supabase.from("users").insert({
    id: userId,
    prenom,
    telephone: tel.replace(/\s/g, ""),
    pin_hash: "supabase_auth",
    photo_url: photoUrl || null,
    plan: "free",
    parraine_par: null,
    parrain_code: userId.replace(/-/g, "").slice(0, 8).toUpperCase(),
  });
  if (profileErr) {
    journal({ etape: "echec", methode: "telephone", user_id: userId, prenom, telephone: tel, message: "Profil : " + profileErr.message });
    return { ok: false, err: "Erreur de création de profil." };
  }
  journal({ etape: "compte_cree", methode: "telephone", user_id: userId, prenom, telephone: tel });

  // Lien de parrainage : delegue a une fonction serveur securisee (SECURITY DEFINER).
  // La recherche du parrain par son code ne PEUT PAS se faire cote client : la RLS
  // n'autorise chacun a lire que sa propre ligne dans users, donc la recherche revenait
  // toujours vide et le lien n'etait jamais cree (compteur de parrainage bloque a zero).
  // lier_parrain retrouve le parrain, renseigne parraine_par et enregistre la relation.
  if (parrainCode && parrainCode.trim()) {
    await supabase.rpc("lier_parrain", { p_code: parrainCode.trim() });
  }

  const { count: linkedCount } = await supabase.from("membres").select("*", { count: "exact", head: true }).eq("user_id", userId);

  return { ok: true, user: { id: userId, prenom, tel, photo: photoUrl, plan: "free", role: "user", langue: "fr", linkedCount: linkedCount || 0 } };
}

export async function loginUser(tel, pin) {
  const email = telToEmail(tel);
  const password = pinToPassword(pin);

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { ok: false, err: "Numéro ou PIN incorrect." };

  const { data: profile, error: pErr } = await supabase
    .from("users")
    .select("*")
    .eq("id", data.user.id)
    .single();
  if (pErr || !profile) return { ok: false, err: "Profil introuvable." };

  supabase.from("users").update({ derniere_connexion: new Date().toISOString() }).eq("id", profile.id).then(() => {});
  journal({ etape: "connexion", methode: "telephone", user_id: profile.id, prenom: profile.prenom, telephone: profile.telephone });

  return {
    ok: true,
    user: { id: profile.id, prenom: profile.prenom, tel: profile.telephone, photo: profile.photo_url, plan: profile.plan, role: profile.role || "user", langue: profile.langue || "fr", parrainCode: profile.parrain_code, premiumExpireLe: profile.premium_expire_le },
  };
}

export async function getSession() {
  const { data } = await supabase.auth.getSession();
  if (!data.session) return null;
  const { data: profile } = await supabase.from("users").select("*").eq("id", data.session.user.id).single();
  if (!profile) return null;
  supabase.from("users").update({ derniere_connexion: new Date().toISOString() }).eq("id", profile.id).then(() => {});
  const google = data.session.user.app_metadata?.provider === "google";
  if (google && typeof window !== "undefined" && window.__thtRetourGoogle) {
    window.__thtRetourGoogle = false;
    journal({ etape: "connexion", methode: "google", user_id: profile.id, email: data.session.user.email, prenom: profile.prenom, telephone: profile.telephone });
  }
  return { google, id: profile.id, prenom: profile.prenom, tel: profile.telephone, photo: profile.photo_url, plan: profile.plan, role: profile.role || "user", langue: profile.langue || "fr", parrainCode: profile.parrain_code, premiumExpireLe: profile.premium_expire_le };
}

export async function logoutUser() {
  await supabase.auth.signOut();
}

export async function verifyPin(tel, pin) {
  // Verifie le PIN SANS relancer signInWithPassword (qui casserait la session admin en cours).
  // On re-hache le PIN et on compare a la volee via une session deja active.
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return false;
  // Compare le mot de passe derive du PIN avec celui de la session active en tentant
  // une verification cote client : on refait la derivation et on verifie via un appel leger.
  const email = telToEmail(tel);
  const password = pinToPassword(pin);
  const tmp = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await tmp.auth.signInWithPassword({ email, password });
  return !error;
}

export async function changePin(tel, oldPin, newPin) {
  const oldOk = await verifyPin(tel, oldPin);
  if (!oldOk) return { ok: false, err: "Ton PIN actuel est incorrect." };
  const newPassword = pinToPassword(newPin);
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) return { ok: false, err: "Erreur technique. Reessaie." };
  return { ok: true };
}
