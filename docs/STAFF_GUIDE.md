# baza-RMB staff portal: guide for RMB staff

The staff portal is where RMB officers follow the AI assistant: what the public asks, the complaints and requests it
registers, the questions it could not answer, and the documents it answers from.
Open it from RMB's network: **https://baza-admin.rmb.gov.rw** (your IT team gives you the exact address).

## 1. Signing in

**First time**

1. A super admin creates your account and gives you a **temporary password** (in person or by phone).
2. Sign in with your RMB email and the temporary password.
3. Choose your own password: at least 12 characters, not containing your name, not a common word.
   Tip: use a short sentence, e.g. `Ikawa-ya-mugitondo-2026!`
4. Set up **two-factor sign-in** if asked (always required on RMB's server):
   - install **Google Authenticator**, **Microsoft Authenticator** or **Authy** on your phone;
   - in the app: *Add account → Enter a setup key*, type the key shown in the portal, type *Time-based*;
   - type the 6-digit code the app shows into the portal.

**Every day:** email, password, then the current 6-digit code from the app.

**Good to know**

- You are signed out after 30 minutes without activity, and after 8 hours in any case.
- After 5 wrong attempts, sign-in is blocked for 15 minutes.
- **Forgot your password or lost your phone?** Ask a super admin: they reset it, and you set it up again.
- Change your password or two-factor settings at any time: click your initials (top right) → **My account**.
- Everything done in the portal is recorded in the audit log (who, what, when).

## 2. Roles: who can do what

| Role | Can |
|---|---|
| **Super Admin** | everything, including staff accounts, the audit log and the assistant's settings |
| **Licensing Officer** | documents (upload, publish, retire), FAQ answers (write, and approve other people's), knowledge gaps, read cases |
| **Complaints Officer** | all cases including confidential reports, conversations, knowledge gaps, FAQ drafts |
| **Analyst** | read only: dashboard, analytics, conversations, documents, non-confidential cases |
| **Support Agent** | non-confidential cases, knowledge gaps, FAQ drafts (cannot publish) |

Menu items you do not have access to are hidden.

## 3. Screens

| Screen | What it is for |
|---|---|
| **Dashboard** | conversations, questions, answer rate and topics over the chosen period |
| **Conversations** | read what visitors asked and what the assistant answered (with its sources); filter by topic: Licensing, Investment, Complaints, Other |
| **Cases** | complaints, illegal-mining reports, meeting and data requests registered by the assistant. Each has a reference (`RMB-2026-XXXXXX`) that the person uses to check progress. Open a case to change its status, assign it, set the priority and add notes. Urgent ones are at the top; ones the AI judged irrelevant or spam are hidden unless you choose to show them |
| **Knowledge gaps** | questions the assistant could not answer from its documents. For each: write an FAQ answer, or mark it resolved / ignored |
| **FAQ answers** | answers written by RMB staff for common questions the documents do not cover. **Four-eyes rule:** an answer is used by the assistant only after a *different* officer (Licensing Officer or Super Admin) approves it |
| **AI Knowledge** | the documents the assistant answers from: upload a new PDF, replace a version, retire an outdated one, see how it was split into passages |
| **Analytics** | trends, topics, most-used documents; export to CSV |
| **Users & Roles** (super admin) | add staff, change roles, reset passwords or two-factor sign-in, deactivate accounts |
| **Settings** | welcome message, suggested questions, emergency contacts, tone |
| **Audit log** (super admin) | every sign-in, failed sign-in, account change and change made in the portal |

## 4. Managing staff accounts (super admins)

- **Add:** Users & Roles → **Add Staff Account** → name, email, role. Give the temporary password to the person
  directly. It is shown only once.
- **Change role / name:** click the person → edit → **Save changes**.
- **Forgotten password:** click the person → **Reset password** → give them the new temporary password.
- **Lost phone:** click the person → **Reset two-factor sign-in**. Check who is asking before doing this
  (call the person back on a known number).
- **Someone leaves RMB:** click the person → **Deactivate account** the same day. They are signed out immediately.
  The account is kept (deactivated) so the audit log stays complete.
- There is always at least one active super admin: the last one cannot be removed or deactivated.

## 5. Good practice

- Never share your account or your authenticator codes. Each person signs in with their own account.
- Do not write passwords in emails or chat messages.
- Treat conversations and cases as personal data: do not copy them outside the portal unless needed for the case.
- The assistant can make mistakes. When you see a wrong answer, write a correct FAQ answer (and have it approved),
  or tell the document owner if a document is outdated.
