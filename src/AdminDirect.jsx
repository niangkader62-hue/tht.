import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "./supabaseClient";

// =============================================================================
// ADMIN "EN DIRECT" — copie de l'ecran Administration de la maquette :
// pastille "En direct", 4 compteurs, flux des dernieres activites qui arrivent
// en temps reel (date, heure, seconde). Pour chaque personne qui n'a pas reussi
// a creer son compte : bouton WhatsApp avec un message d'aide pret a envoyer.
// Pour chaque compte cree : bouton WhatsApp avec le message de confirmation.
// =============================================================================

const LIEN_APP = "https://tontine.kbsdigitalagency.com";

export const messageAide = (prenom) => `Bonjour${prenom ? " " + prenom : ""},

Ici l'équipe THT – Tontine Habi Traoré. 👋
Nous avons remarqué que vous avez essayé de créer votre compte THT, mais l'inscription ne s'est pas terminée. Nous sommes désolés pour ce désagrément.

Pour finaliser en 1 minute :
1️⃣ Ouvrez THT : ${LIEN_APP}
2️⃣ Touchez « Continuer avec Google » (ou « Créer mon compte gratuit » avec votre numéro)
3️⃣ Indiquez votre prénom et votre numéro WhatsApp

Si un message d'erreur s'affiche, envoyez-nous simplement une capture d'écran ici : nous vous accompagnons jusqu'à ce que tout fonctionne.

Merci pour votre confiance,
L'équipe THT`;

export const messageConfirmation = (prenom) => `Bonjour${prenom ? " " + prenom : ""},

Bienvenue sur THT – Tontine Habi Traoré ! 🎉
Votre compte est bien créé et activé.

Vous pouvez dès maintenant :
✅ créer ou rejoindre une tontine
✅ suivre les cotisations en temps réel
✅ épargner et poser vos questions à HABY, votre assistante

Accès direct : ${LIEN_APP}

Une question ? Répondez simplement à ce message, nous sommes là pour vous aider.
L'équipe THT`;

// Numero -> format WhatsApp international (Mali par defaut pour 8 chiffres)
const telWA = (tel) => {
  let d = String(tel || "").replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  if (d.length === 8) d = "223" + d;
  return d.length >= 10 ? d : null;
};

const ETAPES = {
  compte_cree: { lb: "Compte créé", c: "vert" },
  connexion: { lb: "Connexion", c: "bleu" },
  google_connecte: { lb: "Google : numéro manquant", c: "or" },
  google_clic: { lb: "Clic Google", c: "or" },
  echec: { lb: "Échec", c: "rose" },
};
const TAG = {
  or: { background: "rgba(232,176,75,.15)", color: "#FFE1A1" },
  vert: { background: "rgba(52,211,153,.14)", color: "#6EE7B7" },
  rose: { background: "rgba(251,113,133,.14)", color: "#FDA4AF" },
  bleu: { background: "rgba(126,166,255,.14)", color: "#B4CAFF" },
};
const DEGRADES = ["#FF8A5B,#D9346B", "#5B8CFF,#3D5BFF", "#34D399,#0E9F6E", "#B07AFF,#7B3DFF", "#FFE1A1,#E8B04B", "#FF8A5B,#E8B04B"];
const deux = (n) => String(n).padStart(2, "0");
const dateHeure = (d) => `${deux(d.getDate())}/${deux(d.getMonth() + 1)}/${d.getFullYear()} à ${deux(d.getHours())}:${deux(d.getMinutes())}:${deux(d.getSeconds())}`;
const ilYa = (d, maintenant) => {
  const s = Math.max(0, Math.round((maintenant - d) / 1000));
  if (s < 10) return "à l'instant";
  if (s < 60) return `il y a ${s} s`;
  if (s < 3600) return `il y a ${Math.floor(s / 60)} min`;
  if (s < 86400) return `il y a ${Math.floor(s / 3600)} h`;
  return `il y a ${Math.floor(s / 86400)} j`;
};
const fmt = (n) => (Number(n) || 0).toLocaleString("fr-FR");

