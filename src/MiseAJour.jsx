import { useEffect, useState } from "react";

// Bandeau "Nouvelle version disponible" + bouton "Mettre a jour".
// L'app verifie /version.json (jamais depuis le cache) a l'ouverture, quand on revient
// dessus, et toutes les 30 minutes. Si la version en ligne est differente de celle
// qui tourne, le bandeau apparait. Un clic : on vide les caches du code et on recharge.
const VERSION_ACTUELLE = typeof __BUILD_ID__ !== "undefined" ? __BUILD_ID__ : "dev";

async function versionEnLigne() {
  try {
    const r = await fetch(`/version.json?t=${Date.now()}`, { cache: "no-store" });
    if (!r.ok) return null;
    const j = await r.json();
    return j && j.version ? String(j.version) : null;
  } catch (e) {
    return null; // hors ligne : on ne dit rien
  }
}

async function appliquerMiseAJour() {
  try {
    // Les medias (photos, vocaux) gardent leur cache : ils ne changent jamais.
    if ("caches" in window) {
      const noms = await caches.keys();
      await Promise.all(noms.filter((n) => !n.startsWith("tht-medias")).map((n) => caches.delete(n)));
    }
    if ("serviceWorker" in navigator) {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg) await reg.update().catch(() => {});
    }
  } catch (e) { /* on recharge quand meme */ }
  const url = new URL(window.location.href);
  url.searchParams.set("maj", Date.now().toString());
  window.location.replace(url.toString());
}

export default function MiseAJour() {
  const [dispo, setDispo] = useState(false);
  const [enCours, setEnCours] = useState(false);

  useEffect(() => {
    // Nettoie le parametre ?maj= ajoute lors de la mise a jour
    const url = new URL(window.location.href);
    if (url.searchParams.has("maj")) {
      url.searchParams.delete("maj");
      window.history.replaceState(null, "", url.pathname + url.search + url.hash);
    }
    if (VERSION_ACTUELLE === "dev") return;
    let actif = true;
    const verifier = async () => {
      const v = await versionEnLigne();
      if (actif && v && v !== VERSION_ACTUELLE) setDispo(true);
    };
    verifier();
    const auRetour = () => { if (document.visibilityState === "visible") verifier(); };
    document.addEventListener("visibilitychange", auRetour);
    const t = setInterval(verifier, 30 * 60 * 1000);
    return () => { actif = false; document.removeEventListener("visibilitychange", auRetour); clearInterval(t); };
  }, []);

  if (!dispo) return null;
  return (
    <div role="status" style={{position:"fixed",top:"calc(env(safe-area-inset-top,0px) + 10px)",left:"50%",transform:"translateX(-50%)",width:"calc(100% - 24px)",maxWidth:440,zIndex:1000,display:"flex",alignItems:"center",gap:12,padding:"12px 12px 12px 16px",borderRadius:20,background:"rgba(11,20,51,0.92)",border:"1px solid rgba(232,176,75,0.45)",boxShadow:"0 18px 40px -12px rgba(0,0,0,0.7)",backdropFilter:"blur(16px)",WebkitBackdropFilter:"blur(16px)"}}>
      <span style={{fontSize:22}}>✨</span>
      <div style={{flex:1,minWidth:0}}>
        <p style={{margin:0,color:"#F5F2EA",fontWeight:800,fontSize:14}}>Nouvelle version de THT</p>
        <p style={{margin:0,color:"#97A3C9",fontSize:12}}>Touche pour l'installer tout de suite</p>
      </div>
      <button onClick={()=>{setEnCours(true);appliquerMiseAJour();}} disabled={enCours} style={{border:"none",borderRadius:14,padding:"10px 14px",fontWeight:800,fontSize:13,color:"#1B1203",background:"linear-gradient(135deg,#FFE9B4 0%,#E8B04B 48%,#C38427 100%)",cursor:"pointer",whiteSpace:"nowrap"}}>
        {enCours ? "Mise a jour..." : "Mettre a jour"}
      </button>
    </div>
  );
}
