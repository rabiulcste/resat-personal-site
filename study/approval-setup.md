# Study Room Approval Setup

This makes the flow work like this:

1. Someone chooses a dated study room session on the website.
2. They send the request form.
3. The request is saved in Google Sheets.
4. You receive an email with Approve and Decline buttons.
5. If you approve, the person automatically receives the Google Meet link.
6. If they asked for regular access, their email is saved as approved. Next time they request, the link is sent automatically.
7. Each slot allows 3 approved people. After that, the website can show the slot as booked.

## What You Need

- One Google Sheet.
- One Google Apps Script attached to that sheet.
- One Google Meet link.
- The Apps Script Web App URL.

## Step 1: Create The Sheet

1. Go to Google Sheets.
2. Create a new spreadsheet.
3. Name it `Study Room Requests`.

The script will create the needed tabs automatically.

## Step 2: Add The Script

1. In the Google Sheet, click `Extensions`.
2. Click `Apps Script`.
3. Delete the starter code.
4. Paste everything from `study/google-apps-script.js`.
5. At the top, replace:

```js
const GOOGLE_MEET_LINK = 'PASTE_YOUR_GOOGLE_MEET_LINK_HERE';
```

with your real Google Meet link.

6. Click Save.

## Step 3: Deploy It

1. In Apps Script, click `Deploy`.
2. Click `New deployment`.
3. Choose type: `Web app`.
4. Set `Execute as` to `Me`.
5. Set `Who has access` to `Anyone`.
6. Click `Deploy`.
7. Google will ask for permissions. Approve them.
8. Copy the Web App URL.

## Step 4: Send The URL To Codex

Send me the Web App URL. I will put it into `study/script.js` here:

```js
const requestEndpoint = '';
```

After that, the website form will stop using email drafts and will send requests into the approval system.

## Updating The Script Later

If this repository changes `study/google-apps-script.js`, paste the updated code into Apps Script again and deploy a new version. Google does not update the deployed Web App from GitHub automatically.
