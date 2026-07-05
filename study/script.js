document.getElementById('year').textContent = new Date().getFullYear();

const requestPanel = document.getElementById('request');
const requestForm = document.getElementById('request-form');
const selectedSlotText = document.getElementById('selected-slot-text');
const clearRequestButton = document.getElementById('clear-request');
const formStatus = document.getElementById('form-status');
const dayPicker = document.getElementById('day-picker');
const slotList = document.getElementById('slot-list');
const slotPopupTitle = document.getElementById('slot-popup-title');
const slotPopupOptions = document.getElementById('slot-popup-options');
const slotPopupClose = document.getElementById('slot-popup-close');
const studyVideo = document.getElementById('study-video');
const requestEndpoint = 'https://script.google.com/macros/s/AKfycbygIDz4Q7D47BH3XbFcDnNaKUc7BNzhJFTinYs027wkvHCr7Wrf9AkHewS5jEcrk_v4cA/exec';
const availabilityEndpoint = '/study-availability';
const maxSeatsPerSlot = 3;
const netherlandsTimeZone = 'Europe/Amsterdam';
const calendarStart = { year: 2026, month: 7, day: 1 };
const scheduleEnd = { year: 2026, month: 7, day: 31 };
const fallbackBlockedDates = ['2026-07-06'];
const fallbackBlockedSlotKeys = ['2026-07-07__15:45-16:30'];
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
let selectedSlotKey = '';
let sessionsByDate = [];
let availabilityBySlot = {};
let blockedDates = new Set(fallbackBlockedDates);
let blockedSlotKeys = new Set(fallbackBlockedSlotKeys);
let availabilityStatus = requestEndpoint ? 'loading' : 'ready';

const visitorTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || '';

if (studyVideo) {
  studyVideo.muted = true;
  studyVideo.volume = 0;
  studyVideo.addEventListener('volumechange', () => {
    studyVideo.muted = true;
    studyVideo.volume = 0;
  });
}

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

function formatCalendarHeading(dateParts) {
  const date = new Date(Date.UTC(dateParts.year, dateParts.month - 1, dateParts.day, 12));
  const monthDay = new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC'
  }).format(date);
  const weekday = new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    timeZone: 'UTC'
  }).format(date);

  return `${monthDay} -- ${weekday}`;
}

function formatNetherlandsDateShort(dateParts) {
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC'
  }).format(new Date(Date.UTC(dateParts.year, dateParts.month - 1, dateParts.day, 12)));
}

function getCalendarLabel(dateParts) {
  const date = new Date(Date.UTC(dateParts.year, dateParts.month - 1, dateParts.day, 12));
  return {
    weekday: new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: 'UTC' }).format(date),
    month: new Intl.DateTimeFormat('en-US', { month: 'short', timeZone: 'UTC' }).format(date),
    day: new Intl.DateTimeFormat('en-US', { day: 'numeric', timeZone: 'UTC' }).format(date)
  };
}

function getDateKey(dateParts) {
  return `${dateParts.year}-${String(dateParts.month).padStart(2, '0')}-${String(dateParts.day).padStart(2, '0')}`;
}

