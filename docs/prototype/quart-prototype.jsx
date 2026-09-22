import React, { useReducer, useState, useMemo, useRef, useEffect } from "react";
import {
  Home, CalendarDays, CalendarCheck, Inbox, Settings as SettingsIcon, Users, Send, Lock,
  Check, X, Bell, Plus, Minus, AlertTriangle, RefreshCw, ArrowLeftRight, Megaphone, Sun, Moon,
  Wand2, ChevronRight, Clock, Languages, Gift, History, Trash2, Copy, CalendarPlus, Undo2, ShieldAlert,
  ImagePlus, MessageSquareText, ThumbsUp
} from "lucide-react";

/* ============================================================
   Quart — clickable prototype (Presotea Montmorency)
   No backend. All state is in memory and resets on reload.
   ============================================================ */

/* ---------------- i18n ---------------- */
const STR = {
  en: {
    appName: "Quart", workplace: "Presotea Montmorency",
    viewAs: "View as", admin: "Owner", employee: "Barista",
    navHome: "Home", navSchedule: "Schedule", navAvail: "Availability", navRequests: "Requests", navShifts: "Open shifts", navSettings: "Settings",
    open: "Opening", close: "Closing", hours: "h", level: "L{n}",
    weekN: "Week {n}", period: "Period", periodDates: "{a} to {b}",
    statusCollecting: "Collecting availability", statusDraft: "Draft", statusPublished: "Published v{n}",
    availSent: "{a} of {b} sent", availYours: "Your availability", notSubmitted: "Not sent", sent: "Sent",
    send: "Send availability", resend: "Update and resend", locked: "Availability is closed",
    lockedNote: "The schedule is being built. Ask Philippe to reopen yours if something changed.",
    reopen: "Reopen", reopened: "Reopened for {name}",
    sameAsLast: "Same as last period", importGcal: "Import from Google Calendar", copyWeek: "Copy week 1 to week 2",
    gcalDone: "Imported {n} blocks you are free for. Review before sending.",
    availSentToast: "Availability sent", availHint: "Tap the shifts you can work.",
    generate: "Generate schedule", regenerate: "Generate again", generating: "Building…",
    generated: "Schedule generated", publish: "Publish", update: "Update schedule", published: "Schedule published",
    updated: "Schedule updated to v{n}", nothingToUpdate: "No changes to publish",
    issues: "Issues", noIssues: "No issues", issuesN: "{n} issues",
    understaffed: "{d} {k}: {a} of {b} people", noL3: "{d} {k}: no level 3", underHours: "{name}: {a} of {b} h",
    overHours: "{name}: {a} h, wanted {b}", unavailAssigned: "{name} is on {d} {k} but is not available",
    notSubAssigned: "{name} is on {d} {k} and never sent availability",
    tooManyDays: "{name}: {n} days in a row", doubleDay: "{name} works both shifts on {d}",
    roster: "On this shift", addSomeone: "Add someone", available: "Available", unavailable: "Not available",
    noAnswer: "No answer", lockPerson: "Keep", remove: "Remove", locksKept: "Locked assignments stay put when you generate again",
    myShifts: "My shifts", teamShifts: "Whole team", nextShift: "Next shift", noShifts: "No shifts yet",
    notPublished: "The schedule is not published yet.", giveAway: "Give away", givenAway: "Up for grabs",
    giveAwayDone: "Posted. You stay on it until someone takes it.", claim: "Claim", claimed: "Claim sent",
    claimedDirect: "Shift is yours", tradeShift: "Trade", trade: "Trade",
    tradeWith: "Trade with", pickMine: "Your shift", pickTheirs: "Their shift", sendTrade: "Send request",
    tradeSent: "Trade request sent", tradeAccept: "Accept", tradeDecline: "Decline", tradeCancel: "Cancel",
    tradeAccepted: "Accepted. Waiting for Philippe.", tradeApproved: "Shifts swapped", tradeExpires: "Expires in {n} days",
    pendingApproval: "Waiting for approval", awaitingCoworker: "Waiting for {name}", awaitingAdmin: "Waiting for Philippe",
    approve: "Approve", decline: "Decline", approved: "Approved", declined: "Declined",
    reqClaims: "Claims", reqTrades: "Trades", reqGiveaways: "Unclaimed give-aways", noRequests: "Nothing waiting on you",
    pickOne: "{n} people want this shift. Pick one.",
    announcements: "Announcements", writeAnnouncement: "Write something for the team", post: "Post", posted: "Posted",
    notifications: "Notifications", noNotifs: "Nothing new", markRead: "Mark all read",
    openShifts: "Open shifts", openShiftsN: "{n} open shifts", yourHours: "Your hours", ofDesired: "{a} of {b} h this week",
    settingsShifts: "Shift template", settingsRules: "Generator rules", settingsApprovals: "Approvals", settingsPublish: "Before publishing",
    periodLength: "Period length", weeksN: "{n} weeks", weekOne: "1 week",
    maxDays: "Most days in a row", fairOpen: "Spread openings evenly", fairClose: "Spread closings evenly",
    approvalClaims: "Approve claims", approvalTrades: "Approve trades", iWork: "I work shifts too",
    checkBlock: "Block", checkConfirm: "Ask me", checkShow: "Just show",
    chkUnderstaffed: "Shifts missing people", chkNoL3: "Shifts with no level 3", chkUnavailable: "People who are not available",
    joinCode: "Join code", copyCode: "Copy", copied: "Copied",
    headcount: "People per shift", requiresL3: "Needs a level 3",
    blockedPublish: "Fix the blocking issues first", confirmPublish: "Publish with {n} issues?", cancel: "Cancel", confirm: "Publish anyway",
    reset: "Reset prototype", resetDone: "Back to the start", language: "Français", theme: "Theme",
    demoNote: "Prototype. Nothing is saved.",
    alreadyWorking: "You already work that day", claimNoL3: "No level 3 on this shift yet",
    hoursShort: "{a}/{b} h", desiredHours: "Wants {n} h per week",
    scheduleSentTo: "Schedule sent to {n} people", changedFor: "Changed for {n} people",
    nfAvailRequest: "Send your availability for {a} to {b}",
    nfPublished: "The schedule is out. Check your shifts.",
    nfUpdated: "Your schedule changed. Take a look.",
    nfGiveaway: "{name} is giving away {d} {k}",
    nfClaim: "{name} wants {d} {k}", nfTrade: "{name} wants to trade shifts with you",
    nfTradeAdmin: "{a} and {b} want to swap shifts", nfUnclaimed: "{d} {k} still has nobody",
    nfClaimApproved: "You got {d} {k}", nfReopened: "Philippe reopened your availability",
    everyone: "Everyone", you: "you",
    signIn: "Sign in", signUp: "Create account", signOut: "Sign out",
    emailL: "Email", passwordL: "Password", confirmL: "Confirm password",
    firstNameL: "First name", lastNameL: "Last name",
    forgot: "Forgot your password?", forgotTitle: "Reset your password",
    forgotBody: "Enter your email and we will send you a link to choose a new password.",
    sendResetLink: "Send the link", resetSentTitle: "Check your email",
    resetSentBody: "A link was sent to {email}. It works once and expires in 30 minutes.",
    openLink: "Open the link (prototype)", newPasswordL: "New password",
    saveNewPassword: "Save new password", passwordChanged: "Password changed",
    backToSignIn: "Back to sign in", noAccount: "No account yet?", haveAccount: "Already have an account?",
    verifyTitle: "Confirm your email", verifyBody: "We sent a confirmation link to {email}. Confirm it to start using Quart.",
    verifiedTitle: "Email confirmed", verifiedBody: "Your account is ready. Next, join your workplace with the code your manager gives you.",
    continueBtn: "Continue", demoAccounts: "Prototype accounts — tap one to fill the form",
    errRequired: "Required", errEmail: "That does not look like an email address",
    errShortPw: "At least 8 characters", errMatch: "The two passwords do not match",
    errWeakPw: "This password appears in known breaches. Choose another.",
    errTaken: "An account already uses this email", errCredentials: "Wrong email or password",
    pwHint: "8 characters minimum. Checked against known breached passwords.",
    myWorkplaces: "Your workplaces", noMembership: "You are not in a workplace yet",
    noMembershipBody: "Ask your manager for the 10-character code and enter it here.",
    joinTitle: "Join a workplace", joinCodeL: "Join code", join: "Join",
    errCode: "No workplace matches that code", joined: "You are in",
    createWorkplaceBtn: "Create workplace", membersN: "{n} members", enterWp: "Open",
    platformNote: "You are signed in as the platform admin. You are not a member of any workplace and cannot open one.",
    step1: "Workplace", step2: "Shifts", step3: "Setup", stepOf: "Step {a} of {b}",
    wpNameL: "Workplace name", wpAddressL: "Address", next: "Next", back: "Back",
    createBtn: "Create", addBlock: "Add this shift", startL: "Start", endL: "End", repeatOn: "Repeat on",
    blocksN: "{n} shifts per week", removeBlock: "Remove", noBlocks: "Add your first shift above.",
    setupTitle: "How many people, and what each shift needs",
    requiredLevelL: "Requires", noneL: "Nothing",
    wpCreatedTitle: "{name} is ready", wpCreatedBody: "Share this code with your team so they can join.",
    backToList: "Back to your workplaces", emptyWpTitle: "Nobody has joined yet",
    emptyWpBody: "Share the join code. Once people are in, you can collect availability and generate a schedule.",
    templateTitle: "Shift template", templateNote: "Changing a shift rebuilds the period and clears the draft schedule.",
    daysL: "Days", everyDay: "Every day", resetPrototype: "Prototype reset",
    templateChanged: "Template updated, draft cleared", overnightNo: "A shift cannot cross midnight",
    navNews: "News", newsSub: "Announcements and recipes from Philippe",
    addPhotos: "Add photos", imagesPrivate: "Only members of this workplace can see these. Location data is removed from photos.",
    imgTypeErr: "Only JPEG, PNG or WebP images", imgSizeErr: "That image is over 10 MB", imgCountErr: "Up to {n} images per post",
    deletePost: "Delete post", deletedPost: "Post deleted", noAnnouncements: "Nothing posted yet",
    latestAnnouncement: "Latest announcement", photoPost: "{n} photo(s)", openImage: "Open image",
    availComment: "Comment (optional)", availCommentPh: "Anything Philippe should know about your availability this period",
    availCommentWho: "Only Philippe sees this.",
    settingsTeam: "Team levels", levelsHint: "You are the only one who can change levels.",
    tradeIncoming: "Trade request from {name}", tradeOutgoing: "Trade you asked for",
  },
  fr: {
    appName: "Quart", workplace: "Presotea Montmorency",
    viewAs: "Voir comme", admin: "Propriétaire", employee: "Barista",
    navHome: "Accueil", navSchedule: "Horaire", navAvail: "Disponibilités", navRequests: "Demandes", navShifts: "Quarts libres", navSettings: "Réglages",
    open: "Ouverture", close: "Fermeture", hours: "h", level: "N{n}",
    weekN: "Semaine {n}", period: "Période", periodDates: "du {a} au {b}",
    statusCollecting: "Collecte des disponibilités", statusDraft: "Brouillon", statusPublished: "Publié v{n}",
    availSent: "{a} sur {b} envoyées", availYours: "Tes disponibilités", notSubmitted: "Pas envoyé", sent: "Envoyé",
    send: "Envoyer mes disponibilités", resend: "Modifier et renvoyer", locked: "Les disponibilités sont fermées",
    lockedNote: "L'horaire est en préparation. Demande à Philippe de rouvrir les tiennes si ça a changé.",
    reopen: "Rouvrir", reopened: "Rouvert pour {name}",
    sameAsLast: "Comme la dernière fois", importGcal: "Importer de Google Agenda", copyWeek: "Copier la semaine 1 vers la 2",
    gcalDone: "{n} blocs libres importés. Vérifie avant d'envoyer.",
    availSentToast: "Disponibilités envoyées", availHint: "Touche les quarts que tu peux faire.",
    generate: "Générer l'horaire", regenerate: "Générer à nouveau", generating: "Création…",
    generated: "Horaire généré", publish: "Publier", update: "Mettre à jour", published: "Horaire publié",
    updated: "Horaire mis à jour en v{n}", nothingToUpdate: "Aucun changement à publier",
    issues: "Problèmes", noIssues: "Aucun problème", issuesN: "{n} problèmes",
    understaffed: "{d} {k} : {a} personne sur {b}", noL3: "{d} {k} : aucun niveau 3", underHours: "{name} : {a} h sur {b}",
    overHours: "{name} : {a} h, en voulait {b}", unavailAssigned: "{name} est sur {d} {k} mais n'est pas disponible",
    notSubAssigned: "{name} est sur {d} {k} et n'a jamais envoyé ses disponibilités",
    tooManyDays: "{name} : {n} jours de suite", doubleDay: "{name} fait les deux quarts le {d}",
    roster: "Sur ce quart", addSomeone: "Ajouter quelqu'un", available: "Disponible", unavailable: "Pas disponible",
    noAnswer: "Sans réponse", lockPerson: "Garder", remove: "Retirer", locksKept: "Les personnes gardées restent en place quand tu regénères",
    myShifts: "Mes quarts", teamShifts: "Toute l'équipe", nextShift: "Prochain quart", noShifts: "Aucun quart",
    notPublished: "L'horaire n'est pas encore publié.", giveAway: "Donner", givenAway: "À prendre",
    giveAwayDone: "Publié. Tu restes dessus tant que personne ne le prend.", claim: "Prendre", claimed: "Demande envoyée",
    claimedDirect: "Le quart est à toi", tradeShift: "Échanger", trade: "Échange",
    tradeWith: "Échanger avec", pickMine: "Ton quart", pickTheirs: "Son quart", sendTrade: "Envoyer la demande",
    tradeSent: "Demande d'échange envoyée", tradeAccept: "Accepter", tradeDecline: "Refuser", tradeCancel: "Annuler",
    tradeAccepted: "Accepté. En attente de Philippe.", tradeApproved: "Quarts échangés", tradeExpires: "Expire dans {n} jours",
    pendingApproval: "En attente d'approbation", awaitingCoworker: "En attente de {name}", awaitingAdmin: "En attente de Philippe",
    approve: "Approuver", decline: "Refuser", approved: "Approuvé", declined: "Refusé",
    reqClaims: "Demandes de quarts", reqTrades: "Échanges", reqGiveaways: "Quarts donnés sans preneur", noRequests: "Rien en attente",
    pickOne: "{n} personnes veulent ce quart. Choisis.",
    announcements: "Annonces", writeAnnouncement: "Écrire un message à l'équipe", post: "Publier", posted: "Publié",
    notifications: "Notifications", noNotifs: "Rien de neuf", markRead: "Tout marquer comme lu",
    openShifts: "Quarts libres", openShiftsN: "{n} quarts libres", yourHours: "Tes heures", ofDesired: "{a} h sur {b} cette semaine",
    settingsShifts: "Grille des quarts", settingsRules: "Règles du générateur", settingsApprovals: "Approbations", settingsPublish: "Avant de publier",
    periodLength: "Longueur de la période", weeksN: "{n} semaines", weekOne: "1 semaine",
    maxDays: "Jours de suite maximum", fairOpen: "Répartir les ouvertures", fairClose: "Répartir les fermetures",
    approvalClaims: "Approuver les prises de quart", approvalTrades: "Approuver les échanges", iWork: "Je travaille aussi",
    checkBlock: "Bloquer", checkConfirm: "Me demander", checkShow: "Juste afficher",
    chkUnderstaffed: "Quarts incomplets", chkNoL3: "Quarts sans niveau 3", chkUnavailable: "Personnes non disponibles",
    joinCode: "Code d'accès", copyCode: "Copier", copied: "Copié",
    headcount: "Personnes par quart", requiresL3: "Exige un niveau 3",
    blockedPublish: "Règle d'abord les problèmes bloquants", confirmPublish: "Publier avec {n} problèmes ?", cancel: "Annuler", confirm: "Publier quand même",
    reset: "Réinitialiser", resetDone: "Retour au début", language: "English", theme: "Thème",
    demoNote: "Prototype. Rien n'est sauvegardé.",
    alreadyWorking: "Tu travailles déjà ce jour-là", claimNoL3: "Aucun niveau 3 sur ce quart",
    hoursShort: "{a}/{b} h", desiredHours: "Veut {n} h par semaine",
    scheduleSentTo: "Horaire envoyé à {n} personnes", changedFor: "Modifié pour {n} personnes",
    nfAvailRequest: "Envoie tes disponibilités du {a} au {b}",
    nfPublished: "L'horaire est sorti. Regarde tes quarts.",
    nfUpdated: "Ton horaire a changé. Va voir.",
    nfGiveaway: "{name} donne son quart du {d} {k}",
    nfClaim: "{name} veut {d} {k}", nfTrade: "{name} veut échanger un quart avec toi",
    nfTradeAdmin: "{a} et {b} veulent échanger leurs quarts", nfUnclaimed: "{d} {k} n'a toujours personne",
    nfClaimApproved: "Tu as obtenu {d} {k}", nfReopened: "Philippe a rouvert tes disponibilités",
    everyone: "Tout le monde", you: "toi",
    signIn: "Se connecter", signUp: "Créer un compte", signOut: "Se déconnecter",
    emailL: "Courriel", passwordL: "Mot de passe", confirmL: "Confirmer le mot de passe",
    firstNameL: "Prénom", lastNameL: "Nom",
    forgot: "Mot de passe oublié ?", forgotTitle: "Réinitialiser le mot de passe",
    forgotBody: "Entre ton courriel et on t'envoie un lien pour choisir un nouveau mot de passe.",
    sendResetLink: "Envoyer le lien", resetSentTitle: "Vérifie tes courriels",
    resetSentBody: "Un lien a été envoyé à {email}. Il fonctionne une seule fois et expire dans 30 minutes.",
    openLink: "Ouvrir le lien (prototype)", newPasswordL: "Nouveau mot de passe",
    saveNewPassword: "Enregistrer", passwordChanged: "Mot de passe modifié",
    backToSignIn: "Retour à la connexion", noAccount: "Pas encore de compte ?", haveAccount: "Tu as déjà un compte ?",
    verifyTitle: "Confirme ton courriel", verifyBody: "On a envoyé un lien de confirmation à {email}. Confirme-le pour commencer à utiliser Quart.",
    verifiedTitle: "Courriel confirmé", verifiedBody: "Ton compte est prêt. Rejoins maintenant ton lieu de travail avec le code fourni par ton gérant.",
    continueBtn: "Continuer", demoAccounts: "Comptes du prototype — touche pour remplir",
    errRequired: "Obligatoire", errEmail: "Ça ne ressemble pas à une adresse courriel",
    errShortPw: "8 caractères minimum", errMatch: "Les deux mots de passe ne correspondent pas",
    errWeakPw: "Ce mot de passe figure dans des fuites connues. Choisis-en un autre.",
    errTaken: "Un compte utilise déjà ce courriel", errCredentials: "Courriel ou mot de passe incorrect",
    pwHint: "8 caractères minimum. Vérifié contre les mots de passe compromis connus.",
    myWorkplaces: "Tes lieux de travail", noMembership: "Tu n'es pas encore dans un lieu de travail",
    noMembershipBody: "Demande à ton gérant le code de 10 caractères et entre-le ici.",
    joinTitle: "Rejoindre un lieu de travail", joinCodeL: "Code d'accès", join: "Rejoindre",
    errCode: "Aucun lieu de travail ne correspond à ce code", joined: "Tu es entré",
    createWorkplaceBtn: "Créer un lieu de travail", membersN: "{n} membres", enterWp: "Ouvrir",
    platformNote: "Tu es connecté comme administrateur de la plateforme. Tu n'es membre d'aucun lieu de travail et tu ne peux pas en ouvrir un.",
    step1: "Lieu", step2: "Quarts", step3: "Configuration", stepOf: "Étape {a} sur {b}",
    wpNameL: "Nom du lieu de travail", wpAddressL: "Adresse", next: "Suivant", back: "Retour",
    createBtn: "Créer", addBlock: "Ajouter ce quart", startL: "Début", endL: "Fin", repeatOn: "Répéter le",
    blocksN: "{n} quarts par semaine", removeBlock: "Retirer", noBlocks: "Ajoute ton premier quart ci-dessus.",
    setupTitle: "Combien de personnes, et ce qu'exige chaque quart",
    requiredLevelL: "Exige", noneL: "Rien",
    wpCreatedTitle: "{name} est prêt", wpCreatedBody: "Partage ce code avec ton équipe pour qu'elle puisse rejoindre.",
    backToList: "Retour à tes lieux de travail", emptyWpTitle: "Personne n'a encore rejoint",
    emptyWpBody: "Partage le code d'accès. Dès que des gens sont entrés, tu peux collecter les disponibilités et générer un horaire.",
    templateTitle: "Grille des quarts", templateNote: "Modifier un quart reconstruit la période et efface le brouillon.",
    daysL: "Jours", everyDay: "Tous les jours", resetPrototype: "Prototype réinitialisé",
    templateChanged: "Grille mise à jour, brouillon effacé", overnightNo: "Un quart ne peut pas passer minuit",
    navNews: "Annonces", newsSub: "Annonces et recettes de Philippe",
    addPhotos: "Ajouter des photos", imagesPrivate: "Seuls les membres de ce lieu de travail les voient. La localisation est retirée des photos.",
    imgTypeErr: "Images JPEG, PNG ou WebP seulement", imgSizeErr: "Cette image dépasse 10 Mo", imgCountErr: "Jusqu'à {n} images par publication",
    deletePost: "Supprimer la publication", deletedPost: "Publication supprimée", noAnnouncements: "Rien de publié pour l'instant",
    latestAnnouncement: "Dernière annonce", photoPost: "{n} photo(s)", openImage: "Ouvrir l'image",
    availComment: "Commentaire (facultatif)", availCommentPh: "Quelque chose que Philippe devrait savoir sur tes disponibilités cette période",
    availCommentWho: "Seul Philippe le voit.",
    settingsTeam: "Niveaux de l'équipe", levelsHint: "Toi seul peux changer les niveaux.",
    tradeIncoming: "Demande d'échange de {name}", tradeOutgoing: "Échange que tu as demandé",
  },
};
const fill = (s, p) => (p ? Object.keys(p).reduce((a, k) => a.split("{" + k + "}").join(p[k]), s) : s);

