const $ = s => document.querySelector(s);
const chat = $('#chat');
const subject = $('#subject');
const grade = $('#grade');
const style = $('#style');
const queryEl = $('#query');
const askBtn = $('#askBtn');
const themeToggle = $('#themeToggle');

// === Theme toggle ===
(function initTheme(){
  const saved = localStorage.getItem('theme') || 'light';
  document.documentElement.setAttribute('data-theme', saved);
  themeToggle.textContent = saved === 'dark' ? '☀️' : '🌙';
})();
themeToggle.addEventListener('click', () => {
  const cur = document.documentElement.getAttribute('data-theme');
  const next = cur === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('theme', next);
  themeToggle.textContent = next === 'dark' ? '☀️' : '🌙';
});

// === Autosize textarea ===
queryEl.addEventListener('input', () => {
  queryEl.style.height = 'auto';
  queryEl.style.height = Math.min(queryEl.scrollHeight, 240) + 'px';
});

// === Demo send (пока без API): генерим MOCK TutorOutput ===
askBtn.addEventListener('click', () => {
  const text = queryEl.value.trim();
  if (!text) return;
  addMsg('user', text);
  queryEl.value = '';
  queryEl.style.height = 'auto';

  const tutor = makeMockTutorOutput({ text, subject: subject.value });
  addTutorMsg(tutor);
  rerenderMath();
});

// === Сообщение простого текста ===
function addMsg(role, content) {
  const el = document.createElement('div');
  el.className = `msg ${role}`;
  el.innerHTML = `<h3>${role === 'user' ? 'Вы' : 'Бот'}</h3><div class="content"></div>`;
  el.querySelector('.content').textContent = content;
  chat.appendChild(el);
  el.scrollIntoView({ behavior: 'smooth', block: 'end' });
}

// === Сообщение с секциями (TutorOutput) ===
function addTutorMsg(tutor) {
  const el = document.createElement('div');
  el.className = 'msg assistant';

  const tabs = [
    { id: 'explanation', label: 'Объяснение' },
    { id: 'examples', label: 'Примеры' },
    { id: 'checks', label: 'Самопроверка' },
    { id: 'homework', label: 'Домашка' },
    { id: 'pitfalls', label: 'Ошибки' },
    { id: 'citations', label: 'Источники' },
  ];

  el.innerHTML = `
    <h3>Бот</h3>
    <div class="tabs">
      ${tabs.map((t,i)=>`<div class="tab ${i===0?'active':''}" data-tab="${t.id}">${t.label}</div>`).join('')}
    </div>
    <div class="tabpanels">
      <div class="tabpanel active" data-panel="explanation">${mdToHtml(tutor.explanation)}</div>
      <div class="tabpanel" data-panel="examples">${listHtml(tutor.examples)}</div>
      <div class="tabpanel" data-panel="checks">${checksHtml(tutor.checks)}</div>
      <div class="tabpanel" data-panel="homework">${listHtml(tutor.homework)}</div>
      <div class="tabpanel" data-panel="pitfalls">${listHtml(tutor.pitfalls)}</div>
      <div class="tabpanel" data-panel="citations">${listHtml(tutor.citations)}</div>
    </div>
  `;

  // табы
  el.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const id = tab.dataset.tab;
      el.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t === tab));
      el.querySelectorAll('.tabpanel').forEach(p => p.classList.toggle('active', p.dataset.panel === id));
      rerenderMath();
    });
  });

  // обработчик проверки квизов
  el.querySelectorAll('.quiz-item .btn-check').forEach(btn => {
    btn.addEventListener('click', () => {
      const item = btn.closest('.quiz-item');
      const type = item.dataset.type;
      const correct = item.dataset.answer;
      let userVal = '';

      if (type === 'mcq') {
        const checked = item.querySelector('input[type=radio]:checked');
        userVal = checked ? checked.value : '';
      } else if (type === 'bool') {
        const checked = item.querySelector('input[type=radio]:checked');
        userVal = checked ? checked.value : '';
      } else if (type === 'short') {
        userVal = item.querySelector('input[type=text]').value.trim();
      }

      const ok = normalizeAns(userVal) === normalizeAns(correct);
      item.classList.remove('correct','wrong');
      item.classList.add(ok ? 'correct' : 'wrong');
      item.querySelector('.explain').style.display = 'block';
    });
  });

  chat.appendChild(el);
  el.scrollIntoView({ behavior: 'smooth', block: 'end' });
  rerenderMath();
}

// === Helpers для HTML ===
function mdToHtml(s='') {
  // мини-«markdown»: абзацы и переносы строк, остальное — как есть (KaTeX отрисует формулы)
  const esc = s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  return esc.split(/\n{2,}/).map(p=>`<p>${p.replace(/\n/g,'<br>')}</p>`).join('');
}

function listHtml(arr=[]) {
  if (!arr.length) return '<div class="muted">Пусто</div>';
  return `<ul>${arr.map(x=>`<li>${mdToHtml(String(x))}</li>`).join('')}</ul>`;
}

function checksHtml(items=[]) {
  if (!items.length) return '<div class="muted">Пока без вопросов</div>';
  return items.map((q,i)=>quizItemHtml(q,i)).join('');
}

