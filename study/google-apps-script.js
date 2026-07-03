const OWNER_EMAIL = 'resat.amin@gmail.com';
const GOOGLE_MEET_LINK = 'PASTE_YOUR_GOOGLE_MEET_LINK_HERE';

const SHEET_REQUESTS = 'Requests';
const SHEET_APPROVED = 'Approved regulars';
const MAX_SEATS_PER_SLOT = 3;

function doPost(event) {
  const data = JSON.parse(event.postData.contents);
  const email = String(data.email || '').trim().toLowerCase();
  const requestId = Utilities.getUuid();
  const createdAt = new Date();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const requests = getSheet_(ss, SHEET_REQUESTS, [
    'createdAt',
    'requestId',
    'status',
    'name',
    'email',
    'slot',
    'slotKey',
    'localSlot',
    'visitorTimeZone',
    'frequency',
    'work',
    'why',
    'approvedAt'
  ]);

  requests.appendRow([
    createdAt,
    requestId,
    'pending',
    data.name,
    email,
    data.slot,
    data.slotKey,
    data.localSlot,
    data.visitorTimeZone,
    data.frequency,
    data.work,
    data.why,
    ''
  ]);

  if (isSlotFull_(ss, data.slotKey)) {
    markRequest_(ss, requestId, 'full');
    sendFullEmail_(email, data.name, data.slot, data.localSlot);
    return json_({ ok: true, status: 'full' });
  }

  if (isApprovedRegular_(ss, email)) {
    markRequest_(ss, requestId, 'auto-approved');
    sendMeetLink_(email, data.name, data.slot, data.localSlot);
    return json_({ ok: true, status: 'auto-approved' });
  }

  sendApprovalEmail_(requestId, data);
  return json_({ ok: true, status: 'pending' });
}

function doGet(event) {
  const action = event.parameter.action;
  const requestId = event.parameter.id;

  if (action === 'availability') {
    const payload = { ok: true, booked: getBookedCounts_(SpreadsheetApp.getActiveSpreadsheet()) };
    return event.parameter.callback ? javascript_(event.parameter.callback, payload) : json_(payload);
  }

  if (action === 'approve') {
    return approveRequest_(requestId);
  }

  if (action === 'decline') {
    return declineRequest_(requestId);
  }

  return HtmlService.createHtmlOutput('This study room approval link is working.');
}

function approveRequest_(requestId) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const request = findRequest_(ss, requestId);

  if (!request) {
    return HtmlService.createHtmlOutput('Request not found.');
  }

  if (isSlotFull_(ss, request.slotKey)) {
    markRequest_(ss, requestId, 'full');
    return HtmlService.createHtmlOutput('This slot is already booked. No link was sent.');
  }

  markRequest_(ss, requestId, 'approved');
  sendMeetLink_(request.email, request.name, request.slot, request.localSlot);

  if (isRegularAccess_(request.frequency)) {
    addApprovedRegular_(ss, request.email, request.name);
  }

  return HtmlService.createHtmlOutput(`Approved ${request.name}. The Google Meet link has been sent.`);
}

function declineRequest_(requestId) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const request = findRequest_(ss, requestId);

  if (!request) {
    return HtmlService.createHtmlOutput('Request not found.');
  }

  markRequest_(ss, requestId, 'declined');
  MailApp.sendEmail({
    to: request.email,
    subject: 'Study room request',
    body: `Hi ${request.name || 'there'},\n\nThank you for your note. I cannot add you to this study room session right now.\n\nResat`
  });

  return HtmlService.createHtmlOutput(`Declined ${request.name}.`);
}

function sendApprovalEmail_(requestId, data) {
  const baseUrl = ScriptApp.getService().getUrl();
  const approveUrl = `${baseUrl}?action=approve&id=${encodeURIComponent(requestId)}`;
  const declineUrl = `${baseUrl}?action=decline&id=${encodeURIComponent(requestId)}`;
  const htmlBody = `
    <p><strong>${escape_(data.name)}</strong> requested a study room seat.</p>
    <p><strong>Slot:</strong> ${escape_(data.slot)} Netherlands time<br>
    <strong>Seats left:</strong> ${escape_(getSeatsLeft_(SpreadsheetApp.getActiveSpreadsheet(), data.slotKey))}<br>
    <strong>Their local time:</strong> ${escape_(data.localSlot || '')}<br>
    <strong>Email:</strong> ${escape_(data.email)}<br>
    <strong>Frequency:</strong> ${escape_(data.frequency)}</p>
    <p><strong>Work:</strong><br>${escape_(data.work)}</p>
    <p><strong>Why:</strong><br>${escape_(data.why)}</p>
    <p>
      <a href="${approveUrl}" style="display:inline-block;padding:10px 14px;background:#477652;color:#ffffff;text-decoration:none;border-radius:8px;">Approve</a>
      <a href="${declineUrl}" style="display:inline-block;padding:10px 14px;background:#9e4962;color:#ffffff;text-decoration:none;border-radius:8px;margin-left:8px;">Decline</a>
    </p>
  `;

  MailApp.sendEmail({
    to: OWNER_EMAIL,
    subject: `Study room request: ${data.slot}`,
    htmlBody,
    body: `Study room request from ${data.name} (${data.email})\n\nSlot: ${data.slot}\nLocal time: ${data.localSlot}\nFrequency: ${data.frequency}\n\nWork:\n${data.work}\n\nWhy:\n${data.why}\n\nApprove: ${approveUrl}\nDecline: ${declineUrl}`
  });
}