function getSlotKey(dateParts, slot) {
  return `${getDateKey(dateParts)}__${slot.start}-${slot.end}`;
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

function getCapacityLabel(slotKey) {
  if (blockedSlotKeys.has(slotKey)) return 'closed';
  if (availabilityStatus === 'loading') return 'checking';
  if (availabilityStatus === 'error') return 'refresh';

  const booked = availabilityBySlot[slotKey] || 0;
  const left = Math.max(maxSeatsPerSlot - booked, 0);

  if (left === 0) return 'booked';
  if (left === 1) return '1 left';
  return `${left} left`;
}

function createSlotItem(dateParts, slot) {
  const startDate = netherlandsTimeToDate(dateParts, slot.start);
  const endDate = netherlandsTimeToDate(dateParts, slot.end);
  const netherlandsDate = formatNetherlandsDate(dateParts);
  const netherlandsSlot = `${netherlandsDate}, ${slot.display}`;
  const localSlot = formatLocalDateTime(startDate, endDate);
  const slotKey = getSlotKey(dateParts, slot);
  const capacityLabel = getCapacityLabel(slotKey);
  const isClosed = blockedSlotKeys.has(slotKey);
  const isBooked = capacityLabel === 'booked';
  const isPending = ['checking', 'refresh'].includes(capacityLabel);
  const isUnavailable = isBooked || isClosed || isPending;
  const slotItem = document.createElement('div');
  slotItem.className = `slot-item${isUnavailable ? ' is-booked' : ''}`;
  slotItem.dataset.slot = netherlandsSlot;
  slotItem.dataset.localSlot = localSlot;
  slotItem.dataset.slotKey = slotKey;
  slotItem.innerHTML = `
    <div>
      <span class="slot-time">${slot.display}</span>
      <span class="slot-label">${slot.label}</span>
      <span class="slot-local">Your time: ${localSlot}</span>
      <span class="slot-capacity">${capacityLabel}</span>
    </div>
    <button class="slot-request" type="button" ${isUnavailable ? 'disabled' : ''}>${isClosed ? 'Closed' : isBooked ? 'Booked' : isPending ? 'Please refresh' : 'Request this slot'}</button>
  `;
  return slotItem;
}

function getUpcomingSessionDays() {
  const today = getZonedParts(new Date(), netherlandsTimeZone);
  const startDate = compareDateParts(today, calendarStart) > 0 ? today : calendarStart;
  const cursor = new Date(Date.UTC(calendarStart.year, calendarStart.month - 1, calendarStart.day, 12));
  const sessionDays = [];

  while (compareDateParts(datePartsFromUtcDate(cursor), scheduleEnd) <= 0) {
    const dateParts = datePartsFromUtcDate(cursor);
    const key = getDateKey(dateParts);
    const isAvailableDay = studyDays.some((day) => day.index === cursor.getUTCDay());
    const isPast = compareDateParts(dateParts, startDate) < 0;

    if (isAvailableDay && !isPast) {
      sessionDays.push({
        key,
        dateParts,
        calendar: getCalendarLabel(dateParts),
        heading: formatCalendarHeading(dateParts),
        label: formatNetherlandsDateShort(dateParts),
        fullLabel: formatNetherlandsDate(dateParts),
        hasSessions: !blockedDates.has(key)
      });
    }

    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return sessionDays;
}

function renderDayPicker() {
  if (sessionsByDate.length === 0) {
    dayPicker.innerHTML = '';
    return;
  }

  const fragment = document.createDocumentFragment();

  sessionsByDate.forEach((sessionDay) => {
    const dateCard = document.createElement('button');
    dateCard.className = `day-card${sessionDay.hasSessions ? '' : ' is-closed'}`;
    dateCard.type = 'button';
    dateCard.disabled = !sessionDay.hasSessions;
    dateCard.dataset.dateKey = sessionDay.key;
    dateCard.setAttribute('aria-label', `${sessionDay.fullLabel}, ${sessionDay.hasSessions ? 'choose time' : 'closed for now'}`);

    const header = document.createElement('div');
    header.className = 'day-heading';
    header.innerHTML = `
      <span class="day-weekday">${sessionDay.calendar.weekday}</span>
      <span class="day-date"><span>${sessionDay.calendar.month}</span> ${sessionDay.calendar.day}</span>
      <span class="day-title">${sessionDay.heading}</span>
      <span class="day-tap">${sessionDay.hasSessions ? 'Pick a time' : 'Closed for now'}</span>
    `;
    dateCard.appendChild(header);

    fragment.appendChild(dateCard);
  });

  dayPicker.replaceChildren(fragment);
}

function renderSchedule() {
  sessionsByDate = getUpcomingSessionDays();
  renderDayPicker();
}

renderSchedule();

function applyAvailabilityData(data) {
  availabilityBySlot = data.booked || {};
  availabilityStatus = 'ready';
  if (Array.isArray(data.blockedDates)) blockedDates = new Set(data.blockedDates);
  if (Array.isArray(data.blockedSlots)) blockedSlotKeys = new Set(data.blockedSlots);
  renderDayPicker();
}

function markAvailabilityError() {
  availabilityBySlot = {};
  availabilityStatus = 'error';
  renderDayPicker();
}

async function fetchAvailabilityJson(url) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetch(`${url}?action=availability&cache=${Date.now()}`, {
      cache: 'no-store',
      signal: controller.signal
    });

    if (!response.ok) throw new Error('Availability request failed');
    return response.json();
  } finally {
    window.clearTimeout(timeout);
  }
}

