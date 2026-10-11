/* Integration checks for browser-local progress without a browser dependency. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const template = fs.readFileSync(path.join(root, 'templates/index.html'), 'utf8');
const styles = fs.readFileSync(path.join(root, 'assets/style.css'), 'utf8');
assert.match(template, /На телефоне листайте карточки свайпом влево и вправо/);
assert.match(styles, /scroll-snap-type:\s*x mandatory/);
assert.match(styles, /\.problem\s*\{\s*flex:\s*0 0 100%;\s*scroll-snap-align:\s*start/);
function loadProblems(directory) {
  return fs.readdirSync(directory, {withFileTypes: true}).flatMap(entry => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? loadProblems(file) : entry.name.endsWith('.json') ? [JSON.parse(fs.readFileSync(file, 'utf8'))] : [];
  });
}
const problems = loadProblems(path.join(root, 'content/problems'));
const problemCount = problems.length;
const script = fs.readFileSync(path.join(root, 'assets/app.js'), 'utf8');
const key = 'osnova:progress:v1:/math-ptractices/';
function mount(storage = new Map(), hash = '', blocked = false) {
  const jobs = [];
  const element = props => ({hidden: true, value: '', textContent: '', listeners: {},
    addEventListener(name, fn) { this.listeners[name] = fn; }, ...props});
  const elements = Object.fromEntries(['filters', 'search', 'topic', 'level', 'completion-filter', 'result-count', 'empty', 'math-status', 'storage-status', 'progress-count', 'progress-bar', 'resume', 'resume-title'].map(id => [id, element({})]));
  elements.search.tagName = 'INPUT';
  for (const [id, values] of [['topic', [...new Set(problems.map(p => p.topic))]], ['level', ['basic','school','advanced','challenge']], ['completion-filter', ['new','done']]]) {
    elements[id].tagName = 'SELECT';
    elements[id].options = ['', ...values].map(value => ({value}));
  }
  const cards = problems.map(p => {
    const checkbox = element({checked: false});
    const details = [element({open: false}), element({open: false}), element({open: false})];
    const card = element({id: p.id, hidden: false, dataset: {topic:p.topic, level:p.level, search:[p.title,p.topic,...p.tags,...p.statement].join(' ').toLowerCase()},
      checkbox, details, classList:{toggle(){}}, scrolled:false,
      querySelector(selector) { return selector === 'h3' ? {textContent:p.title} : checkbox; },
      querySelectorAll() { return details; }, scrollIntoView(){ this.scrolled = true; }, getBoundingClientRect(){ return {top:100}; }});
    return card;
  });
  const roadmapLinks = [...new Set(problems.map(p => p.topic))]
    .map(topic => element({dataset: {roadmapTopic: topic}}));
  let observerCallback;
  const context = {console, SyntaxError,
    document:{querySelectorAll:selector=>selector === '.problem' ? cards : roadmapLinks, querySelector:selector=>elements[selector.slice(1)], getElementById:id=>elements[id]},
    window:{listeners:{},addEventListener(name,fn){this.listeners[name]=fn;},IntersectionObserver:true},
    IntersectionObserver:class {constructor(fn){observerCallback=fn;}observe(){}},
    location:{pathname:'/math-ptractices/index.html',hash},history:{replaceState(_a,_b,value){context.location.hash=value;}},
    localStorage:{getItem(k){if(blocked)throw new Error('Storage blocked');return storage.get(k) ?? null;},setItem(k,v){if(blocked)throw new Error('Storage blocked');storage.set(k,v);}},
    setTimeout:fn=>jobs.push(fn),requestAnimationFrame:fn=>jobs.push(fn)};
  vm.createContext(context);
  vm.runInContext(script,context);
  while (jobs.length) jobs.shift()();
  return {cards,elements,context,storage,
    filter(){elements.filters.listeners.input();},
    intersect(entries){observerCallback(entries);},
    roadmap(topic){return roadmapLinks.find(link=>link.dataset.roadmapTopic===topic);},
    card(id){return cards.find(card=>card.id===id);},
    visible(){return cards.filter(card=>!card.hidden).map(card=>card.id);}};
}
let ui=mount();
ui.elements.search.value='ПЕРВОЕ УРАВНЕНИЕ';ui.filter();assert.deepEqual(ui.visible(),['linear-equation']);
ui.elements.search.value='';ui.elements.topic.value='Элементарная алгебра';ui.elements.level.value='school';ui.filter();assert.deepEqual(ui.visible(),['quadratic-roots']);
const card=ui.card('quadratic-roots');
card.checkbox.checked=true;card.checkbox.listeners.change();
card.details[0].open=true;card.details[0].listeners.toggle();
let saved=JSON.parse(ui.storage.get(key));
assert.equal(saved.last,'quadratic-roots');assert(saved.completed.includes('quadratic-roots'));assert.deepEqual(saved.opened['quadratic-roots'],[0]);
ui=mount(ui.storage);
assert(ui.card('quadratic-roots').checkbox.checked);assert(ui.card('quadratic-roots').details[0].open);assert(ui.card('quadratic-roots').scrolled);
assert.equal(ui.elements.level.value,'school');assert.equal(ui.elements['progress-count'].textContent,`Решено 1 из ${problemCount}`);
ui.elements['completion-filter'].value='new';ui.filter();assert.equal(ui.visible().length,0);assert.equal(ui.elements.empty.hidden,false);
// Continue clears filters hiding the saved card.
ui.elements.resume.listeners.click({preventDefault(){}});assert(ui.visible().includes('quadratic-roots'));
// A direct task URL overrides saved location and saved filters.
ui=mount(ui.storage,'#matrix-system');assert(ui.card('matrix-system').scrolled);assert.equal(JSON.parse(ui.storage.get(key)).last,'matrix-system');
// Same-row visibility must not override the task deliberately chosen by the learner.
ui.intersect([{target:ui.card('matrix-system'),isIntersecting:true},{target:ui.card('derivative-minimum'),isIntersecting:true}]);
assert.equal(JSON.parse(ui.storage.get(key)).last,'matrix-system');
ui.intersect([{target:ui.card('matrix-system'),isIntersecting:false}]);assert.equal(JSON.parse(ui.storage.get(key)).last,'derivative-minimum');
ui=mount(new Map([[key,'{broken json']]));assert.equal(ui.elements['progress-count'].textContent,`Решено 0 из ${problemCount}`);ui.filter();assert.doesNotThrow(()=>JSON.parse(ui.storage.get(key)));
ui=mount(new Map(),'',true);assert.equal(ui.elements['storage-status'].hidden,false);ui.card('linear-equation').checkbox.checked=true;ui.card('linear-equation').checkbox.listeners.change();assert.equal(ui.elements['progress-count'].textContent,`Решено 1 из ${problemCount}`);
ui=mount(new Map([[key,JSON.stringify({version:1,last:'deleted-task',completed:['deleted-task'],opened:{},filters:{level:'deleted-level'}})]]),'#%E0%A4%A');assert.equal(ui.elements.resume.hidden,true);assert.equal(ui.elements.level.value,'');assert.equal(ui.elements['progress-count'].textContent,`Решено 0 из ${problemCount}`);
// Path-scoped storage avoids collisions between different GitHub Pages repositories.
assert(ui.context.location.pathname.startsWith('/math-ptractices/'));assert.equal(key,'osnova:progress:v1:/math-ptractices/');
ui=mount();ui.elements.search.value='должно очиститься';ui.elements.level.value='challenge';ui.roadmap('Арифметика').listeners.click();assert.equal(ui.elements.topic.value,'Арифметика');assert.equal(ui.elements.search.value,'');assert.equal(ui.elements.level.value,'');assert.equal(ui.visible().length,problems.filter(p=>p.topic==='Арифметика').length);
console.log('UI checks passed: filters, roadmap navigation, progress reload, open solutions, continue, URL priority, scroll tracking and storage edge cases.');
