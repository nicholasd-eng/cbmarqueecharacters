// Business details that change: edit these and the whole page follows.
const EMAIL = 'admin@cbmarqueecharacters.ca';
const PRICE_PER_CHARACTER = 45;
const PREMIUM_CHARACTERS = 'EKMQSVX01'; // $50 each
const PREMIUM_PRICE = 50;
const AMPERSAND_PRICE = 55;
function priceFor(ch) {
  if (ch === '&') return AMPERSAND_PRICE;
  if (PREMIUM_CHARACTERS.includes(ch)) return PREMIUM_PRICE;
  return PRICE_PER_CHARACTER;
}
const DELIVERY_FEE = 25;
const ALLOWED = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const LETTER_PHOTOS = 'ABCDEGILMNOPRSVW'; // one file per letter in images/letters/
const IMAGE_HEIGHT_IN = 57;   // every render is 47 in of letter plus 5 in of air top and bottom
const GAP_IN = 3;              // air left between letters after the overlap
let metrics = {};              // from images/3d/metrics.json: width_in and file per character

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

function heightIn(ch) {
  const m = metrics[ch];
  return (m && m.height_in) || (ch >= '0' && ch <= '9' ? 47 : 35.5);
}

function fitRow(word) {
  const chars = [...word];
  const inches = chars.reduce((sum, ch) => sum + (ch === ' ' ? 14 : ((metrics[ch] && metrics[ch].width_in) || 27) + GAP_IN), 0) + 6;
  const available = marquee.clientWidth || 600;
  const maxH = Math.min(420, window.innerHeight * 0.45);
  marquee.style.setProperty('--row-h', `${Math.max(90, Math.min(maxH, (available / inches) * IMAGE_HEIGHT_IN))}px`);
}

function render(word) {
  fitRow(word);
  marquee.replaceChildren(
    ...[...word].map((ch, i) => {
      if (ch === ' ') {
        const gap = document.createElement('span');
        gap.className = 'is-space';
        return gap;
      }
      const img = document.createElement('img');
      const m = metrics[ch];
      img.src = `images/3d/${m ? m.file : (ch >= '0' && ch <= '9' ? 'digit' + ch : ch) + '.webp'}`;
      img.alt = ch;
      img.style.setProperty('--i', i);
      img.style.setProperty('--h-in', heightIn(ch) + 10);
      return img;
    })
  );
  if (window.marqueeViewer) window.marqueeViewer.setWord(word);

  const count = word.replace(/ /g, '').length;
  if (count === 0) {
    summary.textContent = 'Type a word, a name or a number.';
    request.href = `mailto:${EMAIL}`;
    return;
  }
  const noun = count === 1 ? 'character' : 'characters';
  const total = word.replace(/ /g, '').split('').reduce((sum, ch) => sum + priceFor(ch), 0) + DELIVERY_FEE;
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
fetch('images/3d/metrics.json')
  .then((r) => r.json())
  .then((m) => { metrics = m; render(clean(input.value)); })
  .catch(() => {});
window.addEventListener('resize', () => fitRow(clean(input.value)));

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
