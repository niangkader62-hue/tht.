// Page publique /paiement (ouverte par le QR universel). Aucune connexion requise.
// Parcours : 1) objectif  2) (si cotisation) telephone -> choix de la tontine + montant
// 3) pays + reseau  4) telephone du payeur  5) bouton -> fedapay-init -> redirection FedaPay.
//
// Branchement dans src/App.jsx (tout en haut de AppInner, comme la page ?contribuer=) :
//   if (new URLSearchParams(location.search).get("paiement")) return <PaiementScreen/>;

import { useState } from "react";
import { supabase } from "./supabaseClient";

// Pays FedaPay (zone XOF) et reseaux disponibles. La selection finale du moyen se fait
// aussi sur la page hebergee FedaPay ; ici c'est pour guider et tracer (metadata).
const PAYS = [
  { code: "BJ", nom: "Bénin", reseaux: ["MTN", "Moov", "Celtiis", "Carte"] },
  { code: "CI", nom: "Côte d'Ivoire", reseaux: ["Orange", "MTN", "Moov", "Wave", "Carte"] },
  { code: "SN", nom: "Sénégal", reseaux: ["Orange Money", "Wave", "Free", "Carte"] },
  { code: "TG", nom: "Togo", reseaux: ["Moov", "Yas", "Carte"] },
  { code: "ML", nom: "Mali", reseaux: ["Orange", "Moov", "Carte"] },
  { code: "BF", nom: "Burkina Faso", reseaux: ["Orange", "Moov", "Carte"] },
  { code: "NE", nom: "Niger", reseaux: ["Airtel", "Moov", "Carte"] },
  { code: "GN", nom: "Guinée", reseaux: ["Orange", "MTN", "Carte"] },
];

const champ = { width: "100%", background: "rgba(255,255,255,0.045)", border: "1px solid rgba(255,255,255,0.14)", borderRadius: 12, padding: "12px 14px", color: "#F5F2EA", fontSize: 15, outline: "none", boxSizing: "border-box" };
const label = { display: "block", color: "#97A3C9", fontSize: 12, fontWeight: 700, margin: "14px 0 6px" };

