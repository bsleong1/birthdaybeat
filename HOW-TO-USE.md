# BirthdayBeat: how to use it

**The problem:** Customer birthdays get missed because someone has to check a spreadsheet by hand.
**The fix:** BirthdayBeat checks the list for you every Monday. It shows whose birthday is coming up and writes the wish in English, Malay and Chinese, with a matching birthday card image. You copy, paste and send.

**Nothing is ever sent automatically.** You always read the message and press Send yourself.

---

## What happens every week (automatic)

Every **Monday at 8:00 am**, this PC creates a new folder:

```
BirthdayBeat\output\<date>\
   Birthday-list-<date>.pdf   ← cards + English, Malay & Chinese messages, ready to copy
   cards\01-Name.png …         ← one card image per customer, ready to attach
```

- The list covers **10 days** (Monday to the following Wednesday). Every birthday therefore appears **at least 3 days before** the date.
- If the PC is off at 8 am, the run happens as soon as the PC is switched on.
- The folder is inside OneDrive, so it shows up on your phone in the **OneDrive app** within minutes.

Each customer in the PDF has a coloured label:
| Label | Meaning |
|---|---|
| 🔴 **Send now** | Birthday is in less than 3 days, or today |
| 🟡 **Reminder day** | Exactly 3 days to go. Prepare it today |
| 🟢 **Prepare from …** | Later this period. The label shows the day to prepare it |

## Sending a wish from your phone (2 minutes)

1. Open **OneDrive**, go to `Desktop › Claude › BirthdayBeat › output`, and open this week's folder.
2. Open the **PDF**. Long-press the message, select it and tap **Copy**.
3. Open WhatsApp, open the customer's chat and paste. Then attach the card: tap 📎, choose **Document** or **Gallery**, and pick the PNG from `cards` (save it to your phone first if needed).
4. Check the name, then press **Send**.

## Using the app (PC or phone browser)

Double-click **`BirthdayBeat\index.html`**. It opens in Edge or Chrome, with no login and no installation.

1. **Customer list tab → Choose file.** Pick your Excel file. The app shows which column it matched to each item and how many customers it found. Check this, then click **Import**.
2. **Upcoming tab.** Each customer has a card and a message.
   - **English / Bahasa Melayu / 中文**: switch the language. The customer's name stays as it is in your list. If you prefer a Chinese name (e.g. 梁彩玲), type it into the message box before copying.
   - **↻ Other wording**: try a different message (there are 3 per language). You can also edit the text directly.
   - **📋 Copy message** and **🖼 Copy image**: then paste into WhatsApp Web or Outlook.
   - **WhatsApp**: opens a chat with the message already typed (needs a phone number). Attach the card before you send.
   - **Email**: opens your email with the subject and message filled in (needs an email address).
   - **📤 Share** (on a phone): sends the card and message to WhatsApp in one go.
   - **Mark as sent**: so your team can see it's done.
3. **⬇ Download PDF list**: builds the list as a PDF file and asks where to save it.
4. **Settings**: your name (it signs every message and card), company name, card language (English + Malay + Chinese by default; you can also pick one or two languages), and how many days ahead to remind.

Your data stays **only on that device's browser**. Nothing is uploaded. Clearing the browser's data removes it, so keep the Excel file as your master copy.

## How messy data is handled (it never guesses)

| Situation | What BirthdayBeat does |
|---|---|
| Birthday blank, unreadable or impossible | Customer goes to **Needs checking**. Enter the date there or fix the Excel file |
| Date could be read two ways (03/04 = 3 Apr or 4 Mar?) | Asks you whether the file uses day/month or month/day |
| Same customer on several rows | Merged into one customer |
| Same name with **different** birthdays | Goes to **Needs checking** |
| A policy shows **"Terminated (Death)"** | **Held back.** Never placed in the send list. Release it only after you've checked |
| Customer has only lapsed or terminated policies | Still wished, and tagged "No in-force policy" |
| Phone or email looks wrong | Flagged. No WhatsApp or email button for that customer |
| No name set for the signature | The message shows **[Your name]**, so a made-up name is never used |
| 29 Feb birthday | Celebrated on 28 Feb in non-leap years |

## Adding phone numbers and emails (one-time, recommended)

Many exports (for example an insurer's policy listing) have **no phone, email or company columns**. Until you add them, you can copy each message and card, but there are no one-tap WhatsApp or email buttons.

1. In the app, go to **Customer list → ⬇ Download contacts template**. Your customer names are already filled in.
2. Fill in **Phone** and **Email** (and Company or a preferred greeting name if you like).
3. Save it as **`BirthdayBeat\BirthdayBeat Contacts.xlsx`**. The weekly PDF picks it up automatically.
4. To load it into the app as well, use **Load contacts file**. You'll see every change before it's applied.

## Updating the customer list

- **Weekly PDF:** replace the customer list file named in `"dataFile"` in `config.json` with the new export, keeping the same name, or point `"dataFile"` at the new file.
- **App:** go to **Customer list → Choose file** and confirm. It replaces the old list.

## Other files you can read (PDF / PNG / JPG)

In the app, choose a PDF or photo. It reads the text (this needs internet the first time) and lists one line per customer. **Check every line against the document** before you continue. Excel is always more reliable.

## Settings for the weekly run (`config.json`)

| Setting | Meaning |
|---|---|
| `dataFile` | Which customer list to read |
| `contactsFile` | Optional extra file with phone and email |
| `senderName`, `company` | Who signs the messages |
| `days` | Days covered per run (10 = Monday to next Wednesday) |
| `remindDays` | Days of notice (3) |
| `cardLang` | `all` (English + Malay + Chinese, default), `both` (English + Malay), `en`, `ms` or `zh` |

## Useful commands

- Make this week's list now: double-click **`run-weekly.cmd`**
- Test a specific date: `run-weekly.cmd --date=2026-11-23`
- Run the checks: `node tests\run-test.js` (36 checks, including your real file)
- Stop the Monday run: `Unregister-ScheduledTask -TaskName "BirthdayBeat weekly" -Confirm:$false`

## Online version (for the team, on any phone or PC)

Link: https://claude.ai/artifact/XmSEiFf1FEyzF5bf1VQPry

- It is **private** until you share it. To give teammates access, use the page's **Share** menu on claude.ai. They need to sign in to claude.ai.
- It opens with **example customers** (fictional, with no phone numbers) so people can see how it works. Loading your Excel list replaces them.
- **Customer data stays on each person's own device** (in that browser). Nothing is uploaded to the page, and teammates never see each other's lists. Each person loads their own Excel file.
- **Download PDF list**, **Save image** and the **contacts template** ask you to confirm before saving the file.
- **Differences from the desktop version:** it cannot read photos (PNG/JPG), so use Excel or CSV. The PDF is made of page images: copy messages from the app, not from this PDF. Email buttons may not open your email app from inside claude.ai; if nothing happens, copy the message and the address instead.
- The automatic Monday PDF still runs on this PC only.