const S = {
  carte: { position: "relative", background: "linear-gradient(180deg,rgba(255,255,255,.07),rgba(255,255,255,.025))", border: "1px solid rgba(255,255,255,.08)", borderRadius: 24, padding: 18, marginTop: 14, boxShadow: "inset 0 1px 0 rgba(255,255,255,.07),0 20px 40px -24px rgba(0,0,0,.6)" },
  kpi: { borderRadius: 22, padding: 16, background: "linear-gradient(180deg,rgba(255,255,255,.065),rgba(255,255,255,.02))", border: "1px solid rgba(255,255,255,.08)" },
  kpiLb: { fontSize: 13.5, fontWeight: 700, color: "#97A3C9" },
  kpiVal: { display: "block", fontFamily: "'Sora','Manrope',sans-serif", fontWeight: 800, fontSize: 26, letterSpacing: "-.02em", marginTop: 4, color: "#F5F2EA" },
  tag: { display: "inline-flex", alignItems: "center", padding: "4px 10px", borderRadius: 999, fontWeight: 800, fontSize: 11.5, whiteSpace: "nowrap" },
  petitBtn: { border: "1px solid rgba(255,255,255,.12)", background: "rgba(255,255,255,.05)", color: "#F5F2EA", borderRadius: 12, padding: "8px 12px", fontWeight: 800, fontSize: 12.5, cursor: "pointer" },
};