function sendMeetLink_(email, name, slot, localSlot) {
  MailApp.sendEmail({
    to: email,
    subject: 'Your study room link',
    body: `Hi ${name || 'there'},\n\nYou are approved for the study room.\n\nSlot: ${slot} Netherlands time\nYour local time: ${localSlot || ''}\n\nGoogle Meet link:\n${GOOGLE_MEET_LINK}\n\nSee you there,\nResat`
  });
}

function sendFullEmail_(email, name, slot, localSlot) {
  MailApp.sendEmail({
    to: email,
    subject: 'Study room slot is full',
    body: `Hi ${name || 'there'},\n\nThanks for requesting the study room.\n\nThis slot is already full:\n${slot} Netherlands time\nYour local time: ${localSlot || ''}\n\nPlease choose another slot.\n\nResat`
  });
}

function isRegularAccess_(frequency) {
  return ['This same slot regularly', 'All available sessions when I can'].includes(frequency);
}

function getSheet_(ss, name, headers) {
  let sheet = ss.getSheetByName(name);

  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.appendRow(headers);
  } else if (headers.length > 0) {
    const existingHeaders = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), 1)).getValues()[0];
    headers.forEach((header) => {
      if (!existingHeaders.includes(header)) {
        sheet.getRange(1, sheet.getLastColumn() + 1).setValue(header);
      }
    });
  }

  return sheet;
}

function findRequest_(ss, requestId) {
  const sheet = getSheet_(ss, SHEET_REQUESTS, []);
  const values = sheet.getDataRange().getValues();
  const headers = values[0];
  const idIndex = headers.indexOf('requestId');

  for (let row = 1; row < values.length; row += 1) {
    if (values[row][idIndex] === requestId) {
      return Object.fromEntries(headers.map((header, index) => [header, values[row][index]]));
    }
  }

  return null;
}

function markRequest_(ss, requestId, status) {
  const sheet = getSheet_(ss, SHEET_REQUESTS, []);
  const values = sheet.getDataRange().getValues();
  const headers = values[0];
  const idIndex = headers.indexOf('requestId');
  const statusIndex = headers.indexOf('status');
  const approvedAtIndex = headers.indexOf('approvedAt');

  for (let row = 1; row < values.length; row += 1) {
    if (values[row][idIndex] === requestId) {
      sheet.getRange(row + 1, statusIndex + 1).setValue(status);
      sheet.getRange(row + 1, approvedAtIndex + 1).setValue(new Date());
      return;
    }
  }
}

function getBookedCounts_(ss) {
  const sheet = getSheet_(ss, SHEET_REQUESTS, []);
  const values = sheet.getDataRange().getValues();

  if (values.length < 2) return {};

  const headers = values[0];
  const slotKeyIndex = headers.indexOf('slotKey');
  const statusIndex = headers.indexOf('status');
  const counts = {};

  values.slice(1).forEach((row) => {
    const status = row[statusIndex];
    const slotKey = row[slotKeyIndex];

    if (slotKey && ['approved', 'auto-approved'].includes(status)) {
      counts[slotKey] = (counts[slotKey] || 0) + 1;
    }
  });

  return counts;
}

function getSeatsLeft_(ss, slotKey) {
  return Math.max(MAX_SEATS_PER_SLOT - (getBookedCounts_(ss)[slotKey] || 0), 0);
}

function isSlotFull_(ss, slotKey) {
  if (!slotKey) return false;
  return getSeatsLeft_(ss, slotKey) <= 0;
}

function isApprovedRegular_(ss, email) {
  const sheet = getSheet_(ss, SHEET_APPROVED, ['email', 'name', 'approvedAt']);
  const values = sheet.getDataRange().getValues();
  return values.slice(1).some((row) => String(row[0]).trim().toLowerCase() === email);
}

function addApprovedRegular_(ss, email, name) {
  if (isApprovedRegular_(ss, email)) return;
  const sheet = getSheet_(ss, SHEET_APPROVED, ['email', 'name', 'approvedAt']);
  sheet.appendRow([email, name, new Date()]);
}

function json_(value) {
  return ContentService
    .createTextOutput(JSON.stringify(value))
    .setMimeType(ContentService.MimeType.JSON);
}

function javascript_(callback, value) {
  const safeCallback = String(callback || '').replace(/[^\w.$]/g, '');
  return ContentService
    .createTextOutput(`${safeCallback}(${JSON.stringify(value)});`)
    .setMimeType(ContentService.MimeType.JAVASCRIPT);
}

function escape_(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
    .replace(/\n/g, '<br>');
}
