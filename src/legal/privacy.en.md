# Privacy policy

This policy covers **this instance** of filahub. filahub is free software that
anyone can run themselves; every installation has its own controller – see the
[imprint](/impressum).

## 1. Controller

{{operator.postalAddress}}

Email: {{operator.email}}

A message to that address is enough to request access, correction or erasure.
You can also trigger access and erasure yourself in the settings – that is
faster.

## 2. What data is processed

| Data                                                                                                                    | Purpose                               | Legal basis                        | Retention                                |
| ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------- | ---------------------------------- | ---------------------------------------- |
| Telegram ID, display name, Telegram username                                                                            | account and sign-in                   | Art. 6(1)(b) GDPR (contract)       | until the account is deleted             |
| Time of last sign-in                                                                                                    | operation, spotting dormant accounts  | Art. 6(1)(f) (legitimate interest) | until the account is deleted             |
| Stock: spools, weigh-ins, spool types, storage boxes – including prices, purchase dates, short IDs, locations and notes | core function of the application      | Art. 6(1)(b)                       | until the account is deleted             |
| Settings: language, currency, number format, last release notes seen                                                    | presentation                          | Art. 6(1)(b)                       | until the account is deleted             |
| Sign-in codes: Telegram ID, Telegram name, code                                                                         | signing in without the widget         | Art. 6(1)(b)                       | **deleted automatically after 24 hours** |
| Preset proposals: content, reasoning, submitter, moderation record                                                      | maintaining the shared catalogue      | Art. 6(1)(b) and (f)               | see section 8                            |
| Server logs at the host, including IP address                                                                           | operation and defence against attacks | Art. 6(1)(f)                       | as configured by the host, see section 4 |

Free-text fields such as notes or location are filled in by you. Whatever you
put there is stored along with the rest – even if it has nothing to do with
filament.

For users in Switzerland the same processing applies; the articles cited above
are replaced by the corresponding provisions of the revised Federal Act on Data
Protection (revFADP).

## 3. Signing in with Telegram

Signing in requires a Telegram account. There are two ways.

**Telegram's sign-in button.** The button is loaded from `telegram.org`. That
request alone tells Telegram your IP address and details about your device –
whether or not you go on to sign in. The script is therefore loaded **only after
an explicit click**. The legal basis is your consent under Art. 6(1)(a) GDPR.

**Six-digit code from the bot.** This route works without any Telegram script in
your browser. The server requests the code through Telegram's bot interface and
sends it to you as a message. Telegram sees the content of that message and your
Telegram ID – both of which Telegram already knows as your messenger.

**Transfer outside the EU and Switzerland.** Telegram is operated by Telegram
FZ-LLC, based in the United Arab Emirates. There is **no adequacy decision** by
the European Commission for that country and no finding of adequate protection
under Annex 1 of the Swiss Data Protection Ordinance. The transfer therefore
relies on your explicit consent under Art. 49(1)(a) GDPR and Art. 17(1)(a)
revFADP. A level of protection equivalent to European law cannot be guaranteed;
in particular, state authorities there have broader powers of access and there
are no comparable legal remedies.

**Withdrawing consent.** Your decision to load the script is stored in your
browser (see section 6) and can be deleted there. Withdrawal takes effect going
forward. You do not need the widget to sign in – the code route stays open.

What Telegram does with the data on its own account is governed by Telegram's
own privacy policy. The operator of this instance has no influence over it.

## 4. Hosting

This instance runs at:

{{operator.hosting}}

The host processes the data solely on instructions, as a processor under
Art. 28 GDPR. Server logs containing IP addresses arise as a technical
necessity.

## 5. What does not happen

- **No analytics, no tracking, no advertising.** The application embeds no
  analytics services, no tracking pixels and no ad networks.
- **No external fonts, no content delivery networks.** Every file comes from
  this instance's own server. The only exception is the Telegram button in
  section 3, and only after your consent.
- **No disclosure for advertising purposes**, no sale, no profiling.
- **No automated individual decision-making** within the meaning of Art. 22
  GDPR.
- **No profile picture from Telegram.** It is neither stored nor displayed;
  your initials are shown instead.

## 6. What is stored on your device

| Name                      | Type               | Purpose                               | Duration           |
| ------------------------- | ------------------ | ------------------------------------- | ------------------ |
| `filament_sid`            | cookie, `httpOnly` | keeps you signed in                   | 30 days            |
| `sidebar_state`           | cookie             | preferred width of the navigation bar | 7 days             |
| `theme`                   | local storage      | chosen colour scheme                  | until you clear it |
| `sidebar-width`           | local storage      | chosen width of the navigation bar    | until you clear it |
| `telegram-widget-consent` | local storage      | your decision from section 3          | until you clear it |

All of these are either technically necessary or record a setting you chose
yourself. There is therefore no consent banner – and none of it serves to
analyse your behaviour.

## 7. Import with help from a language model

The import page produces a block of text that you can hand to a language model
of your choice, together with an invoice or order confirmation, to turn it into
a list.

**filahub itself transmits nothing in the process.** If you take that route,
though, you are handing the document to a provider outside this application.
Invoices typically contain your name, your address and payment details. Check
what the document says beforehand and redact whatever the language model does
not need. The uploaded file itself never leaves your browser – only the
resulting list is sent to the server.

## 8. Your rights

You have the right to:

- **Access** (Art. 15 GDPR, Art. 25 revFADP) – available at any time under
  “Data and account” in the settings
- **Rectification** (Art. 16 GDPR, Art. 32 revFADP) – every entry is editable
  in the application
- **Erasure** (Art. 17 GDPR, Art. 32 revFADP) – also in the settings
- **Restriction of processing** (Art. 18 GDPR)
- **Data portability** (Art. 20 GDPR, Art. 28 revFADP) – the export is
  machine-readable JSON and can be read back in on the import page
- **Object** to processing based on legitimate interests (Art. 21 GDPR)
- **Withdraw consent** with effect for the future (Art. 7(3) GDPR)

**What happens when you delete your account.** Your account and your entire
stock are removed for good, as are open, rejected and withdrawn proposals.
Proposals that made it into the **shared catalogue** remain – without your name
and without your reasoning. The reason: other accounts reference those catalogue
entries, and removing them would damage their stock. The entry itself no longer
allows any conclusion about you. If you moderated proposals as an
administrator, the decision stays traceable but your name is removed there too.

**Right to lodge a complaint.** You may complain to a supervisory authority – in
Switzerland the Federal Data Protection and Information Commissioner (FDPIC), in
the European Union the authority of your country of residence or place of work.

## 9. Obligation to provide data

There is no statutory or contractual obligation to provide data. Without a
Telegram account signing in is technically impossible, and without details about
your stock the application has nothing to calculate.

## 10. Changes

This policy will be adjusted when the processing changes. The version available
here is the one that applies.
