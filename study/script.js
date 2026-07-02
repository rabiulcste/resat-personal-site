document.getElementById('year').textContent = new Date().getFullYear();

const requestPanel = document.getElementById('request');
const requestForm = document.getElementById('request-form');
const selectedSlotText = document.getElementById('selected-slot-text');
const clearRequestButton = document.getElementById('clear-request');
let selectedSlot = '';

document.querySelectorAll('.slot-request').forEach((button) => {
  button.addEventListener('click', () => {
    selectedSlot = button.dataset.slot;
    selectedSlotText.textContent = `${selectedSlot} · Monday, Tuesday, or Wednesday`;
    requestPanel.hidden = false;
    requestPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    requestForm.elements.name.focus();
  });
});

clearRequestButton.addEventListener('click', () => {
  selectedSlot = '';
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
