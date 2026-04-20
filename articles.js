// 共有データ: スマホ用(index.html)とサイネージ用(signage.html)の両方から読み込む
// フェーズ2実装: Google Form → スプレッドシート → 公開CSV → PWA

const ARTICLES_CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTiWsJ69k3uN8hsV9UvohQ-gmj7pNjuGiT6mQpWwlT8GhhX6tTSlYBkVD1Ay5Gx6_I-RHDQFn9X23Im/pub?gid=533520323&single=true&output=csv';

const CATEGORY_MAP = {
  safety:  { label: '安全',       cls: 'safety'  },
  event:   { label: 'イベント',   cls: 'event'   },
  general: { label: '総務',       cls: 'general' },
  people:  { label: '社内報',     cls: 'people'  },
  notice:  { label: 'お知らせ',   cls: 'notice'  }
};

// フォームのカテゴリラベル → article.category のキー
const CATEGORY_LABEL_TO_KEY = {
  '安全': 'safety',
  'イベント': 'event',
  '総務': 'general',
  '社内報': 'people',
  'お知らせ': 'notice'
};

// カテゴリ別シルエット（ふわっと背景）
const SILHOUETTES = {
  safety: `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100' opacity='0.13'>
    <path d='M18,62 Q18,22 50,22 Q82,22 82,62 Z' fill='#ea580c'/>
    <rect x='10' y='60' width='80' height='9' rx='4' fill='#ea580c'/>
    <rect x='46' y='14' width='8' height='10' rx='2' fill='#ea580c'/>
  </svg>`,
  event: `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100' opacity='0.14'>
    <ellipse cx='28' cy='34' rx='14' ry='17' fill='#16a34a'/>
    <ellipse cx='56' cy='26' rx='14' ry='17' fill='#16a34a'/>
    <ellipse cx='80' cy='40' rx='14' ry='17' fill='#16a34a'/>
    <path d='M28,51 C32,66 26,82 30,96 M56,43 C52,62 58,80 55,96 M80,57 C76,72 80,85 76,96' stroke='#16a34a' stroke-width='1.6' fill='none' stroke-linecap='round'/>
  </svg>`,
  general: `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100' opacity='0.13'>
    <path d='M22,12 H62 L80,30 V92 H22 Z' fill='#0891b2'/>
    <path d='M62,12 V30 H80' fill='none' stroke='#fff' stroke-width='2.5' stroke-linejoin='round'/>
    <line x1='32' y1='44' x2='70' y2='44' stroke='#fff' stroke-width='3.5' stroke-linecap='round'/>
    <line x1='32' y1='56' x2='70' y2='56' stroke='#fff' stroke-width='3.5' stroke-linecap='round'/>
    <line x1='32' y1='68' x2='56' y2='68' stroke='#fff' stroke-width='3.5' stroke-linecap='round'/>
  </svg>`,
  people: `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100' opacity='0.13'>
    <circle cx='50' cy='34' r='16' fill='#9333ea'/>
    <path d='M18,100 Q18,58 50,58 Q82,58 82,100 Z' fill='#9333ea'/>
  </svg>`,
  notice: `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100' opacity='0.13'>
    <path d='M50,20 C32,20 28,38 28,58 L20,70 L80,70 L72,58 C72,38 68,20 50,20 Z' fill='#2563eb'/>
    <circle cx='50' cy='14' r='4.5' fill='#2563eb'/>
    <path d='M42,74 Q50,86 58,74 Z' fill='#2563eb'/>
  </svg>`
};

// :root CSS変数としてシルエットURIを注入
function injectSilhouettes() {
  const style = document.documentElement.style;
  for (const [cat, svg] of Object.entries(SILHOUETTES)) {
    const trimmed = svg.replace(/\s+/g, ' ').trim();
    style.setProperty(`--sil-${cat}`, `url("data:image/svg+xml;utf8,${encodeURIComponent(trimmed)}")`);
  }
}

// --- CSV パーサー（RFC 4180 準拠） ---
function parseCSV(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let inQuotes = false;
  let cellHasContent = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cell += ch;
      }
    } else {
      if (ch === '"' && !cellHasContent) {
        inQuotes = true;
      } else if (ch === ',') {
        row.push(cell);
        cell = '';
        cellHasContent = false;
      } else if (ch === '\r') {
        // CR は無視
      } else if (ch === '\n') {
        row.push(cell);
        rows.push(row);
        row = [];
        cell = '';
        cellHasContent = false;
      } else {
        cell += ch;
        cellHasContent = true;
      }
    }
  }
  if (cell !== '' || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

// 日付文字列を YYYY-MM-DD 形式に正規化
function normalizeDate(s) {
  if (!s) return '';
  const m = s.match(/(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
  if (!m) return '';
  const [, y, mo, d] = m;
  return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
}

// メアドから投稿者名っぽいものを推定（@の前）
function extractAuthor(email) {
  if (!email) return '匿名';
  const local = email.split('@')[0];
  return local || '匿名';
}

// CSV行をArticleオブジェクトに変換
function rowToArticle(row, headers, index) {
  const get = (...keys) => {
    for (const k of keys) {
      const i = headers.indexOf(k);
      if (i >= 0) return (row[i] || '').trim();
    }
    return '';
  };

  const title = get('記事タイトル', 'タイトル');
  const categoryLabel = get('カテゴリ', 'ジャンル');
  // 「本文」「本分」どちらのフィールド名でも拾う
  const body = get('本文', '本分', '内容');
  const dateRaw = get('公開日', '日付') || get('タイムスタンプ');
  const email = get('メールアドレス', 'メール');
  const importantRaw = get('重要フラグ', '重要');

  if (!title) return null; // タイトル空の行はスキップ

  const category = CATEGORY_LABEL_TO_KEY[categoryLabel] || 'notice';
  const author = extractAuthor(email);
  const pinned = /はい|yes|true|1|重要/i.test(importantRaw);
  const date = normalizeDate(dateRaw);

  const bodyFlat = body.replace(/\s+/g, ' ').trim();
  const excerpt = bodyFlat.length > 80 ? bodyFlat.slice(0, 80) + '…' : bodyFlat;

  return {
    id: index + 1,
    category,
    title,
    date,
    author,
    pinned,
    excerpt,
    body
  };
}

// --- 公開CSVから記事を読み込む ---
async function loadArticles() {
  // キャッシュバスティング: 更新が反映されやすいように
  const url = `${ARTICLES_CSV_URL}&_=${Date.now()}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`CSV取得失敗: HTTP ${res.status}`);
  const text = await res.text();

  const rows = parseCSV(text);
  if (rows.length < 2) return []; // ヘッダーのみ or 空

  const headers = rows[0].map(h => h.trim());
  const dataRows = rows.slice(1);

  const articles = dataRows
    .map((row, i) => rowToArticle(row, headers, i))
    .filter(a => a !== null);

  return articles;
}