export default function AdminDirect({ onBack, revenuMois = 0, onToast }) {
  const [maintenant, setMaintenant] = useState(() => new Date());
  const [users, setUsers] = useState([]);
  const [events, setEvents] = useState([]);
  const [nouveaux, setNouveaux] = useState({});
  const [filtre, setFiltre] = useState("tout");
  const [ouvert, setOuvert] = useState(null);
  const [journalOk, setJournalOk] = useState(true);
  const haut = useRef(null);

  // L'ecran s'ouvre toujours en haut (sinon il gardait le defilement de la page Profil)
  useEffect(() => {
    window.scrollTo(0, 0);
    let el = haut.current && haut.current.parentElement;
    while (el) { if (el.scrollHeight > el.clientHeight) el.scrollTop = 0; el = el.parentElement; }
  }, []);

  // Horloge a la seconde
  useEffect(() => {
    const t = setInterval(() => setMaintenant(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // Utilisateurs (compteurs + "en ligne") : rafraichis toutes les 20 s
  useEffect(() => {
    let actif = true;
    const charger = async () => {
      const { data } = await supabase.from("users").select("id,prenom,telephone,plan,derniere_connexion,created_at").order("derniere_connexion", { ascending: false });
      if (actif && data) setUsers(data);
    };
    charger();
    const t = setInterval(charger, 20000);
    return () => { actif = false; clearInterval(t); };
  }, []);

  // Journal : chargement + temps reel (et filet de securite toutes les 15 s)
  useEffect(() => {
    let actif = true;
    const charger = async () => {
      const { data, error } = await supabase.from("journal_inscriptions").select("*").order("created_at", { ascending: false }).limit(150);
      if (!actif) return;
      if (error) { setJournalOk(false); return; }
      setJournalOk(true);
      setEvents((anciens) => {
        const deja = new Set(anciens.map((e) => e.id));
        const arrives = (data || []).filter((e) => !deja.has(e.id));
        if (anciens.length && arrives.length) marquerNouveaux(arrives.map((e) => e.id));
        return data || [];
      });
    };
    const marquerNouveaux = (ids) => {
      setNouveaux((n) => { const m = { ...n }; ids.forEach((id) => { m[id] = true; }); return m; });
      setTimeout(() => setNouveaux((n) => { const m = { ...n }; ids.forEach((id) => delete m[id]); return m; }), 2500);
    };
    charger();
    const canal = supabase
      .channel("admin-journal-direct")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "journal_inscriptions" }, (p) => {
        const e = p.new;
        setEvents((ev) => (ev.some((x) => x.id === e.id) ? ev : [e, ...ev].slice(0, 150)));
        marquerNouveaux([e.id]);
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "journal_inscriptions" }, (p) => {
        setEvents((ev) => ev.map((x) => (x.id === p.new.id ? p.new : x)));
      })
      .subscribe();
    const t = setInterval(charger, 15000);
    return () => { actif = false; clearInterval(t); supabase.removeChannel(canal); };
  }, []);

  const enLigne = users.filter((u) => u.derniere_connexion && maintenant - new Date(u.derniere_connexion) < 5 * 60 * 1000).length;
  const premium = users.filter((u) => u.plan === "premium").length;

  // Personnes a recontacter : un echec (ou Google sans numero) sans compte cree ensuite
  const aRecontacter = useMemo(() => {
    const cle = (e) => e.user_id || e.telephone || e.email;
    const reussis = new Set(events.filter((e) => e.etape === "compte_cree").map(cle).filter(Boolean));
    users.forEach((u) => { reussis.add(u.id); if (u.telephone) reussis.add(u.telephone.replace(/\s/g, "")); });
    const vus = new Set();
    return events.filter((e) => {
      if (e.etape !== "echec" && e.etape !== "google_connecte") return false;
      const k = cle(e);
      if (!k || reussis.has(k) || vus.has(k)) return false;
      vus.add(k);
      return true;
    });
  }, [events, users]);
  const idsARecontacter = new Set(aRecontacter.map((e) => e.id));

  const liste = events.filter((e) => {
    if (filtre === "tout") return e.etape !== "google_clic";
    if (filtre === "recontacter") return idsARecontacter.has(e.id);
    if (filtre === "comptes") return e.etape === "compte_cree";
    if (filtre === "connexions") return e.etape === "connexion";
    return true;
  });

  const envoyer = async (e, type) => {
    const tel = telWA(e.telephone);
    const prenom = (e.prenom || "").split(" ")[0];
    const texte = type === "confirmation" ? messageConfirmation(prenom) : messageAide(prenom);
    if (tel) window.open(`https://wa.me/${tel}?text=${encodeURIComponent(texte)}`, "_blank", "noopener");
    else if (e.email) window.open(`mailto:${e.email}?subject=${encodeURIComponent(type === "confirmation" ? "Bienvenue sur THT" : "Finaliser votre compte THT")}&body=${encodeURIComponent(texte)}`, "_blank");
    else { try { await navigator.clipboard.writeText(texte); onToast && onToast("Pas de numéro : message copié"); } catch { /* rien */ } }
    const quand = new Date().toISOString();
    setEvents((ev) => ev.map((x) => (x.id === e.id ? { ...x, contacte_le: quand } : x)));
    supabase.from("journal_inscriptions").update({ contacte_le: quand }).eq("id", e.id).then(() => {});
  };

  const copier = async (texte) => {
    try { await navigator.clipboard.writeText(texte); onToast && onToast("Message copié"); } catch { onToast && onToast("Copie impossible", "error"); }
  };

  return (
    <div ref={haut} style={{ padding: "calc(env(safe-area-inset-top,0px) + 18px) 20px 0" }}>
      <style>{`
        @keyframes thtPouls{0%{box-shadow:0 0 0 0 rgba(52,211,153,.7)}100%{box-shadow:0 0 0 12px rgba(52,211,153,0)}}
        @keyframes thtArrive{from{opacity:0;transform:translateY(-14px);background:rgba(232,176,75,.15)}}
      `}</style>

      {/* En-tete comme la maquette */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, margin: "4px 0 14px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button onClick={onBack} aria-label="Retour" style={{ width: 44, height: 44, borderRadius: 14, background: "rgba(255,255,255,.045)", border: "1px solid rgba(255,255,255,.08)", color: "#F5F2EA", fontSize: 20, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>←</button>
          <h2 style={{ margin: 0, color: "#F5F2EA", fontSize: 25, fontWeight: 700 }}>Administration</h2>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 8, color: "#6EE7B7", fontWeight: 800, fontSize: 14 }}>
          <i style={{ width: 9, height: 9, borderRadius: "50%", background: "#34D399", animation: "thtPouls 1.4s infinite" }} />En direct
        </span>
        <span style={{ color: "#97A3C9", fontWeight: 700, fontSize: 13, fontVariantNumeric: "tabular-nums" }}>{dateHeure(maintenant)}</span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 14 }}>
        <div style={S.kpi}><span style={S.kpiLb}>Utilisateurs</span><b style={S.kpiVal}>{fmt(users.length)}</b></div>
        <div style={S.kpi}><span style={S.kpiLb}>En ligne</span><b style={{ ...S.kpiVal, color: "#6EE7B7" }}>{enLigne}</b></div>
        <div style={S.kpi}><span style={S.kpiLb}>Abonnés premium</span><b style={S.kpiVal}>{premium}</b></div>
        <div style={S.kpi}><span style={S.kpiLb}>Revenus du mois</span><b style={{ ...S.kpiVal, color: "#FFE1A1" }}>{fmt(revenuMois)}</b></div>
      </div>

      {aRecontacter.length > 0 && (
        <button onClick={() => setFiltre("recontacter")} style={{ ...S.carte, width: "100%", textAlign: "left", cursor: "pointer", display: "flex", alignItems: "center", gap: 12, borderColor: "rgba(251,113,133,.35)", background: "linear-gradient(180deg,rgba(251,113,133,.12),rgba(251,113,133,.04))" }}>
          <span style={{ fontSize: 24 }}>📲</span>
          <span style={{ flex: 1 }}>
            <b style={{ display: "block", color: "#F5F2EA", fontSize: 15 }}>{aRecontacter.length} personne(s) à recontacter</b>
            <span style={{ color: "#97A3C9", fontSize: 13, fontWeight: 600 }}>Inscription pas terminée : envoie-leur le message d'aide sur WhatsApp</span>
          </span>
        </button>
      )}

      <div style={S.carte}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <h3 style={{ margin: 0, color: "#F5F2EA", fontSize: 18 }}>Activité en direct</h3>
          <span style={{ color: "#97A3C9", fontSize: 12.5, fontWeight: 700 }}>{liste.length} évén.</span>
        </div>
        <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 6, scrollbarWidth: "none" }}>
          {[["tout", "Tout"], ["recontacter", `À recontacter (${aRecontacter.length})`], ["comptes", "Comptes créés"], ["connexions", "Connexions"]].map(([id, lb]) => (
            <button key={id} onClick={() => setFiltre(id)} style={{ flex: "none", padding: "8px 14px", borderRadius: 999, border: "1px solid " + (filtre === id ? "transparent" : "rgba(255,255,255,.08)"), background: filtre === id ? "linear-gradient(135deg,#FFE9B4,#E8B04B)" : "rgba(255,255,255,.045)", color: filtre === id ? "#1B1203" : "#F5F2EA", fontWeight: 800, fontSize: 13, cursor: "pointer" }}>{lb}</button>
          ))}
        </div>

        {!journalOk && <p style={{ color: "#FDA4AF", fontSize: 13, margin: "10px 0 0" }}>Le journal n'est pas encore activé dans la base (table journal_inscriptions manquante).</p>}
        {journalOk && liste.length === 0 && <p style={{ color: "#97A3C9", fontSize: 13, margin: "14px 0 4px", textAlign: "center" }}>Rien pour le moment. Les nouvelles activités apparaîtront ici en direct.</p>}

        {liste.map((e, i) => {
          const d = new Date(e.created_at);
          const et = ETAPES[e.etape] || { lb: e.etape, c: "or" };
          const nom = e.prenom || e.email || e.telephone || "Visiteur";
          const aAider = idsARecontacter.has(e.id);
          const peutConfirmer = e.etape === "compte_cree";
          return (
            <div key={e.id} style={{ borderTop: i ? "1px solid rgba(255,255,255,.08)" : "none", padding: "13px 0", animation: nouveaux[e.id] ? "thtArrive .6s cubic-bezier(.2,.9,.2,1) both" : "none" }}>
              <div onClick={() => setOuvert(ouvert === e.id ? null : e.id)} style={{ display: "flex", alignItems: "center", gap: 12, cursor: "pointer" }}>
                <div style={{ width: 42, height: 42, borderRadius: 14, flex: "none", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 16, color: "#1B1203", background: `linear-gradient(135deg,${DEGRADES[(nom.charCodeAt(0) || 0) % DEGRADES.length]})` }}>{nom[0].toUpperCase()}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <b style={{ display: "block", color: "#F5F2EA", fontSize: 15, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{nom}</b>
                  <span style={{ display: "block", fontSize: 13, color: "#97A3C9", fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{[e.telephone, e.prenom && e.email ? e.email : null, e.methode === "google" ? "Google" : e.methode === "telephone" ? "Numéro" : null].filter(Boolean).join(" · ") || "—"}</span>
                </div>
                <div style={{ textAlign: "right", fontSize: 12, color: "#97A3C9", fontWeight: 700, flex: "none" }}>
                  <span style={{ ...S.tag, ...TAG[et.c] }}>{et.lb}</span><br />{ilYa(d, maintenant)}
                </div>
              </div>
              <p style={{ margin: "6px 0 0 54px", color: "#6F7BA6", fontSize: 12, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                {dateHeure(d)}{e.contacte_le ? ` · ✓ contacté à ${dateHeure(new Date(e.contacte_le)).split(" à ")[1]}` : ""}
              </p>
              {e.message && <p style={{ margin: "4px 0 0 54px", color: "#FDA4AF", fontSize: 12.5 }}>{e.message}</p>}
              {ouvert === e.id && e.appareil && <p style={{ margin: "4px 0 0 54px", color: "#6F7BA6", fontSize: 11, wordBreak: "break-word" }}>Appareil : {e.appareil}</p>}
              {(aAider || peutConfirmer) && (
                <div style={{ display: "flex", gap: 8, margin: "10px 0 0 54px", flexWrap: "wrap" }}>
                  <button onClick={() => envoyer(e, aAider ? "aide" : "confirmation")} style={{ ...S.petitBtn, background: "#128C7E", borderColor: "#128C7E" }}>
                    {telWA(e.telephone) ? "WhatsApp" : e.email ? "Email" : "Copier"} · {aAider ? "message d'aide" : "confirmation"}
                  </button>
                  <button onClick={() => copier(aAider ? messageAide((e.prenom || "").split(" ")[0]) : messageConfirmation((e.prenom || "").split(" ")[0]))} style={S.petitBtn}>Copier le texte</button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