function fetchAvailabilityJsonp() {
  const callbackName = `studyAvailability${Date.now()}`;
  const script = document.createElement('script');
  let timeout;

  return new Promise((resolve, reject) => {
    const cleanup = () => {
      window.clearTimeout(timeout);
      delete window[callbackName];
      script.remove();
    };
    timeout = window.setTimeout(() => {
      cleanup();
      reject(new Error('Availability timed out'));
    }, 8000);

    window[callbackName] = (data) => {
      cleanup();
      resolve(data);
    };

    script.src = `${requestEndpoint}?action=availability&callback=${callbackName}&cache=${Date.now()}`;
    script.onerror = () => {
      cleanup();
      reject(new Error('Availability script failed'));
    };
    document.head.appendChild(script);
  });
}

async function refreshAvailability() {
  if (!requestEndpoint) return;

  availabilityStatus = 'loading';
  renderDayPicker();

  try {
    applyAvailabilityData(await fetchAvailabilityJson(availabilityEndpoint));
    return;
  } catch (error) {
    try {
      applyAvailabilityData(await fetchAvailabilityJson(requestEndpoint));
      return;
    } catch (fallbackError) {
      try {
        applyAvailabilityData(await fetchAvailabilityJsonp());
        return;
      } catch (jsonpError) {
        markAvailabilityError();
      }
    }
  }
}

refreshAvailability();

dayPicker.addEventListener('click', (event) => {
  const dateCard = event.target.closest('.day-card');

  if (!dateCard) return;
  if (dateCard.disabled) return;

  openSlotPopup(dateCard.dataset.dateKey);
});

slotList.addEventListener('click', (event) => {
  handleSlotClick(event);
});

slotPopupClose.addEventListener('click', () => {
  slotList.hidden = true;
});

function openSlotPopup(dateKey) {
  const sessionDay = sessionsByDate.find((day) => day.key === dateKey);

  if (!sessionDay) return;

  dayPicker.querySelectorAll('.day-card').forEach((card) => {
    card.setAttribute('aria-pressed', card.dataset.dateKey === dateKey ? 'true' : 'false');
  });

  slotPopupTitle.textContent = sessionDay.heading;
  slotPopupOptions.replaceChildren(...studySlots.map((slot) => createSlotItem(sessionDay.dateParts, slot)));
  slotList.hidden = false;
  slotList.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function handleSlotClick(event) {
  const button = event.target.closest('.slot-request');

  if (button) {
    const slotItem = button.closest('.slot-item');
    if (button.disabled || slotItem.classList.contains('is-booked')) return;
    selectedSlot = slotItem.dataset.slot;
    selectedLocalSlot = slotItem.dataset.localSlot || '';
    selectedSlotKey = slotItem.dataset.slotKey || '';
    selectedSlotText.textContent = selectedLocalSlot
      ? `${selectedSlot} Netherlands time · ${selectedLocalSlot} your time`
      : selectedSlot;
    requestPanel.hidden = false;
    requestPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    requestForm.elements.name.focus();
  }
}

clearRequestButton.addEventListener('click', () => {
  selectedSlot = '';
  selectedLocalSlot = '';
  selectedSlotKey = '';
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
  const payload = {
    slot: selectedSlot,
    slotKey: selectedSlotKey,
    localSlot: selectedLocalSlot,
    visitorTimeZone,
    name: formData.get('name'),
    email: formData.get('email'),
    work: formData.get('work'),
    frequency: formData.get('frequency'),
    why: formData.get('why')
  };

  if (!requestEndpoint) {
    const subject = `Study Room Request - ${selectedSlot}`;
    const body = [
      'Hi Resat,',
      '',
      'I would like to request a seat in the study room.',
      '',
      `Slot: ${payload.slot} Netherlands time`,
      payload.localSlot ? `Visitor local time: ${payload.localSlot}${visitorTimeZone ? ` (${visitorTimeZone})` : ''}` : '',
      `Name: ${payload.name}`,
      `Email: ${payload.email}`,
      `How often they want to join: ${payload.frequency}`,
      '',
      'What I will work on:',
      payload.work,
      '',
      'Why I want to join:',
      payload.why,
      '',
      'Thank you!'
    ].join('\n');

    window.location.href = `mailto:resat.amin@gmail.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    return;
  }

  formStatus.textContent = 'Sending your request...';
  requestForm.querySelector('button[type="submit"]').disabled = true;

  fetch(requestEndpoint, {
    method: 'POST',
    mode: 'no-cors',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(payload)
  })
    .then(() => {
      formStatus.textContent = 'Request sent. If you are already approved, the room link will come automatically.';
      requestForm.reset();
      refreshAvailability();
    })
    .catch(() => {
      formStatus.textContent = 'Something went wrong. Please try again in a moment.';
    })
    .finally(() => {
      requestForm.querySelector('button[type="submit"]').disabled = false;
    });
});
