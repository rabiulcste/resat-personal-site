document.getElementById('year').textContent = new Date().getFullYear();

const requestPanel = document.getElementById('request');
const requestForm = document.getElementById('request-form');
const selectedSlotText = document.getElementById('selected-slot-text');
const clearRequestButton = document.getElementById('clear-request');
const netherlandsTimeZone = 'Europe/Amsterdam';
const studyDays = [
  { label: 'Monday', short: 'Mon', index: 1 },
  { label: 'Tuesday', short: 'Tue', index: 2 },
  { label: 'Wednesday', short: 'Wed', index: 3 }
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

function getNetherlandsDateForWeekday(weekdayIndex) {
  const today = getZonedParts(new Date(), netherlandsTimeZone);
  const todayAtNoonUtc = new Date(Date.UTC(today.year, today.month - 1, today.day, 12));
  const todayWeekdayIndex = todayAtNoonUtc.getUTCDay();
  const daysUntil = (weekdayIndex - todayWeekdayIndex + 7) % 7;
  const target = new Date(todayAtNoonUtc);
  target.setUTCDate(target.getUTCDate() + daysUntil);

  return {
    year: target.getUTCFullYear(),
    month: target.getUTCMonth() + 1,
    day: target.getUTCDate()
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

function formatLocalSlot(startDate, endDate) {
  const timeFormatter = new Intl.DateTimeFormat([], {
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short'
  });
  return `${timeFormatter.format(startDate)} - ${timeFormatter.format(endDate)}`;
}

function formatLocalDays(localDates) {
  const dayFormatter = new Intl.DateTimeFormat([], { weekday: 'short' });
  const days = localDates.map((date) => dayFormatter.format(date));
  const uniqueDays = [...new Set(days)];

  return uniqueDays.length === studyDays.length ? uniqueDays.join(', ') : uniqueDays.join(' / ');
}

function updateLocalSlotTimes() {
  document.querySelectorAll('.slot-item').forEach((slotItem) => {
    const localSlots = studyDays.map((day) => {
      const dateParts = getNetherlandsDateForWeekday(day.index);
      const startDate = netherlandsTimeToDate(dateParts, slotItem.dataset.start);
      const endDate = netherlandsTimeToDate(dateParts, slotItem.dataset.end);
      return { startDate, endDate };
    });
    const sameTimeText = formatLocalSlot(localSlots[0].startDate, localSlots[0].endDate);
    const localDays = formatLocalDays(localSlots.map((slot) => slot.startDate));
    const localText = `Your time: ${localDays}, ${sameTimeText}`;

    slotItem.dataset.localSlot = localText.replace('Your time: ', '');
    slotItem.querySelector('.slot-local').textContent = localText;
  });
}

updateLocalSlotTimes();

document.querySelectorAll('.slot-request').forEach((button) => {
  button.addEventListener('click', () => {
    selectedSlot = button.dataset.slot;
    selectedLocalSlot = button.closest('.slot-item').dataset.localSlot || '';
    selectedSlotText.textContent = selectedLocalSlot
      ? `${selectedSlot} Netherlands time · ${selectedLocalSlot} your time`
      : `${selectedSlot} · Monday, Tuesday, or Wednesday`;
    requestPanel.hidden = false;
    requestPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    requestForm.elements.name.focus();
  });
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
    `Slot: ${selectedSlot} on Monday, Tuesday, or Wednesday, Netherlands time`,
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