/* ---------------- date helpers ---------------- */
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
function mondayOf(date) { const d = new Date(date); const off = (d.getDay() + 6) % 7; d.setDate(d.getDate() - off); d.setHours(0, 0, 0, 0); return d; }
const loc = (lang) => (lang === "fr" ? "fr-CA" : "en-CA");
const fmtDay = (isoStr, lang) => new Intl.DateTimeFormat(loc(lang), { weekday: "short", day: "numeric", month: "short" }).format(new Date(isoStr + "T12:00:00"));
const fmtShort = (isoStr, lang) => new Intl.DateTimeFormat(loc(lang), { day: "numeric", month: "short" }).format(new Date(isoStr + "T12:00:00"));
const fmtDow = (isoStr, lang) => new Intl.DateTimeFormat(loc(lang), { weekday: "short" }).format(new Date(isoStr + "T12:00:00"));
const fmtNum = (isoStr) => new Date(isoStr + "T12:00:00").getDate();

/* ---------------- random ---------------- */
function mulberry32(a) { return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

/* ---------------- people ---------------- */
const PEOPLE = [
  { id: "p1", name: "Philippe Nguyen", level: 3, desired: 20, isAdmin: true, works: true, pat: "all" },
  { id: "p2", name: "Amélie Tremblay", level: 3, desired: 20, pat: "eve" },
  { id: "p3", name: "Jasmine Khalil", level: 3, desired: 18, pat: "flex" },
  { id: "p4", name: "Marc-Olivier Roy", level: 3, desired: 18, pat: "day" },
  { id: "p5", name: "Kevin Tran", level: 3, desired: 20, pat: "eve" },
  { id: "p6", name: "Sophie Lapointe", level: 2, desired: 10, pat: "eve" },
  { id: "p7", name: "Rahul Mehta", level: 2, desired: 9, pat: "flex" },
  { id: "p8", name: "Léa Bouchard", level: 2, desired: 8, pat: "wknd" },
  { id: "p9", name: "Camille Fortin", level: 2, desired: 8, pat: "day" },
  { id: "p10", name: "Noah Bergeron", level: 1, desired: 8, pat: "wknd" },
  { id: "p11", name: "Yuki Tanaka", level: 1, desired: 6, pat: "day" },
  { id: "p12", name: "Sarah Gagnon", level: 1, desired: 10, pat: "eve" },
  { id: "p13", name: "Diego Alvarez", level: 1, desired: 8, pat: "flex" },
  { id: "p14", name: "Emma Côté", level: 1, desired: 6, pat: "wknd" },
  { id: "p15", name: "Liam O'Connor", level: 1, desired: 9, pat: "eve" },
];
const ADMIN_ID = "p1";
const PLATFORM = { id: "admin0", name: "Hoang Vu Luu", email: "hoang@quart.app", level: 0, desired: 0, isPlatform: true };
// ACCOUNTS = every user who can sign in. ROSTER = members of Presotea.
// Signing up creates an account; entering the join code adds the membership.
let ACCOUNTS = [...PEOPLE, PLATFORM];
let ROSTER = [...PEOPLE];
const resetPeople = () => { ACCOUNTS = [...PEOPLE, PLATFORM]; ROSTER = [...PEOPLE]; };
const addAccount = (p) => { if (!ACCOUNTS.some((x) => x.id === p.id)) ACCOUNTS = [...ACCOUNTS, p]; };
const addMember = (id) => { const p = ACCOUNTS.find((x) => x.id === id); if (p && !ROSTER.some((x) => x.id === id)) ROSTER = [...ROSTER, p]; };
const isMember = (id) => ROSTER.some((p) => p.id === id);
const byId = (id) => ROSTER.find((p) => p.id === id) || ACCOUNTS.find((p) => p.id === id);
const noAcc = (x) => x.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z]/g, "");
const emailOf = (p) => p.email || `${noAcc(p.name.split(" ")[0])}.${noAcc(p.name.split(" ").slice(1).join(""))}@presotea.ca`.toLowerCase();
const WEAK = ["password", "password1", "12345678", "presotea", "qwerty123", "iloveyou", "11111111", "baristas"];
const isEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no 0/O, no 1/I/L
const makeCode = () => Array.from({ length: 10 }, () => CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]).join("");
const first = (id) => (byId(id) ? byId(id).name.split(" ")[0] : "?");

/* ---------------- period + shifts ---------------- */
const mins = (v) => Number(v.slice(0, 2)) * 60 + Number(v.slice(3, 5));
const hhmm = (m) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const snap15 = (v) => hhmm(Math.min(23 * 60 + 45, Math.max(0, Math.round(mins(v) / 15) * 15)));
const blockHours = (b) => Math.round(((mins(b.end) - mins(b.start)) / 60) * 100) / 100;
const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];
// A template block is one time range repeated on the days of the week you choose.
function buildShifts(startISO, weeks, tpl) {
  const out = [];
  const start = new Date(startISO + "T12:00:00");
  for (let d = 0; d < weeks * 7; d++) {
    const date = iso(addDays(start, d));
    const dow = (new Date(date + "T12:00:00").getDay() + 6) % 7;
    tpl.filter((t) => t.days.includes(dow)).forEach((t) => out.push({
      id: `${date}|${t.kind}`, date, week: Math.floor(d / 7), dow,
      kind: t.kind, start: t.start, end: t.end, hours: blockHours(t),
      headcount: t.headcount, requiresL3: t.requiredLevel === 3, requiredLevel: t.requiredLevel,
    }));
  }
  return out;
}
const TEMPLATE = [
  { kind: "open", start: "10:00", end: "16:00", headcount: 2, requiredLevel: 3, days: ALL_DAYS },
  { kind: "close", start: "16:00", end: "23:00", headcount: 2, requiredLevel: 3, days: ALL_DAYS },
];
const DOW_LABEL = (i, lang) => fmtDow(iso(addDays(new Date("2024-01-01T12:00:00"), i)), lang);

function mockAvailability(shifts, seed) {
  const rng = mulberry32(seed);
  const av = {};
  ROSTER.forEach((p) => {
    const blocks = {};
    shifts.forEach((s) => {
      const wknd = s.dow >= 5;
      let prob = 0.55;
      if (p.pat === "all") prob = 1;
      else if (p.pat === "day") prob = s.kind === "open" ? (wknd ? 0.5 : 0.85) : 0.2;
      else if (p.pat === "eve") prob = s.kind === "close" ? 0.85 : 0.25;
      else if (p.pat === "wknd") prob = wknd ? 0.9 : 0.25;
      else prob = 0.6;
      if (p.level === 3) prob = Math.min(1, prob + 0.15);
      if (rng() < prob) blocks[s.id] = true;
    });
    av[p.id] = { blocks, submitted: true };
  });
  av["p6"].comment = "Examens du 1er au 3 octobre : seulement les soirs cette semaine-là.";
  av["p10"].comment = "Hockey tournament the second weekend, so I marked it off.";
  av["p14"] = { blocks: {}, submitted: false };
  av["p13"] = { blocks: {}, submitted: false };
  return av;
}

/* ---------------- evaluator (one rulebook for generator + dashboard) ---------------- */
function hoursByPersonWeek(shifts, asg) {
  const m = {};
  shifts.forEach((s) => (asg[s.id] || []).forEach((pid) => {
    m[pid] = m[pid] || {}; m[pid][s.week] = (m[pid][s.week] || 0) + s.hours;
  }));
  return m;
}
function consecutiveRuns(shifts, asg) {
  const days = {};
  shifts.forEach((s) => (asg[s.id] || []).forEach((pid) => { days[pid] = days[pid] || new Set(); days[pid].add(s.date); }));
  const res = {};
  Object.keys(days).forEach((pid) => {
    const list = [...days[pid]].sort();
    let best = 0, run = 0, prev = null;
    list.forEach((d) => {
      if (prev && (new Date(d + "T12:00:00") - new Date(prev + "T12:00:00")) === 86400000) run += 1; else run = 1;
      best = Math.max(best, run); prev = d;
    });
    res[pid] = best;
  });
  return res;
}
function evaluate(shifts, asg, avail, settings, weeks, levels) {
  const issues = [];
  let score = 0;
  shifts.forEach((s) => {
    const on = asg[s.id] || [];
    if (on.length < s.headcount) { score -= 1000 * (s.headcount - on.length); issues.push({ type: "understaffed", shiftId: s.id, a: on.length, b: s.headcount }); }
    if (s.requiresL3 && !on.some((pid) => levels[pid] === 3)) { score -= 500; issues.push({ type: "noL3", shiftId: s.id }); }
    on.forEach((pid) => {
      const a = avail[pid];
      if (!a.submitted) { score -= 800; issues.push({ type: "notSubAssigned", shiftId: s.id, pid }); }
      else if (!a.blocks[s.id]) { score -= 800; issues.push({ type: "unavailAssigned", shiftId: s.id, pid }); }
    });
  });
  const byDate = {};
  shifts.forEach((s) => (asg[s.id] || []).forEach((pid) => { const k = pid + "|" + s.date; byDate[k] = (byDate[k] || 0) + 1; }));
  Object.keys(byDate).forEach((k) => { if (byDate[k] > 1) { score -= 60; const [pid, date] = k.split("|"); issues.push({ type: "doubleDay", pid, date }); } });
  const hw = hoursByPersonWeek(shifts, asg);
  ROSTER.forEach((p) => {
    if (p.id === ADMIN_ID && !settings.adminWorks) return;
    let total = 0;
    for (let w = 0; w < weeks; w++) total += (hw[p.id] && hw[p.id][w]) || 0;
    const want = p.desired * weeks;
    score -= Math.abs(total - want) * 10;
    if (total < want - 2) issues.push({ type: "underHours", pid: p.id, a: total, b: want });
    if (total > want + 2) issues.push({ type: "overHours", pid: p.id, a: total, b: want });
  });
  const runs = consecutiveRuns(shifts, asg);
  Object.keys(runs).forEach((pid) => { if (runs[pid] > settings.maxConsecutive) { score -= 300; issues.push({ type: "tooManyDays", pid, n: runs[pid] }); } });
  if (settings.fairOpen || settings.fairClose) {
    const cnt = {};
    shifts.forEach((s) => (asg[s.id] || []).forEach((pid) => { cnt[pid] = cnt[pid] || { open: 0, close: 0, total: 0 }; cnt[pid][s.kind] += 1; cnt[pid].total += 1; }));
    ROSTER.forEach((p) => {
      const c = cnt[p.id]; if (!c) return;
      const a = avail[p.id]; if (!a.submitted) return;
      let ao = 0, ac = 0;
      shifts.forEach((s) => { if (a.blocks[s.id]) (s.kind === "open" ? ao++ : ac++); });
      const share = ao + ac === 0 ? 0.5 : ao / (ao + ac);
      if (settings.fairOpen) score -= Math.abs(c.open - c.total * share) * 4;
      if (settings.fairClose) score -= Math.abs(c.close - c.total * (1 - share)) * 4;
    });
  }
  return { score, issues };
}

/* ---------------- generator ---------------- */
function generateSchedule(shifts, avail, settings, weeks, locks, seed, levels) {
  const rng = mulberry32(seed);
  const asg = {};
  shifts.forEach((s) => (asg[s.id] = []));
  Object.keys(locks).forEach((k) => { const [sid, pid] = k.split("::"); if (asg[sid] && !asg[sid].includes(pid)) asg[sid].push(pid); });

  const canWork = (pid, s) => { const a = avail[pid]; return a.submitted && !!a.blocks[s.id]; };
  const hoursOf = (pid) => shifts.reduce((n, s) => n + ((asg[s.id] || []).includes(pid) ? s.hours : 0), 0);
  const worksDate = (pid, date) => shifts.some((s) => s.date === date && (asg[s.id] || []).includes(pid));
  const datesOf = (pid) => { const set = new Set(); shifts.forEach((s) => { if ((asg[s.id] || []).includes(pid)) set.add(s.date); }); return set; };
  // hard rule: assigning this date must not create a run longer than the workplace allows
  const runWith = (pid, date) => {
    const set = datesOf(pid); set.add(date);
    const base = new Date(date + "T12:00:00");
    let run = 1;
    for (let i = 1; set.has(iso(addDays(base, -i))); i++) run++;
    for (let i = 1; set.has(iso(addDays(base, i))); i++) run++;
    return run;
  };

  const order = [...shifts].sort((a, b) => {
    const ca = ROSTER.filter((p) => canWork(p.id, a)).length, cb = ROSTER.filter((p) => canWork(p.id, b)).length;
    return ca - cb + (rng() - 0.5);
  });

  const pick = (s, needL3, lastResort) => {
    const on = asg[s.id];
    let pool = ROSTER.filter((p) => {
      if (on.includes(p.id)) return false;
      if (p.id === ADMIN_ID && !settings.adminWorks) return false;
      if (!canWork(p.id, s)) return false;
      if (needL3 && levels[p.id] !== 3) return false;
      if (!lastResort && worksDate(p.id, s.date)) return false;
      if (runWith(p.id, s.date) > settings.maxConsecutive) return false;
      return true;
    });
    if (!pool.length) return null;
    const scored = pool.map((p) => {
      const want = p.desired * weeks, have = hoursOf(p.id);
      let sc = (want - have) * 2;
      if (have + s.hours > want + 4) sc -= 40;
      if (worksDate(p.id, s.date)) sc -= 60;
      return { p, sc: sc + rng() * 6 };
    }).sort((x, y) => y.sc - x.sc);
    const top = scored.slice(0, Math.min(3, scored.length));
    return top[Math.floor(rng() * top.length)].p.id;
  };

  order.forEach((s) => {
    if (s.requiresL3 && !asg[s.id].some((pid) => levels[pid] === 3) && asg[s.id].length < s.headcount) {
      const l3 = pick(s, true, false) || pick(s, true, true);
      if (l3) asg[s.id].push(l3);
    }
    while (asg[s.id].length < s.headcount) {
      const c = pick(s, false, false) || pick(s, false, true);
      if (!c) break;
      asg[s.id].push(c);
    }
  });

  // local search
  let best = evaluate(shifts, asg, avail, settings, weeks, levels).score;
  const isLocked = (sid, pid) => !!locks[`${sid}::${pid}`];
  for (let i = 0; i < 1500; i++) {
    const s = shifts[Math.floor(rng() * shifts.length)];
    const on = asg[s.id];
    if (!on.length) continue;
    const idx = Math.floor(rng() * on.length);
    const cur = on[idx];
    if (isLocked(s.id, cur)) continue;
    const cand = ROSTER.filter((p) => p.id !== cur && !on.includes(p.id) && canWork(p.id, s) && (p.id !== ADMIN_ID || settings.adminWorks));
    if (!cand.length) continue;
    const nxt = cand[Math.floor(rng() * cand.length)].id;
    if (runWith(nxt, s.date) > settings.maxConsecutive) continue; // hard rule holds during local search too
    on[idx] = nxt;
    const sc = evaluate(shifts, asg, avail, settings, weeks, levels).score;
    if (sc > best) best = sc; else on[idx] = cur;
  }
  return asg;
}

