/* Python renders content; this module manages browser-local learning state. */
const cards = [...document.querySelectorAll('.problem')];
const cardById = new Map(cards.map(card => [card.id, card]));
const form = document.querySelector('#filters');
const fields = Object.fromEntries(['search', 'topic', 'level', 'completion-filter'].map(id => [id, document.getElementById(id)]));
const normalize = text => text.toLocaleLowerCase('ru').replaceAll('ё', 'е').trim();
const storageKey = `osnova:progress:v1:${location.pathname.replace(/index\.html$/, '')}`;
const freshState = () => ({version: 1, last: '', completed: [], opened: {}, filters: {}});
let state = freshState();
let storageAvailable = true;
try {
  const saved = JSON.parse(localStorage.getItem(storageKey));
  if (saved && saved.version === 1 && typeof saved === 'object') {
    state.last = typeof saved.last === 'string' && cardById.has(saved.last) ? saved.last : '';
    state.completed = Array.isArray(saved.completed) ? saved.completed.filter(id => typeof id === 'string') : [];
    state.opened = saved.opened && typeof saved.opened === 'object' && !Array.isArray(saved.opened) ? saved.opened : {};
    state.filters = saved.filters && typeof saved.filters === 'object' ? saved.filters : {};
  }
} catch (error) {
  // Malformed JSON can be replaced. A storage access error means persistence is unavailable.
  if (!(error instanceof SyntaxError)) storageAvailable = false;
}
const completed = new Set(state.completed);
function save() {
  state.completed = [...completed];
  state.filters = Object.fromEntries(Object.entries(fields).map(([key, field]) => [key, field.value]));
  try {
    localStorage.setItem(storageKey, JSON.stringify(state));
  } catch {
    storageAvailable = false;
  }
  document.querySelector('#storage-status').hidden = storageAvailable;
}
function updateProgress() {
  const count = cards.filter(card => completed.has(card.id)).length;
  document.querySelector('#progress-count').textContent = `Решено ${count} из ${cards.length}`;
  document.querySelector('#progress-bar').value = count;
  const last = cardById.get(state.last);
  document.querySelector('#resume').hidden = !last;
  if (last) {
    document.querySelector('#resume').href = `#${last.id}`;
    document.querySelector('#resume-title').textContent = last.querySelector('h3').textContent;
  }
}
function rememberCard(card) {
  if (!card || card.hidden || state.last === card.id) return;
  state.last = card.id;
  updateProgress();
  save();
}
function filter() {
  const words = normalize(fields.search.value).split(/\s+/).filter(Boolean);
  let count = 0;
  for (const card of cards) {
    const done = completed.has(card.id);
    card.hidden = !((!fields.topic.value || card.dataset.topic === fields.topic.value)
      && (!fields.level.value || card.dataset.level === fields.level.value)
      && (!fields['completion-filter'].value || (fields['completion-filter'].value === 'done' ? done : !done))
      && words.every(word => normalize(card.dataset.search).includes(word)));
    count += Number(!card.hidden);
  }
  document.querySelector('#result-count').textContent = `Показано: ${count} из ${cards.length}`;
  document.querySelector('#empty').hidden = count !== 0;
}
for (const [key, field] of Object.entries(fields)) {
  const value = state.filters[key];
  if (typeof value === 'string') {
    if (field.tagName !== 'SELECT' || [...field.options].some(option => option.value === value)) field.value = value;
  }
}
for (const card of cards) {
  const checkbox = card.querySelector('[data-completed]');
  checkbox.checked = completed.has(card.id);
  card.classList.toggle('is-completed', checkbox.checked);
  checkbox.addEventListener('change', () => {
    checkbox.checked ? completed.add(card.id) : completed.delete(card.id);
    card.classList.toggle('is-completed', checkbox.checked);
    rememberCard(card);
    updateProgress();
    filter();
    save();
  });
  const details = [...card.querySelectorAll('details')];
  const openIndexes = state.opened[card.id];
  details.forEach((detail, index) => {
    detail.open = Array.isArray(openIndexes) && openIndexes.includes(index);
    detail.addEventListener('toggle', () => {
      state.opened[card.id] = details.flatMap((item, i) => item.open ? [i] : []);
      // Initial restoration fires toggle too; it must not replace the last visited card.
      save();
    });
  });
  card.addEventListener('click', () => rememberCard(card));
  card.addEventListener('focusin', () => rememberCard(card));
}
form.addEventListener('submit', event => event.preventDefault());
function onFilterChange() { filter(); save(); }
form.addEventListener('input', onFilterChange);
form.addEventListener('change', onFilterChange);
form.addEventListener('reset', () => setTimeout(onFilterChange, 0));
document.querySelectorAll('[data-roadmap-topic]').forEach(link => {
  link.addEventListener('click', () => {
    fields.search.value = '';
    fields.topic.value = link.dataset.roadmapTopic;
    fields.level.value = '';
    fields['completion-filter'].value = '';
    filter();
    save();
  });
});
if (window.renderMathInElement) {
  window.renderMathInElement(document.querySelector('main'), {
    delimiters: [{left: '$$', right: '$$', display: true}, {left: '$', right: '$', display: false}],
    throwOnError: false, trust: false
  });
} else {
  document.querySelector('#math-status').hidden = false;
}
function anchorCard() {
  try { return cardById.get(decodeURIComponent(location.hash.slice(1))); }
  catch { return undefined; }
}
function jumpToCard(card) {
  if (!card) return;
  if (card.hidden) {
    for (const field of Object.values(fields)) field.value = '';
    filter();
  }
  state.last = card.id;
  updateProgress();
  save();
  card.scrollIntoView({block: 'start', behavior: 'instant'});
}
window.addEventListener('hashchange', () => jumpToCard(anchorCard()));
document.querySelector('#resume').addEventListener('click', event => {
  event.preventDefault();
  const card = cardById.get(state.last);
  if (card) {
    history.replaceState(null, '', `#${card.id}`);
    jumpToCard(card);
  }
});
filter();
updateProgress();
document.querySelector('#storage-status').hidden = storageAvailable;
// Explicit URLs take priority. Otherwise resume the saved card after initial layout.
const target = anchorCard() || (!location.hash && cardById.get(state.last));
requestAnimationFrame(() => {
  if (target) jumpToCard(target);
  if ('IntersectionObserver' in window) {
    const active = new Set();
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        entry.isIntersecting && !entry.target.hidden ? active.add(entry.target) : active.delete(entry.target);
      }
      // Two cards can share a row: preserve the one the learner selected.
      if (active.has(cardById.get(state.last))) return;
      const visible = [...active].filter(card => !card.hidden);
      visible.sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);
      if (visible.length) rememberCard(visible[0]);
    }, {rootMargin: '-10% 0px -60% 0px', threshold: 0});
    cards.forEach(card => observer.observe(card));
  }
});
window.addEventListener('pagehide', save);
