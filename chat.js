// Chat widget: a small floating assistant that answers questions about the rentals.
// Talks to the Cloudflare Worker in ../chat-worker, which holds the API key.
// After deploying the worker, paste its URL here.
const CHAT_ENDPOINT = 'https://cbmarquee-chat.cbmarquee-chat-worker.workers.dev';

const GREETING = "Hi! I can answer questions about our marquee letters, pricing and delivery. Thinking of a word, a name or a number? Type it in and I'll price it and show you how it looks lit up.";
const SUGGESTIONS = ['How much does it cost?', 'LOVE', 'HAPPY 40TH', 'Do you deliver outside Sydney?'];
const PREVIEW_ALLOWED = /[^A-Z0-9 &]/g;

(function () {
  const history = [];   // {role, content} for the API
  let busy = false;

  // Build the markup.
  const root = document.createElement('div');
  root.className = 'chat';
  root.innerHTML = `
    <button class="chat-toggle" type="button" aria-expanded="false" aria-controls="chat-panel">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a8 8 0 0 1-8 8H8l-5 3 1.4-4.2A8 8 0 1 1 21 12z"/></svg>
      <span>Ask us</span>
    </button>
    <section class="chat-panel" id="chat-panel" role="dialog" aria-label="Chat with CB Marquee Characters" hidden>
      <header class="chat-head">
        <img src="images/logo.png" alt="" width="36" height="36">
        <div><strong>CB Marquee Characters</strong><span>AI assistant · usually instant</span></div>
        <button class="chat-close" type="button" aria-label="Close chat">&times;</button>
      </header>
      <div class="chat-log" aria-live="polite"></div>
      <div class="chat-suggest"></div>
      <form class="chat-form">
        <label class="visually-hidden" for="chat-input">Your message</label>
        <textarea id="chat-input" rows="1" maxlength="1500" placeholder="Type a question, or the letters you want" autocomplete="off"></textarea>
        <button type="submit" aria-label="Send">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 2 11 13"/><path d="M22 2 15 22l-4-9-9-4z"/></svg>
        </button>
      </form>
      <p class="chat-foot">Answers are AI-generated estimates. For bookings call <a href="tel:+19025371074">902-537-1074</a>.</p>
    </section>`;
  document.body.append(root);

  const toggle = root.querySelector('.chat-toggle');
  const panel = root.querySelector('.chat-panel');
  const log = root.querySelector('.chat-log');
  const suggest = root.querySelector('.chat-suggest');
  const form = root.querySelector('.chat-form');
  const input = root.querySelector('#chat-input');
  const sendBtn = form.querySelector('button');

  function open() {
    panel.hidden = false;
    toggle.setAttribute('aria-expanded', 'true');
    root.classList.add('is-open');
    if (!log.children.length) {
      addBubble('assistant', GREETING);
      renderSuggestions(SUGGESTIONS);
    }
    setTimeout(() => input.focus(), 50);
    track('chat_open');
  }
  function close() {
    panel.hidden = true;
    toggle.setAttribute('aria-expanded', 'false');
    root.classList.remove('is-open');
    toggle.focus();
  }
  toggle.addEventListener('click', () => (panel.hidden ? open() : close()));
  root.querySelector('.chat-close').addEventListener('click', close);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !panel.hidden) close(); });

  function renderSuggestions(items) {
    suggest.replaceChildren(...items.map((text) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = text;
      b.addEventListener('click', () => send(text));
      return b;
    }));
  }

  function addBubble(role, text) {
    const el = document.createElement('div');
    el.className = `chat-msg is-${role}`;
    el.textContent = text;
    log.append(el);
    log.scrollTop = log.scrollHeight;
    return el;
  }

  // Turn "[[preview:WORD]]" tags from the bot into a button that loads the word
  // into the "See your word in lights" tool on the page.
  function finalize(el, raw) {
    const words = [];
    const text = raw.replace(/\[\[preview:([^\]]{1,40})\]\]/gi, (_, w) => {
      const clean = w.toUpperCase().replace(PREVIEW_ALLOWED, '').replace(/\s+/g, ' ').trim().slice(0, 14);
      if (clean) words.push(clean);
      return '';
    }).trim();
    el.textContent = text;
    for (const word of [...new Set(words)]) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'chat-preview';
      b.innerHTML = `<span>&#10024;</span> See "${word}" in lights`;
      b.addEventListener('click', () => showPreview(word));
      el.append(b);
    }
    log.scrollTop = log.scrollHeight;
  }

  function showPreview(word) {
    const field = document.getElementById('preview-input');
    if (!field) return;
    field.value = word;
    field.dispatchEvent(new Event('input', { bubbles: true }));
    if (window.matchMedia('(max-width: 640px)').matches) close();
    document.getElementById('preview').scrollIntoView({ behavior: 'smooth', block: 'start' });
    track('chat_preview', word);
  }

  async function send(text) {
    text = (text || '').trim();
    if (!text || busy) return;
    busy = true;
    sendBtn.disabled = true;
    suggest.replaceChildren();
    input.value = '';
    autosize();
    addBubble('user', text);
    history.push({ role: 'user', content: text });
    track('chat_message');

    const bubble = addBubble('assistant', '');
    bubble.classList.add('is-typing');
    let reply = '';
    try {
      const res = await fetch(CHAT_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: history }),
      });
      if (!res.ok) throw new Error(await res.text().catch(() => res.statusText));
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        reply += decoder.decode(value, { stream: true });
        bubble.classList.remove('is-typing');
        bubble.textContent = reply.replace(/\[\[preview:[^\]]*\]?\]?$/i, '');
        log.scrollTop = log.scrollHeight;
      }
      history.push({ role: 'assistant', content: reply });
      finalize(bubble, reply);
    } catch (err) {
      bubble.classList.remove('is-typing');
      const msg = /Too many/.test(String(err.message))
        ? 'Too many messages at once. Give it a minute and try again.'
        : "Sorry, I couldn't reach the assistant just now. Call 902-537-1074 or email admin@cbmarqueecharacters.ca and we'll help you directly.";
      bubble.textContent = msg;
      history.pop();
    } finally {
      busy = false;
      sendBtn.disabled = false;
      input.focus();
    }
  }

  form.addEventListener('submit', (e) => { e.preventDefault(); send(input.value); });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input.value); }
  });
  function autosize() {
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 120) + 'px';
  }
  input.addEventListener('input', autosize);

  function track(name, label) {
    if (typeof gtag === 'function') gtag('event', name, label ? { chat_label: label } : {});
  }

  // Let other parts of the page open the chat, e.g. a link with data-open-chat.
  document.querySelectorAll('[data-open-chat]').forEach((a) => {
    a.addEventListener('click', (e) => { e.preventDefault(); open(); });
  });
})();
