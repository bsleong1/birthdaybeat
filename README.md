# BirthdayBeat

**Never miss a customer birthday.** BirthdayBeat reads your customer list and shows whose birthday is coming up. For each one it drafts a wish in **English, Bahasa Melayu and 中文**, with a matching birthday card image, ready to copy into WhatsApp or email.

It never sends anything by itself. You check each message and press Send.

**▶ Open the app: https://bsleong1.github.io/birthdaybeat/** (works on phone and PC; your customer data stays in your own browser).

## What it does

- **Weekly reminder.** Every Monday it lists the birthdays for the next 10 days, so each one shows up at least **3 days ahead**.
- **Ready-to-send wishes.** Three wordings per language, signed with your name (or the customer's account manager).
- **Birthday card image** (1080 × 1080 PNG) in English, Malay and Chinese.
- **PDF list** of the week's birthdays, with cards and messages.
- **Works on a phone.** The layout adapts to small screens, and WhatsApp links open with the message already typed.
- **Handles messy data safely.** It never guesses:
  - Missing, unreadable or ambiguous birthdays (is 03/04 3 April or 4 March?) go to a **Needs checking** list.
  - Duplicate rows are merged.
  - Bad phone numbers and emails are flagged.
  - 29 February birthdays are celebrated on 28 February in non-leap years.
- **Sensitive cases are held back.** Customers with a policy status of "Terminated (Death)" never appear in the send list until someone has checked them.

## Quick start

**The app (any browser, PC or phone):** open `index.html` and load your Excel or CSV customer list. Column names don't need to match exactly. These are recognised: Customer Name / Policy Holder, Birthday / DOB / Date of Birth, Phone / Mobile, Email, Company, Account Manager.

**The automatic weekly PDF (Windows):**
1. Install [Node.js](https://nodejs.org) and Microsoft Edge. Edge comes with Windows.
2. Copy `config.example.json` to `config.json`. Set `"dataFile"` to your customer list, and `"senderName"` to your name.
3. Run `run-weekly.cmd` once to test it. The PDF and card images appear in `output\<date>\`.
4. To run it every Monday at 8 am, run this in PowerShell: `powershell -ExecutionPolicy Bypass -File install-weekly-task.ps1`.

The full guide is in [HOW-TO-USE.md](HOW-TO-USE.md).

## Privacy

- **The app stores customer data only in your own browser.** Nothing is uploaded.
- **The weekly job writes only to the local `output` folder.**
- **`.gitignore` keeps customer data out of the repository:** spreadsheets, PDFs, the `output` folder and your personal `config.json`.

## Tests

```
node tests/run-test.js
```

The tests use fictional, deliberately messy data. If `config.json` points at your own list, they also check that list: they go through every row by hand and confirm the app misses no one. Nothing from your list is printed.

## Files

| File | Purpose |
|---|---|
| `index.html`, `app.js`, `styles.css` | The app |
| `core.js` | Shared logic: reading lists, dates, messages, card, PDF layout |
| `online.html` | Version of the app for hosting as a web page |
| `weekly.js`, `run-weekly.cmd`, `install-weekly-task.ps1` | Automatic weekly PDF |
| `lib/xlsx.full.min.js` | [SheetJS](https://sheetjs.com) Community Edition (Apache 2.0) for reading Excel files |
