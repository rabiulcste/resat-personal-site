document.getElementById('year').textContent = new Date().getFullYear();

const requestPanel = document.getElementById('request');
const requestForm = document.getElementById('request-form');
const selectedSlotText = document.getElementById('selected-slot-text');
const clearRequestButton = document.getElementById('clear-request');
const slotList = document.getElementById('slot-list');
const netherlandsTimeZone = 'Europe/Amsterdam';
const scheduleEnd = { year: 2026, month: 8, day: 15 };
const studyDays = [
  { label: 'Monday', index: 1 },
  { label: 'Tuesday', index: 2 },
  { label: 'Wednesday', index: 3 }
];
const studySlots = [
  { label: 'morning room', start: '11:00', end: '12:45', display: '11:00 AM - 12:45 PM' },
  { label: 'afternoon room', start: '13:00', end: '15:45', display: '1:00 PM - 3:45 PM' },
  { label: 'short room', start: '15:45', end: '16:30', display: '3:45 PM - 4:30 PM' }
];
let selectedSlot = '';
let selectedLocalSlot = '';

const visitorTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || '';

function getZonedParts(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(date);

  return Object.fromEntries(parts.filter((part) => part.type !== 'literal').map((part) => [part.type, Number(part.value)]));
}

function compareDateParts(firstDate, secondDate) {
  const first = Date.UTC(firstDate.year, firstDate.month - 1, firstDate.day);
  const second = Date.UTC(secondDate.year, secondDate.month - 1, secondDate.day);
  return first - second;
}

function datePartsFromUtcDate(date) {
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate()
  };
}

function netherlandsTimeToDate(dateParts, time) {
  const [hour, minute] = time.split(':').map(Number);
  const wanted = Date.UTC(dateParts.year, dateParts.month - 1, dateParts.day, hour, minute);
  let utcGuess = wanted;

  for (let i = 0; i < 3; i += 1) {
    const actual = getZonedParts(new Date(utcGuess), netherlandsTimeZone);
    const actualAsUtc = Date.UTC(actual.year, actual.month - 1, actual.day, actual.hour, actual.minute);
    utcGuess -= actualAsUtc - wanted;
  }

  return new Date(utcGuess);
}

function formatNetherlandsDate(dateParts) {
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC'
  }).format(new Date(Date.UTC(dateParts.year, dateParts.month - 1, dateParts.day, 12)));
}

function formatSlotTime(startDate, endDate) {
  const timeFormatter = new Intl.DateTimeFormat([], {
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short'
  });
  return `${timeFormatter.format(startDate)} - ${timeFormatter.format(endDate)}`;
}

function formatLocalDateTime(startDate, endDate) {
  const dateFormatter = new Intl.DateTimeFormat([], {
    weekday: 'short',
    month: 'short',
    day: 'numeric'
  });
  return `${dateFormatter.format(startDate)}, ${formatSlotTime(startDate, endDate)}`;
}

function createSlotItem(dateParts, slot) {
  const startDate = netherlandsTimeToDate(dateParts, slot.start);
  const endDate = netherlandsTimeToDate(dateParts, slot.end);
  const netherlandsDate = formatNetherlandsDate(dateParts);
  const netherlandsSlot = `${netherlandsDate}, ${slot.display}`;
  const localSlot = formatLocalDateTime(startDate, endDate);
  const slotItem = document.createElement('div');
  slotItem.className = 'slot-item';
  slotItem.dataset.slot = netherlandsSlot;
  slotItem.dataset.localSlot = localSlot;
  slotItem.innerHTML = `
    <div>
      <span class="slot-date">${netherlandsDate}</span>
      <span class="slot-time">${slot.display}</span>
      <span class="slot-label">${slot.label}</span>
      <span class="slot-local">Your time: ${localSlot}</span>
    </div>
    <button class="slot-request" type="button">Request this slot</button>
  `;
  return slotItem;
}

function renderSlots() {
  const today = getZonedParts(new Date(), netherlandsTimeZone);
  const cursor = new Date(Date.UTC(today.year, today.month - 1, today.day, 12));
  const fragment = document.createDocumentFragment();

  while (compareDateParts(datePartsFromUtcDate(cursor), scheduleEnd) <= 0) {
    const dateParts = datePartsFromUtcDate(cursor);

    if (studyDays.some((day) => day.index === cursor.getUTCDay())) {
      studySlots.forEach((slot) => {
        fragment.appendChild(createSlotItem(dateParts, slot));
      });
    }

    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  if (fragment.childNodes.length === 0) {
    slotList.innerHTML = '<p class="slot-empty">No upcoming study sessions are listed yet.</p>';
    return;
  }

  slotList.replaceChildren(fragment);
}

renderSlots();

slotList.addEventListener('click', (event) => {
  const button = event.target.closest('.slot-request');

  if (button) {
    const slotItem = button.closest('.slot-item');
    selectedSlot = slotItem.dataset.slot;
    selectedLocalSlot = slotItem.dataset.localSlot || '';
    selectedSlotText.textContent = selectedLocalSlot
      ? `${selectedSlot} Netherlands time · ${selectedLocalSlot} your time`
      : selectedSlot;
    requestPanel.hidden = false;
    requestPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    requestForm.elements.name.focus();
  }
});

clearRequestButton.addEventListener('click', () => {
  selectedSlot = '';
  selectedLocalSlot = '';
  selectedSlotText.textContent = 'Choose a slot above';
  requestPanel.hidden = true;
  document.getElementById('book').scrollIntoView({ behavior: 'smooth', block: 'start' });
});

requestForm.addEventListener('submit', (event) => {
  event.preventDefault();

  if (!selectedSlot) {
    requestPanel.hidden = true;
    document.getElementById('book').scrollIntoView({ behavior: 'smooth', block: 'start' });
    return;
  }

  const formData = new FormData(requestForm);
  const subject = `Study Room Request - ${selectedSlot}`;
  const body = [
    'Hi Resat,',
    '',
    'I would like to request a seat in the study room.',
    '',
    `Slot: ${selectedSlot} Netherlands time`,
    selectedLocalSlot ? `Visitor local time: ${selectedLocalSlot}${visitorTimeZone ? ` (${visitorTimeZone})` : ''}` : '',
    `Name: ${formData.get('name')}`,
    `Email: ${formData.get('email')}`,
    `How often they want to join: ${formData.get('frequency')}`,
    '',
    'What I will work on:',
    formData.get('work'),
    '',
    'Why I want to join:',
    formData.get('why'),
    '',
    'Thank you!'
  ].join('\n');

  window.location.href = `mailto:resat.amin@gmail.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
});