/* ---------------- initial state ---------------- */
function makeInit(weeks = 2) {
  resetPeople();
  const startISO = iso(mondayOf(new Date()));
  const shifts = buildShifts(startISO, weeks, TEMPLATE);
  const avail = mockAvailability(shifts, 1337);
  const lastAvail = {};
  ROSTER.forEach((p) => { lastAvail[p.id] = { ...avail[p.id].blocks }; });
  return {
    lang: "fr", theme: "light", viewAs: ADMIN_ID, tab: "home",
    startISO, weeks, shifts, template: TEMPLATE.map((b) => ({ ...b, days: [...b.days] })),
    session: { user: null, screen: "signin", pending: null, error: null },
    workplaces: [{ id: "w1", name: "Presotea Montmorency", address: "1001 boul. Montmorency, Laval", seeded: true }],
    activeId: null, lastCreated: null,
    avail, lastAvail, availLocked: false, reopened: {},
    levels: Object.fromEntries(ROSTER.map((p) => [p.id, p.level])),
    draft: null, locks: {}, published: null,
    giveaways: [], claims: [], trades: [],
    announcements: [
      { id: "a1", author: "p1", ts: Date.now() - 86400000 * 2, body: { fr: "Nouvelle recette de thé matcha vendredi. Arrivez 10 min avant votre quart pour la dégustation.", en: "New matcha recipe on Friday. Come 10 min before your shift to taste it." } },
      { id: "a2", author: "p1", ts: Date.now() - 86400000 * 5, body: { fr: "Rappel : les tabliers propres sont dans le bac du fond.", en: "Reminder: clean aprons are in the bin at the back." } },
    ],
    notifs: ROSTER.filter((p) => p.id !== ADMIN_ID).map((p, i) => ({
      id: "n" + i, to: p.id, key: "nfAvailRequest",
      params: { a: fmtShort(startISO, "fr"), b: fmtShort(iso(addDays(new Date(startISO + "T12:00:00"), weeks * 7 - 1)), "fr") },
      ts: Date.now() - 86400000 * 3, read: false,
    })),
    settings: {
      maxConsecutive: 5, fairOpen: false, fairClose: true, adminWorks: true,
      approvalClaims: true, approvalTrades: true,
      checks: { understaffed: "confirm", noL3: "block", unavailable: "confirm" },
      joinCode: "PRESTEA24X",
    },
    toast: null, seed: 7,
  };
}

const clone = (o) => JSON.parse(JSON.stringify(o));
const uid = () => Math.random().toString(36).slice(2, 9);

function reducer(st, ac) {
  switch (ac.type) {
    /* ---- authentication ---- */
    case "authScreen": return { ...st, session: { ...st.session, screen: ac.screen, error: null } };
    case "signIn": {
      const acct = ACCOUNTS.find((p) => emailOf(p).toLowerCase() === String(ac.email).trim().toLowerCase());
      if (!acct || String(ac.password).length < 8) return { ...st, session: { ...st.session, error: "errCredentials" } };
      return { ...st, session: { user: acct.id, screen: "app", pending: null, error: null }, activeId: null, viewAs: isMember(acct.id) ? acct.id : st.viewAs, tab: "home" };
    }
    case "signUp": {
      const id = "u" + uid();
      const person = { id, name: `${ac.firstName} ${ac.lastName}`, email: String(ac.email).trim().toLowerCase(), level: 1, desired: 10, pat: "flex" };
      addAccount(person);
      return {
        ...st,
        levels: { ...st.levels, [id]: 1 },
        avail: { ...st.avail, [id]: { blocks: {}, submitted: false } },
        lastAvail: { ...st.lastAvail, [id]: {} },
        session: { user: null, screen: "verifySent", pending: id, error: null },
      };
    }
    case "verifyEmail": return { ...st, session: { ...st.session, screen: "verified", error: null } };
    case "afterVerify": return { ...st, session: { user: st.session.pending, screen: "app", pending: null, error: null }, activeId: null, tab: "home" };
    case "resetSent": return { ...st, session: { ...st.session, screen: "resetSent", error: null } };
    case "resetDone": return { ...st, session: { ...st.session, screen: "signin", error: null }, toast: { k: "passwordChanged" } };
    case "signOut": return { ...st, session: { user: null, screen: "signin", pending: null, error: null }, activeId: null, tab: "home" };

    /* ---- workplaces ---- */
    case "joinWorkplace": {
      const typed = String(ac.code).replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
      if (typed !== st.settings.joinCode.toUpperCase()) return { ...st, session: { ...st.session, error: "errCode" } };
      addMember(st.session.user);
      return { ...st, activeId: "w1", viewAs: st.session.user, tab: "home", session: { ...st.session, error: null }, toast: { k: "joined" } };
    }
    case "createWorkplace": {
      const id = "w" + uid();
      const wp = { id, name: ac.name, address: ac.address, code: makeCode(), template: ac.template, createdBy: st.session.user };
      return { ...st, workplaces: [...st.workplaces, wp], lastCreated: id };
    }
    case "openWorkplace": return { ...st, activeId: ac.id, tab: "home", viewAs: ac.id === "w1" && isMember(st.session.user) ? st.session.user : st.viewAs };
    case "closeWorkplace": return { ...st, activeId: null, lastCreated: null };

    /* ---- template ---- */
    case "templateSet": {
      const template = ac.template;
      if (!template.length || template.some((b) => mins(b.end) <= mins(b.start) || !b.days.length)) return st;
      const shifts = buildShifts(st.startISO, st.weeks, template);
      const avail = mockAvailability(shifts, 1337);
      return { ...st, template, shifts, avail, draft: null, published: null, locks: {}, availLocked: false, reopened: {}, giveaways: [], claims: [], trades: [], toast: { k: "templateChanged" } };
    }
    case "templateBlock": {
      const template = st.template.map((b, i) => (i === ac.index ? { ...b, ...ac.patch } : b));
      if (mins(template[ac.index].end) <= mins(template[ac.index].start)) return st; // no overnight shifts
      const shifts = buildShifts(st.startISO, st.weeks, template);
      const avail = mockAvailability(shifts, 1337);
      return { ...st, template, shifts, avail, draft: null, published: null, locks: {}, availLocked: false, reopened: {}, giveaways: [], claims: [], trades: [], toast: { k: "templateChanged" } };
    }

    case "lang": return { ...st, lang: st.lang === "fr" ? "en" : "fr" };
    case "theme": return { ...st, theme: st.theme === "light" ? "dark" : "light" };
    case "viewAs": return { ...st, viewAs: ac.id, tab: "home" };
    case "tab": return { ...st, tab: ac.tab };
    case "toast": return { ...st, toast: ac.toast };

    case "periodWeeks": {
      const shifts = buildShifts(st.startISO, ac.weeks, st.template);
      const avail = mockAvailability(shifts, 1337);
      return { ...st, weeks: ac.weeks, shifts, avail, draft: null, published: null, locks: {}, availLocked: false, reopened: {}, giveaways: [], claims: [], trades: [] };
    }

    case "toggleAvail": {
      const a = clone(st.avail);
      if (a[ac.pid].blocks[ac.shiftId]) delete a[ac.pid].blocks[ac.shiftId];
      else a[ac.pid].blocks[ac.shiftId] = true;
      return { ...st, avail: a };
    }
    case "bulkAvail": { const a = clone(st.avail); a[ac.pid].blocks = ac.blocks; return { ...st, avail: a }; }
    case "submitAvail": {
      const a = clone(st.avail); a[ac.pid].submitted = true;
      if (typeof ac.comment === "string") a[ac.pid].comment = ac.comment.trim().slice(0, 500);
      const r = { ...st.reopened }; delete r[ac.pid];
      return { ...st, avail: a, reopened: r, toast: { k: "availSentToast" } };
    }
    case "reopen": return { ...st, reopened: { ...st.reopened, [ac.pid]: true }, notifs: [{ id: uid(), to: ac.pid, key: "nfReopened", ts: Date.now(), read: false }, ...st.notifs], toast: { k: "reopened", p: { name: first(ac.pid) } } };

    case "generate": {
      const seed = st.seed + 1;
      const asg = generateSchedule(st.shifts, st.avail, st.settings, st.weeks, st.locks, seed, st.levels);
      return { ...st, draft: asg, seed, availLocked: true, toast: { k: "generated" } };
    }
    case "assign": { const d = clone(st.draft || {}); d[ac.shiftId] = [...(d[ac.shiftId] || []), ac.pid]; return { ...st, draft: d }; }
    case "unassign": { const d = clone(st.draft || {}); d[ac.shiftId] = (d[ac.shiftId] || []).filter((p) => p !== ac.pid); const l = { ...st.locks }; delete l[`${ac.shiftId}::${ac.pid}`]; return { ...st, draft: d, locks: l }; }
    case "toggleLock": { const l = { ...st.locks }; const k = `${ac.shiftId}::${ac.pid}`; if (l[k]) delete l[k]; else l[k] = true; return { ...st, locks: l }; }
    case "startManual": { const d = {}; st.shifts.forEach((s) => (d[s.id] = [])); return { ...st, draft: d, availLocked: true }; }

    case "publish": {
      const notifs = ROSTER.filter((p) => p.id !== ADMIN_ID).map((p) => ({ id: uid(), to: p.id, key: "nfPublished", ts: Date.now(), read: false }));
      return { ...st, published: { version: 1, asg: clone(st.draft), at: Date.now() }, notifs: [...notifs, ...st.notifs], toast: { k: "published" } };
    }
    case "updatePublish": {
      const affected = new Set();
      st.shifts.forEach((s) => {
        const a = new Set(st.published.asg[s.id] || []), b = new Set(st.draft[s.id] || []);
        [...a].forEach((p) => { if (!b.has(p)) affected.add(p); });
        [...b].forEach((p) => { if (!a.has(p)) affected.add(p); });
      });
      if (!affected.size) return { ...st, toast: { k: "nothingToUpdate" } };
      const v = st.published.version + 1;
      const notifs = [...affected].filter((p) => p !== ADMIN_ID).map((p) => ({ id: uid(), to: p, key: "nfUpdated", ts: Date.now(), read: false }));
      return { ...st, published: { version: v, asg: clone(st.draft), at: Date.now() }, notifs: [...notifs, ...st.notifs], toast: { k: "updated", p: { n: v } } };
    }

    case "giveaway": {
      const s = st.shifts.find((x) => x.id === ac.shiftId);
      const notifs = ROSTER.filter((p) => p.id !== ac.pid).map((p) => ({ id: uid(), to: p.id, key: "nfGiveaway", ts: Date.now(), read: false, params: { name: first(ac.pid), d: s.date, k: s.kind } }));
      return { ...st, giveaways: [{ id: uid(), shiftId: ac.shiftId, fromId: ac.pid, status: "open" }, ...st.giveaways], notifs: [...notifs, ...st.notifs], toast: { k: "giveAwayDone" } };
    }
    case "claim": {
      const s = st.shifts.find((x) => x.id === ac.shiftId);
      if (st.settings.approvalClaims) {
        return {
          ...st, claims: [{ id: uid(), shiftId: ac.shiftId, pid: ac.pid, giveawayId: ac.giveawayId || null, status: "pending" }, ...st.claims],
          notifs: [{ id: uid(), to: ADMIN_ID, key: "nfClaim", ts: Date.now(), read: false, params: { name: first(ac.pid), d: s.date, k: s.kind } }, ...st.notifs],
          toast: { k: "claimed" },
        };
      }
      return { ...applyClaim(st, { shiftId: ac.shiftId, pid: ac.pid, giveawayId: ac.giveawayId || null }), toast: { k: "claimedDirect" } };
    }
    case "approveClaim": {
      const c = st.claims.find((x) => x.id === ac.id);
      const s = st.shifts.find((x) => x.id === c.shiftId);
      const next = applyClaim(st, c);
      return {
        ...next,
        claims: next.claims.map((x) => (x.id === ac.id ? { ...x, status: "approved" } : (x.shiftId === c.shiftId && x.status === "pending" ? { ...x, status: "declined" } : x))),
        notifs: [{ id: uid(), to: c.pid, key: "nfClaimApproved", ts: Date.now(), read: false, params: { d: s.date, k: s.kind } }, ...next.notifs],
        toast: { k: "approved" },
      };
    }
    case "declineClaim": return { ...st, claims: st.claims.map((x) => (x.id === ac.id ? { ...x, status: "declined" } : x)), toast: { k: "declined" } };

    case "tradeRequest": {
      return {
        ...st, trades: [{ id: uid(), aId: ac.aId, aShift: ac.aShift, bId: ac.bId, bShift: ac.bShift, status: "awaiting_coworker", ts: Date.now() }, ...st.trades],
        notifs: [{ id: uid(), to: ac.bId, key: "nfTrade", ts: Date.now(), read: false, params: { name: first(ac.aId) } }, ...st.notifs],
        toast: { k: "tradeSent" },
      };
    }
    case "tradeAccept": {
      const t = st.trades.find((x) => x.id === ac.id);
      if (st.settings.approvalTrades) {
        return { ...st, trades: st.trades.map((x) => (x.id === ac.id ? { ...x, status: "awaiting_admin" } : x)), notifs: [{ id: uid(), to: ADMIN_ID, key: "nfTradeAdmin", ts: Date.now(), read: false, params: { a: first(t.aId), b: first(t.bId) } }, ...st.notifs], toast: { k: "tradeAccepted" } };
      }
      return { ...applyTrade(st, t), trades: st.trades.map((x) => (x.id === ac.id ? { ...x, status: "approved" } : x)), toast: { k: "tradeApproved" } };
    }
    case "tradeApprove": {
      const t = st.trades.find((x) => x.id === ac.id);
      const next = applyTrade(st, t);
      return { ...next, trades: next.trades.map((x) => (x.id === ac.id ? { ...x, status: "approved" } : x)), notifs: [{ id: uid(), to: t.aId, key: "nfUpdated", ts: Date.now(), read: false }, { id: uid(), to: t.bId, key: "nfUpdated", ts: Date.now(), read: false }, ...next.notifs], toast: { k: "tradeApproved" } };
    }
    case "tradeDecline": return { ...st, trades: st.trades.map((x) => (x.id === ac.id ? { ...x, status: "declined" } : x)), toast: { k: "declined" } };
    case "tradeCancel": return { ...st, trades: st.trades.map((x) => (x.id === ac.id ? { ...x, status: "cancelled" } : x)), toast: { k: "tradeCancel" } };

    case "announce": return { ...st, announcements: [{ id: uid(), author: st.viewAs, ts: Date.now(), body: ac.body, images: ac.images || [], reactions: {} }, ...st.announcements], toast: { k: "posted" } };
    case "deleteAnnouncement": return { ...st, announcements: st.announcements.filter((a) => a.id !== ac.id), toast: { k: "deletedPost" } };
    case "react": return { ...st, announcements: st.announcements.map((a) => {
      if (a.id !== ac.id) return a;
      const r = { ...(a.reactions || {}) }; if (r[ac.pid]) delete r[ac.pid]; else r[ac.pid] = true;
      return { ...a, reactions: r };
    }) };
    case "readNotifs": return { ...st, notifs: st.notifs.map((n) => ({ ...n, read: true })) };
    case "setLevel": return { ...st, levels: { ...st.levels, [ac.pid]: ac.level } };
    case "setting": return { ...st, settings: { ...st.settings, [ac.key]: ac.value } };
    case "check": return { ...st, settings: { ...st.settings, checks: { ...st.settings.checks, [ac.key]: ac.value } } };
    case "headcount": {
      const template = st.template.map((b) => (b.kind === ac.kind ? { ...b, headcount: Math.max(1, Math.min(6, b.headcount + ac.delta)) } : b));
      const shifts = st.shifts.map((s) => (s.kind === ac.kind ? { ...s, headcount: Math.max(1, Math.min(6, s.headcount + ac.delta)) } : s));
      return { ...st, template, shifts };
    }
    case "reset": { const fresh = makeInit(st.weeks); return { ...fresh, lang: st.lang, theme: st.theme, session: st.session, activeId: st.activeId, viewAs: st.viewAs, toast: { k: "resetPrototype" } }; }
    default: return st;
  }
}

function applyClaim(st, c) {
  const put = (asg) => {
    const a = clone(asg);
    const g = c.giveawayId ? st.giveaways.find((x) => x.id === c.giveawayId) : null;
    if (g) a[c.shiftId] = (a[c.shiftId] || []).filter((p) => p !== g.fromId);
    if (!(a[c.shiftId] || []).includes(c.pid)) a[c.shiftId] = [...(a[c.shiftId] || []), c.pid];
    return a;
  };
  return {
    ...st,
    published: st.published ? { ...st.published, asg: put(st.published.asg) } : st.published,
    draft: st.draft ? put(st.draft) : st.draft,
    giveaways: st.giveaways.map((g) => (g.id === c.giveawayId ? { ...g, status: "taken", takenBy: c.pid } : g)),
  };
}
function applyTrade(st, t) {
  const swap = (asg) => {
    const a = clone(asg);
    a[t.aShift] = (a[t.aShift] || []).map((p) => (p === t.aId ? t.bId : p));
    a[t.bShift] = (a[t.bShift] || []).map((p) => (p === t.bId ? t.aId : p));
    return a;
  };
  return { ...st, published: st.published ? { ...st.published, asg: swap(st.published.asg) } : st.published, draft: st.draft ? swap(st.draft) : st.draft };
}

