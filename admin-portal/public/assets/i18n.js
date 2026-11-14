/* Baza-RMB staff portal: English / French / Kinyarwanda.
 * The portal is written in English. In French or Kinyarwanda, every label the portal draws is replaced by its
 * translation as it appears on the page (text, placeholders, titles). Content written by people (visitors'
 * messages, case details, staff notes, document titles) is never translated: mark such elements data-notr.
 * Kinyarwanda texts: to be proofread by an RMB native speaker. Unknown texts stay in English (see I18N.missing). */
(() => {
  "use strict";
  const KEY = "baza.portal.lang";
  let lang = "en";
  try { lang = localStorage.getItem(KEY) || "en"; } catch (e) { /* storage blocked */ }
  if (!["en", "fr", "rw"].includes(lang)) lang = "en";

  // "English": ["Français", "Kinyarwanda"]
  const D = {
    // ---- navigation, top bar, common
    "Dashboard": ["Tableau de bord", "Ahabanza"],
    "Conversations": ["Conversations", "Ibiganiro"],
    "Cases": ["Dossiers", "Ibirego n'ubusabe"],
    "Knowledge gaps": ["Lacunes de connaissances", "Ibibazo bitasubijwe"],
    "Knowledge Gaps": ["Lacunes de connaissances", "Ibibazo bitasubijwe"],
    "FAQ answers": ["Réponses FAQ", "Ibisubizo bya FAQ"],
    "FAQ Answers": ["Réponses FAQ", "Ibisubizo bya FAQ"],
    "AI Knowledge": ["Connaissances de l'IA", "Ubumenyi bwa AI"],
    "Analytics": ["Analyses", "Isesengura"],
    "Users & Roles": ["Utilisateurs et rôles", "Abakoresha n'inshingano"],
    "Settings": ["Paramètres", "Igenamiterere"],
    "Audit log": ["Journal d'audit", "Igitabo cy'ibikorwa"],
    "Mining Licenses": ["Permis miniers", "Impushya z'ubucukuzi"],
    "Investment": ["Investissement", "Ishoramari"],
    "Complaints": ["Plaintes", "Ibirego"],
    "Other Inquiries": ["Autres demandes", "Ibindi bibazo"],
    "Search conversations, staff, topics or knowledge...": ["Rechercher conversations, personnel, sujets ou connaissances…", "Shakisha ibiganiro, abakozi, ingingo cyangwa ubumenyi..."],
    "Search": ["Rechercher", "Shakisha"],
    "Notifications": ["Notifications", "Imenyesha"],
    "Sign out": ["Se déconnecter", "Sohoka"],
    "Sign out?": ["Se déconnecter ?", "Gusohoka?"],
    "Are you sure you want to sign out of the staff portal?": ["Voulez-vous vraiment vous déconnecter du portail du personnel ?", "Uzi neza ko ushaka gusohoka mu rubuga rw'abakozi?"],
    "Language": ["Langue", "Ururimi"],
    "My account: password and two-factor sign-in": ["Mon compte : mot de passe et connexion à deux facteurs", "Konti yanjye: ijambobanga no kwinjira mu ntambwe ebyiri"],
    "Mark all as read": ["Tout marquer comme lu", "Byose byasomwe"],
    "No new notifications": ["Aucune nouvelle notification", "Nta menyesha rishya"],
    "All cases": ["Tous les dossiers", "Ibirego byose"],
    "Unanswered question": ["Question sans réponse", "Ikibazo kitasubijwe"],
    "New urgent case: {s}": ["Nouveau dossier urgent : {s}", "Ikirego cyihutirwa gishya: {s}"],
    "{n} new item(s): see the bell": ["{n} nouvel(s) élément(s) : voir la cloche", "Ibintu bishya {n}: reba ku nzogera"],
    "Cancel": ["Annuler", "Hagarika"],
    "Confirm": ["Confirmer", "Emeza"],
    "Please confirm": ["Veuillez confirmer", "Emeza"],
    "Close": ["Fermer", "Funga"],
    "Save": ["Enregistrer", "Bika"],
    "Save changes": ["Enregistrer les modifications", "Bika impinduka"],
    "Export": ["Exporter", "Kuramo"],
    "Refresh": ["Actualiser", "Vugurura"],
    "Open": ["Ouvrir", "Fungura"],
    "View": ["Voir", "Reba"],
    "View all": ["Tout voir", "Reba byose"],
    "Edit": ["Modifier", "Hindura"],
    "Done": ["Terminé", "Byarangiye"],
    "Copy": ["Copier", "Koporora"],
    "Copied": ["Copié", "Byakoporowe"],
    "All": ["Tous", "Byose"],
    "None": ["Aucun", "Nta na kimwe"],
    "Nothing here.": ["Rien ici.", "Nta kintu kirimo."],
    "No data yet": ["Pas encore de données", "Nta makuru arahaba"],
    "Nothing to export": ["Rien à exporter", "Nta cyo gukuramo"],
    "Nothing to update": ["Rien à mettre à jour", "Nta cyo guhindura"],
    "Previous": ["Précédent", "Ibibanza"],
    "Next": ["Suivant", "Ibikurikira"],
    "Showing": ["Affichage", "Herekanwa"],
    "of": ["sur", "kuri"],
    "live indexed threads": ["conversations", "ibiganiro"],
    "registered documents": ["documents enregistrés", "inyandiko zanditswe"],
    "audit entries": ["entrées du journal", "ibyanditswe"],
    "just now": ["à l'instant", "ubu nyine"],
    "{n} mins ago": ["il y a {n} min", "hashize iminota {n}"],
    "{n} hours ago": ["il y a {n} h", "hashize amasaha {n}"],
    "Yesterday": ["Hier", "Ejo hashize"],
    "Today, {t}": ["Aujourd'hui, {t}", "Uyu munsi, {t}"],
    "Yesterday, {t}": ["Hier, {t}", "Ejo hashize, {t}"],
    "Last 7 Days": ["7 derniers jours", "Iminsi 7 ishize"],
    "Last 30 Days": ["30 derniers jours", "Iminsi 30 ishize"],
    "Last 3 Months": ["3 derniers mois", "Amezi 3 ashize"],
    "Last 12 Months": ["12 derniers mois", "Amezi 12 ashize"],
    "Period": ["Période", "Igihe"],
    "Daily": ["Par jour", "Buri munsi"],
    "Weekly": ["Par semaine", "Buri cyumweru"],
    "Monthly": ["Par mois", "Buri kwezi"],
    "Jan": ["janv.", "Mut"], "Feb": ["févr.", "Gas"], "Mar": ["mars", "Wer"], "Apr": ["avr.", "Mat"], "May": ["mai", "Gic"],
    "June": ["juin", "Kam"], "Jul": ["juil.", "Nya"], "Aug": ["août", "Kan"], "Sep": ["sept.", "Nze"], "October": ["oct.", "Ukw"],
    "Nov": ["nov.", "Ugu"], "December": ["déc.", "Uku"],
    "TOTAL ASKED": ["TOTAL DES QUESTIONS", "IBIBAZO BYOSE"],

    // ---- categories
    "Investment & FDI": ["Investissement et IDE", "Ishoramari n'ishoramari ry'abanyamahanga"],
    "Mineral Trading & ICGLR": ["Commerce des minerais et CIRGL", "Ubucuruzi bw'amabuye y'agaciro na ICGLR"],
    "Mineral Trading": ["Commerce des minerais", "Ubucuruzi bw'amabuye y'agaciro"],
    "Taxes & Royalties": ["Taxes et redevances", "Imisoro n'amahoro"],
    "Environmental Compliance": ["Conformité environnementale", "Kubahiriza ibidukikije"],
    "Health & Safety": ["Santé et sécurité", "Ubuzima n'umutekano"],
    "Geological Data & GIS": ["Données géologiques et SIG", "Amakuru ya jewoloji na GIS"],
    "Petroleum & Gas": ["Pétrole et gaz", "Peteroli na gaz"],
    "Artisanal Mining": ["Exploitation artisanale", "Ubucukuzi buciriritse"],
    "Complaints & Warden Dispatch": ["Plaintes et inspections", "Ibirego n'igenzura"],
    "General & Trade Delegations": ["Général et délégations", "Rusange n'intumwa z'ubucuruzi"],
    "General": ["Général", "Rusange"],
    "Artisanal, Small & Large Scale Concessions, Exploration renewals": ["Concessions artisanales, petites et grandes, renouvellements d'exploration", "Impushya nto, iziciriritse n'inini, kongera igihe cy'ubushakashatsi"],
    "Smelting incentives, Special Economic Zones, Foreign Cap repatriation": ["Incitations à la fonderie, zones économiques spéciales, rapatriement de capitaux", "Inyungu zo gushongesha, uturere tw'ubukungu twihariye, gusubiza imari mu mahanga"],
    "3T Tagging, Chain-of-Custody, Export Permits, Conflict-Free Seals": ["Étiquetage 3T, chaîne de traçabilité, permis d'exportation, certification sans conflit", "Ibirango bya 3T, ikurikirana, impushya zo kohereza mu mahanga, ibyemezo bidafite amakimbirane"],
    "Mining royalty, export tax, declaration and payment": ["Redevance minière, taxe à l'exportation, déclaration et paiement", "Amahoro y'ubucukuzi, umusoro wo kohereza, kumenyekanisha no kwishyura"],
    "REMA Environmental Audits, Rehabilitation, Tailings": ["Audits environnementaux REMA, réhabilitation, résidus", "Igenzura rya REMA ku bidukikije, gusubiranya ubutaka, imyanda y'ubucukuzi"],
    "Underground shaft ventilation, PPE compliance, accident protocols": ["Ventilation des puits, équipements de protection, protocoles d'accident", "Guhumeka mu birombe, imyambaro yo kwirinda, ingamba ku mpanuka"],
    "Subsurface core library, aeromagnetic surveys, lithium pegmatite maps": ["Carothèque, levés aéromagnétiques, cartes des pegmatites à lithium", "Ububiko bw'ingero z'ubutaka, ubushakashatsi bwo mu kirere, amakarita ya lithium"],
    "Exploration and production licences, Lake Kivu basin": ["Permis d'exploration et de production, bassin du lac Kivu", "Impushya z'ubushakashatsi n'ubucukuzi, ikibaya cy'ikiyaga cya Kivu"],
    "Cooperatives, small-scale miners": ["Coopératives, petits exploitants", "Amakoperative, abacukuzi bato"],
    "Illegal river dredging, unpermitted concessions, child labor alerts": ["Dragage illégal, concessions sans permis, travail des enfants", "Gucukura mu migezi bitemewe, ubucukuzi butemewe, imirimo ikoreshwa abana"],
    "University research permits, press office queries, diplomatic visits": ["Permis de recherche, presse, visites diplomatiques", "Impushya z'ubushakashatsi, itangazamakuru, uruzinduko rw'abadipolomate"],

    // ---- statuses, types, labels
    "New": ["Nouveau", "Gishya"], "Assigned": ["Attribué", "Cyahawe umukozi"], "In progress": ["En cours", "Kiri gukorwaho"],
    "Waiting for user": ["En attente de l'usager", "Dutegereje umuturage"], "Resolved": ["Résolu", "Cyakemutse"], "Closed": ["Clôturé", "Cyafunzwe"],
    "Grievance": ["Plainte", "Ikirego"], "Illegal mining report": ["Signalement d'exploitation illégale", "Amakuru ku bucukuzi butemewe"],
    "Meeting request": ["Demande de rendez-vous", "Gusaba guhura"], "Geological data": ["Données géologiques", "Amakuru ya jewoloji"],
    "Licence status": ["État du permis", "Aho uruhushya rugeze"], "Legal question": ["Question juridique", "Ikibazo cy'amategeko"],
    "General enquiry": ["Demande générale", "Ikibazo rusange"],
    "urgent": ["urgent", "byihutirwa"], "high": ["élevée", "byo hejuru"], "normal": ["normale", "bisanzwe"], "low": ["faible", "byo hasi"],
    "Urgent": ["Urgent", "Byihutirwa"], "High": ["Élevée", "Byo hejuru"], "Normal": ["Normale", "Bisanzwe"], "Low": ["Faible", "Byo hasi"],
    "relevant": ["pertinent", "bifite ishingiro"], "unclear": ["peu clair", "ntibisobanutse"], "spam": ["indésirable", "spam"],
    "anonymous": ["anonyme", "utazwi"], "confidential": ["confidentiel", "ibanga"],
    "Not in the documents": ["Absent des documents", "Ntibiri mu nyandiko"], "Unsure match": ["Correspondance incertaine", "Ntibihuye neza"],
    "Technical error": ["Erreur technique", "Ikibazo cya tekiniki"],
    "Emergency": ["Urgence", "Ibyago byihutirwa"], "Report / request form": ["Formulaire de signalement / demande", "Ifishi y'ikirego / ubusabe"],
    "Passed to RMB staff": ["Transmis au personnel de RMB", "Byohererejwe abakozi ba RMB"], "Not answered": ["Sans réponse", "Ntibyasubijwe"],
    "Answered": ["Répondu", "Byasubijwe"], "Greeting only": ["Salutation seulement", "Indamukanyo gusa"], "Replied": ["Réponse donnée", "Byasubijwe"],
    "Question": ["Question", "Ikibazo"], "Greeting": ["Salutation", "Indamukanyo"], "Complaint": ["Plainte", "Ikirego"],
    "Geological data request": ["Demande de données géologiques", "Gusaba amakuru ya jewoloji"], "Case status": ["Suivi de dossier", "Aho ikirego kigeze"],
    "About the assistant": ["À propos de l'assistant", "Ibyerekeye umufasha"], "Out of scope": ["Hors sujet", "Ntibiri mu nshingano"], "Abusive": ["Injurieux", "Ibitutsi"],
    "Form shown": ["Formulaire affiché", "Ifishi yerekanywe"], "Emergency numbers shown": ["Numéros d'urgence affichés", "Nimero z'ubutabazi zerekanywe"],

    // ---- conversation tables & history
    "Recent Conversations": ["Conversations récentes", "Ibiganiro bya vuba"],
    "Incoming international inquiries and verified AI classifications": ["Demandes entrantes et classification par l'IA", "Ibibazo byinjiye n'uko AI yabishyize mu byiciro"],
    "Topic": ["Sujet", "Ingingo"], "Outcome": ["Résultat", "Uko byagenze"], "When": ["Quand", "Ryari"],
    "{n} messages": ["{n} messages", "ubutumwa {n}"],
    "No conversations in this period.": ["Aucune conversation sur cette période.", "Nta biganiro muri iki gihe."],
    "Conversation history": ["Historique de la conversation", "Amateka y'ikiganiro"],
    "Started {d}": ["Commencée le {d}", "Cyatangiye {d}"],
    "No messages": ["Aucun message", "Nta butumwa"],
    "Sources": ["Sources", "Aho byavuye"], "Details": ["Détails", "Ibisobanuro"], "Reply time": ["Temps de réponse", "Igihe cyo gusubiza"],
    "Searched for": ["Recherche", "Byashakishijwe"], "Comment": ["Commentaire", "Igitekerezo"],
    "Rated helpful": ["Jugée utile", "Byafashije"], "Rated not helpful": ["Jugée inutile", "Ntibyafashije"],

    // ---- dashboard
    "Overview of RMB chatbot activity, multilingual inference telemetry, and concession inquiry insights.": ["Vue d'ensemble de l'activité de l'assistant de RMB, en plusieurs langues, et des demandes reçues.", "Incamake y'ibikorwa by'umufasha wa RMB mu ndimi zitandukanye n'ibibazo byakiriwe."],
    "Total conversations": ["Conversations au total", "Ibiganiro byose"],
    "AI response rate": ["Taux de réponse de l'IA", "Igipimo cy'ibisubizo bya AI"],
    "Answered from official documents": ["Répondu à partir des documents officiels", "Byasubijwe hifashishijwe inyandiko z'ubuyobozi"],
    "Average latency": ["Temps de réponse moyen", "Igihe cyo gusubiza mu mpuzandengo"],
    "Conversation & Active User Trends": ["Évolution des conversations", "Uko ibiganiro bigenda bihinduka"],
    "Daily inquiry volume & engagement across the selected period": ["Volume des demandes sur la période choisie", "Umubare w'ibibazo mu gihe cyahiswemo"],
    "Total Conversations": ["Conversations au total", "Ibiganiro byose"], "Questions asked": ["Questions posées", "Ibibazo byabajijwe"],
    "Most Requested Topics": ["Sujets les plus demandés", "Ingingo zibazwa cyane"],
    "Automatic AI intent classification & semantic cluster": ["Classification automatique par l'IA", "Ibyiciro bishyirwaho na AI"],

    // ---- all conversations & category pages
    "All Conversations": ["Toutes les conversations", "Ibiganiro byose"],
    "Cross-sector registry, automated AI categorization telemetry, and live inquiry records across all mining governance domains in Rwanda.": ["Registre de toutes les conversations, classées automatiquement par l'IA, dans tous les domaines du secteur minier rwandais.", "Urutonde rw'ibiganiro byose, byashyizwe mu byiciro na AI, mu nzego zose z'ubucukuzi mu Rwanda."],
    "Total logged records": ["Enregistrements au total", "Ibyanditswe byose"], "conversations": ["conversations", "ibiganiro"],
    "Autonomous resolution": ["Résolution autonome", "Ibyakemuwe na AI"], "Triage & latency": ["Tri et délai", "Gutondeka n'igihe"],
    "Ultra-fast": ["Très rapide", "Byihuta cyane"], "Median response": ["Réponse médiane", "Igihe cyo hagati"],
    "Sector Demand & AI Classification Telemetry": ["Demande par secteur et classification par l'IA", "Ibibazo kuri buri rwego n'ibyiciro bya AI"],
    "Filter questions...": ["Filtrer les questions…", "Shungura ibibazo..."], "Filtered:": ["Filtré :", "Byashunguwe:"], "clear": ["effacer", "siba"],
    "Mining Licenses & Concessions": ["Permis et concessions minières", "Impushya n'ahantu h'ubucukuzi"],
    "Real-time AI inquiry telemetry, cadastre cross-verification, and complete applicant registry for artisanal, small-scale, and commercial exploitation licenses across Rwanda.": ["Demandes sur les permis d'exploitation artisanale, à petite échelle et commerciale au Rwanda, et réponses de l'assistant.", "Ibibazo ku mpushya z'ubucukuzi buciriritse, buto n'ubw'ubucuruzi mu Rwanda, n'uko umufasha yabisubije."],
    "Concessions in time": ["Évolution des demandes", "Uko ibibazo byagiye bihinduka"],
    "Monthly licence inquiries and how the assistant handled them.": ["Demandes mensuelles sur les permis et traitement par l'assistant.", "Ibibazo ku mpushya buri kwezi n'uko umufasha yabyitwayemo."],
    "Citizen & Investor License Requests Roster": ["Demandes de permis des citoyens et investisseurs", "Ibibazo by'abaturage n'abashoramari ku mpushya"],
    "All incoming requests categorized under Mining Licenses, with the assistant's handling and live AI status.": ["Toutes les demandes classées « Permis miniers », avec leur traitement par l'assistant.", "Ibibazo byose byo mu cyiciro cy'impushya z'ubucukuzi n'uko byakemuwe."],
    "Mining Investment & Joint Ventures": ["Investissement minier et coentreprises", "Ishoramari mu bucukuzi n'ubufatanye"],
    "Real-time telemetry on international capital commitments, mineral beneficiation incentives, RDB joint-venture agreements, and tax exemption inquiries across Rwanda's mining sector.": ["Demandes sur l'investissement, la transformation des minerais, les coentreprises et les exonérations fiscales dans le secteur minier.", "Ibibazo ku ishoramari, gutunganya amabuye y'agaciro, ubufatanye n'isonerwa ry'imisoro mu bucukuzi."],
    "Investments & funds-required inquires over years": ["Demandes d'investissement au fil des années", "Ibibazo by'ishoramari mu myaka"],
    "Inquiry intensity by month, compared year on year": ["Demandes par mois, comparées d'une année à l'autre", "Ibibazo buri kwezi, bigereranyijwe n'umwaka ushize"],
    "Investment inquires": ["Demandes d'investissement", "Ibibazo by'ishoramari"],
    "All incoming requests categorized under Investment, Petroleum & Gas and Geological data.": ["Toutes les demandes classées Investissement, Pétrole et gaz, Données géologiques.", "Ibibazo byose byo mu byiciro by'ishoramari, peteroli na gaz n'amakuru ya jewoloji."],
    "Citizen Complaints & Whistleblower Registry": ["Plaintes et signalements des citoyens", "Ibirego n'amakuru atangwa n'abaturage"],
    "Automated triage, urgency scoring, and inspector assignment for mine concession disputes, illegal extraction, and river siltation reports across Rwanda.": ["Tri automatique et niveau d'urgence des plaintes et signalements (litiges, exploitation illégale, envasement des rivières).", "Gutondeka no kugena uburemere bw'ibirego n'amakuru (amakimbirane, ubucukuzi butemewe, isenyuka ry'inkombe z'imigezi)."],
    "Complaints-related inquiry rise across the years": ["Évolution des plaintes au fil des années", "Uko ibirego byiyongereye mu myaka"],
    "Complaints inquires": ["Plaintes", "Ibirego"],
    "Complaints and illegal-mining reports submitted through the assistant, with triage and contact details when given.": ["Plaintes et signalements envoyés via l'assistant, avec tri et coordonnées si fournies.", "Ibirego n'amakuru byatanzwe binyuze ku mufasha, n'aho wabona ubitanze iyo yabitanze."],
    "Trade, taxation, environment, health & safety and general enquiries handled by the assistant.": ["Commerce, fiscalité, environnement, santé et sécurité et demandes générales traités par l'assistant.", "Ubucuruzi, imisoro, ibidukikije, ubuzima n'umutekano n'ibibazo rusange byakiriwe n'umufasha."],
    "Inquiries in time": ["Demandes dans le temps", "Ibibazo mu gihe"], "Monthly volume of other enquiries": ["Volume mensuel des autres demandes", "Umubare w'ibindi bibazo buri kwezi"],
    "Total sector requests": ["Demandes du secteur", "Ibibazo by'urwego byose"], "requested about mining.": ["demandes sur l'exploitation minière.", "ibibazo ku bucukuzi."],
    "AI first-contact resolution": ["Résolution au premier contact", "Ibyakemuwe ku nshuro ya mbere"], "Avg Response Latency": ["Délai moyen", "Igihe cyo gusubiza"],
    "High-risk inquiries": ["Demandes sensibles", "Ibibazo bikomeye"], "Flagged": ["Signalées", "Byagaragajwe"],
    "Prospective deals": ["Projets potentiels", "Imishinga ishoboka"], "Inquiries Logged": ["Demandes enregistrées", "Ibibazo byanditswe"],
    "RMB & RDB investment prospectuses": ["Prospectus d'investissement RMB et RDB", "Inyandiko z'ishoramari za RMB na RDB"],
    "Meeting & data requests": ["Rendez-vous et demandes de données", "Gusaba guhura n'amakuru"], "Investor follow-ups": ["Suivi des investisseurs", "Gukurikirana abashoramari"],
    "Total reported complaints": ["Plaintes signalées", "Ibirego byose byatanzwe"], "Inquiries": ["Demandes", "Ibibazo"],
    "Urgent escalations": ["Cas urgents", "Ibyihutirwa"], "Automated triage & officer notified": ["Tri automatique, agent informé", "Byatondetswe, umukozi yamenyeshejwe"],
    "Turnaround response": ["Délai de traitement", "Igihe cyo gukemura"], "Average time to resolution": ["Temps moyen de résolution", "Igihe gisanzwe cyo gukemura"],
    "Answered from documents": ["Répondu par les documents", "Byasubijwe n'inyandiko"], "Needs staff (knowledge gap)": ["Nécessite le personnel (lacune)", "Bikeneye abakozi"],
    "Requests": ["Demandes", "Ibibazo"], "No inquiries yet": ["Pas encore de demandes", "Nta bibazo birabaho"],
    "Inquiry Intensity by Month": ["Demandes par mois", "Ibibazo buri kwezi"],
    "Reports by type & status": ["Signalements par type et statut", "Amakuru ukurikije ubwoko n'aho ageze"],
    "Where each kind of report stands": ["Où en est chaque type de signalement", "Aho buri bwoko bw'amakuru bugeze"],
    "No reports yet": ["Pas encore de signalements", "Nta makuru aratangwa"],
    "Urgency of reports": ["Urgence des signalements", "Uburemere bw'amakuru"], "AI triage of every submitted report": ["Tri par l'IA de chaque signalement", "Uko AI yatondetse buri kirego"],
    "Personal": ["Informations", "Amakuru"], "information": ["personnelles", "bwite"], "Reference": ["Référence", "Nimero"],
    "Specific inquiry summary": ["Résumé de la demande", "Incamake y'ikibazo"], "Time & date": ["Date et heure", "Itariki n'isaha"],
    "Actions": ["Actions", "Ibikorwa"], "Session": ["Session", "Ikiganiro"], "Not provided": ["Non fourni", "Ntibyatanzwe"],
    "Anonymous": ["Anonyme", "Utazwi"], "No complaints yet": ["Pas encore de plaintes", "Nta birego biratangwa"],

    // ---- cases
    "Complaints, illegal-mining reports and requests submitted through the assistant. Triaged by AI: urgent first; likely spam is kept apart, never deleted.": ["Plaintes, signalements et demandes reçus via l'assistant. Triés par l'IA : les urgents d'abord ; les messages indésirables sont mis à part, jamais supprimés.", "Ibirego, amakuru ku bucukuzi butemewe n'ubusabe byatanzwe binyuze ku mufasha. Byatondetswe na AI: ibyihutirwa mbere; ibisa na spam bishyirwa ukwabyo, ntibisibwa."],
    "Inbox": ["Boîte de réception", "Ibyinjiye"], "Likely spam": ["Probablement indésirable", "Bishobora kuba spam"],
    "All statuses": ["Tous les statuts", "Aho bigeze hose"],
    "Confidential reports are hidden for your role.": ["Les signalements confidentiels sont masqués pour votre rôle.", "Amakuru y'ibanga ntagaragara ku nshingano zawe."],
    "Priority": ["Priorité", "Uburemere"], "Type": ["Type", "Ubwoko"], "Summary": ["Résumé", "Incamake"], "Triage": ["Tri", "Gutondeka"],
    "Status": ["Statut", "Aho bigeze"], "Received": ["Reçu", "Byakiriwe"], "No cases here.": ["Aucun dossier ici.", "Nta kirego kirimo."],
    "Routed to": ["Transmis à", "Byohererejwe"], "Expected response": ["Réponse attendue", "Igisubizo giteganyijwe"], "Assigned to": ["Attribué à", "Byahawe"],
    "Contact": ["Contact", "Aho abarizwa"], "Anonymous / not given": ["Anonyme / non fourni", "Utazwi / ntibyatanzwe"],
    "Conversation before the form": ["Conversation avant le formulaire", "Ikiganiro mbere y'ifishi"], "Update": ["Mettre à jour", "Kuvugurura"],
    "(keep)": ["(inchangé)", "(bigume uko biri)"], "Assign to": ["Attribuer à", "Ha"], "Officer name": ["Nom de l'agent", "Izina ry'umukozi"],
    "Relevance": ["Pertinence", "Ishingiro"], "Note (internal)": ["Note (interne)", "Icyitonderwa (cy'imbere)"],
    "Write an official FAQ answer": ["Rédiger une réponse FAQ officielle", "Andika igisubizo cya FAQ cyemewe"], "Audit trail": ["Historique", "Amateka y'ibikorwa"],
    "Case updated": ["Dossier mis à jour", "Ikirego cyavuguruwe"],

    // ---- knowledge gaps
    "Questions the assistant could not answer from the official documents. Answer them with an official FAQ answer, or add the missing document in AI Knowledge.": ["Questions auxquelles l'assistant n'a pas pu répondre avec les documents officiels. Répondez par une FAQ officielle ou ajoutez le document manquant dans Connaissances de l'IA.", "Ibibazo umufasha atashoboye gusubiza akoresheje inyandiko z'ubuyobozi. Bisubize wandika igisubizo cya FAQ cyemewe, cyangwa wongere inyandiko ibura mu Bumenyi bwa AI."],
    "To review": ["À traiter", "Bitegereje"], "Ignored": ["Ignorées", "Byirengagijwe"], "Category": ["Catégorie", "Icyiciro"], "Reason": ["Raison", "Impamvu"], "Note": ["Note", "Icyitonderwa"],
    "Answer": ["Répondre", "Subiza"], "Resolve": ["Résolu", "Byakemutse"], "Ignore": ["Ignorer", "Kwirengagiza"], "Reopen": ["Rouvrir", "Ongera ufungure"],
    "The answer now exists (document or FAQ added)": ["La réponse existe maintenant (document ou FAQ ajouté)", "Igisubizo cyabonetse (inyandiko cyangwa FAQ yongewemo)"],
    "Not a real question, or nothing RMB needs to add": ["Pas une vraie question, ou rien à ajouter", "Si ikibazo nyacyo, cyangwa nta cyo RMB ikeneye kongeramo"],
    "Mark as resolved": ["Marquer comme résolu", "Shyira mu byakemutse"], "Ignore this question": ["Ignorer cette question", "Kwirengagiza iki kibazo"],
    "Use this when the assistant can now answer it: you added a document or published an FAQ answer.": ["À utiliser quand l'assistant peut maintenant répondre : vous avez ajouté un document ou publié une FAQ.", "Bikoreshe iyo umufasha ashobora noneho kugisubiza: wongeyemo inyandiko cyangwa washyize ahagaragara FAQ."],
    "Use this when it is not a real question for RMB (a test, spam, or something RMB does not need to add).": ["À utiliser quand ce n'est pas une vraie question pour RMB (test, indésirable, ou rien à ajouter).", "Bikoreshe iyo atari ikibazo nyacyo kuri RMB (igerageza, spam, cyangwa ikintu RMB idakeneye kongeramo)."],
    "What was done? (optional)": ["Qu'est-ce qui a été fait ? (facultatif)", "Hakozwe iki? (si ngombwa)"], "Reason (optional)": ["Raison (facultatif)", "Impamvu (si ngombwa)"],
    "e.g. FAQ #12 published": ["ex. FAQ n° 12 publiée", "urugero: FAQ #12 yashyizwe ahagaragara"], "e.g. test message": ["ex. message de test", "urugero: ubutumwa bw'igerageza"],
    "Marked as resolved": ["Marqué comme résolu", "Byashyizwe mu byakemutse"], "Reopened": ["Rouvert", "Byongeye gufungurwa"],

    // ---- FAQ
    "Answer this question": ["Répondre à cette question", "Subiza iki kibazo"], "Write an official answer": ["Rédiger une réponse officielle", "Andika igisubizo cyemewe"],
    "Plain language. Include fees, steps and contacts only as officially confirmed.": ["Langage simple. N'indiquez frais, étapes et contacts que s'ils sont officiellement confirmés.", "Ururimi rworoshye. Andika amafaranga, intambwe n'aho babariza gusa niba byemejwe ku mugaragaro."],
    "Question (as people ask it)": ["Question (telle que posée)", "Ikibazo (uko abantu bakibaza)"], "Official answer": ["Réponse officielle", "Igisubizo cyemewe"],
    "Owner department": ["Service responsable", "Ishami ribishinzwe"], "e.g. Licensing": ["ex. Permis", "urugero: Impushya"], "Review date": ["Date de révision", "Itariki yo kuvugurura"],
    "Save draft": ["Enregistrer le brouillon", "Bika umushinga"], "Clear": ["Effacer", "Siba"],
    "Saved as a draft. Another staff member must publish it.": ["Enregistré comme brouillon. Un autre membre du personnel doit le publier.", "Bibitswe nk'umushinga. Undi mukozi agomba kubishyira ahagaragara."],
    "Awaiting approval": ["En attente d'approbation", "Bitegereje kwemezwa"], "Published": ["Publiée", "Byashyizwe ahagaragara"], "Retired": ["Retirée", "Byavanyweho"],
    "Question & answer": ["Question et réponse", "Ikibazo n'igisubizo"], "Written by": ["Rédigé par", "Byanditswe na"], "Approved by": ["Approuvé par", "Byemejwe na"],
    "Draft": ["Brouillon", "Umushinga"], "Needs another approver": ["Nécessite un autre approbateur", "Bikeneye undi ubyemeza"], "Publish": ["Publier", "Shyira ahagaragara"],
    "Retire": ["Retirer", "Kuvanaho"], "No answers here yet.": ["Pas encore de réponses ici.", "Nta bisubizo birimo."],
    "Saved as draft: another staff member must publish it.": ["Brouillon enregistré : un autre membre du personnel doit le publier.", "Byabitswe nk'umushinga: undi mukozi agomba kubishyira ahagaragara."],
    "Published: the assistant can now cite it.": ["Publiée : l'assistant peut maintenant la citer.", "Byashyizwe ahagaragara: umufasha ashobora kubikoresha."],
    "Retire this answer? The assistant will stop using it.": ["Retirer cette réponse ? L'assistant cessera de l'utiliser.", "Kuvanaho iki gisubizo? Umufasha azareka kugikoresha."],

    // ---- AI knowledge
    "AI Knowledge Base & RAG Vector Index": ["Base de connaissances de l'IA", "Ububiko bw'ubumenyi bwa AI"],
    "Central vector index for Rwanda Mines, Petroleum and Gas Board statutes, gazettes, prospectuses and staff answers. Real-time document decomposition and embedding.": ["Les lois, journaux officiels, prospectus et réponses du personnel dont l'assistant se sert pour répondre.", "Amategeko, igazeti, inyandiko z'ishoramari n'ibisubizo by'abakozi umufasha akoresha asubiza."],
    "Upload Official Document": ["Téléverser un document officiel", "Ohereza inyandiko yemewe"], "Knowledge volume": ["Volume de connaissances", "Ingano y'ubumenyi"],
    "Official gazettes & decrees": ["Journaux officiels et décrets", "Igazeti n'amateka"], "Indexed vectors": ["Passages indexés", "Ibice byashyizwe ku rutonde"],
    "Passages · EN / FR / RW": ["Passages · EN / FR / RW", "Ibice · EN / FR / RW"], "Embedding queue": ["File de traitement", "Ibitegereje gutunganywa"],
    "Tokenization active": ["Traitement en cours", "Biri gutunganywa"], "Requires review": ["À vérifier", "Bikeneye isuzuma"], "OCR / review flags": ["Signalements OCR / révision", "Ibikeneye isuzuma"],
    "Upload Official RMB Document.": ["Téléverser un document officiel de RMB.", "Ohereza inyandiko yemewe ya RMB."], "PDF (Scanned OCR & Native)": ["PDF (scanné ou natif)", "PDF (yafotowe cyangwa isanzwe)"],
    "Browse Local Files": ["Parcourir les fichiers", "Hitamo dosiye"], "Max upload footprint: 50MB/file": ["Taille maximale : 50 Mo par fichier", "Ingano ntarengwa: 50MB kuri dosiye"],
    "Selected file": ["Fichier choisi", "Dosiye yahiswemo"], "Title *": ["Titre *", "Umutwe *"], "Short title": ["Titre court", "Umutwe mugufi"],
    "Owner department *": ["Service responsable *", "Ishami ribishinzwe *"], "Version": ["Version", "Verisiyo"], "Law reference": ["Référence de la loi", "Nimero y'itegeko"],
    "Effective date": ["Date d'entrée en vigueur", "Itariki bitangira gukurikizwa"], "Upload": ["Téléverser", "Ohereza"],
    "Stays a draft (not used by the assistant) until you publish it.": ["Reste un brouillon (non utilisé par l'assistant) jusqu'à sa publication.", "Bikomeza kuba umushinga (umufasha ntabukoresha) kugeza ubishyize ahagaragara."],
    "Registered Knowledge Documents": ["Documents enregistrés", "Inyandiko zanditswe"], "Document name & code": ["Nom et code du document", "Izina na kode by'inyandiko"],
    "Format & size": ["Format et taille", "Ubwoko n'ingano"], "Uploader & date": ["Déposant et date", "Uwohereje n'itariki"], "Processing status": ["État du traitement", "Aho gutunganya bigeze"],
    "Unpublish": ["Dépublier", "Kuvana ahagaragara"], "Reindex": ["Réindexer", "Ongera utunganye"], "Web page": ["Page web", "Urubuga"], "Staff FAQ": ["FAQ du personnel", "FAQ y'abakozi"],
    "Processing": ["En traitement", "Biri gutunganywa"], "Failed": ["Échec", "Byanze"], "Draft, not used": ["Brouillon, non utilisé", "Umushinga, ntukoreshwa"],
    "Active, needs review": ["Actif, à vérifier", "Birakoreshwa, bikeneye isuzuma"], "Indexed & Active": ["Indexé et actif", "Byatunganyijwe kandi birakoreshwa"],
    "Document updated": ["Document mis à jour", "Inyandiko yavuguruwe"], "Re-indexing in the background": ["Réindexation en arrière-plan", "Biri kongera gutunganywa"],
    "Retire this document? The assistant will stop using it.": ["Retirer ce document ? L'assistant cessera de l'utiliser.", "Kuvanaho iyi nyandiko? Umufasha azareka kuyikoresha."],

    // ---- analytics
    "Intelligence & Regulatory Analytics": ["Analyses", "Isesengura"],
    "Real-time systemic oversight, investor inquiries, and algorithmic regulatory confidence.": ["Suivi de l'activité, des demandes et de la qualité des réponses.", "Gukurikirana ibikorwa, ibibazo n'ireme ry'ibisubizo."],
    "Custom": ["12 mois", "Amezi 12"],
    "Total global inquiries": ["Questions au total", "Ibibazo byose"], "User satisfaction": ["Satisfaction des usagers", "Kunyurwa kw'abakoresha"],
    "{n} ratings": ["{n} évaluations", "amanota {n}"], "{n} helpful": ["{n} utiles", "{n} byafashije"], "{n} not helpful": ["{n} inutiles", "{n} ntibyafashije"],
    "No ratings yet": ["Pas encore d'évaluations", "Nta manota aratangwa"],
    "Gazette law alignment": ["Réponses fondées sur les textes", "Ibisubizo bishingiye ku mategeko"],
    "Queries answered from official gazettes & documents": ["Questions répondues à partir des journaux officiels et documents", "Ibibazo byasubijwe hifashishijwe igazeti n'inyandiko"],
    "Conversation Volume & Intent Trajectory": ["Volume des conversations", "Umubare w'ibiganiro"], "Temporal distribution of inquiries over the selected period": ["Répartition des demandes sur la période", "Uko ibibazo byagiye biza mu gihe cyahiswemo"],
    "Questions": ["Questions", "Ibibazo"], "Service Distribution": ["Répartition par service", "Ibibazo kuri buri serivisi"],
    "Ranked proportion of inquiries across statutory RMB mandates": ["Part des demandes par domaine de RMB", "Ingano y'ibibazo kuri buri nshingano ya RMB"],
    "Most Cited Official Documents": ["Documents officiels les plus cités", "Inyandiko zikoreshwa cyane"], "Which documents the assistant's answers rely on": ["Les documents sur lesquels s'appuient les réponses", "Inyandiko ibisubizo by'umufasha bishingiyeho"],
    "Document": ["Document", "Inyandiko"], "Citations": ["Citations", "Inshuro yakoreshejwe"], "Share": ["Part", "Ijanisha"], "No citations yet": ["Pas encore de citations", "Nta nyandiko irakoreshwa"],
    "AI Performance & Retrieval Quality": ["Performance de l'IA", "Imikorere ya AI"], "Latency profile, answer quality and gazetted knowledge gap remediation": ["Délais, qualité des réponses et lacunes à combler", "Igihe, ireme ry'ibisubizo n'ibibura mu bumenyi"],
    "Query latency profile": ["Délais de réponse", "Igihe cyo gusubiza"], "Median": ["Médiane", "Hagati"], "90% of answers under": ["90 % des réponses en moins de", "90% by'ibisubizo biri munsi ya"],
    "AI tokens used": ["Jetons d'IA utilisés", "Tokens za AI zakoreshejwe"],
    "KNOWLEDGE GAPS FLAGGED FOR EDITORIAL BOARD": ["LACUNES SIGNALÉES À L'ÉQUIPE ÉDITORIALE", "IBIBAZO BITASUBIJWE BIKENEYE GUKEMURWA"],
    "Add Knowledge": ["Ajouter une connaissance", "Ongeramo ubumenyi"], "No open gaps": ["Aucune lacune ouverte", "Nta kibazo gifunguye"],

    // ---- users & account
    "Manage administrator accounts, staff access credentials, and role-based access for RMB internal personnel.": ["Gérer les comptes du personnel de RMB et leurs droits d'accès.", "Gucunga konti z'abakozi ba RMB n'uburenganzira bwabo."],
    "Add Staff Account": ["Ajouter un compte", "Ongeraho konti y'umukozi"], "Directory scope": ["Comptes", "Konti"], "Active accounts": ["Comptes actifs", "Konti zikora"],
    "Two-factor sign-in": ["Connexion à deux facteurs", "Kwinjira mu ntambwe ebyiri"], "Session integrity": ["Connexions", "Kwinjira"], "Logged In Today": ["Connectés aujourd'hui", "Binjiye uyu munsi"],
    "RMB Administrative Staff Directory": ["Annuaire du personnel de RMB", "Urutonde rw'abakozi ba RMB"],
    "Click an account to change its role, reset its password or two-factor sign-in, or deactivate it.": ["Cliquez sur un compte pour changer son rôle, réinitialiser son mot de passe ou sa connexion à deux facteurs, ou le désactiver.", "Kanda kuri konti kugira ngo uhindure inshingano, usubizeho ijambobanga cyangwa kwinjira mu ntambwe ebyiri, cyangwa uyihagarike."],
    "Staff member": ["Membre du personnel", "Umukozi"], "Email address": ["Adresse e-mail", "Imeli"], "Assigned role": ["Rôle", "Inshingano"], "Two-factor": ["Deux facteurs", "Intambwe ebyiri"],
    "Date added": ["Ajouté le", "Itariki yongeweho"], "Last login": ["Dernière connexion", "Igihe yinjiye bwa nyuma"], "you": ["vous", "wowe"], "On": ["Activée", "Birakora"], "Off": ["Désactivée", "Ntibikora"],
    "Awaiting first sign-in": ["Première connexion en attente", "Ategerejwe kwinjira bwa mbere"], "Active": ["Actif", "Arakora"], "never": ["jamais", "nta na rimwe"], "Deactivated": ["Désactivé", "Yahagaritswe"],
    "What each role can do": ["Ce que chaque rôle peut faire", "Icyo buri nshingano yemerera"], "Role": ["Rôle", "Inshingano"], "Access": ["Accès", "Uburenganzira"],
    "Super Admin": ["Super administrateur", "Umuyobozi mukuru wa sisitemu"], "Licensing Officer": ["Agent des permis", "Ushinzwe impushya"], "Complaints Officer": ["Agent des plaintes", "Ushinzwe ibirego"],
    "Analyst": ["Analyste", "Umusesenguzi"], "Support Agent": ["Agent d'assistance", "Umukozi w'ubufasha"],
    "Everything, including staff accounts, the audit log and assistant settings": ["Tout, y compris les comptes, le journal d'audit et les paramètres", "Byose, harimo konti z'abakozi, igitabo cy'ibikorwa n'igenamiterere"],
    "Documents (upload, publish, retire), FAQ answers (write and approve others'), knowledge gaps, read cases": ["Documents (téléverser, publier, retirer), FAQ (rédiger et approuver), lacunes, lecture des dossiers", "Inyandiko (kohereza, gushyira ahagaragara, kuvanaho), FAQ (kwandika no kwemeza), ibibazo bitasubijwe, gusoma ibirego"],
    "Cases including confidential reports, conversations, knowledge gaps, FAQ drafts": ["Dossiers y compris confidentiels, conversations, lacunes, brouillons FAQ", "Ibirego harimo iby'ibanga, ibiganiro, ibibazo bitasubijwe, imishinga ya FAQ"],
    "Read-only: dashboard, analytics, conversations, documents, non-confidential cases": ["Lecture seule : tableau de bord, analyses, conversations, documents, dossiers non confidentiels", "Gusoma gusa: ahabanza, isesengura, ibiganiro, inyandiko, ibirego bitari ibanga"],
    "Non-confidential cases, knowledge gaps, FAQ drafts (cannot publish)": ["Dossiers non confidentiels, lacunes, brouillons FAQ (sans publication)", "Ibirego bitari ibanga, ibibazo bitasubijwe, imishinga ya FAQ (ntashobora gushyira ahagaragara)"],
    "Add staff account": ["Ajouter un compte", "Ongeraho konti y'umukozi"], "Full name": ["Nom complet", "Amazina yose"], "Email": ["E-mail", "Imeli"],
    "Create account": ["Créer le compte", "Fungura konti"], "Security": ["Sécurité", "Umutekano"], "Password": ["Mot de passe", "Ijambobanga"],
    "On (authenticator app)": ["Activée (application d'authentification)", "Birakora (porogaramu yo kwemeza)"], "Temporary, not yet replaced": ["Temporaire, pas encore remplacé", "By'agateganyo, ntirirahindurwa"],
    "Set by the user": ["Choisi par l'utilisateur", "Ryashyizweho n'umukoresha"], "Reset password": ["Réinitialiser le mot de passe", "Subizaho ijambobanga"],
    "Reset two-factor sign-in": ["Réinitialiser la connexion à deux facteurs", "Subizaho kwinjira mu ntambwe ebyiri"], "Deactivate account": ["Désactiver le compte", "Hagarika konti"],
    "Reactivate account": ["Réactiver le compte", "Ongera ukoreshe konti"],
    "Resetting the password or two-factor sign-in, or deactivating, signs the person out everywhere immediately.": ["Réinitialiser le mot de passe ou la connexion à deux facteurs, ou désactiver, déconnecte immédiatement la personne partout.", "Gusubizaho ijambobanga, kwinjira mu ntambwe ebyiri cyangwa guhagarika konti bisohora uwo muntu ako kanya aho ari hose."],
    "Account updated": ["Compte mis à jour", "Konti yavuguruwe"], "Password reset": ["Mot de passe réinitialisé", "Ijambobanga ryasubijweho"], "Two-factor sign-in reset": ["Connexion à deux facteurs réinitialisée", "Kwinjira mu ntambwe ebyiri byasubijweho"],
    "Account deactivated": ["Compte désactivé", "Konti yahagaritswe"], "Account reactivated": ["Compte réactivé", "Konti yongeye gukora"],
    "Create a new temporary password for {name}? Their current password stops working.": ["Créer un nouveau mot de passe temporaire pour {name} ? Son mot de passe actuel ne fonctionnera plus.", "Gukorera {name} ijambobanga ry'agateganyo rishya? Iryo yari afite ntirizongera gukora."],
    "Remove the authenticator of {name}? Do this only after checking who is asking (e.g. a lost phone).": ["Supprimer l'application d'authentification de {name} ? Vérifiez d'abord qui le demande (ex. téléphone perdu).", "Gukuraho porogaramu yo kwemeza ya {name}? Banza umenye neza ubisaba (urugero: telefoni yatakaye)."],
    "Deactivate {name}? They are signed out and can no longer sign in.": ["Désactiver {name} ? La personne est déconnectée et ne peut plus se connecter.", "Guhagarika {name}? Arasohorwa kandi ntazongera kwinjira."],
    "Temporary password": ["Mot de passe temporaire", "Ijambobanga ry'agateganyo"],
    "My account": ["Mon compte", "Konti yanjye"], "Current password": ["Mot de passe actuel", "Ijambobanga usanzwe ukoresha"],
    "New password (at least 12 characters)": ["Nouveau mot de passe (au moins 12 caractères)", "Ijambobanga rishya (nibura inyuguti 12)"], "Change password": ["Changer le mot de passe", "Hindura ijambobanga"],
    "Turn off": ["Désactiver", "Zimya"], "Set up authenticator app": ["Configurer l'application d'authentification", "Shyiraho porogaramu yo kwemeza"],
    "Required by RMB for all staff accounts.": ["Exigée par RMB pour tous les comptes du personnel.", "RMB ibisaba kuri konti z'abakozi bose."],
    "Turn off two-factor sign-in": ["Désactiver la connexion à deux facteurs", "Zimya kwinjira mu ntambwe ebyiri"], "Your password": ["Votre mot de passe", "Ijambobanga ryawe"],
    "Two-factor sign-in turned off": ["Connexion à deux facteurs désactivée", "Kwinjira mu ntambwe ebyiri byazimijwe"],
    "Password changed. Your other sessions were signed out.": ["Mot de passe changé. Vos autres sessions ont été déconnectées.", "Ijambobanga ryahinduwe. Ahandi wari winjiye wasohowe."],
    "Set up two-factor sign-in": ["Configurer la connexion à deux facteurs", "Shyiraho kwinjira mu ntambwe ebyiri"],
    "RMB requires an authenticator app for every staff account.": ["RMB exige une application d'authentification pour chaque compte.", "RMB isaba porogaramu yo kwemeza kuri buri konti y'umukozi."],
    "Install an authenticator app on your phone: Google Authenticator, Microsoft Authenticator or Authy.": ["Installez une application d'authentification sur votre téléphone : Google Authenticator, Microsoft Authenticator ou Authy.", "Shyira kuri telefoni yawe porogaramu yo kwemeza: Google Authenticator, Microsoft Authenticator cyangwa Authy."],
    "Enter the 6-digit code the app shows:": ["Saisissez le code à 6 chiffres affiché par l'application :", "Andika kode y'imibare 6 porogaramu yerekana:"],
    "Turn on": ["Activer", "Fungura"], "Two-factor sign-in is on": ["La connexion à deux facteurs est activée", "Kwinjira mu ntambwe ebyiri birakora"],
    "Choose your own password": ["Choisissez votre mot de passe", "Hitamo ijambobanga ryawe"],
    "You signed in with a temporary password. Choose a password only you know.": ["Vous vous êtes connecté avec un mot de passe temporaire. Choisissez un mot de passe connu de vous seul.", "Winjiye ukoresheje ijambobanga ry'agateganyo. Hitamo ijambobanga uzi wenyine."],
    "New password (at least 12 characters, not containing your name)": ["Nouveau mot de passe (au moins 12 caractères, sans votre nom)", "Ijambobanga rishya (nibura inyuguti 12, ritarimo izina ryawe)"],
    "Password changed": ["Mot de passe changé", "Ijambobanga ryahinduwe"],

    // ---- audit
    "Every sign-in, account change and change made through this portal: who, what and when.": ["Chaque connexion, modification de compte et modification faite dans ce portail : qui, quoi et quand.", "Buri kwinjira, impinduka kuri konti n'impinduka zakorewe muri uru rubuga: nde, iki, ryari."],
    "Filter by email, action or page…": ["Filtrer par e-mail, action ou page…", "Shungura ukoresheje imeli, igikorwa cyangwa urupapuro…"], "Filter": ["Filtrer", "Shungura"],
    "Action": ["Action", "Igikorwa"], "Result": ["Résultat", "Ibyavuyemo"], "Nothing recorded yet.": ["Rien d'enregistré pour l'instant.", "Nta kirandikwa."],
    "Signed in": ["Connexion", "Yinjiye"], "Failed sign-in": ["Échec de connexion", "Kwinjira byanze"], "Signed out": ["Déconnexion", "Yasohotse"], "Account created": ["Compte créé", "Konti yafunguwe"],
    "Account edited": ["Compte modifié", "Konti yahinduwe"], "Role changed": ["Rôle changé", "Inshingano zahinduwe"], "Wrong current password": ["Mot de passe actuel erroné", "Ijambobanga ritari ryo"],
    "Two-factor turned on": ["Deux facteurs activés", "Intambwe ebyiri zafunguwe"], "Two-factor turned off": ["Deux facteurs désactivés", "Intambwe ebyiri zazimijwe"],
    "Two-factor reset": ["Deux facteurs réinitialisés", "Intambwe ebyiri zasubijweho"], "Change": ["Modification", "Impinduka"], "OK": ["OK", "Byagenze neza"],

    // ---- settings
    "Institutional Settings": ["Paramètres", "Igenamiterere"],
    "Reset": ["Réinitialiser", "Subizaho"], "Save All": ["Tout enregistrer", "Bika byose"], "Read-only for your role": ["Lecture seule pour votre rôle", "Gusoma gusa ku nshingano zawe"],
    "Section A: AI Model & Inference Engine": ["Section A : modèle d'IA", "Igice A: Porogaramu ya AI"], "Runtime parameters and citation strictness": ["Paramètres et rigueur des citations", "Igenamiterere n'ubukana bwo kugaragaza aho byavuye"],
    "Classification Confidence Floor": ["Seuil de confiance", "Urugero rwo kwizera"], "default": ["par défaut", "bisanzwe"], "custom": ["personnalisé", "byahinduwe"],
    "0.70 (answers more)": ["0,70 (répond plus)", "0.70 (asubiza byinshi)"], "0.92 (stricter)": ["0,92 (plus strict)", "0.92 (bikomeye)"],
    "System Persona (tone preferences)": ["Ton de l'assistant", "Imvugo y'umufasha"], "Answer model": ["Modèle de réponse", "Porogaramu isubiza"], "Classifier": ["Classifieur", "Itondeka"],
    "Search model": ["Modèle de recherche", "Porogaramu ishakisha"], "Rate limit": ["Limite de débit", "Umubare ntarengwa"],
    "Section B: Branding & Persona": ["Section B : image et ton", "Igice B: Isura n'imvugo"], "Citizen-facing presence on rmb.gov.rw": ["Présence publique sur rmb.gov.rw", "Uko bigaragara ku rubuga rmb.gov.rw"],
    "Public Web Widget Status": ["Widget public", "Umufasha ku rubuga"], "Embedding on rmb.gov.rw portal": ["Intégré sur rmb.gov.rw", "Ku rubuga rwa rmb.gov.rw"],
    "Assistant Public Display Name": ["Nom public de l'assistant", "Izina ry'umufasha rigaragara"], "Welcome Message Greeting": ["Message d'accueil", "Ubutumwa bwo kwakira"],
    "Suggested questions (one per line)": ["Questions suggérées (une par ligne)", "Ibibazo byatanzwe (kimwe ku murongo)"], "Supported Public Languages": ["Langues prises en charge", "Indimi zikoreshwa"],
    "ACTIVE": ["ACTIF", "BIRAKORA"], "DEFAULT": ["PAR DÉFAUT", "IBISANZWE"],
    "Section C: Emergency & Contact Rules": ["Section C : urgences et contacts", "Igice C: Ubutabazi n'aho babariza"], "Shown instantly for accidents, collapses and spills": ["Affichés immédiatement en cas d'accident, d'effondrement ou de déversement", "Bigaragara ako kanya ku mpanuka, iriduka n'ibyameneka"],
    "Add contact": ["Ajouter un contact", "Ongeraho nimero"], "RMB contacts": ["Contacts de RMB", "Aho wabariza RMB"], "Phone": ["Téléphone", "Telefoni"], "Toll free": ["Numéro gratuit", "Nimero itishyurwa"],
    "Website": ["Site web", "Urubuga"], "Address": ["Adresse", "Aderesi"], "Label": ["Libellé", "Izina"], "Number": ["Numéro", "Nimero"], "example": ["exemple", "urugero"],
    "Section D: Security & Audit": ["Section D : sécurité et audit", "Igice D: Umutekano n'igenzura"], "Statutory data governance and access control": ["Gouvernance des données et contrôle d'accès", "Imicungire y'amakuru n'uburenganzira bwo kwinjira"],
    "Session Inactivity Timeout": ["Expiration de session", "Igihe cyo gusohorwa"], "Forces re-authentication": ["Oblige à se reconnecter", "Bisaba kongera kwinjira"],
    "Login protection": ["Protection de la connexion", "Kurinda kwinjira"], "Lockout after 5 failed attempts in 15 minutes": ["Blocage après 5 échecs en 15 minutes", "Bifungwa nyuma yo kwibeshya inshuro 5 mu minota 15"],
    "Admin API isolation": ["Isolation de l'API d'administration", "Kurinda API y'ubuyobozi"],
    "The admin key stays on the server; the public website cannot reach admin endpoints": ["La clé d'administration reste sur le serveur ; le site public n'y a pas accès", "Urufunguzo rw'ubuyobozi ruguma kuri seriveri; urubuga rusange ntirubugeraho"],
    "Data Privacy Certification": ["Protection des données", "Kurinda amakuru bwite"],
    "Settings saved: live on the website within 30 seconds": ["Paramètres enregistrés : en ligne sur le site d'ici 30 secondes", "Igenamiterere ryabitswe: rirakora ku rubuga mu masegonda 30"],

    // ---- login page
    "AI Assistant administration": ["Administration de l'assistant IA", "Ubuyobozi bw'umufasha wa AI"],
    "Sign in with your RMB staff account.": ["Connectez-vous avec votre compte du personnel de RMB.", "Injira ukoresheje konti yawe y'umukozi wa RMB."],
    "Sign in": ["Se connecter", "Injira"], "Verify": ["Vérifier", "Emeza"], "Authentication code": ["Code d'authentification", "Kode yo kwemeza"],
    "Enter the 6-digit code from your authenticator app.": ["Saisissez le code à 6 chiffres de votre application d'authentification.", "Andika kode y'imibare 6 iri muri porogaramu yawe yo kwemeza."],
    "Use another account": ["Utiliser un autre compte", "Koresha indi konti"],
    "Forgot your password? Ask an RMB super admin for a temporary one.": ["Mot de passe oublié ? Demandez-en un temporaire à un super administrateur de RMB.", "Wibagiwe ijambobanga? Saba umuyobozi mukuru wa sisitemu wa RMB iry'agateganyo."],
    "Access is restricted to authorised RMB personnel. Activity is logged.": ["Accès réservé au personnel autorisé de RMB. L'activité est enregistrée.", "Byagenewe abakozi ba RMB babyemerewe gusa. Ibikorwa byose birandikwa."],
    "Wrong email or password.": ["E-mail ou mot de passe incorrect.", "Imeli cyangwa ijambobanga si byo."],
    "Too many failed attempts. Try again in 15 minutes.": ["Trop de tentatives échouées. Réessayez dans 15 minutes.", "Wibeshye inshuro nyinshi. Ongera ugerageze nyuma y'iminota 15."],
    "Your session expired. Please try again.": ["Votre session a expiré. Veuillez réessayer.", "Igihe cyawe cyarangiye. Ongera ugerageze."],
    "Your sign-in expired. Please enter your password again.": ["Votre connexion a expiré. Saisissez à nouveau votre mot de passe.", "Igihe cyo kwinjira cyarangiye. Ongera wandike ijambobanga."],
    "Please sign in again.": ["Veuillez vous reconnecter.", "Ongera winjire."],
    "That code is not valid. Check the time on your phone and try the newest code.": ["Ce code n'est pas valide. Vérifiez l'heure de votre téléphone et essayez le code le plus récent.", "Iyo kode si yo. Reba isaha ya telefoni yawe ugerageze kode nshya."],

    // ---- messages from the server
    "The new password must have at least 12 characters.": ["Le nouveau mot de passe doit comporter au moins 12 caractères.", "Ijambobanga rishya rigomba kugira nibura inyuguti 12."],
    "The password must not contain your email name.": ["Le mot de passe ne doit pas contenir votre nom d'e-mail.", "Ijambobanga ntirigomba kubamo izina riri muri imeli yawe."],
    "The password is too simple: use more different characters.": ["Mot de passe trop simple : utilisez des caractères plus variés.", "Ijambobanga ryoroshye cyane: koresha inyuguti zitandukanye."],
    "This password is too common.": ["Ce mot de passe est trop courant.", "Iri jambobanga rirakoreshwa cyane."],
    "An account with this email already exists.": ["Un compte avec cet e-mail existe déjà.", "Hari indi konti ikoresha iyi meli."],
    "You cannot change your own role.": ["Vous ne pouvez pas changer votre propre rôle.", "Ntushobora guhindura inshingano zawe."],
    "You cannot deactivate your own account.": ["Vous ne pouvez pas désactiver votre propre compte.", "Ntushobora guhagarika konti yawe."],
    "Current password is wrong.": ["Le mot de passe actuel est incorrect.", "Ijambobanga usanzwe ukoresha si ryo."],
    "Choose a password different from the current one.": ["Choisissez un mot de passe différent de l'actuel.", "Hitamo ijambobanga ritandukanye n'iryo usanzwe ukoresha."],
    "Password is wrong.": ["Mot de passe incorrect.", "Ijambobanga si ryo."],
    "Your role does not allow this action.": ["Votre rôle ne permet pas cette action.", "Inshingano zawe ntizikwemerera iki gikorwa."],
    "The AI service is not reachable.": ["Le service d'IA est injoignable.", "Serivisi ya AI ntiboneka."],
    "Invalid or missing CSRF token. Reload the page.": ["Jeton de sécurité invalide. Rechargez la page.", "Ikimenyetso cy'umutekano ntikiboneka. Ongera ufungure urupapuro."],
    // ---- case details dialog
    "Relevant": ["Pertinent", "Bifite ishingiro"], "Unclear": ["Peu clair", "Ntibisobanutse"], "Spam": ["Indésirable", "Spam"],
    "All topics": ["Tous les sujets", "Ingingo zose"], "All outcomes": ["Tous les résultats", "Ibyavuyemo byose"],
    "Clear filters": ["Effacer les filtres", "Siba amashungura"], "{n} conversations": ["{n} conversations", "Ibiganiro {n}"],
    "What was reported": ["Ce qui a été signalé", "Ibyatanzwe"], "Handling": ["Traitement", "Uko gikurikiranwa"], "Activity": ["Activité", "Ibyakozwe"],
    "AI triage": ["Tri par l'IA", "Uko AI yagitondetse"], "Case received": ["Dossier reçu", "Ikirego cyakiriwe"], "Note added": ["Note ajoutée", "Icyitonderwa cyongeweho"],
    "e.g. inspector called the reporter": ["ex. l'inspecteur a appelé la personne", "urugero: umugenzuzi yahamagaye uwatanze amakuru"],
    "Description": ["Description", "Ibisobanuro"], "Location": ["Lieu", "Aho biri"], "District": ["District", "Akarere"], "Name": ["Nom", "Izina"],
    "Request": ["Demande", "Ubusabe"], "Date": ["Date", "Itariki"], "Organisation": ["Organisation", "Ikigo"], "Organization": ["Organisation", "Ikigo"],
    // ---- added after the full-portal check
    "Incoming inquiries and verified AI classifications": ["Demandes entrantes et classification par l'IA", "Ibibazo byinjiye n'uko AI yabishyize mu byiciro"],
    "Official answers written by RMB staff. The assistant cites a published answer as “RMB Official FAQ”. A draft goes live only when a": ["Réponses officielles rédigées par le personnel de RMB. L'assistant cite une réponse publiée comme « FAQ officielle de RMB ». Un brouillon n'est en ligne que lorsqu'un", "Ibisubizo byemewe byanditswe n'abakozi ba RMB. Umufasha agaragaza igisubizo cyashyizwe ahagaragara nka “FAQ yemewe ya RMB”. Umushinga ukoreshwa gusa iyo"],
    "different": ["autre", "undi"],
    "staff member publishes it.": ["membre du personnel le publie.", "mukozi awushyize ahagaragara."],
    "owner": ["responsable", "ubishinzwe"], "review": ["révision", "isuzuma"],
    "docs": ["docs", "inyandiko"], "files": ["fichiers", "dosiye"],
    "law": ["loi", "itegeko"], "regulation": ["règlement", "amabwiriza"], "guide": ["guide", "imfashanyigisho"], "faq": ["faq", "faq"],
    "prospectus": ["prospectus", "inyandiko y'ishoramari"], "directory": ["annuaire", "urutonde"], "other": ["autre", "ibindi"],
    "Real-time systemic oversight of the assistant on rmb.gov.rw. Its grounding and safety rules are fixed in code and cannot be changed here.": ["Réglages de l'assistant sur rmb.gov.rw. Ses règles de fiabilité et de sécurité sont fixées dans le code et ne peuvent pas être modifiées ici.", "Igenamiterere ry'umufasha kuri rmb.gov.rw. Amategeko ye y'ukuri n'umutekano ari muri porogaramu kandi ntashobora guhindurirwa hano."],
    "Queries below this similarity are answered “not covered” and flagged for RMB knowledge-gap review.": ["Les questions sous ce seuil reçoivent « non couvert » et sont signalées comme lacunes.", "Ibibazo biri munsi y'uru rugero bisubizwa ko “bitari mu nyandiko” bikanashyirwa mu bibazo bitasubijwe."],
    "Tone only: cannot override the statutory rules (official documents only, cite sources, never guess fees).": ["Ton seulement : ne peut pas changer les règles (documents officiels seulement, citer les sources, ne jamais deviner les frais).", "Imvugo gusa: ntibihindura amategeko (inyandiko z'ubuyobozi gusa, kugaragaza aho byavuye, kudakeka amafaranga)."],
    "Two-Factor Authentication (2FA)": ["Authentification à deux facteurs (2FA)", "Kwinjira mu ntambwe ebyiri (2FA)"],
    "Authenticator app code (Google Authenticator, Microsoft Authenticator, Authy) after the password": ["Code d'une application d'authentification (Google Authenticator, Microsoft Authenticator, Authy) après le mot de passe", "Kode ya porogaramu yo kwemeza (Google Authenticator, Microsoft Authenticator, Authy) nyuma y'ijambobanga"],
    "REQUIRED FOR ALL STAFF": ["OBLIGATOIRE POUR TOUT LE PERSONNEL", "IRASABWA ABAKOZI BOSE"], "OPTIONAL": ["FACULTATIF", "SI ITEGEKO"],
    "Visitor IP addresses are never stored (only a salted hash for rate limiting). Anonymous reports keep no contact details. Compliance with Law N° 058/2021 relating to the protection of personal data and privacy to be confirmed by RMB's legal and ICT teams.": ["Les adresses IP des visiteurs ne sont jamais conservées (seulement une empreinte pour limiter le débit). Les signalements anonymes ne gardent aucun contact. La conformité à la loi n° 058/2021 sur la protection des données personnelles reste à confirmer par les équipes juridique et informatique de RMB.", "Aderesi za IP z'abasura urubuga ntizibikwa (hakoreshwa gusa ikimenyetso cyo kugenzura umubare). Amakuru atanzwe n'utazwi ntabika aho yabarizwa. Kubahiriza Itegeko N° 058/2021 rirengera amakuru bwite bigomba kwemezwa n'amashami ya RMB ashinzwe amategeko n'ikoranabuhanga."],
    "On: you enter a code from your authenticator app after your password.": ["Activée : vous saisissez un code de votre application après votre mot de passe.", "Birakora: wandika kode iri muri porogaramu yawe nyuma y'ijambobanga."],
    "Off. Add a second step to your sign-in with an authenticator app on your phone.": ["Désactivée. Ajoutez une deuxième étape à votre connexion avec une application d'authentification sur votre téléphone.", "Ntibikora. Ongeraho intambwe ya kabiri mu kwinjira ukoresheje porogaramu yo kwemeza kuri telefoni yawe."],
  };

  // Texts with numbers or names inside (whole text node). [regex, French, Kinyarwanda]
  const P = [
    [/^Answered worldwide · (.+) questions$/, "Répondu · $1 questions", "Byasubijwe · ibibazo $1"],
    [/^RAG vector lookup · 90% under (.+)$/, "90 % des réponses en moins de $1", "90% by'ibisubizo munsi ya $1"],
    [/^Distribution of (.+) tickets categorized across Rwandan mineral regulatory mandates\.$/, "Répartition de $1 demandes par domaine.", "Ibibazo $1 bishyizwe mu byiciro."],
    [/^(\d[\d,. ]*) Reports$/, "$1 signalements", "Amakuru $1"],
    [/^(.+) docs$/, "$1 docs", "Inyandiko $1"], [/^(.+) files$/, "$1 fichiers", "Dosiye $1"],
    [/^(.+) active$/, "$1 actifs", "$1 zikora"], [/^(.+) overdue$/, "$1 en retard", "$1 zarengeje igihe"],
    [/^(.+) questions not covered yet$/, "$1 questions pas encore couvertes", "Ibibazo $1 bitarasubizwa"],
    [/^of (\d+) active accounts( · required)?$/, (m, n, r) => `sur ${n} comptes actifs${r ? " · obligatoire" : ""}`, (m, n, r) => `kuri konti ${n} zikora${r ? " · birategetswe" : ""}`],
    [/^Displaying (\d+) active RMB internal administrative personnel$/, "$1 membres actifs du personnel de RMB", "Abakozi ba RMB $1 bakora"],
    [/^(\d+) minutes inactivity$/, "$1 minutes d'inactivité", "Iminota $1 udakora"],
    [/^(.+) messages \/ minute per visitor$/, "$1 messages / minute par visiteur", "Ubutumwa $1 ku munota kuri buri muntu"],
    [/^Use the default \((.+)\)$/, "Utiliser la valeur par défaut ($1)", "Koresha ibisanzwe ($1)"],
    [/^Edit FAQ #(\d+)(.*)$/, "Modifier la FAQ n° $1", "Hindura FAQ #$1"],
    [/^Triage: (.*) \(by (.*)\)$/, "Tri : $1 (par $2)", "Gutondeka: $1 (na $2)"],
  ];

  const pick = (row) => (lang === "fr" ? row[0] : row[1]);
  const fill = (s, vars) => (vars ? String(s).replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m)) : s);
  const missing = new Set();

  function lookup(s) {
    if (lang === "en") return null;
    const row = D[s];
    if (row) return pick(row);
    for (const p of P) {
      if (p[0].test(s)) { const r = lang === "fr" ? p[1] : p[2]; return s.replace(p[0], r); }
    }
    return null;
  }

  /** Translate one English text (used by app.js). {name} placeholders are filled from vars. */
  function t(s, vars) {
    const out = lookup(String(s));
    if (out == null && lang !== "en" && /[a-z]{3}/i.test(s)) missing.add(String(s));
    return fill(out == null ? s : out, vars);
  }

  // ---- translate the page as it is drawn
  const SKIP = "script,style,textarea,code,kbd,pre,[data-notr],.secret,.bubble,.msg,.quote";
  const ATTRS = ["placeholder", "title", "aria-label"];

  function trText(node) {
    const raw = node.nodeValue, s = raw.replace(/\s+/g, " ").trim();
    if (!s || !/[A-Za-z]/.test(s)) return;
    const out = lookup(s);
    if (out == null) { if (/[a-z]{3}/i.test(s) && s.length < 400) missing.add(s); return; }
    if (out !== s) node.nodeValue = raw.replace(raw.trim(), out);
  }
  function trEl(el) {
    for (const a of ATTRS) {
      const v = el.getAttribute && el.getAttribute(a);
      if (v) { const out = lookup(v.trim()); if (out != null && out !== v) el.setAttribute(a, out); }
    }
  }
  function walk(root) {
    if (lang === "en" || !root) return;
    if (root.nodeType === 3) { if (!(root.parentElement && root.parentElement.closest(SKIP))) trText(root); return; }
    if (root.nodeType !== 1 || root.closest(SKIP)) return;
    trEl(root);
    const tw = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => (n.nodeType === 1 && n.matches(SKIP) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
    });
    for (let n = tw.nextNode(); n; n = tw.nextNode()) { if (n.nodeType === 3) trText(n); else trEl(n); }
  }

  function start() {
    document.documentElement.lang = lang;
    document.querySelectorAll("[data-setlang]").forEach((b) => {
      b.classList.toggle("on", b.dataset.setlang === lang);
      b.setAttribute("aria-pressed", String(b.dataset.setlang === lang));
      b.addEventListener("click", () => set(b.dataset.setlang));
    });
    if (lang === "en") return;
    walk(document.body);
    document.title = lookup(document.title) || document.title;
    new MutationObserver((list) => {
      for (const m of list) {
        if (m.type === "characterData") { const p = m.target.parentElement; if (p && !p.closest(SKIP)) trText(m.target); continue; }
        m.addedNodes.forEach(walk);
      }
    }).observe(document.body, {childList: true, subtree: true});
  }

  function set(l) {
    try { localStorage.setItem(KEY, l); } catch (e) { /* storage blocked: applies to this page only */ }
    location.reload();
  }

  let locale = {en: "en-GB", fr: "fr-FR", rw: "rw-RW"}[lang];
  try { if (!Intl.DateTimeFormat.supportedLocalesOf([locale]).length) locale = "en-GB"; } catch (e) { locale = "en-GB"; }

  window.I18N = {lang, locale, t, set, missing: () => [...missing]};
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
})();
