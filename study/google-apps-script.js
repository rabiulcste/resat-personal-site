const OWNER_EMAIL = 'resat.amin@gmail.com';
const GOOGLE_MEET_LINK = 'PASTE_YOUR_GOOGLE_MEET_LINK_HERE';
const ADMIN_KEY = 'CHANGE_THIS_PRIVATE_ADMIN_KEY';
const SCRIPT_VERSION = '2026-07-13-admin-date-blocking';
const STUDY_TIME_ZONE = 'Europe/Amsterdam';

const SHEET_REQUESTS = 'Requests';
const SHEET_APPROVED = 'Approved regulars';
const SHEET_BLOCKED = 'Blocked slots';
const MAX_SEATS_PER_SLOT = 3;
const REQUEST_HEADERS = [
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
  'approvedAt',
  'reminderSentAt'
];
const SLOT_TIME_KEYS = {
  '11:00 AM - 12:45 PM': '11:00-12:45',
  '1:00 PM - 3:45 PM': '13:00-15:45',
  '3:45 PM - 4:30 PM': '15:45-16:30'
};
const BLOCKED_HEADERS = ['type', 'key', 'label', 'active', 'note'];
const DEFAULT_BLOCKED_ROWS = [
  ['date', '2026-07-06', 'Monday, July 6', 'yes', 'Closed for now'],
  ['date', '2026-07-27', 'Monday, July 27', 'yes', 'Closed for now'],
  ['slot', '2026-07-07__15:45-16:30', 'Tuesday, July 7, 3:45 PM - 4:30 PM', 'yes', 'Closed for now']
];
const MONTH_NUMBERS = {
  january: '01',
  february: '02',
  march: '03',
  april: '04',
  may: '05',
  june: '06',
  july: '07',
  august: '08',
  september: '09',
  october: '10',
  november: '11',
  december: '12'
};

function doPost(event) {
  const data = JSON.parse(event.postData.contents);
  const email = String(data.email || '').trim().toLowerCase();
  const requestId = Utilities.getUuid();
  const createdAt = new Date();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const requests = getRequestsSheet_(ss);

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
    '',
    ''
  ]);

  if (isSlotFull_(ss, data.slotKey)) {
    markRequest_(ss, requestId, 'full');
    sendFullEmail_(email, data.name, data.slot, data.localSlot, data.visitorTimeZone, data.slotKey);
    return json_({ ok: true, status: 'full' });
  }

  if (isApprovedRegular_(ss, email)) {
    markRequest_(ss, requestId, 'auto-approved');
    sendMeetLink_(email, data.name, data.slot, data.localSlot, data.visitorTimeZone, data.slotKey);
    return json_({ ok: true, status: 'auto-approved' });
  }

  sendApprovalEmail_(requestId, data);
  return json_({ ok: true, status: 'pending' });
}

function doGet(event) {
  const action = event.parameter.action;
  const requestId = event.parameter.id;

  if (action === 'availability') {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const blocked = getBlockedAvailability_(ss);
    const payload = {
      ok: true,
      booked: getBookedCounts_(ss),
      blockedDates: blocked.dates,
      blockedSlots: blocked.slots
    };
    return event.parameter.callback ? javascript_(event.parameter.callback, payload) : json_(payload);
  }

  if (action === 'availability-debug') {
    const payload = Object.assign({ ok: true }, getAvailabilityDebug_(SpreadsheetApp.getActiveSpreadsheet()));
    return event.parameter.callback ? javascript_(event.parameter.callback, payload) : json_(payload);
  }

  if (action === 'admin') {
    return adminView_(event.parameter.key);
  }

  if (action === 'admin-block-date') {
    return updateAdminBlockedDate_(event.parameter.key, event.parameter.date, true);
  }

  if (action === 'admin-open-date') {
    return updateAdminBlockedDate_(event.parameter.key, event.parameter.date, false);
  }

  if (action === 'reminder-debug') {
    if (event.parameter.key !== ADMIN_KEY || ADMIN_KEY === 'CHANGE_THIS_PRIVATE_ADMIN_KEY') {
      return json_({ ok: false, error: 'locked' });
    }

    return json_(Object.assign({ ok: true }, getReminderDebug_(SpreadsheetApp.getActiveSpreadsheet())));
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
  sendMeetLink_(request.email, request.name, request.slot, request.localSlot, request.visitorTimeZone, request.slotKey);

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
    body: `Hi,\n\nThank you for your interest. It looks like your request may have been declined because some of the questions were not answered clearly or completely.\n\nYou may try booking a slot again, but please answer the questions clearly next time.\n\nResat`
  });

  return HtmlService.createHtmlOutput(`Declined ${request.name}.`);
}

