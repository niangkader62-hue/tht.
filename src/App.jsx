import { useState, useEffect, useRef, useCallback, Component } from "react";
import { registerUser, loginUser, getSession, logoutUser, verifyPin, changePin } from "./authService";
import { supabase, SUPABASE_URL } from "./supabaseClient";
import logoIcon from "./assets/logo-icon.png";
import MiseAJour from "./MiseAJour";
import heroTontine from "./assets/hero-tontine.jpg";
import tirelireImg from "./assets/tirelire-tht.jpg";
import { QRCodeSVG } from "qrcode.react";
import PaiementScreen from "./PaiementScreen";

// Paiement d'un abonnement Premium THT via FedaPay (remplace CinetPay). On cree la transaction
// cote serveur (fedapay-init, type "abonnement") puis on redirige vers le checkout securise ;
// le webhook credite le Premium (users.plan + premium_expire_le) apres confirmation du paiement.
async function payerAbonnement(user, formule, onErr){
  const {data,error}=await supabase.functions.invoke("fedapay-init",{body:{
    type_transaction:"abonnement",
    formule,
    id_utilisateur:user?.id,
    telephone:(user?.tel||"").replace(/\s/g,""),
    prenom:user?.prenom,
    devise:"XOF",
  }});
  if(error||data?.error||!data?.url){onErr&&onErr("Le paiement n'a pas pu démarrer. Réessaie.");return false;}
  window.location.href=data.url;
  return true;
}
// jsPDF et html2canvas sont volumineux et rarement utilises immediatement au demarrage :
// on les charge a la demande (dynamic import) plutot qu'au chargement initial de l'app,
// pour que l'app s'ouvre plus vite, surtout sur reseau mobile lent.

const genererRecuImage=async({nomTontine,prenom,montantRecu,montantDu,totalVerse,statut,cycle,totalCycles,ref,date})=>{
  const div=document.createElement("div");
  div.style.cssText="position:fixed;top:-9999px;left:-9999px;width:600px;background:linear-gradient(160deg,rgba(255,255,255,0.055),rgba(52,211,153,0.08));padding:0;font-family:Georgia,'Times New Roman',serif;overflow:hidden;border-radius:24px;";
  div.innerHTML=`
    <div style="height:8px;background:linear-gradient(90deg,#E8B04B,#FFE1A1,#E8B04B);"></div>
    <div style="padding:36px 40px 30px;text-align:center;border-bottom:1px solid rgba(255,255,255,0.09);">
      <div style="width:64px;height:64px;border-radius:18px;background:linear-gradient(135deg,#E8B04B,#FFE1A1);margin:0 auto 14px;display:flex;align-items:center;justify-content:center;font-size:30px;font-weight:900;color:#1B1203;">H</div>
      <p style="margin:0;color:#E8B04B;font-size:22px;font-weight:900;letter-spacing:3px;">THT</p>
      <p style="margin:4px 0 0;color:#97A3C9;font-size:11px;letter-spacing:1px;">TONTINE HABI TRAORE</p>
    </div>
    <div style="padding:28px 40px;">
      <p style="margin:0 0 4px;color:#F5F2EA;font-size:19px;font-weight:700;text-align:center;">Recu de paiement</p>
      <p style="margin:0 0 24px;color:#97A3C9;font-size:12px;text-align:center;">${date} - Ref ${ref}</p>
      <div style="background:rgba(255,255,255,0.055);border:1px solid rgba(255,255,255,0.09);border-radius:16px;padding:20px 22px;margin-bottom:16px;">
        <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.09);"><span style="color:#97A3C9;font-size:13px;">Membre</span><span style="color:#F5F2EA;font-weight:700;font-size:13px;">${prenom}</span></div>
        <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.09);"><span style="color:#97A3C9;font-size:13px;">Tontine</span><span style="color:#F5F2EA;font-weight:700;font-size:13px;">${nomTontine}</span></div>
        <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.09);"><span style="color:#97A3C9;font-size:13px;">Cycle</span><span style="color:#F5F2EA;font-weight:700;font-size:13px;">${cycle} / ${totalCycles}</span></div>
        <div style="display:flex;justify-content:space-between;padding:8px 0;"><span style="color:#97A3C9;font-size:13px;">Montant du</span><span style="color:#F5F2EA;font-weight:700;font-size:13px;">${montantDu}</span></div>
      </div>
      <div style="background:linear-gradient(135deg,rgba(255,255,255,0.09),rgba(255,255,255,0.055));border:1px solid #E8B04B;border-radius:16px;padding:22px;text-align:center;margin-bottom:16px;">
        <p style="margin:0;color:#97A3C9;font-size:11px;letter-spacing:1px;">MONTANT RECU</p>
        <p style="margin:6px 0 0;color:#E8B04B;font-size:32px;font-weight:900;">${montantRecu}</p>
      </div>
      <div style="display:flex;justify-content:space-between;padding:4px 0;"><span style="color:#97A3C9;font-size:12px;">Total verse ce cycle</span><span style="color:#F5F2EA;font-size:12px;font-weight:700;">${totalVerse}</span></div>
      <div style="display:flex;justify-content:space-between;padding:4px 0;"><span style="color:#97A3C9;font-size:12px;">Statut</span><span style="color:${statut.includes("PAYE")?"#34D399":"#E8B04B"};font-size:12px;font-weight:800;">${statut}</span></div>
    </div>
    <div style="padding:16px 40px 30px;text-align:center;border-top:1px solid rgba(255,255,255,0.09);">
      <p style="margin:0;color:#97A3C9;font-size:11px;">Merci ${prenom} pour votre confiance !</p>
      <p style="margin:4px 0 0;color:rgba(255,255,255,0.14);font-size:10px;">THT - Tontine Habi Traore</p>
    </div>
  `;
  document.body.appendChild(div);
  const {default:html2canvas}=await import("html2canvas");
  const canvas=await html2canvas(div,{backgroundColor:"#060B21",scale:2});
  document.body.removeChild(div);
  // JPEG plutot que PNG : un recu pese ainsi 4 a 5 fois moins (economie de stockage
  // Supabase et de donnees mobiles pour les membres qui le consultent). La qualite
  // reste haute (0.9) pour que les chiffres et le texte restent parfaitement nets.
  return new Promise(resolve=>canvas.toBlob(blob=>resolve(blob),"image/jpeg",0.9));
};

const partagerImage=async(blob,filename,titre,texte)=>{
  try{
    const file=new File([blob],filename,{type:blob?.type||"image/jpeg"});
    if(navigator.share&&navigator.canShare&&navigator.canShare({files:[file]})){
      await navigator.share({files:[file],title:titre,text:texte});
      return true;
    }
  }catch(e){if(e.name==="AbortError")return true;}
  const url=URL.createObjectURL(blob);
  const a=document.createElement("a");a.href=url;a.download=filename;document.body.appendChild(a);a.click();document.body.removeChild(a);
  setTimeout(()=>URL.revokeObjectURL(url),3000);
  return false;
};

// maxDim/quality par defaut pour les PREUVES (photo d'argent, capture mobile money) :
// il faut pouvoir relire des chiffres, donc on reste genereux.
// Pour les AVATARS, on passe explicitement TAILLE_AVATAR : ils s'affichent entre 22 et
// 76 px, donc 320 px suffit largement (retina inclus) et pese ~7x moins.
// --- Empreinte d'image (anti-reutilisation des preuves) -------------------------
// Une preuve de paiement (capture Orange Money/Wave, photo de billets) est unique a
// une transaction. La fraude la plus simple et la plus courante consiste a renvoyer LA
// MEME image a chaque cycle. On calcule donc une empreinte du fichier : si la meme
// image a deja servi dans cette tontine, on refuse.
//
// A savoir, en toute franchise : cela n'empeche PAS quelqu'un de photographier de
// l'argent qui n'est pas le sien, ni de fabriquer une fausse capture. Aucun controle
// technique ne peut prouver qu'un paiement a reellement eu lieu -- seule la
// confirmation humaine de la creatrice fait foi. Ceci bloque la triche facile, rien de plus.
const empreinteImage = async (source) => {
  try {
    // On prend les octets du fichier d'ORIGINE (avant compression) : l'empreinte est
    // ainsi identique quel que soit le telephone ou le navigateur.
    const buf = source instanceof Blob ? await source.arrayBuffer()
              : await (await fetch(source)).arrayBuffer();
    const digest = await crypto.subtle.digest("SHA-256", buf);
    return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, "0")).join("");
  } catch { return null; } // navigateur trop ancien : on laisse passer plutot que bloquer
};

// --- Lecture automatique de la preuve de paiement -------------------------------
// Envoie la photo a la fonction serveur verifier-preuve, qui la fait lire par l'IA et
// renvoie ce qu'elle contient : operateur, montant, date. Sert a deux choses --
// refuser d'emblee une photo qui n'a rien a voir avec un paiement, et afficher a la
// creatrice "Orange Money - 25 000 F - 30/07" a cote de l'image.
//
// LE DOUTE PROFITE TOUJOURS A LA MEMBRE : panne, quota atteint, reponse illisible,
// image trop lourde -> la photo est acceptee, simplement non verifiee. Bloquer un vrai
// paiement parce qu'un service exterieur est en panne serait bien pire que laisser
// passer une image douteuse, que la creatrice verra de toute facon avant de confirmer.
const analyserPreuve = async (source, montantAttendu) => {
  try {
    const blob = source instanceof Blob ? source : await (await fetch(source)).blob();
    if (blob.size > 4 * 1024 * 1024) return { verdict: "indetermine" };
    const base64 = await new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(String(fr.result).split(",")[1] || "");
      fr.onerror = reject;
      fr.readAsDataURL(blob);
    });
    if (!base64) return { verdict: "indetermine" };
    const { data, error } = await supabase.functions.invoke("verifier-preuve", {
      body: { image_base64: base64, mime_type: blob.type || "image/jpeg", montant_attendu: montantAttendu || null },
    });
    if (error || !data) return { verdict: "indetermine" };
    return data;
  } catch { return { verdict: "indetermine" }; }
};

// Resume lisible de ce que l'IA a lu : "Orange Money - 25 000 F - 30/07/2026".
// Renvoie une chaine vide s'il n'y a rien de sur a montrer.
const resumePreuve = (a) => {
  if (!a) return "";
  const bouts = [];
  if (a.operateur) bouts.push(a.operateur);
  else if (a.type === "billets") bouts.push("Billets");
  else if (a.type === "recu_papier") bouts.push("Recu papier");
  else if (a.type === "sms") bouts.push("SMS de confirmation");
  if (a.montant) bouts.push(fmtFCFA(a.montant));
  if (a.date) bouts.push(a.date);
  return bouts.join(" · ");
};

const TAILLE_AVATAR = 320;
const QUALITE_AVATAR = 0.78;
const compressImage = (file, maxDim = 1024, quality = 0.82) => new Promise((resolve, reject) => {
  const img = new Image();
  const url = URL.createObjectURL(file);
  img.onload = () => {
    URL.revokeObjectURL(url);
    let { width, height } = img;
    if (width > maxDim || height > maxDim) {
      if (width > height) { height = Math.round(height * maxDim / width); width = maxDim; }
      else { width = Math.round(width * maxDim / height); height = maxDim; }
    }
    const canvas = document.createElement("canvas");
    canvas.width = width; canvas.height = height;
    canvas.getContext("2d").drawImage(img, 0, 0, width, height);
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("compression impossible")), "image/jpeg", quality);
  };
  img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("image invalide ou format non reconnu")); };
  img.src = url;
});

const calcVotePret = (pret, votesList, nbMembres) => {
  const eligible = Math.max(0, (nbMembres||0) - 1);
  const vs = votesList || [];
  const oui = vs.filter(v => v.valeur==="oui").length;
  const non = vs.filter(v => v.valeur==="non").length;
  const total = oui + non;
  const majoriteOui = eligible>0 && oui*2 > eligible;
  const majoriteNon = eligible>0 && total>0 && non*2 >= eligible;
  // Cas particulier : personne d'autre que l'emprunteur dans la tontine, donc aucun
  // vote possible. Sans cette regle la demande resterait bloquee indefiniment en
  // attente ; c'est la creatrice qui tranche directement.
  const decision = eligible===0 ? "accepte" : (majoriteOui ? "accepte" : (majoriteNon ? "refuse" : "en_cours"));
  return { eligible, oui, non, total, decision };
};

const s = (str) => String(str ?? "").replace(/[<>"'`]/g, "").slice(0, 300);
const sPhone = (p) => String(p).replace(/[^\d+\s]/g, "").slice(0, 16);
const sPin = (p) => String(p).replace(/\D/g, "").slice(0, 4);
const fmtFCFA = (n) => Number(n).toLocaleString("fr-FR") + " FCFA";

// --- Limite de membres par tontine (plan gratuit) ------------------------------
// Base : 15 membres. Bonus de parrainage : +1 membre tous les 5 filleul(e)s qui ont
// cree un compte avec le code de l'utilisatrice (5 -> 16, 10 -> 17, 15 -> 18...).
// Le plan Premium et les admins n'ont aucune limite.
// --- Pastilles "non lu" --------------------------------------------------------
// Le badge du systeme sur l'icone de l'app (ex: "2") ne dit pas OU regarder une fois
// l'application ouverte. On garde donc, sur le telephone de chacune, la date de
// derniere visite de chaque section pour pouvoir afficher une pastille au bon endroit.
// Stockage local volontaire : c'est propre a l'appareil et ca evite d'ecrire en base
// a chaque ouverture d'onglet.
const cleVu = (userId, groupeId, section) => `tht:vu:${userId}:${groupeId}:${section}`;

const dateVu = (userId, groupeId, section) => {
  try { return localStorage.getItem(cleVu(userId, groupeId, section)) || null; }
  catch { return null; }
};

const marquerVu = (userId, groupeId, section) => {
  try { localStorage.setItem(cleVu(userId, groupeId, section), new Date().toISOString()); }
  catch { /* mode prive / stockage plein : la pastille restera, sans gravite */ }
};

// Pastille ronde : un nombre si on sait compter, sinon un simple point d'alerte.
const Pastille = ({ n, point=false }) => {
  if (!point && !(n > 0)) return null;
  const commun = { position:"absolute", top:-5, right:-5, background:"#FB7185", color:"#fff",
                   borderRadius:99, border:"2px solid #0B1433", lineHeight:1, fontWeight:800 };
  if (point) return <span aria-label="nouveau" style={{...commun, width:12, height:12}}/>;
  return (
    <span aria-label={`${n} non lu`} style={{...commun, minWidth:19, height:19, fontSize:10.5,
      display:"flex", alignItems:"center", justifyContent:"center", padding:"0 4px"}}>
      {n > 99 ? "99+" : n}
    </span>
  );
};

// Questions/jour offertes a HABY sur le plan gratuit. DOIT rester identique a
// QUOTA_GRATUIT_PAR_JOUR dans supabase/functions/haby-chat/index.ts (c'est la fonction
// serveur qui applique reellement la limite ; ici c'est uniquement pour l'affichage).
const QUOTA_HABY_GRATUIT = 15;

const LIMITE_MEMBRES_BASE = 15;
const FILLEULS_PAR_MEMBRE_BONUS = 5;
const bonusParrainage = (user) => Math.floor((user?.filleulsCount || 0) / FILLEULS_PAR_MEMBRE_BONUS);
// Un abonnement Premium n'est valable que jusqu'a sa date de fin. La tache quotidienne
// `expirer_premium` repasse les comptes echus en "free" cote base, mais on verifie AUSSI
// la date ici : sinon un compte expire garderait l'acces illimite jusqu'au passage de la
// tache (jusqu'a 24 h de Premium offert, chaque mois, a chaque abonnee non renouvelee).
// Cas particulier : une date absente (NULL) signifie un Premium accorde avant la mise en
// place des dates de fin -- on le laisse actif plutot que de couper l'acces d'une
// abonnee qui a paye. Ils sont signales en rouge dans l'ecran Admin.
const premiumActif = (user) => {
  if (user?.plan !== "premium") return false;
  if (!user?.premiumExpireLe) return true;
  const fin = new Date(user.premiumExpireLe + "T23:59:59Z");
  return !isNaN(fin.getTime()) && fin.getTime() >= Date.now();
};
const estIllimite = (user) => premiumActif(user) || user?.role === "admin";
const limiteMembres = (user) => estIllimite(user) ? Infinity : LIMITE_MEMBRES_BASE + bonusParrainage(user);

// Date d'echeance du cycle suivant. MEME logique que l'Edge Function rollover-cycles
// (supabase/functions/rollover-cycles/index.ts) : les deux doivent rester identiques,
// sinon la cloture manuelle et la cloture automatique donneraient des dates differentes.
const prochaineEcheance = (dateStr, frequence) => {
  const d = dateStr ? new Date(dateStr + "T00:00:00Z") : new Date();
  if (isNaN(d.getTime())) return null;
  if (frequence === "Hebdo") d.setUTCDate(d.getUTCDate() + 7);
  else if (frequence === "Bimensuel") d.setUTCDate(d.getUTCDate() + 15);
  else d.setUTCMonth(d.getUTCMonth() + 1);
  return d.toISOString().split("T")[0];
};

const uploadPhoto = async (file, prefix) => {
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
  const path = `${prefix}/${Date.now()}-${Math.random().toString(36).slice(2,8)}.${ext}`;
  const { error } = await supabase.storage.from("photos").upload(path, file, { upsert: true });
  if (error) throw error;
  const { data } = supabase.storage.from("photos").getPublicUrl(path);
  return data.publicUrl;
};

const uploadAudio = async (blob, groupeId) => {
  const path = `messages/${groupeId}/${Date.now()}-${Math.random().toString(36).slice(2,8)}.webm`;
  const { error } = await supabase.storage.from("audio").upload(path, blob, { upsert: true, contentType: "audio/webm" });
  if (error) throw error;
  const { data } = supabase.storage.from("audio").getPublicUrl(path);
  return data.publicUrl;
};

const notifyMessage = (recipientIds, senderName, isAudio, url) => {
  const title = "THT - Nouveau message";
  const body = isAudio ? `${senderName} t'a envoye un message vocal` : `${senderName} : nouveau message`;
  [...new Set((recipientIds||[]).filter(Boolean))].forEach(uid=>{
    supabase.functions.invoke("send-push",{body:{user_id:uid,title,body,url:url||"/"}}).catch(()=>{});
  });
};

// Duree maximale d'un message vocal. Sans limite, un enregistrement oublie pouvait durer
// des minutes et peser lourd : le stockage Supabase se remplit vite et les membres qui
// l'ecoutent consomment leur forfait pour rien. 90 s suffisent pour un message parle.
const DUREE_MAX_VOCAL_MS = 90000;
// Debit audio volontairement bas : la voix reste tres claire a 24 kbit/s, mais le fichier
// pese environ 3 fois moins qu'au reglage par defaut du telephone.
const DEBIT_AUDIO = 24000;

function useAudioRecorder(){
  const [recording,setRecording]=useState(false);
  const mediaRef=useRef(null);
  const chunksRef=useRef([]);
  const minuterieRef=useRef(null);
  const start=async()=>{
    try{
      const stream=await navigator.mediaDevices.getUserMedia({audio:true});
      let mr;
      try{ mr=new MediaRecorder(stream,{audioBitsPerSecond:DEBIT_AUDIO}); }
      catch{ mr=new MediaRecorder(stream); } // vieux navigateur : reglage par defaut
      chunksRef.current=[];
      mr.ondataavailable=(e)=>{if(e.data.size>0)chunksRef.current.push(e.data);};
      mr.start();
      mediaRef.current=mr;
      setRecording(true);
      // Arret automatique a la duree maximale
      clearTimeout(minuterieRef.current);
      minuterieRef.current=setTimeout(()=>{
        try{ if(mediaRef.current&&mediaRef.current.state==="recording")mediaRef.current.stop(); }catch{/* deja arrete */}
      },DUREE_MAX_VOCAL_MS);
      return true;
    }catch{ return false; }
  };
  const stop=()=>new Promise((resolve)=>{
    clearTimeout(minuterieRef.current);
    const mr=mediaRef.current;
    if(!mr){resolve(null);return;}
    if(mr.state==="inactive"){ // deja arrete par la minuterie
      const blob=new Blob(chunksRef.current,{type:"audio/webm"});
      setRecording(false);resolve(blob);return;
    }
    mr.onstop=()=>{
      const blob=new Blob(chunksRef.current,{type:"audio/webm"});
      mr.stream.getTracks().forEach((t)=>t.stop());
      setRecording(false);
      resolve(blob);
    };
    mr.stop();
  });
  return {recording,start,stop};
}

const I18N={
  fr:{
    connexion:"Connexion",inscription:"Inscription",bienvenue:"Bienvenue",
    accueil:"Accueil",epargne:"Épargne",profil:"Profil",
    mesTontines:"Mes Tontines",creer:"Créer",ajouter:"Ajouter",modifier:"Modifier",supprimer:"Supprimer",
    enregistrer:"Enregistrer",annuler:"Annuler",gratuit:"GRATUIT",premium:"PREMIUM",
    notifications:"Activer les notifications",lierWA:"Lier WhatsApp",changerPin:"Changer mon PIN",
    exporterDonnees:"Exporter mes données",contacterSupport:"Contacter le support",deconnexion:"Déconnexion",
    panneauAdmin:"Panneau Administrateur",langue:"Langue",
    mesEpargnes:"Mes épargnes",caisseSociale:"Caisse sociale",
    membresEnRetard:"membre(s) en retard",cliquezTontine:"Cliquez sur une tontine",
    tabMembres:"Membres",tabBureau:"Bureau",tabTirage:"Tirage",tabPrets:"Prêts",tabReunions:"Réunions",
    tabEvenements:"Événements",tabTaches:"Tâches",tabSocial:"Message",tabRapport:"Rapport",
    mesCagnottes:"Mes Cagnottes",cagnottesNav:"Cagnottes",lectureSeule:"Lecture seule",maSituation:"Ma situation",
    statut:"Statut",aJour:"À jour",enRetard:"En retard",membresGroupe:"Membres du groupe",
    ecrisAHaby:"Écris à HABY...",panneauUtilisatrices:"Utilisatrices inscrites",
  },
  en:{
    connexion:"Log in",inscription:"Sign up",bienvenue:"Welcome",
    accueil:"Home",epargne:"Savings",profil:"Profile",
    mesTontines:"My Tontines",creer:"Create",ajouter:"Add",modifier:"Edit",supprimer:"Delete",
    enregistrer:"Save",annuler:"Cancel",gratuit:"FREE",premium:"PREMIUM",
    notifications:"Enable notifications",lierWA:"Link WhatsApp",changerPin:"Change my PIN",
    exporterDonnees:"Export my data",contacterSupport:"Contact support",deconnexion:"Log out",
    panneauAdmin:"Admin Panel",langue:"Language",
    mesEpargnes:"My savings",caisseSociale:"Social fund",
    membresEnRetard:"member(s) late",cliquezTontine:"Click on a tontine",
    tabMembres:"Members",tabBureau:"Board",tabTirage:"Draw",tabPrets:"Loans",tabReunions:"Meetings",
    tabEvenements:"Events",tabTaches:"Tasks",tabSocial:"Message",tabRapport:"Report",
    mesCagnottes:"My Fundraisers",cagnottesNav:"Funds",lectureSeule:"Read only",maSituation:"My situation",
    statut:"Status",aJour:"Up to date",enRetard:"Late",membresGroupe:"Group members",
    ecrisAHaby:"Write to HABY...",panneauUtilisatrices:"Registered users",
  },
  ar:{
    connexion:"تسجيل الدخول",inscription:"إنشاء حساب",bienvenue:"مرحبا",
    accueil:"الرئيسية",epargne:"الادخار",profil:"الملف الشخصي",
    mesTontines:"جمعياتي",creer:"إنشاء",ajouter:"إضافة",modifier:"تعديل",supprimer:"حذف",
    enregistrer:"حفظ",annuler:"إلغاء",gratuit:"مجاني",premium:"بريميوم",
    notifications:"تفعيل الإشعارات",lierWA:"ربط واتساب",changerPin:"تغيير الرمز السري",
    exporterDonnees:"تصدير بياناتي",contacterSupport:"الاتصال بالدعم",deconnexion:"تسجيل الخروج",
    panneauAdmin:"لوحة الإدارة",langue:"اللغة",
    mesEpargnes:"مدخراتي",caisseSociale:"الصندوق الاجتماعي",
    membresEnRetard:"عضو(ة) متأخر(ة)",cliquezTontine:"اضغطي على جمعية",
    tabMembres:"الأعضاء",tabBureau:"المكتب",tabTirage:"القرعة",tabPrets:"القروض",tabReunions:"الاجتماعات",
    tabEvenements:"الأحداث",tabTaches:"المهام",tabSocial:"رسالة",tabRapport:"التقرير",
    mesCagnottes:"صناديقي",cagnottesNav:"الصناديق",lectureSeule:"قراءة فقط",maSituation:"وضعيتي",
    statut:"الحالة",aJour:"محدث",enRetard:"متأخر",membresGroupe:"أعضاء المجموعة",
    ecrisAHaby:"اكتبي لهابي...",panneauUtilisatrices:"المستخدمات المسجلات",
  },
  bm:{
    connexion:"Login",inscription:"I tɔgɔ sɛbɛn",bienvenue:"I bisimila",
    accueil:"So kɔnɔ",epargne:"Mara",profil:"I ka kunnafoni",
    mesTontines:"N ka tontinw",creer:"Dilan",ajouter:"Fara a kan",modifier:"Yɛlɛma",supprimer:"Bɔ a la",
    enregistrer:"Mara",annuler:"Dabila",gratuit:"FU",premium:"PREMIUM",
    notifications:"Kunnafoniw daminɛ",lierWA:"WhatsApp sirilen",changerPin:"N ka gundo yɛlɛma",
    exporterDonnees:"N ka kunnafoniw bɔ",contacterSupport:"Dɛmɛbaga wele",deconnexion:"Bɔ",
    panneauAdmin:"Kuntigiya yɔrɔ",langue:"Kan",
    mesEpargnes:"N ka mara",caisseSociale:"Jama ka wari",
    membresEnRetard:"tɔnden(w) tɔnɔlen",cliquezTontine:"I bolo tontine kan",
    tabMembres:"Tɔndenw",tabBureau:"Ka biro",tabTirage:"Filɛli",tabPrets:"Juruw",tabReunions:"Lajɛw",
    tabEvenements:"Kow",tabTaches:"Baaraw",tabSocial:"Bataki",tabRapport:"Kunnafoni",
    mesCagnottes:"N ka waribɔlanw",cagnottesNav:"Waribɔlanw",lectureSeule:"Kalanni dɔrɔn",maSituation:"N ka cogoya",
    statut:"Cogoya",aJour:"A bɛnnen",enRetard:"A tɔnɔlen",membresGroupe:"Jɛkulu tɔndenw",
    ecrisAHaby:"HABY ye sɛbɛn...",panneauUtilisatrices:"Baarakɛlaw tɔgɔsɛbɛnnen",
  },
};
let CURRENT_LANG="fr";
const setAppLang=(l)=>{CURRENT_LANG=I18N[l]?l:"fr";document.documentElement.dir=CURRENT_LANG==="ar"?"rtl":"ltr";document.documentElement.lang=CURRENT_LANG;};
const t=(key)=>I18N[CURRENT_LANG]?.[key]||I18N.fr[key]||key;

const SpeechRec = typeof window!=="undefined" ? (window.SpeechRecognition||window.webkitSpeechRecognition) : null;
function useVoiceInput(onResult,onToast){
  const recRef=useRef(null);
  const [listening,setListening]=useState(false);
  const toggle=()=>{
    if(!SpeechRec){onToast&&onToast("Dictee vocale non disponible sur ce navigateur","error");return;}
    if(listening){recRef.current?.stop();setListening(false);return;}
    const rec=new SpeechRec();
    rec.lang="fr-FR";rec.interimResults=false;rec.maxAlternatives=1;
    rec.onresult=(e)=>{const t=e.results[0][0].transcript;onResult(t);};
    rec.onend=()=>setListening(false);
    rec.onerror=()=>{setListening(false);onToast&&onToast("Erreur de reconnaissance vocale","error");};
    recRef.current=rec;rec.start();setListening(true);
  };
  return {listening,toggle};
}



const Avatar = ({ prenom, photo, size=40, gold=false }) => {
  const [err, setErr] = useState(false);
  return (
    <div style={{width:size,height:size,borderRadius:"50%",background:gold?"linear-gradient(135deg,#FFE9B4 0%,#E8B04B 48%,#C38427 100%)":"linear-gradient(135deg,rgba(255,255,255,0.09),rgba(255,255,255,0.14))",overflow:"hidden",flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",border:gold?"2px solid #E8B04B":"none"}}>
      {photo&&!err?<img src={photo} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}} onError={()=>setErr(true)}/>:<span style={{color:gold?"#1B1203":"#E8B04B",fontWeight:900,fontSize:size*0.38}}>{(prenom||"?")[0].toUpperCase()}</span>}
    </div>
  );
};

const Badge = ({score}) => {
  const c = score>=90?{bg:"#E8B04B",t:"Or",fg:"#1B1203"}:score>=70?{bg:"#0F7A55",t:"Bien",fg:"#FFFFFF"}:{bg:"#E0526A",t:"Retard",fg:"#FFFFFF"};
  return <span style={{background:c.bg,color:c.fg,borderRadius:99,padding:"2px 8px",fontSize:11,fontWeight:700}}>{c.t}</span>;
};

const Bar = ({pct,c}) => (
  <div style={{background:"rgba(255,255,255,0.09)",borderRadius:99,height:6,overflow:"hidden",marginTop:10}}>
    <div style={{width:`${Math.min(pct,100)}%`,height:"100%",background:c,borderRadius:99,transition:"width .5s"}}/>
  </div>
);

const Toast = ({msg,type="success",onClose}) => {
  useEffect(()=>{const t=setTimeout(onClose,3200);return()=>clearTimeout(t);},[]);
  const bg=type==="error"?"#E0526A":type==="warn"?"#B07A22":"#0F7A55";
  return <div style={{position:"fixed",bottom:90,left:"50%",transform:"translateX(-50%)",background:bg,color:"#F5F2EA",padding:"12px 22px",borderRadius:14,fontWeight:700,zIndex:9999,fontSize:14,boxShadow:"0 8px 30px rgba(0,0,0,0.5)",maxWidth:340,textAlign:"center"}}>{msg}</div>;
};

const Modal = ({children,onClose}) => (
  <div className="tht-scrim" style={{position:"fixed",inset:0,zIndex:300,display:"flex",alignItems:"flex-end",justifyContent:"center"}} onClick={onClose}>
    <div className="tht-modal" style={{background:"rgba(255,255,255,0.055)",borderRadius:"24px 24px 0 0",padding:"20px 20px 44px",width:"100%",maxWidth:440,border:"1px solid rgba(255,255,255,0.09)",borderBottom:"none",maxHeight:"92vh",overflowY:"auto"}} onClick={e=>e.stopPropagation()}>{children}</div>
  </div>
);

const MH = ({title,onClose}) => (
  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
    <h3 style={{color:"#F5F2EA",margin:0,fontSize:18,fontWeight:800}}>{title}</h3>
    <button onClick={onClose} style={{background:"none",border:"none",color:"#97A3C9",fontSize:22,cursor:"pointer"}}>x</button>
  </div>
);

const PAYS_LISTE=[
  {code:"+223",nom:"Mali",drapeau:"🇲🇱"},
  {code:"+225",nom:"Cote d'Ivoire",drapeau:"🇨🇮"},
  {code:"+221",nom:"Senegal",drapeau:"🇸🇳"},
  {code:"+237",nom:"Cameroun",drapeau:"🇨🇲"},
  {code:"+226",nom:"Burkina Faso",drapeau:"🇧🇫"},
  {code:"+227",nom:"Niger",drapeau:"🇳🇪"},
  {code:"+224",nom:"Guinee",drapeau:"🇬🇳"},
  {code:"+228",nom:"Togo",drapeau:"🇹🇬"},
  {code:"+229",nom:"Benin",drapeau:"🇧🇯"},
  {code:"+233",nom:"Ghana",drapeau:"🇬🇭"},
  {code:"+234",nom:"Nigeria",drapeau:"🇳🇬"},
  {code:"+220",nom:"Gambie",drapeau:"🇬🇲"},
  {code:"+222",nom:"Mauritanie",drapeau:"🇲🇷"},
  {code:"+245",nom:"Guinee-Bissau",drapeau:"🇬🇼"},
  {code:"+238",nom:"Cap-Vert",drapeau:"🇨🇻"},
  {code:"+232",nom:"Sierra Leone",drapeau:"🇸🇱"},
  {code:"+231",nom:"Liberia",drapeau:"🇱🇷"},
  {code:"+235",nom:"Tchad",drapeau:"🇹🇩"},
  {code:"+236",nom:"Centrafrique",drapeau:"🇨🇫"},
  {code:"+241",nom:"Gabon",drapeau:"🇬🇦"},
  {code:"+242",nom:"Congo",drapeau:"🇨🇬"},
  {code:"+243",nom:"RD Congo",drapeau:"🇨🇩"},
  {code:"+212",nom:"Maroc",drapeau:"🇲🇦"},
  {code:"+213",nom:"Algerie",drapeau:"🇩🇿"},
  {code:"+216",nom:"Tunisie",drapeau:"🇹🇳"},
  {code:"+20",nom:"Egypte",drapeau:"🇪🇬"},
  {code:"+33",nom:"France",drapeau:"🇫🇷"},
  {code:"+1",nom:"Etats-Unis / Canada",drapeau:"🇺🇸"},
  {code:"+34",nom:"Espagne",drapeau:"🇪🇸"},
  {code:"+39",nom:"Italie",drapeau:"🇮🇹"},
  {code:"+49",nom:"Allemagne",drapeau:"🇩🇪"},
  {code:"+44",nom:"Royaume-Uni",drapeau:"🇬🇧"},
  {code:"+32",nom:"Belgique",drapeau:"🇧🇪"},
  {code:"+41",nom:"Suisse",drapeau:"🇨🇭"},
  {code:"+31",nom:"Pays-Bas",drapeau:"🇳🇱"},
  {code:"+351",nom:"Portugal",drapeau:"🇵🇹"},
  {code:"+55",nom:"Bresil",drapeau:"🇧🇷"},
  {code:"+86",nom:"Chine",drapeau:"🇨🇳"},
  {code:"+91",nom:"Inde",drapeau:"🇮🇳"},
  {code:"+971",nom:"Emirats Arabes Unis",drapeau:"🇦🇪"},
  {code:"+966",nom:"Arabie Saoudite",drapeau:"🇸🇦"},
  {code:"+93",nom:"Afghanistan",drapeau:"🇦🇫"},
  {code:"+27",nom:"Afrique du Sud",drapeau:"🇿🇦"},
  {code:"+358",nom:"Aland",drapeau:"🇦🇽"},
  {code:"+355",nom:"Albanie",drapeau:"🇦🇱"},
  {code:"+376",nom:"Andorre",drapeau:"🇦🇩"},
  {code:"+244",nom:"Angola",drapeau:"🇦🇴"},
  {code:"+1264",nom:"Anguilla",drapeau:"🇦🇮"},
  {code:"+672",nom:"Antarctique",drapeau:"🇦🇶"},
  {code:"+1268",nom:"Antigua-et-Barbuda",drapeau:"🇦🇬"},
  {code:"+54",nom:"Argentine",drapeau:"🇦🇷"},
  {code:"+374",nom:"Armenie",drapeau:"🇦🇲"},
  {code:"+297",nom:"Aruba",drapeau:"🇦🇼"},
  {code:"+61",nom:"Australie",drapeau:"🇦🇺"},
  {code:"+43",nom:"Autriche",drapeau:"🇦🇹"},
  {code:"+994",nom:"Azerbaidjan",drapeau:"🇦🇿"},
  {code:"+1242",nom:"Bahamas",drapeau:"🇧🇸"},
  {code:"+973",nom:"Bahrein",drapeau:"🇧🇭"},
  {code:"+880",nom:"Bangladesh",drapeau:"🇧🇩"},
  {code:"+1246",nom:"Barbade",drapeau:"🇧🇧"},
  {code:"+501",nom:"Belize",drapeau:"🇧🇿"},
  {code:"+1441",nom:"Bermudes",drapeau:"🇧🇲"},
  {code:"+975",nom:"Bhoutan",drapeau:"🇧🇹"},
  {code:"+375",nom:"Bielorussie",drapeau:"🇧🇾"},
  {code:"+591",nom:"Bolivie",drapeau:"🇧🇴"},
  {code:"+387",nom:"Bosnie-Herzegovine",drapeau:"🇧🇦"},
  {code:"+267",nom:"Botswana",drapeau:"🇧🇼"},
  {code:"+673",nom:"Brunei Darussalam",drapeau:"🇧🇳"},
  {code:"+359",nom:"Bulgarie",drapeau:"🇧🇬"},
  {code:"+257",nom:"Burundi",drapeau:"🇧🇮"},
  {code:"+855",nom:"Cambodge",drapeau:"🇰🇭"},
  {code:"+56",nom:"Chili",drapeau:"🇨🇱"},
  {code:"+357",nom:"Chypre",drapeau:"🇨🇾"},
  {code:"+57",nom:"Colombie",drapeau:"🇨🇴"},
  {code:"+269",nom:"Comores",drapeau:"🇰🇲"},
  {code:"+850",nom:"Coree du Nord",drapeau:"🇰🇵"},
  {code:"+82",nom:"Coree du Sud",drapeau:"🇰🇷"},
  {code:"+506",nom:"Costa Rica",drapeau:"🇨🇷"},
  {code:"+385",nom:"Croatie",drapeau:"🇭🇷"},
  {code:"+53",nom:"Cuba",drapeau:"🇨🇺"},
  {code:"+599",nom:"Curacao",drapeau:"🇨🇼"},
  {code:"+45",nom:"Danemark",drapeau:"🇩🇰"},
  {code:"+253",nom:"Djibouti",drapeau:"🇩🇯"},
  {code:"+1767",nom:"Dominique",drapeau:"🇩🇲"},
  {code:"+503",nom:"El Salvador",drapeau:"🇸🇻"},
  {code:"+593",nom:"Equateur",drapeau:"🇪🇨"},
  {code:"+291",nom:"Erythree",drapeau:"🇪🇷"},
  {code:"+372",nom:"Estonie",drapeau:"🇪🇪"},
  {code:"+251",nom:"Ethiopie",drapeau:"🇪🇹"},
  {code:"+679",nom:"Fidji",drapeau:"🇫🇯"},
  {code:"+995",nom:"Georgie",drapeau:"🇬🇪"},
  {code:"+350",nom:"Gibraltar",drapeau:"🇬🇮"},
  {code:"+30",nom:"Grece",drapeau:"🇬🇷"},
  {code:"+1473",nom:"Grenade",drapeau:"🇬🇩"},
  {code:"+299",nom:"Groenland",drapeau:"🇬🇱"},
  {code:"+590",nom:"Guadeloupe",drapeau:"🇬🇵"},
  {code:"+1671",nom:"Guam",drapeau:"🇬🇺"},
  {code:"+502",nom:"Guatemala",drapeau:"🇬🇹"},
  {code:"+240",nom:"Guinee equatoriale",drapeau:"🇬🇶"},
  {code:"+592",nom:"Guyana",drapeau:"🇬🇾"},
  {code:"+594",nom:"Guyane francaise",drapeau:"🇬🇫"},
  {code:"+509",nom:"Haiti",drapeau:"🇭🇹"},
  {code:"+504",nom:"Honduras",drapeau:"🇭🇳"},
  {code:"+852",nom:"Hong Kong",drapeau:"🇭🇰"},
  {code:"+36",nom:"Hongrie",drapeau:"🇭🇺"},
  {code:"+47",nom:"Ile Bouvet",drapeau:"🇧🇻"},
  {code:"+1345",nom:"Iles Caimans",drapeau:"🇰🇾"},
  {code:"+682",nom:"Iles Cook",drapeau:"🇨🇰"},
  {code:"+298",nom:"Iles Feroe",drapeau:"🇫🇴"},
  {code:"+500",nom:"Iles Malouines",drapeau:"🇫🇰"},
  {code:"+1670",nom:"Iles Mariannes du Nord",drapeau:"🇲🇵"},
  {code:"+692",nom:"Iles Marshall",drapeau:"🇲🇭"},
  {code:"+677",nom:"Iles Salomon",drapeau:"🇸🇧"},
  {code:"+1649",nom:"Iles Turques-et-Caiques",drapeau:"🇹🇨"},
  {code:"+1340",nom:"Iles vierges americaines",drapeau:"🇻🇮"},
  {code:"+1284",nom:"Iles vierges britanniques",drapeau:"🇻🇬"},
  {code:"+62",nom:"Indonesie",drapeau:"🇮🇩"},
  {code:"+964",nom:"Irak",drapeau:"🇮🇶"},
  {code:"+98",nom:"Iran",drapeau:"🇮🇷"},
  {code:"+353",nom:"Irlande",drapeau:"🇮🇪"},
  {code:"+354",nom:"Islande",drapeau:"🇮🇸"},
  {code:"+972",nom:"Israel",drapeau:"🇮🇱"},
  {code:"+1876",nom:"Jamaique",drapeau:"🇯🇲"},
  {code:"+81",nom:"Japon",drapeau:"🇯🇵"},
  {code:"+962",nom:"Jordanie",drapeau:"🇯🇴"},
  {code:"+254",nom:"Kenya",drapeau:"🇰🇪"},
  {code:"+996",nom:"Kirghizistan",drapeau:"🇰🇬"},
  {code:"+686",nom:"Kiribati",drapeau:"🇰🇮"},
  {code:"+383",nom:"Kosovo",drapeau:"🇽🇰"},
  {code:"+965",nom:"Koweit",drapeau:"🇰🇼"},
  {code:"+856",nom:"Laos",drapeau:"🇱🇦"},
  {code:"+266",nom:"Lesotho",drapeau:"🇱🇸"},
  {code:"+371",nom:"Lettonie",drapeau:"🇱🇻"},
  {code:"+961",nom:"Liban",drapeau:"🇱🇧"},
  {code:"+218",nom:"Libye",drapeau:"🇱🇾"},
  {code:"+423",nom:"Liechtenstein",drapeau:"🇱🇮"},
  {code:"+370",nom:"Lituanie",drapeau:"🇱🇹"},
  {code:"+352",nom:"Luxembourg",drapeau:"🇱🇺"},
  {code:"+853",nom:"Macao",drapeau:"🇲🇴"},
  {code:"+389",nom:"Macedoine du Nord",drapeau:"🇲🇰"},
  {code:"+261",nom:"Madagascar",drapeau:"🇲🇬"},
  {code:"+60",nom:"Malaisie",drapeau:"🇲🇾"},
  {code:"+265",nom:"Malawi",drapeau:"🇲🇼"},
  {code:"+960",nom:"Maldives",drapeau:"🇲🇻"},
  {code:"+356",nom:"Malte",drapeau:"🇲🇹"},
  {code:"+596",nom:"Martinique",drapeau:"🇲🇶"},
  {code:"+230",nom:"Maurice",drapeau:"🇲🇺"},
  {code:"+52",nom:"Mexique",drapeau:"🇲🇽"},
  {code:"+691",nom:"Micronesie",drapeau:"🇫🇲"},
  {code:"+373",nom:"Moldavie",drapeau:"🇲🇩"},
  {code:"+377",nom:"Monaco",drapeau:"🇲🇨"},
  {code:"+976",nom:"Mongolie",drapeau:"🇲🇳"},
  {code:"+382",nom:"Montenegro",drapeau:"🇲🇪"},
  {code:"+1664",nom:"Montserrat",drapeau:"🇲🇸"},
  {code:"+258",nom:"Mozambique",drapeau:"🇲🇿"},
  {code:"+95",nom:"Myanmar",drapeau:"🇲🇲"},
  {code:"+264",nom:"Namibie",drapeau:"🇳🇦"},
  {code:"+674",nom:"Nauru",drapeau:"🇳🇷"},
  {code:"+977",nom:"Nepal",drapeau:"🇳🇵"},
  {code:"+505",nom:"Nicaragua",drapeau:"🇳🇮"},
  {code:"+683",nom:"Niue",drapeau:"🇳🇺"},
  {code:"+687",nom:"Nouvelle-Caledonie",drapeau:"🇳🇨"},
  {code:"+64",nom:"Nouvelle-Zelande",drapeau:"🇳🇿"},
  {code:"+246",nom:"Ocean Indien Britannique",drapeau:"🇮🇴"},
  {code:"+968",nom:"Oman",drapeau:"🇴🇲"},
  {code:"+256",nom:"Ouganda",drapeau:"🇺🇬"},
  {code:"+998",nom:"Ouzbekistan",drapeau:"🇺🇿"},
  {code:"+92",nom:"Pakistan",drapeau:"🇵🇰"},
  {code:"+680",nom:"Palaos",drapeau:"🇵🇼"},
  {code:"+970",nom:"Palestine",drapeau:"🇵🇸"},
  {code:"+507",nom:"Panama",drapeau:"🇵🇦"},
  {code:"+675",nom:"Papouasie-Nouvelle-Guinee",drapeau:"🇵🇬"},
  {code:"+595",nom:"Paraguay",drapeau:"🇵🇾"},
  {code:"+51",nom:"Perou",drapeau:"🇵🇪"},
  {code:"+63",nom:"Philippines",drapeau:"🇵🇭"},
  {code:"+48",nom:"Pologne",drapeau:"🇵🇱"},
  {code:"+689",nom:"Polynesie francaise",drapeau:"🇵🇫"},
  {code:"+974",nom:"Qatar",drapeau:"🇶🇦"},
  {code:"+420",nom:"Republique Tcheque",drapeau:"🇨🇿"},
  {code:"+255",nom:"Republique unie de Tanzanie",drapeau:"🇹🇿"},
  {code:"+40",nom:"Roumanie",drapeau:"🇷🇴"},
  {code:"+268",nom:"Royaume d'Eswatini",drapeau:"🇸🇿"},
  {code:"+7",nom:"Russie",drapeau:"🇷🇺"},
  {code:"+250",nom:"Rwanda",drapeau:"🇷🇼"},
  {code:"+1869",nom:"Saint-Christophe-et-Nieves",drapeau:"🇰🇳"},
  {code:"+378",nom:"Saint-Marin",drapeau:"🇸🇲"},
  {code:"+1721",nom:"Saint-Martin (partie neerlandaise)",drapeau:"🇸🇽"},
  {code:"+508",nom:"Saint-Pierre-et-Miquelon",drapeau:"🇵🇲"},
  {code:"+1784",nom:"Saint-Vincent-et-les-Grenadines",drapeau:"🇻🇨"},
  {code:"+290",nom:"Sainte-Helene",drapeau:"🇸🇭"},
  {code:"+1758",nom:"Sainte-Lucie",drapeau:"🇱🇨"},
  {code:"+685",nom:"Samoa",drapeau:"🇼🇸"},
  {code:"+1684",nom:"Samoa americaines",drapeau:"🇦🇸"},
  {code:"+239",nom:"Sao Tome-et-Principe",drapeau:"🇸🇹"},
  {code:"+381",nom:"Serbie",drapeau:"🇷🇸"},
  {code:"+248",nom:"Seychelles",drapeau:"🇸🇨"},
  {code:"+65",nom:"Singapour",drapeau:"🇸🇬"},
  {code:"+421",nom:"Slovaquie",drapeau:"🇸🇰"},
  {code:"+386",nom:"Slovenie",drapeau:"🇸🇮"},
  {code:"+252",nom:"Somalie",drapeau:"🇸🇴"},
  {code:"+249",nom:"Soudan",drapeau:"🇸🇩"},
  {code:"+211",nom:"Soudan du Sud",drapeau:"🇸🇸"},
  {code:"+94",nom:"Sri Lanka",drapeau:"🇱🇰"},
  {code:"+46",nom:"Suede",drapeau:"🇸🇪"},
  {code:"+597",nom:"Suriname",drapeau:"🇸🇷"},
  {code:"+963",nom:"Syrie",drapeau:"🇸🇾"},
  {code:"+992",nom:"Tadjikistan",drapeau:"🇹🇯"},
  {code:"+886",nom:"Taiwan",drapeau:"🇹🇼"},
  {code:"+262",nom:"Terres australes francaises",drapeau:"🇹🇫"},
  {code:"+66",nom:"Thailande",drapeau:"🇹🇭"},
  {code:"+670",nom:"Timor-Leste",drapeau:"🇹🇱"},
  {code:"+690",nom:"Tokelau",drapeau:"🇹🇰"},
  {code:"+676",nom:"Tonga",drapeau:"🇹🇴"},
  {code:"+1868",nom:"Trinite-et-Tobago",drapeau:"🇹🇹"},
  {code:"+993",nom:"Turkmenistan",drapeau:"🇹🇲"},
  {code:"+90",nom:"Turquie",drapeau:"🇹🇷"},
  {code:"+688",nom:"Tuvalu",drapeau:"🇹🇻"},
  {code:"+380",nom:"Ukraine",drapeau:"🇺🇦"},
  {code:"+598",nom:"Uruguay",drapeau:"🇺🇾"},
  {code:"+678",nom:"Vanuatu",drapeau:"🇻🇺"},
  {code:"+58",nom:"Venezuela",drapeau:"🇻🇪"},
  {code:"+84",nom:"Vietnam",drapeau:"🇻🇳"},
  {code:"+681",nom:"Wallis-et-Futuna",drapeau:"🇼🇫"},
  {code:"+967",nom:"Yemen",drapeau:"🇾🇪"},
  {code:"+260",nom:"Zambie",drapeau:"🇿🇲"},
  {code:"+263",nom:"Zimbabwe",drapeau:"🇿🇼"},
];

const PhoneInput = ({value,onChange,autoFocus}) => {
  const [showPays,setShowPays]=useState(false);
  const [rechPays,setRechPays]=useState("");
  const currentPays=PAYS_LISTE.find(p=>value.startsWith(p.code))||PAYS_LISTE[0];
  const numeroSeul=value.startsWith(currentPays.code)?value.slice(currentPays.code.length).replace(/^\s+/,""):value.replace(/^\+?\d*\s*/,"");
  const choisirPays=(p)=>{onChange(`${p.code} ${numeroSeul}`.trim());setShowPays(false);setRechPays("");};
  const changerNumero=(n)=>{onChange(`${currentPays.code} ${n.replace(/[^\d\s]/g,"")}`.trim());};
  const paysFiltres=PAYS_LISTE.filter(p=>p.nom.toLowerCase().includes(rechPays.toLowerCase()));
  return(
    <div style={{display:"flex",gap:8}}>
      <button type="button" onClick={()=>setShowPays(true)} style={{display:"flex",alignItems:"center",gap:4,background:"rgba(255,255,255,0.045)",border:"1px solid rgba(255,255,255,0.14)",borderRadius:12,padding:"0 10px",color:"#F5F2EA",fontSize:14,cursor:"pointer",flexShrink:0}}>
        <span style={{fontSize:18}}>{currentPays.drapeau}</span><span>{currentPays.code}</span><span style={{color:"#97A3C9",fontSize:11}}>▾</span>
      </button>
      <input value={numeroSeul} onChange={e=>changerNumero(e.target.value)} placeholder="76 XX XX XX" type="tel" inputMode="tel" maxLength={12} autoFocus={autoFocus}
        style={{flex:1,background:"rgba(255,255,255,0.045)",border:"1px solid rgba(255,255,255,0.14)",borderRadius:12,padding:"13px 14px",color:"#F5F2EA",fontSize:15,outline:"none",minWidth:0}}/>
      {showPays&&<Modal onClose={()=>{setShowPays(false);setRechPays("");}}>
        <MH title="Choisir un pays" onClose={()=>{setShowPays(false);setRechPays("");}}/>
        <Inp value={rechPays} onChange={e=>setRechPays(e.target.value)} placeholder="Rechercher un pays..." autoFocus/>
        <div style={{marginTop:12}}>
        {paysFiltres.map(p=>(
          <div key={p.code} onClick={()=>choisirPays(p)} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"13px 4px",borderBottom:"1px solid rgba(255,255,255,0.09)",cursor:"pointer"}}>
            <span style={{color:"#F5F2EA",fontSize:15}}>{p.drapeau} {p.nom}</span>
            <div style={{display:"flex",alignItems:"center",gap:8}}><span style={{color:"#97A3C9",fontSize:14}}>{p.code}</span>{p.code===currentPays.code&&<span style={{color:"#34D399"}}>✓</span>}</div>
          </div>
        ))}
        {paysFiltres.length===0&&<p style={{color:"#97A3C9",fontSize:13,textAlign:"center",padding:16}}>Aucun pays trouve</p>}
        </div>
      </Modal>}
    </div>
  );
};

const Fld = ({label,children}) => (
  <div style={{marginBottom:16}}>
    <label style={{display:"block",color:"#97A3C9",fontSize:11,marginBottom:6,fontWeight:700,textTransform:"uppercase",letterSpacing:.5}}>{label}</label>
    {children}
  </div>
);

const Inp = ({value,onChange,placeholder,type="text",inputMode,maxLength,autoFocus,onKeyDown}) => (
  <input value={value} onChange={onChange} placeholder={placeholder} type={type} inputMode={inputMode} maxLength={maxLength} autoFocus={autoFocus} onKeyDown={onKeyDown}
    style={{width:"100%",background:"rgba(255,255,255,0.045)",border:"1px solid rgba(255,255,255,0.14)",borderRadius:12,padding:"13px 14px",color:"#F5F2EA",fontSize:15,outline:"none"}}/>
);

const Btn = ({onClick,children,disabled}) => (
  <button onClick={onClick} disabled={disabled}
    style={{width:"100%",background:disabled?"rgba(255,255,255,0.09)":"linear-gradient(135deg,#FFE9B4 0%,#E8B04B 48%,#C38427 100%)",border:"none",borderRadius:14,padding:"14px",color:disabled?"#97A3C9":"#1B1203",fontWeight:800,fontSize:15,cursor:disabled?"not-allowed":"pointer",marginTop:6}}>
    {children}
  </button>
);

const ErrBox = ({msg}) => msg?<p style={{color:"#FB7185",fontSize:13,margin:"0 0 12px",fontWeight:600,background:"rgba(251,113,133,0.10)",padding:"8px 12px",borderRadius:8}}>{msg}</p>:null;

// Selecteur unique Orange Money / Wave / Moov Money : un clic choisit le moyen, un seul champ
// numero s'affiche a la fois. Au moins un des 3 doit etre rempli pour valider le formulaire parent.
const SelecteurPaiement = ({numeroOrangeMoney,setNumeroOrangeMoney,numeroWave,setNumeroWave,numeroMoovMoney,setNumeroMoovMoney}) => {
  const [choix,setChoix]=useState(numeroWave?"wave":numeroMoovMoney?"moov":"orange");
  const OPTIONS=[["orange","🟠 Orange Money","#FF6600",numeroOrangeMoney,setNumeroOrangeMoney],["wave","🔵 Wave","#2A9DF4",numeroWave,setNumeroWave],["moov","🟣 Moov Money","#F7941E",numeroMoovMoney,setNumeroMoovMoney]];
  const actif=OPTIONS.find(([id])=>id===choix);
  return(
    <Fld label="Numero de reception - Orange Money, Wave ou Moov Money (obligatoire, au moins un)">
      <div style={{display:"flex",gap:8,marginBottom:8}}>
        {OPTIONS.map(([id,label,couleur])=>(
          <button key={id} type="button" onClick={()=>setChoix(id)} style={{flex:1,background:choix===id?couleur:"rgba(255,255,255,0.045)",border:`1px solid ${couleur}`,borderRadius:10,padding:"9px 4px",color:choix===id?"#1B1203":couleur,fontWeight:700,fontSize:11,cursor:"pointer"}}>{label}</button>
        ))}
      </div>
      <Inp value={actif[3]} onChange={e=>actif[4](e.target.value.replace(/[^\d+]/g,""))} placeholder="Ex: 70123456" inputMode="tel"/>
    </Fld>
  );
};

// Boutons de paiement mobile (Orange Money / Wave) : affiche le numero du beneficiaire pour un
// paiement manuel (l'argent ne transite jamais par l'app). Si onDeclarer est fourni, une photo de
// preuve (capture d'ecran de la transaction) est OBLIGATOIRE avant de pouvoir declarer le paiement --
// ca ne peut pas etre valide sans preuve, exactement comme pour les cagnottes et les versements geres
// par la creatrice.
const BoutonsPaiementMobile = ({montant,numeroOrangeMoney,numeroWave,numeroMoovMoney,lienWave,lienOrange,qrPaiementUrl,onDeclarer,declareLabel,dejaDeclare,busy}) => {
  const [preuve,setPreuve]=useState(null);
  const [preuvePreview,setPreuvePreview]=useState(null);
  if(!numeroOrangeMoney&&!numeroWave&&!numeroMoovMoney&&!lienWave&&!lienOrange&&!qrPaiementUrl)return null;
  const montantNum=Number(montant)||0;
  const copier=async(txt)=>{try{await navigator.clipboard.writeText(txt);}catch{}};
  const ouvrirLien=(u)=>{const url=(u||"").trim();if(/^https?:\/\//i.test(url)){window.open(url,"_blank","noopener");}};
  const choisirPreuve=(e)=>{
    const f=e.target.files?.[0];
    if(!f)return;
    const reader=new FileReader();
    reader.onload=()=>{setPreuve(reader.result);setPreuvePreview(reader.result);};
    reader.readAsDataURL(f);
  };
  const peutDeclarer=montantNum&&preuve;
  return(
    <div style={{background:"rgba(255,255,255,0.055)",border:"1px solid rgba(255,255,255,0.09)",borderRadius:14,padding:14,marginBottom:16}}>
      <p style={{margin:"0 0 10px",color:"#E8B04B",fontWeight:800,fontSize:13}}>📲 Payer directement</p>
      {!montantNum&&<p style={{color:"#97A3C9",fontSize:11,marginBottom:8}}>Indique d'abord le montant.</p>}
      {numeroOrangeMoney&&<div style={{display:"flex",justifyContent:"space-between",alignItems:"center",background:"rgba(255,255,255,0.045)",borderRadius:8,padding:"8px 12px",marginBottom:8}}>
        <p style={{margin:0,color:"#F5F2EA",fontSize:12}}>Orange Money : <b>{numeroOrangeMoney}</b></p>
        <button onClick={()=>copier(numeroOrangeMoney)} style={{background:"transparent",border:"none",color:"#E8B04B",fontWeight:700,fontSize:11,cursor:"pointer"}}>📋 Copier</button>
      </div>}
      {numeroWave&&<div style={{display:"flex",justifyContent:"space-between",alignItems:"center",background:"rgba(255,255,255,0.045)",borderRadius:8,padding:"8px 12px",marginBottom:8}}>
        <p style={{margin:0,color:"#F5F2EA",fontSize:12}}>Wave : <b>{numeroWave}</b></p>
        <button onClick={()=>copier(numeroWave)} style={{background:"transparent",border:"none",color:"#2A9DF4",fontWeight:700,fontSize:11,cursor:"pointer"}}>📋 Copier</button>
      </div>}
      {numeroMoovMoney&&<div style={{display:"flex",justifyContent:"space-between",alignItems:"center",background:"rgba(255,255,255,0.045)",borderRadius:8,padding:"8px 12px",marginBottom:8}}>
        <p style={{margin:0,color:"#F5F2EA",fontSize:12}}>Moov Money : <b>{numeroMoovMoney}</b></p>
        <button onClick={()=>copier(numeroMoovMoney)} style={{background:"transparent",border:"none",color:"#F7941E",fontWeight:700,fontSize:11,cursor:"pointer"}}>📋 Copier</button>
      </div>}
      {(numeroOrangeMoney||numeroWave||numeroMoovMoney)&&<p style={{margin:"2px 0 10px",color:"#97A3C9",fontSize:10.5,lineHeight:1.5}}>👆 <b>Depuis ton téléphone :</b> appuie sur « Copier », ouvre ton appli (Wave / Orange Money), et fais un <b>transfert</b> vers ce numéro.</p>}
      {(lienOrange||lienWave)&&<div style={{marginBottom:8}}>
        <p style={{margin:"0 0 6px",color:"#97A3C9",fontSize:10,lineHeight:1.4}}>Ou paie en un tap (ouvre l'application) :</p>
        {lienOrange&&<button onClick={()=>ouvrirLien(lienOrange)} style={{width:"100%",background:"#E8B04B",border:"none",borderRadius:10,padding:"11px",color:"#fff",fontWeight:800,fontSize:13,cursor:"pointer",marginBottom:8}}>🟠 Ouvrir Orange Money pour payer</button>}
        {lienWave&&<button onClick={()=>ouvrirLien(lienWave)} style={{width:"100%",background:"#1DAEFF",border:"none",borderRadius:10,padding:"11px",color:"#fff",fontWeight:800,fontSize:13,cursor:"pointer"}}>🌊 Ouvrir Wave pour payer</button>}
      </div>}
      {/* QR importe par la creatrice : la photo de son propre QR Wave / Orange Money. C'est
          la methode la plus fiable au Mali (les operateurs ne donnent pas de lien web, juste
          un QR dans leur app). data-noinvert : reste net meme en mode sombre. */}
      {qrPaiementUrl&&<div data-noinvert style={{display:"flex",flexDirection:"column",alignItems:"center",background:"rgba(255,255,255,0.055)",border:"1px solid rgba(255,255,255,0.09)",borderRadius:12,padding:"14px 12px",marginBottom:8}}>
        <p style={{margin:"0 0 10px",color:"#F5F2EA",fontSize:12,fontWeight:800}}>📷 QR à scanner</p>
        <img src={qrPaiementUrl} alt="QR de paiement" style={{width:"100%",maxWidth:220,borderRadius:8,display:"block"}}/>
        <p style={{margin:"10px 0 0",color:"#97A3C9",fontSize:10.5,textAlign:"center",lineHeight:1.4}}>À faire scanner par la personne qui paie, <b>en présentiel</b> ou depuis un <b>autre téléphone</b>. (On ne peut pas scanner un QR affiché sur le même téléphone.)</p>
      </div>}
      {/* QR genere automatiquement a partir d'un lien de paiement (Wave/Orange), si renseigne.
          data-noinvert : garde le QR en noir sur blanc meme en mode sombre. */}
      {(()=>{const lienQR=(lienWave||lienOrange||"").trim();
        if(!/^https?:\/\//i.test(lienQR))return null;
        return(
          <div data-noinvert style={{display:"flex",flexDirection:"column",alignItems:"center",background:"rgba(255,255,255,0.055)",border:"1px solid rgba(255,255,255,0.09)",borderRadius:12,padding:"14px 12px",marginBottom:8}}>
            <p style={{margin:"0 0 10px",color:"#F5F2EA",fontSize:12,fontWeight:800}}>📷 Scanne pour payer {lienWave?"avec Wave":"avec Orange Money"}</p>
            <QRCodeSVG value={lienQR} size={156} level="M" bgColor="rgba(255,255,255,0.055)" fgColor="#F5F2EA"/>
            <p style={{margin:"10px 0 0",color:"#97A3C9",fontSize:10.5,textAlign:"center",lineHeight:1.4}}>Ouvre l'appareil photo (ou l'app de paiement) et vise le code.</p>
          </div>
        );})()}
      <p style={{margin:"4px 0 10px",color:"#97A3C9",fontSize:10,lineHeight:1.4}}>Envoie {montantNum?fmtFCFA(montantNum):"le montant"} toi-même depuis ton application (Orange Money, Wave ou Moov), puis confirme ci-dessous.</p>
      {onDeclarer&&<label style={{display:"block",background:"rgba(255,255,255,0.055)",border:"1px dashed #E8B04B",borderRadius:10,padding:preuvePreview?0:16,textAlign:"center",cursor:"pointer",overflow:"hidden",marginBottom:10}}>
        <input type="file" accept="image/*" onChange={choisirPreuve} style={{display:"none"}}/>
        {preuvePreview?<img src={preuvePreview} alt="Preuve" style={{width:"100%",maxHeight:180,objectFit:"contain",display:"block"}}/>:<span style={{color:"#E8B04B",fontSize:12,fontWeight:700}}>📷 Capture d'écran du paiement (obligatoire)</span>}
      </label>}
      {onDeclarer&&<button onClick={()=>onDeclarer("mobile_money",preuve)} disabled={busy||dejaDeclare||!peutDeclarer} style={{width:"100%",marginTop:4,background:dejaDeclare?"rgba(255,255,255,0.09)":"transparent",border:"1px solid "+(dejaDeclare?"#34D399":"rgba(255,255,255,0.14)"),borderRadius:10,padding:"10px",color:dejaDeclare?"#34D399":(!peutDeclarer?"#97A3C9":"#F5F2EA"),fontWeight:700,fontSize:12,cursor:dejaDeclare||!peutDeclarer?"default":"pointer"}}>{dejaDeclare?"✅ Déclaré, en attente de confirmation":(busy?"Envoi...":!preuve?"Ajoute la capture d'écran ci-dessus":(declareLabel||"✅ J'ai effectué le paiement"))}</button>}
    </div>
  );
};

const AuthScreen = ({onLogin}) => {
  const [step,setStep]=useState("intro");
  const [pendingUser,setPendingUser]=useState(null);
  const [tutoStep,setTutoStep]=useState(0);
  const [prenom,setPrenom]=useState("");
  const [tel,setTel]=useState("");
  const [pin,setPin]=useState("");
  const [pinC,setPinC]=useState("");
  const [photo,setPhoto]=useState(null);
  const [photoFile,setPhotoFile]=useState(null);
  const [parrainCode,setParrainCode]=useState("");
  const [err,setErr]=useState("");
  const [loading,setLoading]=useState(false);
  const fileRef=useRef();

  const handlePhoto=async(e)=>{
    const f=e.target.files?.[0];if(!f)return;
    try{
      const blob=await compressImage(f,TAILLE_AVATAR,QUALITE_AVATAR);
      setPhotoFile(new File([blob],"profil.jpg",{type:"image/jpeg"}));
      const r=new FileReader();r.onload=(ev)=>setPhoto(ev.target.result);r.readAsDataURL(blob);
    }catch{setErr("Cette photo n'a pas pu etre traitee, essaie une autre image");}
  };
  const go=(st)=>{setStep(st);setErr("");setPin("");setPinC("");};

  const doLogin=async()=>{
    setErr("");
    if(tel.replace(/\D/g,"").length<8)return setErr("Numéro invalide");
    if(pin.length!==4)return setErr("Le PIN doit faire 4 chiffres");
    setLoading(true);
    const res=await loginUser(tel,pin);
    setLoading(false);
    if(!res.ok)return setErr(res.err);
    onLogin(res.user);
  };

  const doRegister=async()=>{
    setErr("");
    if(!prenom.trim()||prenom.trim().length<2)return setErr("Prenom trop court");
    if(tel.replace(/\D/g,"").length<8)return setErr("Numéro invalide");
    if(pin.length!==4)return setErr("Le PIN doit faire 4 chiffres");
    if(pin!==pinC)return setErr("Les deux PIN ne correspondent pas");
    setLoading(true);
    const res=await registerUser(tel,pin,s(prenom.trim()),photoFile,parrainCode);
    setLoading(false);
    if(!res.ok)return setErr(res.err);
    setPendingUser(res.user);
    setStep("tutoriel");
  };

  const W={minHeight:"100vh",background:"linear-gradient(160deg,rgba(255,255,255,0.055),rgba(52,211,153,0.08))",display:"flex",alignItems:"center",justifyContent:"center",padding:20,overflowY:"auto"};
  const C={background:"rgba(255,255,255,0.055)",borderRadius:24,padding:"28px 24px",width:"100%",maxWidth:400,boxShadow:"0 20px 60px rgba(0,0,0,0.6)"};

  if(step==="tutoriel"){
    const slides=[
      {ic:"🤝",titre:"Bienvenue sur THT",texte:"Gere tes tontines avec tes proches, en toute transparence. Chaque membre voit qui a paye, qui est en retard, et le budget complet — en temps reel."},
      {ic:"💰",titre:"Cotisations et tirages",texte:"Crée une tontine, ajoute tes membres, suis les cotisations de chacun. Le tirage au sort désigne automatiquement le gagnant de chaque tour."},
      {ic:"🎉",titre:"Cagnottes solidaires",texte:"Mariage, santé, funérailles, études... crée une cagnotte et partage un lien : n'importe qui peut contribuer, même sans compte THT."},
      {ic:"🤖",titre:"HABY, ton assistante",texte:"Une question sur tes finances ou ta tontine ? HABY repond directement dans l'app, a tout moment."},
    ];
    const sl=slides[tutoStep];
    return(
      <div style={{minHeight:"100vh",background:"linear-gradient(160deg,rgba(255,255,255,0.055),rgba(52,211,153,0.08))",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:24}}>
        <div style={{width:88,height:88,borderRadius:24,background:"rgba(255,255,255,0.055)",border:"1px solid #E8B04B",display:"flex",alignItems:"center",justifyContent:"center",fontSize:40,marginBottom:24}}>{sl.ic}</div>
        <h2 style={{color:"#F5F2EA",fontSize:21,fontWeight:800,textAlign:"center",margin:"0 0 12px"}}>{sl.titre}</h2>
        <p style={{color:"#97A3C9",fontSize:14,textAlign:"center",lineHeight:1.6,maxWidth:340,marginBottom:32}}>{sl.texte}</p>
        <div style={{display:"flex",gap:6,marginBottom:32}}>
          {slides.map((_,i)=><div key={i} style={{width:i===tutoStep?22:8,height:8,borderRadius:99,background:i===tutoStep?"#E8B04B":"rgba(255,255,255,0.14)",transition:"width .2s"}}/>)}
        </div>
        <div style={{width:"100%",maxWidth:340}}>
          <Btn onClick={()=>{if(tutoStep<slides.length-1)setTutoStep(t=>t+1);else onLogin(pendingUser);}}>{tutoStep<slides.length-1?"Suivant":"Commencer"}</Btn>
          {tutoStep<slides.length-1&&<button onClick={()=>onLogin(pendingUser)} style={{width:"100%",background:"transparent",border:"none",color:"#97A3C9",fontSize:13,padding:"14px 0 0",cursor:"pointer"}}>Passer</button>}
        </div>
      </div>
    );
  }

  if(step==="intro") return(
    // Largeur bornee : sur ordinateur, sans cette contrainte, la photo de couverture
    // s'etirait sur tout l'ecran (1440px et plus) et repoussait le bouton "Continuer"
    // en dehors de la zone visible. Un ecran d'accueil n'a pas besoin d'etre large.
    <div style={{minHeight:"100vh",display:"flex",flexDirection:"column",background:"rgba(255,255,255,0.055)",maxWidth:560,margin:"0 auto"}}>
      <style>{`
        @keyframes introLogoIn { 0%{opacity:0;transform:scale(0.5) translateY(10px);} 60%{opacity:1;transform:scale(1.1) translateY(0);} 100%{opacity:1;transform:scale(1) translateY(0);} }
        @keyframes introGlow { 0%,100%{box-shadow:0 8px 24px rgba(232,176,75,0.35);} 50%{box-shadow:0 8px 36px rgba(232,176,75,0.6);} }
        @keyframes introFadeUp { 0%{opacity:0;transform:translateY(10px);} 100%{opacity:1;transform:translateY(0);} }
      `}</style>
      <div style={{width:"100%",aspectRatio:"3/2",position:"relative",flexShrink:0}}>
        <img src={heroTontine} alt="THT - Tontine Habi Traore" style={{width:"100%",height:"100%",objectFit:"cover",display:"block"}}/>
        <div style={{position:"absolute",inset:0,background:"linear-gradient(180deg,rgba(6,11,33,0) 70%,rgba(6,11,33,0.95) 100%)"}}/>
      </div>
      <div style={{flex:1,display:"flex",flexDirection:"column",justifyContent:"center",padding:"20px 24px 40px",textAlign:"center"}}>
        <div style={{width:64,height:64,borderRadius:18,margin:"0 auto 16px",overflow:"hidden",opacity:0,animation:"introLogoIn 0.7s cubic-bezier(0.34,1.56,0.64,1) forwards, introGlow 2.4s ease-in-out 0.7s infinite"}}>
          <img src={logoIcon} alt="THT" style={{width:"100%",height:"100%",objectFit:"cover"}}/>
        </div>
        <h1 style={{color:"#F5F2EA",fontSize:26,fontWeight:900,margin:"0 0 6px",letterSpacing:1,opacity:0,animation:"introFadeUp 0.6s ease-out 0.35s forwards"}}>THT</h1>
        <p style={{color:"#E8B04B",fontSize:14,margin:"0 0 4px",fontWeight:600,opacity:0,animation:"introFadeUp 0.6s ease-out 0.5s forwards"}}>Tontine Habi Traore</p>
        <p style={{color:"#97A3C9",fontSize:13,margin:"0 0 28px",lineHeight:1.6,opacity:0,animation:"introFadeUp 0.6s ease-out 0.65s forwards"}}>La tontine digitale qui rassemble les familles et les communautes, en toute confiance.</p>
        <div style={{opacity:0,animation:"introFadeUp 0.6s ease-out 0.8s forwards"}}><Btn onClick={()=>go("welcome")}>Continuer</Btn></div>
      </div>
    </div>
  );

  if(step==="welcome") return(
    <div style={W}><div style={C}>
      <div style={{textAlign:"center",paddingBottom:8}}>
        <div style={{width:120,height:120,borderRadius:32,margin:"0 auto 18px",overflow:"hidden",boxShadow:"0 8px 24px rgba(232,176,75,0.3)"}}>
          <img src={logoIcon} alt="THT" style={{width:"100%",height:"100%",objectFit:"cover"}}/>
        </div>
        <h1 style={{color:"#F5F2EA",fontSize:30,fontWeight:900,margin:"8px 0 4px",letterSpacing:2}}>THT</h1>
        <p style={{color:"#97A3C9",fontSize:13,margin:0}}>Tontine Habi Traore - Digitale. Securisee.</p>
      </div>
      <div style={{display:"flex",flexDirection:"column",gap:12,marginTop:40}}>
        <Btn onClick={()=>go("register")}>Creer mon compte gratuit</Btn>
        <button onClick={()=>go("login")} style={{width:"100%",background:"transparent",border:"2px solid rgba(255,255,255,0.09)",borderRadius:14,padding:"13px",color:"#F5F2EA",fontWeight:700,fontSize:15,cursor:"pointer"}}>J'ai déjà un compte</button>
      </div>
      <p style={{color:"#6F7BA6",fontSize:11,textAlign:"center",marginTop:20}}>Sans email - Donnees chiffrees - 100% prive</p>
    </div></div>
  );

  if(step==="login") return(
    <div style={W}><div style={C}>
      <button onClick={()=>go("welcome")} style={{background:"none",border:"none",color:"#E8B04B",cursor:"pointer",fontSize:14,padding:"0 0 16px",display:"block",fontWeight:600}}>← Retour</button>
      <h2 style={{color:"#F5F2EA",fontWeight:800,fontSize:22,margin:"0 0 20px"}}>Connexion</h2>
      <Fld label="Numéro de téléphone"><PhoneInput value={tel} onChange={v=>setTel(sPhone(v))} autoFocus/></Fld>
      <Fld label="Code PIN (4 chiffres)"><Inp value={pin} onChange={e=>setPin(sPin(e.target.value))} placeholder="Code secret" type="password" inputMode="numeric" maxLength={4}/></Fld>
      <ErrBox msg={err}/>
      <Btn onClick={doLogin} disabled={loading}>{loading?"Vérification...":"Se connecter"}</Btn>
      <p style={{color:"#97A3C9",fontSize:12,textAlign:"center",marginTop:16,cursor:"pointer"}} onClick={()=>go("register")}>Pas encore inscrit ? <span style={{color:"#E8B04B",fontWeight:700}}>Creer un compte</span></p>
    </div></div>
  );

  return(
    <div style={{...W,alignItems:"flex-start"}}><div style={{...C,margin:"20px auto"}}>
      <button onClick={()=>go("welcome")} style={{background:"none",border:"none",color:"#E8B04B",cursor:"pointer",fontSize:14,padding:"0 0 16px",display:"block",fontWeight:600}}>← Retour</button>
      <h2 style={{color:"#F5F2EA",fontWeight:800,fontSize:22,margin:"0 0 20px"}}>Creer mon compte</h2>
      <div style={{display:"flex",flexDirection:"column",alignItems:"center",marginBottom:20}}>
        <div onClick={()=>fileRef.current?.click()} style={{cursor:"pointer",position:"relative"}}>
          <Avatar prenom={prenom||"?"} photo={photo} size={76} gold/>
          <div style={{position:"absolute",bottom:0,right:0,background:"#E8B04B",borderRadius:"50%",width:24,height:24,display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,fontWeight:900,color:"#1B1203"}}>+</div>
        </div>
        <p style={{color:"#97A3C9",fontSize:11,margin:"8px 0 0"}}>Photo de profil (optionnel)</p>
        <input ref={fileRef} type="file" accept="image/*" style={{display:"none"}} onChange={handlePhoto}/>
      </div>
      <Fld label="Prenom"><Inp value={prenom} onChange={e=>setPrenom(s(e.target.value))} placeholder="Ex: Fatoumata" maxLength={30} autoFocus/></Fld>
      <Fld label="Numéro de téléphone"><PhoneInput value={tel} onChange={v=>setTel(sPhone(v))}/></Fld>
      <Fld label="Code PIN secret (4 chiffres)"><Inp value={pin} onChange={e=>setPin(sPin(e.target.value))} placeholder="Code secret" type="password" inputMode="numeric" maxLength={4}/></Fld>
      <Fld label="Confirmer le PIN"><Inp value={pinC} onChange={e=>setPinC(sPin(e.target.value))} placeholder="Confirmer" type="password" inputMode="numeric" maxLength={4}/></Fld>
      <Fld label="Code de parrainage (optionnel)"><Inp value={parrainCode} onChange={e=>setParrainCode(e.target.value.toUpperCase())} placeholder="Ex: A1B2C3D4" maxLength={12}/></Fld>
      <ErrBox msg={err}/>
      <Btn onClick={doRegister} disabled={loading}>{loading?"Creation...":"Creer mon compte"}</Btn>
      <p style={{color:"#6F7BA6",fontSize:11,textAlign:"center",marginTop:14}}>Ton PIN est chiffre et jamais partage</p>
    </div></div>
  );
};

// Encart "c'est au tour de X" : met clairement en avant qui recoit la cagnotte
// a la fin du cycle en cours, au lieu de le noyer en petit texte.
const ProchainBeneficiaire = ({gagnant,dateEcheance,cycle,totalCycles,frequence}) => {
  const quand=dateEcheance?new Date(dateEcheance+"T00:00:00").toLocaleDateString("fr-FR",{day:"2-digit",month:"long",year:"numeric"}):null;
  const periode=frequence==="Hebdo"?"cette semaine":frequence==="Bimensuel"?"cette quinzaine":"ce mois-ci";
  if(!gagnant)return(
    <div style={{background:"rgba(255,255,255,0.03)",border:"1px dashed #6F7BA6",borderRadius:14,padding:"12px 14px",marginBottom:12,display:"flex",alignItems:"center",gap:11}}>
      <span style={{fontSize:26}} role="img" aria-hidden="true">🎲</span>
      <div style={{minWidth:0}}>
        <p style={{margin:0,color:"#F5F2EA",fontWeight:800,fontSize:13}}>Prochain bénéficiaire : pas encore désigné</p>
        <p style={{margin:"2px 0 0",color:"#97A3C9",fontSize:11.5}}>Lance le tirage au sort de l onglet Tirage pour savoir qui reçoit la cagnotte {periode}.</p>
      </div>
    </div>
  );
  return(
    <div style={{background:"linear-gradient(135deg,rgba(232,176,75,0.10),rgba(232,176,75,0.14))",border:"1px solid #E8B04B",borderRadius:14,padding:"12px 14px",marginBottom:12,display:"flex",alignItems:"center",gap:11}}>
      <Avatar prenom={gagnant.prenom} photo={gagnant.photo} size={44}/>
      <div style={{minWidth:0,flex:1}}>
        <p style={{margin:0,color:"#FFE1A1",fontSize:11,fontWeight:700,letterSpacing:.4}}>🎁 C EST AU TOUR DE</p>
        <p style={{margin:"1px 0 0",color:"#F5F2EA",fontWeight:900,fontSize:17,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{gagnant.prenom}</p>
        <p style={{margin:"2px 0 0",color:"#97A3C9",fontSize:11.5}}>Reçoit la cagnotte du cycle {cycle}/{totalCycles}{quand?` — échéance le ${quand}`:""}</p>
      </div>
    </div>
  );
};

// `tx` = dernier versement enregistre pour le CYCLE EN COURS (null sinon). Tant qu'il
// manque une preuve dessus (recu envoye / photo de l'argent), on remplace le formulaire
// "+ Versement" par les deux actions ciblees -- sinon on le reaffiche normalement.
const MembreRow = ({m,onToggle,onWA,montant,onVersement,onHistorique,onDelete,onPhoto,onToggleCollecteur,onEdit,tx,onAjouterPhotoPreuve,onEnvoyerRecu,preuveBusy}) => (
  <div style={{background:"rgba(255,255,255,0.055)",border:`1px solid ${m.paye?"rgba(255,255,255,0.09)":"#E0526A55"}`,borderRadius:14,padding:"12px 14px",marginBottom:8}}>
    <div style={{display:"flex",alignItems:"center",gap:10}}>
      <Avatar prenom={m.prenom} photo={m.photo} size={46}/>
      <div style={{flex:1,minWidth:0}}>
        <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:2,flexWrap:"wrap"}}>
          <p style={{margin:0,color:"#F5F2EA",fontWeight:700,fontSize:14}}>{m.prenom}</p>
          <Badge score={m.score}/>
          {!m.paye&&<span style={{background:"#E0526A",color:"#fff",fontSize:9,fontWeight:700,padding:"1px 6px",borderRadius:99}}>NON PAYE</span>}
          {m.montantPerso&&<span style={{background:"rgba(255,255,255,0.09)",color:"#E8B04B",fontSize:9,fontWeight:700,padding:"1px 6px",borderRadius:99,border:"1px solid #E8B04B"}}>💰 {fmtFCFA(m.montantPerso)}/cycle</span>}
          {m.roleCollecteur&&<span style={{background:"rgba(255,255,255,0.09)",color:"#34D399",fontSize:9,fontWeight:700,padding:"1px 6px",borderRadius:99,border:"1px solid #34D399"}}>🤝 Collecteur</span>}
        </div>
        {m.quartier&&<p style={{margin:0,color:"#E8B04B",fontSize:11,fontWeight:600}}>📍 {m.quartier}</p>}
        <p style={{margin:"1px 0 0",color:"#97A3C9",fontSize:11}}>{m.tel}</p>
      </div>
      <div onClick={onToggle} style={{width:30,height:30,borderRadius:"50%",background:m.paye?"#34D399":"#FB7185",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,fontSize:14,color:"#fff",fontWeight:900}}>{m.paye?"v":"x"}</div>
    </div>
    <div style={{margin:"8px 0",padding:"9px 10px",background:"rgba(255,255,255,0.055)",borderRadius:8}}>
      <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
        <span style={{color:"#97A3C9",fontSize:12}}>Cotisations payees</span>
        <span style={{color:"#E8B04B",fontWeight:700,fontSize:12}}>{fmtFCFA((m.cyclesPaies||0)*(montant||0))}</span>
      </div>
      <div style={{display:"flex",justifyContent:"space-between"}}>
        <span style={{color:"#97A3C9",fontSize:12}}>Versements recus</span>
        <span style={{color:"#34D399",fontWeight:700,fontSize:12}}>{fmtFCFA(m.versements||0)}</span>
      </div>
      {m.dette>0&&<div style={{display:"flex",justifyContent:"space-between",marginTop:4}}>
        <span style={{color:"#FB7185",fontSize:12}}>Dette (cycles precedents)</span>
        <span style={{color:"#FB7185",fontWeight:700,fontSize:12}}>{fmtFCFA(m.dette)}</span>
      </div>}
    </div>
    {tx&&(!tx.recu_envoye||!tx.photo_url)&&(
      <div style={{background:"rgba(232,176,75,0.10)",border:"1px solid #E8B04B",borderRadius:10,padding:"9px 11px",marginBottom:8}}>
        <p style={{margin:"0 0 7px",color:"#FFE1A1",fontSize:11,fontWeight:700}}>✅ Versement de {fmtFCFA(Number(tx.montant)||0)} confirmé — il ne manque que la preuve :</p>
        <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
          {!tx.recu_envoye&&<button onClick={()=>onEnvoyerRecu(m,tx)} disabled={preuveBusy===m.id} style={{flex:1,background:"#E8B04B",border:"none",borderRadius:9,padding:"8px",color:"#1B1203",fontSize:11,fontWeight:800,cursor:preuveBusy===m.id?"wait":"pointer",minWidth:120}}>{preuveBusy===m.id?"Envoi...":"🧾 Ajouter le reçu"}</button>}
          {!tx.photo_url&&<label style={{flex:1,background:"rgba(255,255,255,0.055)",border:"1px solid #E8B04B",borderRadius:9,padding:"8px",color:"#E8B04B",fontSize:11,fontWeight:800,cursor:"pointer",textAlign:"center",minWidth:120}}>📷 Ajouter la photo de l'argent<input type="file" accept="image/*" hidden disabled={preuveBusy===m.id} onChange={e=>onAjouterPhotoPreuve(m,tx,e)}/></label>}
        </div>
      </div>
    )}
    <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
      <button onClick={onWA} style={{flex:1,background:"#075E54",border:"none",borderRadius:10,padding:"8px",color:"#fff",fontSize:11,fontWeight:700,cursor:"pointer",minWidth:70}}>WhatsApp</button>
      {!(tx&&(!tx.recu_envoye||!tx.photo_url))&&<button onClick={()=>onVersement(m)} style={{flex:1,background:"rgba(255,255,255,0.045)",border:"1px solid #E8B04B",borderRadius:10,padding:"8px",color:"#E8B04B",fontSize:11,fontWeight:700,cursor:"pointer",minWidth:70}}>+ Versement</button>}
      <button onClick={()=>onHistorique(m)} style={{flex:1,background:"rgba(255,255,255,0.045)",border:"1px solid #97A3C9",borderRadius:10,padding:"8px",color:"#F5F2EA",fontSize:11,fontWeight:700,cursor:"pointer",minWidth:70}}>Historique</button>
      <label style={{background:"rgba(255,255,255,0.045)",border:"1px solid rgba(255,255,255,0.14)",borderRadius:10,padding:"8px 10px",color:"#E8B04B",fontSize:11,fontWeight:700,cursor:"pointer",textAlign:"center"}}>📷<input type="file" accept="image/*" hidden onChange={e=>onPhoto(m.id,e)}/></label>
      {onEdit&&<button onClick={()=>onEdit(m)} style={{background:"rgba(255,255,255,0.045)",border:"1px solid #97A3C9",borderRadius:10,padding:"8px 10px",color:"#F5F2EA",fontSize:11,fontWeight:700,cursor:"pointer"}}>✏️ Modifier</button>}
      <button onClick={()=>onDelete(m.id)} style={{background:"transparent",border:"1px solid #E0526A",borderRadius:10,padding:"8px 10px",color:"#FB7185",fontSize:11,fontWeight:700,cursor:"pointer"}}>Retirer</button>
    </div>
    {!m.paye&&<button onClick={onToggle} style={{width:"100%",background:"rgba(255,255,255,0.09)",border:"1px solid #34D399",borderRadius:10,padding:"8px",color:"#34D399",fontSize:12,fontWeight:700,cursor:"pointer",marginTop:6}}>Marquer paye ce cycle</button>}
    {m.userId&&onToggleCollecteur&&<button onClick={()=>onToggleCollecteur(m)} style={{width:"100%",background:"transparent",border:"1px solid "+(m.roleCollecteur?"#FB7185":"rgba(255,255,255,0.14)"),borderRadius:10,padding:"7px",color:m.roleCollecteur?"#FB7185":"#97A3C9",fontSize:11,fontWeight:700,cursor:"pointer",marginTop:6}}>{m.roleCollecteur?"Retirer le role collecteur":"🤝 Nommer collecteur (aide pour les versements)"}</button>}
  </div>
);

// Meme alignement visuel que MembreRow (avatar, nom, badges, ligne quartier/telephone,
// pastille de statut, bloc de stats), mais en LECTURE SEULE : aucun bouton d'action,
// car un membre participant voit tout mais ne peut rien modifier.
const MembreRowLecture = ({m,montant}) => (
  <div style={{background:"rgba(255,255,255,0.055)",border:`1px solid ${m.paye?"rgba(255,255,255,0.09)":"#E0526A55"}`,borderRadius:14,padding:"12px 14px",marginBottom:8}}>
    <div style={{display:"flex",alignItems:"center",gap:10}}>
      <Avatar prenom={m.prenom} photo={m.photo} size={46}/>
      <div style={{flex:1,minWidth:0}}>
        <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:2,flexWrap:"wrap"}}>
          <p style={{margin:0,color:"#F5F2EA",fontWeight:700,fontSize:14}}>{m.prenom}</p>
          <Badge score={m.score}/>
          {!m.paye&&<span style={{background:"#E0526A",color:"#fff",fontSize:9,fontWeight:700,padding:"1px 6px",borderRadius:99}}>NON PAYE</span>}
          {m.montantPerso&&<span style={{background:"rgba(255,255,255,0.09)",color:"#E8B04B",fontSize:9,fontWeight:700,padding:"1px 6px",borderRadius:99,border:"1px solid #E8B04B"}}>💰 {fmtFCFA(m.montantPerso)}/cycle</span>}
          {m.roleCollecteur&&<span style={{background:"rgba(255,255,255,0.09)",color:"#34D399",fontSize:9,fontWeight:700,padding:"1px 6px",borderRadius:99,border:"1px solid #34D399"}}>🤝 Collecteur</span>}
        </div>
        {m.quartier&&<p style={{margin:0,color:"#E8B04B",fontSize:11,fontWeight:600}}>📍 {m.quartier}</p>}
        <p style={{margin:"1px 0 0",color:"#97A3C9",fontSize:11}}>{m.tel}</p>
      </div>
      <div style={{width:30,height:30,borderRadius:"50%",background:m.paye?"#34D399":"#FB7185",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,fontSize:14,color:"#fff",fontWeight:900}}>{m.paye?"v":"x"}</div>
    </div>
    <div style={{margin:"8px 0 0",padding:"9px 10px",background:"rgba(255,255,255,0.055)",borderRadius:8}}>
      <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
        <span style={{color:"#97A3C9",fontSize:12}}>Cotisations payees</span>
        <span style={{color:"#E8B04B",fontWeight:700,fontSize:12}}>{fmtFCFA((m.cyclesPaies||0)*(montant||0))}</span>
      </div>
      <div style={{display:"flex",justifyContent:"space-between"}}>
        <span style={{color:"#97A3C9",fontSize:12}}>Versements recus</span>
        <span style={{color:"#34D399",fontWeight:700,fontSize:12}}>{fmtFCFA(m.versements||0)}</span>
      </div>
      {m.dette>0&&<div style={{display:"flex",justifyContent:"space-between",marginTop:4}}>
        <span style={{color:"#FB7185",fontSize:12}}>Dette (cycles precedents)</span>
        <span style={{color:"#FB7185",fontWeight:700,fontSize:12}}>{fmtFCFA(m.dette)}</span>
      </div>}
    </div>
  </div>
);

const Carousel = ({slides}) => {
  const [idx,setIdx]=useState(0);
  useEffect(()=>{
    const timer=setInterval(()=>setIdx(i=>(i+1)%slides.length),4000);
    return()=>clearInterval(timer);
  },[slides.length]);
  return(
    <div style={{margin:"18px 16px 0",position:"relative",overflow:"hidden",borderRadius:16,height:112}}>
      <div style={{display:"flex",height:"100%",transition:"transform .5s cubic-bezier(.4,0,.2,1)",transform:`translateX(-${idx*100}%)`}}>
        {slides.map((s,i)=>(
          <div key={i} onClick={s.onClick} style={{minWidth:"100%",height:"100%",background:s.bg,display:"flex",alignItems:"center",padding:"0 20px",gap:14,cursor:s.onClick?"pointer":"default"}}>
            <div style={{flex:1}}>
              <p style={{margin:0,color:"#FFFFFF",fontWeight:800,fontSize:15}}>{s.titre}</p>
              <p style={{margin:"4px 0 0",color:"rgba(255,255,255,0.78)",fontSize:12,lineHeight:1.4}}>{s.texte}</p>
            </div>
            <span style={{fontSize:36,flexShrink:0}}>{s.emoji}</span>
          </div>
        ))}
      </div>
      <div style={{position:"absolute",bottom:9,left:0,right:0,display:"flex",justifyContent:"center",gap:5}}>
        {slides.map((_,i)=><div key={i} style={{width:i===idx?16:6,height:6,borderRadius:99,background:i===idx?"#E8B04B":"rgba(255,255,255,0.3)",transition:"width .3s"}}/>)}
      </div>
    </div>
  );
};

const HomeScreen = ({user,groupes,onSelectGroupe,onCreer,onProfil,participations,onSelectParticipation,onOpenHaby,onOpenCagnottes,nonLus={}}) => {
  const totalEp=groupes.reduce((a,g)=>a+g.cagnotte,0);
  const totalCS=groupes.reduce((a,g)=>a+g.caisseSociale,0);
  const nbRet=groupes.reduce((a,g)=>a+g.membres.filter(m=>!m.paye).length,0);
  return(
    <div style={{paddingBottom:90}}>
      <div style={{background:"linear-gradient(135deg,rgba(255,255,255,0.055),rgba(255,255,255,0.09))",padding:"48px 20px 36px",display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
        <div>
          <p style={{color:"#E8B04B",fontSize:13,margin:0,fontWeight:600}}>{t("bienvenue")}</p>
          <h2 style={{color:"#F5F2EA",margin:"2px 0 0",fontSize:24,fontWeight:900}}>{user.prenom}</h2>
          {/* premiumActif() et non user.plan : un abonnement echu ne doit plus afficher
              "PREMIUM" alors que les fonctions illimitees sont deja reverrouillees. */}
          <span style={{background:premiumActif(user)?"#E8B04B":"rgba(255,255,255,0.09)",color:premiumActif(user)?"#1B1203":"#E8B04B",fontSize:10,fontWeight:700,padding:"2px 8px",borderRadius:99,marginTop:4,display:"inline-block"}}>
            {premiumActif(user)?"PREMIUM":`GRATUIT - ${groupes.length}/1 tontine`}
          </span>
        </div>
        <div onClick={onProfil} style={{cursor:"pointer"}}><Avatar prenom={user.prenom} photo={user.photo} size={50} gold/></div>
      </div>
      <div style={{display:"flex",gap:10,padding:"0 16px",marginTop:-22}}>
        {[["💰",t("mesEpargnes"),totalEp,"linear-gradient(135deg,rgba(255,255,255,0.09),rgba(255,255,255,0.14))"],["🏦",t("caisseSociale"),totalCS,"linear-gradient(135deg,#9F1D3F,#E0526A)"]].map(([ic,lb,val,bg])=>(
          <div key={lb} style={{flex:1,background:bg,borderRadius:16,padding:"14px 12px"}}>
            <span style={{fontSize:20}}>{ic}</span>
            <p style={{color:"rgba(255,255,255,0.6)",fontSize:11,margin:"6px 0 2px",fontWeight:600}}>{lb}</p>
            <p style={{color:"#F5F2EA",fontSize:15,fontWeight:900,margin:0}}>{fmtFCFA(val)}</p>
          </div>
        ))}
      </div>
      {nbRet>0&&<div style={{margin:"14px 16px 0",background:"rgba(251,113,133,0.10)",border:"1px solid #E0526A",borderRadius:14,padding:"12px 16px",display:"flex",gap:10,alignItems:"center"}}><span style={{fontSize:20}}>⚠️</span><div><p style={{margin:0,color:"#FB7185",fontWeight:700,fontSize:13}}>{nbRet} {t("membresEnRetard")}</p><p style={{margin:0,color:"#97A3C9",fontSize:12}}>{t("cliquezTontine")}</p></div></div>}
      <Carousel slides={[
        {titre:"Invite tes proches",texte:"Parraine tes amis et ta famille sur THT",emoji:"🤝",bg:"linear-gradient(135deg,#3A2391,#1F3FD1)",onClick:onProfil},
        {titre:"Cagnottes solidaires",texte:"Mariage, santé, études... crée un lien de contribution",emoji:"🎁",bg:"linear-gradient(135deg,#3A2391,#1F3FD1)",onClick:onOpenCagnottes},
        {titre:"HABY, ton assistante",texte:"Une question sur tes finances ? Demande-lui",emoji:"🤖",bg:"linear-gradient(135deg,#3A2391,#1F3FD1)",onClick:onOpenHaby},
        {titre:"Versements securises",texte:"Photo de preuve a chaque cotisation enregistree",emoji:"📸",bg:"linear-gradient(135deg,#3A2391,#1F3FD1)"},
      ]}/>
      <div style={{padding:"20px 16px 0"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
          <h3 style={{color:"#F5F2EA",fontSize:16,fontWeight:800,margin:0}}>{t("mesTontines")}</h3>
          <button onClick={onCreer} style={{background:"rgba(255,255,255,0.09)",border:"1px solid rgba(255,255,255,0.14)",borderRadius:10,padding:"8px 16px",color:"#E8B04B",fontWeight:700,fontSize:13,cursor:"pointer"}}>+ {t("creer")}</button>
        </div>
        {groupes.length===0&&<div style={{textAlign:"center",padding:"40px 20px",color:"#6F7BA6"}}><p style={{fontSize:40}}>🏺</p><p style={{fontWeight:700,color:"#F5F2EA"}}>Aucune tontine</p><p style={{fontSize:13}}>Cree ta premiere tontine</p></div>}
        <div className="tht-grid">
        {groupes.map(g=>{
          const pct=Math.round((g.cycle/g.totalCycles)*100);
          const ret=g.membres.filter(m=>!m.paye).length;
          return(
            <div key={g.id} style={{background:"rgba(255,255,255,0.055)",borderRadius:16,padding:16,marginBottom:10,border:nonLus[g.id]>0?"1px solid #FB7185":"1px solid rgba(255,255,255,0.09)",cursor:"pointer",position:"relative"}} onClick={()=>onSelectGroupe(g)}>
              <Pastille n={nonLus[g.id]}/>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                <div style={{display:"flex",alignItems:"center",gap:10}}><div style={{width:12,height:12,borderRadius:"50%",background:g.couleur,flexShrink:0}}/><div><p style={{margin:0,color:"#F5F2EA",fontWeight:800,fontSize:15}}>{g.nom}</p><p style={{margin:"2px 0 0",color:"#97A3C9",fontSize:12}}>{g.membres.length} membres - {g.frequence}</p></div></div>
                <div style={{textAlign:"right"}}><p style={{margin:0,color:"#E8B04B",fontWeight:800,fontSize:15}}>{fmtFCFA(g.montant)}</p><p style={{margin:0,color:"#97A3C9",fontSize:11}}>par cotisation</p></div>
              </div>
              <Bar pct={pct} c={g.couleur}/>
              <div style={{display:"flex",justifyContent:"space-between",marginTop:8}}>
                <p style={{margin:0,color:"#97A3C9",fontSize:11}}>Cycle {g.cycle}/{g.totalCycles} - Tour: <strong style={{color:"#F5F2EA"}}>{g.prochainTour}</strong></p>
                {ret>0&&<span style={{background:"#E0526A",color:"#fff",fontSize:10,fontWeight:700,padding:"2px 7px",borderRadius:99}}>{ret} retard(s)</span>}
              </div>
            </div>
          );
        })}
        </div>
      </div>

      {participations&&participations.length>0&&<div style={{padding:"22px 16px 0"}}>
        <h3 style={{color:"#F5F2EA",fontSize:16,fontWeight:800,margin:"0 0 14px"}}>Tontines ou je participe</h3>
        <div className="tht-grid">
        {participations.map(g=>(
          <div key={g.id} onClick={()=>onSelectParticipation(g)} style={{background:"rgba(255,255,255,0.055)",borderRadius:16,padding:16,marginBottom:10,border:nonLus[g.id]>0?"1px solid #FB7185":"1px solid rgba(255,255,255,0.14)",cursor:"pointer",position:"relative"}}>
            <Pastille n={nonLus[g.id]}/>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div style={{display:"flex",alignItems:"center",gap:10}}><div style={{width:12,height:12,borderRadius:"50%",background:g.couleur,flexShrink:0}}/><div><p style={{margin:0,color:"#F5F2EA",fontWeight:800,fontSize:15}}>{g.nom}</p><p style={{margin:"2px 0 0",color:"#97A3C9",fontSize:12}}>{g.membres.length} membres - {g.frequence}</p></div></div>
              <span style={{background:g.moi?.paye?"#34D399":"#E0526A",color:"#fff",fontSize:10,fontWeight:700,padding:"3px 9px",borderRadius:99}}>{g.moi?.paye?"A jour":"En retard"}</span>
            </div>
          </div>
        ))}
        </div>
      </div>}
    </div>
  );
};

const CagnottesScreen = ({cagnottes,onCreerCagnotte,onSelectCagnotte}) => {
  return(
    <div style={{paddingBottom:90}}>
      <div style={{padding:"44px 16px 0",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <h2 style={{color:"#F5F2EA",fontSize:22,fontWeight:900,margin:0}}>{t("mesCagnottes")}</h2>
        <button onClick={onCreerCagnotte} style={{background:"rgba(255,255,255,0.09)",border:"1px solid rgba(255,255,255,0.14)",borderRadius:10,padding:"8px 16px",color:"#E8B04B",fontWeight:700,fontSize:13,cursor:"pointer"}}>+ Creer</button>
      </div>
      <p style={{margin:"10px 16px 0",color:"#97A3C9",fontSize:12,lineHeight:1.6}}>Mariage, sante, funerailles, etudes... cree un lien de contribution public, sans compte requis pour les donateurs.</p>
      <div style={{padding:"18px 16px 0"}}>
        {(!cagnottes||cagnottes.length===0)?<div style={{textAlign:"center",padding:"40px 20px",color:"#6F7BA6"}}><p style={{fontSize:40}}>🎁</p><p style={{fontWeight:700,color:"#F5F2EA"}}>Aucune cagnotte</p><p style={{fontSize:13}}>Cree ta premiere cagnotte solidaire</p></div>
        :cagnottes.map(c=>{const pct=Math.min(100,Math.round((c.montant_collecte/c.objectif)*100));return(
          <div key={c.id} onClick={()=>onSelectCagnotte(c)} style={{background:"rgba(255,255,255,0.055)",borderRadius:16,padding:16,marginBottom:10,border:"1px solid rgba(255,255,255,0.09)",cursor:"pointer"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <p style={{margin:0,color:"#F5F2EA",fontWeight:800,fontSize:15}}>{c.titre}</p>
              <span style={{background:c.statut==="cloturee"?"rgba(255,255,255,0.09)":"#E8B04B",color:c.statut==="cloturee"?"#97A3C9":"#1B1203",fontSize:10,fontWeight:700,padding:"3px 9px",borderRadius:99}}>{c.statut==="cloturee"?"Cloturee":"Ouverte"}</span>
            </div>
            <Bar pct={pct} c="#E8B04B"/>
            <p style={{margin:"6px 0 0",color:"#97A3C9",fontSize:12}}>{fmtFCFA(c.montant_collecte)} / {fmtFCFA(c.objectif)} ({pct}%)</p>
          </div>
        );})}
      </div>
    </div>
  );
};

const ParticipationScreen = ({groupe,onBack,user,onToast,onVoted,deepLink}) => {
  const pct=Math.round((groupe.cycle/groupe.totalCycles)*100);
  const [tab,setTab]=useState(deepLink?.tab||"membres");
  const [showMoreTabs,setShowMoreTabs]=useState(false);
  const [voting,setVoting]=useState(null);
  const [dernierVersement,setDernierVersement]=useState(null);
  const [showDemandePret,setShowDemandePret]=useState(false);
  const [pretMontant,setPretMontant]=useState("");
  const [pretMotif,setPretMotif]=useState("");
  const [pretBusy,setPretBusy]=useState(false);
  const [checklistOverride,setChecklistOverride]=useState({});
  const toggleCMembre=async(cid)=>{
    const c=groupe.checklist.find(x=>x.id===cid);
    const nouveauEtat=!(checklistOverride[cid]??c.done);
    setChecklistOverride(o=>({...o,[cid]:nouveauEtat}));
    const {error}=await supabase.from("checklist").update({done:nouveauEtat}).eq("id",cid);
    if(error){setChecklistOverride(o=>({...o,[cid]:!nouveauEtat}));onToast("Erreur","error");}
  };
  const [caisseMvtsMembre,setCaisseMvtsMembre]=useState([]);
  useEffect(()=>{
    supabase.from("caisse_sociale_mouvements").select("*").eq("groupe_id",groupe.id).order("created_at",{ascending:false}).limit(20).then(({data})=>setCaisseMvtsMembre(data||[]));
  },[groupe.id]);
  const [suivi,setSuivi]=useState({});
  useEffect(()=>{
    supabase.from("transactions").select("*").eq("groupe_id",groupe.id).order("created_at",{ascending:false}).then(({data})=>{
      const dernierParMembre={};
      (data||[]).forEach(t=>{if(!dernierParMembre[t.membre_id])dernierParMembre[t.membre_id]=t;});
      setSuivi(dernierParMembre);
    });
  },[groupe.id]);
  const demanderPret=async()=>{
    if(!groupe.moi?.id)return;
    if(!pretMontant||Number(pretMontant)<500)return onToast("Montant minimum 500 FCFA","error");
    setPretBusy(true);
    const {error}=await supabase.from("prets").insert({groupe_id:groupe.id,membre_id:groupe.moi.id,montant:Number(pretMontant),motif:pretMotif.trim()||null,statut:"en_attente"});
    setPretBusy(false);
    if(error)return onToast("Erreur : "+(error.message||"inconnue"),"error");
    onToast("Demande envoyee ! La creatrice va l examiner.");
    setShowDemandePret(false);setPretMontant("");setPretMotif("");
    if(groupe.createurUserId){
      supabase.functions.invoke("send-push",{body:{user_id:groupe.createurUserId,title:"THT - Demande de pret",body:`${user.prenom} demande un pret de ${fmtFCFA(Number(pretMontant))} pour "${groupe.nom}"`,url:`/?g=${groupe.id}&tab=prets`}}).catch(()=>{});
    }
  };
  const [pretsVotes,setPretsVotes]=useState({});
  const [voteBusy,setVoteBusy]=useState(null);
  useEffect(()=>{
    supabase.from("prets_votes").select("*").eq("groupe_id",groupe.id).then(({data})=>{
      const parPret={};
      (data||[]).forEach(v=>{(parPret[v.pret_id]=parPret[v.pret_id]||[]).push(v);});
      setPretsVotes(parPret);
    });
  },[groupe.id]);
  const voterPret=async(pret,valeur)=>{
    if(!groupe.moi?.id)return;
    setVoteBusy(pret.id);
    const {data,error}=await supabase.from("prets_votes").insert({pret_id:pret.id,groupe_id:groupe.id,voter_membre_id:groupe.moi.id,valeur}).select().single();
    setVoteBusy(null);
    if(error)return onToast("Erreur : "+(error.message||"inconnue"),"error");
    setPretsVotes(pv=>({...pv,[pret.id]:[...(pv[pret.id]||[]),data]}));
    onToast(valeur==="oui"?"Vote Oui enregistre !":"Vote Non enregistre !");
  };
  useEffect(()=>{
    if(!groupe.moi?.id)return;
    supabase.from("transactions").select("*").eq("membre_id",groupe.moi.id).order("created_at",{ascending:false}).limit(1).maybeSingle().then(({data})=>{
      if(data)setDernierVersement({montant:Number(data.montant),date:new Date(data.created_at).toLocaleDateString("fr-FR"),heure:new Date(data.created_at).toLocaleTimeString("fr-FR",{hour:"2-digit",minute:"2-digit"}),recuEnvoye:data.recu_envoye,statut:data.statut});
    });
  },[groupe.moi?.id]);
  const [declareBusy,setDeclareBusy]=useState(false);
  const [declarationEnAttente,setDeclarationEnAttente]=useState(null);
  useEffect(()=>{
    if(!groupe.moi?.id)return;
    supabase.from("declarations_paiement").select("*").eq("membre_id",groupe.moi.id).eq("statut","en_attente").order("created_at",{ascending:false}).limit(1).maybeSingle().then(({data})=>setDeclarationEnAttente(data||null));
  },[groupe.moi?.id]);
  const declarerPaiement=async(moyen,preuve)=>{
    if(!groupe.moi?.id)return;
    if(!preuve)return onToast("Une capture d'écran du paiement est requise","error");
    setDeclareBusy(true);
    const montant=groupe.moi.montantPerso??groupe.montant;
    // Anti-reutilisation : la meme capture ne peut pas servir deux fois dans la tontine.
    const empreinte=await empreinteImage(preuve);
    if(empreinte){
      const {data:deja}=await supabase.from("declarations_paiement")
        .select("id,created_at").eq("groupe_id",groupe.id).eq("photo_hash",empreinte).limit(1);
      if(deja&&deja.length>0){
        setDeclareBusy(false);
        return onToast("Cette capture a déjà été utilisée pour un paiement. Envoie la capture du nouveau paiement.","error");
      }
    }
    // Lecture automatique : on refuse tout de suite une photo qui n'a manifestement rien
    // a voir avec un paiement, plutot que d'encombrer la creatrice. Voir analyserPreuve()
    // pour la regle : seul le refus franc bloque, le doute laisse passer.
    const analyse=await analyserPreuve(preuve,montant);
    if(analyse?.verdict==="refuse"){
      setDeclareBusy(false);
      return onToast(`Cette image ne ressemble pas à une preuve de paiement${analyse.description?` (${analyse.description})`:""}. Envoie la capture Orange Money / Wave / Moov, le SMS de confirmation, ou la photo des billets.`,"error");
    }
    let photoUrl=null;
    try{
      const blobPhoto=await (await fetch(preuve)).blob();
      const path=`declarations/${groupe.id}/${groupe.moi.id}-${Date.now()}.jpg`;
      const {error:upErr}=await supabase.storage.from("photos").upload(path,blobPhoto,{contentType:"image/jpeg",upsert:true});
      if(!upErr){const {data:pub}=supabase.storage.from("photos").getPublicUrl(path);photoUrl=pub.publicUrl;}
    }catch{}
    if(!photoUrl){setDeclareBusy(false);return onToast("Impossible d'enregistrer la photo, réessaie","error");}
    const {data,error}=await supabase.from("declarations_paiement").insert({groupe_id:groupe.id,membre_id:groupe.moi.id,montant,moyen,cycle:groupe.cycle,photo_url:photoUrl,photo_hash:empreinte}).select().single();
    setDeclareBusy(false);
    if(error)return onToast("Erreur : "+(error.message||"inconnue"),"error");
    // Ce que l'IA a lu est range a part, APRES l'insertion et sans bloquer : si la colonne
    // n'existe pas encore en base (script SQL pas encore lance), le paiement passe quand
    // meme. Une amelioration d'affichage ne doit jamais empecher d'enregistrer un paiement.
    if(analyse?.verifie){
      supabase.from("declarations_paiement").update({preuve_analyse:analyse}).eq("id",data.id).then(()=>{},()=>{});
    }
    setDeclarationEnAttente(data);
    onToast("Paiement déclaré ! En attente de confirmation.");
    if(analyse?.ecart_montant)onToast(analyse.ecart_montant+" La créatrice vérifiera.","warn");
    if(groupe.createurUserId){
      supabase.functions.invoke("send-push",{body:{user_id:groupe.createurUserId,title:"THT - Paiement déclaré",body:`${user.prenom} a déclaré avoir payé ${fmtFCFA(montant)} pour "${groupe.nom}"`,url:`/?g=${groupe.id}&tab=suivi`}}).catch(()=>{});
    }
  };
  // OPTION A : paiement en ligne via FedaPay. On cree la transaction cote serveur (fedapay-init)
  // puis on redirige vers le checkout securise FedaPay ; le webhook credite automatiquement la
  // cotisation quand le paiement est confirme (aucune photo/validation manuelle necessaire).
  const [payLigneBusy,setPayLigneBusy]=useState(false);
  const payerCotisationEnLigne=async()=>{
    if(!groupe.moi?.id)return;
    setPayLigneBusy(true);
    const montantP=Math.floor(Number(groupe.moi.montantPerso??groupe.montant)||0);
    const {data,error}=await supabase.functions.invoke("fedapay-init",{body:{
      type_transaction:"cotisation",
      id_tontine:groupe.id,
      membre_id:groupe.moi.id,
      id_utilisateur:groupe.createurUserId||null,
      montant:montantP,
      telephone:(groupe.moi.tel||user.tel||"").replace(/\s/g,""),
      prenom:groupe.moi.prenom||user.prenom,
      devise:"XOF",
    }});
    setPayLigneBusy(false);
    if(error||data?.error||!data?.url)return onToast("Le paiement en ligne n'a pas pu démarrer. Réessaie ou paie via WhatsApp.","error");
    window.location.href=data.url;
  };
  // OPTION B : ouvrir WhatsApp vers le support THT (le createur de l'app) pour etre accompagne.
  const aideWhatsApp=()=>{
    const montantP=Math.floor(Number(groupe.moi?.montantPerso??groupe.montant)||0);
    const msg=encodeURIComponent(`Bonjour, j'ai besoin d'aide pour payer ma cotisation de la tontine "${groupe.nom}" (${fmtFCFA(montantP)}). Mon nom : ${groupe.moi?.prenom||user.prenom||""}.`);
    window.open(`https://wa.me/22376908031?text=${msg}`,"_blank","noopener");
  };
  const [messages,setMessages]=useState([]);
  const [msgInput,setMsgInput]=useState("");
  const [thread,setThread]=useState(deepLink?.thread||null);
  const loadMessages=async()=>{
    let q=supabase.from("messages").select("*").eq("groupe_id",groupe.id);
    q=thread?q.or(`and(auteur_user_id.eq.${user.id},destinataire_user_id.eq.${thread.userId}),and(auteur_user_id.eq.${thread.userId},destinataire_user_id.eq.${user.id})`):q.is("destinataire_user_id",null);
    const {data}=await q.order("created_at",{ascending:true});
    setMessages((data||[]).map(m=>({id:m.id,auteur:m.auteur_nom,texte:m.texte,audioUrl:m.audio_url,imageUrl:m.image_url,time:new Date(m.created_at).toLocaleString("fr-FR",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"})})));
  };
  useEffect(()=>{loadMessages();},[groupe.id,thread]);
  const threadRef=useRef(thread);
  useEffect(()=>{threadRef.current=thread;},[thread]);
  useEffect(()=>{
    const ch=supabase.channel(`msgs-part-${groupe.id}`).on("postgres_changes",{event:"INSERT",schema:"public",table:"messages",filter:`groupe_id=eq.${groupe.id}`},(payload)=>{
      const m=payload.new;
      const th=threadRef.current;
      if(m.auteur_user_id===user.id)return; // mes propres messages sont deja affiches
      const belongsHere=th?(m.auteur_user_id===th.userId&&m.destinataire_user_id===user.id):!m.destinataire_user_id;
      if(belongsHere){
        setMessages(prev=>prev.some(x=>x.id===m.id)?prev:[...prev,{id:m.id,auteur:m.auteur_nom,texte:m.texte,audioUrl:m.audio_url,imageUrl:m.image_url,time:new Date(m.created_at).toLocaleString("fr-FR",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"})}]);
        onToast(`Nouveau message de ${m.auteur_nom}`);
        return;
      }
      // Message qui n'appartient pas a la conversation ouverte : on previent quand meme
      // si je suis concerne. Avant, un message PRIVE recu alors qu'on regardait le fil
      // de groupe (ou une autre conversation) ne declenchait aucune notification.
      if(m.destinataire_user_id===user.id)onToast(`🔒 Message privé de ${m.auteur_nom}`);
      else if(!m.destinataire_user_id)onToast(`Nouveau message de groupe de ${m.auteur_nom}`);
    }).subscribe();
    return()=>{supabase.removeChannel(ch);};
  },[groupe.id,user.id]);
  const {recording,start:startRec,stop:stopRec}=useAudioRecorder();
  const [sendingAudio,setSendingAudio]=useState(false);
  // Liste des autres participants (hors moi, hors creatrice qui a deja son bouton dedie),
  // dedoublonnee par membre pour ne jamais afficher deux fois la meme personne.
  const autresMembres=[...new Map(groupe.membres.filter(m=>m.userId!==user.id&&(!groupe.createurUserId||m.userId!==groupe.createurUserId)).map(m=>[m.id,m])).values()];
  const getRecipients=()=>thread?[thread.userId]:[groupe.createurUserId,...groupe.membres.map(m=>m.userId)].filter(uid=>uid&&uid!==user.id);
  const getDeepLink=()=>`/?g=${groupe.id}&tab=social`+(thread?`&dm=${user.id}&dmName=${encodeURIComponent(user.prenom)}`:"");
  const sendMsg=async()=>{
    if(!msgInput.trim())return;
    const texte=s(msgInput.trim());
    setMsgInput("");
    const {data,error}=await supabase.from("messages").insert({groupe_id:groupe.id,auteur_user_id:user.id,auteur_nom:user.prenom,auteur:user.prenom,texte,destinataire_user_id:thread?.userId||null}).select().single();
    if(error)return onToast("Erreur : "+(error.message||"inconnue"),"error");
    setMessages(m=>[...m,{id:data.id,auteur:data.auteur_nom,texte:data.texte,time:"maintenant"}]);
    notifyMessage(getRecipients(),user.prenom,false,getDeepLink());
    onToast("Message envoyé !");
  };
  const toggleRecord=async()=>{
    if(recording){
      const blob=await stopRec();
      if(!blob||blob.size<500)return;
      setSendingAudio(true);
      try{
        const audioUrl=await uploadAudio(blob,groupe.id);
        const {data,error}=await supabase.from("messages").insert({groupe_id:groupe.id,auteur_user_id:user.id,auteur_nom:user.prenom,auteur:user.prenom,texte:"",audio_url:audioUrl,destinataire_user_id:thread?.userId||null}).select().single();
        if(error)throw error;
        setMessages(m=>[...m,{id:data.id,auteur:data.auteur_nom,texte:"",audioUrl:data.audio_url,imageUrl:data.image_url,time:"maintenant"}]);
        notifyMessage(getRecipients(),user.prenom,true,getDeepLink());
        onToast("Message vocal envoyé !");
      }catch{onToast("Envoi du message vocal impossible","error");}
      setSendingAudio(false);
    }else{
      const ok=await startRec();
      if(!ok)onToast("Micro indisponible ou refusé","error");
    }
  };
  const voter=async(election,candidateId)=>{
    setVoting(election.id);
    const {error}=await supabase.from("votes").insert({election_id:election.id,voter_user_id:user.id,candidate_membre_id:candidateId});
    setVoting(null);
    if(error)return onToast("Vote impossible (peut-être déjà voté ?)","error");
    onToast("Vote enregistre !");
    onVoted&&onVoted();
  };
  const ROLES_LABELS={president:"Présidente",tresoriere:"Trésorière",secretaire:"Secrétaire"};
  const montantDu=(m)=>(m.montantPerso??groupe.montant);
  const budgetTotal=groupe.membres.reduce((s,m)=>s+((m.montantPerso??groupe.montant)),0)+(groupe.montantInitial||0);
  const resteACollecter=Math.max(0,budgetTotal-groupe.cagnotte);
  const aJourP=groupe.membres.filter(m=>m.paye);
  const enRetP=groupe.membres.filter(m=>!m.paye);
  const collecte=aJourP.reduce((s,m)=>s+montantDu(m),0)+(groupe.montantInitial||0);
  const cagnotteTour=groupe.membres.reduce((s,m)=>s+montantDu(m),0)+(groupe.montantInitial||0);
  const taux=groupe.membres.length>0?Math.round((aJourP.length/groupe.membres.length)*100):0;
  const exporterRapportPDF=async()=>{
    const {jsPDF}=await import("jspdf");
    const doc=new jsPDF();
    let y=20;
    doc.setFontSize(18);doc.text(`THT - ${groupe.nom}`,14,y);y+=10;
    doc.setFontSize(11);doc.text(`Genere le ${new Date().toLocaleDateString("fr-FR")}`,14,y);y+=12;
    doc.setFontSize(13);doc.text(`Bilan - Cycle ${groupe.cycle}/${groupe.totalCycles}`,14,y);y+=8;
    doc.setFontSize(10);
    [["Total collecte ce cycle",fmtFCFA(collecte)],["Total cotisations",fmtFCFA(cagnotteTour)],["Caisse sociale",fmtFCFA(groupe.caisseSociale)],["Taux de ponctualite",`${taux}%`],["Membres a jour",`${aJourP.length}/${groupe.membres.length}`],["Cycles restants",String(groupe.totalCycles-groupe.cycle)],["Dettes cumulees (cycles precedents)",fmtFCFA(groupe.membres.reduce((s,m)=>s+(m.dette||0),0))]].forEach(([l,v])=>{doc.text(`${l} : ${v}`,14,y);y+=7;});
    y+=6;
    doc.setFontSize(13);doc.text("Suivi par membre",14,y);y+=8;
    doc.setFontSize(10);
    groupe.membres.forEach(m=>{doc.text(`${m.prenom} - ${fmtFCFA((m.cyclesPaies||0)*montantDu(m))} verse (${m.cyclesPaies||0}/${groupe.totalCycles} cycles)`,14,y);y+=7;if(y>270){doc.addPage();y=20;}});
    doc.save(`rapport-${groupe.nom.replace(/[^a-z0-9]/gi,"_")}.pdf`);
    onToast("Rapport PDF telecharge !");
  };
  const PRIMARY_TABS=[["membres",t("tabMembres")],["social",t("tabSocial")],["rapport",t("tabRapport")]];
  const SECONDARY_TABS=[["suivi","Suivi","📋"],["bureau",t("tabBureau"),"🏛️"],["tirage",t("tabTirage"),"🎯"],["prets",t("tabPrets"),"💵"],["reunions",t("tabReunions"),"📝"],["events",t("tabEvenements"),"🎉"],["checklist",t("tabTaches"),"✅"]];
  const inSecondary=SECONDARY_TABS.some(([id])=>id===tab);

  // --- Pastilles "non lu" par section -------------------------------------------
  // messagesNonLus vient d'une petite requete dediee (on ne charge en memoire que le
  // fil ouvert) ; les autres compteurs se deduisent des donnees deja chargees.
  const [messagesNonLus,setMessagesNonLus]=useState(0);
  const compterMessagesNonLus=useCallback(async()=>{
    const depuis=dateVu(user.id,groupe.id,"social");
    let q=supabase.from("messages").select("*",{count:"exact",head:true})
      .eq("groupe_id",groupe.id).neq("auteur_user_id",user.id)
      .or(`destinataire_user_id.is.null,destinataire_user_id.eq.${user.id}`);
    if(depuis)q=q.gt("created_at",depuis);
    const {count,error}=await q;
    if(!error)setMessagesNonLus(count||0);
  },[groupe.id,user.id]);
  useEffect(()=>{compterMessagesNonLus();},[compterMessagesNonLus]);

  // Quand on ouvre une section, elle est consideree comme vue.
  useEffect(()=>{
    marquerVu(user.id,groupe.id,tab);
    if(tab==="social")setMessagesNonLus(0);
  },[tab,groupe.id,user.id]);

  // Compteur par onglet (vue membre) : ce sur quoi je dois encore me prononcer.
  const alertes={
    social:{n:messagesNonLus},
    prets:{n:(groupe.prets||[]).filter(p=>p.statut==="en_attente"&&p.membre_id!==groupe.moi?.id&&!(pretsVotes[p.id]||[]).some(v=>v.voter_membre_id===groupe.moi?.id)).length},
    bureau:{n:(groupe.elections||[]).filter(e=>!e.dejaVote).length},
  };
  return(
    <div style={{paddingBottom:90}}>
      <div style={{background:"rgba(255,255,255,0.055)",padding:"44px 16px 16px",display:"flex",alignItems:"center",gap:12,borderBottom:"1px solid rgba(255,255,255,0.09)"}}>
        <button onClick={onBack} style={{background:"none",border:"none",color:"#F5F2EA",fontSize:24,cursor:"pointer",padding:0}}>←</button>
        <div style={{flex:1}}><h2 style={{color:"#F5F2EA",margin:0,fontSize:17,fontWeight:800}}>{groupe.nom}</h2><p style={{color:"#E8B04B",margin:0,fontSize:12}}>{groupe.frequence} - {fmtFCFA(groupe.montant)}/cotisation</p></div>
        <span style={{background:"rgba(255,255,255,0.09)",color:"#97A3C9",fontSize:10,fontWeight:700,padding:"4px 10px",borderRadius:99}}>{t("lectureSeule")}</span>
      </div>
      <div style={{padding:"12px 16px 0"}}><Bar pct={pct} c={groupe.couleur}/><p style={{color:"#97A3C9",fontSize:12,margin:"6px 0 0"}}>Cycle {groupe.cycle}/{groupe.totalCycles}</p></div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,padding:"14px 16px 0"}}>
        {[["Collecte",fmtFCFA(collecte),"💰"],["Cotisations",fmtFCFA(cagnotteTour),"🏆"],["Ponctualite",`${taux}%`,"📊"],["Caisse soc.",fmtFCFA(groupe.caisseSociale),"🏦"],["A jour",`${aJourP.length}/${groupe.membres.length}`,"✅"],["En retard",`${enRetP.length}`,"⚠️"]].map(([l,v,i])=>(
          <div key={l} style={{background:"rgba(255,255,255,0.055)",border:"1px solid rgba(255,255,255,0.09)",borderRadius:12,padding:"10px 8px",textAlign:"center"}}><p style={{margin:0,fontSize:16}}>{i}</p><p style={{margin:"4px 0 0",color:"#F5F2EA",fontWeight:800,fontSize:12}}>{v}</p><p style={{margin:0,color:"#97A3C9",fontSize:10}}>{l}</p></div>
        ))}
      </div>
      <div style={{display:"flex",gap:6,padding:"14px 16px 0"}}>
        {PRIMARY_TABS.map(([id,lbl])=><button key={id} onClick={()=>{setTab(id);setShowMoreTabs(false);}} style={{flex:1,padding:"9px 6px",borderRadius:10,border:"1px solid",cursor:"pointer",fontSize:12,fontWeight:700,background:tab===id?"#E8B04B":"rgba(255,255,255,0.055)",color:tab===id?"#1B1203":"#97A3C9",borderColor:tab===id?"#E8B04B":"rgba(255,255,255,0.09)",position:"relative"}}>{lbl}{tab!==id&&<Pastille n={alertes[id]?.n} point={alertes[id]?.point}/>}</button>)}
        <button onClick={()=>setShowMoreTabs(v=>!v)} style={{flex:1,padding:"9px 6px",borderRadius:10,border:"1px solid",cursor:"pointer",fontSize:12,fontWeight:700,background:inSecondary||showMoreTabs?"#E8B04B":"rgba(255,255,255,0.055)",color:inSecondary||showMoreTabs?"#1B1203":"#97A3C9",borderColor:inSecondary||showMoreTabs?"#E8B04B":"rgba(255,255,255,0.09)",position:"relative"}}>{inSecondary?SECONDARY_TABS.find(([id])=>id===tab)[1]:"⋯ Plus"}{!showMoreTabs&&<Pastille n={SECONDARY_TABS.reduce((t2,[id])=>t2+(id===tab?0:(alertes[id]?.n||0)),0)} point={SECONDARY_TABS.some(([id])=>id!==tab&&alertes[id]?.point)&&!SECONDARY_TABS.some(([id])=>id!==tab&&alertes[id]?.n>0)}/>}</button>
      </div>
      {(showMoreTabs||inSecondary)&&<div style={{padding:"14px 16px 0"}}>
        <p style={{color:"#97A3C9",fontSize:11,fontWeight:700,letterSpacing:.5,margin:"0 0 10px"}}>SECTIONS</p>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:10}}>
          {SECONDARY_TABS.map(([id,lbl,icon])=>(
            <button key={id} onClick={()=>setTab(id)} style={{background:"none",border:"none",cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",gap:6,padding:0}}>
              <div style={{width:56,height:56,borderRadius:"50%",background:tab===id?"#E8B04B":"rgba(255,255,255,0.055)",border:tab===id?"none":"1px solid rgba(255,255,255,0.09)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,position:"relative"}}>{icon}{tab!==id&&<Pastille n={alertes[id]?.n} point={alertes[id]?.point}/>}</div>
              <span style={{color:tab===id?"#E8B04B":"#97A3C9",fontSize:11,fontWeight:600,textAlign:"center",lineHeight:1.2}}>{lbl}</span>
            </button>
          ))}
        </div>
      </div>}

      {tab==="membres"&&<div style={{padding:"14px 16px 0"}}>
        {/* Meme encart "c'est au tour de X" que pour la creatrice : les membres
            voient exactement la meme information, en toute transparence. */}
        <ProchainBeneficiaire gagnant={(()=>{const t=(groupe.tirages||[]).find(x=>x.cycle===groupe.cycle);return t?groupe.membres.find(m=>m.id===t.membre_id):null;})()} dateEcheance={groupe.dateEcheance} cycle={groupe.cycle} totalCycles={groupe.totalCycles} frequence={groupe.frequence}/>
        <div style={{background:"linear-gradient(135deg,rgba(255,255,255,0.055),rgba(255,255,255,0.045))",border:"1px solid #E8B04B",borderRadius:14,padding:14,marginBottom:16}}>
          <p style={{margin:"0 0 10px",color:"#E8B04B",fontWeight:800,fontSize:13}}>Budget du groupe</p>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:10}}>
            {[["Budget total cycle",fmtFCFA(budgetTotal)],["Deja collecte",fmtFCFA(groupe.cagnotte)],["Reste a collecter",fmtFCFA(resteACollecter)],["Caisse sociale",fmtFCFA(groupe.caisseSociale)]].map(([l,v])=>(
              <div key={l} style={{background:"rgba(255,255,255,0.055)",borderRadius:10,padding:"8px 10px"}}>
                <p style={{margin:0,color:"#97A3C9",fontSize:10,fontWeight:600}}>{l}</p>
                <p style={{margin:"3px 0 0",color:"#F5F2EA",fontWeight:800,fontSize:12}}>{v}</p>
              </div>
            ))}
          </div>
          <Bar pct={budgetTotal>0?Math.round((groupe.cagnotte/budgetTotal)*100):0} c="#E8B04B"/>
          <p style={{margin:"5px 0 0",color:"#97A3C9",fontSize:11,textAlign:"right"}}>{budgetTotal>0?Math.round((groupe.cagnotte/budgetTotal)*100):0}% collecte ce cycle</p>
        </div>
        {groupe.moi&&<div style={{background:"rgba(255,255,255,0.055)",border:"1px solid #E8B04B",borderRadius:14,padding:16,marginBottom:16}}>
          <p style={{margin:0,color:"#E8B04B",fontWeight:700,fontSize:13}}>{t("maSituation")}</p>
          <div style={{display:"flex",justifyContent:"space-between",marginTop:10}}>
            <div><p style={{margin:0,color:"#97A3C9",fontSize:11}}>Statut</p><p style={{margin:"2px 0 0",color:groupe.moi.paye?"#34D399":"#FB7185",fontWeight:800,fontSize:14}}>{groupe.moi.paye?"À jour":"En retard"}</p></div>
            <div><p style={{margin:0,color:"#97A3C9",fontSize:11}}>Verse au total</p><p style={{margin:"2px 0 0",color:"#F5F2EA",fontWeight:800,fontSize:14}}>{fmtFCFA(groupe.moi.versements)}</p></div>
            <div><p style={{margin:0,color:"#97A3C9",fontSize:11}}>Cycles payes</p><p style={{margin:"2px 0 0",color:"#F5F2EA",fontWeight:800,fontSize:14}}>{groupe.moi.cyclesPaies}/{groupe.totalCycles}</p></div>
          </div>
          {dernierVersement&&<div style={{marginTop:12,paddingTop:12,borderTop:"1px solid rgba(255,255,255,0.09)"}}>
            <p style={{margin:"0 0 8px",color:"#97A3C9",fontSize:10,fontWeight:700,letterSpacing:.5}}>DERNIER VERSEMENT</p>
            <p style={{margin:"0 0 8px",color:"#F5F2EA",fontSize:12}}>{fmtFCFA(dernierVersement.montant)} - {dernierVersement.date} a {dernierVersement.heure}</p>
            <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
              <span style={{background:"rgba(255,255,255,0.09)",color:"#34D399",fontSize:11,fontWeight:600,padding:"4px 9px",borderRadius:8}}>✅ Versement enregistre</span>
              <span style={{background:dernierVersement.recuEnvoye?"rgba(255,255,255,0.09)":"rgba(251,113,133,0.10)",color:dernierVersement.recuEnvoye?"#34D399":"#FB7185",fontSize:11,fontWeight:600,padding:"4px 9px",borderRadius:8}}>{dernierVersement.recuEnvoye?"✅":"❌"} Recu WhatsApp</span>
              <span style={{background:dernierVersement.statut==="paye"?"rgba(255,255,255,0.09)":"rgba(251,113,133,0.10)",color:dernierVersement.statut==="paye"?"#34D399":"#FB7185",fontSize:11,fontWeight:600,padding:"4px 9px",borderRadius:8}}>{dernierVersement.statut==="paye"?"✅ Pas de dette":"❌ Dette restante"}</span>
            </div>
          </div>}
        </div>}
        {groupe.moi&&!groupe.moi.paye&&<div style={{marginBottom:16}}>
          {/* OPTION A : paiement en ligne FedaPay (mis en avant) */}
          <div style={{background:"rgba(255,255,255,0.055)",border:"1px solid #E8B04B",borderRadius:14,padding:16,marginBottom:12}}>
            <p style={{margin:"0 0 4px",color:"#E8B04B",fontWeight:800,fontSize:14}}>💳 Payer ma cotisation en ligne</p>
            <p style={{margin:"0 0 12px",color:"#97A3C9",fontSize:11.5,lineHeight:1.5}}>Paie <b>{fmtFCFA(groupe.moi.montantPerso??groupe.montant)}</b> en toute sécurité (Orange Money, Wave, Moov, carte…). Ton paiement est validé automatiquement.</p>
            <button onClick={payerCotisationEnLigne} disabled={payLigneBusy} style={{width:"100%",background:"linear-gradient(135deg,#FFE9B4 0%,#E8B04B 48%,#C38427 100%)",border:"none",borderRadius:12,padding:14,color:"#fff",fontWeight:800,fontSize:14,cursor:"pointer"}}>{payLigneBusy?"Ouverture du paiement...":"✅ Payer maintenant en ligne"}</button>
            {/* QR : pour faire payer depuis un autre telephone ou en presentiel (on ne peut pas
                scanner un QR affiche sur le meme telephone qui paie). data-noinvert : QR net en mode sombre. */}
            <div data-noinvert style={{display:"flex",flexDirection:"column",alignItems:"center",marginTop:14,paddingTop:14,borderTop:"1px solid rgba(255,255,255,0.09)"}}>
              <p style={{margin:"0 0 10px",color:"#F5F2EA",fontSize:11.5,fontWeight:700,textAlign:"center"}}>📷 Ou fais scanner ce code (autre téléphone / en présentiel)</p>
              <QRCodeSVG value={`${window.location.origin}/?paiement=1`} size={150} level="M" bgColor="rgba(255,255,255,0.055)" fgColor="#F5F2EA"/>
              <p style={{margin:"10px 0 0",color:"#97A3C9",fontSize:10,textAlign:"center",lineHeight:1.4}}>La personne scanne, entre son numéro, choisit ta tontine et paie.</p>
            </div>
          </div>
          {/* OPTION B : aide / paiement accompagne via WhatsApp */}
          <button onClick={aideWhatsApp} style={{width:"100%",background:"#25D366",border:"none",borderRadius:12,padding:13,color:"#fff",fontWeight:800,fontSize:13.5,cursor:"pointer",marginBottom:12,display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>💬 Besoin d'aide ? Payer via WhatsApp</button>
          {/* SECOURS : paiement manuel (numeros mobile money + photo de preuve), replie, et seulement
              si la creatrice a renseigne un moyen manuel. */}
          {(groupe.numeroOrangeMoney||groupe.numeroWave||groupe.numeroMoovMoney||groupe.lienWave||groupe.lienOrange||groupe.qrPaiementUrl)&&<details style={{marginBottom:4}}>
            <summary style={{cursor:"pointer",color:"#97A3C9",fontSize:12,fontWeight:700,padding:"6px 0"}}>Autre moyen : payer à la main + envoyer une preuve</summary>
            <div style={{marginTop:8}}>
              <BoutonsPaiementMobile
                montant={groupe.moi.montantPerso??groupe.montant}
                numeroOrangeMoney={groupe.numeroOrangeMoney}
                numeroWave={groupe.numeroWave}
                numeroMoovMoney={groupe.numeroMoovMoney}
                lienWave={groupe.lienWave}
                lienOrange={groupe.lienOrange}
                qrPaiementUrl={groupe.qrPaiementUrl}
                onDeclarer={(moyen,preuve)=>declarerPaiement(moyen,preuve)}
                dejaDeclare={!!declarationEnAttente}
                busy={declareBusy}
              />
            </div>
          </details>}
        </div>}
        {caisseMvtsMembre.length>0&&<div style={{marginBottom:16}}>
          <p style={{color:"#97A3C9",fontSize:12,fontWeight:700,margin:"0 0 10px",letterSpacing:.5}}>HISTORIQUE CAISSE SOCIALE</p>
          {caisseMvtsMembre.map(m=>(
            <div key={m.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"9px 12px",background:"rgba(255,255,255,0.055)",borderRadius:10,marginBottom:6}}>
              <div><p style={{margin:0,color:"#F5F2EA",fontSize:12}}>{m.motif||(m.sens==="ajout"?"Ajout":"Retrait")}</p><p style={{margin:0,color:"#97A3C9",fontSize:10}}>{new Date(m.created_at).toLocaleDateString("fr-FR")} - {m.auteur_nom}</p></div>
              <p style={{margin:0,color:m.sens==="ajout"?"#34D399":"#FB7185",fontWeight:700,fontSize:12}}>{m.sens==="ajout"?"+":"-"}{fmtFCFA(m.montant)}</p>
            </div>
          ))}
        </div>}
        <p style={{color:"#34D399",fontSize:12,fontWeight:700,margin:"0 0 10px",letterSpacing:.5}}>A JOUR ({aJourP.length})</p>
        {aJourP.map(m=><MembreRowLecture key={m.id} m={m} montant={(m.montantPerso??groupe.montant)}/>)}
        {enRetP.length>0&&<><p style={{color:"#FB7185",fontSize:12,fontWeight:700,margin:"16px 0 8px",letterSpacing:.5}}>EN RETARD ({enRetP.length})</p>
        {enRetP.map(m=><MembreRowLecture key={m.id} m={m} montant={(m.montantPerso??groupe.montant)}/>)}</>}
      </div>}

      {tab==="suivi"&&<div style={{padding:"14px 16px 0"}}>
        <p style={{color:"#97A3C9",fontSize:12,marginBottom:14,lineHeight:1.5}}>Vue d ensemble du dernier versement de chaque membre.</p>
        {groupe.membres.length===0&&<p style={{color:"#97A3C9",fontSize:13,textAlign:"center",padding:20}}>Aucun membre pour l instant</p>}
        {groupe.membres.map(m=>{
          const tr=suivi[m.id];
          return(
            <div key={m.id} style={{background:"rgba(255,255,255,0.055)",border:"1px solid rgba(255,255,255,0.09)",borderRadius:12,padding:"12px 14px",marginBottom:8}}>
              <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:tr?10:0}}>
                <Avatar prenom={m.prenom} photo={m.photo} size={36}/>
                <div style={{flex:1}}><p style={{margin:0,color:"#F5F2EA",fontWeight:700,fontSize:14}}>{m.prenom}</p>{tr&&<p style={{margin:0,color:"#97A3C9",fontSize:11}}>{fmtFCFA(tr.montant)} - {new Date(tr.created_at).toLocaleDateString("fr-FR")} a {new Date(tr.created_at).toLocaleTimeString("fr-FR",{hour:"2-digit",minute:"2-digit"})}</p>}</div>
              </div>
              {tr?(
                <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                  <span style={{background:"rgba(255,255,255,0.09)",color:"#34D399",fontSize:11,fontWeight:600,padding:"4px 9px",borderRadius:8}}>✅ Montant recu</span>
                  <span style={{background:tr.recu_envoye?"rgba(255,255,255,0.09)":"rgba(251,113,133,0.10)",color:tr.recu_envoye?"#34D399":"#FB7185",fontSize:11,fontWeight:600,padding:"4px 9px",borderRadius:8}}>{tr.recu_envoye?"✅":"❌"} Reçu envoyé</span>
                  <span style={{background:tr.statut==="paye"?"rgba(255,255,255,0.09)":"rgba(251,113,133,0.10)",color:tr.statut==="paye"?"#34D399":"#FB7185",fontSize:11,fontWeight:600,padding:"4px 9px",borderRadius:8}}>{tr.statut==="paye"?"✅ Pas de dette":"❌ Dette restante"}</span>
                  <span style={{background:tr.photo_url?"rgba(255,255,255,0.09)":"rgba(251,113,133,0.10)",color:tr.photo_url?"#34D399":"#FB7185",fontSize:11,fontWeight:600,padding:"4px 9px",borderRadius:8}}>{tr.photo_url?"✅":"❌"} Photo</span>
                </div>
              ):<p style={{margin:0,color:"#97A3C9",fontSize:12}}>Aucun versement enregistre pour l instant</p>}
            </div>
          );
        })}
      </div>}

      {tab==="bureau"&&<div style={{padding:"14px 16px 0"}}>
        {groupe.membres.some(m=>m.role_bureau)&&<div style={{marginBottom:16}}>
          <p style={{color:"#97A3C9",fontSize:12,fontWeight:700,margin:"0 0 10px",letterSpacing:.5}}>BUREAU</p>
          <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
            {groupe.membres.filter(m=>m.role_bureau).map(m=>(
              <div key={m.id} style={{background:"rgba(255,255,255,0.055)",border:"1px solid #E8B04B",borderRadius:12,padding:"8px 12px",display:"flex",alignItems:"center",gap:8}}>
                <Avatar prenom={m.prenom} photo={m.photo} size={26}/>
                <div><p style={{margin:0,color:"#F5F2EA",fontSize:12,fontWeight:700}}>{m.prenom}</p><p style={{margin:0,color:"#E8B04B",fontSize:10}}>{ROLES_LABELS[m.role_bureau]||m.role_bureau}</p></div>
              </div>
            ))}
          </div>
        </div>}
        {groupe.elections&&groupe.elections.length>0&&<div>
          <p style={{color:"#97A3C9",fontSize:12,fontWeight:700,margin:"0 0 10px",letterSpacing:.5}}>ELECTIONS EN COURS</p>
          {groupe.elections.map(e=>(
            <div key={e.id} style={{background:"rgba(255,255,255,0.055)",border:"1px solid #E8B04B",borderRadius:14,padding:14,marginBottom:10}}>
              <p style={{margin:"0 0 10px",color:"#E8B04B",fontWeight:700,fontSize:13}}>🗳️ {ROLES_LABELS[e.role]||e.role}</p>
              {e.dejaVote?<p style={{color:"#34D399",fontSize:13,margin:0}}>✓ Tu as deja vote pour cette election</p>
              :e.candidats.map(cid=>{const c=groupe.membres.find(m=>m.id===cid);return(
                <button key={cid} onClick={()=>voter(e,cid)} disabled={voting===e.id} style={{width:"100%",display:"flex",alignItems:"center",gap:10,background:"rgba(255,255,255,0.09)",border:"1px solid rgba(255,255,255,0.14)",borderRadius:10,padding:"10px 12px",marginBottom:6,cursor:"pointer"}}>
                  <Avatar prenom={c?.prenom||"?"} photo={c?.photo} size={28}/><p style={{margin:0,color:"#F5F2EA",fontSize:13,fontWeight:600}}>{c?.prenom||"?"}</p>
                </button>
              );})}
            </div>
          ))}
        </div>}
        {!groupe.membres.some(m=>m.role_bureau)&&(!groupe.elections||groupe.elections.length===0)&&<p style={{color:"#97A3C9",fontSize:13,textAlign:"center",padding:20}}>Aucun bureau ni election pour l instant</p>}
      </div>}

      {tab==="tirage"&&<div style={{padding:"14px 16px 0"}}>
        {(!groupe.tirages||groupe.tirages.length===0)?<p style={{color:"#97A3C9",fontSize:13,textAlign:"center",padding:20}}>Aucun tirage pour l instant</p>
        :[...groupe.tirages].reverse().map(tr=>{const m=groupe.membres.find(mm=>mm.id===tr.membre_id);return(
          <div key={tr.id} style={{background:"rgba(255,255,255,0.055)",border:"1px solid rgba(255,255,255,0.09)",borderRadius:12,padding:"10px 14px",marginBottom:8,display:"flex",gap:10,alignItems:"center"}}>
            <span style={{background:"rgba(255,255,255,0.09)",color:"#E8B04B",fontSize:11,fontWeight:800,padding:"3px 8px",borderRadius:8}}>Cycle {tr.cycle}</span>
            <p style={{margin:0,color:"#F5F2EA",fontSize:13,fontWeight:700,flex:1}}>{m?.prenom||"Membre retiré"}</p>
            <p style={{margin:0,color:"#97A3C9",fontSize:11}}>{new Date(tr.created_at).toLocaleDateString("fr-FR")}</p>
          </div>
        );})}
      </div>}

      {tab==="prets"&&<div style={{padding:"14px 16px 0"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
          <p style={{color:"#97A3C9",fontSize:12,fontWeight:700,letterSpacing:.5,margin:0}}>PRETS</p>
          <button onClick={()=>setShowDemandePret(true)} style={{background:"rgba(255,255,255,0.09)",border:"1px solid #E8B04B",borderRadius:8,padding:"5px 12px",color:"#E8B04B",fontSize:11,fontWeight:700,cursor:"pointer"}}>+ Demander un pret</button>
        </div>
        {(!groupe.prets||groupe.prets.length===0)&&<p style={{color:"#97A3C9",fontSize:12,textAlign:"center",padding:10}}>Aucun pret pour l instant</p>}
        {groupe.prets&&groupe.prets.map(p=>{const m=groupe.membres.find(mm=>mm.id===p.membre_id);const total=p.montant*(1+p.taux_interet/100);const reste=total-p.montant_rembourse;
          const labels={en_attente:["En attente","#E8B04B"],en_cours:["En cours","#34D399"],rembourse:["Rembourse","#34D399"],refuse:["Refuse","#FB7185"]};
          const [lbl,col]=labels[p.statut]||["En cours","#E8B04B"];
          return(
          <div key={p.id} style={{background:"rgba(255,255,255,0.055)",border:`1px solid ${p.statut==="rembourse"?"rgba(255,255,255,0.09)":"#E8B04B"}`,borderRadius:12,padding:"12px 14px",marginBottom:8}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div style={{display:"flex",alignItems:"center",gap:8}}><Avatar prenom={m?.prenom||"?"} photo={m?.photo} size={30}/><p style={{margin:0,color:"#F5F2EA",fontWeight:700,fontSize:13}}>{m?.prenom||"?"}</p></div>
              <span style={{background:"rgba(251,113,133,0.10)",color:col,fontSize:10,fontWeight:700,padding:"3px 8px",borderRadius:99}}>{lbl}</span>
            </div>
            <p style={{margin:"8px 0 0",color:"#97A3C9",fontSize:12}}>{fmtFCFA(p.montant)} demande{p.statut==="en_cours"||p.statut==="rembourse"?` - ${fmtFCFA(Math.max(0,reste))} restant`:""}</p>
            {(p.statut==="en_cours"||p.statut==="rembourse")&&<p style={{margin:"2px 0 0",color:"#97A3C9",fontSize:11}}>{p.taux_interet>0?`${p.taux_interet}% d'intérêt`:"Sans intérêt"}{p.date_echeance?` - Échéance : ${new Date(p.date_echeance).toLocaleDateString("fr-FR")}`:""}</p>}
            {p.motif&&<p style={{margin:"2px 0 0",color:"#97A3C9",fontSize:11,fontStyle:"italic"}}>{p.motif}</p>}
            {p.statut==="en_attente"&&(p.membre_id===groupe.moi?.id?(
              <p style={{margin:"10px 0 0",color:"#E8B04B",fontSize:12,fontWeight:700}}>⏳ En attente du vote des membres</p>
            ):(()=>{
              const {eligible,oui,non}=calcVotePret(p,pretsVotes[p.id],groupe.membres.length);
              const monVote=(pretsVotes[p.id]||[]).find(v=>v.voter_membre_id===groupe.moi?.id);
              return(<div style={{marginTop:10,paddingTop:10,borderTop:"1px solid rgba(255,255,255,0.09)"}}>
                <div style={{display:"flex",gap:10,marginBottom:8}}>
                  <span style={{color:"#34D399",fontSize:12,fontWeight:700}}>✅ {oui}</span>
                  <span style={{color:"#FB7185",fontSize:12,fontWeight:700}}>❌ {non}</span>
                  <span style={{color:"#97A3C9",fontSize:12}}>sur {eligible} éligible(s)</span>
                </div>
                {monVote?<p style={{margin:0,color:"#97A3C9",fontSize:12}}>Tu as voté : <b style={{color:monVote.valeur==="oui"?"#34D399":"#FB7185"}}>{monVote.valeur==="oui"?"Oui":"Non"}</b></p>
                :<div style={{display:"flex",gap:8}}>
                  <button onClick={()=>voterPret(p,"oui")} disabled={voteBusy===p.id} style={{flex:1,background:"#34D399",border:"none",borderRadius:10,padding:"11px",color:"#fff",fontWeight:800,fontSize:14,cursor:"pointer"}}>✅ Oui</button>
                  <button onClick={()=>voterPret(p,"non")} disabled={voteBusy===p.id} style={{flex:1,background:"#FB7185",border:"none",borderRadius:10,padding:"11px",color:"#fff",fontWeight:800,fontSize:14,cursor:"pointer"}}>❌ Non</button>
                </div>}
              </div>);
            })())}
          </div>
        );})}
      </div>}

      {tab==="reunions"&&<div style={{padding:"14px 16px 0"}}>
        <div style={{background:"rgba(255,255,255,0.055)",border:"1px solid #E8B04B",borderRadius:14,padding:16,marginBottom:16}}>
          <p style={{margin:"0 0 10px",color:"#E8B04B",fontWeight:800,fontSize:14}}>Reglement interieur</p>
          {groupe.reglement?<p style={{color:"#F5F2EA",fontSize:13,lineHeight:1.6,whiteSpace:"pre-wrap",margin:0}}>{groupe.reglement}</p>:<p style={{color:"#97A3C9",fontSize:13,margin:0}}>Aucun reglement redige pour l instant</p>}
        </div>
        <p style={{color:"#97A3C9",fontSize:12,fontWeight:700,margin:"0 0 10px",letterSpacing:.5}}>COMPTES RENDUS DE REUNION</p>
        {(!groupe.rapports||groupe.rapports.length===0)?<p style={{color:"#97A3C9",fontSize:13,textAlign:"center",marginTop:10}}>Aucun compte rendu pour l instant</p>
        :groupe.rapports.map(r=>(
          <div key={r.id} style={{background:"rgba(255,255,255,0.055)",border:"1px solid rgba(255,255,255,0.09)",borderRadius:14,padding:16,marginBottom:10}}>
            <p style={{margin:0,color:"#F5F2EA",fontWeight:700,fontSize:14}}>{r.titre}</p>
            <p style={{margin:"3px 0 0",color:"#E8B04B",fontSize:11}}>{r.date_reunion?new Date(r.date_reunion).toLocaleDateString("fr-FR"):""}</p>
            {r.contenu&&<p style={{margin:"10px 0 0",color:"#97A3C9",fontSize:13,lineHeight:1.6,whiteSpace:"pre-wrap"}}>{r.contenu}</p>}
          </div>
        ))}
      </div>}

      {tab==="events"&&<div style={{padding:"14px 16px 0"}}>
        {groupe.membres.filter(m=>m.evenement).length===0
          ?<div style={{textAlign:"center",padding:30,color:"#6F7BA6"}}><p style={{fontSize:32}}>🎉</p><p>Aucun evenement signale</p></div>
          :groupe.membres.filter(m=>m.evenement).map(m=>(
            <div key={m.id} style={{background:"rgba(255,255,255,0.055)",border:"1px solid #E8B04B",borderRadius:14,padding:"14px 16px",marginBottom:10,display:"flex",gap:12,alignItems:"center"}}>
              <Avatar prenom={m.prenom} size={42}/>
              <div style={{flex:1}}><p style={{margin:0,color:"#F5F2EA",fontWeight:700,fontSize:14}}>{m.prenom}</p><p style={{margin:"3px 0 0",color:"#E8B04B",fontSize:13}}>{m.evenement}</p></div>
            </div>
          ))}
      </div>}

      {tab==="checklist"&&<div style={{padding:"14px 16px 0"}}>
        <p style={{color:"#97A3C9",fontSize:12,marginBottom:12}}>{groupe.checklist.filter(c=>(checklistOverride[c.id]??c.done)).length}/{groupe.checklist.length} taches completees</p>
        {groupe.checklist.length===0&&<div style={{textAlign:"center",padding:20,color:"#6F7BA6"}}><p>Aucune tache pour le moment</p></div>}
        {groupe.checklist.map(c=>{const done=checklistOverride[c.id]??c.done;return(
          <div key={c.id} onClick={()=>toggleCMembre(c.id)} style={{background:"rgba(255,255,255,0.055)",border:`1px solid ${done?"#E8B04B":"rgba(255,255,255,0.09)"}`,borderRadius:12,padding:"14px 16px",marginBottom:8,display:"flex",gap:12,alignItems:"center",cursor:"pointer"}}>
            <div style={{width:20,height:20,borderRadius:6,border:`2px solid ${done?"#E8B04B":"rgba(255,255,255,0.14)"}`,background:done?"#E8B04B":"transparent",flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center"}}>{done&&<span style={{color:"#1B1203",fontWeight:900,fontSize:12}}>v</span>}</div>
            <p style={{margin:0,color:done?"#97A3C9":"#F5F2EA",fontSize:13,textDecoration:done?"line-through":"none"}}>{c.label}</p>
          </div>
        );})}
      </div>}

      {tab==="social"&&<div style={{padding:"14px 16px 100px"}}>
        <div style={{display:"flex",gap:8,overflowX:"auto",paddingBottom:10,marginBottom:6}}>
          <button onClick={()=>setThread(null)} style={{flexShrink:0,display:"flex",alignItems:"center",gap:6,background:!thread?"#E8B04B":"rgba(255,255,255,0.055)",border:"1px solid "+(!thread?"#E8B04B":"rgba(255,255,255,0.09)"),borderRadius:99,padding:"7px 14px",color:!thread?"#1B1203":"#F5F2EA",fontWeight:700,fontSize:12,cursor:"pointer",whiteSpace:"nowrap"}}>💬 Groupe</button>
          {groupe.createurUserId&&groupe.createurUserId!==user.id&&<button onClick={()=>setThread({userId:groupe.createurUserId,prenom:groupe.createurNom})} style={{flexShrink:0,display:"flex",alignItems:"center",gap:6,background:thread?.userId===groupe.createurUserId?"#E8B04B":"rgba(255,255,255,0.055)",border:"1px solid "+(thread?.userId===groupe.createurUserId?"#E8B04B":"rgba(255,255,255,0.09)"),borderRadius:99,padding:"6px 14px 6px 6px",color:thread?.userId===groupe.createurUserId?"#1B1203":"#F5F2EA",fontWeight:700,fontSize:12,cursor:"pointer",whiteSpace:"nowrap"}}><Avatar prenom={groupe.createurNom} photo={groupe.createurPhoto} size={22}/>{groupe.createurNom} (creatrice)</button>}
          {/* Tous les autres membres. Ceux qui n'ont pas encore de compte THT restent
              visibles (grises) : la liste est ainsi complete et comprehensible, au lieu
              de faire disparaitre des gens sans explication. La creatrice est exclue ici
              car elle a deja son propre bouton juste au-dessus (evite le doublon). */}
          {autresMembres.map(m=>(
            <button key={m.id} onClick={()=>m.userId?setThread({userId:m.userId,prenom:m.prenom}):onToast(`${m.prenom} n'a pas encore de compte THT : impossible de lui écrire en privé`,"error")} title={m.userId?`Message privé à ${m.prenom}`:`${m.prenom} n'a pas encore de compte THT`} style={{flexShrink:0,display:"flex",alignItems:"center",gap:6,background:thread?.userId===m.userId&&m.userId?"#E8B04B":"rgba(255,255,255,0.055)",border:"1px solid "+(thread?.userId===m.userId&&m.userId?"#E8B04B":"rgba(255,255,255,0.09)"),borderRadius:99,padding:"6px 14px 6px 6px",color:!m.userId?"#6F7BA6":(thread?.userId===m.userId?"#1B1203":"#F5F2EA"),fontWeight:700,fontSize:12,cursor:"pointer",whiteSpace:"nowrap",opacity:m.userId?1:0.55}}><Avatar prenom={m.prenom} photo={m.photo} size={22}/>{m.prenom}{!m.userId&&" (sans compte)"}</button>
          ))}
        </div>
        {autresMembres.length===0&&<p style={{color:"#97A3C9",fontSize:11,margin:"0 0 10px",textAlign:"center"}}>Tu es pour l instant la seule personne inscrite dans cette tontine.</p>}
        {thread&&<p style={{color:"#E8B04B",fontSize:11,fontWeight:700,margin:"0 0 10px",textAlign:"center"}}>🔒 Conversation privee avec {thread.prenom}</p>}
        {messages.length===0?<p style={{color:"#97A3C9",fontSize:13,textAlign:"center",padding:10}}>Aucun message pour l instant</p>
        :messages.map(m=><div key={m.id} style={{display:"flex",gap:10,marginBottom:12}}><Avatar prenom={m.auteur} size={32}/><div style={{background:"rgba(255,255,255,0.055)",border:"1px solid rgba(255,255,255,0.09)",borderRadius:"0 14px 14px 14px",padding:"8px 12px",flex:1}}><div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}><p style={{margin:0,color:"#E8B04B",fontSize:11,fontWeight:700}}>{m.auteur}</p><p style={{margin:0,color:"#97A3C9",fontSize:10}}>{m.time}</p></div>{m.imageUrl?<img src={m.imageUrl} alt="Recu" style={{width:"100%",maxWidth:220,borderRadius:10,display:"block"}}/>:m.audioUrl?<audio controls src={m.audioUrl} style={{width:"100%",height:34}}/>:<p style={{margin:0,color:"#F5F2EA",fontSize:13}}>{m.texte}</p>}</div></div>)}
        <div style={{display:"flex",gap:8,marginTop:8}}>
          <button onClick={toggleRecord} disabled={sendingAudio} style={{background:recording?"#E0526A":"rgba(255,255,255,0.09)",border:"1px solid rgba(255,255,255,0.14)",borderRadius:12,width:44,height:44,color:recording?"#fff":"#E8B04B",fontSize:18,cursor:"pointer",flexShrink:0}}>{sendingAudio?"⏳":recording?"⏹":"🎤"}</button>
          <input value={msgInput} onChange={e=>setMsgInput(e.target.value)} placeholder={thread?`Message prive a ${thread.prenom}...`:"Écrire au groupe..."} maxLength={200} onKeyDown={e=>e.key==="Enter"&&sendMsg()} style={{flex:1,background:"rgba(255,255,255,0.055)",border:"1px solid rgba(255,255,255,0.09)",borderRadius:12,padding:"10px 14px",color:"#F5F2EA",fontSize:14,outline:"none"}}/>
          <button onClick={sendMsg} style={{background:"#E8B04B",border:"none",borderRadius:12,padding:"0 16px",color:"#1B1203",fontWeight:900,cursor:"pointer",fontSize:18}}>→</button>
        </div>
        {recording&&<p style={{color:"#E0526A",fontSize:11,margin:"6px 0 0",textAlign:"center"}}>🔴 Enregistrement en cours... clique sur ⏹ pour envoyer</p>}
      </div>}

      {tab==="rapport"&&<div style={{padding:"14px 16px 0"}}>
        <div style={{background:"rgba(255,255,255,0.055)",border:"1px solid rgba(255,255,255,0.09)",borderRadius:16,padding:16,marginBottom:14}}>
          <p style={{color:"#E8B04B",fontWeight:800,margin:"0 0 14px",fontSize:15}}>Bilan - Cycle {groupe.cycle}/{groupe.totalCycles}</p>
          {[["Total collecte ce cycle",fmtFCFA(collecte)],["Total cotisations (calcul auto)",fmtFCFA(cagnotteTour)],["Caisse sociale",fmtFCFA(groupe.caisseSociale)],["Taux ponctualite",`${taux}%`],["Membres a jour",`${aJourP.length}/${groupe.membres.length}`],["Cycles restants",groupe.totalCycles-groupe.cycle],["Dettes cumulees (cycles precedents)",fmtFCFA(groupe.membres.reduce((s,m)=>s+(m.dette||0),0))]].map(([l,v])=><div key={l} style={{display:"flex",justifyContent:"space-between",padding:"9px 0",borderBottom:"1px solid rgba(255,255,255,0.09)"}}><span style={{color:"#97A3C9",fontSize:13}}>{l}</span><span style={{color:"#F5F2EA",fontWeight:700,fontSize:13}}>{v}</span></div>)}
        </div>
        <p style={{color:"#97A3C9",fontSize:12,fontWeight:700,marginBottom:8}}>SUIVI PAR MEMBRE</p>
        {groupe.membres.map(m=><div key={m.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 0",borderBottom:"1px solid rgba(255,255,255,0.09)"}}><div style={{display:"flex",alignItems:"center",gap:10}}><Avatar prenom={m.prenom} size={32}/><p style={{margin:0,color:"#F5F2EA",fontSize:13}}>{m.prenom}</p></div><div style={{textAlign:"right"}}><p style={{margin:0,color:"#E8B04B",fontSize:12,fontWeight:700}}>{fmtFCFA((m.cyclesPaies||0)*montantDu(m))}</p><p style={{margin:0,color:"#97A3C9",fontSize:11}}>{m.cyclesPaies||0}/{groupe.totalCycles} cycles{m.montantPerso?` - ${fmtFCFA(m.montantPerso)}/cycle`:""}</p></div></div>)}
        <Btn onClick={exporterRapportPDF}>Exporter rapport PDF</Btn>
      </div>}

      <div style={{margin:"16px 16px 0",background:"rgba(255,255,255,0.055)",border:"1px solid rgba(255,255,255,0.14)",borderRadius:12,padding:12}}>
        <p style={{margin:0,color:"#97A3C9",fontSize:11,lineHeight:1.6}}>ℹ️ Tu vois toutes les donnees de cette tontine en toute transparence, comme tous les autres membres. Seule la creatrice peut modifier les informations. Pour signaler un paiement, contacte-la directement.</p>
      </div>
      {showDemandePret&&<Modal onClose={()=>setShowDemandePret(false)}>
        <MH title="Demander un prêt" onClose={()=>setShowDemandePret(false)}/>
        <p style={{color:"#97A3C9",fontSize:12,marginBottom:14,lineHeight:1.5}}>Ta demande sera envoyee a la creatrice de "{groupe.nom}" pour acceptation.</p>
        <Fld label="Montant souhaite (FCFA)"><Inp value={pretMontant} onChange={e=>setPretMontant(e.target.value.replace(/\D/g,""))} placeholder="Ex: 20000" inputMode="numeric" autoFocus/></Fld>
        <Fld label="Motif (optionnel)"><Inp value={pretMotif} onChange={e=>setPretMotif(e.target.value)} placeholder="Ex: Frais medicaux" maxLength={80}/></Fld>
        <Btn onClick={demanderPret} disabled={pretBusy}>{pretBusy?"Envoi...":"Envoyer la demande"}</Btn>
      </Modal>}
    </div>
  );
};

const GroupeScreen = ({groupe:gInit,onBack,onToast,user,onDeleteGroupe,onUpdateGroupe,deepLink}) => {
  const [groupe,setGroupe]=useState(gInit);
  const [tab,setTab]=useState(deepLink?.tab||"membres");
  const [showMoreTabs,setShowMoreTabs]=useState(false);
  const [msgInput,setMsgInput]=useState("");
  const [showAdd,setShowAdd]=useState(false);
  const [newM,setNewM]=useState({prenom:"",tel:"",quartier:"",photo:"",montantPerso:""});
  const [editMembre,setEditMembre]=useState(null);
  const [editMBusy,setEditMBusy]=useState(false);
  const [pickerBusy,setPickerBusy]=useState(false);
  const pickerBusyRef=useRef(false);
  const [payBusy,setPayBusy]=useState(false);
  const [showUpgrade,setShowUpgrade]=useState(false);
  const [showVers,setShowVers]=useState(false);
  const [showCaisse,setShowCaisse]=useState(false);
  const [caisseAmt,setCaisseAmt]=useState("");
  const [caisseMotif,setCaisseMotif]=useState("");
  const [caisseBusy,setCaisseBusy]=useState(false);
  const [caisseMvts,setCaisseMvts]=useState([]);
  const loadCaisseMvts=async()=>{
    const {data}=await supabase.from("caisse_sociale_mouvements").select("*").eq("groupe_id",groupe.id).order("created_at",{ascending:false}).limit(20);
    setCaisseMvts(data||[]);
  };
  const saveCaisse=async(sens)=>{
    const amt=Number(caisseAmt);
    if(!amt||amt<1)return;
    if(sens==="retirer"&&!caisseMotif.trim())return onToast("Indique le motif de la depense","error");
    const delta=sens==="ajouter"?amt:-amt;
    const nouveauTotal=Math.max(0,(groupe.caisseSociale||0)+delta);
    setCaisseBusy(true);
    const {error}=await supabase.from("groupes").update({caisse_sociale:nouveauTotal}).eq("id",groupe.id);
    if(error){setCaisseBusy(false);return onToast("Erreur","error");}
    await supabase.from("caisse_sociale_mouvements").insert({groupe_id:groupe.id,sens:sens==="ajouter"?"ajout":"retrait",montant:amt,motif:caisseMotif.trim()||null,auteur_nom:user.prenom});
    setCaisseBusy(false);
    setGroupe(g=>({...g,caisseSociale:nouveauTotal}));
    setCaisseAmt("");setCaisseMotif("");
    loadCaisseMvts();
    onToast(sens==="ajouter"?"Ajoute a la caisse sociale !":"Depense enregistree");
  };
  const [versM,setVersM]=useState(null);
  const [versAmt,setVersAmt]=useState("");
  const [versPhoto,setVersPhoto]=useState(null);
  const [versPhotoPreview,setVersPhotoPreview]=useState(null);
  const choisirVersPhoto=(e)=>{
    const f=e.target.files?.[0];
    if(!f)return;
    const reader=new FileReader();
    reader.onload=()=>{setVersPhoto(reader.result);setVersPhotoPreview(reader.result);};
    reader.readAsDataURL(f);
  };
  const [showHisto,setShowHisto]=useState(false);
  const [histoM,setHistoM]=useState(null);
  const [newTask,setNewTask]=useState("");
  const [evtM,setEvtM]=useState(null);
  const [evtTxt,setEvtTxt]=useState("");
  const [showEdit,setShowEdit]=useState(false);
  const [editG,setEditG]=useState({nom:gInit.nom,montant:String(gInit.montant),frequence:gInit.frequence,dateEcheance:gInit.dateEcheance||"",numeroOrangeMoney:gInit.numeroOrangeMoney||"",numeroWave:gInit.numeroWave||"",numeroMoovMoney:gInit.numeroMoovMoney||"",lienWave:gInit.lienWave||"",lienOrange:gInit.lienOrange||"",qrPaiementUrl:gInit.qrPaiementUrl||""});
  const [qrUp,setQrUp]=useState(false);
  // Import du QR de paiement : la creatrice prend en photo son propre QR Wave/Orange, on
  // l'envoie dans le stockage et on garde son URL. Affiche ensuite aux membres pour scanner.
  const choisirQRPaiement=async(e)=>{
    const f=e.target.files?.[0];
    if(!f)return;
    setQrUp(true);
    try{
      const compresse=await compressImage(f,900,0.85);
      const url=await uploadPhoto(new File([compresse],"qr.jpg",{type:"image/jpeg"}),`qr/${groupe.id}`);
      setEditG(g=>({...g,qrPaiementUrl:url}));
      onToast("QR de paiement importe !");
    }catch{onToast("Import du QR impossible, reessaie","error");}
    setQrUp(false);
  };
  const [editBusy,setEditBusy]=useState(false);
  const [tirages,setTirages]=useState([]);
  const [tirageAnim,setTirageAnim]=useState(false);
  const [tirageBusy,setTirageBusy]=useState(false);
  const [elections,setElections]=useState([]);
  const [votes,setVotes]=useState([]);
  const [showElection,setShowElection]=useState(false);
  const [electionRole,setElectionRole]=useState("president");
  const [electionCands,setElectionCands]=useState([]);
  const [electionBusy,setElectionBusy]=useState(false);
  const [prets,setPrets]=useState([]);
  const [showPret,setShowPret]=useState(false);
  const [newPret,setNewPret]=useState({membreId:"",montant:"",motif:""});
  const [pretPhoto,setPretPhoto]=useState(null);
  const [pretPhotoPreview,setPretPhotoPreview]=useState(null);
  const choisirPretPhoto=(e)=>{
    const f=e.target.files?.[0];
    if(!f)return;
    const reader=new FileReader();
    reader.onload=()=>{setPretPhoto(reader.result);setPretPhotoPreview(reader.result);};
    reader.readAsDataURL(f);
  };
  const [accepterM,setAccepterM]=useState(null);
  const [accepterTaux,setAccepterTaux]=useState("0");
  const [accepterEcheance,setAccepterEcheance]=useState("");
  const [pretBusy,setPretBusy]=useState(false);
  const [remboM,setRemboM]=useState(null);
  const [remboAmt,setRemboAmt]=useState("");
  const [rapports,setRapports]=useState([]);
  const [showRapport,setShowRapport]=useState(false);
  const [newRapport,setNewRapport]=useState({titre:"",contenu:"",date:""});
  const [rapportBusy,setRapportBusy]=useState(false);
  const [editReglement,setEditReglement]=useState(false);
  const [reglementTxt,setReglementTxt]=useState(gInit.reglement||"");
  const [reglementBusy,setReglementBusy]=useState(false);

  const deleteGroupe=async()=>{
    if(!confirm("Supprimer cette tontine et tous ses membres ? Cette action est irreversible."))return;
    const {error}=await supabase.from("groupes").delete().eq("id",groupe.id);
    if(error)return onToast("Suppression impossible","error");
    onDeleteGroupe(groupe.id);
    onToast("Tontine supprimée");
  };
  const saveEdit=async()=>{
    if(!editG.nom.trim())return onToast("Le nom est requis","error");
    if(!editG.montant||Number(editG.montant)<500)return onToast("Montant minimum 500 FCFA","error");
    setEditBusy(true);
    const majDb={nom:s(editG.nom.trim()),montant:Number(editG.montant),frequence:editG.frequence,date_echeance:editG.dateEcheance||null,numero_orange_money:editG.numeroOrangeMoney.trim()||null,numero_wave:editG.numeroWave.trim()||null,numero_moov_money:editG.numeroMoovMoney.trim()||null,lien_wave:editG.lienWave.trim()||null,lien_orange:editG.lienOrange.trim()||null,qr_paiement_url:editG.qrPaiementUrl||null};
    const majLocal={nom:s(editG.nom.trim()),montant:Number(editG.montant),frequence:editG.frequence,dateEcheance:editG.dateEcheance||null,numeroOrangeMoney:editG.numeroOrangeMoney.trim()||null,numeroWave:editG.numeroWave.trim()||null,numeroMoovMoney:editG.numeroMoovMoney.trim()||null,lienWave:editG.lienWave.trim()||null,lienOrange:editG.lienOrange.trim()||null,qrPaiementUrl:editG.qrPaiementUrl||null};
    // Garde-fou anti-blocage : si le reseau ne repond pas en 25s, on abandonne PROPREMENT
    // au lieu de rester fige sur "Enregistrement..." a l'infini. Le try/finally garantit
    // que le bouton se debloque toujours, quoi qu'il arrive.
    try{
      const requete=supabase.from("groupes").update(majDb).eq("id",groupe.id);
      const delai=new Promise((_,rej)=>setTimeout(()=>rej(new Error("delai depasse")),25000));
      const {error}=await Promise.race([requete,delai]);
      if(error)throw error;
      setGroupe(g=>({...g,...majLocal}));
      onUpdateGroupe(groupe.id,majLocal);
      setShowEdit(false);onToast("Tontine modifiée !");
    }catch{
      onToast("Enregistrement trop long — vérifie ta connexion et réessaie.","error");
    }finally{
      setEditBusy(false);
    }
  };

  const loadTirages=async()=>{
    const {data}=await supabase.from("tirages").select("*").eq("groupe_id",groupe.id).order("cycle",{ascending:true});
    setTirages(data||[]);
  };
  const loadElections=async()=>{
    const {data:els}=await supabase.from("elections").select("*").eq("groupe_id",groupe.id).order("created_at",{ascending:false});
    setElections(els||[]);
    const openIds=(els||[]).filter(e=>e.statut==="ouverte").map(e=>e.id);
    if(openIds.length>0){
      const {data:vs}=await supabase.from("votes").select("*").in("election_id",openIds);
      setVotes(vs||[]);
    }else setVotes([]);
  };
  useEffect(()=>{loadTirages();loadElections();},[groupe.id]);

  const dejaGagnants=new Set(tirages.map(t=>t.membre_id));
  // Anti-doublon : si un meme membre existe en double en base (probleme deja rencontre
  // sur ce projet), il ne doit pas avoir deux fois plus de chances d'etre tire.
  const membresUniques=[...new Map(groupe.membres.map(m=>[m.id,m])).values()];
  const eligibles=membresUniques.filter(m=>!dejaGagnants.has(m.id));
  const gagnantCycleActuel=tirages.find(t=>t.cycle===groupe.cycle);

  // Tirage sans biais : on utilise le generateur cryptographique du navigateur et on
  // rejette les valeurs qui tomberaient dans la "zone de debordement" du modulo
  // (sinon les premiers membres de la liste seraient legerement favorises).
  const indexAleatoire=(n)=>{
    if(n<=1)return 0;
    const crypto=globalThis.crypto;
    if(!crypto?.getRandomValues)return Math.floor(Math.random()*n);
    const max=Math.floor(0xFFFFFFFF/n)*n;
    const buf=new Uint32Array(1);
    let v=0;
    do{crypto.getRandomValues(buf);v=buf[0];}while(v>=max);
    return v%n;
  };

  const lancerTirage=async()=>{
    if(eligibles.length===0)return onToast("Tout le monde a déjà reçu la cagnotte dans cette rotation","error");
    if(gagnantCycleActuel)return onToast("Le tirage a déjà été fait pour ce cycle","error");
    setTirageBusy(true);setTirageAnim(true);
    await new Promise(r=>setTimeout(r,1800));
    const gagnant=eligibles[indexAleatoire(eligibles.length)];
    // Verrou cote base : la contrainte d'unicite (groupe_id, cycle) empeche deux tirages
    // sur le meme cycle, meme si deux personnes cliquent en meme temps sur deux telephones.
    const {data,error}=await supabase.from("tirages").insert({groupe_id:groupe.id,membre_id:gagnant.id,cycle:groupe.cycle}).select().single();
    setTirageBusy(false);
    if(error){setTirageAnim(false);loadTirages();return onToast(/duplicate|unique/i.test(error.message||"")?"Le tirage de ce cycle vient d'être fait":"Tirage impossible","error");}
    setTirages(t=>[...t,data]);
    onToast(`${gagnant.prenom} remporte la cagnotte de ce cycle !`);
    if(gagnant.userId){
      supabase.functions.invoke("send-push",{body:{user_id:gagnant.userId,title:"THT - Tu as gagne !",body:`Felicitations ! Tu remportes le tirage de "${groupe.nom}" (cycle ${groupe.cycle}) !`,url:`/?g=${groupe.id}&tab=tirage`}}).catch(()=>{});
    }
    setTimeout(()=>setTirageAnim(false),2500);
  };

  const [clotureBusy,setClotureBusy]=useState(false);
  // Cloture manuelle : doit se comporter EXACTEMENT comme la cloture automatique
  // (Edge Function rollover-cycles), sinon les deux se marchent dessus -- le solde
  // impaye devient une dette, les compteurs repartent a zero, et la date d'echeance
  // avance (sans quoi la tache automatique referait avancer le cycle une 2e fois).
  const cloturerCycle=async()=>{
    if(!gagnantCycleActuel)return onToast("Fais d abord le tirage de ce cycle avant de cloturer","error");
    if(groupe.cycle>=groupe.totalCycles)return onToast("C etait le dernier cycle de cette tontine !","error");
    setClotureBusy(true);
    const nouveauCycle=groupe.cycle+1;
    const nouvelleEcheance=prochaineEcheance(groupe.dateEcheance,groupe.frequence);
    const {error:e1}=await supabase.from("groupes").update({cycle:nouveauCycle,date_echeance:nouvelleEcheance}).eq("id",groupe.id);
    // Report des impayes en dette, membre par membre (montant du - deja verse)
    const majDettes=await Promise.all(groupe.membres.map(m=>{
      const manque=Math.max(0,montantDu(m)-(Number(m.versements)||0));
      return supabase.from("membres").update({dette:(Number(m.dette)||0)+manque,versements:0,paye:false}).eq("id",m.id);
    }));
    setClotureBusy(false);
    if(e1||majDettes.some(r=>r.error))return onToast("Erreur lors de la cloture du cycle","error");
    // La cagnotte repart du montant initial : les versements du cycle clos sont remis a
    // zero. Sans cette ligne, "Deja collecte" gardait le total de l'ancien cycle a l'ecran
    // jusqu'au prochain rechargement de l'application.
    setGroupe(g=>({...g,cycle:nouveauCycle,dateEcheance:nouvelleEcheance,cagnotte:(Number(g.montantInitial)||0),membres:g.membres.map(m=>({...m,dette:(Number(m.dette)||0)+Math.max(0,montantDu(m)-(Number(m.versements)||0)),versements:0,paye:false}))}));
    onToast(`Cycle ${nouveauCycle}/${groupe.totalCycles} demarre !`);
    groupe.membres.filter(m=>m.userId).forEach(m=>{
      supabase.functions.invoke("send-push",{body:{user_id:m.userId,title:"THT - Nouveau cycle",body:`"${groupe.nom}" passe au cycle ${nouveauCycle}/${groupe.totalCycles}. Nouvelle cotisation a verser !`,url:`/?g=${groupe.id}`}}).catch(()=>{});
    });
  };

  const ROLES=[["president","Présidente"],["tresoriere","Trésorière"],["secretaire","Secrétaire"]];
  const titulaire=(role)=>groupe.membres.find(m=>m.role_bureau===role);
  const electionActive=(role)=>elections.find(e=>e.role===role&&e.statut==="ouverte");

  const assignerDirect=async(role,membreId)=>{
    await supabase.from("membres").update({role_bureau:null}).eq("groupe_id",groupe.id).eq("role_bureau",role);
    if(membreId)await supabase.from("membres").update({role_bureau:role}).eq("id",membreId);
    setGroupe(g=>({...g,membres:g.membres.map(m=>({...m,role_bureau:m.id===membreId?role:(m.role_bureau===role?null:m.role_bureau)}))}));
    onToast("Bureau mis a jour !");
    const nomme=membreId?groupe.membres.find(m=>m.id===membreId):null;
    if(nomme?.userId){
      const roleLabel=ROLES.find(([r])=>r===role)?.[1]||role;
      supabase.functions.invoke("send-push",{body:{user_id:nomme.userId,title:"THT - Nouveau role",body:`Tu as ete nomme(e) ${roleLabel} du bureau de "${groupe.nom}" !`,url:`/?g=${groupe.id}&tab=bureau`}}).catch(()=>{});
    }
  };

  const lancerElection=async()=>{
    if(electionCands.length<2)return onToast("Choisis au moins 2 candidat(e)s","error");
    setElectionBusy(true);
    const {data,error}=await supabase.from("elections").insert({groupe_id:groupe.id,role:electionRole,candidats:electionCands}).select().single();
    setElectionBusy(false);
    if(error)return onToast("Impossible de lancer l election","error");
    setElections(e=>[data,...e]);
    setShowElection(false);setElectionCands([]);
    onToast("Élection lancée ! Les membres liés peuvent voter.");
  };

  const cloturerElection=async(election)=>{
    const tally={};
    votes.filter(v=>v.election_id===election.id).forEach(v=>{tally[v.candidate_membre_id]=(tally[v.candidate_membre_id]||0)+1;});
    const winnerId=Object.keys(tally).sort((a,b)=>tally[b]-tally[a])[0];
    if(!winnerId)return onToast("Aucun vote enregistre pour l instant","error");
    await supabase.from("elections").update({statut:"clotturee"}).eq("id",election.id);
    await assignerDirect(election.role,winnerId);
    setElections(es=>es.map(e=>e.id===election.id?{...e,statut:"clotturee"}:e));
    onToast("Election clôturee, le bureau est mis a jour !");
  };

  const loadPrets=async()=>{
    const {data}=await supabase.from("prets").select("*").eq("groupe_id",groupe.id).order("created_at",{ascending:false});
    setPrets(data||[]);
  };
  useEffect(()=>{loadPrets();},[groupe.id]);

  const [suivi,setSuivi]=useState({}); // { [membre_id]: derniere transaction }
  const loadSuivi=async()=>{
    const {data}=await supabase.from("transactions").select("*").eq("groupe_id",groupe.id).order("created_at",{ascending:false});
    const dernierParMembre={};
    (data||[]).forEach(t=>{if(!dernierParMembre[t.membre_id])dernierParMembre[t.membre_id]=t;});
    setSuivi(dernierParMembre);
  };
  useEffect(()=>{loadSuivi();},[groupe.id]);
  const toggleSuiviItem=async(membreId,t,champ,val)=>{
    const {error}=await supabase.from("transactions").update({[champ]:val}).eq("id",t.id);
    if(error)return onToast("Erreur : "+(error.message||"inconnue"),"error");
    setSuivi(s=>({...s,[membreId]:{...s[membreId],[champ]:val}}));
    onToast("Mis a jour !");
  };

  const [declarations,setDeclarations]=useState([]);
  const loadDeclarations=async()=>{
    const {data}=await supabase.from("declarations_paiement").select("*").eq("groupe_id",groupe.id).eq("statut","en_attente").order("created_at",{ascending:false});
    setDeclarations(data||[]);
  };
  useEffect(()=>{loadDeclarations();},[groupe.id]);
  const [declBusy,setDeclBusy]=useState(null);
  const confirmerDeclaration=async(d)=>{
    const membre=groupe.membres.find(m=>m.id===d.membre_id);
    if(!membre)return onToast("Membre introuvable","error");
    setDeclBusy(d.id);
    const amt=Number(d.montant);
    const newVersements=(membre.versements||0)+amt;
    const paye=newVersements>=montantDu(membre);
    const newScore=Math.min((membre.score||80)+(paye?5:2),100);
    // On ne compte le cycle comme paye qu'au moment ou il BASCULE de "pas paye" a "paye".
    // Sans le "&& !membre.paye", un membre deja a jour qui verse un complement voyait son
    // compteur de cycles augmenter une 2e fois pour le meme cycle -- ce qui gonflait
    // faussement le "verse au total" (calcule sur cyclesPaies) et le rapport PDF.
    const newCyclesPaies=(paye&&!membre.paye)?(membre.cyclesPaies||0)+1:(membre.cyclesPaies||0);
    const {error:mErr}=await supabase.from("membres").update({versements:newVersements,paye,score:newScore,cycles_paies:newCyclesPaies}).eq("id",membre.id);
    if(mErr){setDeclBusy(null);return onToast("Erreur : "+(mErr.message||"inconnue"),"error");}
    // On reporte aussi l'empreinte de la preuve : sans elle, une capture validee par ce
    // chemin (declaration confirmee) resterait reutilisable cote versements.
    await supabase.from("transactions").insert({groupe_id:groupe.id,membre_id:membre.id,montant:amt,cycle:groupe.cycle,statut:paye?"paye":"partiel",photo_url:d.photo_url||null,photo_hash:d.photo_hash||null});
    const moiMembre=groupe.membres.find(m=>m.userId===user.id);
    await supabase.from("declarations_paiement").update({statut:"confirme",confirme_par:moiMembre?.id||null,confirme_at:new Date().toISOString()}).eq("id",d.id);
    setGroupe(g=>({...g,cagnotte:g.cagnotte+amt,membres:g.membres.map(m=>m.id===membre.id?{...m,versements:newVersements,paye,cyclesPaies:newCyclesPaies,score:newScore}:m)}));
    setDeclarations(ds=>ds.filter(x=>x.id!==d.id));
    loadSuivi();
    onToast("Paiement confirmé !");
    if(membre.userId){
      supabase.functions.invoke("send-push",{body:{user_id:membre.userId,title:"THT - Paiement confirmé",body:`Ton paiement de ${fmtFCFA(amt)} pour "${groupe.nom}" a été confirmé.`,url:`/?g=${groupe.id}&tab=membres`}}).catch(()=>{});
      try{
        const now=new Date();
        const ref=`THT-${now.getFullYear()}${String(now.getMonth()+1).padStart(2,"0")}${membre.id.slice(-4).toUpperCase()}`;
        const blob=await genererRecuImage({
          nomTontine:groupe.nom,prenom:membre.prenom,montantRecu:fmtFCFA(amt),montantDu:fmtFCFA(montantDu(membre)),
          totalVerse:fmtFCFA(newVersements),statut:paye?"PAYE CE CYCLE":"VERSEMENT PARTIEL",cycle:groupe.cycle,totalCycles:groupe.totalCycles,
          ref,date:now.toLocaleDateString("fr-FR")+" à "+now.toLocaleTimeString("fr-FR",{hour:"2-digit",minute:"2-digit"})
        });
        const path=`recus/${groupe.id}/${membre.id}-${Date.now()}.jpg`;
        const {error:upErr}=await supabase.storage.from("photos").upload(path,blob,{contentType:"image/jpeg",upsert:true});
        if(!upErr){
          const {data:pub}=supabase.storage.from("photos").getPublicUrl(path);
          const {error:msgErr}=await supabase.from("messages").insert({groupe_id:groupe.id,auteur_user_id:user.id,auteur_nom:user.prenom,auteur:user.prenom,texte:"",image_url:pub.publicUrl,destinataire_user_id:membre.userId});
          if(!msgErr)notifyMessage([membre.userId],user.prenom,false,`/?g=${groupe.id}&tab=social&dm=${user.id}&dmName=${encodeURIComponent(user.prenom)}`);
        }
      }catch{}
    }
    setDeclBusy(null);
  };
  const rejeterDeclaration=async(d)=>{
    setDeclBusy(d.id);
    const {error}=await supabase.from("declarations_paiement").update({statut:"rejete"}).eq("id",d.id);
    setDeclBusy(null);
    if(error)return onToast("Erreur : "+(error.message||"inconnue"),"error");
    setDeclarations(ds=>ds.filter(x=>x.id!==d.id));
    onToast("Déclaration rejetée.");
    const membre=groupe.membres.find(m=>m.id===d.membre_id);
    if(membre?.userId){
      supabase.functions.invoke("send-push",{body:{user_id:membre.userId,title:"THT - Paiement non confirmé",body:`Ta déclaration de paiement pour "${groupe.nom}" n a pas été confirmée. Contacte la créatrice.`,url:`/?g=${groupe.id}&tab=membres`}}).catch(()=>{});
    }
  };

  const loadRapports=async()=>{
    const {data}=await supabase.from("rapports_reunion").select("*").eq("groupe_id",groupe.id).order("date_reunion",{ascending:false});
    setRapports(data||[]);
  };
  useEffect(()=>{loadRapports();},[groupe.id]);

  const creerRapport=async()=>{
    if(!newRapport.titre.trim())return onToast("Donne un titre au rapport","error");
    setRapportBusy(true);
    const {data,error}=await supabase.from("rapports_reunion").insert({groupe_id:groupe.id,titre:s(newRapport.titre.trim()),contenu:s(newRapport.contenu||""),date_reunion:newRapport.date||new Date().toISOString().split("T")[0]}).select().single();
    setRapportBusy(false);
    if(error)return onToast("Impossible d enregistrer le rapport","error");
    setRapports(r=>[data,...r]);
    setShowRapport(false);setNewRapport({titre:"",contenu:"",date:""});
    onToast("Rapport de réunion enregistré !");
    groupe.membres.filter(m=>m.userId).forEach(m=>{
      supabase.functions.invoke("send-push",{body:{user_id:m.userId,title:"THT - Nouveau compte-rendu",body:`"${s(newRapport.titre.trim())}" a été publié pour "${groupe.nom}"`,url:`/?g=${groupe.id}&tab=reunions`}}).catch(()=>{});
    });
  };

  const supprimerRapport=async(id)=>{
    const {error}=await supabase.from("rapports_reunion").delete().eq("id",id);
    if(error)return onToast("Suppression impossible","error");
    setRapports(r=>r.filter(x=>x.id!==id));
    onToast("Rapport supprime");
  };

  const enregistrerReglement=async()=>{
    setReglementBusy(true);
    const {error}=await supabase.from("groupes").update({reglement:reglementTxt}).eq("id",groupe.id);
    setReglementBusy(false);
    if(error)return onToast("Enregistrement impossible","error");
    setGroupe(g=>({...g,reglement:reglementTxt}));
    onUpdateGroupe(groupe.id,{reglement:reglementTxt});
    setEditReglement(false);
    onToast("Reglement interieur enregistre !");
  };

  // Une demande de pret n'est QU'UNE DEMANDE : aucun argent n'a encore change de main,
  // donc aucune photo de preuve n'est demandee ici. La demande part en vote, et c'est
  // seulement au moment de "Accepter et verser" (accepterEtVerserPret) que l'argent est
  // reellement remis et que la photo de preuve est exigee.
  const creerPret=async()=>{
    if(!newPret.membreId)return onToast("Choisis un membre emprunteur","error");
    if(!newPret.montant||Number(newPret.montant)<500)return onToast("Montant minimum 500 FCFA","error");
    setPretBusy(true);
    const {data,error}=await supabase.from("prets").insert({groupe_id:groupe.id,membre_id:newPret.membreId,montant:Number(newPret.montant),motif:newPret.motif?.trim()||null,statut:"en_attente"}).select().single();
    setPretBusy(false);
    if(error)return onToast("Impossible de créer la demande de prêt","error");
    setPrets(p=>[data,...p]);
    setShowPret(false);setNewPret({membreId:"",montant:"",motif:""});
    onToast("Demande de prêt enregistrée, elle part au vote des membres");
    const emprunteur=groupe.membres.find(m=>m.id===newPret.membreId);
    if(emprunteur?.userId){
      supabase.functions.invoke("send-push",{body:{user_id:emprunteur.userId,title:"THT - Demande de pret",body:`Une demande de pret de ${fmtFCFA(Number(newPret.montant))} a ete enregistree a ton nom pour "${groupe.nom}". Elle part au vote des membres.`,url:`/?g=${groupe.id}&tab=prets`}}).catch(()=>{});
    }
  };

  // C'est ICI que l'argent change reellement de main : la photo de preuve est donc
  // obligatoire a ce moment precis (et pas au moment de la simple demande).
  const accepterEtVerserPret=async()=>{
    if(!accepterM)return;
    if(!pretPhoto)return onToast("La photo de l'argent remis est obligatoire pour verser le prêt","error");
    setPretBusy(true);
    let photoUrl=null;
    try{
      const blobPhoto=await (await fetch(pretPhoto)).blob();
      const path=`prets/${groupe.id}/${accepterM.membre_id}-${Date.now()}.jpg`;
      const {error:upErr}=await supabase.storage.from("photos").upload(path,blobPhoto,{contentType:"image/jpeg",upsert:true});
      if(!upErr){const {data:pub}=supabase.storage.from("photos").getPublicUrl(path);photoUrl=pub.publicUrl;}
    }catch{/* photoUrl reste null : on bloque juste en dessous */}
    if(!photoUrl){setPretBusy(false);return onToast("Envoi de la photo impossible, réessaie avant de verser","error");}
    const {error}=await supabase.from("prets").update({statut:"en_cours",photo_url:photoUrl,date_versement:new Date().toISOString(),taux_interet:Number(accepterTaux)||0,date_echeance:accepterEcheance||null}).eq("id",accepterM.id);
    setPretBusy(false);
    if(error)return onToast("Erreur : "+(error.message||"inconnue"),"error");
    setPrets(p=>p.map(x=>x.id===accepterM.id?{...x,statut:"en_cours",photo_url:photoUrl,taux_interet:Number(accepterTaux)||0,date_echeance:accepterEcheance||null}:x));
    setAccepterM(null);setPretPhoto(null);setPretPhotoPreview(null);setAccepterTaux("0");setAccepterEcheance("");
    onToast("Pret accepte et verse !");
    const m=groupe.membres.find(mm=>mm.id===accepterM.membre_id);
    if(m?.userId){
      supabase.functions.invoke("send-push",{body:{user_id:m.userId,title:"THT - Pret accepte !",body:`Ta demande de pret de ${fmtFCFA(accepterM.montant)} a ete acceptee et versee.`,url:`/?g=${groupe.id}&tab=prets`}}).catch(()=>{});
    }
  };

  const refuserPret=async(p)=>{
    const {error}=await supabase.from("prets").update({statut:"refuse"}).eq("id",p.id);
    if(error)return onToast("Erreur : "+(error.message||"inconnue"),"error");
    setPrets(pr=>pr.map(x=>x.id===p.id?{...x,statut:"refuse"}:x));
    onToast("Demande refusee");
    const m=groupe.membres.find(mm=>mm.id===p.membre_id);
    if(m?.userId){
      supabase.functions.invoke("send-push",{body:{user_id:m.userId,title:"THT - Demande de pret refusee",body:`Ta demande de pret de ${fmtFCFA(p.montant)} pour "${groupe.nom}" n a pas ete acceptee.`,url:`/?g=${groupe.id}&tab=prets`}}).catch(()=>{});
    }
  };

  const [pretsVotes,setPretsVotes]=useState({});
  const [voteBusy,setVoteBusy]=useState(null);
  const loadPretsVotes=async()=>{
    const {data}=await supabase.from("prets_votes").select("*").eq("groupe_id",groupe.id);
    const parPret={};
    (data||[]).forEach(v=>{(parPret[v.pret_id]=parPret[v.pret_id]||[]).push(v);});
    setPretsVotes(parPret);
  };
  useEffect(()=>{loadPretsVotes();},[groupe.id]);
  const voterProcuration=async(pret,membre,valeur)=>{
    setVoteBusy(membre.id);
    const moiMembre=groupe.membres.find(m=>m.userId===user.id);
    const {data,error}=await supabase.from("prets_votes").insert({pret_id:pret.id,groupe_id:groupe.id,voter_membre_id:membre.id,valeur,vote_par_admin_id:moiMembre?.id||null}).select().single();
    setVoteBusy(null);
    if(error)return onToast("Erreur : "+(error.message||"inconnue"),"error");
    setPretsVotes(pv=>({...pv,[pret.id]:[...(pv[pret.id]||[]),data]}));
  };
  const autoRefuseDoneRef=useRef(new Set());
  useEffect(()=>{
    prets.filter(p=>p.statut==="en_attente").forEach(p=>{
      if(autoRefuseDoneRef.current.has(p.id))return;
      const {decision}=calcVotePret(p,pretsVotes[p.id],groupe.membres.length);
      if(decision==="refuse"){
        autoRefuseDoneRef.current.add(p.id);
        refuserPret(p);
      }
    });
  },[prets,pretsVotes,groupe.membres.length]);

  const rembourserPret=async()=>{
    const amt=Number(remboAmt);
    if(!amt||amt<1)return;
    const total=remboM.montant*(1+remboM.taux_interet/100);
    const nouveauRembourse=remboM.montant_rembourse+amt;
    const statut=nouveauRembourse>=total?"rembourse":"en_cours";
    const {error}=await supabase.from("prets").update({montant_rembourse:nouveauRembourse,statut}).eq("id",remboM.id);
    if(error)return onToast("Remboursement impossible : "+(error.message||"inconnue"),"error");
    setPrets(ps=>ps.map(p=>p.id===remboM.id?{...p,montant_rembourse:nouveauRembourse,statut}:p));
    onToast(statut==="rembourse"?"Prêt entièrement remboursé !":"Remboursement enregistre !");
    setRemboM(null);setRemboAmt("");
  };

  const montantDu=(m)=>(m.montantPerso??groupe.montant);
  const aJour=groupe.membres.filter(m=>m.paye);
  const enRet=groupe.membres.filter(m=>!m.paye);
  const collecte=aJour.reduce((s,m)=>s+montantDu(m),0)+(groupe.montantInitial||0);
  const cagnotteTour=groupe.membres.reduce((s,m)=>s+montantDu(m),0)+(groupe.montantInitial||0);
  const taux=groupe.membres.length>0?Math.round((aJour.length/groupe.membres.length)*100):0;

  const exporterRapportPDF=async()=>{
    const {jsPDF}=await import("jspdf");
    const doc=new jsPDF();
    let y=20;
    doc.setFontSize(18);doc.text(`THT - ${groupe.nom}`,14,y);y+=10;
    doc.setFontSize(11);doc.text(`Genere le ${new Date().toLocaleDateString("fr-FR")}`,14,y);y+=12;
    doc.setFontSize(13);doc.text(`Bilan - Cycle ${groupe.cycle}/${groupe.totalCycles}`,14,y);y+=8;
    doc.setFontSize(10);
    [["Total collecté ce cycle",fmtFCFA(collecte)],["Total cotisations",fmtFCFA(cagnotteTour)],["Caisse sociale",fmtFCFA(groupe.caisseSociale)],["Taux de ponctualite",`${taux}%`],["Membres à jour",`${aJour.length}/${groupe.membres.length}`],["Prochain tour",groupe.prochainTour],["Cycles restants",String(groupe.totalCycles-groupe.cycle)],["Dettes cumulees (cycles precedents)",fmtFCFA(groupe.membres.reduce((s,m)=>s+(m.dette||0),0))]].forEach(([l,v])=>{doc.text(`${l} : ${v}`,14,y);y+=7;});
    y+=6;
    doc.setFontSize(13);doc.text("Suivi par membre",14,y);y+=8;
    doc.setFontSize(10);
    groupe.membres.forEach(m=>{doc.text(`${m.prenom} - ${fmtFCFA(m.cyclesPaies*groupe.montant)} verse (${m.cyclesPaies}/${m.cyclesTotal} cycles)`,14,y);y+=7;if(y>270){doc.addPage();y=20;}});
    doc.save(`rapport-${groupe.nom.replace(/[^a-z0-9]/gi,"_")}.pdf`);
    onToast("Rapport PDF telecharge !");
  };


  const toggleP=async(mid)=>{
    const m=groupe.membres.find(x=>x.id===mid);
    const newPaye=!m.paye;
    const montant=montantDu(m);
    const newScore=newPaye?Math.min(m.score+5,100):Math.max(m.score-10,0);
    const newVersements=newPaye?(m.versements||0)+montant:Math.max(0,(m.versements||0)-montant);
    const newCyclesPaies=newPaye?(m.cyclesPaies||0)+1:Math.max(0,(m.cyclesPaies||0)-1);
    const {error}=await supabase.from("membres").update({paye:newPaye,score:newScore,versements:newVersements,cycles_paies:newCyclesPaies}).eq("id",mid);
    if(error)return onToast("Mise à jour impossible","error");
    if(newPaye){
      await supabase.from("transactions").insert({groupe_id:groupe.id,membre_id:mid,montant,cycle:groupe.cycle,statut:"paye"});
    }
    setGroupe(g=>({...g,cagnotte:newPaye?g.cagnotte+montant:Math.max(0,g.cagnotte-montant),membres:g.membres.map(x=>x.id===mid?{...x,paye:newPaye,score:newScore,versements:newVersements,cyclesPaies:newCyclesPaies}:x)}));
    onToast("Statut mis a jour");
  };
  const toggleC=async(cid)=>{
    const c=groupe.checklist.find(x=>x.id===cid);
    const {error}=await supabase.from("checklist").update({done:!c.done}).eq("id",cid);
    if(error)return onToast("Mise à jour impossible","error");
    setGroupe(g=>({...g,checklist:g.checklist.map(c=>c.id===cid?{...c,done:!c.done}:c)}));
  };
  const addTask=async()=>{
    if(!newTask.trim())return onToast("Ecris une tache d abord","error");
    const {data,error}=await supabase.from("checklist").insert({groupe_id:groupe.id,label:s(newTask.trim()),done:false}).select().single();
    if(error)return onToast("Ajout impossible","error");
    setGroupe(g=>({...g,checklist:[...g.checklist,{id:data.id,label:data.label,done:false}]}));
    setNewTask("");onToast("Tâche ajoutée !");
  };
  const delTask=async(cid)=>{
    const {error}=await supabase.from("checklist").delete().eq("id",cid);
    if(error)return onToast("Suppression impossible","error");
    setGroupe(g=>({...g,checklist:g.checklist.filter(c=>c.id!==cid)}));
    onToast("Tâche supprimée");
  };
  const openEvt=(m)=>{setEvtM(m);setEvtTxt(m.evenement||"");};
  const saveEvt=async()=>{
    const val=evtTxt.trim()?s(evtTxt.trim()):null;
    const {error}=await supabase.from("membres").update({evenement:val}).eq("id",evtM.id);
    if(error)return onToast("Mise à jour impossible","error");
    setGroupe(g=>({...g,membres:g.membres.map(m=>m.id===evtM.id?{...m,evenement:val}:m)}));
    setEvtM(null);setEvtTxt("");onToast(val?"Evenement enregistre !":"Evenement supprime");
  };
  const [messages,setMessages]=useState([]);
  const [thread,setThread]=useState(deepLink?.thread||null);
  const loadMessages=async()=>{
    let q=supabase.from("messages").select("*").eq("groupe_id",groupe.id);
    q=thread?q.or(`and(auteur_user_id.eq.${user.id},destinataire_user_id.eq.${thread.userId}),and(auteur_user_id.eq.${thread.userId},destinataire_user_id.eq.${user.id})`):q.is("destinataire_user_id",null);
    const {data}=await q.order("created_at",{ascending:true});
    setMessages((data||[]).map(m=>({id:m.id,auteur:m.auteur_nom,texte:m.texte,audioUrl:m.audio_url,imageUrl:m.image_url,time:new Date(m.created_at).toLocaleString("fr-FR",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"})})));
  };
  useEffect(()=>{loadMessages();},[groupe.id,thread]);
  const threadRef=useRef(thread);
  useEffect(()=>{threadRef.current=thread;},[thread]);
  useEffect(()=>{
    const ch=supabase.channel(`msgs-grp-${groupe.id}`).on("postgres_changes",{event:"INSERT",schema:"public",table:"messages",filter:`groupe_id=eq.${groupe.id}`},(payload)=>{
      const m=payload.new;
      const th=threadRef.current;
      if(m.auteur_user_id===user.id)return; // mes propres messages sont deja affiches
      const belongsHere=th?(m.auteur_user_id===th.userId&&m.destinataire_user_id===user.id):!m.destinataire_user_id;
      if(belongsHere){
        setMessages(prev=>prev.some(x=>x.id===m.id)?prev:[...prev,{id:m.id,auteur:m.auteur_nom,texte:m.texte,audioUrl:m.audio_url,imageUrl:m.image_url,time:new Date(m.created_at).toLocaleString("fr-FR",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"})}]);
        onToast(`Nouveau message de ${m.auteur_nom}`);
        return;
      }
      // Message qui n'appartient pas a la conversation ouverte : on previent quand meme
      // si je suis concerne. Avant, un message PRIVE recu alors qu'on regardait le fil
      // de groupe (ou une autre conversation) ne declenchait aucune notification.
      if(m.destinataire_user_id===user.id)onToast(`🔒 Message privé de ${m.auteur_nom}`);
      else if(!m.destinataire_user_id)onToast(`Nouveau message de groupe de ${m.auteur_nom}`);
    }).subscribe();
    return()=>{supabase.removeChannel(ch);};
  },[groupe.id,user.id]);
  const {recording,start:startRec,stop:stopRec}=useAudioRecorder();
  // Tous les membres de la tontine sauf moi (la creatrice), dedoublonnes.
  const autresMembres=[...new Map(groupe.membres.filter(m=>m.userId!==user.id).map(m=>[m.id,m])).values()];
  const getRecipients=()=>(thread?[thread.userId]:groupe.membres.map(m=>m.userId)).filter(uid=>uid&&uid!==user.id);
  const getDeepLink=()=>`/?g=${groupe.id}&tab=social`+(thread?`&dm=${user.id}&dmName=${encodeURIComponent(user.prenom)}`:"");
  const sendMsg=async()=>{
    if(!msgInput.trim())return;
    const texte=s(msgInput.trim());
    setMsgInput("");
    const {data,error}=await supabase.from("messages").insert({groupe_id:groupe.id,auteur_user_id:user.id,auteur_nom:user.prenom,auteur:user.prenom,texte,destinataire_user_id:thread?.userId||null}).select().single();
    if(error)return onToast("Erreur : "+(error.message||"inconnue"),"error");
    setMessages(m=>[...m,{id:data.id,auteur:data.auteur_nom,texte:data.texte,time:"maintenant"}]);
    notifyMessage(getRecipients(),user.prenom,false,getDeepLink());
    onToast("Message envoyé !");
  };
  const [sendingAudio,setSendingAudio]=useState(false);
  const toggleRecord=async()=>{
    if(recording){
      const blob=await stopRec();
      if(!blob||blob.size<500)return;
      setSendingAudio(true);
      try{
        const audioUrl=await uploadAudio(blob,groupe.id);
        const {data,error}=await supabase.from("messages").insert({groupe_id:groupe.id,auteur_user_id:user.id,auteur_nom:user.prenom,auteur:user.prenom,texte:"",audio_url:audioUrl,destinataire_user_id:thread?.userId||null}).select().single();
        if(error)throw error;
        setMessages(m=>[...m,{id:data.id,auteur:data.auteur_nom,texte:"",audioUrl:data.audio_url,imageUrl:data.image_url,time:"maintenant"}]);
        notifyMessage(getRecipients(),user.prenom,true,getDeepLink());
        onToast("Message vocal envoyé !");
      }catch{onToast("Envoi du message vocal impossible","error");}
      setSendingAudio(false);
    }else{
      const ok=await startRec();
      if(!ok)onToast("Micro indisponible ou refusé","error");
    }
  };
  const addM=async()=>{
    if(pickerBusyRef.current)return;
    if(!newM.prenom.trim()||newM.tel.replace(/\D/g,"").length<8)return onToast("Prénom et téléphone requis","error");
    if(groupe.membres.length>=limiteMembres(user)){setShowAdd(false);setShowUpgrade(true);return;}
    pickerBusyRef.current=true;setPickerBusy(true);
    const payload={groupe_id:groupe.id,prenom:s(newM.prenom.trim()),tel:sPhone(newM.tel),quartier:s(newM.quartier||""),photo_url:newM.photo||null,paye:false,score:80,versements:0,cycles_paies:0,ordre:groupe.membres.length,montant_perso:newM.montantPerso?Number(newM.montantPerso):null};
    const {data,error}=await supabase.from("membres").insert(payload).select().single();
    pickerBusyRef.current=false;setPickerBusy(false);
    if(error){
      if(error.code==="23505")return onToast("Ce numéro est déjà membre de cette tontine !","error");
      return onToast("Ajout impossible : "+(error.message||"erreur inconnue"),"error");
    }
    supabase.rpc("link_membre",{p_membre_id:data.id}).then(async()=>{
      const {data:linked}=await supabase.from("membres").select("user_id").eq("id",data.id).single();
      if(linked?.user_id){
        supabase.functions.invoke("send-push",{body:{user_id:linked.user_id,title:"THT",body:`Tu as ete ajoute(e) a la tontine "${groupe.nom}" !`,url:`/?g=${groupe.id}`}}).catch(()=>{});
      }
    }).catch(()=>{});
    setGroupe(g=>({...g,membres:[...g.membres,{id:data.id,userId:null,prenom:data.prenom,tel:data.tel,quartier:data.quartier,photo:data.photo_url,score:80,paye:false,cyclesPaies:0,cyclesTotal:g.totalCycles-g.cycle+1,evenement:null,versements:0,montantPerso:data.montant_perso!=null?Number(data.montant_perso):null}]}));
    setNewM({prenom:"",tel:"",quartier:"",photo:""});
    setShowAdd(false);
    onToast(`${data.prenom} a ete ajoute(e) !`);
  };
  const addMembresEnMasse=async(contacts)=>{
    if(pickerBusyRef.current)return;
    const dejaTels=new Set(groupe.membres.map(m=>m.tel));
    const vus=new Set();
    const candidats=contacts
      .map(c=>({prenom:(c.name?.[0]||"").split(" ")[0]||"",tel:c.tel?.[0]?sPhone(c.tel[0]):""}))
      .filter(c=>c.prenom.trim()&&c.tel.replace(/\D/g,"").length>=8)
      .filter(c=>{if(dejaTels.has(c.tel)||vus.has(c.tel))return false;vus.add(c.tel);return true;});
    if(candidats.length===0)return onToast("Aucun contact valide (nom + numéro) dans la sélection","error");
    const placesRestantes=estIllimite(user)?candidats.length:Math.max(0,limiteMembres(user)-groupe.membres.length);
    if(placesRestantes===0){setShowAdd(false);setShowUpgrade(true);return;}
    const aTraiter=candidats.slice(0,placesRestantes);
    const ignoresLimite=candidats.length-aTraiter.length;
    const invalides=contacts.length-candidats.length;
    pickerBusyRef.current=true;setPickerBusy(true);
    let ajoutes=0,echecs=0;
    for(let i=0;i<aTraiter.length;i++){
      const c=aTraiter[i];
      const payload={groupe_id:groupe.id,prenom:s(c.prenom.trim()),tel:c.tel,quartier:"",photo_url:null,paye:false,score:80,versements:0,cycles_paies:0,ordre:groupe.membres.length+i,montant_perso:null};
      const {data,error}=await supabase.from("membres").insert(payload).select().single();
      if(error){echecs++;continue;}
      ajoutes++;
      setGroupe(g=>({...g,membres:[...g.membres,{id:data.id,userId:null,prenom:data.prenom,tel:data.tel,quartier:data.quartier,photo:data.photo_url,score:80,paye:false,cyclesPaies:0,cyclesTotal:g.totalCycles-g.cycle+1,evenement:null,versements:0,montantPerso:null}]}));
      supabase.rpc("link_membre",{p_membre_id:data.id}).then(async()=>{
        const {data:linked}=await supabase.from("membres").select("user_id").eq("id",data.id).single();
        if(linked?.user_id){
          supabase.functions.invoke("send-push",{body:{user_id:linked.user_id,title:"THT",body:`Tu as ete ajoute(e) a la tontine "${groupe.nom}" !`,url:`/?g=${groupe.id}`}}).catch(()=>{});
        }
      }).catch(()=>{});
    }
    pickerBusyRef.current=false;setPickerBusy(false);
    setShowAdd(false);
    let msg=`${ajoutes} membre(s) ajoute(s) !`;
    if(echecs>0)msg+=` ${echecs} echec(s).`;
    if(ignoresLimite>0)msg+=` ${ignoresLimite} non ajoute(s) (limite gratuite 15 membres).`;
    if(invalides>0)msg+=` ${invalides} ignore(s) (deja membre ou numero invalide).`;
    onToast(msg,echecs>0||ignoresLimite>0?"warn":"success");
  };
  const delM=async(mid)=>{
    const {error}=await supabase.from("membres").delete().eq("id",mid);
    if(error)return onToast("Suppression impossible","error");
    setGroupe(g=>({...g,membres:g.membres.filter(m=>m.id!==mid)}));
    onToast("Membre retiré");
  };
  const saveEditMembre=async()=>{
    if(!editMembre)return;
    if(!editMembre.prenom.trim()||editMembre.tel.replace(/\D/g,"").length<8)return onToast("Prénom et téléphone requis","error");
    setEditMBusy(true);
    const payload={prenom:s(editMembre.prenom.trim()),tel:sPhone(editMembre.tel),quartier:s(editMembre.quartier||""),montant_perso:editMembre.montantPerso?Number(editMembre.montantPerso):null};
    const {error}=await supabase.from("membres").update(payload).eq("id",editMembre.id);
    setEditMBusy(false);
    if(error){
      if(error.code==="23505")return onToast("Ce numéro est déjà utilisé par un autre membre de cette tontine !","error");
      return onToast("Modification impossible : "+(error.message||"erreur inconnue"),"error");
    }
    setGroupe(g=>({...g,membres:g.membres.map(m=>m.id===editMembre.id?{...m,prenom:payload.prenom,tel:payload.tel,quartier:payload.quartier,montantPerso:payload.montant_perso}:m)}));
    onToast(`${payload.prenom} a ete modifie(e) !`);
    setEditMembre(null);
  };
  const openVers=(m)=>{setVersM(m);setVersAmt("");setShowVers(true);};
  const openHisto=async(m)=>{
    setHistoM({...m,historique:[]});setShowHisto(true);
    const {data,error}=await supabase.from("transactions").select("*").eq("membre_id",m.id).order("created_at",{ascending:false});
    if(!error)setHistoM(h=>h&&h.id===m.id?{...h,historique:(data||[]).map(t=>({id:t.id,mois:new Date(t.created_at).toLocaleDateString("fr-FR",{month:"long",year:"numeric"}),heure:new Date(t.created_at).toLocaleTimeString("fr-FR",{hour:"2-digit",minute:"2-digit"}),montant:Number(t.montant),statut:t.statut,date:t.created_at?.split("T")[0],photoUrl:t.photo_url,recuEnvoye:t.recu_envoye,cycle:t.cycle}))}:h);
  };
  const toggleChecklistItem=async(t,champ,val)=>{
    await supabase.from("transactions").update({[champ]:val}).eq("id",t.id);
    setHistoM(h=>h?{...h,historique:h.historique.map(x=>x.id===t.id?{...x,[champ==="recu_envoye"?"recuEnvoye":champ]:val}:x)}:h);
  };
  const toutEstEnOrdre=(t)=>{
    toggleChecklistItem(t,"recu_envoye",true);
    onToast("Marqué comme réglé !");
  };
  const voirRecu=async(h)=>{
    setRecuBusy(true);
    try{
      const d=new Date(h.date||Date.now());
      const ref=`THT-${d.getFullYear()}${String(d.getMonth()+1).padStart(2,"0")}${(h.id||"").slice(-4).toUpperCase()}`;
      const blob=await genererRecuImage({
        nomTontine:groupe.nom,prenom:histoM.prenom,montantRecu:fmtFCFA(h.montant),montantDu:fmtFCFA(montantDu(histoM)),
        totalVerse:fmtFCFA(h.montant),statut:h.statut==="paye"?"PAYE CE CYCLE":"VERSEMENT PARTIEL",
        cycle:h.cycle||groupe.cycle,totalCycles:groupe.totalCycles,
        ref,date:d.toLocaleDateString("fr-FR")+(h.heure?" à "+h.heure:"")
      });
      const shared=await partagerImage(blob,`recu-${ref}.jpg`,"Recu THT",`Recu de paiement - ${histoM.prenom} - ${groupe.nom}`);
      onToast(shared?"Reçu prêt à partager !":"Recu telecharge ! Envoie-le depuis tes fichiers.");
    }catch{onToast("Impossible de régénérer ce reçu","error");}
    setRecuBusy(false);
  };
  const toggleCollecteur=async(m)=>{
    const nouveau=!m.roleCollecteur;
    const {error}=await supabase.from("membres").update({role_collecteur:nouveau}).eq("id",m.id);
    if(error)return onToast("Erreur : "+(error.message||"inconnue"),"error");
    setGroupe(g=>({...g,membres:g.membres.map(mm=>mm.id===m.id?{...mm,roleCollecteur:nouveau}:mm)}));
    onToast(nouveau?`${m.prenom} peut maintenant enregistrer des versements !`:`${m.prenom} n est plus collecteur`);
    if(nouveau&&m.userId){
      supabase.functions.invoke("send-push",{body:{user_id:m.userId,title:"THT - Nouveau role",body:`Tu es maintenant collecteur(trice) pour "${groupe.nom}" : tu peux enregistrer les versements des membres.`,url:`/?g=${groupe.id}&tab=membres`}}).catch(()=>{});
    }
  };
  const updatePhoto=async(mid,e)=>{
    const f=e.target.files?.[0];if(!f)return;
    try{
      const blob=await compressImage(f,TAILLE_AVATAR,QUALITE_AVATAR);
      const photoUrl=await uploadPhoto(new File([blob],"membre.jpg",{type:"image/jpeg"}),"membres");
      const {error}=await supabase.from("membres").update({photo_url:photoUrl}).eq("id",mid);
      if(error)return onToast("Photo impossible a sauvegarder","error");
      setGroupe(g=>({...g,membres:g.membres.map(m=>m.id===mid?{...m,photo:photoUrl}:m)}));
      onToast("Photo mise a jour !");
    }catch{onToast("Cette photo n'a pas pu etre traitee, essaie une autre image","error");}
  };

  // --- Ajout des preuves APRES un versement deja confirme ---------------------
  // Avant, pour ajouter une photo ou un recu oublie, il fallait rouvrir tout le
  // formulaire "+ Versement" (ce qui donnait l'impression d'enregistrer un 2e
  // paiement). Desormais le formulaire disparait une fois le versement confirme et
  // laisse place a deux actions ciblees, qui ne modifient QUE la preuve manquante.
  const [preuveBusy,setPreuveBusy]=useState(null);

  const ajouterPhotoPreuve=async(m,tx,e)=>{
    const f=e.target.files?.[0];if(!f)return;
    setPreuveBusy(m.id);
    const empreinte=await empreinteImage(f);
    if(empreinte){
      const {data:deja}=await supabase.from("transactions")
        .select("id").eq("groupe_id",groupe.id).eq("photo_hash",empreinte).limit(1);
      if(deja&&deja.length>0){
        setPreuveBusy(null);
        return onToast("Cette photo a déjà servi de preuve dans cette tontine.","error");
      }
    }
    // Meme lecture automatique que sur les autres envois de photo.
    const analyse=await analyserPreuve(f,montantDu(m));
    if(analyse?.verdict==="refuse"){
      setPreuveBusy(null);
      return onToast(`Cette image ne ressemble pas à une preuve de paiement${analyse.description?` (${analyse.description})`:""}. Envoie la capture de l'opérateur ou la photo des billets.`,"error");
    }
    try{
      const blob=await compressImage(f);
      const path=`versements/${groupe.id}/${m.id}-${Date.now()}.jpg`;
      const {error:upErr}=await supabase.storage.from("photos").upload(path,blob,{contentType:"image/jpeg",upsert:true});
      if(upErr)throw upErr;
      const {data:pub}=supabase.storage.from("photos").getPublicUrl(path);
      const {error}=await supabase.from("transactions").update({photo_url:pub.publicUrl,photo_hash:empreinte}).eq("id",tx.id);
      if(error)throw error;
      if(analyse?.verifie)supabase.from("transactions").update({preuve_analyse:analyse}).eq("id",tx.id).then(()=>{},()=>{});
      setSuivi(s=>({...s,[m.id]:{...s[m.id],photo_url:pub.publicUrl,preuve_analyse:analyse?.verifie?analyse:null}}));
      onToast(resumePreuve(analyse)?`Photo ajoutée — ${resumePreuve(analyse)}`:"Photo de l'argent ajoutée !");
    }catch{onToast("Envoi de la photo impossible, réessaie","error");}
    setPreuveBusy(null);
  };

  const envoyerRecuApres=async(m,tx)=>{
    setPreuveBusy(m.id);
    try{
      const now=new Date();
      const ref=`THT-${now.getFullYear()}${String(now.getMonth()+1).padStart(2,"0")}${m.id.slice(-4).toUpperCase()}`;
      const blob=await genererRecuImage({
        nomTontine:groupe.nom,prenom:m.prenom,montantRecu:fmtFCFA(Number(tx.montant)||0),montantDu:fmtFCFA(montantDu(m)),
        totalVerse:fmtFCFA(m.versements||0),statut:m.paye?"PAYE CE CYCLE":"VERSEMENT PARTIEL",cycle:groupe.cycle,totalCycles:groupe.totalCycles,
        ref,date:now.toLocaleDateString("fr-FR")+" à "+now.toLocaleTimeString("fr-FR",{hour:"2-digit",minute:"2-digit"})
      });
      let envoye=false;
      if(m.userId){
        const path=`recus/${groupe.id}/${m.id}-${Date.now()}.jpg`;
        const {error:upErr}=await supabase.storage.from("photos").upload(path,blob,{contentType:"image/jpeg",upsert:true});
        if(!upErr){
          const {data:pub}=supabase.storage.from("photos").getPublicUrl(path);
          const {error:msgErr}=await supabase.from("messages").insert({groupe_id:groupe.id,auteur_user_id:user.id,auteur_nom:user.prenom,auteur:user.prenom,texte:"",image_url:pub.publicUrl,destinataire_user_id:m.userId});
          if(!msgErr){
            notifyMessage([m.userId],user.prenom,false,`/?g=${groupe.id}&tab=social&dm=${user.id}&dmName=${encodeURIComponent(user.prenom)}`);
            envoye=true;
            onToast("Reçu envoyé sur sa messagerie !");
          }
        }
      }
      if(!envoye){
        const shared=await partagerImage(blob,`recu-${ref}.jpg`,"Recu THT",`Recu de paiement - ${m.prenom} - ${groupe.nom}`);
        onToast(shared?"Reçu prêt à partager !":"Reçu téléchargé !");
      }
      const {error}=await supabase.from("transactions").update({recu_envoye:true}).eq("id",tx.id);
      if(error)throw error;
      setSuivi(s=>({...s,[m.id]:{...s[m.id],recu_envoye:true}}));
    }catch{onToast("Le reçu n'a pas pu être envoyé, réessaie","error");}
    setPreuveBusy(null);
  };

  const buildRecu=(m,amt,paye)=>{
    const now=new Date();
    const dateStr=now.toLocaleDateString("fr-FR",{day:"2-digit",month:"long",year:"numeric"});
    const heureStr=now.toLocaleTimeString("fr-FR",{hour:"2-digit",minute:"2-digit"});
    return `THT - RECU DE PAIEMENT OFFICIEL
================================
Date : ${dateStr} a ${heureStr}
Ref  : THT-${now.getFullYear()}${String(now.getMonth()+1).padStart(2,"0")}${m.id.slice(-4).toUpperCase()}

MEMBRE     : ${m.prenom}
TONTINE    : ${groupe.nom}
FREQUENCE  : ${groupe.frequence}
MONTANT DU : ${fmtFCFA(montantDu(m))}
================================
MONTANT RECU    : ${fmtFCFA(amt)}
TOTAL VERSE     : ${fmtFCFA((m.versements||0)+amt)}
STATUT          : ${paye?"PAYE CE CYCLE":"VERSEMENT PARTIEL"}
================================
Cycle en cours : ${groupe.cycle} sur ${groupe.totalCycles}
Fiabilite      : ${m.score}% -> ${Math.min(m.score+(paye?5:2),100)}%

Merci ${m.prenom} pour votre confiance !
THT - Tontine Habi Traore`;
  };

  const [recuBusy,setRecuBusy]=useState(false);
  const saveVers=async(mode)=>{ // mode: "simple" (recu envoye dans la messagerie interne) ou "partager" (partage externe, WhatsApp...)
    const amt=Number(versAmt);
    if(!amt||amt<1)return;
    // Indicateur de chargement des le tout debut : l'analyse de la preuve par l'IA prend
    // quelques secondes. Sans ce sablier immediat, le bouton semblait inerte puis l'ecran
    // "sautait" d'un coup, et on pouvait cliquer deux fois. On couvre desormais TOUTE
    // l'operation et on relache dans le finally, quoi qu'il arrive.
    setRecuBusy(true);
    try{
    // Anti-reutilisation de la preuve dans cette tontine (voir empreinteImage).
    const empreinteVers=versPhoto?await empreinteImage(versPhoto):null;
    if(empreinteVers){
      const {data:deja}=await supabase.from("transactions")
        .select("id").eq("groupe_id",groupe.id).eq("photo_hash",empreinteVers).limit(1);
      if(deja&&deja.length>0)return onToast("Cette photo a déjà servi de preuve dans cette tontine. Prends la photo du nouveau versement.","error");
    }
    // Lecture automatique de la preuve, quand il y en a une. Ici c'est la creatrice
    // elle-meme qui enregistre : le refus reste possible (une photo hors sujet est une
    // erreur de manipulation), mais l'ecart de montant n'est qu'une information --
    // elle sait ce qu'elle encaisse mieux que l'IA.
    const analyseVers=versPhoto?await analyserPreuve(versPhoto,amt):null;
    if(analyseVers?.verdict==="refuse"){
      return onToast(`Cette image ne ressemble pas à une preuve de paiement${analyseVers.description?` (${analyseVers.description})`:""}. Vérifie que tu as choisi la bonne photo.`,"error");
    }
    const newVersements=(versM.versements||0)+amt;
    const paye=newVersements>=montantDu(versM);
    const newScore=Math.min((versM.score||80)+(paye?5:2),100);
    // Meme regle que dans confirmerDeclaration : on n'incremente qu'au basculement.
    const newCyclesPaies=(paye&&!versM.paye)?(versM.cyclesPaies||0)+1:(versM.cyclesPaies||0);
    const {error:mErr}=await supabase.from("membres").update({versements:newVersements,paye,score:newScore,cycles_paies:newCyclesPaies}).eq("id",versM.id);
    if(mErr)return onToast("Versement impossible : "+(mErr.message||"erreur inconnue"),"error");
    let photoUrl=null;
    if(versPhoto){
      try{
        const blobPhoto=await (await fetch(versPhoto)).blob();
        const path=`versements/${groupe.id}/${versM.id}-${Date.now()}.jpg`;
        const {error:upErr}=await supabase.storage.from("photos").upload(path,blobPhoto,{contentType:"image/jpeg",upsert:true});
        if(!upErr){const {data:pub}=supabase.storage.from("photos").getPublicUrl(path);photoUrl=pub.publicUrl;}
      }catch{onToast("Photo non envoyee, le versement est quand meme enregistre","error");}
    }
    // L'empreinte n'est enregistree QUE si la photo a bien ete conservee : sinon la photo
    // serait "grillee" (refusee au prochain essai) alors qu'elle n'a jamais ete gardee.
    const {data:txCreee}=await supabase.from("transactions").insert({groupe_id:groupe.id,membre_id:versM.id,montant:amt,cycle:groupe.cycle,statut:paye?"paye":"partiel",photo_url:photoUrl,photo_hash:photoUrl?empreinteVers:null,recu_envoye:mode==="partager"}).select().single();
    // Range a part et sans bloquer : voir declarerPaiement pour la raison.
    if(txCreee?.id&&photoUrl&&analyseVers?.verifie){
      supabase.from("transactions").update({preuve_analyse:analyseVers}).eq("id",txCreee.id).then(()=>{},()=>{});
    }
    if(analyseVers?.ecart_montant)onToast(analyseVers.ecart_montant,"warn");
    setGroupe(g=>({...g,
      cagnotte:g.cagnotte+amt,
      membres:g.membres.map(m=>m.id===versM.id?{...m,versements:newVersements,paye,cyclesPaies:newCyclesPaies,score:newScore}:m)
    }));
    if(versM.userId){
      supabase.functions.invoke("send-push",{body:{user_id:versM.userId,title:"THT - Versement enregistre",body:`Ton versement de ${fmtFCFA(amt)} pour "${groupe.nom}" a ete enregistre. ${paye?"Tu es a jour !":"Il te reste un solde a payer."}`,url:`/?g=${groupe.id}&tab=membres`}}).catch(()=>{});
    }
    try{
      const now=new Date();
      const ref=`THT-${now.getFullYear()}${String(now.getMonth()+1).padStart(2,"0")}${versM.id.slice(-4).toUpperCase()}`;
      const blob=await genererRecuImage({
        nomTontine:groupe.nom,prenom:versM.prenom,montantRecu:fmtFCFA(amt),montantDu:fmtFCFA(montantDu(versM)),
        totalVerse:fmtFCFA(newVersements),statut:paye?"PAYE CE CYCLE":"VERSEMENT PARTIEL",cycle:groupe.cycle,totalCycles:groupe.totalCycles,
        ref,date:now.toLocaleDateString("fr-FR")+" à "+now.toLocaleTimeString("fr-FR",{hour:"2-digit",minute:"2-digit"})
      });
      if(mode==="partager"){
        const shared=await partagerImage(blob,`recu-${ref}.jpg`,"Recu THT",`Recu de paiement - ${versM.prenom} - ${groupe.nom}`);
        onToast(shared?"Versement enregistre, recu pret a partager !":"Versement enregistre, recu telecharge !");
      }else if(versM.userId){
        const path=`recus/${groupe.id}/${versM.id}-${Date.now()}.jpg`;
        const {error:upErr}=await supabase.storage.from("photos").upload(path,blob,{contentType:"image/jpeg",upsert:true});
        if(!upErr){
          const {data:pub}=supabase.storage.from("photos").getPublicUrl(path);
          const {error:msgErr}=await supabase.from("messages").insert({groupe_id:groupe.id,auteur_user_id:user.id,auteur_nom:user.prenom,auteur:user.prenom,texte:"",image_url:pub.publicUrl,destinataire_user_id:versM.userId});
          if(!msgErr){
            notifyMessage([versM.userId],user.prenom,false,`/?g=${groupe.id}&tab=social&dm=${user.id}&dmName=${encodeURIComponent(user.prenom)}`);
            onToast("Versement enregistre + recu envoye sur sa messagerie !");
          }else{
            onToast("Versement enregistre (le recu n'a pas pu etre envoye : "+(msgErr.message||"erreur inconnue")+")","error");
          }
        }else{
          onToast("Versement enregistre (le recu n'a pas pu etre envoye)","error");
        }
      }else{
        onToast("Versement enregistre (pas de recu envoye : ce membre n'a pas de compte lie a THT)","warn");
      }
    }catch{onToast("Versement enregistre, mais le recu n'a pas pu etre cree","error");}
      setShowVers(false);setVersM(null);setVersAmt("");setVersPhoto(null);setVersPhotoPreview(null);
      loadSuivi();
    }finally{
      setRecuBusy(false);
    }
  };

  const sendRappelEcheance=()=>{
    const retardeurs=groupe.membres.filter(m=>!m.paye);
    if(retardeurs.length===0)return onToast("Tous les membres ont paye !");
    retardeurs.forEach(m=>{
      const msg=`Bonjour ${m.prenom},\n\nRappel THT - ${groupe.nom}\nDate d echeance : ${groupe.dateEcheance||"a venir"}\nMontant a payer : ${fmtFCFA(groupe.montant)}\n\nMerci de regler avant la date limite.\n\nTHT - Votre tontine digitale`;
      const tel=m.tel.replace(/[\s+]/g,"");
      window.open("https://wa.me/"+tel+"?text="+encodeURIComponent(msg),"_blank");
    });
    onToast("Rappels envoyes a "+retardeurs.length+" membre(s) en retard");
  };
  const sendWA=(m)=>{const msg=encodeURIComponent(`Bonjour ${m.prenom}\n\nRappel tontine "${groupe.nom}" :\nCotisation : ${fmtFCFA(groupe.montant)}\nMerci de regler.\nVia THT`);window.open(`https://wa.me/${m.tel.replace(/[\s+]/g,"")}?text=${msg}`,"_blank");};
  const sendWAG=()=>{const msg=encodeURIComponent(`Rappel THT - ${groupe.nom}\n\nCotisation : ${fmtFCFA(groupe.montant)}\nEn retard : ${enRet.map(m=>m.prenom).join(", ")||"aucun"}\nA jour : ${aJour.map(m=>m.prenom).join(", ")}\n\nMerci a toutes !`);window.open(`https://wa.me/?text=${msg}`,"_blank");};

  const PRIMARY_TABS=[["membres",t("tabMembres")],["social",t("tabSocial")],["rapport",t("tabRapport")]];
  const SECONDARY_TABS=[["suivi","Suivi","📋"],["bureau",t("tabBureau"),"🏛️"],["tirage",t("tabTirage"),"🎯"],["prets",t("tabPrets"),"💵"],["reunions",t("tabReunions"),"📝"],["events",t("tabEvenements"),"🎉"],["checklist",t("tabTaches"),"✅"]];
  const inSecondary=SECONDARY_TABS.some(([id])=>id===tab);

  // --- Pastilles "non lu" par section -------------------------------------------
  // messagesNonLus vient d'une petite requete dediee (on ne charge en memoire que le
  // fil ouvert) ; les autres compteurs se deduisent des donnees deja chargees.
  const [messagesNonLus,setMessagesNonLus]=useState(0);
  const compterMessagesNonLus=useCallback(async()=>{
    const depuis=dateVu(user.id,groupe.id,"social");
    let q=supabase.from("messages").select("*",{count:"exact",head:true})
      .eq("groupe_id",groupe.id).neq("auteur_user_id",user.id)
      .or(`destinataire_user_id.is.null,destinataire_user_id.eq.${user.id}`);
    if(depuis)q=q.gt("created_at",depuis);
    const {count,error}=await q;
    if(!error)setMessagesNonLus(count||0);
  },[groupe.id,user.id]);
  useEffect(()=>{compterMessagesNonLus();},[compterMessagesNonLus]);

  // Quand on ouvre une section, elle est consideree comme vue.
  useEffect(()=>{
    marquerVu(user.id,groupe.id,tab);
    if(tab==="social")setMessagesNonLus(0);
  },[tab,groupe.id,user.id]);

  // Compteur par onglet. Nombre quand c'est comptable, simple point sinon.
  const alertes={
    social:{n:messagesNonLus},
    prets:{n:prets.filter(p=>p.statut==="en_attente").length},
    membres:{n:declarations.length},
    tirage:{point:!gagnantCycleActuel&&groupe.membres.length>0&&tab!=="tirage"},
  };
  return(
    <div style={{paddingBottom:90}}>
      <div style={{background:"rgba(255,255,255,0.055)",padding:"44px 16px 16px",display:"flex",alignItems:"center",gap:12,borderBottom:"1px solid rgba(255,255,255,0.09)"}}>
        <button onClick={onBack} style={{background:"none",border:"none",color:"#F5F2EA",fontSize:24,cursor:"pointer",padding:0}}>←</button>
        <div style={{flex:1}}><h2 style={{color:"#F5F2EA",margin:0,fontSize:17,fontWeight:800}}>{groupe.nom}</h2><p style={{color:"#E8B04B",margin:0,fontSize:12}}>{groupe.frequence} - {fmtFCFA(groupe.montant)}/cotisation</p></div>
        <button onClick={()=>{setEditG({nom:groupe.nom,montant:String(groupe.montant),frequence:groupe.frequence});setShowEdit(true);}} style={{background:"rgba(255,255,255,0.09)",border:"1px solid rgba(255,255,255,0.14)",borderRadius:8,padding:"5px 10px",color:"#E8B04B",fontSize:11,fontWeight:700,cursor:"pointer"}}>Modifier</button>
        <button onClick={deleteGroupe} style={{background:"transparent",border:"1px solid #E0526A",borderRadius:8,padding:"5px 10px",color:"#FB7185",fontSize:11,fontWeight:700,cursor:"pointer"}}>Suppr.</button>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,padding:"14px 16px 0"}}>
        {[["Collecte",fmtFCFA(collecte),"💰"],["Cotisations",fmtFCFA(cagnotteTour),"🏆"],["Ponctualite",`${taux}%`,"📊"],["Caisse soc.",fmtFCFA(groupe.caisseSociale),"🏦"],["A jour",`${aJour.length}/${groupe.membres.length}`,"✅"],["En retard",`${enRet.length}`,"⚠️"]].map(([l,v,i])=>(
          <div key={l} style={{background:"rgba(255,255,255,0.055)",border:"1px solid rgba(255,255,255,0.09)",borderRadius:12,padding:"10px 8px",textAlign:"center"}}><p style={{margin:0,fontSize:16}}>{i}</p><p style={{margin:"4px 0 0",color:"#F5F2EA",fontWeight:800,fontSize:12}}>{v}</p><p style={{margin:0,color:"#97A3C9",fontSize:10}}>{l}</p></div>
        ))}
      </div>
      <div style={{margin:"12px 16px 0"}}><button onClick={sendWAG} style={{width:"100%",background:"#075E54",border:"none",borderRadius:12,padding:"12px",color:"#fff",fontWeight:700,fontSize:14,cursor:"pointer"}}>Rappel WhatsApp au groupe complet</button></div>
      <div style={{display:"flex",gap:6,padding:"14px 16px 0"}}>
        {PRIMARY_TABS.map(([id,lbl])=><button key={id} onClick={()=>{setTab(id);setShowMoreTabs(false);}} style={{flex:1,padding:"9px 6px",borderRadius:10,border:"1px solid",cursor:"pointer",fontSize:12,fontWeight:700,background:tab===id?"#E8B04B":"rgba(255,255,255,0.055)",color:tab===id?"#1B1203":"#97A3C9",borderColor:tab===id?"#E8B04B":"rgba(255,255,255,0.09)",position:"relative"}}>{lbl}{tab!==id&&<Pastille n={alertes[id]?.n} point={alertes[id]?.point}/>}</button>)}
        <button onClick={()=>setShowMoreTabs(v=>!v)} style={{flex:1,padding:"9px 6px",borderRadius:10,border:"1px solid",cursor:"pointer",fontSize:12,fontWeight:700,background:inSecondary||showMoreTabs?"#E8B04B":"rgba(255,255,255,0.055)",color:inSecondary||showMoreTabs?"#1B1203":"#97A3C9",borderColor:inSecondary||showMoreTabs?"#E8B04B":"rgba(255,255,255,0.09)",position:"relative"}}>{inSecondary?SECONDARY_TABS.find(([id])=>id===tab)[1]:"⋯ Plus"}{!showMoreTabs&&<Pastille n={SECONDARY_TABS.reduce((t2,[id])=>t2+(id===tab?0:(alertes[id]?.n||0)),0)} point={SECONDARY_TABS.some(([id])=>id!==tab&&alertes[id]?.point)&&!SECONDARY_TABS.some(([id])=>id!==tab&&alertes[id]?.n>0)}/>}</button>
      </div>
      {(showMoreTabs||inSecondary)&&<div style={{padding:"14px 16px 0"}}>
        <p style={{color:"#97A3C9",fontSize:11,fontWeight:700,letterSpacing:.5,margin:"0 0 10px"}}>SECTIONS</p>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:10}}>
          {SECONDARY_TABS.map(([id,lbl,icon])=>(
            <button key={id} onClick={()=>setTab(id)} style={{background:"none",border:"none",cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",gap:6,padding:0}}>
              <div style={{width:56,height:56,borderRadius:"50%",background:tab===id?"#E8B04B":"rgba(255,255,255,0.055)",border:tab===id?"none":"1px solid rgba(255,255,255,0.09)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,position:"relative"}}>{icon}{tab!==id&&<Pastille n={alertes[id]?.n} point={alertes[id]?.point}/>}</div>
              <span style={{color:tab===id?"#E8B04B":"#97A3C9",fontSize:11,fontWeight:600,textAlign:"center",lineHeight:1.2}}>{lbl}</span>
            </button>
          ))}
        </div>
      </div>}


      {tab==="membres"&&<div style={{padding:"14px 16px 0"}}>
        <div style={{background:"linear-gradient(135deg,rgba(255,255,255,0.055),rgba(255,255,255,0.045))",border:"1px solid #E8B04B",borderRadius:14,padding:14,marginBottom:12}}>
          <p style={{margin:"0 0 10px",color:"#E8B04B",fontWeight:800,fontSize:13}}>Budget du groupe</p>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:10}}>
            {[["Budget total cycle",fmtFCFA(cagnotteTour),null],["Déjà collecté",fmtFCFA(collecte),null],["Reste à collecter",fmtFCFA(Math.max(0,cagnotteTour-collecte)),null],["Caisse sociale",fmtFCFA(groupe.caisseSociale),()=>{setShowCaisse(true);loadCaisseMvts();}]].map(([l,v,onClick])=>(
              <div key={l} onClick={onClick} style={{background:"rgba(255,255,255,0.055)",borderRadius:10,padding:"8px 10px",cursor:onClick?"pointer":"default",border:onClick?"1px solid rgba(255,255,255,0.14)":"none"}}>
                <p style={{margin:0,color:"#97A3C9",fontSize:10,fontWeight:600}}>{l}{onClick?" ✏️":""}</p>
                <p style={{margin:"3px 0 0",color:"#F5F2EA",fontWeight:800,fontSize:12}}>{v}</p>
              </div>
            ))}
          </div>
          <Bar pct={cagnotteTour>0?Math.round((collecte/cagnotteTour)*100):0} c="#E8B04B"/>
          <p style={{margin:"5px 0 0",color:"#97A3C9",fontSize:11,textAlign:"right"}}>{cagnotteTour>0?Math.round((collecte/cagnotteTour)*100):0}% collecte ce cycle</p>
        </div>
        {/* Encart bien visible : qui recoit la cagnotte a la fin de ce cycle. */}
        <ProchainBeneficiaire gagnant={gagnantCycleActuel?groupe.membres.find(m=>m.id===gagnantCycleActuel.membre_id):null} dateEcheance={groupe.dateEcheance} cycle={groupe.cycle} totalCycles={groupe.totalCycles} frequence={groupe.frequence}/>
        {groupe.dateEcheance&&<div style={{background:"rgba(251,113,133,0.10)",border:"1px solid #E0526A",borderRadius:12,padding:"10px 14px",marginBottom:12,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div><p style={{margin:0,color:"#FB7185",fontWeight:700,fontSize:13}}>Echeance : {groupe.dateEcheance}</p><p style={{margin:0,color:"#97A3C9",fontSize:11}}>{enRet.length} membre(s) pas encore paye</p></div>
          <button onClick={sendRappelEcheance} style={{background:"#E0526A",border:"none",borderRadius:10,padding:"8px 12px",color:"#fff",fontSize:12,fontWeight:700,cursor:"pointer"}}>Rappeler</button>
        </div>}
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
          <p style={{color:"#34D399",fontSize:12,fontWeight:700,margin:0}}>A JOUR ({aJour.length})</p>
          <button onClick={()=>{if(groupe.membres.length>=limiteMembres(user)){setShowUpgrade(true);}else{setShowAdd(true);}}} style={{background:"rgba(255,255,255,0.09)",border:"1px solid rgba(255,255,255,0.14)",borderRadius:8,padding:"5px 12px",color:"#E8B04B",fontSize:12,fontWeight:700,cursor:"pointer"}}>+ Membre</button>
        </div>
        <div className="tht-grid">{aJour.map(m=><MembreRow key={m.id} m={m} onToggle={()=>toggleP(m.id)} onWA={()=>sendWA(m)} montant={montantDu(m)} onVersement={openVers} onHistorique={openHisto} onDelete={delM} onPhoto={updatePhoto} onToggleCollecteur={toggleCollecteur} tx={suivi[m.id]&&suivi[m.id].cycle===groupe.cycle?suivi[m.id]:null} onAjouterPhotoPreuve={ajouterPhotoPreuve} onEnvoyerRecu={envoyerRecuApres} preuveBusy={preuveBusy} onEdit={mm=>setEditMembre({id:mm.id,prenom:mm.prenom,tel:mm.tel,quartier:mm.quartier||"",montantPerso:mm.montantPerso!=null?String(mm.montantPerso):""})}/>)}</div>
        {enRet.length>0&&<><p style={{color:"#FB7185",fontSize:12,fontWeight:700,margin:"16px 0 8px"}}>EN RETARD ({enRet.length})</p><div className="tht-grid">{enRet.map(m=><MembreRow key={m.id} m={m} onToggle={()=>toggleP(m.id)} onWA={()=>sendWA(m)} montant={montantDu(m)} onVersement={openVers} onHistorique={openHisto} onDelete={delM} onPhoto={updatePhoto} onToggleCollecteur={toggleCollecteur} tx={suivi[m.id]&&suivi[m.id].cycle===groupe.cycle?suivi[m.id]:null} onAjouterPhotoPreuve={ajouterPhotoPreuve} onEnvoyerRecu={envoyerRecuApres} preuveBusy={preuveBusy} onEdit={mm=>setEditMembre({id:mm.id,prenom:mm.prenom,tel:mm.tel,quartier:mm.quartier||"",montantPerso:mm.montantPerso!=null?String(mm.montantPerso):""})}/>)}</div></>}
      </div>}

      {tab==="suivi"&&<div style={{padding:"14px 16px 0"}}>
        {declarations.length>0&&<div style={{marginBottom:18}}>
          <p style={{color:"#E8B04B",fontSize:12,fontWeight:700,margin:"0 0 10px",letterSpacing:.5}}>DÉCLARATIONS EN ATTENTE ({declarations.length})</p>
          {declarations.map(d=>{
            const membre=groupe.membres.find(m=>m.id===d.membre_id);
            return(
              <div key={d.id} style={{background:"rgba(255,255,255,0.055)",border:"1px solid #E8B04B",borderRadius:12,padding:"12px 14px",marginBottom:8}}>
                <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10}}>
                  <Avatar prenom={membre?.prenom||"?"} photo={membre?.photo} size={36}/>
                  <div style={{flex:1}}>
                    <p style={{margin:0,color:"#F5F2EA",fontWeight:700,fontSize:14}}>{membre?.prenom||"Membre supprimé"}</p>
                    <p style={{margin:0,color:"#97A3C9",fontSize:11}}>{fmtFCFA(d.montant)} déclaré via {d.moyen==="wave"?"Wave":"Orange Money"} - {new Date(d.created_at).toLocaleDateString("fr-FR")}</p>
                  </div>
                </div>
                {d.photo_url&&<a href={d.photo_url} target="_blank" rel="noreferrer" style={{display:"block",marginBottom:10}}><img src={d.photo_url} alt="Preuve du paiement" style={{width:"100%",maxHeight:200,objectFit:"cover",borderRadius:8,border:"1px solid rgba(255,255,255,0.14)"}}/></a>}
                {/* Ce que la lecture automatique a releve sur la photo. C'est une aide a
                    la lecture, PAS une validation : le message d'avertissement en dessous
                    reste affiche dans tous les cas. */}
                {(()=>{const a=d.preuve_analyse;if(!a)return null;const resume=resumePreuve(a);
                  return(<div style={{background:a.verdict==="doute"?"rgba(232,176,75,0.12)":"rgba(52,211,153,0.10)",border:`1px solid ${a.verdict==="doute"?"#E8B04B":"#34D399"}`,borderRadius:8,padding:"7px 10px",marginBottom:8}}>
                    <p style={{margin:0,color:a.verdict==="doute"?"#FFE1A1":"#34D399",fontSize:11,fontWeight:700}}>
                      {a.verdict==="doute"?"🔍 Photo peu lisible":"🔍 Lu sur la photo"}{resume?` — ${resume}`:""}
                    </p>
                    {a.ecart_montant&&<p style={{margin:"3px 0 0",color:"#FFE1A1",fontSize:10.5,lineHeight:1.35}}>⚠️ {a.ecart_montant}</p>}
                  </div>);})()}
                <p style={{margin:"0 0 8px",color:"#FB7185",fontSize:11,fontWeight:600,lineHeight:1.4}}>⚠️ Vérifie que tu as bien reçu l'argent avant de confirmer.</p>
                <div style={{display:"flex",gap:8}}>
                  <button onClick={()=>confirmerDeclaration(d)} disabled={declBusy===d.id} style={{flex:1,background:"#E8B04B",border:"none",borderRadius:8,padding:"9px",color:"#1B1203",fontWeight:700,fontSize:12,cursor:"pointer"}}>{declBusy===d.id?"...":"✅ Confirmer"}</button>
                  <button onClick={()=>rejeterDeclaration(d)} disabled={declBusy===d.id} style={{flex:1,background:"transparent",border:"1px solid #FB7185",borderRadius:8,padding:"9px",color:"#FB7185",fontWeight:700,fontSize:12,cursor:"pointer"}}>✕ Rejeter</button>
                </div>
              </div>
            );
          })}
        </div>}
        <p style={{color:"#97A3C9",fontSize:12,marginBottom:14,lineHeight:1.5}}>Vue d ensemble du dernier versement de chaque membre. Tape sur "Recu envoye" pour corriger, ou sur "Historique" dans l onglet Membres pour voir tous les paiements.</p>
        {groupe.membres.length===0&&<p style={{color:"#97A3C9",fontSize:13,textAlign:"center",padding:20}}>Aucun membre pour l instant</p>}
        {groupe.membres.map(m=>{
          const t=suivi[m.id];
          return(
            <div key={m.id} style={{background:"rgba(255,255,255,0.055)",border:"1px solid rgba(255,255,255,0.09)",borderRadius:12,padding:"12px 14px",marginBottom:8}}>
              <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:t?10:0}}>
                <Avatar prenom={m.prenom} photo={m.photo} size={36}/>
                <div style={{flex:1}}><p style={{margin:0,color:"#F5F2EA",fontWeight:700,fontSize:14}}>{m.prenom}</p>{t&&<p style={{margin:0,color:"#97A3C9",fontSize:11}}>{fmtFCFA(t.montant)} - {new Date(t.created_at).toLocaleDateString("fr-FR")} a {new Date(t.created_at).toLocaleTimeString("fr-FR",{hour:"2-digit",minute:"2-digit"})}</p>}</div>
              </div>
              {t?(<>
                <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:!t.recu_envoye?8:0}}>
                  <span style={{background:"rgba(255,255,255,0.09)",color:"#34D399",fontSize:11,fontWeight:600,padding:"4px 9px",borderRadius:8}}>✅ Montant recu</span>
                  <span onClick={()=>toggleSuiviItem(m.id,t,"recu_envoye",!t.recu_envoye)} style={{cursor:"pointer",background:t.recu_envoye?"rgba(255,255,255,0.09)":"rgba(251,113,133,0.10)",color:t.recu_envoye?"#34D399":"#FB7185",fontSize:11,fontWeight:600,padding:"4px 9px",borderRadius:8}}>{t.recu_envoye?"✅":"❌"} Reçu envoyé</span>
                  <span style={{background:t.statut==="paye"?"rgba(255,255,255,0.09)":"rgba(251,113,133,0.10)",color:t.statut==="paye"?"#34D399":"#FB7185",fontSize:11,fontWeight:600,padding:"4px 9px",borderRadius:8}}>{t.statut==="paye"?"✅ Pas de dette":"❌ Dette restante"}</span>
                  <span style={{background:t.photo_url?"rgba(255,255,255,0.09)":"rgba(251,113,133,0.10)",color:t.photo_url?"#34D399":"#FB7185",fontSize:11,fontWeight:600,padding:"4px 9px",borderRadius:8}}>{t.photo_url?"✅":"❌"} Photo</span>
                </div>
                {!t.recu_envoye&&<button onClick={()=>toggleSuiviItem(m.id,t,"recu_envoye",true)} style={{width:"100%",background:"transparent",border:"1px solid #E8B04B",borderRadius:8,padding:"7px",color:"#E8B04B",fontSize:11,fontWeight:700,cursor:"pointer"}}>☑️ Tout est en ordre</button>}
              </>):<p style={{margin:0,color:"#97A3C9",fontSize:12}}>Aucun versement enregistre pour l instant</p>}
            </div>
          );
        })}
      </div>}

      {tab==="bureau"&&<div style={{padding:"14px 16px 0"}}>
        {ROLES.map(([role,label])=>{
          const t=titulaire(role);
          const elec=electionActive(role);
          const tally={};
          if(elec)votes.filter(v=>v.election_id===elec.id).forEach(v=>{tally[v.candidate_membre_id]=(tally[v.candidate_membre_id]||0)+1;});
          return(
            <div key={role} style={{background:"rgba(255,255,255,0.055)",border:"1px solid rgba(255,255,255,0.09)",borderRadius:14,padding:16,marginBottom:12}}>
              <p style={{margin:"0 0 10px",color:"#97A3C9",fontSize:11,fontWeight:700,letterSpacing:.5}}>{label.toUpperCase()}</p>
              {t?<div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10}}><Avatar prenom={t.prenom} photo={t.photo} size={36}/><p style={{margin:0,color:"#F5F2EA",fontWeight:700,fontSize:15}}>{t.prenom}</p></div>
              :<p style={{color:"#97A3C9",fontSize:13,marginBottom:10}}>Poste non attribue</p>}
              {elec?(
                <div style={{background:"rgba(255,255,255,0.055)",borderRadius:10,padding:12,marginTop:6}}>
                  <p style={{margin:"0 0 8px",color:"#E8B04B",fontSize:12,fontWeight:700}}>🗳️ Election en cours</p>
                  {elec.candidats.map(cid=>{const c=groupe.membres.find(m=>m.id===cid);return(
                    <div key={cid} style={{display:"flex",justifyContent:"space-between",padding:"4px 0",color:"#F5F2EA",fontSize:13}}><span>{c?.prenom||"?"}</span><span style={{color:"#E8B04B",fontWeight:700}}>{tally[cid]||0} voix</span></div>
                  );})}
                  <button onClick={()=>cloturerElection(elec)} style={{marginTop:10,width:"100%",background:"#E8B04B",border:"none",borderRadius:10,padding:"9px",color:"#1B1203",fontWeight:700,fontSize:12,cursor:"pointer"}}>Cloturer l election</button>
                </div>
              ):(
                <button onClick={()=>{setElectionRole(role);setElectionCands([]);setShowElection(true);}} style={{width:"100%",background:"rgba(255,255,255,0.09)",border:"1px solid rgba(255,255,255,0.14)",borderRadius:10,padding:"9px",color:"#E8B04B",fontWeight:700,fontSize:12,cursor:"pointer"}}>Lancer une election</button>
              )}
            </div>
          );
        })}
        <div style={{margin:"14px 0 0",background:"rgba(255,255,255,0.055)",border:"1px solid rgba(255,255,255,0.14)",borderRadius:12,padding:12}}>
          <p style={{margin:0,color:"#97A3C9",fontSize:11,lineHeight:1.6}}>ℹ️ Seuls les membres ayant un compte THT relie peuvent voter. Tu peux aussi attribuer un poste directement sans election.</p>
        </div>
      </div>}
      {showElection&&<Modal onClose={()=>setShowElection(false)}>
        <MH title={`Election - ${ROLES.find(r=>r[0]===electionRole)?.[1]}`} onClose={()=>setShowElection(false)}/>
        <p style={{color:"#97A3C9",fontSize:13,marginBottom:14}}>Choisis au moins 2 candidat(e)s parmi les membres.</p>
        {groupe.membres.map(m=>(
          <div key={m.id} onClick={()=>setElectionCands(c=>c.includes(m.id)?c.filter(x=>x!==m.id):[...c,m.id])} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 12px",background:electionCands.includes(m.id)?"rgba(255,255,255,0.09)":"rgba(255,255,255,0.055)",border:`1px solid ${electionCands.includes(m.id)?"#E8B04B":"rgba(255,255,255,0.09)"}`,borderRadius:10,marginBottom:6,cursor:"pointer"}}>
            <Avatar prenom={m.prenom} photo={m.photo} size={30}/><p style={{margin:0,color:"#F5F2EA",fontSize:13,flex:1}}>{m.prenom}</p>
            {electionCands.includes(m.id)&&<span style={{color:"#E8B04B",fontWeight:900}}>✓</span>}
          </div>
        ))}
        <div style={{marginTop:14}}><Btn onClick={lancerElection} disabled={electionBusy}>{electionBusy?"Lancement...":"Lancer l election"}</Btn></div>
      </Modal>}
      {tab==="tirage"&&<div style={{padding:"14px 16px 0"}}>
        {gagnantCycleActuel?(()=>{const g=groupe.membres.find(m=>m.id===gagnantCycleActuel.membre_id);return(
          <div style={{background:"linear-gradient(135deg,rgba(255,255,255,0.09),rgba(255,255,255,0.055))",border:"1px solid #E8B04B",borderRadius:16,padding:20,textAlign:"center",marginBottom:16}}>
            <p style={{margin:0,color:"#97A3C9",fontSize:12,fontWeight:600}}>GAGNANTE DU CYCLE {groupe.cycle}</p>
            <div style={{margin:"12px auto 8px"}}><Avatar prenom={g?.prenom||"?"} photo={g?.photo} size={64}/></div>
            <p style={{margin:0,color:"#E8B04B",fontSize:20,fontWeight:900}}>{g?.prenom||"Membre retiré"}</p>
            <p style={{margin:"4px 0 0",color:"#97A3C9",fontSize:12}}>Tirée au sort le {new Date(gagnantCycleActuel.created_at).toLocaleString("fr-FR",{day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit"})}</p>
            <p style={{margin:"10px 0 0",color:"#34D399",fontSize:12,fontWeight:700,background:"rgba(52,211,153,0.10)",border:"1px solid #34D399",borderRadius:8,padding:"7px 10px"}}>🔒 Tirage verrouillé pour le cycle {groupe.cycle} — il rouvrira au cycle suivant</p>
            {groupe.cycle<groupe.totalCycles?(
              <button onClick={cloturerCycle} disabled={clotureBusy} style={{marginTop:16,width:"100%",background:"linear-gradient(135deg,#FFE9B4 0%,#E8B04B 48%,#C38427 100%)",border:"none",borderRadius:12,padding:"12px",color:"#1B1203",fontWeight:800,fontSize:14,cursor:"pointer"}}>{clotureBusy?"Cloture en cours...":`Cloturer le cycle ${groupe.cycle} et passer au cycle ${groupe.cycle+1}`}</button>
            ):(
              <p style={{marginTop:16,color:"#34D399",fontWeight:700,fontSize:13}}>🎉 Dernier cycle de cette tontine termine !</p>
            )}
          </div>
        );})():(
          <div style={{background:"rgba(255,255,255,0.055)",border:"1px solid rgba(255,255,255,0.09)",borderRadius:16,padding:20,textAlign:"center",marginBottom:16}}>
            <p style={{fontSize:36,margin:"0 0 8px"}}>🎲</p>
            <p style={{color:"#F5F2EA",fontSize:14,fontWeight:700,margin:0}}>Aucun tirage pour le cycle {groupe.cycle} pour le moment</p>
            <p style={{color:"#97A3C9",fontSize:12,margin:"6px 0 16px"}}>{eligibles.length} membre(s) pas encore tire(s) au sort sur cette rotation</p>
            <button onClick={lancerTirage} disabled={tirageBusy||eligibles.length===0} style={{background:"linear-gradient(135deg,#FFE9B4 0%,#E8B04B 48%,#C38427 100%)",border:"none",borderRadius:12,padding:"12px 24px",color:"#1B1203",fontWeight:800,fontSize:14,cursor:"pointer"}}>{tirageBusy?"Tirage en cours...":"🎲 Lancer le tirage au sort"}</button>
          </div>
        )}
        <p style={{color:"#97A3C9",fontSize:12,fontWeight:700,margin:"16px 0 10px",letterSpacing:.5}}>HISTORIQUE DES TIRAGES (TRANSPARENT)</p>
        {tirages.length===0?<p style={{color:"#97A3C9",fontSize:13,textAlign:"center",marginTop:10}}>Aucun tirage effectue pour l instant</p>
        :[...tirages].reverse().map(t=>{const m=groupe.membres.find(mm=>mm.id===t.membre_id);return(
          <div key={t.id} style={{background:"rgba(255,255,255,0.055)",border:"1px solid rgba(255,255,255,0.09)",borderRadius:12,padding:"10px 14px",marginBottom:8,display:"flex",gap:10,alignItems:"center"}}>
            <span style={{background:"rgba(255,255,255,0.09)",color:"#E8B04B",fontSize:11,fontWeight:800,padding:"3px 8px",borderRadius:8}}>Cycle {t.cycle}</span>
            <p style={{margin:0,color:"#F5F2EA",fontSize:13,fontWeight:700,flex:1}}>{m?.prenom||"Membre retiré"}</p>
            <p style={{margin:0,color:"#97A3C9",fontSize:11}}>{new Date(t.created_at).toLocaleDateString("fr-FR")}</p>
          </div>
        );})}
        {tirageAnim&&<div style={{position:"fixed",inset:0,background:"rgba(6,11,33,0.92)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:200}}>
          <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
          <div style={{textAlign:"center"}}>
            <p style={{fontSize:60,margin:0,animation:"spin 0.5s linear infinite",display:"inline-block"}}>🎲</p>
            <p style={{color:"#E8B04B",fontSize:16,fontWeight:800,marginTop:16}}>Tirage au sort en cours...</p>
          </div>
        </div>}
      </div>}
      {tab==="prets"&&<div style={{padding:"14px 16px 0"}}>
        <button onClick={()=>setShowPret(true)} style={{width:"100%",background:"rgba(255,255,255,0.09)",border:"1px solid rgba(255,255,255,0.14)",borderRadius:10,padding:"10px",color:"#E8B04B",fontWeight:700,fontSize:13,cursor:"pointer",marginBottom:14}}>+ Nouvelle demande de pret</button>
        {prets.filter(p=>p.statut==="en_attente").length>0&&<p style={{color:"#E8B04B",fontSize:12,fontWeight:700,margin:"0 0 10px",letterSpacing:.5}}>DEMANDES EN ATTENTE ({prets.filter(p=>p.statut==="en_attente").length})</p>}
        {prets.filter(p=>p.statut==="en_attente").map(p=>{const m=groupe.membres.find(mm=>mm.id===p.membre_id);return(
          <div key={p.id} style={{background:"rgba(255,255,255,0.045)",border:"1px solid #E8B04B",borderRadius:14,padding:16,marginBottom:10}}>
            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10}}><Avatar prenom={m?.prenom||"?"} photo={m?.photo} size={36}/><div><p style={{margin:0,color:"#F5F2EA",fontWeight:700,fontSize:14}}>{m?.prenom||"?"}</p><p style={{margin:0,color:"#E8B04B",fontWeight:700,fontSize:13}}>{fmtFCFA(p.montant)}</p></div></div>
            {p.motif&&<p style={{margin:"0 0 10px",color:"#97A3C9",fontSize:12,fontStyle:"italic"}}>{p.motif}</p>}
            {(()=>{
              const {eligible,oui,non,decision}=calcVotePret(p,pretsVotes[p.id],groupe.membres.length);
              const votants=new Set((pretsVotes[p.id]||[]).map(v=>v.voter_membre_id));
              const enAttenteDeVote=groupe.membres.filter(mm=>mm.id!==p.membre_id&&!votants.has(mm.id));
              return(<>
                <div style={{display:"flex",gap:8,marginBottom:10,flexWrap:"wrap"}}>
                  <span style={{background:"rgba(255,255,255,0.055)",color:"#34D399",fontSize:11,fontWeight:700,padding:"4px 10px",borderRadius:8}}>✅ {oui} Oui</span>
                  <span style={{background:"rgba(255,255,255,0.055)",color:"#FB7185",fontSize:11,fontWeight:700,padding:"4px 10px",borderRadius:8}}>❌ {non} Non</span>
                  <span style={{background:"rgba(255,255,255,0.055)",color:"#97A3C9",fontSize:11,fontWeight:700,padding:"4px 10px",borderRadius:8}}>sur {eligible} éligible(s)</span>
                </div>
                {decision==="accepte"&&<div style={{display:"flex",gap:8}}>
                  <button onClick={()=>{setAccepterM(p);setPretPhoto(null);setPretPhotoPreview(null);}} style={{flex:1,background:"linear-gradient(135deg,#FFE9B4 0%,#E8B04B 48%,#C38427 100%)",border:"none",borderRadius:10,padding:"9px",color:"#1B1203",fontWeight:800,fontSize:12,cursor:"pointer"}}>✅ Vote favorable - Accepter et verser</button>
                </div>}
                {decision==="en_cours"&&enAttenteDeVote.length>0&&<div>
                  <p style={{margin:"0 0 6px",color:"#97A3C9",fontSize:11,fontWeight:700,letterSpacing:.5}}>VOTE PAR PROCURATION (pas encore voté)</p>
                  {enAttenteDeVote.map(mm=>(
                    <div key={mm.id} style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
                      <p style={{margin:0,color:"#F5F2EA",fontSize:12,flex:1}}>{mm.prenom}</p>
                      <button onClick={()=>voterProcuration(p,mm,"oui")} disabled={voteBusy===mm.id} style={{background:"#34D399",border:"none",borderRadius:8,padding:"6px 10px",color:"#fff",fontWeight:700,fontSize:11,cursor:"pointer"}}>Voter Oui</button>
                      <button onClick={()=>voterProcuration(p,mm,"non")} disabled={voteBusy===mm.id} style={{background:"#FB7185",border:"none",borderRadius:8,padding:"6px 10px",color:"#fff",fontWeight:700,fontSize:11,cursor:"pointer"}}>Voter Non</button>
                    </div>
                  ))}
                </div>}
              </>);
            })()}
          </div>
        );})}
        {prets.filter(p=>p.statut!=="en_attente").length===0&&prets.filter(p=>p.statut==="en_attente").length===0?<p style={{color:"#97A3C9",fontSize:13,textAlign:"center",marginTop:20}}>Aucun pret pour le moment</p>
        :prets.filter(p=>p.statut!=="en_attente").map(p=>{const m=groupe.membres.find(mm=>mm.id===p.membre_id);const total=p.montant*(1+p.taux_interet/100);const reste=total-p.montant_rembourse;
          const labels={en_cours:["En cours","#E8B04B"],rembourse:["Rembourse","#34D399"],refuse:["Refuse","#FB7185"]};
          const [lbl,col]=labels[p.statut]||["En cours","#E8B04B"];
          return(
          <div key={p.id} style={{background:"rgba(255,255,255,0.055)",border:`1px solid ${p.statut==="rembourse"?"rgba(255,255,255,0.09)":"#E8B04B"}`,borderRadius:14,padding:16,marginBottom:10}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div style={{display:"flex",alignItems:"center",gap:10}}><Avatar prenom={m?.prenom||"?"} photo={m?.photo} size={36}/><div><p style={{margin:0,color:"#F5F2EA",fontWeight:700,fontSize:14}}>{m?.prenom||"Membre retiré"}</p><p style={{margin:0,color:"#97A3C9",fontSize:11}}>{p.taux_interet>0?`${p.taux_interet}% d interet`:"Sans intérêt"}</p></div></div>
              <span style={{background:"rgba(251,113,133,0.10)",color:col,fontSize:11,fontWeight:700,padding:"3px 9px",borderRadius:99}}>{lbl}</span>
            </div>
            {p.statut!=="refuse"&&<div style={{display:"flex",justifyContent:"space-between",margin:"12px 0"}}>
              <div><p style={{margin:0,color:"#97A3C9",fontSize:11}}>Emprunte</p><p style={{margin:"2px 0 0",color:"#F5F2EA",fontWeight:700,fontSize:13}}>{fmtFCFA(p.montant)}</p></div>
              <div><p style={{margin:0,color:"#97A3C9",fontSize:11}}>Rembourse</p><p style={{margin:"2px 0 0",color:"#34D399",fontWeight:700,fontSize:13}}>{fmtFCFA(p.montant_rembourse)}</p></div>
              <div><p style={{margin:0,color:"#97A3C9",fontSize:11}}>Reste</p><p style={{margin:"2px 0 0",color:"#E8B04B",fontWeight:700,fontSize:13}}>{fmtFCFA(Math.max(0,reste))}</p></div>
            </div>}
            {p.photo_url&&<a href={p.photo_url} target="_blank" rel="noreferrer"><img src={p.photo_url} alt="Preuve" style={{width:"100%",maxHeight:120,objectFit:"cover",borderRadius:8,border:"1px solid rgba(255,255,255,0.14)",marginBottom:10}}/></a>}
            {p.statut==="en_cours"&&<button onClick={()=>{setRemboM(p);setRemboAmt("");}} style={{width:"100%",background:"rgba(255,255,255,0.09)",border:"1px solid rgba(255,255,255,0.14)",borderRadius:10,padding:"9px",color:"#E8B04B",fontWeight:700,fontSize:12,cursor:"pointer"}}>+ Remboursement</button>}
          </div>
        );})}
      </div>}
      {accepterM&&<Modal onClose={()=>setAccepterM(null)}>
        <MH title="Accepter et verser le pret" onClose={()=>setAccepterM(null)}/>
        <div style={{background:"rgba(255,255,255,0.055)",borderRadius:12,padding:14,marginBottom:16,textAlign:"center"}}>
          <p style={{margin:0,color:"#97A3C9",fontSize:12}}>Montant a verser</p>
          <p style={{margin:"4px 0 0",color:"#E8B04B",fontWeight:900,fontSize:24}}>{fmtFCFA(accepterM.montant)}</p>
          {accepterM.motif&&<p style={{margin:"6px 0 0",color:"#97A3C9",fontSize:12,fontStyle:"italic"}}>{accepterM.motif}</p>}
        </div>
        <Fld label="Taux d'intérêt (%, optionnel)"><Inp value={accepterTaux} onChange={e=>setAccepterTaux(e.target.value.replace(/\D/g,""))} placeholder="0" inputMode="numeric"/></Fld>
        <Fld label="Date d'échéance du remboursement (optionnel)"><Inp value={accepterEcheance} onChange={e=>setAccepterEcheance(e.target.value)} type="date"/></Fld>
        <Fld label="Photo de l'argent remis (obligatoire)">
          <label style={{display:"block",background:"rgba(255,255,255,0.055)",border:"1px dashed "+(pretPhotoPreview?"#34D399":"#E8B04B"),borderRadius:12,padding:pretPhotoPreview?0:16,textAlign:"center",cursor:"pointer",overflow:"hidden"}}>
            <input type="file" accept="image/*" onChange={choisirPretPhoto} style={{display:"none"}}/>
            {pretPhotoPreview?<img src={pretPhotoPreview} alt="Preuve" style={{width:"100%",maxHeight:160,objectFit:"contain",display:"block"}}/>:<span style={{color:"#E8B04B",fontSize:12,fontWeight:700}}>📷 Photo de l'argent remis</span>}
          </label>
        </Fld>
        <Btn onClick={accepterEtVerserPret} disabled={pretBusy||!pretPhoto}>{pretBusy?"Enregistrement...":"Confirmer le versement"}</Btn>
      </Modal>}
      {showPret&&<Modal onClose={()=>setShowPret(false)}>
        <MH title="Nouvelle demande de pret" onClose={()=>setShowPret(false)}/>
        <Fld label="Membre emprunteur"><select value={newPret.membreId} onChange={e=>setNewPret(p=>({...p,membreId:e.target.value}))} style={{width:"100%",background:"rgba(255,255,255,0.045)",border:"1px solid rgba(255,255,255,0.14)",borderRadius:12,padding:"13px 14px",color:"#F5F2EA",fontSize:14}}><option value="">Choisir...</option>{groupe.membres.map(m=><option key={m.id} value={m.id}>{m.prenom}</option>)}</select></Fld>
        <Fld label="Montant du pret (FCFA)"><Inp value={newPret.montant} onChange={e=>setNewPret(p=>({...p,montant:e.target.value.replace(/\D/g,"")}))} placeholder="Ex: 50000" inputMode="numeric"/></Fld>
        <Fld label="Motif (optionnel)"><Inp value={newPret.motif} onChange={e=>setNewPret(p=>({...p,motif:e.target.value}))} placeholder="Ex: frais de scolarite" maxLength={80}/></Fld>
        <p style={{color:"#97A3C9",fontSize:12,lineHeight:1.6,margin:"0 0 14px",background:"rgba(255,255,255,0.045)",borderRadius:10,padding:"10px 12px"}}>ℹ️ La demande part d abord au vote des membres. Le taux d intérêt, l échéance et la photo de l argent remis seront demandés au moment de « Accepter et verser », quand l argent change réellement de main.</p>
        <Btn onClick={creerPret} disabled={pretBusy}>{pretBusy?"Enregistrement...":"Envoyer la demande au vote"}</Btn>
      </Modal>}
      {remboM&&<Modal onClose={()=>setRemboM(null)}>
        <MH title="Enregistrer un remboursement" onClose={()=>setRemboM(null)}/>
        <Fld label="Montant rembourse (FCFA)"><Inp value={remboAmt} onChange={e=>setRemboAmt(e.target.value.replace(/\D/g,""))} placeholder="Ex: 10000" inputMode="numeric" autoFocus/></Fld>
        <Btn onClick={rembourserPret}>Confirmer</Btn>
      </Modal>}
      {tab==="reunions"&&<div style={{padding:"14px 16px 0"}}>
        <div style={{background:"rgba(255,255,255,0.055)",border:"1px solid #E8B04B",borderRadius:14,padding:16,marginBottom:16}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
            <p style={{margin:0,color:"#E8B04B",fontWeight:800,fontSize:14}}>Reglement interieur</p>
            <button onClick={()=>{setReglementTxt(groupe.reglement||"");setEditReglement(e=>!e);}} style={{background:"transparent",border:"1px solid rgba(255,255,255,0.14)",borderRadius:8,padding:"5px 10px",color:"#E8B04B",fontSize:11,fontWeight:700,cursor:"pointer"}}>{editReglement?"Annuler":"Modifier"}</button>
          </div>
          {editReglement?(
            <>
              <textarea value={reglementTxt} onChange={e=>setReglementTxt(e.target.value)} rows={8} placeholder="Ex: Toute cotisation doit etre versee avant le 5 du mois. En cas de retard..." style={{width:"100%",background:"rgba(255,255,255,0.045)",border:"1px solid rgba(255,255,255,0.14)",borderRadius:12,padding:"12px 14px",color:"#F5F2EA",fontSize:13,outline:"none",resize:"vertical",fontFamily:"inherit"}}/>
              <div style={{marginTop:10}}><Btn onClick={enregistrerReglement} disabled={reglementBusy}>{reglementBusy?"Enregistrement...":"Enregistrer"}</Btn></div>
            </>
          ):(groupe.reglement?<p style={{color:"#F5F2EA",fontSize:13,lineHeight:1.6,whiteSpace:"pre-wrap",margin:0}}>{groupe.reglement}</p>:<p style={{color:"#97A3C9",fontSize:13,margin:0}}>Aucun reglement redige pour l instant</p>)}
        </div>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
          <p style={{color:"#97A3C9",fontSize:12,fontWeight:700,letterSpacing:.5}}>COMPTES RENDUS DE REUNION</p>
          <button onClick={()=>setShowRapport(true)} style={{background:"rgba(255,255,255,0.09)",border:"1px solid rgba(255,255,255,0.14)",borderRadius:8,padding:"5px 10px",color:"#E8B04B",fontSize:11,fontWeight:700,cursor:"pointer"}}>+ Ajouter</button>
        </div>
        {rapports.length===0?<p style={{color:"#97A3C9",fontSize:13,textAlign:"center",marginTop:20}}>Aucun compte rendu pour l instant</p>
        :rapports.map(r=>(
          <div key={r.id} style={{background:"rgba(255,255,255,0.055)",border:"1px solid rgba(255,255,255,0.09)",borderRadius:14,padding:16,marginBottom:10}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
              <div><p style={{margin:0,color:"#F5F2EA",fontWeight:700,fontSize:14}}>{r.titre}</p><p style={{margin:"3px 0 0",color:"#E8B04B",fontSize:11}}>{r.date_reunion?new Date(r.date_reunion).toLocaleDateString("fr-FR"):""}</p></div>
              <button onClick={()=>supprimerRapport(r.id)} style={{background:"transparent",border:"none",color:"#FB7185",fontSize:16,cursor:"pointer"}}>✕</button>
            </div>
            {r.contenu&&<p style={{margin:"10px 0 0",color:"#97A3C9",fontSize:13,lineHeight:1.6,whiteSpace:"pre-wrap"}}>{r.contenu}</p>}
          </div>
        ))}
      </div>}
      {showRapport&&<Modal onClose={()=>setShowRapport(false)}>
        <MH title="Nouveau compte rendu" onClose={()=>setShowRapport(false)}/>
        <Fld label="Titre"><Inp value={newRapport.titre} onChange={e=>setNewRapport(r=>({...r,titre:e.target.value}))} placeholder="Ex: Reunion mensuelle Juillet" maxLength={80} autoFocus/></Fld>
        <Fld label="Date de la réunion"><Inp value={newRapport.date} onChange={e=>setNewRapport(r=>({...r,date:e.target.value}))} type="date"/></Fld>
        <Fld label="Notes / decisions prises"><textarea value={newRapport.contenu} onChange={e=>setNewRapport(r=>({...r,contenu:e.target.value}))} rows={5} placeholder="Ce qui a ete discute et decide..." style={{width:"100%",background:"rgba(255,255,255,0.045)",border:"1px solid rgba(255,255,255,0.14)",borderRadius:12,padding:"12px 14px",color:"#F5F2EA",fontSize:14,outline:"none",resize:"vertical",fontFamily:"inherit"}}/></Fld>
        <Btn onClick={creerRapport} disabled={rapportBusy}>{rapportBusy?"Enregistrement...":"Enregistrer"}</Btn>
      </Modal>}
      {tab==="events"&&<div style={{padding:"14px 16px 0"}}>
        {groupe.membres.filter(m=>m.evenement).length===0
          ?<div style={{textAlign:"center",padding:30,color:"#6F7BA6"}}><p style={{fontSize:32}}>🎉</p><p>Aucun evenement signale</p></div>
          :groupe.membres.filter(m=>m.evenement).map(m=><div key={m.id} style={{background:"rgba(255,255,255,0.055)",border:"1px solid #E8B04B",borderRadius:14,padding:"14px 16px",marginBottom:10,display:"flex",gap:12,alignItems:"center"}}><Avatar prenom={m.prenom} size={42}/><div style={{flex:1}}><p style={{margin:0,color:"#F5F2EA",fontWeight:700,fontSize:14}}>{m.prenom}</p><p style={{margin:"3px 0 0",color:"#E8B04B",fontSize:13}}>{m.evenement}</p></div><button onClick={()=>openEvt(m)} style={{background:"rgba(255,255,255,0.09)",border:"1px solid rgba(255,255,255,0.14)",borderRadius:10,padding:"7px 10px",color:"#E8B04B",fontSize:12,fontWeight:700,cursor:"pointer"}}>Modifier</button><button onClick={()=>sendWA(m)} style={{background:"#075E54",border:"none",borderRadius:10,padding:"7px 10px",color:"#fff",fontSize:12,fontWeight:700,cursor:"pointer"}}>WA</button></div>)}
        <p style={{color:"#97A3C9",fontSize:12,fontWeight:700,margin:"18px 0 8px",letterSpacing:.5}}>SIGNALER UN EVENEMENT</p>
        {groupe.membres.filter(m=>!m.evenement).map(m=><div key={m.id} onClick={()=>openEvt(m)} style={{background:"rgba(255,255,255,0.055)",border:"1px solid rgba(255,255,255,0.09)",borderRadius:12,padding:"10px 14px",marginBottom:8,display:"flex",gap:12,alignItems:"center",cursor:"pointer"}}><Avatar prenom={m.prenom} size={32}/><p style={{margin:0,color:"#F5F2EA",fontSize:13,flex:1}}>{m.prenom}</p><span style={{color:"#E8B04B",fontSize:12,fontWeight:700}}>+ Ajouter</span></div>)}
      </div>}

      {evtM&&<Modal onClose={()=>setEvtM(null)}>
        <MH title={`Evenement - ${evtM.prenom}`} onClose={()=>setEvtM(null)}/>
        <Fld label="Description (mariage, naissance, deces, etc.)"><Inp value={evtTxt} onChange={e=>setEvtTxt(e.target.value)} placeholder="Ex: Bapteme bebe le 12 Juil" maxLength={80} autoFocus/></Fld>
        <div style={{display:"flex",gap:10}}>
          <Btn onClick={saveEvt}>Enregistrer</Btn>
          {evtM.evenement&&<button onClick={()=>{setEvtTxt("");saveEvt();}} style={{flex:1,background:"transparent",border:"1px solid #E0526A",borderRadius:14,padding:"13px",color:"#FB7185",fontWeight:700,fontSize:14,cursor:"pointer"}}>Retirer</button>}
        </div>
      </Modal>}

      {tab==="checklist"&&<div style={{padding:"14px 16px 0"}}>
        <p style={{color:"#97A3C9",fontSize:12,marginBottom:12}}>{groupe.checklist.filter(c=>c.done).length}/{groupe.checklist.length} taches completees</p>
        <div style={{display:"flex",gap:8,marginBottom:14}}>
          <Inp value={newTask} onChange={e=>setNewTask(e.target.value)} placeholder="Nouvelle tache..." maxLength={100} onKeyDown={e=>{if(e.key==="Enter")addTask();}}/>
          <button onClick={addTask} style={{background:"rgba(255,255,255,0.09)",border:"1px solid rgba(255,255,255,0.14)",borderRadius:10,padding:"0 16px",color:"#E8B04B",fontWeight:700,fontSize:20,cursor:"pointer"}}>+</button>
        </div>
        {groupe.checklist.length===0&&<div style={{textAlign:"center",padding:20,color:"#6F7BA6"}}><p>Aucune tache pour le moment</p></div>}
        {groupe.checklist.map(c=><div key={c.id} style={{background:"rgba(255,255,255,0.055)",border:`1px solid ${c.done?"#E8B04B":"rgba(255,255,255,0.09)"}`,borderRadius:12,padding:"14px 16px",marginBottom:8,display:"flex",gap:12,alignItems:"center"}}><div onClick={()=>toggleC(c.id)} style={{width:22,height:22,borderRadius:6,border:`2px solid ${c.done?"#E8B04B":"rgba(255,255,255,0.14)"}`,background:c.done?"#E8B04B":"transparent",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,cursor:"pointer"}}>{c.done&&<span style={{color:"#1B1203",fontWeight:900,fontSize:13}}>v</span>}</div><p onClick={()=>toggleC(c.id)} style={{margin:0,color:c.done?"#97A3C9":"#F5F2EA",fontSize:14,textDecoration:c.done?"line-through":"none",flex:1,cursor:"pointer"}}>{c.label}</p><button onClick={()=>delTask(c.id)} style={{background:"transparent",border:"none",color:"#FB7185",fontSize:18,cursor:"pointer",padding:"0 4px"}}>✕</button></div>)}
      </div>}

      {tab==="social"&&<div style={{padding:"14px 16px 100px"}}>
        <div style={{display:"flex",gap:8,overflowX:"auto",paddingBottom:10,marginBottom:6}}>
          <button onClick={()=>setThread(null)} style={{flexShrink:0,display:"flex",alignItems:"center",gap:6,background:!thread?"#E8B04B":"rgba(255,255,255,0.055)",border:"1px solid "+(!thread?"#E8B04B":"rgba(255,255,255,0.09)"),borderRadius:99,padding:"7px 14px",color:!thread?"#1B1203":"#F5F2EA",fontWeight:700,fontSize:12,cursor:"pointer",whiteSpace:"nowrap"}}>💬 Groupe</button>
          {/* Tous les membres de la tontine, y compris ceux qui n'ont pas encore de compte
              THT (affiches grises) : la liste reste complete et explicite. */}
          {autresMembres.map(m=>(
            <button key={m.id} onClick={()=>m.userId?setThread({userId:m.userId,prenom:m.prenom}):onToast(`${m.prenom} n'a pas encore de compte THT : impossible de lui écrire en privé`,"error")} title={m.userId?`Message privé à ${m.prenom}`:`${m.prenom} n'a pas encore de compte THT`} style={{flexShrink:0,display:"flex",alignItems:"center",gap:6,background:thread?.userId===m.userId&&m.userId?"#E8B04B":"rgba(255,255,255,0.055)",border:"1px solid "+(thread?.userId===m.userId&&m.userId?"#E8B04B":"rgba(255,255,255,0.09)"),borderRadius:99,padding:"6px 14px 6px 6px",color:!m.userId?"#6F7BA6":(thread?.userId===m.userId?"#1B1203":"#F5F2EA"),fontWeight:700,fontSize:12,cursor:"pointer",whiteSpace:"nowrap",opacity:m.userId?1:0.55}}><Avatar prenom={m.prenom} photo={m.photo} size={22}/>{m.prenom}{!m.userId&&" (sans compte)"}</button>
          ))}
        </div>
        {autresMembres.length===0&&<p style={{color:"#97A3C9",fontSize:11,margin:"0 0 10px",textAlign:"center"}}>Ajoute des membres à ta tontine pour pouvoir leur écrire.</p>}
        {thread&&<p style={{color:"#E8B04B",fontSize:11,fontWeight:700,margin:"0 0 10px",textAlign:"center"}}>🔒 Conversation privee avec {thread.prenom}</p>}
        {messages.length===0?<p style={{color:"#97A3C9",fontSize:13,textAlign:"center",padding:10}}>Aucun message pour l instant</p>
        :messages.map(m=><div key={m.id} style={{display:"flex",gap:10,marginBottom:12}}><Avatar prenom={m.auteur} size={34} gold={m.auteur==="HABY"}/><div style={{background:"rgba(255,255,255,0.055)",border:"1px solid rgba(255,255,255,0.09)",borderRadius:"0 14px 14px 14px",padding:"10px 14px",flex:1}}><div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}><p style={{margin:0,color:"#E8B04B",fontSize:12,fontWeight:700}}>{m.auteur}</p><p style={{margin:0,color:"#97A3C9",fontSize:11}}>{m.time}</p></div>{m.imageUrl?<img src={m.imageUrl} alt="Recu" style={{width:"100%",maxWidth:220,borderRadius:10,display:"block"}}/>:m.audioUrl?<audio controls src={m.audioUrl} style={{width:"100%",height:34}}/>:<p style={{margin:0,color:"#F5F2EA",fontSize:14}}>{m.texte}</p>}</div></div>)}
        <div style={{display:"flex",gap:8,marginTop:8}}>
          <button onClick={toggleRecord} disabled={sendingAudio} style={{background:recording?"#E0526A":"rgba(255,255,255,0.09)",border:"1px solid rgba(255,255,255,0.14)",borderRadius:12,width:44,height:44,color:recording?"#fff":"#E8B04B",fontSize:18,cursor:"pointer",flexShrink:0}}>{sendingAudio?"⏳":recording?"⏹":"🎤"}</button>
          <input value={msgInput} onChange={e=>setMsgInput(s(e.target.value))} placeholder={thread?`Message prive a ${thread.prenom}...`:"Écrire au groupe..."} maxLength={200} onKeyDown={e=>e.key==="Enter"&&sendMsg()} style={{flex:1,background:"rgba(255,255,255,0.055)",border:"1px solid rgba(255,255,255,0.09)",borderRadius:12,padding:"10px 14px",color:"#F5F2EA",fontSize:14,outline:"none"}}/>
          <button onClick={sendMsg} style={{background:"#E8B04B",border:"none",borderRadius:12,padding:"0 16px",color:"#1B1203",fontWeight:900,cursor:"pointer",fontSize:18}}>→</button>
        </div>
        {recording&&<p style={{color:"#E0526A",fontSize:11,margin:"6px 0 0",textAlign:"center"}}>🔴 Enregistrement en cours... clique sur ⏹ pour envoyer</p>}
      </div>}

      {tab==="rapport"&&<div style={{padding:"14px 16px 0"}}>
        <div style={{background:"rgba(255,255,255,0.055)",border:"1px solid rgba(255,255,255,0.09)",borderRadius:16,padding:16,marginBottom:14}}>
          <p style={{color:"#E8B04B",fontWeight:800,margin:"0 0 14px",fontSize:15}}>Bilan - Cycle {groupe.cycle}/{groupe.totalCycles}</p>
          {[["Total collecté ce cycle",fmtFCFA(collecte)],["Total cotisations (calcul auto)",fmtFCFA(cagnotteTour)],["Caisse sociale",fmtFCFA(groupe.caisseSociale)],["Taux ponctualite",`${taux}%`],["Membres à jour",`${aJour.length}/${groupe.membres.length}`],["Prochain tour",groupe.prochainTour],["Cycles restants",groupe.totalCycles-groupe.cycle],["Total fin de cycle",fmtFCFA(groupe.membres.reduce((s,m)=>s+montantDu(m),0)*groupe.totalCycles)],["Dettes cumulees (cycles precedents)",fmtFCFA(groupe.membres.reduce((s,m)=>s+(m.dette||0),0))]].map(([l,v])=><div key={l} style={{display:"flex",justifyContent:"space-between",padding:"9px 0",borderBottom:"1px solid rgba(255,255,255,0.09)"}}><span style={{color:"#97A3C9",fontSize:13}}>{l}</span><span style={{color:"#F5F2EA",fontWeight:700,fontSize:13}}>{v}</span></div>)}
        </div>
        <p style={{color:"#97A3C9",fontSize:12,fontWeight:700,marginBottom:8}}>SUIVI PAR MEMBRE</p>
        {groupe.membres.map(m=><div key={m.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 0",borderBottom:"1px solid rgba(255,255,255,0.09)"}}><div style={{display:"flex",alignItems:"center",gap:10}}><Avatar prenom={m.prenom} size={32}/><p style={{margin:0,color:"#F5F2EA",fontSize:13}}>{m.prenom}</p></div><div style={{textAlign:"right"}}><p style={{margin:0,color:"#E8B04B",fontSize:12,fontWeight:700}}>{fmtFCFA(m.cyclesPaies*montantDu(m))}</p><p style={{margin:0,color:"#97A3C9",fontSize:11}}>{m.cyclesPaies}/{m.cyclesTotal} cycles{m.montantPerso?` - ${fmtFCFA(m.montantPerso)}/cycle`:""}</p></div></div>)}
        <Btn onClick={exporterRapportPDF}>Exporter rapport PDF</Btn>
      </div>}

      {showCaisse&&<Modal onClose={()=>setShowCaisse(false)}>
        <MH title="Caisse sociale" onClose={()=>setShowCaisse(false)}/>
        <div style={{background:"rgba(255,255,255,0.055)",borderRadius:12,padding:14,marginBottom:16,textAlign:"center"}}>
          <p style={{margin:0,color:"#97A3C9",fontSize:12}}>Solde actuel</p>
          <p style={{margin:"4px 0 0",color:"#E8B04B",fontWeight:900,fontSize:24}}>{fmtFCFA(groupe.caisseSociale)}</p>
        </div>
        <Fld label="Montant (FCFA)"><Inp value={caisseAmt} onChange={e=>setCaisseAmt(e.target.value.replace(/[^0-9]/g,""))} placeholder="Ex: 5000" inputMode="numeric" autoFocus/></Fld>
        <Fld label="Motif (obligatoire pour un retrait)"><Inp value={caisseMotif} onChange={e=>setCaisseMotif(e.target.value)} placeholder="Ex: Aide funerailles famille Diallo" maxLength={80}/></Fld>
        <div style={{display:"flex",gap:8}}>
          <button onClick={()=>saveCaisse("ajouter")} disabled={!caisseAmt||caisseBusy} style={{flex:1,background:!caisseAmt?"rgba(255,255,255,0.09)":"linear-gradient(135deg,#FFE9B4 0%,#E8B04B 48%,#C38427 100%)",border:"none",borderRadius:14,padding:"13px",color:!caisseAmt?"#97A3C9":"#1B1203",fontWeight:800,fontSize:14,cursor:"pointer"}}>+ Ajouter</button>
          <button onClick={()=>saveCaisse("retirer")} disabled={!caisseAmt||caisseBusy} style={{flex:1,background:"rgba(255,255,255,0.09)",border:"1px solid #E0526A",borderRadius:14,padding:"13px",color:"#FB7185",fontWeight:800,fontSize:14,cursor:"pointer"}}>- Retirer (depense)</button>
        </div>
        <p style={{color:"#97A3C9",fontSize:11,margin:"12px 0 16px",lineHeight:1.5}}>La caisse sociale est un fonds separe des cotisations, pour les imprevus, les evenements, ou l entraide entre membres.</p>
        {caisseMvts.length>0&&<>
          <p style={{color:"#97A3C9",fontSize:11,fontWeight:700,margin:"0 0 8px",letterSpacing:.5}}>HISTORIQUE</p>
          {caisseMvts.map(m=>(
            <div key={m.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 0",borderBottom:"1px solid rgba(255,255,255,0.09)"}}>
              <div><p style={{margin:0,color:"#F5F2EA",fontSize:12}}>{m.motif||(m.sens==="ajout"?"Ajout":"Retrait")}</p><p style={{margin:0,color:"#97A3C9",fontSize:10}}>{new Date(m.created_at).toLocaleDateString("fr-FR")} - {m.auteur_nom}</p></div>
              <p style={{margin:0,color:m.sens==="ajout"?"#34D399":"#FB7185",fontWeight:700,fontSize:12}}>{m.sens==="ajout"?"+":"-"}{fmtFCFA(m.montant)}</p>
            </div>
          ))}
        </>}
      </Modal>}

      {showVers&&versM&&<Modal onClose={()=>setShowVers(false)}>
        <MH title={"+ Versement - "+versM.prenom} onClose={()=>setShowVers(false)}/>
        <div style={{background:"rgba(255,255,255,0.055)",borderRadius:12,padding:14,marginBottom:16}}>
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
            <span style={{color:"#97A3C9",fontSize:13}}>Total deja verse</span>
            <span style={{color:"#E8B04B",fontWeight:700}}>{fmtFCFA(versM.versements||0)}</span>
          </div>
          <div style={{display:"flex",justifyContent:"space-between"}}>
            <span style={{color:"#97A3C9",fontSize:13}}>Cotisation du mois</span>
            <span style={{color:"#F5F2EA",fontWeight:700}}>{fmtFCFA(montantDu(versM))}</span>
          </div>
        </div>
        <Fld label="Montant reçu (FCFA)">
          <Inp value={versAmt} onChange={e=>setVersAmt(e.target.value.replace(/[^0-9]/g,""))} placeholder={"Ex: "+String(montantDu(versM))} inputMode="numeric" autoFocus/>
        </Fld>
        <div style={{display:"flex",gap:8,marginBottom:12}}>
          {[montantDu(versM),Math.round(montantDu(versM)/2),montantDu(versM)*2].map(v=>(
            <button key={v} onClick={()=>setVersAmt(String(v))} style={{flex:1,background:versAmt===String(v)?"#E8B04B":"rgba(255,255,255,0.09)",border:"1px solid rgba(255,255,255,0.14)",borderRadius:10,padding:"8px 4px",color:versAmt===String(v)?"#1B1203":"#F5F2EA",fontSize:11,fontWeight:700,cursor:"pointer"}}>{fmtFCFA(v)}</button>
          ))}
        </div>
        <Fld label="Photo de l'argent reçu (optionnel mais recommandé)">
          <label style={{display:"block",background:"rgba(255,255,255,0.055)",border:"1px dashed #E8B04B",borderRadius:12,padding:versPhotoPreview?0:16,textAlign:"center",cursor:"pointer",overflow:"hidden"}}>
            <input type="file" accept="image/*" onChange={choisirVersPhoto} style={{display:"none"}}/>
            {versPhotoPreview?<img src={versPhotoPreview} alt="Preuve" style={{width:"100%",maxHeight:160,objectFit:"contain",display:"block"}}/>:<span style={{color:"#E8B04B",fontSize:12,fontWeight:700}}>📷 Prendre en photo l'argent recu</span>}
          </label>
        </Fld>
        <div style={{display:"flex",gap:8}}>
          <button onClick={()=>saveVers("simple")} disabled={!versAmt||Number(versAmt)<1||recuBusy} style={{flex:1,background:!versAmt||Number(versAmt)<1?"rgba(255,255,255,0.09)":"linear-gradient(135deg,#FFE9B4 0%,#E8B04B 48%,#C38427 100%)",border:"none",borderRadius:14,padding:"13px",color:!versAmt||Number(versAmt)<1?"#97A3C9":"#1B1203",fontWeight:800,fontSize:13,cursor:"pointer"}}>{recuBusy?"⏳...":"Enregistrer + Reçu"}</button>
          <button onClick={()=>saveVers("partager")} disabled={!versAmt||Number(versAmt)<1||recuBusy} style={{flex:1,background:!versAmt||Number(versAmt)<1?"rgba(255,255,255,0.09)":"#075E54",border:"none",borderRadius:14,padding:"13px",color:"#fff",fontWeight:800,fontSize:13,cursor:"pointer"}}>{recuBusy?"⏳ Creation...":"🧾 Reçu + Partager"}</button>
        </div>
      </Modal>}

      {showHisto&&histoM&&<Modal onClose={()=>setShowHisto(false)}>
        <MH title={"Historique - "+histoM.prenom} onClose={()=>setShowHisto(false)}/>
        <div style={{background:"rgba(255,255,255,0.055)",borderRadius:12,padding:14,marginBottom:16}}>
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
            <span style={{color:"#97A3C9",fontSize:13}}>Total verse</span>
            <span style={{color:"#E8B04B",fontWeight:800,fontSize:16}}>{fmtFCFA(histoM.versements||0)}</span>
          </div>
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
            <span style={{color:"#97A3C9",fontSize:13}}>Cycles payes</span>
            <span style={{color:"#34D399",fontWeight:700}}>{histoM.cyclesPaies} / {histoM.cyclesTotal}</span>
          </div>
          <div style={{display:"flex",justifyContent:"space-between"}}>
            <span style={{color:"#97A3C9",fontSize:13}}>Fiabilite</span>
            <span style={{color:"#E8B04B",fontWeight:700}}>{histoM.score}%</span>
          </div>
        </div>
        <p style={{color:"#97A3C9",fontSize:11,fontWeight:700,marginBottom:10,letterSpacing:.5}}>DETAIL DES PAIEMENTS</p>
        {(histoM.historique||[]).length===0&&<p style={{color:"#6F7BA6",textAlign:"center",padding:20}}>Aucun historique disponible</p>}
        {(histoM.historique||[]).map((h,i)=>(
          <div key={h.id||i} style={{padding:"12px 14px",background:"rgba(255,255,255,0.055)",borderRadius:12,marginBottom:8,border:`1px solid ${h.statut==="paye"?"rgba(255,255,255,0.09)":"#E0526A55"}`}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
              <div>
                <p style={{margin:0,color:"#F5F2EA",fontWeight:700,fontSize:14}}>{h.mois}</p>
                {h.date&&<p style={{margin:0,color:"#97A3C9",fontSize:11}}>{h.date} a {h.heure}</p>}
              </div>
              <div style={{textAlign:"right"}}>
                <p style={{margin:0,color:h.statut==="paye"?"#E8B04B":"#FB7185",fontWeight:700,fontSize:14}}>{fmtFCFA(h.montant)}</p>
                <span style={{background:h.statut==="paye"?"#0F7A55":"#E0526A",color:"#fff",fontSize:10,fontWeight:700,padding:"2px 7px",borderRadius:99}}>{h.statut.toUpperCase()}</span>
              </div>
            </div>
            <div style={{borderTop:"1px solid rgba(255,255,255,0.09)",paddingTop:10}}>
              <p style={{margin:"0 0 8px",color:"#97A3C9",fontSize:10,fontWeight:700,letterSpacing:.5}}>CHECKLIST DE SUIVI</p>
              <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:h.photoUrl?8:0}}>
                <span style={{background:"rgba(255,255,255,0.09)",color:"#34D399",fontSize:11,fontWeight:600,padding:"4px 9px",borderRadius:8}}>✅ Montant recu</span>
                <span onClick={()=>toggleChecklistItem(h,"recu_envoye",!h.recuEnvoye)} style={{cursor:"pointer",background:h.recuEnvoye?"rgba(255,255,255,0.09)":"rgba(251,113,133,0.10)",color:h.recuEnvoye?"#34D399":"#FB7185",fontSize:11,fontWeight:600,padding:"4px 9px",borderRadius:8}}>{h.recuEnvoye?"✅":"❌"} Reçu envoyé</span>
                <span style={{background:h.statut==="paye"?"rgba(255,255,255,0.09)":"rgba(251,113,133,0.10)",color:h.statut==="paye"?"#34D399":"#FB7185",fontSize:11,fontWeight:600,padding:"4px 9px",borderRadius:8}}>{h.statut==="paye"?"✅ Pas de dette":"❌ Dette restante"}</span>
                <span style={{background:h.photoUrl?"rgba(255,255,255,0.09)":"rgba(251,113,133,0.10)",color:h.photoUrl?"#34D399":"#FB7185",fontSize:11,fontWeight:600,padding:"4px 9px",borderRadius:8}}>{h.photoUrl?"✅":"❌"} Photo</span>
              </div>
              {h.photoUrl&&<a href={h.photoUrl} target="_blank" rel="noreferrer"><img src={h.photoUrl} alt="Preuve" style={{width:"100%",maxHeight:120,objectFit:"cover",borderRadius:8,border:"1px solid rgba(255,255,255,0.14)"}}/></a>}
              <button onClick={()=>voirRecu(h)} disabled={recuBusy} style={{marginTop:8,width:"100%",background:"rgba(255,255,255,0.045)",border:"1px solid #97A3C9",borderRadius:8,padding:"7px",color:"#F5F2EA",fontSize:11,fontWeight:700,cursor:"pointer"}}>{recuBusy?"⏳ Generation...":"🧾 Voir / repartager le reçu"}</button>
              {!h.recuEnvoye&&<button onClick={()=>toutEstEnOrdre(h)} style={{marginTop:8,width:"100%",background:"transparent",border:"1px solid #E8B04B",borderRadius:8,padding:"7px",color:"#E8B04B",fontSize:11,fontWeight:700,cursor:"pointer"}}>☑️ Tout est en ordre</button>}
            </div>
          </div>
        ))}
        <div style={{background:"linear-gradient(135deg,rgba(255,255,255,0.055),rgba(255,255,255,0.045))",border:"1px solid #E8B04B",borderRadius:12,padding:14,marginTop:8}}>
          <p style={{margin:"0 0 8px",color:"#E8B04B",fontWeight:800,fontSize:13}}>Devis automatique</p>
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}><span style={{color:"#97A3C9",fontSize:12}}>Total paye</span><span style={{color:"#34D399",fontWeight:700}}>{fmtFCFA(histoM.versements||0)}</span></div>
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}><span style={{color:"#97A3C9",fontSize:12}}>Paiements en retard</span><span style={{color:"#FB7185",fontWeight:700}}>{(histoM.historique||[]).filter(h=>h.statut==="retard").length} fois</span></div>
          <div style={{display:"flex",justifyContent:"space-between"}}><span style={{color:"#97A3C9",fontSize:12}}>Taux de ponctualite</span><span style={{color:"#E8B04B",fontWeight:700}}>{histoM.cyclesTotal>0?Math.round((histoM.cyclesPaies/histoM.cyclesTotal)*100):0}%</span></div>
        </div>
      </Modal>}

      {showAdd&&<Modal onClose={()=>{if(!pickerBusy)setShowAdd(false);}}>
        <MH title="Ajouter un membre" onClose={()=>{if(!pickerBusy)setShowAdd(false);}}/>
        <div style={{opacity:pickerBusy?0.4:1,pointerEvents:pickerBusy?"none":"auto",transition:"opacity 0.15s"}}>
        <p style={{color:"#97A3C9",fontSize:13,marginBottom:16,lineHeight:1.6}}>Le chef de tontine ajoute les membres. Un rappel WhatsApp leur sera envoye.</p>
        {"contacts" in navigator&&"ContactsManager" in window&&<button disabled={pickerBusy} onClick={async()=>{
          if(pickerBusyRef.current)return;
          pickerBusyRef.current=true;setPickerBusy(true);
          try{
            const c=await navigator.contacts.select(["name","tel"],{multiple:true});
            pickerBusyRef.current=false;setPickerBusy(false);
            if(!c||c.length===0)return;
            if(c.length===1){setNewM(n=>({...n,prenom:c[0].name?.[0]?.split(" ")[0]||n.prenom,tel:sPhone(c[0].tel?.[0]||n.tel)}));onToast("Contact selectionne !");}
            else await addMembresEnMasse(c);
          }catch{pickerBusyRef.current=false;setPickerBusy(false);}
        }} style={{width:"100%",background:pickerBusy?"rgba(255,255,255,0.055)":"rgba(255,255,255,0.09)",border:"1px solid #E8B04B",borderRadius:12,padding:"12px",color:pickerBusy?"#97A3C9":"#E8B04B",fontWeight:700,fontSize:13,cursor:pickerBusy?"not-allowed":"pointer",marginBottom:14,display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>{pickerBusy?"Ajout en cours...":"📇 Choisir depuis mes contacts (plusieurs a la fois possible)"}</button>}
        <Fld label="Photo (optionnel)"><div style={{display:"flex",alignItems:"center",gap:12}}>{newM.photo?<img src={newM.photo} style={{width:50,height:50,borderRadius:14,objectFit:"cover"}} alt=""/>:<div style={{width:50,height:50,borderRadius:14,background:"rgba(255,255,255,0.09)",display:"flex",alignItems:"center",justifyContent:"center",color:"#97A3C9",fontSize:20}}>📷</div>}<label style={{background:"rgba(255,255,255,0.09)",border:"1px solid rgba(255,255,255,0.14)",borderRadius:10,padding:"8px 14px",color:"#E8B04B",fontWeight:700,fontSize:12,cursor:"pointer"}}>{newM.photo?"Changer":"Ajouter"}<input type="file" accept="image/*" hidden onChange={async e=>{const f=e.target.files?.[0];if(!f)return;try{const blob=await compressImage(f,TAILLE_AVATAR,QUALITE_AVATAR);const url=await uploadPhoto(new File([blob],"membre.jpg",{type:"image/jpeg"}),"membres");setNewM(n=>({...n,photo:url}));}catch{onToast("Cette photo n'a pas pu etre traitee, essaie une autre image","error");}}}/></label></div></Fld>
        <Fld label="Prenom"><Inp value={newM.prenom} onChange={e=>setNewM(n=>({...n,prenom:e.target.value}))} placeholder="Ex: Fatoumata" maxLength={30} autoFocus/></Fld>
        <Fld label="Numero WhatsApp"><PhoneInput value={newM.tel} onChange={v=>setNewM(n=>({...n,tel:sPhone(v)}))}/></Fld>
        <Fld label="Quartier (optionnel)"><Inp value={newM.quartier||""} onChange={e=>setNewM(n=>({...n,quartier:e.target.value}))} placeholder="Ex: Hamdallaye ACI" maxLength={40}/></Fld>
        <Fld label={`Montant personnalise (optionnel, sinon ${fmtFCFA(groupe.montant)} standard)`}><Inp value={newM.montantPerso} onChange={e=>setNewM(n=>({...n,montantPerso:e.target.value.replace(/[^0-9]/g,"")}))} placeholder="Ex: 25000" inputMode="numeric"/></Fld>
        </div>
        <Btn onClick={addM} disabled={pickerBusy}>{pickerBusy?"⏳ Ajout en cours...":"Ajouter ce membre"}</Btn>
      </Modal>}
      {editMembre&&<Modal onClose={()=>{if(!editMBusy)setEditMembre(null);}}>
        <MH title="Modifier le membre" onClose={()=>{if(!editMBusy)setEditMembre(null);}}/>
        <Fld label="Prenom"><Inp value={editMembre.prenom} onChange={e=>setEditMembre(m=>({...m,prenom:e.target.value}))} placeholder="Ex: Fatoumata" maxLength={30} autoFocus/></Fld>
        <Fld label="Numero WhatsApp"><PhoneInput value={editMembre.tel} onChange={v=>setEditMembre(m=>({...m,tel:sPhone(v)}))}/></Fld>
        <Fld label="Quartier (optionnel)"><Inp value={editMembre.quartier} onChange={e=>setEditMembre(m=>({...m,quartier:e.target.value}))} placeholder="Ex: Hamdallaye ACI" maxLength={40}/></Fld>
        <Fld label={`Montant personnalise (optionnel, sinon ${fmtFCFA(groupe.montant)} standard)`}><Inp value={editMembre.montantPerso} onChange={e=>setEditMembre(m=>({...m,montantPerso:e.target.value.replace(/[^0-9]/g,"")}))} placeholder="Ex: 25000" inputMode="numeric"/></Fld>
        <Btn onClick={saveEditMembre} disabled={editMBusy}>{editMBusy?"Enregistrement...":"Enregistrer les modifications"}</Btn>
      </Modal>}
      {showUpgrade&&<Modal onClose={()=>setShowUpgrade(false)}>
        <MH title="Limite atteinte" onClose={()=>setShowUpgrade(false)}/>
        <div style={{textAlign:"center",padding:"10px 0 4px"}}><p style={{fontSize:40,margin:0}}>🔒</p></div>
        <p style={{color:"#F5F2EA",fontSize:15,fontWeight:700,textAlign:"center",margin:"8px 0 4px"}}>{limiteMembres(user)} membres, c'est ton maximum en gratuit</p>
        <p style={{color:"#97A3C9",fontSize:13,textAlign:"center",lineHeight:1.6,marginBottom:12}}>Passe a THT Premium pour ajouter des membres illimites dans cette tontine, et beneficier de toutes les autres fonctionnalites avancees.</p>
        <p style={{color:"#FFE1A1",fontSize:12,textAlign:"center",lineHeight:1.6,marginBottom:20,background:"rgba(232,176,75,0.10)",border:"1px solid #E8B04B",borderRadius:10,padding:"9px 11px"}}>👥 Ou gagne des places gratuitement : partage ton code de parrainage depuis ton Profil. Chaque {FILLEULS_PAR_MEMBRE_BONUS} ami(e)s qui creent un compte te donnent <strong>+1 place</strong>.</p>
        <button onClick={async()=>{
          setPayBusy(true);
          await payerAbonnement(user,"mensuel",(m)=>onToast(m,"error"));
          setPayBusy(false);
        }} disabled={payBusy} style={{width:"100%",background:"linear-gradient(135deg,#FFE9B4 0%,#E8B04B 48%,#C38427 100%)",border:"none",borderRadius:12,padding:"13px",color:"#1B1203",fontWeight:800,fontSize:14,cursor:"pointer",marginBottom:12}}>{payBusy?"Ouverture du paiement...":"💳 Payer en ligne maintenant - 1 000 FCFA"}</button>
        <p style={{color:"#97A3C9",fontSize:11,textAlign:"center",margin:"0 0 12px"}}>OU manuellement via WhatsApp :</p>
        <div style={{display:"flex",gap:10}}>
          <button onClick={()=>window.open("https://wa.me/22376908031?text=Je%20veux%20THT%20Premium","_blank")} style={{flex:1,background:"#FF6600",border:"none",borderRadius:10,padding:"12px",color:"#fff",fontWeight:700,fontSize:13,cursor:"pointer"}}>Orange Money</button>
          <button onClick={()=>window.open("https://wa.me/22390647106?text=Je%20veux%20THT%20Premium","_blank")} style={{flex:1,background:"#0066CC",border:"none",borderRadius:10,padding:"12px",color:"#fff",fontWeight:700,fontSize:13,cursor:"pointer"}}>Wave</button>
        </div>
      </Modal>}
      {showEdit&&<Modal onClose={()=>setShowEdit(false)}>
        <MH title="Modifier la tontine" onClose={()=>setShowEdit(false)}/>
        <Fld label="Nom"><Inp value={editG.nom} onChange={e=>setEditG(g=>({...g,nom:e.target.value}))} placeholder="Nom de la tontine" maxLength={40} autoFocus/></Fld>
        <Fld label="Montant par cotisation (FCFA)"><Inp value={editG.montant} onChange={e=>setEditG(g=>({...g,montant:e.target.value.replace(/\D/g,"")}))} placeholder="25000" inputMode="numeric"/></Fld>
        <Fld label="Fréquence"><div style={{display:"flex",gap:8}}>{["Hebdo","Bimensuel","Mensuel"].map(f=><button key={f} onClick={()=>setEditG(g=>({...g,frequence:f}))} style={{flex:1,padding:"10px 4px",borderRadius:10,border:"1px solid",cursor:"pointer",fontSize:12,fontWeight:700,background:editG.frequence===f?"#E8B04B":"rgba(255,255,255,0.09)",color:editG.frequence===f?"#1B1203":"#F5F2EA",borderColor:editG.frequence===f?"#E8B04B":"rgba(255,255,255,0.14)"}}>{f}</button>)}</div></Fld>
        <Fld label="Date d'échéance (prochain versement)"><Inp value={editG.dateEcheance} onChange={e=>setEditG(g=>({...g,dateEcheance:e.target.value}))} type="date"/></Fld>
        <Fld label="Numéro Orange Money (optionnel)"><Inp value={editG.numeroOrangeMoney} onChange={e=>setEditG(g=>({...g,numeroOrangeMoney:e.target.value.replace(/[^\d+]/g,"")}))} placeholder="Ex: 70123456" inputMode="tel"/></Fld>
        <Fld label="Numéro Wave (optionnel)"><Inp value={editG.numeroWave} onChange={e=>setEditG(g=>({...g,numeroWave:e.target.value.replace(/[^\d+]/g,"")}))} placeholder="Ex: 70123456" inputMode="tel"/></Fld>
        <Fld label="Numéro Moov Money (optionnel)"><Inp value={editG.numeroMoovMoney} onChange={e=>setEditG(g=>({...g,numeroMoovMoney:e.target.value.replace(/[^\d+]/g,"")}))} placeholder="Ex: 60123456" inputMode="tel"/></Fld>
        <Fld label="QR de paiement (Wave ou Orange Money)">
          <label style={{display:"block",background:"rgba(255,255,255,0.055)",border:"1px dashed #E8B04B",borderRadius:10,padding:editG.qrPaiementUrl?8:14,textAlign:"center",cursor:"pointer"}}>
            <input type="file" accept="image/*" onChange={choisirQRPaiement} style={{display:"none"}}/>
            {editG.qrPaiementUrl
              ? <img src={editG.qrPaiementUrl} alt="QR" style={{maxWidth:160,maxHeight:160,borderRadius:8,display:"block",margin:"0 auto"}}/>
              : <span style={{color:"#E8B04B",fontSize:12,fontWeight:700}}>{qrUp?"Import en cours...":"📷 Importer la photo de mon QR"}</span>}
          </label>
          {editG.qrPaiementUrl&&<button onClick={()=>setEditG(g=>({...g,qrPaiementUrl:""}))} style={{background:"transparent",border:"none",color:"#FB7185",fontSize:11,fontWeight:700,cursor:"pointer",marginTop:6}}>Retirer le QR</button>}
        </Fld>
        <p style={{color:"#97A3C9",fontSize:11,margin:"-8px 0 14px",lineHeight:1.5}}>Renseigne ces numéros (et/ou importe ton QR) pour afficher le paiement direct aux membres. L'argent part directement sur ton compte, jamais sur l'app.</p>
        <Btn onClick={saveEdit} disabled={editBusy}>{editBusy?"Enregistrement...":"Enregistrer"}</Btn>
      </Modal>}
    </div>
  );
};

const HabyScreen = ({groupes,user}) => {
  const [msgs,setMsgs]=useState([{role:"assistant",content:"Salut ! Je suis HABY, ton assistante THT. Pose-moi tes questions sur ta tontine, ton épargne ou tes finances !"}]);
  const [input,setInput]=useState("");
  const [loading,setLoading]=useState(false);
  const bottomRef=useRef();
  const {listening,toggle:toggleMic}=useVoiceInput(t=>setInput(p=>p?`${p} ${t}`:t));

  // HABY est le seul service facture a l'usage : le plan gratuit est plafonne par jour.
  // Ce compteur est purement informatif (la vraie limite est appliquee cote serveur) ;
  // il sert a prevenir gentiment au lieu de laisser l'utilisatrice croire a un bug.
  const [posees,setPosees]=useState(0);
  const illimiteIA=estIllimite(user);
  useEffect(()=>{
    if(illimiteIA||!user?.id)return;
    (async()=>{
      const jour=new Date().toISOString().split("T")[0];
      const {data}=await supabase.from("haby_usage").select("nb").eq("user_id",user.id).eq("jour",jour).maybeSingle();
      setPosees(Number(data?.nb)||0);
    })();
  },[user?.id,illimiteIA]);
  const restantes=Math.max(0,QUOTA_HABY_GRATUIT-posees);

  useEffect(()=>{bottomRef.current?.scrollIntoView({behavior:"smooth"});},[msgs]);

  const send=async(txt)=>{
    const text=(txt!==undefined?txt:input).trim();
    if(!text||loading)return;
    setInput("");setLoading(true);
    if(!illimiteIA)setPosees(n=>n+1);
    const newMsgs=[...msgs,{role:"user",content:text}];
    setMsgs(newMsgs);
    const ctx=groupes.map(g=>`Tontine "${g.nom}": ${g.membres.length} membres, ${fmtFCFA(g.montant)}/cycle, cycle ${g.cycle}/${g.totalCycles}, ${g.membres.filter(m=>m.paye).length} payes.`).join("\n");
    try{
      const system=`Tu es HABY, l assistante IA officielle de THT (Tontine Habi Traore), une application africaine de gestion de tontines, cagnottes et epargne.

Ton role :
- Tu aides les utilisatrices a comprendre et gerer leurs tontines : calculs de cotisations, suivi des paiements, epargne, conseils financiers simples et concrets adaptes a leur contexte (Afrique de l Ouest francophone, FCFA).
- Quand on te donne un calcul a faire (montant total, part par membre, nombre de cycles restants, etc.), fais-le toi-meme etape par etape mentalement et donne directement le resultat exact, jamais une estimation vague.
- Si la question sort du cadre tontine/epargne/finances personnelles, tu peux quand meme repondre utilement mais brievement, sans jamais inventer d informations sur l app THT elle-meme si tu ne les connais pas via le contexte fourni.
- Ne demande jamais d informations sensibles (PIN, mot de passe, numero de carte).

Toutes les fonctionnalites de l application THT (utilise cette liste pour repondre a toute question sur comment utiliser l app) :
- TONTINES : creation, ajout de membres, cotisations a montant standard ou personnalise par membre, marquage paye/non paye, historique des versements avec photo de preuve, tirage au sort du gagnant de chaque cycle, bouton "Cloturer le cycle" pour passer au cycle suivant une fois le tirage fait.
- TIRAGE AU SORT : equitable, une personne deja tiree ne peut pas regagner avant que tout le monde soit passe. Un seul tirage par cycle, meme si plusieurs personnes cliquent en meme temps.
- DECLARER SON PAIEMENT : une membre qui a paye par mobile money peut le declarer elle-meme avec la capture d ecran. La creatrice recoit une notification et confirme ou rejette. Rien n est compte tant qu elle n a pas confirme.
- PREUVES DE PAIEMENT : la photo envoyee est lue automatiquement. L app reconnait les captures Orange Money, Wave, Moov Money, Free Money, MTN MoMo, Djamo, Sama Money, Wizall, les SMS de confirmation, les recus papier et les photos de billets, et affiche l operateur, le montant et la date lus. Une image qui n a manifestement rien a voir avec un paiement est refusee ; en cas de doute ou de photo floue, elle est acceptee et signalee. IMPORTANT : cela ne prouve PAS qu un paiement a eu lieu, cela reconnait la forme d une preuve. Seule la confirmation de la creatrice fait foi. De plus, une meme photo ne peut pas servir deux fois dans la meme tontine.
- DETTE ET RETARDS : a la fin d un cycle, ce qui n a pas ete paye devient une "dette" cumulee qui reste visible. Elle n est jamais effacee automatiquement. Le passage au cycle suivant est automatique 3 jours apres l echeance, avec des rappels envoyes avant et apres la date.
- BUREAU : roles president/tresoriere/secretaire, elections.
- PRETS : un membre peut demander un pret (bouton "Demander un prêt" dans sa tontine), les membres votent, la creatrice accepte/refuse et verse avec photo de preuve.
- CHECKLIST DE SUIVI (onglet "Suivi") : pour chaque versement, suit si le montant est reçu, si le reçu a été envoyé, s'il y a une dette, et la photo de preuve. Un rôle "collecteur" peut être délégué par la créatrice à 1-2 membres pour aider à enregistrer les versements. Une photo ou un recu oublie peut etre ajoute apres coup sans re-enregistrer le versement.
- CAISSE SOCIALE : fonds separe des cotisations, pour l entraide et les imprevus. La creatrice peut y ajouter ou retirer de l argent avec un motif, un historique est garde.
- CAGNOTTES SOLIDAIRES : creation d une cagnotte (mariage, sante, funerailles, etudes...), avec un lien public de contribution partageable meme a des personnes sans compte THT, photo de preuve du depot obligatoire.
- EPARGNE PERSONNELLE ("Ma Tirelire") : objectifs d epargne individuels, hors tontine, avec la date et l heure precises de chaque depot. Visible seulement par la personne elle-meme.
- MESSAGERIE : messages de groupe et messages prives entre membres d une meme tontine, avec messages ecrits, vocaux et images. Des pastilles rouges signalent les nouveautes non lues.
- NOTIFICATIONS : rappels automatiques avant la date d echeance, et alertes en cas de paiement declare, confirme, de tirage gagne ou de nouveau cycle.
- COMPTE : inscription/connexion par numero de telephone + PIN a 4 chiffres, changement de PIN dans Profil. Le nom et la photo de profil sont modifiables a tout moment (bouton "Modifier mon profil").
- MEMBRES DE LA TONTINE : dans Profil, la liste des personnes de ses tontines avec nom, quartier, photo et date d ajout.
- RAPPORTS DE REUNION, TACHES, EVENEMENTS : sections disponibles dans chaque tontine (onglet "Plus").
- EXPORT : rapport PDF et export Excel/CSV des donnees, disponibles dans Profil.
- PARRAINAGE : chaque utilisatrice a un code a partager. Tous les 5 filleuls inscrits avec son code, elle gagne 1 place de membre supplementaire dans ses tontines.
- LIMITES DU PLAN GRATUIT : 1 tontine, 15 membres par tontine (+1 par tranche de 5 filleuls), et 10 questions par jour a HABY. Le Premium (1 000 FCFA/mois ou 10 000 FCFA/an) enleve toutes ces limites. L abonnement a une date de fin et doit etre renouvele.
- ADMINISTRATION (reservee a la responsable de l application, pas aux utilisatrices) : gestion des abonnements et suppression complete d un compte cree par erreur, ce qui libere le numero de telephone pour une nouvelle inscription. Si une utilisatrice veut supprimer son compte, dis-lui de contacter le support.

Ce que l application ne fait PAS (ne l invente jamais) : elle ne transporte aucun argent, ne fait aucun paiement, ne se connecte a aucun compte Orange Money ou Wave. C est un carnet de comptes numerique : l argent circule directement entre les personnes, en main propre ou par mobile money, et l application enregistre ce que la creatrice declare avoir recu.

Ton style :
- Francais simple, chaleureux, direct, jamais condescendant.
- Reponses courtes par defaut (2 a 4 phrases), mais tu peux developper un peu plus si la question est complexe ou demande un calcul detaille ou une explication de fonctionnalite.
- Tu peux utiliser un emoji occasionnellement, sans en abuser.

Donnees reelles des tontines de l utilisatrice en ce moment : ${ctx||"aucune tontine pour le moment"}.`;
      const {data,error}=await supabase.functions.invoke("haby-chat",{body:{system,messages:newMsgs}});
      if(error){
        let detail=error.message||"inconnue";
        try{if(error.context?.json){const body=await error.context.json();detail=body.error||detail;}}catch{}
        throw new Error(detail);
      }
      const reply=data?.content?.map(b=>b.text||"").join("")||"Desole, reessaie !";
      setMsgs([...newMsgs,{role:"assistant",content:reply}]);
    }catch(e){setMsgs([...newMsgs,{role:"assistant",content:"Erreur technique : "+(e?.message||"inconnue")}]);}
    setLoading(false);
  };

  const sugg=["C est quand mon tour ?","Qui n a pas paye ?","Combien j'ai épargné ?","Conseils pour mon groupe"];
  return(
    <div style={{display:"flex",flexDirection:"column",height:"calc(100vh - 78px)",background:"rgba(255,255,255,0.055)"}}>
      <div style={{background:"rgba(255,255,255,0.055)",padding:"44px 16px 14px",display:"flex",alignItems:"center",gap:12,borderBottom:"1px solid rgba(255,255,255,0.09)",flexShrink:0}}>
        <div style={{width:46,height:46,background:"linear-gradient(135deg,#FFE9B4 0%,#E8B04B 48%,#C38427 100%)",borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:900,fontSize:20,color:"#1B1203",flexShrink:0}}>H</div>
        <div style={{flex:1,minWidth:0}}><p style={{margin:0,color:"#F5F2EA",fontWeight:800,fontSize:16}}>HABY</p><p style={{margin:0,color:"#34D399",fontSize:11}}>En ligne - Assistante THT</p></div>
        {illimiteIA
          ? <span style={{background:"rgba(232,176,75,0.10)",color:"#FFE1A1",fontSize:10.5,fontWeight:700,padding:"4px 9px",borderRadius:99,border:"1px solid #E8B04B",flexShrink:0}}>Illimite</span>
          : <span title="Nombre de questions offertes aujourd hui" style={{background:restantes>0?"rgba(255,255,255,0.045)":"rgba(251,113,133,0.10)",color:restantes>0?"#97A3C9":"#FB7185",fontSize:10.5,fontWeight:700,padding:"4px 9px",borderRadius:99,border:"1px solid "+(restantes>0?"rgba(255,255,255,0.09)":"#FB7185"),flexShrink:0}}>{restantes}/{QUOTA_HABY_GRATUIT} aujourd hui</span>}
      </div>
      <div style={{flex:1,overflowY:"auto",padding:"16px 16px 0"}}>
        {msgs.map((m,i)=>(
          <div key={i} style={{display:"flex",justifyContent:m.role==="user"?"flex-end":"flex-start",marginBottom:12,alignItems:"flex-end",gap:8}}>
            {m.role==="assistant"&&<div style={{width:28,height:28,background:"#E8B04B",borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:900,fontSize:12,color:"#1B1203",flexShrink:0}}>H</div>}
            <div style={{background:m.role==="user"?"linear-gradient(135deg,#FFE9B4 0%,#E8B04B 48%,#C38427 100%)":"rgba(255,255,255,0.055)",border:m.role==="user"?"none":"1px solid rgba(255,255,255,0.09)",borderRadius:m.role==="user"?"18px 18px 4px 18px":"18px 18px 18px 4px",padding:"12px 16px",color:m.role==="user"?"#1B1203":"#F5F2EA",fontSize:14,maxWidth:"80%",lineHeight:1.6,fontWeight:m.role==="user"?700:400}}>{m.content}</div>
          </div>
        ))}
        {loading&&<div style={{display:"flex",gap:8,alignItems:"flex-end",marginBottom:12}}><div style={{width:28,height:28,background:"#E8B04B",borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:900,fontSize:12,color:"#1B1203"}}>H</div><div style={{background:"rgba(255,255,255,0.055)",border:"1px solid rgba(255,255,255,0.09)",borderRadius:"18px 18px 18px 4px",padding:"14px 18px",color:"#E8B04B",fontSize:20,letterSpacing:4}}>...</div></div>}
        <div ref={bottomRef}/>
      </div>
      {msgs.length<=2&&<div style={{display:"flex",gap:8,padding:"8px 16px",overflowX:"auto",flexShrink:0}}>{sugg.map(sg=><button key={sg} onClick={()=>send(sg)} style={{flexShrink:0,background:"rgba(255,255,255,0.055)",border:"1px solid rgba(255,255,255,0.09)",borderRadius:99,padding:"8px 14px",color:"#E8B04B",fontSize:12,cursor:"pointer",fontWeight:600,whiteSpace:"nowrap"}}>{sg}</button>)}</div>}
      <div style={{display:"flex",gap:8,padding:"12px 16px 28px",background:"rgba(255,255,255,0.055)",borderTop:"1px solid rgba(255,255,255,0.09)",flexShrink:0}}>
        <button onClick={toggleMic} title="Dicter un message" style={{width:46,height:50,background:listening?"#E0526A":"rgba(255,255,255,0.055)",border:"1px solid rgba(255,255,255,0.14)",borderRadius:14,color:listening?"#fff":"#E8B04B",fontSize:18,cursor:"pointer",flexShrink:0}}>{listening?"⏹":"🎤"}</button>
        <input value={input} onChange={e=>setInput(e.target.value.replace(/[<>"]/g,"").slice(0,500))} onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey&&!loading){e.preventDefault();send();}}} placeholder="Ecris ou dicte a HABY..." style={{flex:1,background:"rgba(255,255,255,0.055)",border:"1px solid rgba(255,255,255,0.14)",borderRadius:14,padding:"14px 16px",color:"#F5F2EA",fontSize:15,outline:"none"}}/>
        <button onClick={()=>send()} disabled={!input.trim()||loading} style={{width:50,height:50,background:input.trim()&&!loading?"#E8B04B":"rgba(255,255,255,0.09)",border:"none",borderRadius:14,color:"#1B1203",fontWeight:900,fontSize:20,cursor:input.trim()&&!loading?"pointer":"not-allowed",flexShrink:0,alignSelf:"flex-end"}}>→</button>
      </div>
    </div>
  );
};

const EpargneScreen = ({onToast,user}) => {
  const [objs,setObjs]=useState([]);
  const [loading,setLoading]=useState(true);
  const [showAdd,setShowAdd]=useState(false);
  const [nObj,setNObj]=useState({label:"",emoji:"🎯",cible:"",actuel:""});
  const [versObj,setVersObj]=useState(null);
  const [versAmt,setVersAmt]=useState("");
  const [busy,setBusy]=useState(false);
  const [mouvements,setMouvements]=useState({}); // { [objectif_id]: [versements horodates] }
  const [animVersement,setAnimVersement]=useState(null);
  const [historiqueOuvert,setHistoriqueOuvert]=useState(null);
  const totalEp=objs.reduce((a,o)=>a+o.actuel,0);
  const totalC=objs.reduce((a,o)=>a+o.cible,0);

  const loadObjs=async()=>{
    setLoading(true);
    const {data,error}=await supabase.from("objectifs").select("*").eq("user_id",user.id).order("created_at",{ascending:true});
    if(error){onToast("Erreur de chargement de l'épargne","error");setObjs([]);}
    else setObjs(data.map(o=>({...o,actuel:Number(o.actuel)||0,cible:Number(o.cible)||0})));
    setLoading(false);
  };
  // Historique horodate de chaque depot. Si la table n'a pas encore ete creee en base
  // (script supabase_epargne_historique.sql pas encore lance), on ignore silencieusement :
  // l'epargne continue de fonctionner, seul l'historique detaille reste vide.
  const loadMouvements=async()=>{
    const {data,error}=await supabase.from("objectif_versements").select("*").eq("user_id",user.id).order("created_at",{ascending:false});
    if(error)return;
    const parObjectif={};
    (data||[]).forEach(v=>{(parObjectif[v.objectif_id]=parObjectif[v.objectif_id]||[]).push(v);});
    setMouvements(parObjectif);
  };
  useEffect(()=>{loadObjs();loadMouvements();},[user.id]);

  const addObj=async()=>{
    if(!nObj.label.trim()||!nObj.cible)return onToast("Remplis tous les champs","error");
    setBusy(true);
    const payload={user_id:user.id,label:s(nObj.label.trim()),emoji:nObj.emoji,actuel:Number(nObj.actuel)||0,cible:Number(nObj.cible),couleur:"#E8B04B"};
    const {data,error}=await supabase.from("objectifs").insert(payload).select().single();
    setBusy(false);
    if(error)return onToast("Impossible d ajouter l objectif","error");
    setObjs(o=>[...o,{...data,actuel:Number(data.actuel)||0,cible:Number(data.cible)||0}]);
    setNObj({label:"",emoji:"🎯",cible:"",actuel:""});setShowAdd(false);onToast("Objectif ajouté !");
  };

  const delObj=async(o)=>{
    const {error}=await supabase.from("objectifs").delete().eq("id",o.id);
    if(error)return onToast("Suppression impossible","error");
    setObjs(list=>list.filter(x=>x.id!==o.id));onToast("Objectif supprime");
  };

  const openVersement=(o)=>{setVersObj(o);setVersAmt("");};
  const addVersement=async()=>{
    const montant=Number(versAmt);
    if(!montant||montant<=0)return onToast("Montant invalide","error");
    setBusy(true);
    const nouveauMontant=versObj.actuel+montant;
    const {data,error}=await supabase.from("objectifs").update({actuel:nouveauMontant}).eq("id",versObj.id).select().single();
    if(error){setBusy(false);return onToast("Versement impossible","error");}
    // Trace horodatee du depot (date + heure exactes), pour l'historique.
    const {data:mvt}=await supabase.from("objectif_versements").insert({objectif_id:versObj.id,user_id:user.id,montant}).select().single();
    if(mvt)setMouvements(list=>({...list,[versObj.id]:[mvt,...(list[versObj.id]||[])]}));
    setBusy(false);
    // Animation ludique : la main depose l'argent dans la tirelire.
    setAnimVersement({montant,label:versObj.label,emoji:versObj.emoji});
    setTimeout(()=>setAnimVersement(null),2200);
    setObjs(list=>list.map(o=>o.id===versObj.id?{...o,actuel:Number(data.actuel)||nouveauMontant}:o));
    onToast(nouveauMontant>=versObj.cible?"Objectif atteint ! 🎉":"Versement ajouté !");
    setVersObj(null);setVersAmt("");
  };

  return(
    <div style={{paddingBottom:90}}>
      <div style={{padding:"44px 16px 0",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <h2 style={{color:"#F5F2EA",fontSize:22,fontWeight:900,margin:0}}>Ma Tirelire</h2>
        <button onClick={()=>setShowAdd(true)} style={{background:"rgba(255,255,255,0.09)",border:"1px solid rgba(255,255,255,0.14)",borderRadius:10,padding:"8px 16px",color:"#E8B04B",fontWeight:700,fontSize:13,cursor:"pointer"}}>+ Objectif</button>
      </div>
      <div style={{margin:"14px 16px 0",background:"linear-gradient(135deg,rgba(255,255,255,0.09),rgba(255,255,255,0.055))",borderRadius:16,padding:16,border:"1px solid rgba(255,255,255,0.14)"}}>
        <p style={{margin:0,color:"#97A3C9",fontSize:12,fontWeight:600}}>TOTAL EPARGNE</p>
        <p style={{margin:"4px 0 0",color:"#E8B04B",fontSize:26,fontWeight:900}}>{fmtFCFA(totalEp)}</p>
        <Bar pct={totalC>0?Math.round((totalEp/totalC)*100):0} c="#E8B04B"/>
        <p style={{margin:"6px 0 0",color:"#97A3C9",fontSize:11}}>Objectif global : {fmtFCFA(totalC)}</p>
      </div>
      <div style={{padding:"14px 16px 0"}}>
        {loading?<p style={{color:"#97A3C9",fontSize:13,textAlign:"center",marginTop:20}}>Chargement...</p>
        :objs.length===0?<p style={{color:"#97A3C9",fontSize:13,textAlign:"center",marginTop:20}}>Aucun objectif pour le moment. Cree ton premier objectif d epargne !</p>
        :objs.map(o=>{const pct=o.cible>0?Math.round((o.actuel/o.cible)*100):0;return(
          <div key={o.id} style={{background:"rgba(255,255,255,0.055)",border:"1px solid rgba(255,255,255,0.09)",borderRadius:16,padding:16,marginBottom:10}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}><div style={{display:"flex",alignItems:"center",gap:10}}><span style={{fontSize:26}}>{o.emoji}</span><div><p style={{margin:0,color:"#F5F2EA",fontWeight:700,fontSize:15}}>{o.label}</p><p style={{margin:0,color:"#97A3C9",fontSize:12}}>{fmtFCFA(o.actuel)} / {fmtFCFA(o.cible)}</p></div></div><span style={{color:o.couleur,fontWeight:900,fontSize:20}}>{pct}%</span></div>
            <Bar pct={pct} c={o.couleur}/>
            {pct>=100?<p style={{color:"#34D399",fontSize:12,margin:"8px 0 0",fontWeight:700}}>Objectif atteint !</p>:<p style={{color:"#97A3C9",fontSize:11,margin:"6px 0 0"}}>Reste {fmtFCFA(o.cible-o.actuel)}</p>}
            <div style={{display:"flex",gap:8,marginTop:10}}>
              <button onClick={()=>openVersement(o)} style={{flex:1,background:"rgba(255,255,255,0.09)",border:"1px solid rgba(255,255,255,0.14)",borderRadius:10,padding:"8px",color:"#E8B04B",fontWeight:700,fontSize:12,cursor:"pointer"}}>+ Versement</button>
              <button onClick={()=>setHistoriqueOuvert(h=>h===o.id?null:o.id)} style={{background:"rgba(255,255,255,0.045)",border:"1px solid #97A3C9",borderRadius:10,padding:"8px 12px",color:"#F5F2EA",fontWeight:700,fontSize:12,cursor:"pointer"}}>{historiqueOuvert===o.id?"Masquer":"Historique"}{(mouvements[o.id]||[]).length>0?` (${mouvements[o.id].length})`:""}</button>
              <button onClick={()=>delObj(o)} style={{background:"transparent",border:"1px solid #E0526A",borderRadius:10,padding:"8px 12px",color:"#FB7185",fontWeight:700,fontSize:12,cursor:"pointer"}}>Suppr.</button>
            </div>
            {historiqueOuvert===o.id&&<div style={{marginTop:10,borderTop:"1px solid rgba(255,255,255,0.09)",paddingTop:10}}>
              {(mouvements[o.id]||[]).length===0?<p style={{color:"#97A3C9",fontSize:12,margin:0,textAlign:"center"}}>Aucun versement enregistré pour l instant.</p>
              :(mouvements[o.id]||[]).map(v=>(
                <div key={v.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"7px 0",borderBottom:"1px solid rgba(255,255,255,0.045)"}}>
                  <span style={{color:"#97A3C9",fontSize:12}}>🕒 {new Date(v.created_at).toLocaleString("fr-FR",{day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit"})}</span>
                  <span style={{color:"#34D399",fontWeight:700,fontSize:12}}>+{fmtFCFA(Number(v.montant)||0)}</span>
                </div>
              ))}
            </div>}
          </div>
        );})}
      </div>
      <div style={{margin:"6px 16px 0",background:"rgba(255,255,255,0.055)",border:"1px solid #E8B04B",borderRadius:14,padding:14}}>
        <p style={{margin:0,color:"#E8B04B",fontWeight:700,fontSize:13}}>Conseil HABY</p>
        <p style={{margin:"6px 0 0",color:"#F5F2EA",fontSize:13,lineHeight:1.6}}>Epargne 10% de chaque cagnotte recue. En 12 mois tu peux cumuler 30 000 FCFA d epargne personnelle !</p>
      </div>
      {showAdd&&<Modal onClose={()=>setShowAdd(false)}>
        <MH title="Nouvel objectif" onClose={()=>setShowAdd(false)}/>
        <Fld label="Nom de l objectif"><Inp value={nObj.label} onChange={e=>setNObj(o=>({...o,label:e.target.value}))} placeholder="Ex: Hajj 2027" maxLength={40} autoFocus/></Fld>
        <Fld label="Emoji"><div style={{display:"flex",gap:8,flexWrap:"wrap"}}>{["🎯","🏠","✈️","📚","💍","🌙","📱","🚗","🏥","💼","👶","🐑"].map(em=><button key={em} onClick={()=>setNObj(o=>({...o,emoji:em}))} style={{fontSize:22,background:nObj.emoji===em?"#E8B04B":"rgba(255,255,255,0.09)",border:"none",borderRadius:10,padding:8,cursor:"pointer"}}>{em}</button>)}</div></Fld>
        <Fld label="Montant cible (FCFA)"><Inp value={nObj.cible} onChange={e=>setNObj(o=>({...o,cible:e.target.value.replace(/\D/g,"")}))} placeholder="Ex: 500000" inputMode="numeric"/></Fld>
        <Fld label="Déjà épargné (FCFA)"><Inp value={nObj.actuel} onChange={e=>setNObj(o=>({...o,actuel:e.target.value.replace(/\D/g,"")}))} placeholder="Ex: 50000" inputMode="numeric"/></Fld>
        <Btn onClick={addObj} disabled={busy}>{busy?"Ajout...":"Ajouter"}</Btn>
      </Modal>}
      {versObj&&<Modal onClose={()=>setVersObj(null)}>
        <MH title={`Verser sur "${versObj.label}"`} onClose={()=>setVersObj(null)}/>
        <Fld label="Montant du versement (FCFA)"><Inp value={versAmt} onChange={e=>setVersAmt(e.target.value.replace(/\D/g,""))} placeholder="Ex: 5000" inputMode="numeric" autoFocus/></Fld>
        <Btn onClick={addVersement} disabled={busy}>{busy?"Enregistrement...":"Confirmer le versement"}</Btn>
      </Modal>}
      {/* Animation a chaque versement : la boite d'epargne THT (la personne depose l'argent)
          apparait avec un rebond, des pieces tombent dans la fente, et le montant monte. */}
      {animVersement&&<div style={{position:"fixed",inset:0,background:"rgba(6,11,33,0.9)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:9998}}>
        <style>{`
          @keyframes thtBoxIn{0%{transform:scale(0.7) translateY(34px);opacity:0}30%{opacity:1}56%{transform:scale(1.06) translateY(0)}72%{transform:scale(0.98)}100%{transform:scale(1) translateY(0);opacity:1}}
          @keyframes thtBoxShake{0%,45%{transform:translateX(0) rotate(0)}56%{transform:translateX(-4px) rotate(-1deg)}66%{transform:translateX(4px) rotate(1deg)}78%{transform:translateX(-2px)}100%{transform:translateX(0)}}
          @keyframes thtPieceTombe{0%{transform:translateY(-34px) scale(0.6);opacity:0}45%{opacity:1}100%{transform:translateY(34px) scale(1);opacity:0}}
          @keyframes thtMontantMonte{0%{transform:translateY(14px);opacity:0}30%{opacity:1}100%{transform:translateY(-26px);opacity:0}}
        `}</style>
        <div style={{textAlign:"center",position:"relative"}}>
          <div style={{position:"relative",display:"inline-block",animation:"thtBoxIn 0.9s ease-out, thtBoxShake 0.6s ease-in-out 0.9s"}}>
            {/* data-noinvert : l'image de la boite reste naturelle meme en mode sombre. */}
            <img src={tirelireImg} alt="Boite d'epargne THT" data-noinvert style={{height:280,maxWidth:"88vw",objectFit:"contain",borderRadius:16,display:"block",filter:"drop-shadow(0 14px 34px rgba(0,0,0,0.55))"}}/>
            {/* pieces qui tombent dans la fente du dessus */}
            <span style={{position:"absolute",top:"12%",left:"44%",fontSize:26,animation:"thtPieceTombe 1.1s ease-in 0.6s both"}} role="img" aria-hidden="true">🪙</span>
            <span style={{position:"absolute",top:"12%",left:"54%",fontSize:20,animation:"thtPieceTombe 1.1s ease-in 0.9s both"}} role="img" aria-hidden="true">🪙</span>
          </div>
          <p style={{color:"#E8B04B",fontSize:26,fontWeight:900,margin:"12px 0 0",animation:"thtMontantMonte 2.2s ease-out"}}>+{fmtFCFA(animVersement.montant)}</p>
          <p style={{color:"#FFFFFF",fontSize:14,fontWeight:700,margin:"8px 0 0"}}>{animVersement.emoji} {animVersement.label}</p>
          <p style={{color:"#6F7BA6",fontSize:12,margin:"6px 0 0"}}>{new Date().toLocaleString("fr-FR",{day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit"})}</p>
        </div>
      </div>}
    </div>
  );
};

const SupportModal = ({onClose,onToast}) => {
  const [txt,setTxt]=useState("");
  const {listening,toggle:toggleMic}=useVoiceInput(t=>setTxt(p=>p?`${p} ${t}`:t),onToast);
  const send=()=>{
    if(!txt.trim())return onToast("Ecris ou dicte ton message d abord","error");
    window.open(`https://wa.me/22376908031?text=${encodeURIComponent("Support THT : "+txt.trim())}`,"_blank");
    onClose();
  };
  return(
    <Modal onClose={onClose}>
      <MH title="Contacter le support" onClose={onClose}/>
      <p style={{color:"#97A3C9",fontSize:12,margin:"0 0 12px",lineHeight:1.6}}>Ecris ton message ou dicte-le a voix haute, puis envoie-le a notre equipe sur WhatsApp.</p>
      <div style={{display:"flex",gap:8,marginBottom:14}}>
        <textarea value={txt} onChange={e=>setTxt(e.target.value.slice(0,500))} placeholder="Explique ton probleme..." rows={4} style={{flex:1,background:"rgba(255,255,255,0.045)",border:"1px solid rgba(255,255,255,0.14)",borderRadius:12,padding:"12px 14px",color:"#F5F2EA",fontSize:14,outline:"none",resize:"none",fontFamily:"inherit"}}/>
      </div>
      <div style={{display:"flex",gap:10}}>
        <button onClick={toggleMic} style={{background:listening?"#E0526A":"rgba(255,255,255,0.09)",border:"1px solid rgba(255,255,255,0.14)",borderRadius:14,padding:"0 20px",color:listening?"#fff":"#E8B04B",fontSize:18,cursor:"pointer"}}>{listening?"⏹ Stop":"🎤 Dicter"}</button>
        <Btn onClick={send}>Envoyer via WhatsApp</Btn>
      </div>
    </Modal>
  );
};

const AdminScreen = ({onBack,onToast,currentUserId,user}) => {
  const [users,setUsers]=useState([]);
  const [groupesCount,setGroupesCount]=useState(0);
  const [totalCollecte,setTotalCollecte]=useState(0);
  const [paiements,setPaiements]=useState([]);
  const [tontinesList,setTontinesList]=useState([]);
  const [loading,setLoading]=useState(true);
  const [busyId,setBusyId]=useState(null);
  const [showReset,setShowReset]=useState(false);
  const [confirmReset,setConfirmReset]=useState("");
  const [resetBusy,setResetBusy]=useState(false);
  const [codeSecu1,setCodeSecu1]=useState(null);
  const [codeSecu2,setCodeSecu2]=useState(null);
  const [showConfigCodes,setShowConfigCodes]=useState(false);
  const [nc1,setNc1]=useState("");
  const [nc2,setNc2]=useState("");
  const [configBusy,setConfigBusy]=useState(false);
  const [saisieCode1,setSaisieCode1]=useState("");
  const [saisieCode2,setSaisieCode2]=useState("");
  useEffect(()=>{
    supabase.from("users").select("code_secu_1,code_secu_2").eq("id",currentUserId).single().then(({data})=>{
      if(data){setCodeSecu1(data.code_secu_1||null);setCodeSecu2(data.code_secu_2||null);}
    });
  },[currentUserId]);
  const enregistrerCodes=async()=>{
    if(!nc1.trim()||!nc2.trim())return onToast("Les deux codes sont requis","error");
    if(nc1.trim()===nc2.trim())return onToast("Les deux codes doivent etre differents","error");
    setConfigBusy(true);
    const {error}=await supabase.from("users").update({code_secu_1:nc1.trim(),code_secu_2:nc2.trim()}).eq("id",currentUserId);
    setConfigBusy(false);
    if(error)return onToast("Erreur : "+(error.message||"inconnue"),"error");
    setCodeSecu1(nc1.trim());setCodeSecu2(nc2.trim());
    setShowConfigCodes(false);setNc1("");setNc2("");
    onToast("Codes de securite enregistres !");
  };
  const [showChangePinAdmin,setShowChangePinAdmin]=useState(false);
  const [oldPinA,setOldPinA]=useState("");
  const [newPinA,setNewPinA]=useState("");
  const [newPinA2,setNewPinA2]=useState("");
  const [pinErrA,setPinErrA]=useState("");
  const [pinBusyA,setPinBusyA]=useState(false);
  const soumettreChangePinAdmin=async()=>{
    setPinErrA("");
    if(oldPinA.length!==4)return setPinErrA("PIN actuel : 4 chiffres requis");
    if(newPinA.length!==4)return setPinErrA("Nouveau PIN : 4 chiffres requis");
    if(newPinA!==newPinA2)return setPinErrA("Les deux nouveaux PIN ne correspondent pas");
    if(newPinA===oldPinA)return setPinErrA("Le nouveau PIN doit etre different de l ancien");
    setPinBusyA(true);
    const res=await changePin(user.tel,oldPinA,newPinA);
    setPinBusyA(false);
    if(!res.ok)return setPinErrA(res.err);
    setShowChangePinAdmin(false);setOldPinA("");setNewPinA("");setNewPinA2("");
    onToast("PIN change avec succes !");
  };
  const [resetJournal,setResetJournal]=useState(null);
  const executerReset=async()=>{
    if(!saisieCode1.trim()||!saisieCode2.trim())return onToast("Entre tes 2 codes de securite","error");
    if(confirmReset.trim().toUpperCase()!=="SUPPRIMER")return onToast("Tape SUPPRIMER pour confirmer","error");
    if(saisieCode1.trim()!==codeSecu1||saisieCode2.trim()!==codeSecu2)return onToast("Un des deux codes de securite est incorrect","error");
    setResetBusy(true);setResetJournal(null);
    const {data:{session}}=await supabase.auth.getSession();
    try{
      const res=await fetch(`${SUPABASE_URL}/functions/v1/admin-reset-data`,{method:"POST",headers:{"Content-Type":"application/json","Authorization":`Bearer ${session.access_token}`},body:JSON.stringify({code_1:saisieCode1.trim(),code_2:saisieCode2.trim()})});
      const data=await res.json();
      setResetBusy(false);
      setResetJournal(data.journal||[data.error||"Aucune information"]);
      if(!res.ok)return onToast(data.error||"Erreur lors de la remise a zero","error");
      onToast(`Termine ! ${data.comptes_supprimes} compte(s) de test supprime(s). Regarde le journal en dessous.`);
    }catch(e){setResetBusy(false);setResetJournal(["Exception cote app : "+(e.message||"inconnue")]);onToast("Erreur : "+(e.message||"inconnue"),"error");}
  };
  useEffect(()=>{
    (async()=>{
      const [{data:us,error:e1},{data:gs},{data:txs,error:e3},{data:pmts}]=await Promise.all([
        supabase.from("users").select("*").order("created_at",{ascending:false}),
        supabase.from("groupes").select("*").order("created_at",{ascending:false}),
        supabase.from("transactions").select("montant"),
        supabase.from("paiements").select("*").order("created_at",{ascending:false}),
      ]);
      if(e1)onToast("Erreur de chargement : "+(e1.message||"inconnue"),"error");
      else setUsers(us||[]);
      if(!e3)setTotalCollecte((txs||[]).reduce((a,t)=>a+(Number(t.montant)||0),0));
      setGroupesCount((gs||[]).length);
      setPaiements(pmts||[]);
      if(gs&&gs.length>0){
        const groupeIds=gs.map(g=>g.id);
        const {data:mm}=await supabase.from("membres").select("groupe_id").in("groupe_id",groupeIds);
        const countByGroupe={};
        (mm||[]).forEach(m=>{countByGroupe[m.groupe_id]=(countByGroupe[m.groupe_id]||0)+1;});
        const withCreator=gs.map(g=>{
          const createur=(us||[]).find(u=>u.id===g.user_id);
          return {...g,membresCount:countByGroupe[g.id]||0,createurNom:createur?.prenom||"?",createurTel:createur?.telephone||""};
        });
        setTontinesList(withCreator);
      }
      setLoading(false);
    })();
  },[]);
  const totalUsers=users.length;
  const totalPremium=users.filter(u=>u.plan==="premium").length;

  const today=new Date().toDateString();
  const yesterday=new Date(Date.now()-86400000).toDateString();
  const weekAgo=Date.now()-7*86400000;
  const connecteesAuj=users.filter(u=>u.derniere_connexion&&new Date(u.derniere_connexion).toDateString()===today).length;
  const connecteesHier=users.filter(u=>u.derniere_connexion&&new Date(u.derniere_connexion).toDateString()===yesterday).length;
  const connecteesSemaine=users.filter(u=>u.derniere_connexion&&new Date(u.derniere_connexion).getTime()>=weekAgo).length;

  const paiementsAcceptes=paiements.filter(p=>p.statut==="accepted");
  const revenuTotal=paiementsAcceptes.reduce((a,p)=>a+(Number(p.montant)||0),0);
  const debutMois=new Date();debutMois.setDate(1);debutMois.setHours(0,0,0,0);
  const revenuMois=paiementsAcceptes.filter(p=>new Date(p.created_at)>=debutMois).reduce((a,p)=>a+(Number(p.montant)||0),0);
  const paiementsAuj=paiementsAcceptes.filter(p=>new Date(p.created_at).toDateString()===today).length;

  const toggleAdmin=async(u)=>{
    const newRole=u.role==="admin"?"user":"admin";
    setBusyId(u.id);
    const {error}=await supabase.from("users").update({role:newRole}).eq("id",u.id);
    setBusyId(null);
    if(error)return onToast("Erreur : "+(error.message||"inconnue"),"error");
    setUsers(list=>list.map(x=>x.id===u.id?{...x,role:newRole}:x));
    onToast(newRole==="admin"?`${u.prenom} est maintenant co-administrateur !`:`${u.prenom} n est plus administrateur`);
    if(newRole==="admin"){
      supabase.functions.invoke("send-push",{body:{user_id:u.id,title:"THT",body:"Tu es maintenant co-administrateur de la plateforme !"}}).catch(()=>{});
    }
  };
  // Activation manuelle d'un abonnement (cas d'un paiement encaisse hors application :
  // lien de paiement, especes, mobile money direct...). On pose TOUJOURS une date de fin :
  // sans elle, la tache quotidienne qui repasse les comptes expires en gratuit ne voit
  // jamais ce compte (une valeur vide ne correspond a aucune comparaison en SQL) et
  // l'abonnement devient gratuit a vie.
  const togglePremium=async(u,jours=30)=>{
    const activer=u.plan!=="premium";
    setBusyId(u.id);
    let maj;
    if(activer){
      // Un renouvellement anticipe s'ajoute au temps restant au lieu de l'effacer.
      const finActuelle=u.premium_expire_le?new Date(u.premium_expire_le+"T00:00:00Z"):null;
      const base=finActuelle&&finActuelle>new Date()?finActuelle:new Date();
      const fin=new Date(base);fin.setUTCDate(fin.getUTCDate()+jours);
      maj={plan:"premium",premium_expire_le:fin.toISOString().split("T")[0]};
    }else{
      maj={plan:"free",premium_expire_le:null};
    }
    const {error}=await supabase.from("users").update(maj).eq("id",u.id);
    setBusyId(null);
    if(error)return onToast("Erreur : "+(error.message||"inconnue"),"error");
    const newPlan=maj.plan;
    setUsers(list=>list.map(x=>x.id===u.id?{...x,...maj}:x));
    onToast(activer?`${u.prenom} est Premium jusqu'au ${new Date(maj.premium_expire_le+"T00:00:00Z").toLocaleDateString("fr-FR")}`:`${u.prenom} repasse en Gratuit`);
    if(newPlan==="premium"){
      supabase.functions.invoke("send-push",{body:{user_id:u.id,title:"THT",body:"Ton compte est maintenant Premium ! Merci pour ta confiance."}}).catch(()=>{});
    }
  };

  // --- Suppression d'un compte ------------------------------------------------
  // Sert au cas le plus courant du terrain : quelqu'un s'inscrit par erreur (mauvais
  // numero, faute de frappe) et ne peut plus recommencer, car son numero reste pris.
  // Seule une fonction serveur peut liberer un numero -- l'application n'a pas le droit
  // de toucher a la table des comptes.
  //
  // TOUJOURS EN DEUX TEMPS : on demande d'abord au serveur l'inventaire de ce qui sera
  // efface, on l'affiche, et la suppression n'a lieu qu'apres confirmation explicite.
  // Une suppression de compte ne se rattrape pas.
  const [suppr,setSuppr]=useState(null);       // {u, inventaire} -> ouvre la fenetre de confirmation
  const [supprBusy,setSupprBusy]=useState(false);

  // Quand une Edge Function repond avec un code d'erreur, supabase-js met `data` a null
  // et range la vraie reponse dans error.context. Sans cette lecture, l'administratrice
  // ne verrait que "Edge Function returned a non-2xx status code" au lieu du motif exact
  // du refus -- par exemple "cette personne dirige une tontine ou d'autres cotisent".
  const appelerFonctionAdmin=async(corps)=>{
    const {data,error}=await supabase.functions.invoke("admin-delete-user",{body:corps});
    if(!error)return{data,erreur:data?.error||null};
    let erreur=error.message||"Erreur inconnue";
    try{const detail=await error.context?.json();if(detail?.error)erreur=detail.error;}catch{}
    return{data:null,erreur};
  };

  const demanderApercuSuppression=async(u)=>{
    setBusyId(u.id);
    const {data,erreur}=await appelerFonctionAdmin({user_id:u.id,action:"apercu"});
    setBusyId(null);
    if(erreur)return onToast(erreur,"error");
    setSuppr({u,inventaire:data.inventaire});
  };

  // mode "garder_tontines" : le compte part, les tontines restent et attendent que la
  // personne se reinscrive avec le meme numero. mode "tout" : rien ne subsiste.
  const confirmerSuppression=async(mode)=>{
    if(!suppr)return;
    setSupprBusy(true);
    const {data,erreur}=await appelerFonctionAdmin({user_id:suppr.u.id,action:"supprimer",mode});
    setSupprBusy(false);
    if(erreur)return onToast(erreur,"error");
    setUsers(list=>list.filter(x=>x.id!==suppr.u.id));
    setSuppr(null);
    onToast(data?.message||"Compte supprime");
  };

  // --- Suppression d'UNE tontine (ciblee, sans toucher aux comptes) -----------
  // Repond au besoin des tontines de test : "Tout supprimer" via la suppression de compte
  // est refuse des qu'un groupe a plusieurs membres. Ici on efface une tontine precise et
  // tout son contenu (cascade + rappels + photos), en laissant les comptes des membres.
  const [supprTon,setSupprTon]=useState(null);       // {g, inventaire} -> fenetre de confirmation
  const [supprTonBusy,setSupprTonBusy]=useState(false);
  const appelerFonctionTontine=async(corps)=>{
    const {data,error}=await supabase.functions.invoke("admin-delete-tontine",{body:corps});
    if(!error)return{data,erreur:data?.error||null};
    let erreur=error.message||"Erreur inconnue";
    try{const detail=await error.context?.json();if(detail?.error)erreur=detail.error;}catch{}
    return{data:null,erreur};
  };
  const demanderApercuTontine=async(g)=>{
    setBusyId(g.id);
    const {data,erreur}=await appelerFonctionTontine({groupe_id:g.id,action:"apercu"});
    setBusyId(null);
    if(erreur)return onToast(erreur,"error");
    setSupprTon({g,inventaire:data.inventaire});
  };
  const confirmerSupprTontine=async()=>{
    if(!supprTon)return;
    setSupprTonBusy(true);
    const {data,erreur}=await appelerFonctionTontine({groupe_id:supprTon.g.id,action:"supprimer"});
    setSupprTonBusy(false);
    if(erreur)return onToast(erreur,"error");
    setTontinesList(list=>list.filter(x=>x.id!==supprTon.g.id));
    setGroupesCount(c=>Math.max(0,c-1));
    setSupprTon(null);
    onToast(data?.message||"Tontine supprimee");
  };

  return(
    <div style={{paddingBottom:90}}>
      <div style={{padding:"44px 16px 0",display:"flex",alignItems:"center",gap:10}}>
        <button onClick={onBack} style={{background:"none",border:"none",color:"#E8B04B",fontSize:22,cursor:"pointer"}}>←</button>
        <h2 style={{color:"#F5F2EA",fontSize:20,fontWeight:900,margin:0}}>Panneau Administrateur</h2>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,padding:"14px 16px 0"}}>
        {[["UTILISATRICES",totalUsers],["PREMIUM",totalPremium],["TONTINES CREEES",groupesCount],["TOTAL COLLECTE",fmtFCFA(totalCollecte)]].map(([l,v])=>(
          <div key={l} style={{background:"rgba(255,255,255,0.055)",border:"1px solid rgba(255,255,255,0.09)",borderRadius:14,padding:14}}>
            <p style={{margin:0,color:"#97A3C9",fontSize:11,fontWeight:600}}>{l}</p>
            <p style={{margin:"4px 0 0",color:"#E8B04B",fontSize:20,fontWeight:900}}>{v}</p>
          </div>
        ))}
      </div>
      <p style={{color:"#97A3C9",fontSize:12,fontWeight:700,margin:"18px 16px 8px",letterSpacing:.5}}>ACTIVITE (BASEE SUR LES CONNEXIONS)</p>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,padding:"0 16px"}}>
        {[["Aujourd'hui",connecteesAuj],["Hier",connecteesHier],["7 derniers jours",connecteesSemaine]].map(([l,v])=>(
          <div key={l} style={{background:"rgba(255,255,255,0.055)",border:"1px solid rgba(255,255,255,0.09)",borderRadius:12,padding:"10px 8px",textAlign:"center"}}>
            <p style={{margin:0,color:"#E8B04B",fontSize:18,fontWeight:900}}>{v}</p>
            <p style={{margin:"3px 0 0",color:"#97A3C9",fontSize:10}}>{l}</p>
          </div>
        ))}
      </div>
      <p style={{color:"#97A3C9",fontSize:12,fontWeight:700,margin:"18px 16px 8px",letterSpacing:.5}}>REVENUS (PAIEMENTS FEDAPAY REELS)</p>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,padding:"0 16px"}}>
        {[["Revenu total",fmtFCFA(revenuTotal)],["Ce mois-ci",fmtFCFA(revenuMois)],["Paiements reussis",paiementsAcceptes.length],["Paiements aujourd'hui",paiementsAuj]].map(([l,v])=>(
          <div key={l} style={{background:"rgba(255,255,255,0.055)",border:"1px solid rgba(255,255,255,0.09)",borderRadius:14,padding:14}}>
            <p style={{margin:0,color:"#97A3C9",fontSize:11,fontWeight:600}}>{l}</p>
            <p style={{margin:"4px 0 0",color:"#34D399",fontSize:18,fontWeight:900}}>{v}</p>
          </div>
        ))}
      </div>
      <div style={{margin:"12px 16px 0",background:"rgba(255,255,255,0.055)",border:"1px solid rgba(255,255,255,0.14)",borderRadius:12,padding:12}}>
        <p style={{margin:0,color:"#97A3C9",fontSize:11,lineHeight:1.6}}>✅ Toutes ces donnees sont desormais 100% reelles : tontines, membres, cotisations et paiements viennent directement de Supabase, tous comptes confondus. ℹ️ "Connectee" = derniere ouverture de l app, pas presence en direct.</p>
      </div>
      <div style={{padding:"18px 16px 0"}}>
        <p style={{color:"#97A3C9",fontSize:12,fontWeight:700,margin:"0 0 8px",letterSpacing:.5}}>TONTINES CREEES ({tontinesList.length}) - CREATRICES</p>
        {loading?<p style={{color:"#97A3C9",fontSize:13,textAlign:"center",marginTop:10}}>Chargement...</p>
        :tontinesList.length===0?<p style={{color:"#97A3C9",fontSize:13,textAlign:"center",marginTop:10}}>Aucune tontine creee pour le moment</p>
        :tontinesList.map(g=>(
          <div key={g.id} style={{background:"rgba(255,255,255,0.055)",border:"1px solid rgba(255,255,255,0.09)",borderRadius:12,padding:"12px 14px",marginBottom:8}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
              <div><p style={{margin:0,color:"#F5F2EA",fontWeight:700,fontSize:14}}>{g.nom}</p><p style={{margin:"2px 0 0",color:"#97A3C9",fontSize:11}}>Creee par {g.createurNom} ({g.createurTel})</p></div>
              <span style={{background:"rgba(255,255,255,0.09)",color:"#E8B04B",fontSize:10,fontWeight:700,padding:"3px 8px",borderRadius:99}}>{g.membresCount} membre(s)</span>
            </div>
            <div style={{display:"flex",justifyContent:"space-between",marginTop:8}}>
              <p style={{margin:0,color:"#97A3C9",fontSize:11}}>{fmtFCFA(g.montant)}/{g.frequence} - Cycle {g.cycle}/{g.total_cycles}</p>
              <p style={{margin:0,color:"#97A3C9",fontSize:11}}>{new Date(g.created_at).toLocaleDateString("fr-FR")}</p>
            </div>
            <button onClick={()=>demanderApercuTontine(g)} disabled={busyId===g.id} style={{width:"100%",marginTop:10,background:"transparent",border:"1px solid rgba(251,113,133,0.40)",borderRadius:10,padding:"7px 10px",color:"#FB7185",fontSize:11,fontWeight:700,cursor:"pointer"}}>
              {busyId===g.id?"...":"🗑 Supprimer cette tontine"}
            </button>
          </div>
        ))}
      </div>
      <div style={{padding:"14px 16px 0"}}>
        <p style={{color:"#97A3C9",fontSize:12,fontWeight:700,margin:"0 0 8px",letterSpacing:.5}}>UTILISATRICES INSCRITES</p>
        {loading?<p style={{color:"#97A3C9",fontSize:13,textAlign:"center",marginTop:20}}>Chargement...</p>
        :users.length===0?<p style={{color:"#97A3C9",fontSize:13,textAlign:"center",marginTop:20}}>Aucune utilisatrice pour le moment</p>
        :users.map(u=><div key={u.id} style={{background:"rgba(255,255,255,0.055)",border:"1px solid rgba(255,255,255,0.09)",borderRadius:12,padding:"12px 14px",marginBottom:8,display:"flex",gap:12,alignItems:"center",flexWrap:"wrap"}}>
          <Avatar prenom={u.prenom} photo={u.photo_url} size={38}/>
          <div style={{flex:1,minWidth:120}}>
            <p style={{margin:0,color:"#F5F2EA",fontWeight:700,fontSize:14}}>{u.prenom}{u.role==="admin"&&<span style={{marginLeft:6,color:"#E8B04B",fontSize:10,fontWeight:900}}>ADMIN</span>}</p>
            <p style={{margin:"2px 0 0",color:"#97A3C9",fontSize:12}}>{u.telephone}</p>
          </div>
          <span style={{background:u.plan==="premium"?"#E8B04B":"rgba(255,255,255,0.09)",color:u.plan==="premium"?"#1B1203":"#97A3C9",fontSize:10,fontWeight:700,padding:"3px 8px",borderRadius:99}}>{u.plan==="premium"?"PREMIUM":"GRATUIT"}</span>
          {u.plan==="premium"&&<span style={{color:u.premium_expire_le?"#97A3C9":"#FB7185",fontSize:10,fontWeight:700}}>{u.premium_expire_le?`jusqu'au ${new Date(u.premium_expire_le+"T00:00:00Z").toLocaleDateString("fr-FR")}`:"SANS DATE DE FIN"}</span>}
          <div style={{display:"flex",gap:6,width:"100%",marginTop:2}}>
            <button onClick={()=>togglePremium(u,30)} disabled={busyId===u.id} style={{flex:1,background:u.plan==="premium"?"transparent":"#E8B04B",border:`1px solid ${u.plan==="premium"?"#E0526A":"#E8B04B"}`,borderRadius:10,padding:"6px 10px",color:u.plan==="premium"?"#FB7185":"#1B1203",fontSize:11,fontWeight:700,cursor:"pointer"}}>{busyId===u.id?"...":u.plan==="premium"?"Repasser Gratuit":"+ 1 mois Premium"}</button>
            <button onClick={()=>togglePremium({...u,plan:"free"},365)} disabled={busyId===u.id} title="Activer ou prolonger d un an" style={{background:"rgba(255,255,255,0.09)",border:"1px solid #E8B04B",borderRadius:10,padding:"6px 10px",color:"#E8B04B",fontSize:11,fontWeight:700,cursor:"pointer"}}>+ 1 an</button>
            {u.id!==currentUserId&&<button onClick={()=>toggleAdmin(u)} disabled={busyId===u.id} style={{flex:1,background:u.role==="admin"?"transparent":"rgba(255,255,255,0.09)",border:`1px solid ${u.role==="admin"?"#E0526A":"rgba(255,255,255,0.14)"}`,borderRadius:10,padding:"6px 10px",color:u.role==="admin"?"#FB7185":"#E8B04B",fontSize:11,fontWeight:700,cursor:"pointer"}}>{busyId===u.id?"...":u.role==="admin"?"Retirer admin":"Nommer co-admin"}</button>}
          </div>
          {/* La suppression n'est proposee ni pour soi-meme (on se couperait l'acces),
              ni pour un autre admin (il faut d'abord lui retirer le role). */}
          {u.id!==currentUserId&&u.role!=="admin"&&
            <button onClick={()=>demanderApercuSuppression(u)} disabled={busyId===u.id} style={{width:"100%",background:"transparent",border:"1px solid rgba(251,113,133,0.40)",borderRadius:10,padding:"6px 10px",color:"#FB7185",fontSize:11,fontWeight:700,cursor:"pointer",marginTop:6}}>
              {busyId===u.id?"...":"🗑 Supprimer ce compte (libère le numéro)"}
            </button>}
        </div>)}
      </div>

      <div style={{padding:"24px 16px 0"}}>
        <p style={{color:"#97A3C9",fontSize:12,fontWeight:700,margin:"0 0 8px",letterSpacing:.5}}>MON COMPTE</p>
        <div onClick={()=>setShowChangePinAdmin(true)} style={{display:"flex",alignItems:"center",gap:14,padding:"14px 16px",background:"rgba(255,255,255,0.055)",borderRadius:14,cursor:"pointer",border:"1px solid rgba(255,255,255,0.09)"}}>
          <span style={{fontSize:20}}>🔒</span><p style={{margin:0,color:"#F5F2EA",fontSize:14,fontWeight:600}}>Changer mon PIN</p><span style={{marginLeft:"auto",color:"#6F7BA6",fontSize:18}}>›</span>
        </div>
      </div>

      <div style={{padding:"24px 16px 40px"}}>
        <p style={{color:"#FB7185",fontSize:12,fontWeight:700,margin:"0 0 8px",letterSpacing:.5}}>ZONE DANGEREUSE</p>
        <div style={{background:"rgba(251,113,133,0.10)",border:"1px solid #E0526A",borderRadius:14,padding:16}}>
          <p style={{margin:"0 0 10px",color:"#F5F2EA",fontSize:13,lineHeight:1.6}}>Efface TOUTES les tontines, cagnottes, epargnes, messages et comptes de test. Tes 2 numeros admin sont toujours conserves. Action irreversible.</p>
          {codeSecu1&&codeSecu2?<>
            <button onClick={()=>setShowReset(true)} style={{width:"100%",background:"transparent",border:"1px solid #FB7185",borderRadius:10,padding:"11px",color:"#FB7185",fontWeight:700,fontSize:13,cursor:"pointer"}}>🗑️ Remettre toutes les donnees a zero</button>
            <button onClick={()=>setShowConfigCodes(true)} style={{width:"100%",background:"transparent",border:"none",color:"#97A3C9",fontSize:11,padding:"10px 0 0",cursor:"pointer"}}>🔑 Modifier mes 2 codes de securite</button>
          </>:<button onClick={()=>setShowConfigCodes(true)} style={{width:"100%",background:"rgba(255,255,255,0.09)",border:"1px solid #E8B04B",borderRadius:10,padding:"11px",color:"#E8B04B",fontWeight:700,fontSize:13,cursor:"pointer"}}>🔑 Configurer mes 2 codes de securite d abord</button>}
        </div>
      </div>

      {showChangePinAdmin&&<Modal onClose={()=>setShowChangePinAdmin(false)}>
        <MH title="Changer mon PIN" onClose={()=>setShowChangePinAdmin(false)}/>
        <Fld label="PIN actuel"><Inp value={oldPinA} onChange={e=>setOldPinA(e.target.value.replace(/\D/g,"").slice(0,4))} placeholder="****" type="password" inputMode="numeric" maxLength={4} autoFocus/></Fld>
        <Fld label="Nouveau PIN"><Inp value={newPinA} onChange={e=>setNewPinA(e.target.value.replace(/\D/g,"").slice(0,4))} placeholder="****" type="password" inputMode="numeric" maxLength={4}/></Fld>
        <Fld label="Confirme le nouveau PIN"><Inp value={newPinA2} onChange={e=>setNewPinA2(e.target.value.replace(/\D/g,"").slice(0,4))} placeholder="****" type="password" inputMode="numeric" maxLength={4}/></Fld>
        <ErrBox msg={pinErrA}/>
        <Btn onClick={soumettreChangePinAdmin} disabled={pinBusyA}>{pinBusyA?"Vérification...":"Confirmer le changement"}</Btn>
      </Modal>}

      {showConfigCodes&&<Modal onClose={()=>setShowConfigCodes(false)}>
        <MH title="Mes 2 codes de securite" onClose={()=>setShowConfigCodes(false)}/>
        <p style={{color:"#97A3C9",fontSize:12,marginBottom:16,lineHeight:1.5}}>Ces 2 codes te seront redemandes avant toute remise a zero complete. Choisis 2 codes differents que toi seul connais (ex: un mot et un chiffre).</p>
        <Fld label="Code de securite 1"><Inp value={nc1} onChange={e=>setNc1(e.target.value)} placeholder="Ex: Bamako2026" autoFocus/></Fld>
        <Fld label="Code de securite 2"><Inp value={nc2} onChange={e=>setNc2(e.target.value)} placeholder="Ex: 7690"/></Fld>
        <Btn onClick={enregistrerCodes} disabled={configBusy}>{configBusy?"Enregistrement...":"Enregistrer mes codes"}</Btn>
      </Modal>}

      {showReset&&<Modal onClose={()=>setShowReset(false)}>
        <MH title="Remise à zéro complète" onClose={()=>setShowReset(false)}/>
        <p style={{color:"#FB7185",fontSize:13,lineHeight:1.6,marginBottom:16}}>⚠️ Ceci va supprimer definitivement toutes les tontines, cagnottes, epargnes, messages et comptes de test. Seuls tes 2 numeros admin resteront. Cette action est irreversible.</p>
        <Fld label="Code de securite 1"><Inp value={saisieCode1} onChange={e=>setSaisieCode1(e.target.value)} placeholder="Ton 1er code" autoFocus/></Fld>
        <Fld label="Code de securite 2"><Inp value={saisieCode2} onChange={e=>setSaisieCode2(e.target.value)} placeholder="Ton 2eme code"/></Fld>
        <Fld label='Tape "SUPPRIMER" pour confirmer'><Inp value={confirmReset} onChange={e=>setConfirmReset(e.target.value)} placeholder="SUPPRIMER"/></Fld>
        <button onClick={executerReset} disabled={resetBusy} style={{width:"100%",background:"#E0526A",border:"none",borderRadius:14,padding:"14px",color:"#fff",fontWeight:800,fontSize:14,cursor:"pointer"}}>{resetBusy?"Suppression en cours...":"Tout supprimer definitivement"}</button>
        {resetJournal&&<div style={{marginTop:16,background:"rgba(255,255,255,0.055)",border:"1px solid rgba(255,255,255,0.14)",borderRadius:12,padding:14}}>
          <p style={{margin:"0 0 8px",color:"#E8B04B",fontSize:11,fontWeight:700,letterSpacing:.5}}>JOURNAL DETAILLE</p>
          {resetJournal.map((l,i)=><p key={i} style={{margin:"0 0 4px",color:l.includes("ERREUR")?"#FB7185":"#97A3C9",fontSize:11,fontFamily:"monospace"}}>{l}</p>)}
        </div>}
      </Modal>}

      {/* Confirmation de suppression d'un compte : on montre TOUJOURS ce qui va etre
          efface avant d'effacer. L'inventaire vient du serveur, pas de l'application. */}
      {suppr&&<Modal onClose={()=>!supprBusy&&setSuppr(null)}>
        <MH title="Supprimer ce compte" onClose={()=>!supprBusy&&setSuppr(null)}/>
        <div style={{background:"rgba(255,255,255,0.055)",border:"1px solid rgba(255,255,255,0.09)",borderRadius:12,padding:"12px 14px",marginBottom:14}}>
          <p style={{margin:0,color:"#F5F2EA",fontWeight:800,fontSize:15}}>{suppr.inventaire.prenom}</p>
          <p style={{margin:"2px 0 0",color:"#97A3C9",fontSize:12}}>{suppr.inventaire.telephone}</p>
          {suppr.inventaire.inscrit_le&&<p style={{margin:"2px 0 0",color:"#6F7BA6",fontSize:11}}>Inscrit le {new Date(suppr.inventaire.inscrit_le).toLocaleDateString("fr-FR")}</p>}
        </div>

        <p style={{color:"#97A3C9",fontSize:12,fontWeight:700,margin:"0 0 6px",letterSpacing:.5}}>CE QUI EST RATTACHÉ À CE COMPTE</p>
        <div style={{background:"rgba(251,113,133,0.10)",border:"1px solid rgba(251,113,133,0.40)",borderRadius:12,padding:"10px 14px",marginBottom:14}}>
          {[["Tontines qu'elle dirige",suppr.inventaire.tontines_possedees?.length||0],
            ["Cagnottes",suppr.inventaire.cagnottes],
            ["Objectifs d'épargne",suppr.inventaire.objectifs_epargne],
            ["Messages envoyés",suppr.inventaire.messages_envoyes],
            ["Paiements enregistrés",suppr.inventaire.paiements]].map(([l,v])=>(
            <div key={l} style={{display:"flex",justifyContent:"space-between",padding:"3px 0"}}>
              <span style={{color:"#97A3C9",fontSize:12}}>{l}</span>
              <span style={{color:v>0?"#FB7185":"#6F7BA6",fontSize:12,fontWeight:700}}>{v}</span>
            </div>))}
        </div>

        {suppr.inventaire.participations>0&&
          <p style={{color:"#97A3C9",fontSize:11.5,lineHeight:1.5,marginBottom:14}}>
            Elle figure dans <strong>{suppr.inventaire.participations}</strong> tontine(s) tenue(s) par quelqu'un d'autre.
            Son nom et ses versements y <strong>resteront visibles</strong> : ils font partie des comptes du groupe.
            Seul le lien avec son compte est retiré.
          </p>}

        <p style={{color:"#FB7185",fontSize:12,fontWeight:600,lineHeight:1.5,marginBottom:14}}>
          ⚠️ Action irréversible. Dans les deux cas le numéro <strong>{suppr.inventaire.telephone}</strong> est libéré :
          cette personne pourra se réinscrire.
        </p>

        {/* Deux facons de supprimer. La premiere ne detruit rien d'irremplacable et est
            donc mise en avant ; la seconde efface aussi les tontines et reste discrete. */}
        {(suppr.inventaire.tontines_possedees?.length>0)
          ? <>
              <button onClick={()=>confirmerSuppression("garder_tontines")} disabled={supprBusy} style={{width:"100%",background:"#E8B04B",border:"none",borderRadius:12,padding:"13px",color:"#1B1203",fontWeight:800,fontSize:13,cursor:"pointer"}}>
                {supprBusy?"Suppression...":"Supprimer le compte, GARDER les tontines"}
              </button>
              <p style={{color:"#97A3C9",fontSize:11.5,lineHeight:1.5,margin:"7px 0 14px"}}>
                Ses {suppr.inventaire.tontines_possedees.length} tontine(s) continuent d'exister et les autres membres
                gardent tout leur historique. En se réinscrivant avec le <strong>même numéro</strong>, elle les retrouvera
                automatiquement, comme avant.
              </p>

              <button onClick={()=>confirmerSuppression("tout")} disabled={supprBusy} style={{width:"100%",background:"transparent",border:"1px solid #E0526A",borderRadius:12,padding:"11px",color:"#FB7185",fontWeight:700,fontSize:12.5,cursor:"pointer"}}>
                {supprBusy?"...":"Tout supprimer, y compris les tontines"}
              </button>
              <p style={{color:"#97A3C9",fontSize:11.5,lineHeight:1.5,margin:"7px 0 14px"}}>
                À réserver aux tontines de test.
                {suppr.inventaire.tontines_vivantes?.length>0
                  ? <> Refusé ici : {suppr.inventaire.tontines_vivantes.map(t=>`"${t.nom}" compte ${t.membres} membres`).join(", ")}, et cela effacerait l'argent enregistré de tout le groupe.</>
                  : " Les versements enregistrés seraient perdus."}
              </p>
            </>
          : <button onClick={()=>confirmerSuppression("garder_tontines")} disabled={supprBusy} style={{width:"100%",background:"#E0526A",border:"none",borderRadius:12,padding:"13px",color:"#fff",fontWeight:800,fontSize:13,cursor:"pointer",marginBottom:14}}>
              {supprBusy?"Suppression...":"Supprimer définitivement"}
            </button>}

        <button onClick={()=>setSuppr(null)} disabled={supprBusy} style={{width:"100%",background:"transparent",border:"1px solid rgba(255,255,255,0.14)",borderRadius:12,padding:"12px",color:"#97A3C9",fontWeight:700,fontSize:13,cursor:"pointer"}}>Annuler</button>
      </Modal>}

      {/* Confirmation de suppression d'UNE tontine. On montre TOUJOURS ce qui va etre
          efface avant d'effacer. L'inventaire vient du serveur, pas de l'application. */}
      {supprTon&&<Modal onClose={()=>!supprTonBusy&&setSupprTon(null)}>
        <MH title="Supprimer cette tontine" onClose={()=>!supprTonBusy&&setSupprTon(null)}/>
        <div style={{background:"rgba(255,255,255,0.055)",border:"1px solid rgba(255,255,255,0.09)",borderRadius:12,padding:"12px 14px",marginBottom:14}}>
          <p style={{margin:0,color:"#F5F2EA",fontWeight:800,fontSize:15}}>{supprTon.inventaire.nom}</p>
        </div>
        <p style={{color:"#97A3C9",fontSize:12,fontWeight:700,margin:"0 0 6px",letterSpacing:.5}}>CE QUI SERA EFFACÉ</p>
        <div style={{background:"rgba(251,113,133,0.10)",border:"1px solid rgba(251,113,133,0.40)",borderRadius:12,padding:"10px 14px",marginBottom:14}}>
          {[["Membres",supprTon.inventaire.membres],
            ["Cotisations enregistrées",supprTon.inventaire.transactions],
            ["Prêts",supprTon.inventaire.prets],
            ["Messages",supprTon.inventaire.messages]].map(([l,v])=>(
            <div key={l} style={{display:"flex",justifyContent:"space-between",padding:"3px 0"}}>
              <span style={{color:"#97A3C9",fontSize:12}}>{l}</span>
              <span style={{color:v>0?"#FB7185":"#6F7BA6",fontSize:12,fontWeight:700}}>{v}</span>
            </div>))}
        </div>
        <p style={{color:"#FB7185",fontSize:12,fontWeight:600,lineHeight:1.5,marginBottom:14}}>
          ⚠️ Action irréversible. La tontine et tout son historique (cotisations, prêts, messages, photos) seront supprimés.
          Les <strong>comptes</strong> des membres, eux, ne sont pas touchés.
        </p>
        <button onClick={confirmerSupprTontine} disabled={supprTonBusy} style={{width:"100%",background:"#E0526A",border:"none",borderRadius:12,padding:"13px",color:"#fff",fontWeight:800,fontSize:13,cursor:"pointer",marginBottom:10}}>
          {supprTonBusy?"Suppression...":"Supprimer définitivement cette tontine"}
        </button>
        <button onClick={()=>setSupprTon(null)} disabled={supprTonBusy} style={{width:"100%",background:"transparent",border:"1px solid rgba(255,255,255,0.14)",borderRadius:12,padding:"12px",color:"#97A3C9",fontWeight:700,fontSize:13,cursor:"pointer"}}>Annuler</button>
      </Modal>}
    </div>
  );
};

const VAPID_PUBLIC_KEY="BCkH2-70XXEE0xobtKRkfBGuwUWpTh_GBrIXVvJ4dGvql0ZUxVrtzRwCv23hRPqYBcufOvgZhepTIqWjwq4zjTw";
const urlBase64ToUint8Array=(base64String)=>{
  const padding="=".repeat((4-base64String.length%4)%4);
  const base64=(base64String+padding).replace(/-/g,"+").replace(/_/g,"/");
  const rawData=atob(base64);
  return Uint8Array.from([...rawData].map(c=>c.charCodeAt(0)));
};

const ProfilScreen = ({user,onLogout,onToast,onUpgrade,onOpenAdmin,lang,onChangeLang,onUpdateUser}) => {
  const [payBusy,setPayBusy]=useState(false);
  const [parrainages,setParrainages]=useState([]);
  useEffect(()=>{
    (async()=>{
      const {data}=await supabase.from("parrainages").select("*").eq("parrain_id",user.id);
      setParrainages(data||[]);
    })();
  },[user.id]);

  // --- Modifier mon profil -------------------------------------------------------
  // A l'inscription, beaucoup de personnes oublient leur photo ou ne mettent que leur
  // prenom. Elles peuvent desormais completer leurs informations apres coup.
  const [showEditProfil,setShowEditProfil]=useState(false);
  const [editNom,setEditNom]=useState(user.prenom||"");
  const [editPhotoFile,setEditPhotoFile]=useState(null);
  const [editPhotoPreview,setEditPhotoPreview]=useState(null);
  const [editProfilBusy,setEditProfilBusy]=useState(false);
  const [editProfilErr,setEditProfilErr]=useState("");

  const ouvrirEditProfil=()=>{
    setEditNom(user.prenom||"");
    setEditPhotoFile(null);setEditPhotoPreview(null);setEditProfilErr("");
    setShowEditProfil(true);
  };

  const choisirPhotoProfil=(e)=>{
    const f=e.target.files?.[0];if(!f)return;
    if(f.size>8*1024*1024)return setEditProfilErr("Photo trop lourde (8 Mo maximum)");
    setEditProfilErr("");
    setEditPhotoFile(f);
    const reader=new FileReader();
    reader.onload=()=>setEditPhotoPreview(reader.result);
    reader.readAsDataURL(f);
  };

  const enregistrerProfil=async()=>{
    const nom=s(editNom.trim());
    if(nom.length<2)return setEditProfilErr("Ton nom doit contenir au moins 2 caracteres");
    setEditProfilBusy(true);setEditProfilErr("");
    const maj={prenom:nom};
    if(editPhotoFile){
      try{
        const blob=await compressImage(editPhotoFile,TAILLE_AVATAR,QUALITE_AVATAR);
        maj.photo_url=await uploadPhoto(new File([blob],"profil.jpg",{type:"image/jpeg"}),"users");
      }catch{
        setEditProfilBusy(false);
        return setEditProfilErr("L envoi de la photo a echoue, reessaie avec une autre image");
      }
    }
    const {error}=await supabase.from("users").update(maj).eq("id",user.id);
    setEditProfilBusy(false);
    if(error)return setEditProfilErr("Enregistrement impossible : "+(error.message||"erreur inconnue"));
    onUpdateUser({prenom:nom,...(maj.photo_url?{photo:maj.photo_url}:{})});
    setShowEditProfil(false);
    onToast("Profil mis a jour !");
  };

  // --- Trombinoscope : les membres de chaque tontine ou je suis impliquee ---------
  // (celles que j'ai creees + celles ou je suis simplement participante)
  const [tontinesMembres,setTontinesMembres]=useState([]);
  const [membresLoading,setMembresLoading]=useState(true);
  const [tontineOuverte,setTontineOuverte]=useState(null);
  useEffect(()=>{
    (async()=>{
      setMembresLoading(true);
      const [{data:miennes},{data:mesLignes}]=await Promise.all([
        supabase.from("groupes").select("id,nom,couleur").eq("user_id",user.id),
        supabase.from("membres").select("groupe_id").eq("user_id",user.id),
      ]);
      const ids=[...new Set([...(miennes||[]).map(g=>g.id),...(mesLignes||[]).map(m=>m.groupe_id)])];
      if(ids.length===0){setTontinesMembres([]);setMembresLoading(false);return;}
      const {data:groupes}=await supabase.from("groupes").select("id,nom,couleur").in("id",ids);
      const {data:membres}=await supabase.from("membres").select("id,groupe_id,prenom,quartier,tel,photo_url,created_at,user_id").in("groupe_id",ids).order("created_at",{ascending:true});
      setTontinesMembres((groupes||[]).map(g=>({
        ...g,
        membres:(membres||[]).filter(m=>m.groupe_id===g.id),
      })).sort((a,b)=>a.nom.localeCompare(b.nom)));
      setMembresLoading(false);
    })();
  },[user.id]);
  const partagerCode=()=>{
    const msg=encodeURIComponent(`Rejoins-moi sur THT pour gerer tes tontines simplement !\n\nUtilise mon code de parrainage a l inscription : ${user.parrainCode}\n\nhttps://tontine.kbsdigitalagency.com`);
    window.open(`https://wa.me/?text=${msg}`,"_blank");
  };
  const exporterDonnees=async()=>{
    onToast("Preparation de l export...");
    const [{data:groupes},{data:cagnottes},{data:objectifs}]=await Promise.all([
      supabase.from("groupes").select("*").eq("user_id",user.id),
      supabase.from("cagnottes").select("*").eq("user_id",user.id),
      supabase.from("objectifs").select("*").eq("user_id",user.id),
    ]);
    const groupeIds=(groupes||[]).map(g=>g.id);
    const {data:membres}=groupeIds.length>0?await supabase.from("membres").select("*").in("groupe_id",groupeIds):{data:[]};
    const {data:transactions}=groupeIds.length>0?await supabase.from("transactions").select("*").in("groupe_id",groupeIds):{data:[]};
    const payload={
      exporte_le:new Date().toISOString(),
      profil:{prenom:user.prenom,telephone:user.tel,plan:user.plan},
      tontines:groupes||[],
      membres:membres||[],
      transactions:transactions||[],
      cagnottes:cagnottes||[],
      epargne:objectifs||[],
    };
    const blob=new Blob([JSON.stringify(payload,null,2)],{type:"application/json"});
    const url=URL.createObjectURL(blob);
    const a=document.createElement("a");
    a.href=url;a.download=`haby-tontine-donnees-${new Date().toISOString().split("T")[0]}.json`;
    document.body.appendChild(a);a.click();a.remove();
    URL.revokeObjectURL(url);
    onToast("Donnees telechargees !");
  };
  const exporterCSV=async()=>{
    onToast("Preparation du fichier Excel...");
    const {data:groupes}=await supabase.from("groupes").select("id,nom").eq("user_id",user.id);
    const groupeIds=(groupes||[]).map(g=>g.id);
    const {data:membres}=groupeIds.length>0?await supabase.from("membres").select("*").in("groupe_id",groupeIds):{data:[]};
    const nomParGroupe=Object.fromEntries((groupes||[]).map(g=>[g.id,g.nom]));
    const lignes=[["Tontine","Membre","Telephone","Quartier","Montant du (FCFA)","Verse (FCFA)","Statut","Cycles payes"]];
    (membres||[]).forEach(m=>{
      lignes.push([nomParGroupe[m.groupe_id]||"",m.prenom,m.tel,m.quartier||"",m.montant_perso||"",m.versements||0,m.paye?"Paye":"En retard",m.cycles_paies||0]);
    });
    const csv=lignes.map(l=>l.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(",")).join("\n");
    const blob2=new Blob(["\uFEFF"+csv],{type:"text/csv;charset=utf-8"});
    const url2=URL.createObjectURL(blob2);
    const a2=document.createElement("a");
    a2.href=url2;a2.download=`haby-tontine-membres-${new Date().toISOString().split("T")[0]}.csv`;
    document.body.appendChild(a2);a2.click();a2.remove();
    URL.revokeObjectURL(url2);
    onToast("Fichier Excel telecharge !");
  };
  // formule : "mensuel" (1 000 FCFA / 30 jours) ou "annuel" (10 000 FCFA / 365 jours).
  // Avant, les deux boutons appelaient le paiement sans preciser la formule : celui
  // affiche "10 000/an" facturait en realite 1 000 FCFA.
  const onPayCinetPay=async(formule="mensuel")=>{
    setPayBusy(true);
    await payerAbonnement(user,formule,(m)=>onToast(m,"error"));
    setPayBusy(false);
  };
  const [showOut,setShowOut]=useState(false);
  const [showSupport,setShowSupport]=useState(false);
  const [showChangePin,setShowChangePin]=useState(false);
  const [oldPin,setOldPin]=useState("");
  const [newPin,setNewPin]=useState("");
  const [newPin2,setNewPin2]=useState("");
  const [pinErr,setPinErr]=useState("");
  const [pinBusy,setPinBusy]=useState(false);
  const soumettreChangePin=async()=>{
    setPinErr("");
    if(oldPin.length!==4)return setPinErr("PIN actuel : 4 chiffres requis");
    if(newPin.length!==4)return setPinErr("Nouveau PIN : 4 chiffres requis");
    if(newPin!==newPin2)return setPinErr("Les deux nouveaux PIN ne correspondent pas");
    if(newPin===oldPin)return setPinErr("Le nouveau PIN doit etre different de l ancien");
    setPinBusy(true);
    const res=await changePin(user.tel,oldPin,newPin);
    setPinBusy(false);
    if(!res.ok)return setPinErr(res.err);
    setShowChangePin(false);setOldPin("");setNewPin("");setNewPin2("");
    onToast("PIN change avec succes !");
  };
  const [notifBusy,setNotifBusy]=useState(false);
  const [notifOn,setNotifOn]=useState(false);
  useEffect(()=>{
    (async()=>{
      if(!("serviceWorker" in navigator)||!("PushManager" in window))return;
      try{
        const reg=await navigator.serviceWorker.getRegistration("/sw.js");
        const sub=reg&&await reg.pushManager.getSubscription();
        setNotifOn(!!sub&&Notification.permission==="granted");
      }catch{}
    })();
  },[]);
  const toggleNotifications=async()=>{
    if(!("serviceWorker" in navigator)||!("PushManager" in window))return onToast("Notifications non supportees sur ce navigateur","error");
    setNotifBusy(true);
    try{
      if(notifOn){
        const reg=await navigator.serviceWorker.getRegistration("/sw.js");
        const sub=reg&&await reg.pushManager.getSubscription();
        if(sub)await sub.unsubscribe();
        await supabase.from("push_subscriptions").delete().eq("user_id",user.id);
        setNotifOn(false);setNotifBusy(false);
        onToast("Notifications désactivées");
        return;
      }
      const perm=await Notification.requestPermission();
      if(perm!=="granted"){setNotifBusy(false);return onToast("Autorisation refusee","error");}
      const reg=await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      const sub=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:urlBase64ToUint8Array(VAPID_PUBLIC_KEY)});
      const {error}=await supabase.from("push_subscriptions").upsert({user_id:user.id,subscription:sub.toJSON()},{onConflict:"user_id"});
      if(error){setNotifBusy(false);return onToast("Impossible d activer les notifications","error");}
      const {data,error:pushErr}=await supabase.functions.invoke("send-push",{body:{user_id:user.id,title:"THT",body:"Notifications activees avec succes !"}});
      setNotifOn(true);setNotifBusy(false);
      if(pushErr||data?.error)return onToast("Active, mais l envoi test a echoue : "+(data?.error||pushErr?.message||"erreur"),"error");
      onToast("Notifications activées ! Elles resteront actives jusqu'à ce que tu les désactives.");
    }catch(e){setNotifBusy(false);onToast("Erreur : "+(e.message||"inconnue"),"error");}
  };
  return(
    <div style={{paddingBottom:90}}>
      <div style={{background:"linear-gradient(135deg,rgba(255,255,255,0.055),rgba(255,255,255,0.09))",padding:"44px 20px 30px"}}>
        <h2 style={{color:"#F5F2EA",margin:"0 0 20px",fontSize:20,fontWeight:800}}>{t("profil")}</h2>
        <div style={{display:"flex",alignItems:"center",gap:16}}>
          <div onClick={ouvrirEditProfil} style={{position:"relative",cursor:"pointer",flexShrink:0}} title="Modifier ma photo">
            <Avatar prenom={user.prenom} photo={user.photo} size={76} gold/>
            {!user.photo&&<span style={{position:"absolute",right:-2,bottom:-2,background:"#E8B04B",color:"#1B1203",fontSize:13,width:26,height:26,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",border:"2px solid #0B1433"}}>📷</span>}
          </div>
          <div style={{minWidth:0}}>
            <p style={{margin:0,color:"#F5F2EA",fontSize:20,fontWeight:900}}>{user.prenom}</p>
            <p style={{margin:"3px 0 0",color:"#97A3C9",fontSize:13}}>{user.tel}</p>
            <span style={{background:premiumActif(user)?"#E8B04B":"rgba(255,255,255,0.09)",color:premiumActif(user)?"#1B1203":"#E8B04B",fontSize:11,fontWeight:700,padding:"3px 10px",borderRadius:99,marginTop:6,display:"inline-block"}}>{premiumActif(user)?t("premium"):t("gratuit")}</span>
            {/* Rappel de la date de fin : sans elle, personne ne sait quand renouveler. */}
            {premiumActif(user)&&user.premiumExpireLe&&<p style={{margin:"5px 0 0",color:"#97A3C9",fontSize:11}}>Abonnement valable jusqu au {new Date(user.premiumExpireLe+"T00:00:00Z").toLocaleDateString("fr-FR")}</p>}
          </div>
        </div>
        <button onClick={ouvrirEditProfil} style={{width:"100%",marginTop:16,background:"rgba(255,255,255,0.055)",border:"1px solid #E8B04B",borderRadius:12,padding:"11px",color:"#E8B04B",fontWeight:800,fontSize:13,cursor:"pointer"}}>✏️ Modifier mon profil</button>
        {!user.photo&&<p style={{margin:"8px 0 0",color:"#FFE1A1",fontSize:11.5,textAlign:"center"}}>Ajoute ta photo pour que les membres te reconnaissent facilement.</p>}
      </div>
      <div style={{padding:"16px 16px 0"}}>
        <div style={{background:"rgba(255,255,255,0.055)",border:"1px solid rgba(255,255,255,0.09)",borderRadius:14,padding:14,marginBottom:16}}>
          <p style={{margin:"0 0 10px",color:"#97A3C9",fontSize:12,fontWeight:700}}>{t("langue")}</p>
          <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
            {[["fr","Francais"],["en","English"],["bm","Bamanankan"],["ar","العربية"]].map(([code,label])=>(
              <button key={code} onClick={()=>onChangeLang(code)} style={{flex:"1 1 45%",minWidth:90,padding:"10px 4px",borderRadius:10,border:"1px solid",cursor:"pointer",fontSize:12,fontWeight:700,background:lang===code?"#E8B04B":"rgba(255,255,255,0.09)",color:lang===code?"#1B1203":"#F5F2EA",borderColor:lang===code?"#E8B04B":"rgba(255,255,255,0.14)"}}>{label}</button>
            ))}
          </div>
        </div>
        {/* Trombinoscope des membres, tontine par tontine (repliable). */}
        <div style={{background:"rgba(255,255,255,0.055)",border:"1px solid rgba(255,255,255,0.09)",borderRadius:14,padding:14,marginBottom:16}}>
          <p style={{margin:"0 0 4px",color:"#F5F2EA",fontWeight:800,fontSize:15}}>👥 Membres de la tontine</p>
          <p style={{margin:"0 0 12px",color:"#97A3C9",fontSize:12,lineHeight:1.5}}>Toutes les personnes qui participent aux tontines dont tu fais partie.</p>
          {membresLoading?<p style={{color:"#97A3C9",fontSize:13,margin:0,textAlign:"center",padding:"10px 0"}}>Chargement...</p>
          :tontinesMembres.length===0?<p style={{color:"#97A3C9",fontSize:13,margin:0,textAlign:"center",padding:"10px 0"}}>Tu ne participes à aucune tontine pour le moment.</p>
          :tontinesMembres.map(tg=>(
            <div key={tg.id} style={{border:"1px solid rgba(255,255,255,0.09)",borderRadius:12,marginBottom:8,overflow:"hidden"}}>
              <button onClick={()=>setTontineOuverte(o=>o===tg.id?null:tg.id)} style={{width:"100%",display:"flex",alignItems:"center",justifyContent:"space-between",gap:8,background:"rgba(255,255,255,0.03)",border:"none",padding:"11px 13px",cursor:"pointer",textAlign:"left"}}>
                <span style={{display:"flex",alignItems:"center",gap:8,minWidth:0}}>
                  <span style={{width:10,height:10,borderRadius:"50%",background:tg.couleur||"#E8B04B",flexShrink:0}}/>
                  <span style={{color:"#F5F2EA",fontWeight:700,fontSize:13,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{tg.nom}</span>
                </span>
                <span style={{color:"#97A3C9",fontSize:11,fontWeight:700,flexShrink:0}}>{tg.membres.length} membre{tg.membres.length>1?"s":""} {tontineOuverte===tg.id?"▲":"▼"}</span>
              </button>
              {tontineOuverte===tg.id&&<div style={{padding:"6px 13px 12px"}}>
                {tg.membres.length===0?<p style={{color:"#97A3C9",fontSize:12,margin:"8px 0 0"}}>Aucun membre enregistré.</p>
                :tg.membres.map(mb=>(
                  <div key={mb.id} style={{display:"flex",alignItems:"center",gap:11,padding:"9px 0",borderBottom:"1px solid rgba(255,255,255,0.045)"}}>
                    <Avatar prenom={mb.prenom} photo={mb.photo_url} size={42}/>
                    <div style={{flex:1,minWidth:0}}>
                      <p style={{margin:0,color:"#F5F2EA",fontWeight:700,fontSize:13}}>{mb.prenom}{mb.user_id===user.id?" (toi)":""}</p>
                      <p style={{margin:"1px 0 0",color:"#E8B04B",fontSize:11,fontWeight:600}}>📍 {mb.quartier?mb.quartier:"Quartier non renseigné"}</p>
                      <p style={{margin:"1px 0 0",color:"#97A3C9",fontSize:11}}>🗓️ Ajouté(e) le {mb.created_at?new Date(mb.created_at).toLocaleDateString("fr-FR",{day:"2-digit",month:"2-digit",year:"numeric"}):"date inconnue"}</p>
                    </div>
                  </div>
                ))}
              </div>}
            </div>
          ))}
        </div>
        <div style={{background:"rgba(255,255,255,0.055)",border:"1px solid #E8B04B",borderRadius:14,padding:16,marginBottom:16}}>
          <p style={{margin:"0 0 6px",color:"#E8B04B",fontWeight:800,fontSize:15}}>🎁 Parraine et gagne du Premium</p>
          <p style={{margin:"0 0 12px",color:"#97A3C9",fontSize:12,lineHeight:1.6}}>Chaque filleul(e) qui passe Premium te fait gagner 1 mois gratuit, cumulable !</p>
          <div style={{background:"rgba(255,255,255,0.055)",borderRadius:10,padding:"12px 14px",display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
            <p style={{margin:0,color:"#F5F2EA",fontSize:18,fontWeight:900,letterSpacing:2}}>{user.parrainCode||"..."}</p>
            <span style={{color:"#97A3C9",fontSize:11}}>Ton code</span>
          </div>
          <div style={{display:"flex",gap:16,marginBottom:12}}>
            <div><p style={{margin:0,color:"#97A3C9",fontSize:11}}>Inscrit(e)s grace a toi</p><p style={{margin:"2px 0 0",color:"#F5F2EA",fontWeight:800,fontSize:16}}>{parrainages.length}</p></div>
            <div><p style={{margin:0,color:"#97A3C9",fontSize:11}}>Devenus Premium</p><p style={{margin:"2px 0 0",color:"#34D399",fontWeight:800,fontSize:16}}>{parrainages.filter(p=>p.statut==="premium").length}</p></div>
          </div>
          {/* Phrase explicite : on dit noir sur blanc combien de personnes ont rejoint
              l'application grace au code, plutot qu'un simple chiffre sans contexte. */}
          <div style={{background:"rgba(255,255,255,0.055)",borderRadius:10,padding:"10px 12px",marginBottom:10,border:"1px solid rgba(255,255,255,0.09)"}}>
            {parrainages.length===0
              ? <p style={{margin:0,color:"#97A3C9",fontSize:12.5,lineHeight:1.5}}>Personne n a encore rejoint THT avec ton code. Partage-le pour commencer a gagner des places !</p>
              : <p style={{margin:0,color:"#F5F2EA",fontSize:12.5,lineHeight:1.5}}>✅ <strong>{parrainages.length} personne{parrainages.length>1?"s ont":" a"} rejoint THT</strong> grace a ton code de parrainage.</p>}
          </div>
          {!estIllimite(user)&&(()=>{
            const filleuls=user.filleulsCount||0;
            const bonus=bonusParrainage(user);
            const manque=FILLEULS_PAR_MEMBRE_BONUS-(filleuls%FILLEULS_PAR_MEMBRE_BONUS);
            return(
              <div style={{background:"rgba(232,176,75,0.10)",border:"1px solid #E8B04B",borderRadius:10,padding:"10px 12px",marginBottom:10}}>
                <p style={{margin:0,color:"#FFE1A1",fontSize:12,fontWeight:700}}>👥 Chaque {FILLEULS_PAR_MEMBRE_BONUS} filleul(e)s inscrit(e)s = +1 place dans ta tontine</p>
                <p style={{margin:"5px 0 0",color:"#F5F2EA",fontSize:12}}>Tu peux ajouter <strong>{limiteMembres(user)} membres</strong> {bonus>0?<>(15 de base <strong style={{color:"#34D399"}}>+{bonus} gagnée{bonus>1?"s":""}</strong>)</>:"pour l instant"}.</p>
                <p style={{margin:"3px 0 0",color:"#97A3C9",fontSize:11}}>Encore {manque} filleul(e){manque>1?"s":""} pour gagner une place de plus.</p>
              </div>
            );
          })()}
          <button onClick={partagerCode} style={{width:"100%",background:"#075E54",border:"none",borderRadius:10,padding:"11px",color:"#fff",fontWeight:700,fontSize:13,cursor:"pointer"}}>Partager mon code sur WhatsApp</button>
        </div>
        {user.plan==="free"&&user.role!=="admin"&&<div style={{background:"linear-gradient(135deg,rgba(251,113,133,0.10),rgba(232,176,75,0.30))",border:"1px solid #E8B04B",borderRadius:18,padding:18,marginBottom:16}}>
          <p style={{margin:"0 0 4px",color:"#E8B04B",fontWeight:800,fontSize:16}}>Passer a THT Premium</p>
          <p style={{margin:"0 0 14px",color:"#F5F2EA",fontSize:13,lineHeight:1.6}}>Debloque toutes les fonctionnalites pour developper tes tontines !</p>
          <div style={{background:"rgba(255,255,255,0.055)",borderRadius:12,padding:14,marginBottom:14}}>
            <div style={{display:"flex",justifyContent:"flex-end",gap:20,marginBottom:8}}><span style={{color:"#97A3C9",fontSize:11,fontWeight:700,width:70,textAlign:"center"}}>GRATUIT</span><span style={{color:"#E8B04B",fontSize:11,fontWeight:800,width:80,textAlign:"center"}}>PREMIUM</span></div>
            {[["Tontines actives","1 max","Illimité"],["Membres/groupe",`${limiteMembres(user)} max`,"Illimité"],["HABY IA","Basique","Prioritaire"],["Support","Standard","24h"]].map(([f,fr,pr])=>(
              <div key={f} style={{display:"flex",justifyContent:"space-between",padding:"7px 0",borderBottom:"1px solid rgba(255,255,255,0.09)",fontSize:12}}>
                <span style={{color:"#97A3C9"}}>{f}</span>
                <div style={{display:"flex",gap:20}}><span style={{color:fr==="Non"?"#FB7185":"#97A3C9",width:70,textAlign:"center"}}>{fr}</span><span style={{color:"#E8B04B",fontWeight:700,width:80,textAlign:"center"}}>{pr}</span></div>
              </div>
            ))}
          </div>
          <div style={{display:"flex",gap:10,marginBottom:12}}>
            <button onClick={()=>onPayCinetPay("mensuel")} disabled={payBusy} style={{flex:1,background:"linear-gradient(135deg,#FFE9B4 0%,#E8B04B 48%,#C38427 100%)",border:"none",borderRadius:12,padding:"14px",color:"#1B1203",fontWeight:800,fontSize:14,cursor:"pointer"}}>{payBusy?"...":"1 000 FCFA/mois"}</button>
            <button onClick={()=>onPayCinetPay("annuel")} disabled={payBusy} style={{flex:1,background:"rgba(255,255,255,0.09)",border:"1px solid #E8B04B",borderRadius:12,padding:"14px",color:"#E8B04B",fontWeight:800,fontSize:13,cursor:"pointer",lineHeight:1.4}}>10 000/an<br/><span style={{fontSize:10}}>(-17%)</span></button>
          </div>
          <button onClick={()=>onPayCinetPay("mensuel")} disabled={payBusy} style={{width:"100%",background:"rgba(255,255,255,0.055)",border:"1px solid #E8B04B",borderRadius:12,padding:"13px",color:"#E8B04B",fontWeight:800,fontSize:13,cursor:"pointer",marginBottom:12}}>{payBusy?"Ouverture du paiement...":"💳 Payer en ligne maintenant (Orange Money / Wave / Carte)"}</button>
          <div style={{background:"rgba(255,255,255,0.055)",borderRadius:12,padding:12}}>
            <p style={{margin:"0 0 8px",color:"#97A3C9",fontSize:11,fontWeight:700}}>OU MANUELLEMENT VIA WHATSAPP :</p>
            <div style={{display:"flex",gap:8}}>
              <button onClick={()=>window.open("https://wa.me/22376908031?text=Je%20veux%20THT%20Premium","_blank")} style={{flex:1,background:"#FF6600",border:"none",borderRadius:10,padding:"10px",color:"#fff",fontWeight:700,fontSize:12,cursor:"pointer"}}>Orange Money</button>
              <button onClick={()=>window.open("https://wa.me/22390647106?text=Je%20veux%20THT%20Premium","_blank")} style={{flex:1,background:"#0066CC",border:"none",borderRadius:10,padding:"10px",color:"#fff",fontWeight:700,fontSize:12,cursor:"pointer"}}>Wave</button>
            </div>
            <p style={{color:"#97A3C9",fontSize:10,textAlign:"center",margin:"8px 0 0"}}>+223 76 90 80 31 (Orange) - +223 90 64 71 06 (Wave)</p>
          </div>
        </div>}
        {[
          ...(user.role==="admin"?[{label:"ADMINISTRATION",items:[{ic:"🛡️",lb:t("panneauAdmin"),fn:onOpenAdmin}]}]:[]),
          {label:"NOTIFICATIONS",items:[{key:"notif",ic:"🔔",lb:t("notifications"),fn:toggleNotifications,toggle:notifOn,busy:notifBusy}]},
          {label:"COMPTE",items:[{ic:"🔒",lb:t("changerPin"),fn:()=>setShowChangePin(true)},{ic:"📲",lb:t("lierWA"),fn:()=>window.open("https://wa.me/22376908031","_blank")}]},
          {label:"DONNEES ET AIDE",items:[{ic:"📤",lb:t("exporterDonnees"),fn:exporterDonnees},{ic:"📊",lb:"Exporter en Excel (CSV)",fn:exporterCSV},{ic:"💬",lb:t("contacterSupport"),fn:()=>setShowSupport(true)},{ic:"🔏",lb:"Politique de confidentialite",fn:()=>window.open("/confidentialite.html","_blank","noopener")}]},
        ].map(group=>(
          <div key={group.label} style={{marginBottom:18}}>
            <p style={{color:"#97A3C9",fontSize:11,fontWeight:700,marginBottom:10,letterSpacing:.5}}>{group.label}</p>
            {group.items.map(item=>(
              <div key={item.key||item.lb} onClick={item.toggle===undefined?item.fn:undefined} style={{display:"flex",alignItems:"center",gap:14,padding:"14px 16px",background:"rgba(255,255,255,0.055)",borderRadius:14,marginBottom:8,cursor:item.toggle===undefined?"pointer":"default",border:"1px solid rgba(255,255,255,0.09)",opacity:item.busy?0.7:1}}>
                <span style={{fontSize:20}}>{item.ic}</span><p style={{margin:0,color:"#F5F2EA",fontSize:14,fontWeight:600}}>{item.lb}</p>
                {item.toggle===undefined
                  ?<span style={{marginLeft:"auto",color:"#6F7BA6",fontSize:18}}>›</span>
                  :<div onClick={item.busy?undefined:item.fn} style={{marginLeft:"auto",width:46,height:26,borderRadius:99,background:item.toggle?"#E8B04B":"rgba(255,255,255,0.14)",position:"relative",cursor:"pointer",transition:"background .2s",flexShrink:0}}>
                      <div style={{position:"absolute",top:3,left:item.toggle?23:3,width:20,height:20,borderRadius:"50%",background:"rgba(255,255,255,0.055)",transition:"left .2s"}}/>
                    </div>}
              </div>
            ))}
          </div>
        ))}
        <div style={{marginTop:16}}>
          {!showOut
            ?<button onClick={()=>setShowOut(true)} style={{width:"100%",background:"transparent",border:"1px solid #E0526A",borderRadius:14,padding:"14px",color:"#FB7185",fontWeight:700,fontSize:15,cursor:"pointer"}}>{t("deconnexion")}</button>
            :<div style={{background:"rgba(251,113,133,0.10)",border:"1px solid #E0526A",borderRadius:14,padding:16}}><p style={{color:"#F5F2EA",fontWeight:700,margin:"0 0 14px",textAlign:"center"}}>Confirmer la deconnexion ?</p><div style={{display:"flex",gap:10}}><button onClick={()=>setShowOut(false)} style={{flex:1,background:"rgba(255,255,255,0.09)",border:"none",borderRadius:12,padding:12,color:"#F5F2EA",fontWeight:700,cursor:"pointer"}}>Annuler</button><button onClick={onLogout} style={{flex:1,background:"#E0526A",border:"none",borderRadius:12,padding:12,color:"#fff",fontWeight:700,cursor:"pointer"}}>Deconnecter</button></div></div>}
        </div>
        <p style={{color:"#6F7BA6",fontSize:11,textAlign:"center",margin:"20px 0 10px"}}>THT v2.1 - Fait avec amour pour l Afrique</p>
      </div>
      {showSupport&&<SupportModal onClose={()=>setShowSupport(false)} onToast={onToast}/>}
      {showEditProfil&&<Modal onClose={()=>setShowEditProfil(false)}>
        <MH title="Modifier mon profil" onClose={()=>setShowEditProfil(false)}/>
        <ErrBox msg={editProfilErr}/>
        <Fld label="Photo de profil">
          <div style={{display:"flex",alignItems:"center",gap:14}}>
            {editPhotoPreview?<img src={editPhotoPreview} alt="Nouvelle photo" style={{width:74,height:74,borderRadius:20,objectFit:"cover"}}/>:<Avatar prenom={editNom||user.prenom} photo={user.photo} size={74} gold/>}
            <label style={{background:"rgba(255,255,255,0.055)",border:"1px solid #E8B04B",borderRadius:12,padding:"11px 16px",color:"#E8B04B",fontWeight:700,fontSize:13,cursor:"pointer"}}>
              {user.photo||editPhotoPreview?"Changer la photo":"Ajouter une photo"}
              <input type="file" accept="image/*" hidden onChange={choisirPhotoProfil}/>
            </label>
          </div>
        </Fld>
        <Fld label="Nom complet"><Inp value={editNom} onChange={e=>setEditNom(e.target.value)} placeholder="Ex: Fatoumata Traore" maxLength={40}/></Fld>
        <p style={{color:"#97A3C9",fontSize:12,lineHeight:1.6,margin:"0 0 14px"}}>ℹ️ Ton numero de telephone ne peut pas etre modifie : c est lui qui identifie ton compte et qui te relie aux tontines ou on t a ajoutee.</p>
        <Btn onClick={enregistrerProfil} disabled={editProfilBusy}>{editProfilBusy?"Enregistrement...":"Enregistrer"}</Btn>
      </Modal>}
      {showChangePin&&<Modal onClose={()=>setShowChangePin(false)}>
        <MH title="Changer mon PIN" onClose={()=>setShowChangePin(false)}/>
        <Fld label="PIN actuel"><Inp value={oldPin} onChange={e=>setOldPin(e.target.value.replace(/\D/g,"").slice(0,4))} placeholder="****" type="password" inputMode="numeric" maxLength={4} autoFocus/></Fld>
        <Fld label="Nouveau PIN"><Inp value={newPin} onChange={e=>setNewPin(e.target.value.replace(/\D/g,"").slice(0,4))} placeholder="****" type="password" inputMode="numeric" maxLength={4}/></Fld>
        <Fld label="Confirme le nouveau PIN"><Inp value={newPin2} onChange={e=>setNewPin2(e.target.value.replace(/\D/g,"").slice(0,4))} placeholder="****" type="password" inputMode="numeric" maxLength={4}/></Fld>
        <ErrBox msg={pinErr}/>
        <Btn onClick={soumettreChangePin} disabled={pinBusy}>{pinBusy?"Vérification...":"Confirmer le changement"}</Btn>
      </Modal>}
    </div>
  );
};

const ContributionPubliqueScreen = ({cagnotteId}) => {
  const [cagnotte,setCagnotte]=useState(null);
  const [loading,setLoading]=useState(true);
  const [loadErr,setLoadErr]=useState("");
  const [prenom,setPrenom]=useState("");
  const [nom,setNom]=useState("");
  const [tel,setTel]=useState("");
  const [montant,setMontant]=useState("");
  const [preuve,setPreuve]=useState(null);
  const [preuvePreview,setPreuvePreview]=useState(null);
  const [err,setErr]=useState("");
  const [busy,setBusy]=useState(false);
  const [succes,setSucces]=useState(null);
  const [recuBusy,setRecuBusy]=useState(false);

  const choisirPreuve=(e)=>{
    const f=e.target.files?.[0];
    if(!f)return;
    const reader=new FileReader();
    reader.onload=()=>{setPreuve(reader.result);setPreuvePreview(reader.result);};
    reader.readAsDataURL(f);
  };

  useEffect(()=>{
    (async()=>{
      try{
        const res=await fetch(`${SUPABASE_URL}/functions/v1/cagnotte-contribute?id=${cagnotteId}`);
        const data=await res.json();
        if(!res.ok)throw new Error(data.error||"Cagnotte introuvable");
        setCagnotte(data);
      }catch(e){setLoadErr(e.message||"Cagnotte introuvable");}
      setLoading(false);
    })();
  },[cagnotteId]);

  const contribuer=async()=>{
    if(!prenom.trim())return setErr("Ton prenom est requis");
    if(!montant||Number(montant)<100)return setErr("Montant minimum : 100 FCFA");
    if(!preuve)return setErr("Une photo de ton depot (Orange Money, Wave, especes...) est requise pour confirmer");
    setErr("");setBusy(true);
    try{
      const res=await fetch(`${SUPABASE_URL}/functions/v1/cagnotte-contribute`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({cagnotte_id:cagnotteId,prenom:prenom.trim(),nom:nom.trim(),tel:tel.trim(),montant,preuve_base64:preuve})});
      const data=await res.json();
      if(!res.ok)throw new Error(data.error||"Erreur d'enregistrement");
      setSucces(data);
    }catch(e){setErr(e.message||"Erreur d'enregistrement");}
    setBusy(false);
  };

  // OPTION A : contribuer en ligne via FedaPay (valide automatiquement, sans photo). On cree la
  // transaction cote serveur puis on redirige vers le checkout ; le webhook credite la cagnotte.
  const [payLigneBusy,setPayLigneBusy]=useState(false);
  const payerEnLigne=async()=>{
    if(!prenom.trim())return setErr("Ton prénom est requis");
    if(!montant||Number(montant)<100)return setErr("Montant minimum : 100 FCFA");
    if(tel.replace(/\D/g,"").length<8)return setErr("Entre ton numéro de téléphone pour payer en ligne");
    setErr("");setPayLigneBusy(true);
    const {data,error}=await supabase.functions.invoke("fedapay-init",{body:{
      type_transaction:"cagnotte",
      id_cagnotte:cagnotteId,
      contributeur:`${prenom.trim()} ${(nom||"").trim()}`.trim(),
      montant:Math.floor(Number(montant)),
      telephone:tel.replace(/\s/g,""),
      prenom:prenom.trim(),
      devise:"XOF",
    }});
    setPayLigneBusy(false);
    if(error||data?.error||!data?.url)return setErr("Le paiement en ligne n'a pas pu démarrer. Réessaie.");
    window.location.href=data.url;
  };

  const telechargerRecu=async()=>{
    setRecuBusy(true);
    try{
      const now=new Date();
      const blob=await genererRecuImage({
        nomTontine:succes.titre,prenom:succes.contributeur,montantRecu:fmtFCFA(succes.montant),montantDu:"Contribution libre",
        totalVerse:fmtFCFA(succes.nouveauTotal),statut:"CONTRIBUTION ENREGISTREE",cycle:"-",totalCycles:"-",
        ref:`CAG-${now.getTime().toString().slice(-8)}`,date:now.toLocaleDateString("fr-FR")
      });
      await partagerImage(blob,"recu-contribution.jpg","Recu THT","Merci pour ta contribution !");
    }catch{}
    setRecuBusy(false);
  };

  if(loading)return <div style={{minHeight:"100vh",background:"rgba(255,255,255,0.055)",display:"flex",alignItems:"center",justifyContent:"center"}}><p style={{color:"#E8B04B"}}>Chargement...</p></div>;
  if(loadErr)return <div style={{minHeight:"100vh",background:"rgba(255,255,255,0.055)",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:24,textAlign:"center"}}><p style={{fontSize:40,margin:"0 0 10px"}}>😕</p><p style={{color:"#F5F2EA",fontWeight:700}}>{loadErr}</p><p style={{color:"#97A3C9",fontSize:13,marginTop:8}}>Ce lien n'est peut-etre plus valide.</p></div>;

  if(succes)return(
    <div style={{minHeight:"100vh",background:"rgba(255,255,255,0.055)",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:24,textAlign:"center"}}>
      <div style={{width:70,height:70,borderRadius:"50%",background:"rgba(255,255,255,0.09)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:34,marginBottom:16}}>✅</div>
      <h2 style={{color:"#F5F2EA",margin:"0 0 8px"}}>Merci {succes.contributeur} !</h2>
      <p style={{color:"#E8B04B",fontSize:20,fontWeight:900,margin:"0 0 4px"}}>{fmtFCFA(succes.montant)}</p>
      <p style={{color:"#97A3C9",fontSize:13,marginBottom:24}}>ajoute a "{succes.titre}"</p>
      <button onClick={telechargerRecu} disabled={recuBusy} style={{background:"linear-gradient(135deg,#FFE9B4 0%,#E8B04B 48%,#C38427 100%)",border:"none",borderRadius:14,padding:"13px 24px",color:"#1B1203",fontWeight:800,fontSize:14,cursor:"pointer",marginBottom:12}}>{recuBusy?"Creation...":"🧾 Télécharger mon reçu"}</button>
      <p style={{color:"#6F7BA6",fontSize:11}}>THT - Tontine Habi Traore</p>
    </div>
  );

  const pct=Math.min(100,Math.round((cagnotte.montant_collecte/cagnotte.objectif)*100));
  return(
    <div style={{minHeight:"100vh",background:"rgba(255,255,255,0.055)",padding:"32px 20px"}}>
      <div style={{maxWidth:420,margin:"0 auto"}}>
        <div style={{textAlign:"center",marginBottom:24}}>
          <div style={{width:56,height:56,borderRadius:16,margin:"0 auto 12px",overflow:"hidden"}}><img src={logoIcon} alt="THT" style={{width:"100%",height:"100%",objectFit:"cover"}}/></div>
          <p style={{color:"#97A3C9",fontSize:11,letterSpacing:1}}>THT - CAGNOTTE</p>
        </div>
        <div style={{background:"rgba(255,255,255,0.055)",border:"1px solid #E8B04B",borderRadius:16,padding:20,marginBottom:20}}>
          <p style={{margin:0,color:"#F5F2EA",fontWeight:800,fontSize:18}}>{cagnotte.titre}</p>
          {cagnotte.beneficiaire&&<p style={{margin:"4px 0 0",color:"#E8B04B",fontSize:13}}>Pour {cagnotte.beneficiaire}</p>}
          {cagnotte.description&&<p style={{margin:"10px 0 0",color:"#97A3C9",fontSize:13,lineHeight:1.5}}>{cagnotte.description}</p>}
          <div style={{margin:"16px 0 6px"}}><Bar pct={pct} c="#E8B04B"/></div>
          <p style={{margin:0,color:"#F5F2EA",fontSize:13}}>{fmtFCFA(cagnotte.montant_collecte)} <span style={{color:"#97A3C9"}}>/ {fmtFCFA(cagnotte.objectif)} ({pct}%)</span></p>
        </div>
        {cagnotte.statut!=="ouverte"?<p style={{color:"#FB7185",textAlign:"center",fontWeight:700}}>Cette cagnotte n'accepte plus de contributions</p>:<>
          <Fld label="Ton prenom"><Inp value={prenom} onChange={e=>setPrenom(e.target.value)} placeholder="Ex: Fatoumata" maxLength={30} autoFocus/></Fld>
          <Fld label="Ton nom (optionnel)"><Inp value={nom} onChange={e=>setNom(e.target.value)} placeholder="Ex: Diallo" maxLength={30}/></Fld>
          <Fld label="Ton numéro (optionnel)"><PhoneInput value={tel} onChange={setTel}/></Fld>
          <Fld label="Montant de ta contribution (FCFA)"><Inp value={montant} onChange={e=>setMontant(e.target.value.replace(/\D/g,""))} placeholder="Ex: 5000" inputMode="numeric"/></Fld>
          {/* OPTION A : contribuer en ligne via FedaPay + QR a scanner (recommande, valide auto) */}
          <div style={{background:"rgba(232,176,75,0.10)",border:"1px solid #E8B04B",borderRadius:12,padding:14,margin:"6px 0 14px"}}>
            <p style={{margin:"0 0 8px",color:"#E8B04B",fontWeight:800,fontSize:13}}>💳 Payer en ligne (recommandé)</p>
            <p style={{margin:"0 0 10px",color:"#97A3C9",fontSize:11,lineHeight:1.5}}>Contribue en toute sécurité (Orange Money, Wave, Moov, carte…). C'est validé automatiquement, sans photo.</p>
            <button onClick={payerEnLigne} disabled={payLigneBusy} style={{width:"100%",background:"linear-gradient(135deg,#FFE9B4 0%,#E8B04B 48%,#C38427 100%)",border:"none",borderRadius:12,padding:13,color:"#fff",fontWeight:800,fontSize:14,cursor:"pointer"}}>{payLigneBusy?"Ouverture du paiement...":"✅ Contribuer en ligne maintenant"}</button>
            <div data-noinvert style={{display:"flex",flexDirection:"column",alignItems:"center",marginTop:14,paddingTop:14,borderTop:"1px solid rgba(232,176,75,0.30)"}}>
              <p style={{margin:"0 0 8px",color:"#F5F2EA",fontSize:11,fontWeight:700,textAlign:"center"}}>📷 Ou fais scanner ce code pour contribuer</p>
              <QRCodeSVG value={`${window.location.origin}/?contribuer=${cagnotteId}`} size={140} level="M" bgColor="rgba(255,255,255,0.055)" fgColor="#F5F2EA"/>
            </div>
          </div>
          <p style={{textAlign:"center",color:"#6F7BA6",fontSize:11,margin:"0 0 6px"}}>— ou paie à la main puis envoie une preuve ci-dessous —</p>
          <BoutonsPaiementMobile montant={montant} numeroOrangeMoney={cagnotte.numero_orange_money} numeroWave={cagnotte.numero_wave} numeroMoovMoney={cagnotte.numero_moov_money} lienWave={cagnotte.lien_wave} lienOrange={cagnotte.lien_orange}/>
          <Fld label="Photo de ton depot (Orange Money, Wave, especes...) - obligatoire">
            <label style={{display:"block",background:"rgba(255,255,255,0.055)",border:"1px dashed #E8B04B",borderRadius:12,padding:preuvePreview?0:20,textAlign:"center",cursor:"pointer",overflow:"hidden"}}>
              <input type="file" accept="image/*" onChange={choisirPreuve} style={{display:"none"}}/>
              {preuvePreview?<img src={preuvePreview} alt="Preuve" style={{width:"100%",maxHeight:220,objectFit:"contain",display:"block"}}/>:<span style={{color:"#E8B04B",fontSize:13,fontWeight:700}}>📷 Ajouter une photo</span>}
            </label>
          </Fld>
          <ErrBox msg={err}/>
          <Btn onClick={contribuer} disabled={busy}>{busy?"Enregistrement...":"Confirmer ma contribution"}</Btn>
          <p style={{color:"#97A3C9",fontSize:11,textAlign:"center",marginTop:14,lineHeight:1.5}}>⚠️ Le versement de l'argent (Orange Money, especes...) se fait separement, directement aupres de l'organisateur. La photo sert a confirmer ton depot reel.</p>
        </>}
      </div>
    </div>
  );
};

const CagnotteScreen = ({cagnotte:cInit,user,onBack,onToast,onUpdate,onDelete}) => {
  const [cagnotte,setCagnotte]=useState(cInit);
  const [contributions,setContributions]=useState([]);
  const [showNotifier,setShowNotifier]=useState(false);
  const [mesGroupes,setMesGroupes]=useState([]);
  const [notifBusy,setNotifBusy]=useState(false);
  const [numOM,setNumOM]=useState(cInit.numero_orange_money||"");
  const [numWave,setNumWave]=useState(cInit.numero_wave||"");
  const [numMoov,setNumMoov]=useState(cInit.numero_moov_money||"");
  const [lienW,setLienW]=useState(cInit.lien_wave||"");
  const [lienO,setLienO]=useState(cInit.lien_orange||"");
  const [numBusy,setNumBusy]=useState(false);

  const saveNumeros=async()=>{
    setNumBusy(true);
    const {error}=await supabase.from("cagnottes").update({numero_orange_money:numOM.trim()||null,numero_wave:numWave.trim()||null,numero_moov_money:numMoov.trim()||null,lien_wave:lienW.trim()||null,lien_orange:lienO.trim()||null}).eq("id",cagnotte.id);
    setNumBusy(false);
    if(error)return onToast("Erreur : "+(error.message||"inconnue"),"error");
    setCagnotte(c=>({...c,numero_orange_money:numOM.trim()||null,numero_wave:numWave.trim()||null,numero_moov_money:numMoov.trim()||null,lien_wave:lienW.trim()||null,lien_orange:lienO.trim()||null}));
    onUpdate(cagnotte.id,{numero_orange_money:numOM.trim()||null,numero_wave:numWave.trim()||null,numero_moov_money:numMoov.trim()||null,lien_wave:lienW.trim()||null,lien_orange:lienO.trim()||null});
    onToast("Numéros de réception enregistrés !");
  };

  const loadContribs=async()=>{
    const {data}=await supabase.from("cagnotte_contributions").select("*").eq("cagnotte_id",cagnotte.id).order("created_at",{ascending:false});
    setContributions(data||[]);
  };
  useEffect(()=>{loadContribs();},[cagnotte.id]);

  const pct=Math.min(100,Math.round((cagnotte.montant_collecte/cagnotte.objectif)*100));

  const ouvrirNotifier=async()=>{
    setShowNotifier(true);
    const {data:groupes}=await supabase.from("groupes").select("id,nom").eq("user_id",user.id);
    const groupesAvecMembres=await Promise.all((groupes||[]).map(async(g)=>{
      const {data:membres}=await supabase.from("membres").select("id,prenom,tel,user_id").eq("groupe_id",g.id);
      return {...g,membres:membres||[]};
    }));
    setMesGroupes(groupesAvecMembres);
  };

  const notifierGroupe=async(g)=>{
    setNotifBusy(true);
    const lien=`${window.location.origin}/?contribuer=${cagnotte.id}`;
    const linked=g.membres.filter(m=>m.user_id);
    const echecs=[];
    let envoyes=0;
    for(const m of linked){
      const {data,error}=await supabase.functions.invoke("send-push",{body:{user_id:m.user_id,title:"THT - Nouvelle cagnotte",body:`"${cagnotte.titre}" a besoin de votre participation !`,url:lien}});
      if(!error&&!data?.error)envoyes++;else echecs.push(m);
    }
    setNotifBusy(false);
    const nonLinked=g.membres.filter(m=>!m.user_id);
    setMesGroupes(gs=>gs.map(x=>x.id===g.id?{...x,aFallback:[...nonLinked,...echecs]}:x));
    onToast(`${envoyes} membre(s) notifie(s) dans l app.${(nonLinked.length+echecs.length)>0?` ${nonLinked.length+echecs.length} n ont pas reçu la notification (compte non lie ou notifications non activees) : envoie-leur le lien via WhatsApp ci-dessous.`:""}`);
  };

  const cloturer=async()=>{
    const {error}=await supabase.from("cagnottes").update({statut:"cloturee"}).eq("id",cagnotte.id);
    if(error)return onToast("Impossible de cloturer","error");
    setCagnotte(c=>({...c,statut:"cloturee"}));
    onUpdate(cagnotte.id,{statut:"cloturee"});
    onToast("Cagnotte cloturee !");
  };

  const supprimer=async()=>{
    if(!confirm("Supprimer cette cagnotte definitivement ?"))return;
    const {error}=await supabase.from("cagnottes").delete().eq("id",cagnotte.id);
    if(error)return onToast("Suppression impossible","error");
    onDelete(cagnotte.id);
  };

  const partager=()=>{
    const lien=`${window.location.origin}/?contribuer=${cagnotte.id}`;
    const msg=encodeURIComponent(`🎉 ${cagnotte.titre}\n\n${cagnotte.description||""}\n\nObjectif : ${fmtFCFA(cagnotte.objectif)}\nDeja collecte : ${fmtFCFA(cagnotte.montant_collecte)} (${pct}%)\n\nParticipe directement ici, ca prend 30 secondes :\n${lien}`);
    window.open(`https://wa.me/?text=${msg}`,"_blank");
  };

  return(
    <div style={{paddingBottom:90}}>
      <div style={{padding:"44px 16px 0",display:"flex",alignItems:"center",gap:10}}>
        <button onClick={onBack} style={{background:"none",border:"none",color:"#E8B04B",fontSize:22,cursor:"pointer"}}>←</button>
        <div style={{flex:1}}><h2 style={{color:"#F5F2EA",margin:0,fontSize:17,fontWeight:800}}>{cagnotte.titre}</h2>{cagnotte.beneficiaire&&<p style={{color:"#E8B04B",margin:0,fontSize:12}}>Pour : {cagnotte.beneficiaire}</p>}</div>
        <button onClick={supprimer} style={{background:"transparent",border:"1px solid #E0526A",borderRadius:8,padding:"5px 10px",color:"#FB7185",fontSize:11,fontWeight:700,cursor:"pointer"}}>Suppr.</button>
      </div>
      {cagnotte.description&&<p style={{color:"#97A3C9",fontSize:13,padding:"12px 16px 0",lineHeight:1.6}}>{cagnotte.description}</p>}
      <div style={{margin:"16px 16px 0",background:"rgba(255,255,255,0.055)",border:"1px solid #E8B04B",borderRadius:16,padding:18}}>
        <p style={{margin:0,color:"#97A3C9",fontSize:12,fontWeight:600}}>COLLECTE</p>
        <p style={{margin:"4px 0 0",color:"#E8B04B",fontSize:26,fontWeight:900}}>{fmtFCFA(cagnotte.montant_collecte)}</p>
        <Bar pct={pct} c="#E8B04B"/>
        <p style={{margin:"6px 0 0",color:"#97A3C9",fontSize:11}}>Objectif : {fmtFCFA(cagnotte.objectif)} ({pct}%){cagnotte.date_limite?` - avant le ${new Date(cagnotte.date_limite).toLocaleDateString("fr-FR")}`:""}</p>
      </div>
      {cagnotte.statut!=="cloturee"&&<div style={{display:"flex",gap:10,padding:"14px 16px 0"}}>
        <button onClick={ouvrirNotifier} style={{flex:1,background:"rgba(255,255,255,0.09)",border:"1px solid rgba(255,255,255,0.14)",borderRadius:10,padding:"11px",color:"#E8B04B",fontWeight:700,fontSize:13,cursor:"pointer"}}>📣 Notifier un groupe</button>
        <button onClick={partager} style={{flex:1,background:"#075E54",border:"none",borderRadius:10,padding:"11px",color:"#fff",fontWeight:700,fontSize:13,cursor:"pointer"}}>Partager WA</button>
      </div>}
      {cagnotte.statut!=="cloturee"&&<button onClick={async()=>{const lien=`${window.location.origin}/?contribuer=${cagnotte.id}`;try{await navigator.clipboard.writeText(lien);onToast("Lien copie !");}catch{onToast(lien);}}} style={{width:"calc(100% - 32px)",margin:"10px 16px 0",background:"rgba(255,255,255,0.09)",border:"1px solid #E8B04B",borderRadius:10,padding:"10px",color:"#E8B04B",fontWeight:700,fontSize:12,cursor:"pointer"}}>🔗 Copier le lien de contribution</button>}
      {cagnotte.statut!=="cloturee"&&<button onClick={cloturer} style={{width:"calc(100% - 32px)",margin:"10px 16px 0",background:"transparent",border:"1px solid rgba(255,255,255,0.14)",borderRadius:10,padding:"10px",color:"#97A3C9",fontWeight:700,fontSize:12,cursor:"pointer"}}>Cloturer la cagnotte</button>}
      <div style={{margin:"16px 16px 0",background:"rgba(255,255,255,0.055)",border:"1px solid rgba(255,255,255,0.09)",borderRadius:14,padding:14}}>
        <p style={{margin:"0 0 10px",color:"#E8B04B",fontWeight:800,fontSize:13}}>📲 Numéros de réception</p>
        <p style={{margin:"0 0 10px",color:"#97A3C9",fontSize:11,lineHeight:1.5}}>Affichés aux contributeurs comme boutons de paiement direct. L'argent part directement sur ces numéros, jamais sur l'app.</p>
        <Fld label="Numéro Orange Money (optionnel)"><Inp value={numOM} onChange={e=>setNumOM(e.target.value.replace(/[^\d+]/g,""))} placeholder="Ex: 70123456" inputMode="tel"/></Fld>
        <Fld label="Numéro Wave (optionnel)"><Inp value={numWave} onChange={e=>setNumWave(e.target.value.replace(/[^\d+]/g,""))} placeholder="Ex: 70123456" inputMode="tel"/></Fld>
        <Fld label="Numéro Moov Money (optionnel)"><Inp value={numMoov} onChange={e=>setNumMoov(e.target.value.replace(/[^\d+]/g,""))} placeholder="Ex: 60123456" inputMode="tel"/></Fld>
        <Fld label="Lien de paiement Orange Money (optionnel)"><Inp value={lienO} onChange={e=>setLienO(e.target.value)} placeholder="https://..." inputMode="url"/></Fld>
        <Fld label="Lien de paiement Wave (optionnel)"><Inp value={lienW} onChange={e=>setLienW(e.target.value)} placeholder="https://pay.wave.com/..." inputMode="url"/></Fld>
        <button onClick={saveNumeros} disabled={numBusy} style={{width:"100%",background:"transparent",border:"1px solid #E8B04B",borderRadius:10,padding:"9px",color:"#E8B04B",fontWeight:700,fontSize:12,cursor:"pointer"}}>{numBusy?"Enregistrement...":"Enregistrer"}</button>
      </div>
      <div style={{padding:"20px 16px 0"}}>
        <p style={{color:"#97A3C9",fontSize:12,fontWeight:700,margin:"0 0 10px",letterSpacing:.5}}>CONTRIBUTIONS ({contributions.length})</p>
        {contributions.length===0?<p style={{color:"#97A3C9",fontSize:13,textAlign:"center",padding:10}}>Aucune contribution pour l instant</p>
        :contributions.map(c=>(
          <div key={c.id} style={{background:"rgba(255,255,255,0.055)",border:"1px solid rgba(255,255,255,0.09)",borderRadius:12,padding:"12px 14px",marginBottom:8}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div style={{display:"flex",alignItems:"center",gap:10}}><Avatar prenom={c.contributeur} size={32}/><div><p style={{margin:0,color:"#F5F2EA",fontSize:14,fontWeight:600}}>{c.contributeur}</p>{c.tel&&<p style={{margin:0,color:"#97A3C9",fontSize:11}}>{c.tel}</p>}</div></div>
              <p style={{margin:0,color:"#E8B04B",fontWeight:700,fontSize:14}}>{fmtFCFA(c.montant)}</p>
            </div>
            {c.preuve_url&&<a href={c.preuve_url} target="_blank" rel="noreferrer" style={{display:"block",marginTop:10}}><img src={c.preuve_url} alt="Preuve de depot" style={{width:"100%",maxHeight:160,objectFit:"cover",borderRadius:8,border:"1px solid rgba(255,255,255,0.14)"}}/></a>}
          </div>
        ))}
      </div>
      {showNotifier&&<Modal onClose={()=>setShowNotifier(false)}>
        <MH title="Notifier un groupe" onClose={()=>setShowNotifier(false)}/>
        <p style={{color:"#97A3C9",fontSize:12,marginBottom:14,lineHeight:1.5}}>Choisis une tontine : les membres qui ont un compte THT relie ET les notifications activees recevront une notification automatique. Pour les autres, envoie le lien toi-meme sur WhatsApp.</p>
        {mesGroupes.length===0&&<p style={{color:"#97A3C9",fontSize:13,textAlign:"center",padding:10}}>Chargement...</p>}
        {mesGroupes.map(g=>{
          const linked=g.membres.filter(m=>m.user_id);
          const aAfficher=g.aFallback||g.membres.filter(m=>!m.user_id);
          return(
            <div key={g.id} style={{background:"rgba(255,255,255,0.055)",border:"1px solid rgba(255,255,255,0.09)",borderRadius:12,padding:"12px 14px",marginBottom:10}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:aAfficher.length>0?10:0}}>
                <div><p style={{margin:0,color:"#F5F2EA",fontWeight:700,fontSize:14}}>{g.nom}</p><p style={{margin:0,color:"#97A3C9",fontSize:11}}>{linked.length} avec compte - {g.membres.length-linked.length} sans compte</p></div>
                <button onClick={()=>notifierGroupe(g)} disabled={notifBusy||linked.length===0} style={{background:linked.length===0?"rgba(255,255,255,0.09)":"linear-gradient(135deg,#FFE9B4 0%,#E8B04B 48%,#C38427 100%)",border:"none",borderRadius:10,padding:"8px 14px",color:linked.length===0?"#97A3C9":"#1B1203",fontWeight:700,fontSize:12,cursor:"pointer"}}>Notifier</button>
              </div>
              {aAfficher.map(m=>(
                <button key={m.id} onClick={()=>{const lien=`${window.location.origin}/?contribuer=${cagnotte.id}`;const msg=encodeURIComponent(`Salut ${m.prenom} ! Participe a la cagnotte "${cagnotte.titre}" ici :\n${lien}`);window.open(`https://wa.me/${m.tel.replace(/[\s+]/g,"")}?text=${msg}`,"_blank");}} style={{display:"flex",alignItems:"center",gap:8,width:"100%",background:"rgba(255,255,255,0.055)",border:"1px solid #075E54",borderRadius:8,padding:"7px 10px",color:"#34D399",fontSize:12,fontWeight:600,cursor:"pointer",marginTop:6}}>💬 Envoyer a {m.prenom} sur WhatsApp</button>
              ))}
            </div>
          );
        })}
      </Modal>}
    </div>
  );
};

const ModalCreerCagnotte = ({onClose,onCreate,user}) => {
  const [titre,setTitre]=useState("");
  const [description,setDescription]=useState("");
  const [objectif,setObjectif]=useState("");
  const [beneficiaire,setBeneficiaire]=useState("");
  const [dateLimite,setDateLimite]=useState("");
  const [numeroOrangeMoney,setNumeroOrangeMoney]=useState("");
  const [numeroWave,setNumeroWave]=useState("");
  const [numeroMoovMoney,setNumeroMoovMoney]=useState("");
  const [busy,setBusy]=useState(false);
  const [err,setErr]=useState("");

  const handle=async()=>{
    if(!titre.trim())return setErr("Donne un titre a ta cagnotte");
    if(!objectif||Number(objectif)<1000)return setErr("Objectif minimum 1000 FCFA");
    if(!numeroOrangeMoney.trim()&&!numeroWave.trim()&&!numeroMoovMoney.trim())return setErr("Ajoute au moins un numero de reception (Orange Money, Wave ou Moov Money)");
    setBusy(true);
    const payload={user_id:user.id,titre:s(titre.trim()),description:s(description||""),objectif:Number(objectif),beneficiaire:s(beneficiaire||""),date_limite:dateLimite||null,montant_collecte:0,numero_orange_money:numeroOrangeMoney.trim()||null,numero_wave:numeroWave.trim()||null,numero_moov_money:numeroMoovMoney.trim()||null};
    const {data,error}=await supabase.from("cagnottes").insert(payload).select().single();
    setBusy(false);
    if(error)return setErr("Erreur technique : "+(error.message||"inconnue"));
    onCreate(data);
    onClose();
  };

  return(
    <Modal onClose={onClose}>
      <MH title="Nouvelle cagnotte" onClose={onClose}/>
      <Fld label="Titre"><Inp value={titre} onChange={e=>setTitre(e.target.value)} placeholder="Ex: Mariage de Fatoumata" maxLength={60} autoFocus/></Fld>
      <Fld label="Pour qui (beneficiaire)"><Inp value={beneficiaire} onChange={e=>setBeneficiaire(e.target.value)} placeholder="Ex: Fatoumata Diallo" maxLength={60}/></Fld>
      <Fld label="Description (optionnel)"><textarea value={description} onChange={e=>setDescription(e.target.value)} rows={3} placeholder="Details de l occasion..." style={{width:"100%",background:"rgba(255,255,255,0.045)",border:"1px solid rgba(255,255,255,0.14)",borderRadius:12,padding:"12px 14px",color:"#F5F2EA",fontSize:14,outline:"none",resize:"vertical",fontFamily:"inherit"}}/></Fld>
      <Fld label="Objectif (FCFA)"><Inp value={objectif} onChange={e=>setObjectif(e.target.value.replace(/\D/g,""))} placeholder="Ex: 200000" inputMode="numeric"/></Fld>
      <Fld label="Date limite (optionnel)"><Inp value={dateLimite} onChange={e=>setDateLimite(e.target.value)} type="date"/></Fld>
      <SelecteurPaiement numeroOrangeMoney={numeroOrangeMoney} setNumeroOrangeMoney={setNumeroOrangeMoney} numeroWave={numeroWave} setNumeroWave={setNumeroWave} numeroMoovMoney={numeroMoovMoney} setNumeroMoovMoney={setNumeroMoovMoney}/>
      <ErrBox msg={err}/>
      <Btn onClick={handle} disabled={busy}>{busy?"Creation...":"Creer la cagnotte"}</Btn>
    </Modal>
  );
};

const ModalCreer = ({onClose,onCreate,user}) => {
  const [nom,setNom]=useState("");
  const [montant,setMontant]=useState("");
  const [freq,setFreq]=useState("Mensuel");
  const [echeance,setEcheance]=useState("");
  const [montantInitial,setMontantInitial]=useState("");
  const [numeroOrangeMoney,setNumeroOrangeMoney]=useState("");
  const [numeroWave,setNumeroWave]=useState("");
  const [numeroMoovMoney,setNumeroMoovMoney]=useState("");
  const [err,setErr]=useState("");
  const [busy,setBusy]=useState(false);
  const [limitReached,setLimitReached]=useState(false);
  const [payBusy,setPayBusy]=useState(false);
  const [qrPaiementUrl,setQrPaiementUrl]=useState("");
  const [qrUp,setQrUp]=useState(false);
  const choisirQRCreation=async(e)=>{
    const f=e.target.files?.[0];
    if(!f)return;
    setQrUp(true);
    try{
      const compresse=await compressImage(f,900,0.85);
      const url=await uploadPhoto(new File([compresse],"qr.jpg",{type:"image/jpeg"}),`qr/${user.id}`);
      setQrPaiementUrl(url);
    }catch{setErr("Import du QR impossible, reessaie");}
    setQrUp(false);
  };
  const handle=async()=>{
    if(!nom.trim())return setErr("Donne un nom a ta tontine");
    if(!montant||Number(montant)<500)return setErr("Montant minimum : 500 FCFA");
    if(!numeroOrangeMoney.trim()&&!numeroWave.trim()&&!numeroMoovMoney.trim())return setErr("Ajoute au moins un numero de reception (Orange Money, Wave ou Moov Money)");
    if(user.plan==="free"&&user.role!=="admin"&&user.groupesCount>=1){setErr("");setLimitReached(true);return;}
    setBusy(true);
    const payload={user_id:user.id,owner_id:user.id,nom:s(nom.trim()),montant:Number(montant),frequence:freq,couleur:"#E8B04B",cycle:1,total_cycles:12,date_echeance:echeance||new Date(Date.now()+30*86400000).toISOString().split("T")[0],caisse_sociale:0,montant_initial:montantInitial?Number(montantInitial):0,numero_orange_money:numeroOrangeMoney.trim()||null,numero_wave:numeroWave.trim()||null,numero_moov_money:numeroMoovMoney.trim()||null,qr_paiement_url:qrPaiementUrl||null};
    const {data,error}=await supabase.from("groupes").insert(payload).select().single();
    if(error){setBusy(false);return setErr("Erreur technique : "+(error.message||"inconnue"));}
    const {data:moi}=await supabase.from("membres").insert({groupe_id:data.id,prenom:s(user.prenom)+" (moi)",tel:user.tel,quartier:"",photo_url:user.photo||null,paye:false,score:80,versements:0,cycles_paies:0,ordre:0,user_id:user.id}).select().single();
    setBusy(false);
    const moiMembre=moi?{id:moi.id,userId:user.id,prenom:moi.prenom,tel:moi.tel,quartier:"",photo:moi.photo_url,paye:false,score:80,versements:0,cyclesPaies:0,cyclesTotal:12,evenement:null}:null;
    onCreate({id:data.id,nom:data.nom,montant:Number(data.montant),frequence:data.frequence,couleur:data.couleur,cycle:data.cycle,totalCycles:data.total_cycles,dateEcheance:data.date_echeance,caisseSociale:0,cagnotte:0,montantInitial:Number(data.montant_initial)||0,numeroOrangeMoney:data.numero_orange_money||null,numeroWave:data.numero_wave||null,numeroMoovMoney:data.numero_moov_money||null,lienWave:data.lien_wave||null,lienOrange:data.lien_orange||null,qrPaiementUrl:data.qr_paiement_url||null,prochainTour:"-",membres:moiMembre?[moiMembre]:[],checklist:[],messages:[]});
    onClose();
  };
  if(limitReached)return <Modal onClose={onClose}>
    <MH title="Limite atteinte" onClose={onClose}/>
    <div style={{textAlign:"center",padding:"10px 0 4px"}}><p style={{fontSize:40,margin:0}}>🔒</p></div>
    <p style={{color:"#F5F2EA",fontSize:15,fontWeight:700,textAlign:"center",margin:"8px 0 4px"}}>1 tontine geree, c'est le maximum en gratuit</p>
    <p style={{color:"#97A3C9",fontSize:13,textAlign:"center",lineHeight:1.6,marginBottom:20}}>Passe a THT Premium pour gerer plusieurs tontines en meme temps.</p>
    <button onClick={async()=>{
      setPayBusy(true);
      await payerAbonnement(user,"mensuel",setErr);
      setPayBusy(false);
    }} disabled={payBusy} style={{width:"100%",background:"linear-gradient(135deg,#FFE9B4 0%,#E8B04B 48%,#C38427 100%)",border:"none",borderRadius:12,padding:"13px",color:"#1B1203",fontWeight:800,fontSize:14,cursor:"pointer",marginBottom:12}}>{payBusy?"Ouverture du paiement...":"💳 Payer en ligne maintenant - 1 000 FCFA"}</button>
    <p style={{color:"#97A3C9",fontSize:11,textAlign:"center",margin:"0 0 12px"}}>OU manuellement via WhatsApp :</p>
    <div style={{display:"flex",gap:10}}>
      <button onClick={()=>window.open("https://wa.me/22376908031?text=Je%20veux%20THT%20Premium","_blank")} style={{flex:1,background:"#FF6600",border:"none",borderRadius:10,padding:"12px",color:"#fff",fontWeight:700,fontSize:13,cursor:"pointer"}}>Orange Money</button>
      <button onClick={()=>window.open("https://wa.me/22390647106?text=Je%20veux%20THT%20Premium","_blank")} style={{flex:1,background:"#0066CC",border:"none",borderRadius:10,padding:"12px",color:"#fff",fontWeight:700,fontSize:13,cursor:"pointer"}}>Wave</button>
    </div>
    <ErrBox msg={err}/>
  </Modal>;
  return <Modal onClose={onClose}>
    <MH title="Nouvelle Tontine" onClose={onClose}/>
    <Fld label="Nom de la tontine"><Inp value={nom} onChange={e=>setNom(e.target.value)} placeholder="Ex: Tontine des Mamans" maxLength={40} autoFocus/></Fld>
    <Fld label="Montant par cotisation (FCFA)"><Inp value={montant} onChange={e=>setMontant(e.target.value.replace(/\D/g,""))} placeholder="Ex: 25000" inputMode="numeric"/></Fld>
    <Fld label="Date d'échéance mensuelle"><Inp value={echeance} onChange={e=>setEcheance(e.target.value)} placeholder="Ex: 2026-07-01" type="date"/></Fld>
    <Fld label="Frequence"><div style={{display:"flex",gap:8}}>{["Hebdo","Bimensuel","Mensuel"].map(f=><button key={f} onClick={()=>setFreq(f)} style={{flex:1,padding:"10px 4px",borderRadius:10,border:"1px solid",cursor:"pointer",fontSize:12,fontWeight:700,background:freq===f?"#E8B04B":"rgba(255,255,255,0.09)",color:freq===f?"#1B1203":"#F5F2EA",borderColor:freq===f?"#E8B04B":"rgba(255,255,255,0.14)"}}>{f}</button>)}</div></Fld>
    <Fld label="Argent déjà collecté avant l'app (optionnel)"><Inp value={montantInitial} onChange={e=>setMontantInitial(e.target.value.replace(/\D/g,""))} placeholder="Ex: 50000 - laisser vide si aucun" inputMode="numeric"/></Fld>
    <SelecteurPaiement numeroOrangeMoney={numeroOrangeMoney} setNumeroOrangeMoney={setNumeroOrangeMoney} numeroWave={numeroWave} setNumeroWave={setNumeroWave} numeroMoovMoney={numeroMoovMoney} setNumeroMoovMoney={setNumeroMoovMoney}/>
    <Fld label="QR de paiement (Wave ou Orange Money) — optionnel">
      <label style={{display:"block",background:"rgba(255,255,255,0.055)",border:"1px dashed #E8B04B",borderRadius:10,padding:qrPaiementUrl?8:14,textAlign:"center",cursor:"pointer"}}>
        <input type="file" accept="image/*" onChange={choisirQRCreation} style={{display:"none"}}/>
        {qrPaiementUrl
          ? <img src={qrPaiementUrl} alt="QR" style={{maxWidth:160,maxHeight:160,borderRadius:8,display:"block",margin:"0 auto"}}/>
          : <span style={{color:"#E8B04B",fontSize:12,fontWeight:700}}>{qrUp?"Import en cours...":"📷 Importer la photo de mon QR"}</span>}
      </label>
      {qrPaiementUrl&&<button onClick={()=>setQrPaiementUrl("")} style={{background:"transparent",border:"none",color:"#FB7185",fontSize:11,fontWeight:700,cursor:"pointer",marginTop:6}}>Retirer le QR</button>}
    </Fld>
    <ErrBox msg={err}/>
    <Btn onClick={handle} disabled={busy}>{busy?"Creation...":"Creer ma tontine"}</Btn>
  </Modal>;
};

class ErrorBoundary extends Component {
  constructor(props){super(props);this.state={error:null};}
  static getDerivedStateFromError(error){return {error};}
  componentDidCatch(error,info){console.error("THT crash:",error,info);}
  render(){
    if(this.state.error){
      return (
        <div style={{minHeight:"100vh",background:"rgba(255,255,255,0.055)",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:24,textAlign:"center"}}>
          <p style={{fontSize:40,margin:"0 0 14px"}}>⚠️</p>
          <p style={{color:"#F5F2EA",fontWeight:800,fontSize:16,margin:"0 0 10px"}}>Un probleme technique est survenu</p>
          <div style={{background:"rgba(255,255,255,0.055)",border:"1px solid #E0526A",borderRadius:12,padding:14,marginBottom:20,maxWidth:420,width:"100%"}}>
            <p style={{color:"#FB7185",fontSize:12,fontFamily:"monospace",wordBreak:"break-word",margin:0,textAlign:"left"}}>{String(this.state.error?.message||this.state.error)}</p>
          </div>
          <button onClick={()=>{this.setState({error:null});window.location.href="/";}} style={{background:"linear-gradient(135deg,#FFE9B4 0%,#E8B04B 48%,#C38427 100%)",border:"none",borderRadius:14,padding:"13px 28px",color:"#1B1203",fontWeight:800,fontSize:14,cursor:"pointer"}}>Retour a l accueil</button>
          <p style={{color:"#97A3C9",fontSize:11,marginTop:16}}>Envoie une capture de ce message a l assistance THT</p>
        </div>
      );
    }
    return this.props.children;
  }
}

function AppInner() {
  const [user,setUser]=useState(null);
  const [checking,setChecking]=useState(true);
  const [nav,setNav]=useState("home");
  const [groupes,setGroupes]=useState([]);
  const [sel,setSel]=useState(null);
  const [toast,setToast]=useState(null);
  const [showC,setShowC]=useState(false);
  const [lang,setLang]=useState("fr");
  const [participations,setParticipations]=useState([]);
  const [selPart,setSelPart]=useState(null);
  const [deepLink,setDeepLink]=useState(null);
  const [cagnottes,setCagnottes]=useState([]);
  // Nombre de filleul(e)s ayant cree un compte avec mon code de parrainage.
  // Sert a calculer le bonus de places de membres (voir limiteMembres()).
  const [filleulsCount,setFilleulsCount]=useState(0);
  // Nombre de messages non lus par tontine, pour afficher une pastille des l'accueil :
  // le badge du systeme sur l'icone de l'app ne dit pas DANS QUELLE tontine il faut aller.
  const [nonLusParGroupe,setNonLusParGroupe]=useState({});
  const [selCagnotte,setSelCagnotte]=useState(null);
  const [showCagnotteModal,setShowCagnotteModal]=useState(false);
  const [adminUnlocked,setAdminUnlocked]=useState(false);
  const [showPinConfirm,setShowPinConfirm]=useState(false);
  const [pinConfirm,setPinConfirm]=useState("");
  const [pinConfirmBusy,setPinConfirmBusy]=useState(false);
  const [pinConfirmErr,setPinConfirmErr]=useState("");

  const showToast=useCallback((msg,type)=>setToast({msg,type}),[]);

  const changeLang=useCallback(async(l)=>{
    setAppLang(l);setLang(l);
    if(user)await supabase.from("users").update({langue:l}).eq("id",user.id);
  },[user]);

  const compterNonLus=useCallback(async(uid,ids)=>{
    if(!ids||ids.length===0){setNonLusParGroupe({});return;}
    // On ne remonte que les 30 derniers jours : au-dela, un message n'est plus "nouveau".
    const limite=new Date(Date.now()-30*86400000).toISOString();
    const {data,error}=await supabase.from("messages")
      .select("groupe_id,created_at,destinataire_user_id")
      .in("groupe_id",ids).neq("auteur_user_id",uid).gt("created_at",limite);
    if(error)return;
    const parGroupe={};
    (data||[]).forEach(m=>{
      if(m.destinataire_user_id&&m.destinataire_user_id!==uid)return; // prive destine a quelqu'un d'autre
      const vu=dateVu(uid,m.groupe_id,"social");
      if(vu&&m.created_at<=vu)return;
      parGroupe[m.groupe_id]=(parGroupe[m.groupe_id]||0)+1;
    });
    setNonLusParGroupe(parGroupe);
  },[]);

  const loadFilleuls=useCallback(async(uid)=>{
    const {count,error}=await supabase.from("parrainages").select("*",{count:"exact",head:true}).eq("parrain_id",uid);
    if(!error)setFilleulsCount(count||0);
  },[]);

  const loadCagnottes=useCallback(async(uid)=>{
    const {data,error}=await supabase.from("cagnottes").select("*").eq("user_id",uid).order("created_at",{ascending:false});
    if(!error)setCagnottes(data||[]);
  },[]);

  const loadParticipations=useCallback(async(uid)=>{
    const {data:mine,error}=await supabase.from("membres").select("*").eq("user_id",uid);
    if(error||!mine||mine.length===0){setParticipations([]);return;}
    const groupeIds=[...new Set(mine.map(m=>m.groupe_id))];
    const {data:gs}=await supabase.from("groupes").select("*").in("id",groupeIds);
    const full=await Promise.all((gs||[]).map(async g=>{
      // Ces 8 lectures sont independantes : on les lance EN PARALLELE au lieu d'attendre
      // l'une apres l'autre. Pour une personne dans plusieurs tontines, l'accueil s'ouvre
      // nettement plus vite (un seul aller-retour groupe au lieu de huit en file).
      const [{data:membres},{data:checklist},{data:tirages},{data:elections},{data:mesVotes},{data:prets},{data:rapports},{data:createur}]=await Promise.all([
        supabase.from("membres").select("*").eq("groupe_id",g.id).order("ordre",{ascending:true}),
        supabase.from("checklist").select("*").eq("groupe_id",g.id).order("created_at",{ascending:true}),
        supabase.from("tirages").select("*").eq("groupe_id",g.id).order("cycle",{ascending:true}),
        supabase.from("elections").select("*").eq("groupe_id",g.id).eq("statut","ouverte"),
        supabase.from("votes").select("*").eq("voter_user_id",uid),
        supabase.from("prets").select("*").eq("groupe_id",g.id).order("created_at",{ascending:false}),
        supabase.from("rapports_reunion").select("*").eq("groupe_id",g.id).order("date_reunion",{ascending:false}),
        supabase.from("users").select("id,prenom,photo_url").eq("id",g.user_id).single(),
      ]);
      const moi=mine.find(m=>m.groupe_id===g.id);
      // "Deja collecte" = la somme reellement RECUE ce cycle, donc la somme des versements.
      // Avant, on comptait la cotisation entiere des seuls membres a jour : les paiements
      // partiels s'affichaient pendant la session puis disparaissaient au rechargement,
      // et le chiffre changeait tout seul sous les yeux de la creatrice.
      const cagnotteVraie=(membres||[]).reduce((s,m)=>s+(Number(m.versements)||0),0)+(Number(g.montant_initial)||0);
      return {
        id:g.id,nom:g.nom,montant:Number(g.montant)||0,frequence:g.frequence||"Mensuel",couleur:g.couleur||"#E8B04B",
        cycle:g.cycle||1,totalCycles:g.total_cycles||12,reglement:g.reglement||"",dateEcheance:g.date_echeance,
        caisseSociale:Number(g.caisse_sociale)||0,cagnotte:cagnotteVraie,montantInitial:Number(g.montant_initial)||0,
        createurUserId:g.user_id,createurNom:createur?.prenom||"Creatrice",createurPhoto:createur?.photo_url||null,
        numeroOrangeMoney:g.numero_orange_money||null,numeroWave:g.numero_wave||null,numeroMoovMoney:g.numero_moov_money||null,lienWave:g.lien_wave||null,lienOrange:g.lien_orange||null,qrPaiementUrl:g.qr_paiement_url||null,
        membres:(membres||[]).map(m=>({id:m.id,userId:m.user_id,prenom:m.prenom,tel:m.tel,paye:m.paye,quartier:m.quartier,photo:m.photo_url,evenement:m.evenement,versements:Number(m.versements)||0,cyclesPaies:m.cycles_paies||0,score:m.score||80,role_bureau:m.role_bureau,montantPerso:m.montant_perso!=null?Number(m.montant_perso):null,roleCollecteur:!!m.role_collecteur,dette:Number(m.dette)||0})),
        checklist:(checklist||[]).map(c=>({id:c.id,label:c.label,done:c.done})),
        tirages:tirages||[],
        elections:(elections||[]).map(e=>({...e,dejaVote:(mesVotes||[]).some(v=>v.election_id===e.id)})),
        prets:prets||[],
        rapports:rapports||[],
        moi:moi?{id:moi.id,versements:Number(moi.versements)||0,paye:moi.paye,cyclesPaies:moi.cycles_paies||0}:null,
      };
    }));
    setParticipations(full);
    return full;
  },[]);

  const loadGroupes=useCallback(async(uid)=>{
    const {data:gs,error}=await supabase.from("groupes").select("*").eq("user_id",uid).order("created_at",{ascending:false});
    if(error){showToast("Erreur de chargement des tontines","error");return;}
    const full=await Promise.all((gs||[]).map(async g=>{
      const {data:membres}=await supabase.from("membres").select("*").eq("groupe_id",g.id).order("ordre",{ascending:true});
      const {data:checklist}=await supabase.from("checklist").select("*").eq("groupe_id",g.id).order("created_at",{ascending:true});
      const {data:tirageActuel}=await supabase.from("tirages").select("*").eq("groupe_id",g.id).eq("cycle",g.cycle||1).maybeSingle();
      const mm=(membres||[]).map(m=>({id:m.id,userId:m.user_id,prenom:m.prenom,tel:m.tel,quartier:m.quartier,photo:m.photo_url,paye:m.paye,evenement:m.evenement,score:m.score??80,versements:Number(m.versements)||0,cyclesPaies:m.cycles_paies||0,cyclesTotal:(g.total_cycles||12)-(g.cycle||1)+1,montantPerso:m.montant_perso!=null?Number(m.montant_perso):null,roleCollecteur:!!m.role_collecteur,dette:Number(m.dette)||0}));
      // Meme definition que dans loadParticipations : la somme reellement versee.
      const cagnotteVraie=mm.reduce((s,m)=>s+(Number(m.versements)||0),0)+(Number(g.montant_initial)||0);
      const gagnant=tirageActuel?mm.find(m=>m.id===tirageActuel.membre_id):null;
      return {
        id:g.id,nom:g.nom,montant:Number(g.montant)||0,frequence:g.frequence||"Mensuel",couleur:g.couleur||"#E8B04B",
        cycle:g.cycle||1,totalCycles:g.total_cycles||12,dateEcheance:g.date_echeance,reglement:g.reglement||"",
        caisseSociale:Number(g.caisse_sociale)||0,cagnotte:cagnotteVraie,montantInitial:Number(g.montant_initial)||0,
        numeroOrangeMoney:g.numero_orange_money||null,numeroWave:g.numero_wave||null,numeroMoovMoney:g.numero_moov_money||null,lienWave:g.lien_wave||null,lienOrange:g.lien_orange||null,qrPaiementUrl:g.qr_paiement_url||null,
        prochainTour:gagnant?gagnant.prenom:"A tirer au sort",
        membres:mm,
        checklist:(checklist||[]).map(c=>({id:c.id,label:c.label,done:c.done})),
        messages:[],
      };
    }));
    setGroupes(full);
    return full;
  },[showToast]);

  const openFromUrl=(search,gs,parts)=>{
    const params=new URLSearchParams(search);
    const gid=params.get("g");
    if(!gid)return false;
    const tab=params.get("tab")||undefined;
    const dm=params.get("dm");
    const dmName=params.get("dmName");
    const thread=dm?{userId:dm,prenom:dmName?decodeURIComponent(dmName):"Contact"}:null;
    const owned=(gs||[]).find(g=>g.id===gid);
    if(owned){setDeepLink({tab,thread});pushBack(()=>{setSel(null);setDeepLink(null);loadGroupes(userRef.current.id);loadParticipations(userRef.current.id);});setSel(owned);setNav("home");return true;}
    const part=(parts||[]).find(g=>g.id===gid);
    if(part){setDeepLink({tab,thread});pushBack(()=>{setSelPart(null);setDeepLink(null);});setSelPart(part);setNav("home");return true;}
    return false;
  };

  const backStackRef=useRef([]);
  useEffect(()=>{
    const handler=()=>{
      const fn=backStackRef.current.pop();
      if(fn)fn();
    };
    window.addEventListener("popstate",handler);
    return()=>window.removeEventListener("popstate",handler);
  },[]);
  const pushBack=(closeFn)=>{
    window.history.pushState({thtScreen:true},"");
    backStackRef.current.push(closeFn);
  };
  const backTap=()=>{
    if(backStackRef.current.length>0)window.history.back();
  };

  const userRef=useRef(null);
  useEffect(()=>{userRef.current=user;},[user]);

  useEffect(()=>{
    if(!user)return;
    const channel=supabase.channel(`private-messages-${user.id}`)
      .on("postgres_changes",{event:"INSERT",schema:"public",table:"messages",filter:`destinataire_user_id=eq.${user.id}`},(payload)=>{
        const m=payload.new;
        showToast(`💬 ${m.auteur_nom} : ${m.audio_url?"message vocal":(m.texte||"nouveau message")}`);
      })
      .subscribe();
    return()=>{supabase.removeChannel(channel);};
  },[user?.id]);

  useEffect(()=>{
    if(!("serviceWorker" in navigator))return;
    const handler=async(event)=>{
      if(event.data?.type!=="NAVIGATE")return;
      const u=userRef.current;
      if(!u)return;
      const [gs,parts]=await Promise.all([loadGroupes(u.id),loadParticipations(u.id)]);
      const url=new URL(event.data.url,window.location.origin);
      openFromUrl(url.search,gs,parts);
    };
    navigator.serviceWorker.addEventListener("message",handler);
    return()=>navigator.serviceWorker.removeEventListener("message",handler);
  },[]);

  useEffect(()=>{
    (async()=>{
      const sessionUser=await getSession();
      if(sessionUser){
        setUser(sessionUser);setAppLang(sessionUser.langue||"fr");setLang(sessionUser.langue||"fr");
        const [gs,parts]=await Promise.all([loadGroupes(sessionUser.id),loadParticipations(sessionUser.id),loadCagnottes(sessionUser.id),loadFilleuls(sessionUser.id)]);
        compterNonLus(sessionUser.id,[...new Set([...(gs||[]).map(g=>g.id),...(parts||[]).map(g=>g.id)])]);
        openFromUrl(window.location.search,gs,parts);
      }
      setChecking(false);
    })();
  },[]);

  // Rafraichissement automatique quand l'app revient au premier plan (onglet reactive,
  // retour depuis une autre app, PWA rouverte). Sans ca, une tontine qu'on vient de
  // rejoindre, un nouveau parrainage ou un versement n'apparaissaient qu'apres avoir
  // ferme/rouvert l'app : la personne devait "actualiser" a la main. On ne recharge
  // que si l'app est visible et qu'une utilisatrice est connectee.
  useEffect(()=>{
    const rafraichir=()=>{
      const u=userRef.current;
      if(!u||document.visibilityState!=="visible")return;
      loadGroupes(u.id);loadParticipations(u.id);loadFilleuls(u.id);loadCagnottes(u.id);
    };
    document.addEventListener("visibilitychange",rafraichir);
    window.addEventListener("focus",rafraichir);
    return()=>{
      document.removeEventListener("visibilitychange",rafraichir);
      window.removeEventListener("focus",rafraichir);
    };
  },[loadGroupes,loadParticipations,loadFilleuls,loadCagnottes]);

  // Securite du panneau admin : une fois le code entre, l'acces restait ouvert TOUTE la
  // session (adminUnlocked ne retombait jamais a false). Si le telephone changeait de
  // mains, on entrait dans l'admin sans code. On reverrouille donc des que l'app passe en
  // arriere-plan : au retour, le code est redemande. Si on etait sur l'ecran admin, on en
  // sort pour que la re-entree repasse par le code.
  useEffect(()=>{
    const reverrouiller=()=>{
      if(document.visibilityState==="hidden"){
        setAdminUnlocked(false);
        if(nav==="admin")setNav("profil");
      }
    };
    document.addEventListener("visibilitychange",reverrouiller);
    return()=>document.removeEventListener("visibilitychange",reverrouiller);
  },[nav]);

  // Filet supplementaire : l'acces admin expire aussi tout seul apres 5 minutes.
  useEffect(()=>{
    if(!adminUnlocked)return;
    const t=setTimeout(()=>setAdminUnlocked(false),5*60*1000);
    return()=>clearTimeout(t);
  },[adminUnlocked]);

  const handleLogout=async()=>{
    await logoutUser();
    setUser(null);setNav("home");setSel(null);
  };

  const contribuerCagnotteId=new URLSearchParams(window.location.search).get("contribuer");
  if(contribuerCagnotteId)return <ContributionPubliqueScreen cagnotteId={contribuerCagnotteId}/>;

  // Page publique de paiement universel (ouverte par le QR THT) : aucune connexion requise.
  if(new URLSearchParams(window.location.search).get("paiement"))return <PaiementScreen/>;

  if(checking){
    return <div style={{minHeight:"100vh",background:"linear-gradient(160deg,rgba(255,255,255,0.055),rgba(255,255,255,0.03))",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",overflow:"hidden"}}>
      <style>{`
        @keyframes thtLogoIn { 0%{opacity:0;transform:scale(0.6);} 60%{opacity:1;transform:scale(1.08);} 100%{opacity:1;transform:scale(1);} }
        @keyframes thtGlow { 0%,100%{box-shadow:0 0 20px 0 rgba(232,176,75,0.25);} 50%{box-shadow:0 0 40px 10px rgba(232,176,75,0.5);} }
        @keyframes thtTextIn { 0%{opacity:0;transform:translateY(8px);} 100%{opacity:1;transform:translateY(0);} }
        @keyframes thtBarFill { 0%{width:0%;margin-left:0%;} 50%{width:60%;margin-left:20%;} 100%{width:0%;margin-left:100%;} }
      `}</style>
      <div style={{width:84,height:84,borderRadius:22,overflow:"hidden",animation:"thtLogoIn 0.8s cubic-bezier(0.34,1.56,0.64,1) forwards, thtGlow 2s ease-in-out 0.8s infinite"}}>
        <img src={logoIcon} alt="THT" style={{width:"100%",height:"100%",objectFit:"cover"}}/>
      </div>
      <p style={{color:"#F5F2EA",fontSize:20,fontWeight:900,letterSpacing:4,margin:"18px 0 4px",opacity:0,animation:"thtTextIn 0.6s ease-out 0.5s forwards"}}>THT</p>
      <p style={{color:"#97A3C9",fontSize:11,margin:0,opacity:0,animation:"thtTextIn 0.6s ease-out 0.7s forwards"}}>Tontine Habi Traore</p>
      <div style={{width:120,height:2,background:"rgba(255,255,255,0.09)",borderRadius:2,marginTop:26,overflow:"hidden"}}>
        <div style={{height:"100%",background:"linear-gradient(90deg,#E8B04B,#FFE1A1)",animation:"thtBarFill 1.6s ease-in-out infinite"}}/>
      </div>
    </div>;
  }

  if(!user)return <AuthScreen onLogin={async(u)=>{setUser(u);setAppLang(u.langue||"fr");setLang(u.langue||"fr");const [gs2,parts2]=await Promise.all([loadGroupes(u.id),loadParticipations(u.id),loadCagnottes(u.id),loadFilleuls(u.id)]);
      compterNonLus(u.id,[...new Set([...(gs2||[]).map(g=>g.id),...(parts2||[]).map(g=>g.id)])]);if(u.linkedCount>0)showToast(`Bienvenue ! Tu as ete ajoute(e) a ${u.linkedCount} tontine(s) !`);}}/>;
  const cu={...user,groupesCount:groupes.length,filleulsCount};
  const NAV=[["home","🏠",t("accueil")],["cagnottes","🎁",t("cagnottesNav")],["epargne","🏺",t("epargne")],["haby","🤖","HABY"],["profil","👤",t("profil")]];

  return(
    <div className="tht-shell" style={{background:"transparent",minHeight:"100vh",margin:"0 auto",position:"relative",display:"flex",flexDirection:"column"}}>
      <style>{`*{box-sizing:border-box;font-family:'Manrope',system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;}
h1,h2,h3{font-family:'Sora','Manrope',system-ui,sans-serif;letter-spacing:-.015em;}
::-webkit-scrollbar{width:0;height:0;}
input{-webkit-appearance:none;}
input::placeholder,textarea::placeholder{color:#6F7BA6;}

/* --- Affichage mobile par defaut (colonne etroite centree) --- */
.tht-shell{max-width:440px;}
.tht-nav{max-width:440px;}

/* --- Tablette : on elargit un peu la colonne --- */
@media (min-width:700px){
  .tht-shell{max-width:600px;}
  .tht-nav{max-width:600px;}
}

/* --- Ordinateur : vraie mise en page large, listes sur 2 colonnes --- */
@media (min-width:1000px){
  .tht-shell{max-width:1040px;}
  /* La barre de navigation reste lisible : elle ne s'etire pas sur toute la largeur */
  .tht-nav{max-width:600px;}
  /* Les listes de cartes passent sur 2 colonnes au lieu d'une longue colonne etroite */
  .tht-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));column-gap:14px;align-items:start;}
  /* Les fenetres modales profitent aussi de la largeur disponible */
  .tht-modal{max-width:560px;border-radius:20px;}
}

/* --- Tres grand ecran : 3 colonnes pour les listes --- */
@media (min-width:1400px){
  .tht-shell{max-width:1280px;}
  .tht-grid{grid-template-columns:repeat(3,minmax(0,1fr));}
}`}</style>
      <div style={{flex:1,overflowY:"auto",paddingBottom:nav==="haby"?0:104}}>
        {selCagnotte?<CagnotteScreen cagnotte={selCagnotte} user={cu} onBack={backTap} onToast={showToast} onUpdate={(id,upd)=>{setCagnottes(cs=>cs.map(c=>c.id===id?{...c,...upd}:c));setSelCagnotte(c=>c&&c.id===id?{...c,...upd}:c);}} onDelete={(id)=>{setCagnottes(cs=>cs.filter(c=>c.id!==id));setSelCagnotte(null);}}/>
        :selPart?<ParticipationScreen groupe={selPart} deepLink={deepLink} onBack={backTap} user={cu} onToast={showToast} onVoted={()=>loadParticipations(cu.id)}/>
        :sel?<GroupeScreen groupe={sel} deepLink={deepLink} onBack={backTap} onToast={showToast} user={cu} onDeleteGroupe={(gid)=>{setGroupes(gs=>gs.filter(g=>g.id!==gid));setSel(null);}} onUpdateGroupe={(gid,upd)=>{setGroupes(gs=>gs.map(g=>g.id===gid?{...g,...upd}:g));setSel(s=>s&&s.id===gid?{...s,...upd}:s);}}/>
        :nav==="home"?<HomeScreen user={cu} groupes={groupes} nonLus={nonLusParGroupe} onSelectGroupe={(g)=>{setDeepLink(null);pushBack(()=>{setSel(null);setDeepLink(null);loadGroupes(cu.id);loadParticipations(cu.id);compterNonLus(cu.id,[...new Set([...groupes.map(x=>x.id),...participations.map(x=>x.id)])]);});setSel(g);}} onCreer={()=>setShowC(true)} onProfil={()=>setNav("profil")} participations={participations} onSelectParticipation={(g)=>{setDeepLink(null);pushBack(()=>{setSelPart(null);setDeepLink(null);compterNonLus(cu.id,[...new Set([...groupes.map(x=>x.id),...participations.map(x=>x.id)])]);});setSelPart(g);}} onOpenHaby={()=>setNav("haby")} onOpenCagnottes={()=>setNav("cagnottes")}/>
        :nav==="cagnottes"?<CagnottesScreen cagnottes={cagnottes} onCreerCagnotte={()=>setShowCagnotteModal(true)} onSelectCagnotte={(c)=>{pushBack(()=>setSelCagnotte(null));setSelCagnotte(c);}}/>
        :nav==="epargne"?<EpargneScreen onToast={showToast} user={cu}/>
        :nav==="haby"?<HabyScreen groupes={groupes} user={cu}/>
        :nav==="admin"?<AdminScreen onBack={backTap} onToast={showToast} currentUserId={cu.id} user={cu}/>
        :nav==="profil"?<ProfilScreen user={cu} onLogout={handleLogout} onToast={showToast} onUpgrade={()=>showToast("Envoie ton paiement et contacte le support WhatsApp","warn")} onOpenAdmin={()=>{if(adminUnlocked){pushBack(()=>setNav("profil"));setNav("admin");}else{setPinConfirm("");setPinConfirmErr("");setShowPinConfirm(true);}}} lang={lang} onChangeLang={changeLang} onUpdateUser={(upd)=>setUser(u=>({...u,...upd}))}/>:null}
      </div>
      <div className="tht-nav" style={{position:"fixed",bottom:0,left:"50%",transform:"translateX(-50%)",width:"100%",background:"rgba(255,255,255,0.055)",borderTop:"1px solid rgba(255,255,255,0.09)",display:"flex",padding:"8px 0 20px",zIndex:100}}>
        {NAV.map(([id,icon,lbl])=><button key={id} aria-current={nav===id&&!sel?"page":undefined} onClick={()=>{setSel(null);setNav(id);}} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",background:"none",border:"none",color:nav===id&&!sel?"#E8B04B":"#97A3C9",cursor:"pointer",padding:"4px 0",gap:3}}><span style={{fontSize:22}}>{icon}</span><span style={{fontSize:10,fontWeight:600}}>{lbl}</span></button>)}
      </div>
      {showC&&<ModalCreer onClose={()=>setShowC(false)} onCreate={g=>{setGroupes(p=>[...p,g]);showToast("Tontine créée !");}} user={cu}/>}
      {showCagnotteModal&&<ModalCreerCagnotte onClose={()=>setShowCagnotteModal(false)} onCreate={c=>{setCagnottes(cs=>[c,...cs]);showToast("Cagnotte créée !");}} user={cu}/>}
      {showPinConfirm&&<Modal onClose={()=>setShowPinConfirm(false)}>
        <MH title="Confirme ton PIN" onClose={()=>setShowPinConfirm(false)}/>
        <p style={{color:"#97A3C9",fontSize:13,marginBottom:16,lineHeight:1.6}}>Pour proteger le panneau administrateur, entre a nouveau ton code PIN.</p>
        <Fld label="Code PIN"><Inp value={pinConfirm} onChange={e=>setPinConfirm(e.target.value.replace(/\D/g,"").slice(0,4))} placeholder="****" type="password" inputMode="numeric" maxLength={4} autoFocus/></Fld>
        <ErrBox msg={pinConfirmErr}/>
        <Btn onClick={async()=>{
          if(pinConfirm.length!==4)return setPinConfirmErr("Le PIN doit faire 4 chiffres");
          setPinConfirmBusy(true);
          const ok=await verifyPin(cu.tel,pinConfirm);
          setPinConfirmBusy(false);
          if(!ok)return setPinConfirmErr("PIN incorrect");
          setAdminUnlocked(true);setShowPinConfirm(false);pushBack(()=>setNav("profil"));setNav("admin");
        }} disabled={pinConfirmBusy}>{pinConfirmBusy?"Vérification...":"Confirmer"}</Btn>
      </Modal>}
      {toast&&<Toast msg={toast.msg} type={toast.type} onClose={()=>setToast(null)}/>}
    </div>
  );
}

export default function App() {
  return <ErrorBoundary><AppInner/><MiseAJour/></ErrorBoundary>;
}
