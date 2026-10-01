// Business details that change: edit these and the whole page follows.
const EMAIL = 'admin@cbmarqueecharacters.ca';
const PRICE_PER_CHARACTER = 50;
const DELIVERY_FEE = 25;
const ALLOWED = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789&#';
const LETTER_PHOTOS = 'ABCDEGILMNOPRSVW'; // one file per letter in images/letters/
const LONG_WORD = 7;

const marquee = document.getElementById('marquee');
const input = document.getElementById('preview-input');
const summary = document.getElementById('preview-summary');
const request = document.getElementById('preview-request');
const form = document.getElementById('preview-form');
const strip = document.getElementById('letter-strip');

const allowed = new Set(ALLOWED);

function clean(value) {
  return [...value.toUpperCase()]
    .filter((ch) => allowed.has(ch) || ch === ' ')
    .join('')
    .replace(/\s+/g, ' ')
    .trimStart();
}

function render(word) {
  marquee.replaceChildren(
    ...[...word].map((ch, i) => {
      const span = document.createElement('span');
      span.className = ch === ' ' ? 'bulb-char is-space' : 'bulb-char';
      span.style.setProperty('--i', i);
      span.textContent = ch;
      return span;
    })
  );
  marquee.classList.toggle('is-long', word.length > LONG_WORD);

  const count = word.replace(/ /g, '').length;
  if (count === 0) {
    summary.textContent = 'Type a word, a name or a number.';
    request.href = `mailto:${EMAIL}`;
    return;
  }
  const noun = count === 1 ? 'character' : 'characters';
  const total = count * PRICE_PER_CHARACTER + DELIVERY_FEE;
  summary.textContent = `${count} ${noun} · about $${total} plus HST, including delivery, set-up and pick-up.`;
  const subject = encodeURIComponent(`Marquee letters request: ${word.trim()}`);
  request.href = `mailto:${EMAIL}?subject=${subject}`;
}

input.addEventListener('input', () => {
  const word = clean(input.value);
  if (word !== input.value) input.value = word;
  render(word);
});

form.addEventListener('submit', (event) => {
  event.preventDefault();
  request.click();
});

strip.replaceChildren(
  ...[...LETTER_PHOTOS].map((ch) => {
    const li = document.createElement('li');
    const img = document.createElement('img');
    img.src = `images/letters/${ch}.webp`;
    img.alt = `Marquee letter ${ch}`;
    img.width = 420;
    img.height = 560;
    img.loading = 'lazy';
    li.append(img);
    return li;
  })
);

document.getElementById('year').textContent = new Date().getFullYear();
render(clean(input.value));

// Report lead clicks (call, email, letter request) to Google Analytics.
function trackLead(type, label) {
  if (typeof gtag !== 'function') return;
  gtag('event', 'contact_click', { contact_type: type, contact_label: label });
}

document.querySelectorAll('a[href^="tel:"]').forEach((a) => {
  a.addEventListener('click', () => trackLead('phone', a.textContent.trim()));
});
document.querySelectorAll('a[href^="mailto:"]').forEach((a) => {
  a.addEventListener('click', () => trackLead(a.id === 'preview-request' ? 'request' : 'email', a.textContent.trim()));
});