function sendApprovalEmail_(requestId, data) {
  const baseUrl = ScriptApp.getService().getUrl();
  const approveUrl = `${baseUrl}?action=approve&id=${encodeURIComponent(requestId)}`;
  const declineUrl = `${baseUrl}?action=decline&id=${encodeURIComponent(requestId)}`;
  const localTime = formatLocalTimeForEmail_(data.localSlot, data.visitorTimeZone, data.slotKey);
  const htmlBody = `
    <p><strong>${escape_(data.name)}</strong> requested a study room seat.</p>
    <p><strong>Slot:</strong> ${escape_(data.slot)} Netherlands time<br>
    <strong>Seats left:</strong> ${escape_(getSeatsLeft_(SpreadsheetApp.getActiveSpreadsheet(), data.slotKey))}<br>
    <strong>Their local time:</strong> ${escape_(localTime)}<br>
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
    body: `Study room request from ${data.name} (${data.email})\n\nSlot: ${data.slot}\nLocal time: ${localTime}\nFrequency: ${data.frequency}\n\nWork:\n${data.work}\n\nWhy:\n${data.why}\n\nApprove: ${approveUrl}\nDecline: ${declineUrl}`
  });
}

function sendMeetLink_(email, name, slot, localSlot, visitorTimeZone, slotKey) {
  const localTime = formatLocalTimeForEmail_(localSlot, visitorTimeZone, slotKey);
  MailApp.sendEmail({
    to: email,
    subject: 'Your study room link',
    body: `Hi ${name || 'there'},\n\nYou are approved for the study room.\n\nSlot: ${slot} Netherlands time\nYour local time: ${localTime}\n\nGoogle Meet link:\n${GOOGLE_MEET_LINK}\n\nIf you change your plan, please let me know in advance so I can offer the slot to someone else.\n\nSee you there,\nResat`
  });
}

function sendFullEmail_(email, name, slot, localSlot, visitorTimeZone, slotKey) {
  const localTime = formatLocalTimeForEmail_(localSlot, visitorTimeZone, slotKey);
  MailApp.sendEmail({
    to: email,
    subject: 'Study room slot is full',
    body: `Hi ${name || 'there'},\n\nThanks for requesting the study room.\n\nThis slot is already full:\n${slot} Netherlands time\nYour local time: ${localTime}\n\nPlease choose another slot.\n\nResat`
  });
}

function formatLocalTimeForEmail_(localSlot, visitorTimeZone, slotKey) {
  const cleanLocalSlot = String(localSlot || '').trim();
  const cleanTimeZone = String(visitorTimeZone || '').trim();
  const looksLikeSlotKey = /^\d{4}-\d{2}-\d{2}__\d{2}:\d{2}-\d{2}:\d{2}$/.test(cleanLocalSlot);
  const safeSlotKey = String(slotKey || '').trim() || (looksLikeSlotKey ? cleanLocalSlot : '');

  if (cleanLocalSlot && !looksLikeSlotKey) {
    if (cleanTimeZone && !cleanLocalSlot.includes(cleanTimeZone)) {
      return `${cleanLocalSlot} (${cleanTimeZone})`;
    }

    return cleanLocalSlot;
  }

  if (safeSlotKey && cleanTimeZone) {
    return formatSlotKeyForTimeZone_(safeSlotKey, cleanTimeZone);
  }

  if (safeSlotKey) {
    return `Could not read visitor timezone; ${formatSlotKeyForTimeZone_(safeSlotKey, STUDY_TIME_ZONE)}`;
  }

  return cleanTimeZone ? `Timezone: ${cleanTimeZone}` : 'Not provided by browser';
}

function formatSlotKeyForTimeZone_(slotKey, timeZone) {
  const range = slotRangeFromKey_(slotKey);

  if (!range) return `Timezone: ${timeZone}`;

  const date = Utilities.formatDate(range.start, timeZone, 'EEEE, MMMM d');
  const start = Utilities.formatDate(range.start, timeZone, 'h:mm a');
  const end = Utilities.formatDate(range.end, timeZone, 'h:mm a');
  const zoneLabel = friendlyTimeZoneLabel_(timeZone);

  return `${date}, ${start} - ${end} (${zoneLabel})`;
}

function friendlyTimeZoneLabel_(timeZone) {
  const city = String(timeZone || '').split('/').pop().replace(/_/g, ' ');

  if (!city || city === 'UTC') return timeZone;

  return `${city} time, ${timeZone}`;
}

function setupStudyReminderTrigger() {
  ScriptApp.getProjectTriggers()
    .filter((trigger) => trigger.getHandlerFunction() === 'sendStudyReminders')
    .forEach((trigger) => ScriptApp.deleteTrigger(trigger));

  ScriptApp.newTrigger('sendStudyReminders')
    .timeBased()
    .everyMinutes(5)
    .create();
}

function sendStudyReminders() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = getRequestsSheet_(ss);
  const values = sheet.getDataRange().getValues();

  if (values.length < 2) return;

  const headers = values[0];
  const indexes = {
    status: headers.indexOf('status'),
    name: headers.indexOf('name'),
    email: headers.indexOf('email'),
    slot: headers.indexOf('slot'),
    slotKey: headers.indexOf('slotKey'),
    localSlot: headers.indexOf('localSlot'),
    visitorTimeZone: headers.indexOf('visitorTimeZone'),
    reminderSentAt: headers.indexOf('reminderSentAt')
  };

  if (indexes.reminderSentAt < 0) return;

  const now = new Date();

  values.slice(1).forEach((row, index) => {
    const status = normalizeStatus_(row[indexes.status]);
    const reminderSentAt = row[indexes.reminderSentAt];
    const slotKey = getRowSlotKey_(row, indexes.slotKey, indexes.slot);

    if (!['approved', 'auto-approved'].includes(status)) return;
    if (reminderSentAt) return;
    if (!slotKey || !shouldSendReminder_(slotKey, now)) return;

    sendReminderEmail_({
      email: row[indexes.email],
      name: row[indexes.name],
      slot: row[indexes.slot],
      localSlot: row[indexes.localSlot],
      visitorTimeZone: indexes.visitorTimeZone >= 0 ? row[indexes.visitorTimeZone] : '',
      slotKey
    });

    sheet.getRange(index + 2, indexes.reminderSentAt + 1).setValue(now);
  });
}

function sendReminderEmail_(request) {
  const localTime = formatLocalTimeForEmail_(request.localSlot, request.visitorTimeZone, request.slotKey);
  MailApp.sendEmail({
    to: request.email,
    subject: 'Study room reminder',
    body: `Hi ${request.name || 'there'},\n\nA small reminder that your study room starts in about 30 minutes.\n\nSlot: ${request.slot} Netherlands time\nYour local time: ${localTime}\n\nGoogle Meet link:\n${GOOGLE_MEET_LINK}\n\nSee you soon,\nResat`
  });
}

function shouldSendReminder_(slotKey, now) {
  const slotStart = slotStartFromKey_(slotKey);

  if (!slotStart) return false;

  const minutesUntilStart = (slotStart.getTime() - now.getTime()) / 60000;
  return minutesUntilStart > 0 && minutesUntilStart <= 30;
}

function slotStartFromKey_(slotKey) {
  const range = slotRangeFromKey_(slotKey);

  return range ? range.start : null;
}

function slotRangeFromKey_(slotKey) {
  const match = String(slotKey || '').match(/^(\d{4})-(\d{2})-(\d{2})__(\d{2}):(\d{2})-\d{2}:\d{2}$/);

  if (!match) return null;

  const endMatch = String(slotKey || '').match(/-(\d{2}):(\d{2})$/);
  const dateParts = {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3])
  };

  return {
    start: zonedTimeToDate_(Object.assign({}, dateParts, {
    hour: Number(match[4]),
    minute: Number(match[5])
    }), STUDY_TIME_ZONE),
    end: zonedTimeToDate_(Object.assign({}, dateParts, {
      hour: Number(endMatch[1]),
      minute: Number(endMatch[2])
    }), STUDY_TIME_ZONE)
  };
}

function zonedTimeToDate_(dateParts, timeZone) {
  const wanted = Date.UTC(
    dateParts.year,
    dateParts.month - 1,
    dateParts.day,
    dateParts.hour,
    dateParts.minute
  );
  let utcGuess = wanted;

  for (let index = 0; index < 3; index += 1) {
    const actual = getZonedParts_(new Date(utcGuess), timeZone);
    const actualAsUtc = Date.UTC(
      actual.year,
      actual.month - 1,
      actual.day,
      actual.hour,
      actual.minute
    );
    utcGuess -= actualAsUtc - wanted;
  }

  return new Date(utcGuess);
}

function getZonedParts_(date, timeZone) {
  const parts = Utilities.formatDate(date, timeZone, 'yyyy,MM,dd,HH,mm').split(',').map(Number);

  return {
    year: parts[0],
    month: parts[1],
    day: parts[2],
    hour: parts[3],
    minute: parts[4]
  };
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

function getRequestsSheet_(ss) {
  return getSheet_(ss, SHEET_REQUESTS, REQUEST_HEADERS);
}

function getBlockedSheet_(ss) {
  const sheet = getSheet_(ss, SHEET_BLOCKED, BLOCKED_HEADERS);

  if (sheet.getLastRow() < 2) {
    DEFAULT_BLOCKED_ROWS.forEach((row) => sheet.appendRow(row));
  }

  return sheet;
}

function findRequest_(ss, requestId) {
  const sheet = getRequestsSheet_(ss);
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
  const sheet = getRequestsSheet_(ss);
  const values = sheet.getDataRange().getValues();
  const headers = values[0];
  const idIndex = headers.indexOf('requestId');
  const statusIndex = headers.indexOf('status');
  const approvedAtIndex = headers.indexOf('approvedAt');

  for (let row = 1; row < values.length; row += 1) {
    if (values[row][idIndex] === requestId) {
      sheet.getRange(row + 1, statusIndex + 1).setValue(status);
      if (approvedAtIndex >= 0 && ['approved', 'auto-approved'].includes(normalizeStatus_(status))) {
        sheet.getRange(row + 1, approvedAtIndex + 1).setValue(new Date());
      }
      return;
    }
  }
}

function getBookedCounts_(ss) {
  const sheet = getRequestsSheet_(ss);
  const values = sheet.getDataRange().getValues();

  if (values.length < 2) return {};

  const headers = values[0];
  const slotKeyIndex = headers.indexOf('slotKey');
  const slotIndex = headers.indexOf('slot');
  const statusIndex = headers.indexOf('status');
  const counts = {};

  values.slice(1).forEach((row) => {
    const status = normalizeStatus_(row[statusIndex]);
    const slotKey = getRowSlotKey_(row, slotKeyIndex, slotIndex);

    if (slotKey && ['approved', 'auto-approved'].includes(status)) {
      counts[slotKey] = (counts[slotKey] || 0) + 1;
    }
  });

  return counts;
}

function getBlockedAvailability_(ss) {
  const sheet = getBlockedSheet_(ss);
  const values = sheet.getDataRange().getValues();

  if (values.length < 2) return { dates: [], slots: [] };

  const headers = values[0];
  const typeIndex = headers.indexOf('type');
  const keyIndex = headers.indexOf('key');
  const activeIndex = headers.indexOf('active');
  const dates = [];
  const slots = [];

  values.slice(1).forEach((row) => {
    const type = String(row[typeIndex] || '').trim().toLowerCase();
    const key = normalizeBlockedKey_(row[keyIndex], type);
    const active = String(row[activeIndex] || '').trim().toLowerCase();

    if (!key || ['no', 'false', 'inactive', 'off'].includes(active)) return;
    if (type === 'date') dates.push(key);
    if (type === 'slot') slots.push(key);
  });

  return { dates, slots };
}

function normalizeBlockedKey_(value, type) {
  if (type === 'date' && Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value)) {
    return Utilities.formatDate(value, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }

  return String(value || '').trim();
}

function updateAdminBlockedDate_(key, dateKey, shouldBlock) {
  if (key !== ADMIN_KEY || ADMIN_KEY === 'CHANGE_THIS_PRIVATE_ADMIN_KEY') {
    return adminView_(key);
  }

  const cleanDateKey = String(dateKey || '').trim();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(cleanDateKey)) {
    return adminView_(key, 'I could not read that date. Please use the date picker.');
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const label = setBlockedDate_(ss, cleanDateKey, shouldBlock);
  const notice = shouldBlock
    ? `${label} is closed now.`
    : `${label} is open again.`;

  return adminView_(key, notice);
}

function setBlockedDate_(ss, dateKey, shouldBlock) {
  const sheet = getBlockedSheet_(ss);
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const indexes = {
    type: headers.indexOf('type'),
    key: headers.indexOf('key'),
    label: headers.indexOf('label'),
    active: headers.indexOf('active'),
    note: headers.indexOf('note')
  };
  const label = formatDateLabelFromKey_(dateKey);
  const active = shouldBlock ? 'yes' : 'no';
  const note = shouldBlock ? 'Closed from admin page' : 'Opened from admin page';
  const values = sheet.getDataRange().getValues();

  for (let rowIndex = 1; rowIndex < values.length; rowIndex += 1) {
    const row = values[rowIndex];
    const type = String(row[indexes.type] || '').trim().toLowerCase();
    const key = normalizeBlockedKey_(row[indexes.key], type);

    if (type === 'date' && key === dateKey) {
      sheet.getRange(rowIndex + 1, indexes.label + 1).setValue(label);
      sheet.getRange(rowIndex + 1, indexes.active + 1).setValue(active);
      sheet.getRange(rowIndex + 1, indexes.note + 1).setValue(note);
      return label;
    }
  }

  sheet.appendRow(['date', dateKey, label, active, note]);
  return label;
}

function formatDateLabelFromKey_(dateKey) {
  const match = String(dateKey || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (!match) return dateKey;

  const date = zonedTimeToDate_({
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
    hour: 12,
    minute: 0
  }, STUDY_TIME_ZONE);

  return Utilities.formatDate(date, STUDY_TIME_ZONE, 'EEEE, MMMM d');
}

function adminView_(key, notice) {
  if (key !== ADMIN_KEY || ADMIN_KEY === 'CHANGE_THIS_PRIVATE_ADMIN_KEY') {
    return HtmlService
      .createHtmlOutput('<h1>Private study room list</h1><p>This admin link is locked. Add your private ADMIN_KEY in the script first.</p>')
      .setTitle('Study room admin');
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const roster = getAdminRoster_(ss);
  const blocked = getBlockedAvailability_(ss);
  const dates = Object.keys(roster).sort();
  const firstDate = dates[0] || '';
  const rosterJson = JSON.stringify(roster).replace(/</g, '\\u003c');
  const datesJson = JSON.stringify(dates).replace(/</g, '\\u003c');
  const blockedDatesJson = JSON.stringify(blocked.dates).replace(/</g, '\\u003c');
  const baseUrl = ScriptApp.getService().getUrl();
  const closedDateControls = blocked.dates.length
    ? blocked.dates.sort().map((dateKey) => `
        <form method="get" action="${baseUrl}" class="pill-form">
          <input type="hidden" name="action" value="admin-open-date">
          <input type="hidden" name="key" value="${escape_(key)}">
          <input type="hidden" name="date" value="${escape_(dateKey)}">
          <span>${escape_(formatDateLabelFromKey_(dateKey))}</span>
          <button type="submit">Open</button>
        </form>
      `).join('')
    : '<p class="muted">No closed dates right now.</p>';

  const html = `
    <!doctype html>
    <html>
    <head>
      <base target="_top">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <style>
        body {
          margin: 0;
          padding: 28px;
          color: #24352b;
          background: #f8fbf6;
          font-family: Arial, sans-serif;
        }
        main {
          max-width: 980px;
          margin: 0 auto;
        }
        h1 {
          margin: 0 0 8px;
          font-size: 30px;
        }
        p {
          color: #607066;
        }
        .admin-card {
          margin: 18px 0;
          padding: 18px;
          background: #ffffff;
          border: 1px solid #d7e4d6;
          border-radius: 16px;
        }
        .admin-card h2 {
          margin: 0 0 10px;
          font-size: 20px;
        }
        .closure-grid {
          display: grid;
          grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
          gap: 14px;
        }
        .date-form {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
          align-items: center;
        }
        input[type="date"] {
          min-height: 40px;
          padding: 8px 10px;
          color: #24352b;
          background: #f8fbf6;
          border: 1px solid #d7e4d6;
          border-radius: 10px;
          font: inherit;
        }
        .pill-list {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
        }
        .pill-form {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 7px 8px 7px 12px;
          background: #f8fbf6;
          border: 1px solid #d7e4d6;
          border-radius: 999px;
          font-weight: 700;
        }
        .pill-form button {
          padding: 7px 10px;
          font-size: 13px;
        }
        .notice {
          margin: 16px 0 0;
          padding: 12px 14px;
          color: #24352b;
          background: #e6f1e6;
          border: 1px solid #bfd5bf;
          border-radius: 12px;
          font-weight: 700;
        }
        .muted {
          margin: 0;
          color: #607066;
        }
        .date-buttons {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
          margin: 24px 0;
        }
        button {
          padding: 10px 14px;
          color: #24352b;
          background: #ffffff;
          border: 1px solid #d7e4d6;
          border-radius: 999px;
          cursor: pointer;
          font: inherit;
          font-weight: 700;
        }
        button[aria-pressed="true"] {
          color: #ffffff;
          background: #477652;
          border-color: #477652;
        }
        .date-buttons button.is-closed {
          border-color: #9e4962;
        }
        .date-buttons button.is-closed::after {
          content: " closed";
          font-size: 12px;
          color: inherit;
          opacity: 0.78;
        }
        .slot {
          margin: 14px 0;
          padding: 16px;
          background: #ffffff;
          border: 1px solid #d7e4d6;
          border-radius: 14px;
        }
        .slot-meta {
          margin: 6px 0 0;
          font-size: 13px;
        }
        .status-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
          gap: 12px;
          margin-top: 14px;
        }
        .status-box {
          padding: 12px;
          background: #f8fbf6;
          border: 1px solid #d7e4d6;
          border-radius: 12px;
        }
        .status-title {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          margin: 0;
          font-size: 14px;
          text-transform: capitalize;
        }
        .count {
          min-width: 1.8rem;
          padding: 2px 7px;
          color: #ffffff;
          background: #477652;
          border-radius: 999px;
          text-align: center;
        }
        h2, h3 {
          margin: 0;
        }
        h3 {
          font-size: 18px;
        }
        ul {
          margin: 12px 0 0;
          padding-left: 20px;
        }
        li {
          margin: 8px 0;
        }
        small {
          display: block;
          color: #607066;
        }
        .answer {
          margin-top: 5px;
        }
        .empty {
          padding: 18px;
          background: #ffffff;
          border: 1px dashed #b9cab8;
          border-radius: 14px;
        }
        @media (max-width: 720px) {
          body {
            padding: 18px;
          }
          .closure-grid {
            grid-template-columns: 1fr;
          }
        }
      </style>
    </head>
    <body>
      <main>
        <h1>Study room admin</h1>
        <p>Click a date to see approved, pending, declined, and auto-approved requests. This page is private; do not share the link.</p>
        ${notice ? `<div class="notice">${escape_(notice)}</div>` : ''}
        <section class="admin-card">
          <div class="closure-grid">
            <div>
              <h2>Close a date</h2>
              <form method="get" action="${baseUrl}" class="date-form">
                <input type="hidden" name="action" value="admin-block-date">
                <input type="hidden" name="key" value="${escape_(key)}">
                <input type="date" name="date" required>
                <button type="submit">Close date</button>
              </form>
            </div>
            <div>
              <h2>Closed dates</h2>
              <div class="pill-list">${closedDateControls}</div>
            </div>
          </div>
        </section>
        <div class="date-buttons" id="date-buttons"></div>
        <section id="date-panel"></section>
      </main>
      <script>
        const roster = ${rosterJson};
        const dates = ${datesJson};
        const blockedDates = new Set(${blockedDatesJson});
        const firstDate = ${JSON.stringify(firstDate)};
        const buttons = document.getElementById('date-buttons');
        const panel = document.getElementById('date-panel');

        function showDate(dateKey) {
          buttons.querySelectorAll('button').forEach((button) => {
            button.setAttribute('aria-pressed', button.dataset.date === dateKey ? 'true' : 'false');
          });

          const day = roster[dateKey];
          if (!day) {
            panel.innerHTML = '<div class="empty">No approved people for this date yet.</div>';
            return;
          }

          const slots = day.slots.map((slot) => {
            const statuses = ['pending', 'approved', 'auto-approved', 'declined', 'full'];
            const groups = statuses.map((status) => {
              const people = slot.people[status] || [];
              const rows = people.length
                ? '<ul>' + people.map((person) => '<li><strong>' + person.name + '</strong><small>' + person.email + '</small><small>' + person.frequency + '</small><small class="answer">Work: ' + person.work + '</small><small class="answer">Why: ' + person.why + '</small></li>').join('') + '</ul>'
                : '<p>None</p>';
              return '<section class="status-box"><h4 class="status-title">' + status.replace('-', ' ') + '<span class="count">' + people.length + '</span></h4>' + rows + '</section>';
            }).join('');
            return '<article class="slot"><h3>' + slot.time + '</h3><p class="slot-meta">' + slot.total + ' request(s) for this slot</p><div class="status-grid">' + groups + '</div></article>';
          }).join('');

          panel.innerHTML = '<h2>' + day.label + '</h2>' + slots;
        }

        if (dates.length === 0) {
          buttons.innerHTML = '';
          panel.innerHTML = '<div class="empty">No requests yet.</div>';
        } else {
          buttons.innerHTML = dates.map((dateKey) => {
            const closedClass = blockedDates.has(dateKey) ? ' class="is-closed"' : '';
            return '<button type="button" data-date="' + dateKey + '"' + closedClass + '>' + roster[dateKey].label + '</button>';
          }).join('');
          buttons.addEventListener('click', (event) => {
            const button = event.target.closest('button');
            if (button) showDate(button.dataset.date);
          });
          showDate(firstDate);
        }
      </script>
    </body>
    </html>
  `;

  return HtmlService.createHtmlOutput(html).setTitle('Study room admin');
}

function getAdminRoster_(ss) {
  const sheet = getRequestsSheet_(ss);
  const values = sheet.getDataRange().getValues();

  if (values.length < 2) return {};

  const headers = values[0];
  const nameIndex = headers.indexOf('name');
  const emailIndex = headers.indexOf('email');
  const slotIndex = headers.indexOf('slot');
  const slotKeyIndex = headers.indexOf('slotKey');
  const statusIndex = headers.indexOf('status');
  const frequencyIndex = headers.indexOf('frequency');
  const workIndex = headers.indexOf('work');
  const whyIndex = headers.indexOf('why');
  const roster = {};

  values.slice(1).forEach((row) => {
    const status = normalizeStatus_(row[statusIndex]);
    const group = status || 'pending';

    const slotKey = getRowSlotKey_(row, slotKeyIndex, slotIndex);
    if (!slotKey) return;

    const dateKey = slotKey.split('__')[0];
    const slotLabel = getSlotLabel_(slotKey, String(row[slotIndex] || '').trim());

    if (!roster[dateKey]) {
      roster[dateKey] = {
        label: getDateLabelFromSlot_(String(row[slotIndex] || '').trim(), dateKey),
        slots: []
      };
    }

    let slot = roster[dateKey].slots.find((item) => item.time === slotLabel);
    if (!slot) {
      slot = {
        time: slotLabel,
        total: 0,
        people: {
          pending: [],
          approved: [],
          'auto-approved': [],
          declined: [],
          full: []
        }
      };
      roster[dateKey].slots.push(slot);
    }

    if (!slot.people[group]) slot.people[group] = [];
    slot.total += 1;
    slot.people[group].push({
      name: escape_(row[nameIndex] || 'Unnamed'),
      email: escape_(row[emailIndex] || ''),
      frequency: escape_(row[frequencyIndex] || ''),
      work: escape_(row[workIndex] || ''),
      why: escape_(row[whyIndex] || '')
    });
  });

  Object.keys(roster).forEach((dateKey) => {
    roster[dateKey].slots.sort((first, second) => slotSortValue_(first.time) - slotSortValue_(second.time));
  });

  return roster;
}

function getDateLabelFromSlot_(slot, dateKey) {
  const match = slot.match(/^([A-Za-z]+,\s+[A-Za-z]+\s+\d{1,2})/);

  if (match) return match[1];

  return dateKey;
}

function getSlotLabel_(slotKey, slot) {
  const match = slot.match(/^[A-Za-z]+,\s+[A-Za-z]+\s+\d{1,2},\s+(.+)$/);

  if (match) return match[1];

  return slotKey.split('__')[1] || slotKey;
}

function slotSortValue_(time) {
  if (time.indexOf('11:00') === 0) return 1;
  if (time.indexOf('1:00') === 0) return 2;
  if (time.indexOf('3:45') === 0) return 3;
  return 99;
}

function getAvailabilityDebug_(ss) {
  const sheet = getRequestsSheet_(ss);
  const values = sheet.getDataRange().getValues();
  const headers = values[0] || [];
  const slotKeyIndex = headers.indexOf('slotKey');
  const slotIndex = headers.indexOf('slot');
  const statusIndex = headers.indexOf('status');
  const reminderSentAtIndex = headers.indexOf('reminderSentAt');
  const statusCounts = {};
  const approvedSlotKeys = [];
  const approvedRowsMissingSlotKey = [];

  values.slice(1).forEach((row) => {
    const status = normalizeStatus_(row[statusIndex]);
    const rawSlotKey = String(row[slotKeyIndex] || '').trim();
    const slotKey = getRowSlotKey_(row, slotKeyIndex, slotIndex);

    statusCounts[status || 'blank'] = (statusCounts[status || 'blank'] || 0) + 1;
    if (slotKey && ['approved', 'auto-approved'].includes(status) && approvedSlotKeys.length < 10) {
      approvedSlotKeys.push(slotKey);
    }
    if (!rawSlotKey && ['approved', 'auto-approved'].includes(status) && approvedRowsMissingSlotKey.length < 10) {
      approvedRowsMissingSlotKey.push(String(row[slotIndex] || '').trim());
    }
  });

  return {
    scriptVersion: SCRIPT_VERSION,
    sheetName: sheet.getName(),
    rows: Math.max(values.length - 1, 0),
    headersPresent: REQUEST_HEADERS.every((header) => headers.includes(header)),
    hasSlotKeyHeader: slotKeyIndex >= 0,
    hasStatusHeader: statusIndex >= 0,
    hasReminderSentAtHeader: reminderSentAtIndex >= 0,
    statusCounts,
    approvedSlotKeys,
    approvedRowsMissingSlotKey,
    blocked: getBlockedAvailability_(ss),
    booked: getBookedCounts_(ss)
  };
}

function getReminderDebug_(ss) {
  const sheet = getRequestsSheet_(ss);
  const values = sheet.getDataRange().getValues();
  const headers = values[0] || [];
  const indexes = {
    status: headers.indexOf('status'),
    name: headers.indexOf('name'),
    email: headers.indexOf('email'),
    slot: headers.indexOf('slot'),
    slotKey: headers.indexOf('slotKey'),
    reminderSentAt: headers.indexOf('reminderSentAt')
  };
  const now = new Date();
  const rows = [];
  let eligibleCount = 0;

  values.slice(1).forEach((row) => {
    const status = normalizeStatus_(row[indexes.status]);
    const reminderSentAt = indexes.reminderSentAt >= 0 ? row[indexes.reminderSentAt] : '';
    const slotKey = getRowSlotKey_(row, indexes.slotKey, indexes.slot);
    const slotStart = slotStartFromKey_(slotKey);
    const minutesUntilStart = slotStart ? Math.round((slotStart.getTime() - now.getTime()) / 60000) : null;
    const eligible = ['approved', 'auto-approved'].includes(status)
      && !reminderSentAt
      && minutesUntilStart !== null
      && minutesUntilStart > 0
      && minutesUntilStart <= 30;

    if (eligible) eligibleCount += 1;

    if (['approved', 'auto-approved'].includes(status) && rows.length < 12) {
      rows.push({
        name: row[indexes.name],
        email: row[indexes.email],
        status,
        slot: row[indexes.slot],
        slotKey,
        minutesUntilStart,
        reminderSent: Boolean(reminderSentAt),
        eligible
      });
    }
  });

  return {
    scriptVersion: SCRIPT_VERSION,
    now: Utilities.formatDate(now, STUDY_TIME_ZONE, 'yyyy-MM-dd HH:mm z'),
    scriptTimeZone: Session.getScriptTimeZone(),
    studyTimeZone: STUDY_TIME_ZONE,
    hasReminderSentAtHeader: indexes.reminderSentAt >= 0,
    eligibleCount,
    rows
  };
}

function getRowSlotKey_(row, slotKeyIndex, slotIndex) {
  const rawSlotKey = String(row[slotKeyIndex] || '').trim();

  if (rawSlotKey) return rawSlotKey;

  return slotToSlotKey_(String(row[slotIndex] || '').trim());
}

function slotToSlotKey_(slot) {
  const match = slot.match(/^[A-Za-z]+,\s+([A-Za-z]+)\s+(\d{1,2}),\s+(.+)$/);

  if (!match) return '';

  const month = MONTH_NUMBERS[match[1].toLowerCase()];
  const day = String(match[2]).padStart(2, '0');
  const timeKey = SLOT_TIME_KEYS[match[3].trim()];

  if (!month || !timeKey) return '';

  return `2026-${month}-${day}__${timeKey}`;
}

function normalizeStatus_(status) {
  return String(status || '').trim().toLowerCase();
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