/* ---------------- styles ---------------- */
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Inter+Tight:wght@400;500;600;700&family=Newsreader:opsz,wght@6..72,400;6..72,500;6..72,600&display=swap');
.qa-root{
  --bg:#E7EAE4; --surface:#FFFFFF; --surface2:#F2F4EF; --ink:#13201B; --muted:#5F6E68;
  --line:#D6DBD3; --jade:#0F6B4A; --jadeSoft:#DCEDE3; --clay:#A33A3A; --claySoft:#F7E2DE;
  --amber:#8A6110; --amberSoft:#F6EBD4; --slate:#93A09A;
  --sh:0 1px 2px rgba(19,32,27,.05),0 10px 30px rgba(19,32,27,.06);
  --serif:"Newsreader",ui-serif,Georgia,serif;
  --sans:"Inter Tight",system-ui,-apple-system,"Segoe UI",sans-serif;
  background:var(--bg); color:var(--ink); font-family:var(--sans);
  min-height:100vh; -webkit-font-smoothing:antialiased; font-size:15px; line-height:1.45;
}
.qa-root[data-theme="dark"]{
  --bg:#0D1513; --surface:#16211E; --surface2:#1C2926; --ink:#E9EEEA; --muted:#9BA9A3;
  --line:#2A3A35; --jade:#57C495; --jadeSoft:#123024; --clay:#E4938C; --claySoft:#39201F;
  --amber:#D6A94F; --amberSoft:#32280F; --slate:#6B7973; --sh:none;
}
.qa-root *{box-sizing:border-box}
.qa-root button{font:inherit;color:inherit;cursor:pointer;border:none;background:none}
.qa-root h1,.qa-root h2,.qa-root h3{margin:0;font-weight:500}
.qa-shell{display:flex;min-height:100vh}
.qa-side{display:none}
.qa-main{flex:1;min-width:0;padding-bottom:78px}
.qa-wrap{max-width:940px;margin:0 auto;padding:14px 14px 26px}
.qa-top{position:sticky;top:0;z-index:30;background:var(--bg);border-bottom:1px solid var(--line)}
.qa-topin{max-width:940px;margin:0 auto;padding:9px 14px;display:flex;align-items:center;gap:8px}
.qa-brand{font-family:var(--serif);font-size:21px;letter-spacing:-.01em;line-height:1}
.qa-brandsub{font-size:11.5px;color:var(--muted);margin-top:1px}
.qa-spacer{flex:1}
.qa-ib{width:34px;height:34px;border-radius:9px;display:grid;place-items:center;color:var(--muted);position:relative}
.qa-ib:hover{background:var(--surface2);color:var(--ink)}
.qa-ib:focus-visible,.qa-root button:focus-visible{outline:2px solid var(--jade);outline-offset:2px}
.qa-dot{position:absolute;top:5px;right:6px;width:7px;height:7px;border-radius:99px;background:var(--clay)}
.qa-sel{background:var(--surface);border:1px solid var(--line);border-radius:9px;padding:6px 8px;font-size:13px;color:var(--ink);max-width:172px}
.qa-tabs{position:fixed;bottom:0;left:0;right:0;z-index:40;background:var(--surface);border-top:1px solid var(--line);display:flex;padding:6px 4px calc(6px + env(safe-area-inset-bottom))}
.qa-tab{flex:1;display:flex;flex-direction:column;align-items:center;gap:3px;padding:5px 2px;border-radius:10px;font-size:10.5px;color:var(--muted)}
.qa-tab[data-on="1"]{color:var(--jade);background:var(--jadeSoft)}
.qa-card{background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:14px;box-shadow:var(--sh)}
.qa-card + .qa-card{margin-top:12px}
.qa-h{font-family:var(--serif);font-size:26px;letter-spacing:-.015em;margin:4px 0 2px}
.qa-sub{color:var(--muted);font-size:13px;margin-bottom:14px}
.qa-sec{font-size:12.5px;font-weight:600;color:var(--muted);margin:20px 0 8px}
.qa-row{display:flex;align-items:center;gap:10px}
.qa-btn{display:inline-flex;align-items:center;justify-content:center;gap:7px;padding:10px 14px;border-radius:10px;background:var(--surface2);border:1px solid var(--line);font-size:14px;font-weight:500}
.qa-btn:hover{border-color:var(--slate)}
.qa-btn[data-v="primary"]{background:var(--jade);color:#fff;border-color:var(--jade)}
.qa-btn[data-v="primary"]:hover{filter:brightness(1.07)}
.qa-btn[data-v="danger"]{color:var(--clay);background:var(--claySoft);border-color:transparent}
.qa-btn[disabled]{opacity:.45;cursor:not-allowed}
.qa-btn[data-sm="1"]{padding:6px 10px;font-size:12.5px;border-radius:8px}
.qa-wide{width:100%}
.qa-pill{display:inline-flex;align-items:center;gap:5px;padding:3px 8px;border-radius:99px;font-size:11.5px;background:var(--surface2);color:var(--muted);border:1px solid var(--line)}
.qa-pill[data-t="ok"]{background:var(--jadeSoft);color:var(--jade);border-color:transparent}
.qa-pill[data-t="warn"]{background:var(--amberSoft);color:var(--amber);border-color:transparent}
.qa-pill[data-t="bad"]{background:var(--claySoft);color:var(--clay);border-color:transparent}
.qa-week{display:grid;gap:10px;grid-template-columns:1fr}
.qa-day{min-width:0}
.qa-dayh{display:flex;align-items:baseline;gap:6px;padding:2px 2px 6px}
.qa-dow{font-size:12px;color:var(--muted);text-transform:capitalize}
.qa-dnum{font-family:var(--serif);font-size:17px}
.qa-shift{display:block;width:100%;text-align:left;background:var(--surface);border:1px solid var(--line);border-left:3px solid var(--slate);border-radius:11px;padding:9px 10px;margin-bottom:7px;box-shadow:var(--sh)}
.qa-shift:hover{border-color:var(--slate)}
.qa-shift[data-s="bad"]{border-left-color:var(--clay)}
.qa-shift[data-s="warn"]{border-left-color:var(--amber)}
.qa-shift[data-s="ok"]{border-left-color:var(--jade)}
.qa-shift[data-mine="1"]{background:var(--jadeSoft)}
.qa-shifth{display:flex;align-items:center;justify-content:space-between;gap:6px}
.qa-time{font-size:12px;color:var(--muted)}
.qa-fill{font-family:var(--serif);font-size:13px}
.qa-names{display:flex;flex-wrap:wrap;gap:4px;margin-top:7px}
.qa-chip{display:inline-flex;align-items:center;gap:4px;padding:2px 7px;border-radius:99px;font-size:11.5px;background:var(--surface2);border:1px solid var(--line)}
.qa-chip[data-bad="1"]{background:var(--claySoft);color:var(--clay);border-color:transparent}
.qa-chip[data-me="1"]{background:var(--jade);color:#fff;border-color:transparent}
.qa-lv{font-size:9.5px;opacity:.7}
.qa-empty{font-size:11.5px;color:var(--slate);font-style:italic}
.qa-list{display:flex;flex-direction:column;gap:1px}
.qa-item{display:flex;align-items:center;gap:10px;padding:10px 2px;border-bottom:1px solid var(--line)}
.qa-item:last-child{border-bottom:none}
.qa-nm{flex:1;min-width:0;font-size:14px}
.qa-meta{font-size:11.5px;color:var(--muted)}
.qa-hrs{font-family:var(--serif);font-size:14px;color:var(--muted);white-space:nowrap}
.qa-sw{width:42px;height:25px;border-radius:99px;background:var(--line);position:relative;flex:none;transition:background .15s}
.qa-sw[data-on="1"]{background:var(--jade)}
.qa-sw i{position:absolute;top:2.5px;left:2.5px;width:20px;height:20px;border-radius:99px;background:#fff;transition:transform .15s;display:block}
.qa-sw[data-on="1"] i{transform:translateX(17px)}
.qa-scrim{position:fixed;inset:0;background:rgba(10,20,16,.4);z-index:50;display:flex;align-items:flex-end;justify-content:center}
.qa-sheet{background:var(--surface);width:100%;max-height:86vh;overflow-y:auto;border-radius:18px 18px 0 0;padding:16px 14px calc(20px + env(safe-area-inset-bottom));border:1px solid var(--line)}
.qa-sheeth{display:flex;align-items:flex-start;gap:10px;margin-bottom:12px}
.qa-toast{position:fixed;left:50%;transform:translateX(-50%);bottom:92px;z-index:60;background:var(--ink);color:var(--bg);padding:10px 15px;border-radius:99px;font-size:13.5px;box-shadow:0 8px 24px rgba(0,0,0,.22);max-width:88vw;text-align:center}
.qa-avb{display:flex;align-items:center;justify-content:space-between;gap:8px;width:100%;text-align:left;padding:10px 11px;border-radius:10px;border:1px solid var(--line);background:var(--surface);margin-bottom:6px}
.qa-avb[data-on="1"]{background:var(--jadeSoft);border-color:var(--jade);color:var(--jade)}
.qa-avb[data-locked="1"]{opacity:.65;cursor:default}
.qa-bar{height:5px;border-radius:99px;background:var(--line);overflow:hidden;margin-top:8px}
.qa-bar i{display:block;height:100%;background:var(--jade)}
.qa-issue{display:flex;gap:8px;padding:8px 0;border-bottom:1px solid var(--line);font-size:13px;align-items:flex-start}
.qa-issue:last-child{border-bottom:none}
.qa-ta{width:100%;border:1px solid var(--line);border-radius:10px;padding:10px;background:var(--surface2);color:var(--ink);font:inherit;font-size:14px;resize:vertical;min-height:72px}
.qa-note{font-size:12px;color:var(--muted);background:var(--surface2);border-radius:10px;padding:9px 11px}
.qa-grid2{display:grid;gap:10px;grid-template-columns:1fr 1fr}
.qa-kpi{font-family:var(--serif);font-size:28px;line-height:1.1}
.qa-kpil{font-size:12px;color:var(--muted);margin-top:2px}
.qa-seg{display:flex;background:var(--surface2);border:1px solid var(--line);border-radius:10px;padding:2px;gap:2px}
.qa-seg button{flex:1;padding:6px 8px;border-radius:8px;font-size:12.5px;color:var(--muted)}
.qa-seg button[data-on="1"]{background:var(--surface);color:var(--ink);box-shadow:var(--sh)}
.qa-in{width:100%;border:1px solid var(--line);border-radius:10px;padding:10px 11px;background:var(--surface);color:var(--ink);font:inherit;font-size:15px}
.qa-in:focus{outline:2px solid var(--jade);outline-offset:0;border-color:var(--jade)}
.qa-in[data-bad="1"]{border-color:var(--clay)}
.qa-lbl{display:block;font-size:12.5px;color:var(--muted);margin:10px 0 4px}
.qa-err{font-size:12px;color:var(--clay);margin-top:4px}
.qa-auth{min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:18px}
.qa-authcard{width:100%;max-width:400px;background:var(--surface);border:1px solid var(--line);border-radius:16px;padding:20px;box-shadow:var(--sh)}
.qa-authhead{text-align:center;margin-bottom:14px}
.qa-link{color:var(--jade);text-decoration:underline;font-size:13px;padding:4px 0}
.qa-code{font-family:var(--serif);font-size:24px;letter-spacing:.14em;padding:12px;border:1px dashed var(--jade);border-radius:10px;text-align:center;background:var(--jadeSoft);color:var(--jade)}
.qa-wp{display:flex;align-items:center;gap:12px;width:100%;text-align:left;background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:14px;margin-bottom:10px;box-shadow:var(--sh)}
.qa-wp:hover{border-color:var(--jade)}
.qa-wpav{width:40px;height:40px;border-radius:11px;background:var(--jadeSoft);color:var(--jade);display:grid;place-items:center;flex:none;font-family:var(--serif);font-size:17px}
.qa-daypick{display:flex;gap:5px;flex-wrap:wrap}
.qa-daybtn{padding:7px 0;border-radius:9px;border:1px solid var(--line);background:var(--surface);font-size:12px;min-width:40px;flex:1;text-transform:capitalize}
.qa-daybtn[data-on="1"]{background:var(--jade);color:#fff;border-color:var(--jade)}
.qa-prog{display:flex;gap:6px;margin-bottom:16px}
.qa-prog i{height:3px;flex:1;border-radius:99px;background:var(--line);display:block}
.qa-prog i[data-on="1"]{background:var(--jade)}
@media (min-width:900px){
  .qa-tabs{display:none}
  .qa-main{padding-bottom:0}
  .qa-side{display:flex;flex-direction:column;gap:2px;width:210px;flex:none;padding:14px 10px;border-right:1px solid var(--line);position:sticky;top:0;height:100vh}
  .qa-sidebtn{display:flex;align-items:center;gap:10px;padding:9px 11px;border-radius:10px;font-size:14px;color:var(--muted)}
  .qa-sidebtn[data-on="1"]{background:var(--jadeSoft);color:var(--jade);font-weight:500}
  .qa-week{grid-template-columns:repeat(7,1fr);gap:7px}
  .qa-dayh{flex-direction:column;align-items:flex-start;gap:0}
  .qa-scrim{align-items:center}
  .qa-sheet{max-width:520px;border-radius:16px;max-height:80vh}
  .qa-toast{bottom:26px}
  .qa-wrap{padding:20px 20px 40px}
}
@media (prefers-reduced-motion:reduce){.qa-root *{transition:none!important;animation:none!important}}
`;

/* ---------------- shared UI ---------------- */
const Ctx = React.createContext(null);
const useApp = () => React.useContext(Ctx);

function Btn({ children, v, sm, wide, ...p }) {
  return <button className={"qa-btn" + (wide ? " qa-wide" : "")} data-v={v} data-sm={sm ? "1" : undefined} {...p}>{children}</button>;
}
function Switch({ on, onChange }) {
  return <button className="qa-sw" data-on={on ? "1" : "0"} role="switch" aria-checked={on} onClick={onChange}><i /></button>;
}
function Sheet({ open, onClose, title, sub, children }) {
  if (!open) return null;
  return (
    <div className="qa-scrim" onClick={onClose}>
      <div className="qa-sheet" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="qa-sheeth">
          <div style={{ flex: 1 }}>
            <h2 className="qa-h" style={{ fontSize: 21 }}>{title}</h2>
            {sub && <div className="qa-meta">{sub}</div>}
          </div>
          <button className="qa-ib" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}
function Row({ left, title, meta, right }) {
  return (
    <div className="qa-item">
      {left}
      <div className="qa-nm"><div>{title}</div>{meta && <div className="qa-meta">{meta}</div>}</div>
      {right}
    </div>
  );
}

const kindLabel = (s, t) => (s.kind === "open" ? t("open") : s.kind === "close" ? t("close") : `${s.start}`);

/* ---------------- issue helpers ---------------- */
const BAD = ["understaffed", "noL3", "unavailAssigned", "notSubAssigned"];
function issueText(i, t, lang, shifts) {
  const s = i.shiftId ? shifts.find((x) => x.id === i.shiftId) : null;
  const d = s ? fmtDay(s.date, lang) : i.date ? fmtDay(i.date, lang) : "";
  const k = s ? kindLabel(s, t).toLowerCase() : "";
  const nm = i.pid ? first(i.pid) : "";
  switch (i.type) {
    case "understaffed": return t("understaffed", { d, k, a: i.a, b: i.b });
    case "noL3": return t("noL3", { d, k });
    case "unavailAssigned": return t("unavailAssigned", { name: nm, d, k });
    case "notSubAssigned": return t("notSubAssigned", { name: nm, d, k });
    case "underHours": return t("underHours", { name: nm, a: i.a, b: i.b });
    case "overHours": return t("overHours", { name: nm, a: i.a, b: i.b });
    case "tooManyDays": return t("tooManyDays", { name: nm, n: i.n });
    case "doubleDay": return t("doubleDay", { name: nm, d });
    default: return i.type;
  }
}
function checkLevel(type, checks) {
  if (type === "understaffed") return checks.understaffed;
  if (type === "noL3") return checks.noL3;
  if (type === "unavailAssigned" || type === "notSubAssigned") return checks.unavailable;
  return "show";
}

/* ---------------- shift card ---------------- */
function ShiftCard({ s, roster, onClick, me, mineOnly }) {
  const { t, lang, st } = useApp();
  const missing = roster.length < s.headcount;
  const noL3 = s.requiresL3 && !roster.some((p) => st.levels[p] === 3);
  const given = st.giveaways.find((g) => g.shiftId === s.id && g.status === "open");
  const state = missing || noL3 ? (missing ? "bad" : "warn") : "ok";
  const mine = roster.includes(me);
  if (mineOnly && !mine) return null;
  return (
    <button className="qa-shift" data-s={state} data-mine={mine ? "1" : undefined} onClick={onClick}>
      <div className="qa-shifth">
        <span className="qa-time">{kindLabel(s, t)} · {s.start}–{s.end}</span>
        <span className="qa-fill" style={{ color: missing ? "var(--clay)" : undefined }}>{roster.length}/{s.headcount}</span>
      </div>
      <div className="qa-names">
        {roster.length === 0 && <span className="qa-empty">—</span>}
        {roster.map((pid) => {
          const bad = !st.avail[pid].submitted || !st.avail[pid].blocks[s.id];
          return <span key={pid} className="qa-chip" data-bad={bad ? "1" : undefined} data-me={pid === me ? "1" : undefined}>
            {first(pid)}<span className="qa-lv">{t("level", { n: st.levels[pid] })}</span>
          </span>;
        })}
      </div>
      {(noL3 || given) && (
        <div style={{ marginTop: 6, display: "flex", gap: 5, flexWrap: "wrap" }}>
          {noL3 && <span className="qa-pill" data-t="warn"><AlertTriangle size={11} />{t("noL3", { d: "", k: "" }).replace(/^[^:]*:\s*/, "")}</span>}
          {given && <span className="qa-pill" data-t="bad"><Gift size={11} />{t("givenAway")}</span>}
        </div>
      )}
    </button>
  );
}

/* ---------------- week grid ---------------- */
function WeekGrid({ week, assignments, onPick, mineOnly }) {
  const { st, lang } = useApp();
  const days = [...new Set(st.shifts.filter((s) => s.week === week).map((s) => s.date))];
  return (
    <div className="qa-week">
      {days.map((d) => (
        <div className="qa-day" key={d}>
          <div className="qa-dayh"><span className="qa-dow">{fmtDow(d, lang)}</span><span className="qa-dnum">{fmtNum(d)}</span></div>
          {st.shifts.filter((s) => s.date === d).map((s) => (
            <ShiftCard key={s.id} s={s} roster={(assignments && assignments[s.id]) || []} me={st.viewAs} mineOnly={mineOnly} onClick={() => onPick(s)} />
          ))}
        </div>
      ))}
    </div>
  );
}
function WeekTabs({ week, setWeek }) {
  const { st, t } = useApp();
  if (st.weeks < 2) return null;
  return (
    <div className="qa-seg" style={{ marginBottom: 12 }}>
      {Array.from({ length: st.weeks }).map((_, i) => (
        <button key={i} data-on={week === i ? "1" : "0"} onClick={() => setWeek(i)}>{t("weekN", { n: i + 1 })}</button>
      ))}
    </div>
  );
}

/* ---------------- admin: schedule ---------------- */
function weekHours(asg, shifts, pid, week) {
  return shifts.reduce((n, s) => n + (s.week === week && (asg[s.id] || []).includes(pid) ? s.hours : 0), 0);
}
function AdminSchedule() {
  const { st, d, t, lang, evalResult } = useApp();
  const [week, setWeek] = useState(0);
  const [sel, setSel] = useState(null);
  const [showIssues, setShowIssues] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const issues = evalResult.issues;
  const dirty = st.published && JSON.stringify(st.published.asg) !== JSON.stringify(st.draft);

  const run = () => { setBusy(true); setTimeout(() => { d({ type: "generate" }); setBusy(false); }, 320); };
  const tryPublish = () => {
    const blocking = issues.filter((i) => checkLevel(i.type, st.settings.checks) === "block");
    if (blocking.length) return d({ type: "toast", toast: { k: "blockedPublish" } });
    const confirming = issues.filter((i) => checkLevel(i.type, st.settings.checks) === "confirm");
    if (confirming.length) return setConfirmOpen(true);
    d({ type: st.published ? "updatePublish" : "publish" });
  };

  if (!st.draft) {
    return (
      <div>
        <h1 className="qa-h">{t("navSchedule")}</h1>
        <div className="qa-sub">{t("periodDates", { a: fmtShort(st.startISO, lang), b: fmtShort(iso(addDays(new Date(st.startISO + "T12:00:00"), st.weeks * 7 - 1)), lang) })}</div>
        <div className="qa-card" style={{ textAlign: "center", padding: "30px 16px" }}>
          <Wand2 size={26} style={{ color: "var(--jade)" }} />
          <div style={{ marginTop: 10, marginBottom: 4, fontSize: 15 }}>{t("statusCollecting")}</div>
          <div className="qa-meta" style={{ marginBottom: 16 }}>
            {t("availSent", { a: ROSTER.filter((p) => st.avail[p.id].submitted).length, b: ROSTER.length })}
          </div>
          <Btn v="primary" onClick={run} disabled={busy}>{busy ? t("generating") : t("generate")}</Btn>
          <div style={{ height: 8 }} />
          <Btn sm onClick={() => d({ type: "startManual" })}><Plus size={13} />{t("addSomeone")}</Btn>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="qa-row" style={{ alignItems: "flex-start" }}>
        <div style={{ flex: 1 }}>
          <h1 className="qa-h">{t("navSchedule")}</h1>
          <div className="qa-sub">
            {st.published ? t("statusPublished", { n: st.published.version }) : t("statusDraft")} · {t("periodDates", { a: fmtShort(st.startISO, lang), b: fmtShort(iso(addDays(new Date(st.startISO + "T12:00:00"), st.weeks * 7 - 1)), lang) })}
          </div>
        </div>
      </div>

      <div className="qa-row" style={{ gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
        <Btn sm onClick={run} disabled={busy}><RefreshCw size={13} />{busy ? t("generating") : t("regenerate")}</Btn>
        <Btn sm v="primary" onClick={tryPublish} disabled={st.published && !dirty}>
          <Send size={13} />{st.published ? t("update") : t("publish")}
        </Btn>
        <button className="qa-pill" data-t={issues.length ? (issues.some((i) => BAD.includes(i.type)) ? "bad" : "warn") : "ok"} onClick={() => setShowIssues(true)}>
          {issues.length ? <AlertTriangle size={11} /> : <Check size={11} />}
          {issues.length ? t("issuesN", { n: issues.length }) : t("noIssues")}
        </button>
      </div>

      <WeekTabs week={week} setWeek={setWeek} />
      <WeekGrid week={week} assignments={st.draft} onPick={setSel} />

      <ShiftSheet s={sel} onClose={() => setSel(null)} />

      <Sheet open={showIssues} onClose={() => setShowIssues(false)} title={t("issues")} sub={issues.length ? t("issuesN", { n: issues.length }) : t("noIssues")}>
        {issues.length === 0 && <div className="qa-note">{t("noIssues")}</div>}
        {issues.map((i, n) => (
          <div className="qa-issue" key={n}>
            <span style={{ color: BAD.includes(i.type) ? "var(--clay)" : "var(--amber)", marginTop: 2 }}>
              {BAD.includes(i.type) ? <AlertTriangle size={14} /> : <Clock size={14} />}
            </span>
            <span>{issueText(i, t, lang, st.shifts)}</span>
          </div>
        ))}
      </Sheet>

      <Sheet open={confirmOpen} onClose={() => setConfirmOpen(false)} title={t("confirmPublish", { n: issues.filter((i) => checkLevel(i.type, st.settings.checks) === "confirm").length })}>
        <div className="qa-note" style={{ marginBottom: 12 }}>
          {issues.filter((i) => checkLevel(i.type, st.settings.checks) === "confirm").slice(0, 4).map((i, n) => <div key={n}>· {issueText(i, t, lang, st.shifts)}</div>)}
        </div>
        <div className="qa-row">
          <Btn wide onClick={() => setConfirmOpen(false)}>{t("cancel")}</Btn>
          <Btn wide v="primary" onClick={() => { setConfirmOpen(false); d({ type: st.published ? "updatePublish" : "publish" }); }}>{t("confirm")}</Btn>
        </div>
      </Sheet>
    </div>
  );
}

function ShiftSheet({ s, onClose }) {
  const { st, d, t, lang } = useApp();
  if (!s) return null;
  const roster = (st.draft && st.draft[s.id]) || [];
  const pool = ROSTER.filter((p) => !roster.includes(p.id) && (p.id !== ADMIN_ID || st.settings.adminWorks));
  const rank = (p) => {
    const a = st.avail[p.id];
    if (!a.submitted) return 2;
    return a.blocks[s.id] ? 0 : 1;
  };
  const sorted = [...pool].sort((x, y) => rank(x) - rank(y) || st.levels[y.id] - st.levels[x.id]);
  const statusOf = (p) => (!st.avail[p.id].submitted ? { k: "noAnswer", c: "var(--slate)" } : st.avail[p.id].blocks[s.id] ? { k: "available", c: "var(--jade)" } : { k: "unavailable", c: "var(--clay)" });

  return (
    <Sheet open onClose={onClose} title={fmtDay(s.date, lang)} sub={`${kindLabel(s, t)} · ${s.start}–${s.end} · ${roster.length}/${s.headcount}`}>
      <div className="qa-sec" style={{ marginTop: 0 }}>{t("roster")}</div>
      <div className="qa-list">
        {roster.length === 0 && <div className="qa-note">{t("addSomeone")}</div>}
        {roster.map((pid) => {
          const stt = statusOf(byId(pid));
          const locked = !!st.locks[`${s.id}::${pid}`];
          return (
            <Row key={pid}
              left={<span style={{ width: 8, height: 8, borderRadius: 99, background: stt.c, flex: "none" }} />}
              title={<span>{byId(pid).name} <span className="qa-lv">{t("level", { n: st.levels[pid] })}</span></span>}
              meta={`${t(stt.k)} · ${t("hoursShort", { a: weekHours(st.draft, st.shifts, pid, s.week), b: byId(pid).desired })}`}
              right={<span className="qa-row" style={{ gap: 4 }}>
                <button className="qa-ib" title={t("lockPerson")} style={{ color: locked ? "var(--jade)" : undefined }} onClick={() => d({ type: "toggleLock", shiftId: s.id, pid })}><Lock size={15} /></button>
                <button className="qa-ib" title={t("remove")} onClick={() => d({ type: "unassign", shiftId: s.id, pid })}><Trash2 size={15} /></button>
              </span>}
            />
          );
        })}
      </div>
      <div className="qa-note" style={{ marginTop: 8 }}>{t("locksKept")}</div>

      <div className="qa-sec">{t("addSomeone")}</div>
      <div className="qa-list">
        {sorted.map((p) => {
          const stt = statusOf(p);
          return (
            <Row key={p.id}
              left={<span style={{ width: 8, height: 8, borderRadius: 99, background: stt.c, flex: "none" }} />}
              title={<span>{p.name} <span className="qa-lv">{t("level", { n: st.levels[p.id] })}</span></span>}
              meta={<>
                {`${t(stt.k)} · ${t("hoursShort", { a: weekHours(st.draft, st.shifts, p.id, s.week), b: p.desired })}`}
                {st.avail[p.id].submitted && st.avail[p.id].comment && (
                  <span style={{ display: "block", marginTop: 2 }}><MessageSquareText size={11} style={{ verticalAlign: -1 }} /> {st.avail[p.id].comment.length > 70 ? st.avail[p.id].comment.slice(0, 70) + "…" : st.avail[p.id].comment}</span>
                )}
              </>}
              right={<Btn sm onClick={() => d({ type: "assign", shiftId: s.id, pid: p.id })}><Plus size={13} /></Btn>}
            />
          );
        })}
      </div>
    </Sheet>
  );
}

/* ---------------- availability ---------------- */
function simulateGcal(shifts, p, seed) {
  const rng = mulberry32(seed);
  const blocks = {};
  shifts.forEach((s) => { if (rng() < (p.pat === "eve" ? (s.kind === "close" ? 0.8 : 0.3) : p.pat === "day" ? (s.kind === "open" ? 0.8 : 0.3) : 0.6)) blocks[s.id] = true; });
  return blocks;
}
function AvailabilityScreen() {
  const { st, d, t, lang } = useApp();
  const me = st.viewAs;
  const isAdmin = me === ADMIN_ID;
  const [week, setWeek] = useState(0);
  const editable = !st.availLocked || !!st.reopened[me];
  const mine = st.avail[me];
  const [comment, setComment] = useState(mine.comment || "");
  const days = [...new Set(st.shifts.filter((s) => s.week === week).map((s) => s.date))];
  const count = Object.keys(mine.blocks).length;
  const sentCount = ROSTER.filter((p) => st.avail[p.id].submitted).length;

  const showForm = !isAdmin || st.settings.adminWorks;

  return (
    <div>
      <h1 className="qa-h">{t("navAvail")}</h1>
      <div className="qa-sub">{t("periodDates", { a: fmtShort(st.startISO, lang), b: fmtShort(iso(addDays(new Date(st.startISO + "T12:00:00"), st.weeks * 7 - 1)), lang) })}</div>

      {isAdmin && (
        <div className="qa-card" style={{ marginBottom: 12 }}>
          <div className="qa-row"><div style={{ flex: 1 }}>
            <div className="qa-kpi">{sentCount}/{ROSTER.length}</div>
            <div className="qa-kpil">{t("availSent", { a: sentCount, b: ROSTER.length })}</div>
          </div>{st.availLocked && <span className="qa-pill"><Lock size={11} />{t("locked")}</span>}</div>
          <div className="qa-bar"><i style={{ width: `${(sentCount / ROSTER.length) * 100}%` }} /></div>
          <div className="qa-list" style={{ marginTop: 10 }}>
            {ROSTER.filter((p) => p.id !== ADMIN_ID || st.settings.adminWorks).map((p) => (
              <Row key={p.id}
                left={<span style={{ width: 8, height: 8, borderRadius: 99, flex: "none", background: st.avail[p.id].submitted ? "var(--jade)" : "var(--slate)" }} />}
                title={<span>{p.name} <span className="qa-lv">{t("level", { n: st.levels[p.id] })}</span></span>}
                meta={<>
                  {st.avail[p.id].submitted ? `${t("sent")} · ${Object.keys(st.avail[p.id].blocks).length} · ${t("desiredHours", { n: p.desired })}` : t("notSubmitted")}
                  {st.avail[p.id].submitted && st.avail[p.id].comment && (
                    <span style={{ display: "flex", gap: 6, marginTop: 5, padding: "7px 9px", background: "var(--surface2)", borderRadius: 8, color: "var(--ink)", fontSize: 13 }}>
                      <MessageSquareText size={13} style={{ flex: "none", marginTop: 2, color: "var(--jade)" }} />
                      <span style={{ whiteSpace: "pre-wrap" }}>{st.avail[p.id].comment}</span>
                    </span>
                  )}
                </>}
                right={st.availLocked && st.avail[p.id].submitted && !st.reopened[p.id]
                  ? <Btn sm onClick={() => d({ type: "reopen", pid: p.id })}><Undo2 size={12} />{t("reopen")}</Btn>
                  : st.reopened[p.id] ? <span className="qa-pill" data-t="warn">{t("reopen")}</span> : null}
              />
            ))}
          </div>
        </div>
      )}

      {showForm && (
        <>
          <div className="qa-sec">{t("availYours")}</div>
          {!editable && <div className="qa-note" style={{ marginBottom: 10 }}><Lock size={12} /> {t("locked")} — {t("lockedNote")}</div>}
          {editable && (
            <>
              <div className="qa-note" style={{ marginBottom: 10 }}>{t("availHint")}</div>
              <div className="qa-row" style={{ gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
                <Btn sm onClick={() => d({ type: "bulkAvail", pid: me, blocks: { ...st.lastAvail[me] } })}><History size={12} />{t("sameAsLast")}</Btn>
                <Btn sm onClick={() => { const b = simulateGcal(st.shifts, byId(me), 42); d({ type: "bulkAvail", pid: me, blocks: b }); d({ type: "toast", toast: { k: "gcalDone", p: { n: Object.keys(b).length } } }); }}><CalendarPlus size={12} />{t("importGcal")}</Btn>
                {st.weeks > 1 && <Btn sm onClick={() => {
                  const b = { ...mine.blocks };
                  st.shifts.filter((s) => s.week === 0).forEach((s) => {
                    for (let w = 1; w < st.weeks; w++) {
                      const tgt = st.shifts.find((x) => x.week === w && x.dow === s.dow && x.kind === s.kind);
                      if (!tgt) continue;
                      if (mine.blocks[s.id]) b[tgt.id] = true; else delete b[tgt.id];
                    }
                  });
                  d({ type: "bulkAvail", pid: me, blocks: b });
                }}><Copy size={12} />{t("copyWeek")}</Btn>}
              </div>
            </>
          )}
          <WeekTabs week={week} setWeek={setWeek} />
          {days.map((date) => (
            <div key={date} style={{ marginBottom: 12 }}>
              <div className="qa-dayh" style={{ flexDirection: "row", gap: 6 }}>
                <span className="qa-dow">{fmtDow(date, lang)}</span><span className="qa-dnum">{fmtNum(date)}</span>
              </div>
              {st.shifts.filter((s) => s.date === date).map((s) => (
                <button key={s.id} className="qa-avb" data-on={mine.blocks[s.id] ? "1" : "0"} data-locked={editable ? undefined : "1"}
                  disabled={!editable} onClick={() => d({ type: "toggleAvail", pid: me, shiftId: s.id })}>
                  <span>{kindLabel(s, t)} <span className="qa-meta">{s.start}–{s.end}</span></span>
                  {mine.blocks[s.id] ? <Check size={16} /> : <span className="qa-meta">+</span>}
                </button>
              ))}
            </div>
          ))}
          <label className="qa-lbl" htmlFor="qa-avail-comment"><MessageSquareText size={12} style={{ verticalAlign: -2 }} /> {t("availComment")}</label>
          <textarea id="qa-avail-comment" className="qa-ta" maxLength={500} disabled={!editable}
            placeholder={t("availCommentPh")} value={comment} onChange={(e) => setComment(e.target.value)} style={{ minHeight: 64 }} />
          <div className="qa-row" style={{ marginBottom: 12 }}>
            <span className="qa-meta" style={{ flex: 1 }}>{t("availCommentWho")}</span>
            <span className="qa-meta">{comment.length}/500</span>
          </div>
          {editable && (
            <Btn v="primary" wide onClick={() => d({ type: "submitAvail", pid: me, comment })}>
              <Send size={14} />{mine.submitted ? t("resend") : t("send")} · {count}
            </Btn>
          )}
        </>
      )}
    </div>
  );
}

/* ---------------- employee: schedule ---------------- */
function EmployeeSchedule() {
  const { st, d, t, lang } = useApp();
  const [week, setWeek] = useState(0);
  const [mineOnly, setMineOnly] = useState(true);
  const [sel, setSel] = useState(null);
  const me = st.viewAs;
  if (!st.published) return (<div><h1 className="qa-h">{t("navSchedule")}</h1><div className="qa-card">{t("notPublished")}</div></div>);
  const asg = st.published.asg;
  const roster = sel ? asg[sel.id] || [] : [];
  const iAmOn = sel && roster.includes(me);
  const given = sel && st.giveaways.find((g) => g.shiftId === sel.id && g.status === "open" && g.fromId === me);

  return (
    <div>
      <h1 className="qa-h">{t("navSchedule")}</h1>
      <div className="qa-sub">{t("statusPublished", { n: st.published.version })}</div>
      <div className="qa-seg" style={{ marginBottom: 12 }}>
        <button data-on={mineOnly ? "1" : "0"} onClick={() => setMineOnly(true)}>{t("myShifts")}</button>
        <button data-on={!mineOnly ? "1" : "0"} onClick={() => setMineOnly(false)}>{t("teamShifts")}</button>
      </div>
      <WeekTabs week={week} setWeek={setWeek} />
      <WeekGrid week={week} assignments={asg} onPick={setSel} mineOnly={mineOnly} />
      <Sheet open={!!sel} onClose={() => setSel(null)} title={sel ? fmtDay(sel.date, lang) : ""} sub={sel ? `${kindLabel(sel, t)} · ${sel.start}–${sel.end}` : ""}>
        <div className="qa-list">
          {roster.map((pid) => <Row key={pid} left={<span style={{ width: 8, height: 8, borderRadius: 99, background: "var(--jade)", flex: "none" }} />}
            title={<span>{byId(pid).name}{pid === me ? ` (${t("you")})` : ""} <span className="qa-lv">{t("level", { n: st.levels[pid] })}</span></span>} />)}
          {roster.length < sel?.headcount && <div className="qa-note" style={{ marginTop: 8 }}>{t("understaffed", { d: "", k: "", a: roster.length, b: sel.headcount }).replace(/^\s*:\s*/, "")}</div>}
        </div>
        {iAmOn && !given && <div style={{ marginTop: 14 }}><Btn wide v="danger" onClick={() => { d({ type: "giveaway", shiftId: sel.id, pid: me }); setSel(null); }}><Gift size={14} />{t("giveAway")}</Btn></div>}
        {given && <div className="qa-note" style={{ marginTop: 12 }}>{t("giveAwayDone")}</div>}
      </Sheet>
    </div>
  );
}

/* ---------------- employee: open shifts + trades ---------------- */
function OpenShifts() {
  const { st, d, t, lang } = useApp();
  const me = st.viewAs;
  const [mineShift, setMineShift] = useState("");
  const [theirShift, setTheirShift] = useState("");
  if (!st.published) return (<div><h1 className="qa-h">{t("navShifts")}</h1><div className="qa-card">{t("notPublished")}</div></div>);
  const asg = st.published.asg;
  const myShifts = st.shifts.filter((s) => (asg[s.id] || []).includes(me));
  const theirShifts = st.shifts.filter((s) => (asg[s.id] || []).some((p) => p !== me));
  const openSlots = st.shifts.filter((s) => (asg[s.id] || []).length < s.headcount && !(asg[s.id] || []).includes(me));
  const gaves = st.giveaways.filter((g) => g.status === "open" && g.fromId !== me);
  const myClaims = st.claims.filter((c) => c.pid === me && c.status === "pending");
  const inTrades = st.trades.filter((x) => x.bId === me && x.status === "awaiting_coworker");
  const outTrades = st.trades.filter((x) => x.aId === me && ["awaiting_coworker", "awaiting_admin"].includes(x.status));
  const worksThatDay = (s) => st.shifts.some((x) => x.date === s.date && x.id !== s.id && (asg[x.id] || []).includes(me)) || (asg[s.id] || []).includes(me);
  const claimRow = (s, gid) => {
    const blocked = worksThatDay(s) && (asg[s.id] || []).includes(me);
    const warn = s.requiresL3 && !(asg[s.id] || []).filter((p) => p !== (gid ? st.giveaways.find((g) => g.id === gid).fromId : null)).some((p) => st.levels[p] === 3) && st.levels[me] !== 3;
    const pending = myClaims.some((c) => c.shiftId === s.id);
    return (
      <Row key={s.id + (gid || "")}
        left={<span style={{ width: 8, height: 8, borderRadius: 99, background: gid ? "var(--amber)" : "var(--clay)", flex: "none" }} />}
        title={`${fmtDay(s.date, lang)} · ${kindLabel(s, t)}`}
        meta={`${s.start}–${s.end} · ${gid ? t("nfGiveaway", { name: first(st.giveaways.find((g) => g.id === gid).fromId), d: "", k: "" }).replace(/\s+$/, "") : `${(asg[s.id] || []).length}/${s.headcount}`}${warn ? " · " + t("claimNoL3") : ""}`}
        right={pending ? <span className="qa-pill" data-t="warn">{t("pendingApproval")}</span>
          : <Btn sm v="primary" disabled={blocked} onClick={() => d({ type: "claim", shiftId: s.id, pid: me, giveawayId: gid })}>{t("claim")}</Btn>}
      />
    );
  };
  return (
    <div>
      <h1 className="qa-h">{t("navShifts")}</h1>
      <div className="qa-sub">{t("openShiftsN", { n: openSlots.length + gaves.length })}</div>

      <div className="qa-card">
        <div className="qa-sec" style={{ marginTop: 0 }}>{t("openShifts")}</div>
        <div className="qa-list">
          {openSlots.length === 0 && gaves.length === 0 && <div className="qa-note">{t("noRequests")}</div>}
          {openSlots.map((s) => claimRow(s, null))}
          {gaves.map((g) => claimRow(st.shifts.find((s) => s.id === g.shiftId), g.id))}
        </div>
      </div>

      <div className="qa-card">
        <div className="qa-sec" style={{ marginTop: 0 }}>{t("trade")}</div>
        {inTrades.map((x) => (
          <Row key={x.id} left={<ArrowLeftRight size={15} style={{ color: "var(--amber)" }} />}
            title={t("nfTrade", { name: first(x.aId) })}
            meta={`${fmtDay(st.shifts.find((s) => s.id === x.aShift).date, lang)} ↔ ${fmtDay(st.shifts.find((s) => s.id === x.bShift).date, lang)}`}
            right={<span className="qa-row" style={{ gap: 6 }}>
              <Btn sm onClick={() => d({ type: "tradeDecline", id: x.id })}>{t("tradeDecline")}</Btn>
              <Btn sm v="primary" onClick={() => d({ type: "tradeAccept", id: x.id })}>{t("tradeAccept")}</Btn>
            </span>} />
        ))}
        {outTrades.map((x) => (
          <Row key={x.id} left={<ArrowLeftRight size={15} style={{ color: "var(--muted)" }} />}
            title={x.status === "awaiting_coworker" ? t("awaitingCoworker", { name: first(x.bId) }) : t("awaitingAdmin")}
            meta={t("tradeExpires", { n: 14 })}
            right={<Btn sm onClick={() => d({ type: "tradeCancel", id: x.id })}>{t("tradeCancel")}</Btn>} />
        ))}
        <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
          <label className="qa-meta">{t("pickMine")}
            <select className="qa-sel qa-wide" value={mineShift} onChange={(e) => setMineShift(e.target.value)} style={{ maxWidth: "100%", marginTop: 4 }}>
              <option value="">—</option>
              {myShifts.map((s) => <option key={s.id} value={s.id}>{fmtDay(s.date, lang)} · {kindLabel(s, t)}</option>)}
            </select>
          </label>
          <label className="qa-meta">{t("pickTheirs")}
            <select className="qa-sel qa-wide" value={theirShift} onChange={(e) => setTheirShift(e.target.value)} style={{ maxWidth: "100%", marginTop: 4 }}>
              <option value="">—</option>
              {theirShifts.map((s) => (asg[s.id] || []).filter((p) => p !== me).map((p) => (
                <option key={s.id + p} value={s.id + "::" + p}>{first(p)} · {fmtDay(s.date, lang)} · {kindLabel(s, t)}</option>
              )))}
            </select>
          </label>
          <Btn v="primary" disabled={!mineShift || !theirShift} onClick={() => {
            const [sid, pid] = theirShift.split("::");
            d({ type: "tradeRequest", aId: me, aShift: mineShift, bId: pid, bShift: sid });
            setMineShift(""); setTheirShift("");
          }}><ArrowLeftRight size={14} />{t("sendTrade")}</Btn>
        </div>
      </div>
    </div>
  );
}

/* ---------------- admin: requests ---------------- */
function Requests() {
  const { st, d, t, lang } = useApp();
  const pending = st.claims.filter((c) => c.status === "pending");
  const byShift = {};
  pending.forEach((c) => { byShift[c.shiftId] = byShift[c.shiftId] || []; byShift[c.shiftId].push(c); });
  const trades = st.trades.filter((x) => x.status === "awaiting_admin");
  const unclaimed = st.giveaways.filter((g) => g.status === "open");
  const empty = !pending.length && !trades.length && !unclaimed.length;
  return (
    <div>
      <h1 className="qa-h">{t("navRequests")}</h1>
      <div className="qa-sub">{empty ? t("noRequests") : ""}</div>
      {!!Object.keys(byShift).length && (
        <div className="qa-card">
          <div className="qa-sec" style={{ marginTop: 0 }}>{t("reqClaims")}</div>
          {Object.keys(byShift).map((sid) => {
            const s = st.shifts.find((x) => x.id === sid);
            return (
              <div key={sid} style={{ marginBottom: 10 }}>
                <div className="qa-meta" style={{ marginBottom: 4 }}>
                  {fmtDay(s.date, lang)} · {kindLabel(s, t)}
                  {byShift[sid].length > 1 ? ` — ${t("pickOne", { n: byShift[sid].length })}` : ""}
                </div>
                {byShift[sid].map((c) => (
                  <Row key={c.id} left={<span style={{ width: 8, height: 8, borderRadius: 99, background: "var(--amber)", flex: "none" }} />}
                    title={<span>{byId(c.pid).name} <span className="qa-lv">{t("level", { n: st.levels[c.pid] })}</span></span>}
                    meta={st.avail[c.pid].blocks[sid] ? t("available") : t("unavailable")}
                    right={<span className="qa-row" style={{ gap: 6 }}>
                      <Btn sm onClick={() => d({ type: "declineClaim", id: c.id })}><X size={13} /></Btn>
                      <Btn sm v="primary" onClick={() => d({ type: "approveClaim", id: c.id })}><Check size={13} /></Btn>
                    </span>} />
                ))}
              </div>
            );
          })}
        </div>
      )}
      {!!trades.length && (
        <div className="qa-card">
          <div className="qa-sec" style={{ marginTop: 0 }}>{t("reqTrades")}</div>
          {trades.map((x) => (
            <Row key={x.id} left={<ArrowLeftRight size={15} style={{ color: "var(--amber)" }} />}
              title={t("nfTradeAdmin", { a: first(x.aId), b: first(x.bId) })}
              meta={`${fmtDay(st.shifts.find((s) => s.id === x.aShift).date, lang)} ↔ ${fmtDay(st.shifts.find((s) => s.id === x.bShift).date, lang)}`}
              right={<span className="qa-row" style={{ gap: 6 }}>
                <Btn sm onClick={() => d({ type: "tradeDecline", id: x.id })}><X size={13} /></Btn>
                <Btn sm v="primary" onClick={() => d({ type: "tradeApprove", id: x.id })}><Check size={13} /></Btn>
              </span>} />
          ))}
        </div>
      )}
      {!!unclaimed.length && (
        <div className="qa-card">
          <div className="qa-sec" style={{ marginTop: 0 }}>{t("reqGiveaways")}</div>
          {unclaimed.map((g) => {
            const s = st.shifts.find((x) => x.id === g.shiftId);
            return <Row key={g.id} left={<Gift size={15} style={{ color: "var(--clay)" }} />}
              title={`${fmtDay(s.date, lang)} · ${kindLabel(s, t)}`}
              meta={t("nfGiveaway", { name: first(g.fromId), d: "", k: "" })} />;
          })}
        </div>
      )}
    </div>
  );
}

/* ---------------- announcements ---------------- */
const IMG_TYPES = ["image/jpeg", "image/png", "image/webp"];
const IMG_MAX_BYTES = 10 * 1024 * 1024;
const IMG_MAX_PER_POST = 6;
// Re-drawing the picture on a canvas re-encodes it, which drops EXIF metadata (including GPS
// location) and shrinks it. The real backend repeats this on the server and never trusts the client.
function reencodeImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, 1600 / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL(file.type === "image/png" ? "image/png" : "image/jpeg", 0.85));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("decode")); };
    img.src = url;
  });
}
function AnnouncementsScreen() {
  const { st, d, t, lang } = useApp();
  const isAdmin = st.viewAs === ADMIN_ID;
  const [txt, setTxt] = useState("");
  const [imgs, setImgs] = useState([]);
  const [busy, setBusy] = useState(false);
  const [zoom, setZoom] = useState(null);
  const fileRef = useRef(null);
  const pick = async (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    const out = [];
    for (const f of files) {
      if (!IMG_TYPES.includes(f.type)) { d({ type: "toast", toast: { k: "imgTypeErr" } }); continue; }
      if (f.size > IMG_MAX_BYTES) { d({ type: "toast", toast: { k: "imgSizeErr" } }); continue; }
      if (imgs.length + out.length >= IMG_MAX_PER_POST) { d({ type: "toast", toast: { k: "imgCountErr", p: { n: IMG_MAX_PER_POST } } }); break; }
      try { setBusy(true); out.push(await reencodeImage(f)); } catch { d({ type: "toast", toast: { k: "imgTypeErr" } }); }
    }
    setBusy(false);
    setImgs([...imgs, ...out]);
  };
  const fmt = (ts) => new Intl.DateTimeFormat(loc(lang), { day: "numeric", month: "short" }).format(new Date(ts));
  return (
    <div>
      <h1 className="qa-h">{t("navNews")}</h1>
      <div className="qa-sub">{t("newsSub")}</div>

      {isAdmin && (
        <div className="qa-card" style={{ marginBottom: 12 }}>
          <textarea className="qa-ta" placeholder={t("writeAnnouncement")} value={txt} maxLength={2000} onChange={(e) => setTxt(e.target.value)} />
          {imgs.length > 0 && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 6, marginTop: 8 }}>
              {imgs.map((src, i) => (
                <div key={i} style={{ position: "relative" }}>
                  <img src={src} alt="" style={{ width: "100%", aspectRatio: "1", objectFit: "cover", borderRadius: 8, display: "block" }} />
                  <button className="qa-ib" aria-label={t("remove")} onClick={() => setImgs(imgs.filter((_, n) => n !== i))}
                    style={{ position: "absolute", top: 3, right: 3, width: 26, height: 26, background: "var(--surface)" }}><X size={13} /></button>
                </div>
              ))}
            </div>
          )}
          <input ref={fileRef} type="file" accept={IMG_TYPES.join(",")} multiple style={{ display: "none" }} onChange={pick} />
          <div className="qa-row" style={{ gap: 8, marginTop: 8 }}>
            <Btn sm onClick={() => fileRef.current && fileRef.current.click()} disabled={busy || imgs.length >= IMG_MAX_PER_POST}><ImagePlus size={13} />{t("addPhotos")}</Btn>
            <div className="qa-spacer" />
            <Btn sm v="primary" disabled={busy || (!txt.trim() && !imgs.length)} onClick={() => { d({ type: "announce", body: txt.trim(), images: imgs }); setTxt(""); setImgs([]); }}><Send size={12} />{t("post")}</Btn>
          </div>
          <div className="qa-meta" style={{ marginTop: 8 }}><Lock size={11} style={{ verticalAlign: -1 }} /> {t("imagesPrivate")}</div>
        </div>
      )}

      {st.announcements.length === 0 && <div className="qa-card qa-meta">{t("noAnnouncements")}</div>}
      {st.announcements.map((a) => {
        const n = Object.keys(a.reactions || {}).length, mine = !!(a.reactions || {})[st.viewAs];
        return (
          <div key={a.id} className="qa-card">
            {(typeof a.body === "string" ? a.body : a.body[lang]) && <div style={{ fontSize: 14.5, whiteSpace: "pre-wrap" }}>{typeof a.body === "string" ? a.body : a.body[lang]}</div>}
            {a.images && a.images.length > 0 && (
              <div style={{ display: "grid", gridTemplateColumns: a.images.length === 1 ? "1fr" : "repeat(2,1fr)", gap: 6, marginTop: 10 }}>
                {a.images.map((src, i) => (
                  <button key={i} onClick={() => setZoom(src)} style={{ padding: 0 }} aria-label={t("openImage")}>
                    <img src={src} alt="" style={{ width: "100%", maxHeight: 320, objectFit: "cover", borderRadius: 10, display: "block" }} />
                  </button>
                ))}
              </div>
            )}
            <div className="qa-row" style={{ marginTop: 10 }}>
              <span className="qa-meta" style={{ flex: 1 }}>{first(a.author)}, {fmt(a.ts)}</span>
              <button className="qa-pill" data-t={mine ? "ok" : undefined} onClick={() => d({ type: "react", id: a.id, pid: st.viewAs })} aria-pressed={mine}>
                <ThumbsUp size={11} />{n || ""}
              </button>
              {isAdmin && <button className="qa-ib" aria-label={t("deletePost")} title={t("deletePost")} onClick={() => d({ type: "deleteAnnouncement", id: a.id })}><Trash2 size={15} /></button>}
            </div>
          </div>
        );
      })}

      <Sheet open={!!zoom} onClose={() => setZoom(null)} title={t("navNews")}>
        {zoom && <img src={zoom} alt="" style={{ width: "100%", borderRadius: 10, display: "block" }} />}
      </Sheet>
    </div>
  );
}
function LatestAnnouncement() {
  const { st, d, t, lang } = useApp();
  const a = st.announcements[0];
  return (
    <button className="qa-card" style={{ textAlign: "left", width: "100%", display: "block" }} onClick={() => d({ type: "tab", tab: "news" })}>
      <div className="qa-sec" style={{ marginTop: 0 }}><Megaphone size={13} style={{ verticalAlign: -2 }} /> {t("latestAnnouncement")}</div>
      {a ? (
        <div className="qa-row">
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {(typeof a.body === "string" ? a.body : a.body[lang]) || t("photoPost", { n: (a.images || []).length })}
            </div>
            <div className="qa-meta">{first(a.author)}{a.images && a.images.length ? ` · ${t("photoPost", { n: a.images.length })}` : ""}</div>
          </div>
          <ChevronRight size={16} style={{ color: "var(--muted)" }} />
        </div>
      ) : <div className="qa-meta">{t("noAnnouncements")}</div>}
    </button>
  );
}
/* ---------------- home ---------------- */
function HomeAdmin() {
  const { st, d, t, lang, evalResult } = useApp();
  const sent = ROSTER.filter((p) => st.avail[p.id].submitted).length;
  const issues = st.draft ? evalResult.issues : [];
  const waiting = st.claims.filter((c) => c.status === "pending").length + st.trades.filter((x) => x.status === "awaiting_admin").length + st.giveaways.filter((g) => g.status === "open").length;
  return (
    <div>
      <h1 className="qa-h">{t("workplace")}</h1>
      <div className="qa-sub">{st.published ? t("statusPublished", { n: st.published.version }) : st.draft ? t("statusDraft") : t("statusCollecting")} · {t("periodDates", { a: fmtShort(st.startISO, lang), b: fmtShort(iso(addDays(new Date(st.startISO + "T12:00:00"), st.weeks * 7 - 1)), lang) })}</div>
      <div className="qa-grid2">
        <button className="qa-card" style={{ textAlign: "left" }} onClick={() => d({ type: "tab", tab: "avail" })}>
          <div className="qa-kpi">{sent}/{ROSTER.length}</div><div className="qa-kpil">{t("availSent", { a: sent, b: ROSTER.length })}</div>
          <div className="qa-bar"><i style={{ width: `${(sent / ROSTER.length) * 100}%` }} /></div>
        </button>
        <button className="qa-card" style={{ textAlign: "left" }} onClick={() => d({ type: "tab", tab: "schedule" })}>
          <div className="qa-kpi" style={{ color: issues.some((i) => BAD.includes(i.type)) ? "var(--clay)" : undefined }}>{st.draft ? issues.length : "—"}</div>
          <div className="qa-kpil">{t("issues")}</div>
        </button>
        <button className="qa-card" style={{ textAlign: "left" }} onClick={() => d({ type: "tab", tab: "requests" })}>
          <div className="qa-kpi">{waiting}</div><div className="qa-kpil">{t("navRequests")}</div>
        </button>
        <button className="qa-card" style={{ textAlign: "left" }} onClick={() => d({ type: "tab", tab: "schedule" })}>
          <div className="qa-kpi">{st.published ? "v" + st.published.version : "—"}</div><div className="qa-kpil">{t("navSchedule")}</div>
        </button>
      </div>
      {!st.draft && <div className="qa-card" style={{ marginTop: 12 }}>
        <div style={{ marginBottom: 10 }}>{t("statusCollecting")}</div>
        <Btn v="primary" wide onClick={() => d({ type: "tab", tab: "schedule" })}><Wand2 size={14} />{t("generate")}</Btn>
      </div>}
      <div style={{ height: 12 }} />
      <LatestAnnouncement />
    </div>
  );
}
function HomeEmployee() {
  const { st, d, t, lang } = useApp();
  const me = st.viewAs;
  const asg = st.published ? st.published.asg : null;
  const todayISO = iso(new Date());
  const mine = asg ? st.shifts.filter((s) => (asg[s.id] || []).includes(me)).sort((a, b) => a.date.localeCompare(b.date)) : [];
  const next = mine.find((s) => s.date >= todayISO) || mine[0];
  const hrs = asg ? weekHours(asg, st.shifts, me, 0) : 0;
  const openN = asg ? st.shifts.filter((s) => (asg[s.id] || []).length < s.headcount).length + st.giveaways.filter((g) => g.status === "open" && g.fromId !== me).length : 0;
  const needAvail = !st.avail[me].submitted && !st.availLocked;
  const incoming = st.trades.filter((x) => x.bId === me && x.status === "awaiting_coworker");
  return (
    <div>
      <h1 className="qa-h">{first(me)}</h1>
      <div className="qa-sub">{st.workplaceName || t("workplace")}</div>
      {needAvail && (
        <div className="qa-card" style={{ borderColor: "var(--jade)", marginBottom: 12 }}>
          <div style={{ marginBottom: 10 }}>{t("nfAvailRequest", { a: fmtShort(st.startISO, lang), b: fmtShort(iso(addDays(new Date(st.startISO + "T12:00:00"), st.weeks * 7 - 1)), lang) })}</div>
          <Btn v="primary" wide onClick={() => d({ type: "tab", tab: "avail" })}><CalendarCheck size={14} />{t("send")}</Btn>
        </div>
      )}
      {incoming.length > 0 && (
        <div className="qa-card" style={{ borderColor: "var(--amber)", marginBottom: 12 }}>
          <div className="qa-sec" style={{ marginTop: 0 }}><ArrowLeftRight size={13} style={{ verticalAlign: -2 }} /> {t("trade")}</div>
          {incoming.map((x) => {
            const a = st.shifts.find((s) => s.id === x.aShift), b = st.shifts.find((s) => s.id === x.bShift);
            return (
              <Row key={x.id}
                title={t("tradeIncoming", { name: first(x.aId) })}
                meta={a && b ? `${t("pickTheirs")}: ${fmtDay(a.date, lang)} · ${kindLabel(a, t)} ↔ ${t("pickMine")}: ${fmtDay(b.date, lang)} · ${kindLabel(b, t)}` : ""}
                right={<span className="qa-row" style={{ gap: 6 }}>
                  <Btn sm onClick={() => d({ type: "tradeDecline", id: x.id })}>{t("tradeDecline")}</Btn>
                  <Btn sm v="primary" onClick={() => d({ type: "tradeAccept", id: x.id })}>{t("tradeAccept")}</Btn>
                </span>} />
            );
          })}
        </div>
      )}
      <div className="qa-card">
        <div className="qa-sec" style={{ marginTop: 0 }}>{t("nextShift")}</div>
        {next ? (
          <div className="qa-row">
            <div style={{ flex: 1 }}>
              <div className="qa-kpi" style={{ fontSize: 22 }}>{fmtDay(next.date, lang)}</div>
              <div className="qa-kpil">{kindLabel(next, t)} · {next.start}–{next.end}</div>
            </div>
            <Btn sm onClick={() => d({ type: "tab", tab: "schedule" })}><ChevronRight size={14} /></Btn>
          </div>
        ) : <div className="qa-meta">{st.published ? t("noShifts") : t("notPublished")}</div>}
      </div>
      <div className="qa-grid2" style={{ marginTop: 12 }}>
        <div className="qa-card"><div className="qa-kpi">{hrs}</div><div className="qa-kpil">{t("ofDesired", { a: hrs, b: byId(me).desired })}</div></div>
        <button className="qa-card" style={{ textAlign: "left" }} onClick={() => d({ type: "tab", tab: "shifts" })}>
          <div className="qa-kpi">{openN}</div><div className="qa-kpil">{t("openShifts")}</div>
        </button>
      </div>
      <div style={{ height: 12 }} />
      <LatestAnnouncement />
    </div>
  );
}

/* ---------------- settings ---------------- */
function SettingsScreen() {
  const { st, d, t } = useApp();
  const seg = (key) => (
    <div className="qa-seg" style={{ maxWidth: 260 }}>
      {["block", "confirm", "show"].map((v) => (
        <button key={v} data-on={st.settings.checks[key] === v ? "1" : "0"} onClick={() => d({ type: "check", key, value: v })}>
          {t(v === "block" ? "checkBlock" : v === "confirm" ? "checkConfirm" : "checkShow")}
        </button>
      ))}
    </div>
  );
  return (
    <div>
      <h1 className="qa-h">{t("navSettings")}</h1>
      <div className="qa-sub">{t("workplace")}</div>

      <div className="qa-note" style={{ marginBottom: 10 }}>{t("templateNote")}</div>
      <TemplateBuilder blocks={st.template} onChange={(blocks) => d({ type: "templateSet", template: blocks })} showSetup />

      <div className="qa-card">
        <div className="qa-sec" style={{ marginTop: 0 }}>{t("period")}</div>
        <Row title={t("periodLength")} right={
          <div className="qa-seg" style={{ maxWidth: 180 }}>
            {[1, 2, 4].map((w) => <button key={w} data-on={st.weeks === w ? "1" : "0"} onClick={() => d({ type: "periodWeeks", weeks: w })}>{w === 1 ? t("weekOne") : t("weeksN", { n: w })}</button>)}
          </div>} />
        <Row title={t("joinCode")} meta={st.settings.joinCode}
          right={<Btn sm onClick={() => d({ type: "toast", toast: { k: "copied" } })}><Copy size={13} />{t("copyCode")}</Btn>} />
      </div>

      <div className="qa-card">
        <div className="qa-sec" style={{ marginTop: 0 }}>{t("settingsTeam")}</div>
        <div className="qa-note" style={{ marginBottom: 10 }}>{t("levelsHint")}</div>
        {ROSTER.map((p) => (
          <Row key={p.id}
            title={p.name}
            meta={p.id === ADMIN_ID ? t("admin") : t("desiredHours", { n: p.desired })}
            right={<div className="qa-seg" style={{ maxWidth: 150 }}>
              {[1, 2, 3].map((L) => (
                <button key={L} data-on={st.levels[p.id] === L ? "1" : "0"} onClick={() => d({ type: "setLevel", pid: p.id, level: L })}>
                  {t("level", { n: L })}
                </button>
              ))}
            </div>} />
        ))}
      </div>

      <div className="qa-card">
        <div className="qa-sec" style={{ marginTop: 0 }}>{t("settingsRules")}</div>
        <Row title={t("maxDays")} right={<span className="qa-row" style={{ gap: 6 }}>
          <Btn sm onClick={() => d({ type: "setting", key: "maxConsecutive", value: Math.max(2, st.settings.maxConsecutive - 1) })}><Minus size={13} /></Btn>
          <span className="qa-hrs" style={{ minWidth: 16, textAlign: "center" }}>{st.settings.maxConsecutive}</span>
          <Btn sm onClick={() => d({ type: "setting", key: "maxConsecutive", value: Math.min(7, st.settings.maxConsecutive + 1) })}><Plus size={13} /></Btn>
        </span>} />
        <Row title={t("fairOpen")} right={<Switch on={st.settings.fairOpen} onChange={() => d({ type: "setting", key: "fairOpen", value: !st.settings.fairOpen })} />} />
        <Row title={t("fairClose")} right={<Switch on={st.settings.fairClose} onChange={() => d({ type: "setting", key: "fairClose", value: !st.settings.fairClose })} />} />
        <Row title={t("iWork")} right={<Switch on={st.settings.adminWorks} onChange={() => d({ type: "setting", key: "adminWorks", value: !st.settings.adminWorks })} />} />
      </div>

      <div className="qa-card">
        <div className="qa-sec" style={{ marginTop: 0 }}>{t("settingsApprovals")}</div>
        <Row title={t("approvalClaims")} right={<Switch on={st.settings.approvalClaims} onChange={() => d({ type: "setting", key: "approvalClaims", value: !st.settings.approvalClaims })} />} />
        <Row title={t("approvalTrades")} right={<Switch on={st.settings.approvalTrades} onChange={() => d({ type: "setting", key: "approvalTrades", value: !st.settings.approvalTrades })} />} />
      </div>

      <div className="qa-card">
        <div className="qa-sec" style={{ marginTop: 0 }}>{t("settingsPublish")}</div>
        <Row title={t("chkUnderstaffed")} right={seg("understaffed")} />
        <Row title={t("chkNoL3")} right={seg("noL3")} />
        <Row title={t("chkUnavailable")} right={seg("unavailable")} />
      </div>

      <div style={{ marginTop: 14 }}>
        <Btn wide onClick={() => d({ type: "reset" })}><RefreshCw size={14} />{t("reset")}</Btn>
      </div>
      <div className="qa-note" style={{ marginTop: 10 }}><ShieldAlert size={12} /> {t("demoNote")}</div>
    </div>
  );
}

/* ---------------- authentication ---------------- */
function Field({ label, error, ...p }) {
  return (
    <div>
      <label className="qa-lbl">{label}</label>
      <input className="qa-in" data-bad={error ? "1" : undefined} {...p} />
      {error && <div className="qa-err">{error}</div>}
    </div>
  );
}
function AuthScreens() {
  const { st, d, t } = useApp();
  const scr = st.session.screen;
  const [f, setF] = useState({ email: "", password: "", confirm: "", firstName: "", lastName: "" });
  const [err, setErr] = useState({});
  const set = (k) => (e) => { setF({ ...f, [k]: e.target.value }); setErr({ ...err, [k]: null }); };
  const pendingEmail = st.session.pending ? emailOf(byId(st.session.pending)) : f.email;

  const validateSignUp = () => {
    const e = {};
    if (!f.firstName.trim()) e.firstName = t("errRequired");
    if (!f.lastName.trim()) e.lastName = t("errRequired");
    if (!f.email.trim()) e.email = t("errRequired");
    else if (!isEmail(f.email.trim())) e.email = t("errEmail");
    else if (ACCOUNTS.some((p) => emailOf(p).toLowerCase() === f.email.trim().toLowerCase())) e.email = t("errTaken");
    if (f.password.length < 8) e.password = t("errShortPw");
    else if (WEAK.includes(f.password.toLowerCase())) e.password = t("errWeakPw");
    if (f.confirm !== f.password) e.confirm = t("errMatch");
    setErr(e);
    return !Object.keys(e).length;
  };

  const card = (title, sub, body) => (
    <div className="qa-auth">
      <div className="qa-authcard">
        <div className="qa-authhead">
          <div className="qa-brand" style={{ fontSize: 30 }}>{t("appName")}</div>
          <h1 className="qa-h" style={{ fontSize: 20, marginTop: 12 }}>{title}</h1>
          {sub && <div className="qa-meta" style={{ marginTop: 4 }}>{sub}</div>}
        </div>
        {body}
      </div>
      <div className="qa-row" style={{ gap: 6, marginTop: 14 }}>
        <button className="qa-ib" onClick={() => d({ type: "lang" })} aria-label={t("language")}><Languages size={16} /></button>
        <button className="qa-ib" onClick={() => d({ type: "theme" })} aria-label={t("theme")}>{st.theme === "light" ? <Moon size={16} /> : <Sun size={16} />}</button>
      </div>
    </div>
  );

  if (scr === "signup") return card(t("signUp"), null, (
    <>
      <div className="qa-grid2" style={{ gap: 8 }}>
        <Field label={t("firstNameL")} value={f.firstName} onChange={set("firstName")} error={err.firstName} autoComplete="given-name" />
        <Field label={t("lastNameL")} value={f.lastName} onChange={set("lastName")} error={err.lastName} autoComplete="family-name" />
      </div>
      <Field label={t("emailL")} type="email" value={f.email} onChange={set("email")} error={err.email} autoComplete="email" />
      <Field label={t("passwordL")} type="password" value={f.password} onChange={set("password")} error={err.password} autoComplete="new-password" />
      <div className="qa-meta" style={{ marginTop: 4, fontSize: 11.5 }}>{t("pwHint")}</div>
      <Field label={t("confirmL")} type="password" value={f.confirm} onChange={set("confirm")} error={err.confirm} autoComplete="new-password" />
      <div style={{ marginTop: 16 }}>
        <Btn v="primary" wide onClick={() => { if (validateSignUp()) d({ type: "signUp", ...f }); }}>{t("signUp")}</Btn>
      </div>
      <div style={{ textAlign: "center", marginTop: 12 }}>
        <span className="qa-meta">{t("haveAccount")} </span>
        <button className="qa-link" onClick={() => d({ type: "authScreen", screen: "signin" })}>{t("signIn")}</button>
      </div>
    </>
  ));

  if (scr === "verifySent") return card(t("verifyTitle"), t("verifyBody", { email: pendingEmail }), (
    <Btn v="primary" wide onClick={() => d({ type: "verifyEmail" })}><Send size={14} />{t("openLink")}</Btn>
  ));

  if (scr === "verified") return card(t("verifiedTitle"), t("verifiedBody"), (
    <Btn v="primary" wide onClick={() => d({ type: "afterVerify" })}><Check size={14} />{t("continueBtn")}</Btn>
  ));

  if (scr === "forgot") return card(t("forgotTitle"), t("forgotBody"), (
    <>
      <Field label={t("emailL")} type="email" value={f.email} onChange={set("email")} error={err.email} autoComplete="email" />
      <div style={{ marginTop: 16 }}>
        <Btn v="primary" wide onClick={() => {
          if (!isEmail(f.email.trim())) return setErr({ email: t("errEmail") });
          d({ type: "resetSent" });
        }}>{t("sendResetLink")}</Btn>
      </div>
      <div style={{ textAlign: "center", marginTop: 12 }}>
        <button className="qa-link" onClick={() => d({ type: "authScreen", screen: "signin" })}>{t("backToSignIn")}</button>
      </div>
    </>
  ));

  if (scr === "resetSent") return card(t("resetSentTitle"), t("resetSentBody", { email: f.email || "…" }), (
    <Btn v="primary" wide onClick={() => d({ type: "authScreen", screen: "reset" })}><Send size={14} />{t("openLink")}</Btn>
  ));

  if (scr === "reset") return card(t("forgotTitle"), null, (
    <>
      <Field label={t("newPasswordL")} type="password" value={f.password} onChange={set("password")} error={err.password} autoComplete="new-password" />
      <div className="qa-meta" style={{ marginTop: 4, fontSize: 11.5 }}>{t("pwHint")}</div>
      <Field label={t("confirmL")} type="password" value={f.confirm} onChange={set("confirm")} error={err.confirm} autoComplete="new-password" />
      <div style={{ marginTop: 16 }}>
        <Btn v="primary" wide onClick={() => {
          const e = {};
          if (f.password.length < 8) e.password = t("errShortPw");
          else if (WEAK.includes(f.password.toLowerCase())) e.password = t("errWeakPw");
          if (f.confirm !== f.password) e.confirm = t("errMatch");
          setErr(e);
          if (!Object.keys(e).length) d({ type: "resetDone" });
        }}>{t("saveNewPassword")}</Btn>
      </div>
    </>
  ));

  const demos = [byId(ADMIN_ID), byId("p12"), PLATFORM];
  return card(t("signIn"), t("workplace"), (
    <>
      <Field label={t("emailL")} type="email" value={f.email} onChange={set("email")} autoComplete="username" />
      <Field label={t("passwordL")} type="password" value={f.password} onChange={set("password")} autoComplete="current-password" />
      {st.session.error && <div className="qa-err" style={{ marginTop: 8 }}>{t(st.session.error)}</div>}
      <div style={{ textAlign: "right" }}>
        <button className="qa-link" onClick={() => d({ type: "authScreen", screen: "forgot" })}>{t("forgot")}</button>
      </div>
      <div style={{ marginTop: 10 }}>
        <Btn v="primary" wide onClick={() => d({ type: "signIn", email: f.email, password: f.password })}>{t("signIn")}</Btn>
      </div>
      <div style={{ textAlign: "center", marginTop: 12 }}>
        <span className="qa-meta">{t("noAccount")} </span>
        <button className="qa-link" onClick={() => d({ type: "authScreen", screen: "signup" })}>{t("signUp")}</button>
      </div>
      <div className="qa-sec">{t("demoAccounts")}</div>
      {demos.map((p) => (
        <button key={p.id} className="qa-btn qa-wide" data-sm="1" style={{ justifyContent: "space-between", marginBottom: 6 }}
          onClick={() => setF({ ...f, email: emailOf(p), password: "presotea2026" })}>
          <span>{p.name}</span>
          <span className="qa-meta">{p.isPlatform ? "platform" : p.id === ADMIN_ID ? t("admin") : t("employee")}</span>
        </button>
      ))}
    </>
  ));
}

/* ---------------- workplace list ---------------- */
function WorkplaceList() {
  const { st, d, t } = useApp();
  const me = st.session.user;
  const platform = me === PLATFORM.id;
  const [code, setCode] = useState("");
  const [wizard, setWizard] = useState(false);
  const mine = st.workplaces.filter((w) => (w.seeded ? !platform && isMember(me) : w.createdBy === me));
  if (wizard) return <CreateWizard onDone={() => setWizard(false)} />;
  return (
    <div className="qa-wrap" style={{ maxWidth: 560, paddingTop: 24 }}>
      <div className="qa-row" style={{ marginBottom: 4 }}>
        <div style={{ flex: 1 }}>
          <div className="qa-brand" style={{ fontSize: 26 }}>{t("appName")}</div>
          <div className="qa-meta">{byId(me) ? byId(me).name : ""}</div>
        </div>
        <button className="qa-ib" onClick={() => d({ type: "lang" })} aria-label={t("language")}><Languages size={16} /></button>
        <button className="qa-ib" onClick={() => d({ type: "theme" })} aria-label={t("theme")}>{st.theme === "light" ? <Moon size={16} /> : <Sun size={16} />}</button>
        <button className="qa-ib" onClick={() => d({ type: "signOut" })} aria-label={t("signOut")} title={t("signOut")}><Undo2 size={16} /></button>
      </div>
      <h1 className="qa-h">{t("myWorkplaces")}</h1>
      <div className="qa-sub">{platform ? t("platformNote") : ""}</div>

      {mine.map((w) => (
        <button key={w.id} className="qa-wp" onClick={() => d({ type: "openWorkplace", id: w.id })}>
          <span className="qa-wpav">{w.name.slice(0, 1)}</span>
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ display: "block", fontSize: 15 }}>{w.name}</span>
            <span className="qa-meta">{w.seeded ? t("membersN", { n: ROSTER.length }) : t("membersN", { n: 1 })} · {w.address}</span>
          </span>
          <ChevronRight size={17} style={{ color: "var(--muted)" }} />
        </button>
      ))}

      {platform && (
        <Btn v="primary" wide onClick={() => setWizard(true)}><Plus size={15} />{t("createWorkplaceBtn")}</Btn>
      )}

      {!platform && (
        <div className="qa-card" style={{ marginTop: mine.length ? 14 : 0 }}>
          <div className="qa-sec" style={{ marginTop: 0 }}>{t("joinTitle")}</div>
          {!mine.length && <div className="qa-note" style={{ marginBottom: 10 }}>{t("noMembershipBody")}</div>}
          <Field label={t("joinCodeL")} value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="PRESTEA24X" />
          {st.session.error === "errCode" && <div className="qa-err" style={{ marginTop: 6 }}>{t("errCode")}</div>}
          <div style={{ marginTop: 12 }}>
            <Btn v="primary" wide disabled={code.replace(/[^A-Z0-9]/g, "").length < 10} onClick={() => d({ type: "joinWorkplace", code })}>{t("join")}</Btn>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------------- template builder (wizard step 2/3 and settings) ---------------- */
function TemplateBuilder({ blocks, onChange, showSetup }) {
  const { t, lang } = useApp();
  const [nb, setNb] = useState({ start: "10:00", end: "16:00", days: [...ALL_DAYS] });
  const toggleDay = (i) => setNb({ ...nb, days: nb.days.includes(i) ? nb.days.filter((x) => x !== i) : [...nb.days, i].sort() });
  const valid = mins(nb.end) > mins(nb.start) && nb.days.length > 0;
  const patch = (i, p) => onChange(blocks.map((b, n) => (n === i ? { ...b, ...p } : b)));
  return (
    <>
      {!showSetup && (
        <div className="qa-card" style={{ marginBottom: 12 }}>
          <div className="qa-grid2" style={{ gap: 8 }}>
            <Field label={t("startL")} type="time" step="900" value={nb.start} onChange={(e) => setNb({ ...nb, start: snap15(e.target.value || "10:00") })} />
            <Field label={t("endL")} type="time" step="900" value={nb.end} onChange={(e) => setNb({ ...nb, end: snap15(e.target.value || "16:00") })} />
          </div>
          <label className="qa-lbl">{t("repeatOn")}</label>
          <div className="qa-daypick">
            {ALL_DAYS.map((i) => (
              <button key={i} className="qa-daybtn" data-on={nb.days.includes(i) ? "1" : "0"} onClick={() => toggleDay(i)}>{DOW_LABEL(i, lang)}</button>
            ))}
          </div>
          {!valid && <div className="qa-err">{t("overnightNo")}</div>}
          <div style={{ marginTop: 12 }}>
            <Btn wide disabled={!valid} onClick={() => {
              onChange([...blocks, { kind: "b" + uid(), start: nb.start, end: nb.end, headcount: 2, requiredLevel: 3, days: [...nb.days] }]);
            }}><Plus size={14} />{t("addBlock")}</Btn>
          </div>
        </div>
      )}
      <div className="qa-card">
        <div className="qa-sec" style={{ marginTop: 0 }}>
          {t("blocksN", { n: blocks.reduce((n, b) => n + b.days.length, 0) })}
        </div>
        {!blocks.length && <div className="qa-note">{t("noBlocks")}</div>}
        {blocks.map((b, i) => (
          <div key={b.kind} style={{ padding: "10px 0", borderBottom: "1px solid var(--line)" }}>
            <div className="qa-row">
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 15 }}>{b.start}–{b.end} <span className="qa-meta">· {blockHours(b)} {t("hours")}</span></div>
                <div className="qa-meta">{b.days.length === 7 ? t("everyDay") : b.days.map((x) => DOW_LABEL(x, lang)).join(", ")}</div>
              </div>
              {!showSetup && <Btn sm v="danger" onClick={() => onChange(blocks.filter((_, n) => n !== i))}><Trash2 size={13} /></Btn>}
            </div>
            {showSetup && (
              <>
                <div className="qa-row" style={{ marginTop: 8 }}>
                  <span className="qa-nm qa-meta">{t("headcount")}</span>
                  <Btn sm onClick={() => patch(i, { headcount: Math.max(1, b.headcount - 1) })}><Minus size={13} /></Btn>
                  <span className="qa-hrs" style={{ minWidth: 16, textAlign: "center" }}>{b.headcount}</span>
                  <Btn sm onClick={() => patch(i, { headcount: Math.min(6, b.headcount + 1) })}><Plus size={13} /></Btn>
                </div>
                <div className="qa-row" style={{ marginTop: 8 }}>
                  <span className="qa-nm qa-meta">{t("requiredLevelL")}</span>
                  <div className="qa-seg" style={{ maxWidth: 200 }}>
                    {[0, 1, 2, 3].map((L) => (
                      <button key={L} data-on={b.requiredLevel === L ? "1" : "0"} onClick={() => patch(i, { requiredLevel: L })}>
                        {L === 0 ? t("noneL") : t("level", { n: L })}
                      </button>
                    ))}
                  </div>
                </div>
                <label className="qa-lbl">{t("daysL")}</label>
                <div className="qa-daypick">
                  {ALL_DAYS.map((x) => (
                    <button key={x} className="qa-daybtn" data-on={b.days.includes(x) ? "1" : "0"}
                      onClick={() => patch(i, { days: b.days.includes(x) ? b.days.filter((y) => y !== x) : [...b.days, x].sort() })}>
                      {DOW_LABEL(x, lang)}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    </>
  );
}

/* ---------------- create workplace wizard ---------------- */
function CreateWizard({ onDone }) {
  const { st, d, t } = useApp();
  const [step, setStep] = useState(1);
  const [info, setInfo] = useState({ name: "", address: "" });
  const [blocks, setBlocks] = useState([]);
  const [err, setErr] = useState({});
  const created = st.lastCreated ? st.workplaces.find((w) => w.id === st.lastCreated) : null;

  if (created) return (
    <div className="qa-wrap" style={{ maxWidth: 520, paddingTop: 24 }}>
      <h1 className="qa-h">{t("wpCreatedTitle", { name: created.name })}</h1>
      <div className="qa-sub">{t("wpCreatedBody")}</div>
      <div className="qa-code">{created.code}</div>
      <div style={{ marginTop: 16 }}>
        <Btn v="primary" wide onClick={() => { d({ type: "closeWorkplace" }); onDone(); }}>{t("backToList")}</Btn>
      </div>
    </div>
  );

  return (
    <div className="qa-wrap" style={{ maxWidth: 520, paddingTop: 24 }}>
      <div className="qa-prog">{[1, 2, 3].map((n) => <i key={n} data-on={step >= n ? "1" : "0"} />)}</div>
      <h1 className="qa-h">{t(step === 1 ? "step1" : step === 2 ? "step2" : "step3")}</h1>
      <div className="qa-sub">{t("stepOf", { a: step, b: 3 })}</div>

      {step === 1 && (
        <div className="qa-card">
          <Field label={t("wpNameL")} value={info.name} onChange={(e) => { setInfo({ ...info, name: e.target.value }); setErr({}); }} error={err.name} placeholder="Presotea Vieux-Port" />
          <Field label={t("wpAddressL")} value={info.address} onChange={(e) => { setInfo({ ...info, address: e.target.value }); setErr({}); }} error={err.address} />
        </div>
      )}
      {step === 2 && <TemplateBuilder blocks={blocks} onChange={setBlocks} />}
      {step === 3 && (
        <>
          <div className="qa-note" style={{ marginBottom: 12 }}>{t("setupTitle")}</div>
          <TemplateBuilder blocks={blocks} onChange={setBlocks} showSetup />
        </>
      )}

      <div className="qa-row" style={{ marginTop: 16, gap: 8 }}>
        <Btn wide onClick={() => (step === 1 ? onDone() : setStep(step - 1))}>{t("back")}</Btn>
        {step < 3 ? (
          <Btn wide v="primary" onClick={() => {
            if (step === 1) {
              const e = {};
              if (!info.name.trim()) e.name = t("errRequired");
              if (!info.address.trim()) e.address = t("errRequired");
              setErr(e);
              if (Object.keys(e).length) return;
            }
            if (step === 2 && !blocks.length) return;
            setStep(step + 1);
          }}>{t("next")}</Btn>
        ) : (
          <Btn wide v="primary" disabled={!blocks.length} onClick={() => d({ type: "createWorkplace", name: info.name, address: info.address, template: blocks })}>{t("createBtn")}</Btn>
        )}
      </div>
    </div>
  );
}

/* ---------------- a workplace nobody has joined yet ---------------- */
function EmptyWorkplace() {
  const { st, d, t, lang } = useApp();
  const w = st.workplaces.find((x) => x.id === st.activeId);
  if (!w) return null;
  return (
    <div className="qa-wrap" style={{ maxWidth: 520, paddingTop: 24 }}>
      <div className="qa-row" style={{ marginBottom: 8 }}>
        <div style={{ flex: 1 }}>
          <div className="qa-brand" style={{ fontSize: 22 }}>{w.name}</div>
          <div className="qa-meta">{w.address}</div>
        </div>
        <button className="qa-ib" onClick={() => d({ type: "closeWorkplace" })} aria-label={t("backToList")}><Undo2 size={16} /></button>
      </div>
      <h1 className="qa-h">{t("emptyWpTitle")}</h1>
      <div className="qa-sub">{t("emptyWpBody")}</div>
      <div className="qa-code">{w.code}</div>
      <div style={{ height: 14 }} />
      <div className="qa-card">
        <div className="qa-sec" style={{ marginTop: 0 }}>{t("templateTitle")}</div>
        {(w.template || []).map((b) => (
          <Row key={b.kind}
            title={`${b.start}–${b.end}`}
            meta={`${blockHours(b)} ${t("hours")} · ${b.days.length === 7 ? t("everyDay") : b.days.map((x) => DOW_LABEL(x, lang)).join(", ")} · ${t("headcount")}: ${b.headcount}${b.requiredLevel ? " · " + t("requiredLevelL") + " " + t("level", { n: b.requiredLevel }) : ""}`} />
        ))}
      </div>
      <div style={{ marginTop: 16 }}>
        <Btn wide onClick={() => d({ type: "closeWorkplace" })}>{t("backToList")}</Btn>
      </div>
    </div>
  );
}

/* ---------------- app shell ---------------- */
// Phones get five tabs at most. Settings lives behind the gear in the top bar,
// and appears in the sidebar on wider screens.
const TABS_ADMIN = [
  { id: "home", icon: Home, label: "navHome" },
  { id: "schedule", icon: CalendarDays, label: "navSchedule" },
  { id: "avail", icon: CalendarCheck, label: "navAvail" },
  { id: "requests", icon: Inbox, label: "navRequests" },
  { id: "news", icon: Megaphone, label: "navNews" },
];
const SIDE_ADMIN = [...TABS_ADMIN, { id: "settings", icon: SettingsIcon, label: "navSettings" }];
const TABS_EMP = [
  { id: "home", icon: Home, label: "navHome" },
  { id: "schedule", icon: CalendarDays, label: "navSchedule" },
  { id: "avail", icon: CalendarCheck, label: "navAvail" },
  { id: "shifts", icon: Users, label: "navShifts" },
  { id: "news", icon: Megaphone, label: "navNews" },
];

export default function App() {
  const [st, d] = useReducer(reducer, undefined, () => makeInit(2));
  const [notifOpen, setNotifOpen] = useState(false);
  const t = useMemo(() => (k, p) => fill((STR[st.lang] && STR[st.lang][k]) || k, p), [st.lang]);
  const evalResult = useMemo(
    () => (st.draft ? evaluate(st.shifts, st.draft, st.avail, st.settings, st.weeks, st.levels) : { score: 0, issues: [] }),
    [st.draft, st.shifts, st.avail, st.settings, st.weeks, st.levels]
  );
  useEffect(() => { if (!st.toast) return; const id = setTimeout(() => d({ type: "toast", toast: null }), 2600); return () => clearTimeout(id); }, [st.toast]);

  const isAdmin = st.viewAs === ADMIN_ID;
  const tabs = isAdmin ? TABS_ADMIN : TABS_EMP;
  const myNotifs = st.notifs.filter((n) => n.to === st.viewAs);
  const unread = myNotifs.filter((n) => !n.read).length;

  const screen = () => {
    if (st.tab === "home") return isAdmin ? <HomeAdmin /> : <HomeEmployee />;
    if (st.tab === "schedule") return isAdmin ? <AdminSchedule /> : <EmployeeSchedule />;
    if (st.tab === "avail") return <AvailabilityScreen />;
    if (st.tab === "requests" && isAdmin) return <Requests />;
    if (st.tab === "shifts" && !isAdmin) return <OpenShifts />;
    if (st.tab === "settings" && isAdmin) return <SettingsScreen />;
    if (st.tab === "news") return <AnnouncementsScreen />;
    return isAdmin ? <HomeAdmin /> : <HomeEmployee />;
  };

  const badge = (tab) => {
    if (isAdmin && tab === "requests") return st.claims.filter((c) => c.status === "pending").length + st.trades.filter((x) => x.status === "awaiting_admin").length;
    if (!isAdmin && tab === "shifts") return st.trades.filter((x) => x.bId === st.viewAs && x.status === "awaiting_coworker").length;
    if (!isAdmin && tab === "home") return st.trades.filter((x) => x.bId === st.viewAs && x.status === "awaiting_coworker").length;
    return 0;
  };
  const notifText = (n) => {
    const p = { ...(n.params || {}) };
    if (p.d) p.d = fmtDay(p.d, st.lang);
    if (p.k) p.k = t(p.k === "open" ? "open" : "close").toLowerCase();
    return t(n.key, p);
  };

  return (
    <Ctx.Provider value={{ st, d, t, lang: st.lang, evalResult }}>
      <div className="qa-root" data-theme={st.theme}>
        <style>{CSS}</style>
        {!st.session.user ? <AuthScreens /> : !st.activeId ? <WorkplaceList /> : st.activeId !== "w1" ? <EmptyWorkplace /> : <>
        <div className="qa-top">
          <div className="qa-topin">
            <div>
              <div className="qa-brand">{t("appName")}</div>
              <div className="qa-brandsub">{t("workplace")}</div>
            </div>
            <div className="qa-spacer" />
            <select className="qa-sel" value={st.viewAs} onChange={(e) => d({ type: "viewAs", id: e.target.value })} aria-label={t("viewAs")}>
              {ROSTER.map((p) => <option key={p.id} value={p.id}>{p.name}{p.isAdmin ? ` · ${t("admin")}` : ` · ${t("level", { n: st.levels[p.id] })}`}</option>)}
            </select>
            <button className="qa-ib" onClick={() => { setNotifOpen(true); d({ type: "readNotifs" }); }} aria-label={t("notifications")}>
              <Bell size={17} />{unread > 0 && <span className="qa-dot" />}
            </button>
            <button className="qa-ib" onClick={() => d({ type: "lang" })} aria-label={t("language")} title={t("language")}><Languages size={17} /></button>
            <button className="qa-ib" onClick={() => d({ type: "theme" })} aria-label={t("theme")}>{st.theme === "light" ? <Moon size={17} /> : <Sun size={17} />}</button>
            {isAdmin && <button className="qa-ib" onClick={() => d({ type: "tab", tab: "settings" })} aria-label={t("navSettings")} title={t("navSettings")} style={{ color: st.tab === "settings" ? "var(--jade)" : undefined }}><SettingsIcon size={17} /></button>}
            <button className="qa-ib" onClick={() => d({ type: "closeWorkplace" })} aria-label={t("backToList")} title={t("backToList")}><Undo2 size={17} /></button>
            <button className="qa-ib" onClick={() => d({ type: "signOut" })} aria-label={t("signOut")} title={t("signOut")}><ShieldAlert size={17} /></button>
          </div>
        </div>

        <div className="qa-shell">
          <nav className="qa-side">
            {(isAdmin ? SIDE_ADMIN : tabs).map((tb) => (
              <button key={tb.id} className="qa-sidebtn" data-on={st.tab === tb.id ? "1" : "0"} onClick={() => d({ type: "tab", tab: tb.id })}>
                <tb.icon size={17} />{t(tb.label)}
              </button>
            ))}
          </nav>
          <main className="qa-main"><div className="qa-wrap">{screen()}</div></main>
        </div>

        <nav className="qa-tabs">
          {tabs.map((tb) => (
            <button key={tb.id} className="qa-tab" data-on={st.tab === tb.id ? "1" : "0"} onClick={() => d({ type: "tab", tab: tb.id })}>
              <span style={{ position: "relative", display: "grid" }}>
                <tb.icon size={19} />
                {badge(tb.id) > 0 && <span className="qa-dot" style={{ top: -3, right: -5 }} />}
              </span>
              <span>{t(tb.label)}</span>
            </button>
          ))}
        </nav>

        <Sheet open={notifOpen} onClose={() => setNotifOpen(false)} title={t("notifications")}>
          {myNotifs.length === 0 && <div className="qa-note">{t("noNotifs")}</div>}
          <div className="qa-list">
            {myNotifs.slice(0, 12).map((n) => (
              <div key={n.id} style={{ padding: "9px 0", borderBottom: "1px solid var(--line)" }}>
                <div style={{ fontSize: 14 }}>{notifText(n)}</div>
                <div className="qa-meta">{new Intl.DateTimeFormat(loc(st.lang), { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }).format(new Date(n.ts))}</div>
              </div>
            ))}
          </div>
        </Sheet>
        </>}

        {st.toast && <div className="qa-toast">{t(st.toast.k, st.toast.p)}</div>}
      </div>
    </Ctx.Provider>
  );
}