function quizItemHtml(q, i) {
  const id = `q_${Date.now()}_${i}`;
  if (q.type === 'mcq') {
    return `
      <div class="quiz-item" data-type="mcq" data-answer="${escapeHtml(q.answer)}">
        <div class="q">${mdToHtml(q.q)}</div>
        <div class="opts">
          ${(q.options||[]).map((opt,idx)=>`
            <label>
              <input type="radio" name="${id}" value="${escapeHtml(opt)}"> ${escapeHtml(opt)}
            </label>
          `).join('')}
        </div>
        <div class="quiz-actions"><button class="btn-check">Проверить</button></div>
        <div class="explain" style="display:none">${mdToHtml(q.explain||'')}</div>
      </div>
    `;
  }
  if (q.type === 'bool') {
    return `
      <div class="quiz-item" data-type="bool" data-answer="${q.answer ? 'true':'false'}">
        <div class="q">${mdToHtml(q.q)}</div>
        <label><input type="radio" name="${id}" value="true"> Верно</label>
        <label><input type="radio" name="${id}" value="false"> Неверно</label>
        <div class="quiz-actions"><button class="btn-check">Проверить</button></div>
        <div class="explain" style="display:none">${mdToHtml(q.explain||'')}</div>
      </div>
    `;
  }
  // short
  return `
    <div class="quiz-item" data-type="short" data-answer="${escapeHtml(q.answer)}">
      <div class="q">${mdToHtml(q.q)}</div>
      <input type="text" placeholder="Ответ">
      <div class="quiz-actions"><button class="btn-check">Проверить</button></div>
      <div class="explain" style="display:none">${mdToHtml(q.explain||'')}</div>
    </div>
  `;
}

function escapeHtml(s=''){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function normalizeAns(s=''){ return String(s).trim().toLowerCase(); }

// KaTeX rerender (на случай переключения вкладок)
function rerenderMath(){
  if (window.renderMathInElement) {
    renderMathInElement(document.body,{
      delimiters:[
        {left:'$$', right:'$$', display:true},
        {left:'\\(', right:'\\)', display:false}
      ]
    });
  }
}

// === MOCK генератор TutorOutput для демо ===
function makeMockTutorOutput({ text, subject }) {
  // чуть-чуть «темизируем» под математику/биологию для наглядности
  if (subject === 'mathematics') {
    return {
      explanation:
`Разберём тему: **${text}**. Напомним теорему Пифагора:
$$a^2 + b^2 = c^2.$$
Если известны катеты \\(a\\) и \\(b\\), гипотенуза: \\(c = \\sqrt{a^2 + b^2}\\).`,
      examples: [
        "Пример: для a=3, b=4 → c=5.",
        "Если c=13 и a=5 → b=\\(\\sqrt{13^2-5^2}=12\\)."
      ],
      checks: [
        { type:'mcq', q:'Чему равна гипотенуза при a=6, b=8?', options:['10','12','14'], answer:'10', explain:'\\(c=\\sqrt{36+64}=10\\).' },
        { type:'short', q:'Запиши формулу теоремы Пифагора (в виде a^2 + b^2 = ...).', answer:'c^2', explain:'a^2 + b^2 = c^2' },
        { type:'bool', q:'В прямоугольном треугольнике сумма катетов равна гипотенузе.', answer:false, explain:'Неверно: по теореме Пифагора сумма **квадратов** катетов равна квадрату гипотенузы.' }
      ],
      homework: [
        "Найди c при a=7, b=24.",
        "Даны c=25, b=24. Найди a.",
      ],
      pitfalls: [
        "Путают сумму чисел и сумму их квадратов.",
        "Забывают, что теорема работает только для прямоугольных треугольников."
      ],
      citations: ["Шарыгин И.Ф., Геометрия, 7–9"],
      tutor_state: { mastery: 0.6, quiz_ready: false, next_step: 'ask_clarifying' }
    };
  }

  // биология — ядро клетки (просто для демонстрации секций)
  return {
    explanation:
`Тема: **${text}**. Ядро — мембранный органоид эукариотической клетки.
Основные части: ядерная оболочка, хроматин, ядрышко. Функции — хранение и экспрессия генетической информации.`,
    examples: [
      "Хроматин — ДНК + белки (гистоны), упакованные в нуклеосомы.",
      "Ядрышко — сборка субъединиц рибосом."
    ],
    checks: [
      { type:'mcq', q:'Где происходит сборка рибосомных субъединиц?', options:['Митохондрия','Ядрышко','Комплекс Гольджи'], answer:'Ядрышко', explain:'Именно в ядрышке.' },
      { type:'short', q:'Основная молекула хранения наследственной информации?', answer:'ДНК', explain:'Дезоксирибонуклеиновая кислота.' },
      { type:'bool', q:'У прокариот есть оформленное ядро.', answer:false, explain:'У прокариот ядра нет; ДНК — в нуклеоиде.' }
    ],
    homework: [
      "Сравни хроматин в интерфазе и хромосомы в митозе.",
      "Нарисуй схему ядра и подпиши части."
    ],
    pitfalls: [
      "Путаница между ядром и ядрышком.",
      "Считать, что у всех организмов обязательно есть ядро."
    ],
    citations: ["Школьный учебник биологии, 8 класс"],
    tutor_state: { mastery: 0.65, quiz_ready: false, next_step: 'ask_clarifying' }
  };
}