export default function PaiementScreen() {
  const [objectif, setObjectif] = useState("");      // 'cotisation' | 'depot_personnel'
  const [tel, setTel] = useState("");
  const [tontines, setTontines] = useState([]);
  const [tontine, setTontine] = useState(null);       // {id, nom, montant, membre_id, id_createur}
  const [montant, setMontant] = useState("");
  const [pays, setPays] = useState("BJ");
  const [reseau, setReseau] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const paysObj = PAYS.find((p) => p.code === pays) || PAYS[0];

  // Charge les tontines du payeur a partir de son numero (RPC securisee, ne liste que
  // les tontines qui le concernent).
  const chargerTontines = async () => {
    setMsg("");
    if (tel.replace(/\D/g, "").length < 8) return setMsg("Entre d'abord ton numéro de téléphone.");
    setBusy(true);
    const { data, error } = await supabase.rpc("tontines_du_payeur", { p_tel: tel });
    setBusy(false);
    if (error) return setMsg("Impossible de charger tes tontines. Réessaie.");
    if (!data || data.length === 0) return setMsg("Aucune tontine trouvée pour ce numéro.");
    setTontines(data);
    setTontine(data[0]);
    setMontant(String(data[0].montant || ""));
  };

  const payer = async () => {
    setMsg("");
    const mnt = Math.floor(Number(montant));
    if (!Number.isFinite(mnt) || mnt < 100) return setMsg("Montant invalide.");
    if (tel.replace(/\D/g, "").length < 8) return setMsg("Numéro de téléphone invalide.");
    if (objectif === "cotisation" && !tontine) return setMsg("Choisis une tontine.");
    setBusy(true);
    const { data, error } = await supabase.functions.invoke("fedapay-init", {
      body: {
        type_transaction: objectif,
        id_tontine: objectif === "cotisation" ? tontine?.id : null,
        membre_id: objectif === "cotisation" ? tontine?.membre_id : null,
        id_utilisateur: objectif === "cotisation" ? tontine?.id_createur : null,
        montant: mnt, telephone: tel, pays, reseau, devise: "XOF",
      },
    });
    setBusy(false);
    if (error || data?.error || !data?.url) return setMsg("Le paiement n'a pas pu démarrer. Réessaie.");
    window.location.href = data.url;   // redirection vers le checkout FedaPay
  };

  return (
    // data-noinvert : la page de paiement reste TOUJOURS en mode clair (identite lumineuse),
    // meme si le telephone est en mode sombre — comme un checkout bancaire, plus rassurant.
    <div data-noinvert style={{ minHeight: "100vh", background: "rgba(255,255,255,0.045)", display: "flex", justifyContent: "center", padding: "24px 16px" }}>
      <div style={{ width: "100%", maxWidth: 460, background: "rgba(255,255,255,0.055)", borderRadius: 20, padding: 22 }}>
        <h1 style={{ color: "#E8B04B", fontSize: 22, fontWeight: 900, margin: "0 0 4px" }}>Paiement THT</h1>
        <p style={{ color: "#97A3C9", fontSize: 13, margin: "0 0 8px" }}>Paie ta cotisation ou fais un dépôt en toute sécurité.</p>

        <label style={label}>Que veux-tu faire ?</label>
        <div style={{ display: "flex", gap: 8 }}>
          {[["cotisation", "💳 Payer une cotisation"], ["depot_personnel", "🏦 Faire un dépôt"]].map(([v, t]) => (
            <button key={v} onClick={() => setObjectif(v)} style={{ flex: 1, padding: "12px 8px", borderRadius: 12, border: "1px solid", cursor: "pointer", fontSize: 13, fontWeight: 700, background: objectif === v ? "#E8B04B" : "rgba(255,255,255,0.045)", color: objectif === v ? "#1B1203" : "#F5F2EA", borderColor: objectif === v ? "#E8B04B" : "rgba(255,255,255,0.14)" }}>{t}</button>
          ))}
        </div>

        {objectif && <>
          <label style={label}>Ton numéro de téléphone</label>
          <input style={champ} value={tel} onChange={(e) => setTel(e.target.value.replace(/[^\d+ ]/g, ""))} placeholder="Ex : +229 97 00 00 00" inputMode="tel" />

          {objectif === "cotisation" && <>
            <button onClick={chargerTontines} disabled={busy} style={{ width: "100%", marginTop: 10, background: "rgba(255,255,255,0.09)", border: "1px solid #E8B04B", borderRadius: 10, padding: 10, color: "#E8B04B", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>{busy ? "..." : "🔎 Trouver mes tontines"}</button>
            {tontines.length > 0 && <>
              <label style={label}>Tontine concernée</label>
              <select style={champ} value={tontine?.id || ""} onChange={(e) => { const t = tontines.find((x) => x.id === e.target.value); setTontine(t); setMontant(String(t?.montant || "")); }}>
                {tontines.map((t) => <option key={t.id} value={t.id}>{t.nom} — {t.montant} XOF</option>)}
              </select>
            </>}
          </>}

          <label style={label}>Montant (XOF)</label>
          <input style={champ} value={montant} onChange={(e) => setMontant(e.target.value.replace(/\D/g, ""))} placeholder="Ex : 2500" inputMode="numeric" />

          <label style={label}>Pays</label>
          <select style={champ} value={pays} onChange={(e) => { setPays(e.target.value); setReseau(""); }}>
            {PAYS.map((p) => <option key={p.code} value={p.code}>{p.nom}</option>)}
          </select>

          <label style={label}>Réseau de paiement</label>
          <select style={champ} value={reseau} onChange={(e) => setReseau(e.target.value)}>
            <option value="">— Choisir —</option>
            {paysObj.reseaux.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>

          {msg && <p style={{ color: "#FB7185", fontSize: 13, margin: "12px 0 0", fontWeight: 600 }}>{msg}</p>}

          <button onClick={payer} disabled={busy} style={{ width: "100%", marginTop: 18, background: "linear-gradient(135deg,#E8B04B,#B07A22)", border: "none", borderRadius: 14, padding: 15, color: "#1B1203", fontWeight: 800, fontSize: 15, cursor: "pointer" }}>{busy ? "Ouverture du paiement..." : "✅ Payer maintenant"}</button>
          <p style={{ color: "#6F7BA6", fontSize: 11, textAlign: "center", margin: "10px 0 0" }}>Paiement sécurisé via FedaPay. THT ne voit jamais ton code secret.</p>
        </>}
      </div>
    </div>
  );
}
