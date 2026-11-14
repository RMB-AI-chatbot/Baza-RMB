"""Fixed user-facing texts (no LLM involved), per language.

French and Kinyarwanda strings are first drafts and MUST be reviewed by RMB-approved
translators before public launch (proposal §3.4).
"""

from __future__ import annotations

TEXTS: dict[str, dict[str, str]] = {
    "emergency": {
        "en": "This sounds like an emergency. Please call for help immediately using the numbers below. "
              "I cannot give emergency advice. Move to a safe place and do not go back into the site.",
        "fr": "Cela ressemble à une urgence. Appelez immédiatement les secours aux numéros ci-dessous. "
              "Je ne peux pas donner de conseils d'urgence. Mettez-vous en sécurité et ne retournez pas sur le site.",
        "rw": "Ibi bisa n'ikibazo cyihutirwa. Hamagara ubutabazi ako kanya ukoresheje nimero ziri hasi. "
              "Sinshobora gutanga inama z'ubutabazi. Jya ahantu hatekanye kandi ntusubire aho byabereye.",
    },
    "emergency_followup": {
        "en": "If you cannot call: ask anyone nearby to call 112 for you, or go straight to the nearest police station, "
              "health centre or your village leader (umukuru w'umudugudu) and tell them exactly where the person is. "
              "Do not go into the mine or pit yourself: it can collapse again. I cannot send help myself.",
        "fr": "Si vous ne pouvez pas appeler : demandez à une personne proche d'appeler le 112, ou rendez-vous immédiatement au poste "
              "de police, au centre de santé ou chez le chef de village (umukuru w'umudugudu) le plus proche et indiquez exactement "
              "où se trouve la personne. N'entrez pas vous-même dans la mine : elle peut s'effondrer à nouveau. Je ne peux pas envoyer de secours moi-même.",
        "rw": "Niba udashobora guhamagara: saba umuntu uri hafi aguhamagarire 112, cyangwa ujye ako kanya kuri sitasiyo ya polisi, "
              "ku kigo nderabuzima cyangwa ku mukuru w'umudugudu uri hafi, ubabwire neza aho uwo muntu ari. "
              "Ntukinjire mu kirombe ubwawe: gishobora kongera kugwa. Njye ubwanjye sinshobora kohereza ubutabazi.",
    },
    "about_fallback": {
        "en": "I'm Baza-RMB, the AI assistant of the Rwanda Mines, Petroleum and Gas Board. I answer questions about mining, quarries, petroleum and gas using RMB's official documents, and I cite my sources. I can make mistakes: RMB officers and the official texts are authoritative.",
        "fr": "Je suis Baza-RMB, l'assistant IA de l'Office rwandais des mines, du pétrole et du gaz. Je réponds aux questions sur les mines, les carrières, le pétrole et le gaz à partir des documents officiels de RMB, en citant mes sources. Je peux me tromper : les agents de RMB et les textes officiels font foi.",
        "rw": "Ndi Baza-RMB, umufasha wa AI w'Urwego rw'Igihugu rushinzwe Mine, Peteroli na Gaz. Nsubiza ibibazo ku bucukuzi, kariyeri, peteroli na gaz nshingiye ku nyandiko z'ubuyobozi za RMB, kandi ngaragaza aho nabikuye. Nshobora kwibeshya: abakozi ba RMB n'inyandiko z'ubuyobozi ni bo bafite ijambo rya nyuma.",
    },
    "how_are_you": {
        "en": "I'm well, thank you for asking! How can I help you today? You can ask about mining licences, the laws, investment or geohazards, or report a problem to RMB.",
        "fr": "Je vais bien, merci de demander ! Comment puis-je vous aider ? Vous pouvez poser une question sur les permis miniers, les lois, l'investissement ou les géorisques, ou signaler un problème à RMB.",
        "rw": "Ni meza, murakoze kubaza! Nagufasha iki uyu munsi? Ushobora kubaza ku mpushya z'ubucukuzi, amategeko, ishoramari cyangwa ibiza, cyangwa ukamenyesha RMB ikibazo.",
    },
    "greeting_again": {
        "en": "How can I help you? You can ask about mining licences, the mining, tax and petroleum laws, investment or geohazards, or report a problem to RMB.",
        "fr": "Comment puis-je vous aider ? Vous pouvez poser une question sur les permis miniers, les lois, l'investissement ou les géorisques, ou signaler un problème à RMB.",
        "rw": "Nagufasha iki? Ushobora kubaza ku mpushya z'ubucukuzi, amategeko, ishoramari cyangwa ibiza, cyangwa ukamenyesha RMB ikibazo.",
    },
    "greeting": {
        "en": "Hello! I'm Baza-RMB, the assistant of the Rwanda Mines, Petroleum and Gas Board. "
              "I can answer questions about mining and quarry licences, the mining, tax and petroleum laws, "
              "investment opportunities and geohazards, and I can help you submit a complaint or request to RMB. "
              "What would you like to know?",
        "fr": "Bonjour ! Je suis Baza-RMB, l'assistant de l'Office rwandais des mines, du pétrole et du gaz. "
              "Je peux répondre à vos questions sur les permis miniers, les lois minières, fiscales et pétrolières, "
              "les opportunités d'investissement et les géorisques, et vous aider à soumettre une plainte ou une demande à RMB.",
        "rw": "Muraho! Ndi Baza-RMB, umufasha w'Urwego rw'Igihugu rushinzwe Mine, Peteroli na Gaz. "
              "Nshobora gusubiza ibibazo bijyanye n'impushya z'ubucukuzi, amategeko, amahirwe y'ishoramari, "
              "no kugufasha gutanga ikirego cyangwa ubusabe kuri RMB.",
    },
    "out_of_scope": {
        "en": "I can only help with questions about Rwanda's mining, quarry, petroleum and gas sector and RMB's services. "
              "Could you ask me something in that area?",
        "fr": "Je ne peux répondre qu'aux questions sur les secteurs des mines, carrières, pétrole et gaz au Rwanda "
              "et sur les services de RMB.",
        "rw": "Nshobora gusa gufasha ku bibazo bijyanye n'ubucukuzi bw'amabuye y'agaciro, kariyeri, peteroli na gaz "
              "mu Rwanda ndetse na serivisi za RMB.",
    },
    "abusive": {
        "en": "I'm here to help with questions about RMB and the mining, petroleum and gas sector. "
              "Please keep the conversation respectful.",
        "fr": "Je suis là pour aider sur les questions relatives à RMB. Merci de rester courtois.",
        "rw": "Ndi hano kugira ngo mfashe ku bibazo bijyanye na RMB. Turasaba ikinyabupfura.",
    },
    "not_covered": {
        "en": "I don't have that information yet in the official documents I've been given, so I won't guess. "
              "You can send your question to RMB using the form below and an officer will follow up.",
        "fr": "Je n'ai pas encore cette information dans les documents officiels dont je dispose, je préfère donc ne pas deviner. "
              "Vous pouvez envoyer votre question à RMB avec le formulaire ci-dessous.",
        "rw": "Nta makuru mfite kuri iki kibazo mu nyandiko z'ubuyobozi nahawe, bityo sinshaka gukeka. "
              "Ushobora kohereza ikibazo cyawe kuri RMB ukoresheje ifishi iri hasi.",
    },
    "legal_handover": {
        "en": "I can't interpret the law for your specific situation; that needs an RMB officer. "
              "Below are provisions that may be relevant. If you'd like, send your question to RMB's legal team using the form.",
        "fr": "Je ne peux pas interpréter la loi pour votre situation particulière ; cela relève d'un agent de RMB. "
              "Voici des dispositions qui peuvent être pertinentes. Vous pouvez envoyer votre question au service juridique.",
        "rw": "Sinshobora gusobanura uko itegeko rikureba wowe ubwawe; ibyo bisaba umukozi wa RMB. "
              "Dore ingingo zishobora kuba zibikwiriye. Ushobora kohereza ikibazo cyawe ku ishami ry'amategeko.",
    },
    "error": {
        "en": "Sorry, I couldn't process that right now. Please try again in a moment, or contact RMB directly.",
        "fr": "Désolé, je n'ai pas pu traiter votre demande pour le moment. Réessayez dans un instant ou contactez RMB.",
        "rw": "Mutwihanganire, ntibyakunze ubu. Ongera ugerageze nyuma gato cyangwa uvugane na RMB.",
    },
    "rate_limited": {
        "en": "You're sending messages very quickly. Please wait a moment and try again.",
        "fr": "Vous envoyez des messages très rapidement. Patientez un instant.",
        "rw": "Urimo kohereza ubutumwa vuba cyane. Tegereza gato wongere ugerageze.",
    },
    "disclaimer": {
        "en": "General information from official documents, not legal advice. The official Gazette texts and RMB officers are authoritative.",
        "fr": "Information générale tirée de documents officiels, pas un avis juridique. Les textes du Journal officiel et les agents de RMB font foi.",
        "rw": "Aya ni amakuru rusange avuye mu nyandiko z'ubuyobozi, si inama mu by'amategeko. Inyandiko z'Igazeti ya Leta n'abakozi ba RMB ni bo bafite ijambo rya nyuma.",
    },
    "language_note": {
        "fr": "Pour l'instant je réponds en anglais ; le français arrive bientôt.",
        "rw": "Ubu nsubiza mu Cyongereza gusa; Ikinyarwanda kiraza vuba.",
        "sw": "Kwa sasa ninajibu kwa Kiingereza tu.",
        "other": "For now I answer in English only.",
    },
    "form_intro_urgent": {
        "en": "I can report this to RMB right away. Please fill in the form below; you'll get a reference number. "
              "Do not confront the people yourself. If anyone is injured or in danger, call the numbers below first.",
        "fr": "Je peux signaler ceci à RMB immédiatement. Remplissez le formulaire ci-dessous ; vous recevrez un numéro de référence. "
              "N'affrontez pas ces personnes vous-même. Si quelqu'un est blessé ou en danger, appelez d'abord les numéros ci-dessous.",
        "rw": "Nshobora guhita mbimenyesha RMB. Uzuza ifishi iri hasi; urahabwa nimero y'ikirego. "
              "Ntimuhangane n'abo bantu ubwanyu. Niba hari uwakomeretse cyangwa uri mu kaga, banza uhamagare nimero ziri hasi.",
    },
    "form_intro": {
        "en": "I can register this with RMB. Please fill in the form below; you'll get a reference number.",
        "fr": "Je peux enregistrer ceci auprès de RMB. Remplissez le formulaire ci-dessous ; vous recevrez un numéro de référence.",
        "rw": "Nshobora kubyandikisha kuri RMB. Uzuza ifishi iri hasi; urahabwa nimero y'ikirego.",
    },
}


def t(key: str, lang: str) -> str:
    entry = TEXTS.get(key, {})
    return entry.get(lang) or entry.get("en", "")
