import express from 'express';
import morgan from 'morgan';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import OpenAI from 'openai';
import glob from 'glob';

dotenv.config();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(morgan('tiny'));

// Если фронт и API на одном домене — CORS можно убрать
app.use(cors());

// Раздаём фронт
app.use(express.static(path.join(__dirname, 'public')));

// OpenAI
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const MODEL_N = process.env.OPENAI_MODEL_NORMALIZE || 'gpt-4o-mini';

// ======= Загрузка тем =======
let TOPICS = { bySubject: {}, index: {} };
function normalizeKey(s, subject) {
  return `${subject}::${String(s).trim().toLowerCase()}`;
}
function loadTopics() {
  TOPICS = { bySubject: {}, index: {} };
  const dir = path.join(__dirname, 'topics');
  if (!fs.existsSync(dir)) {
    console.warn('No /topics folder found');
    return;
  }
  const files = glob.sync('**/*.json', { cwd: dir, nodir: true });
  for (const f of files) {
    const raw = fs.readFileSync(path.join(dir, f), 'utf8');
    try {
      const data = JSON.parse(raw);
      if (!data || !data.subject || !Array.isArray(data.topics)) continue;
      const s = data.subject;
      if (!TOPICS.bySubject[s]) TOPICS.bySubject[s] = [];
      for (const t of data.topics) {
        TOPICS.bySubject[s].push(t);
        TOPICS.index[normalizeKey(t.name, s)] = { subject: s, id: t.id, name: t.name };
        (t.synonyms || []).forEach(syn => {
          TOPICS.index[normalizeKey(syn, s)] = { subject: s, id: t.id, name: t.name };
        });
        TOPICS.index[`${s}::${t.id}`] = { subject: s, id: t.id, name: t.name };
      }
    } catch (e) {
      console.error('Bad topics file:', f, e.message);
    }
  }
  console.log('Topics loaded for subjects:', Object.keys(TOPICS.bySubject));
}
loadTopics();

// ======= Утилиты =======
function pickTopic(subject, userQuery) {
  const list = TOPICS.bySubject[subject] || [];
  const direct = TOPICS.index[normalizeKey(userQuery, subject)];
  if (direct) return { id: direct.id, name: direct.name };

  const q = (userQuery || '').toLowerCase();
  const hit = list.find(t =>
    t.name.toLowerCase().includes(q) ||
    (t.synonyms || []).some(s => s.toLowerCase().includes(q))
  );
  if (hit) return { id: hit.id, name: hit.name };
  if (list[0]) return { id: list[0].id, name: list[0].name };
  return { id: 'general', name: 'Общая тема' };
}

async function openaiJSON(model, messages) {
  const r = await client.chat.completions.create({
    model,
    messages,
    temperature: 0.2,
    response_format: { type: 'json_object' }
  });
  const text = r.choices?.[0]?.message?.content || '{}';
  return JSON.parse(text);
}

function systemPromptNormalize(allTopicNames) {
  return `Ты — Normalizer. Верни СТРОГИЙ JSON без лишнего текста.
Поля: subject, grade, style, intent(explain|practice|solve), topic{id,name}, subtopics[], learning_goal, follow_up_needed(bool).
Опирайся на список тем: ${allTopicNames.join(', ')}. Если формулировка не точная — выбери ближайшую.`;
}

// ======= API =======
app.get('/healthz', (_, res) => res.send('ok'));

app.post('/api/normalize', async (req, res) => {
  try {
    const { query, subject, grade, style, history = [] } = req.body || {};
    if (!query || !subject || !grade || !style) {
      return res.status(400).json({ error: 'missing_fields' });
    }

    const topicGuess = pickTopic(subject, query);
    const names = (TOPICS.bySubject[subject] || []).map(t => t.name);

    const messages = [
      { role: 'system', content: systemPromptNormalize(names) },
      { role: 'user', content: JSON.stringify({
          query, subject, grade, style, history, candidate_topic: topicGuess
        })
      }
    ];
    let normalized = await openaiJSON(MODEL_N, messages);

    // Страховка: заполняем обязательные поля, если LLM что-то упустил
    normalized.subject = subject;
    normalized.grade = grade;
    if (!normalized.topic || !normalized.topic.id) normalized.topic = topicGuess;
    if (!normalized.intent) normalized.intent = 'explain';
    if (!Array.isArray(normalized.subtopics)) normalized.subtopics = [];
    if (typeof normalized.follow_up_needed !== 'boolean') normalized.follow_up_needed = true;
    if (!normalized.learning_goal) normalized.learning_goal = 'Понять основное';

    res.json(normalized);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'normalize_failed', detail: String(e.message || e) });
  }
});

// Корень — отдать фронт
app.get('/', (_, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Запуск
const port = process.env.PORT || 10000;
app.listen(port, () => console.log('Listening on', port));
