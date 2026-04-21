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

// Google Drive の共有URLからファイルID抽出し、表示用URLに変換
// Form添付は同セルに複数URLがカンマ区切りで入ることがある
function extractImageUrls(raw, size = 1000) {
  if (!raw) return [];
  const urls = [];
  // Form の出力URL例:
  //   https://drive.google.com/open?id=XXXX
  //   https://drive.google.com/file/d/XXXX/view
  //   https://drive.google.com/uc?id=XXXX
  const pattern = /(?:[?&]id=|\/d\/)([a-zA-Z0-9_-]{20,})/g;
  let m;
  while ((m = pattern.exec(raw)) !== null) {
    const id = m[1];
    // thumbnailエンドポイントは CORS/リダイレクトが素直で <img> と相性が良い
    urls.push(`https://drive.google.com/thumbnail?id=${id}&sz=w${size}`);
  }
  return urls;
}

// CSV行をArticleオブジェクトに変換
function rowToArticle(row, headers, index, id) {
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
  const attachmentRaw = get('添付画像', '画像', '添付');

  if (!title) return null; // タイトル空の行はスキップ

  const category = CATEGORY_LABEL_TO_KEY[categoryLabel] || 'notice';
  const author = extractAuthor(email);
  const pinned = /はい|yes|true|1|重要/i.test(importantRaw);
  const date = normalizeDate(dateRaw);

  const bodyFlat = body.replace(/\s+/g, ' ').trim();
  const excerpt = bodyFlat.length > 80 ? bodyFlat.slice(0, 80) + '…' : bodyFlat;
  const images = extractImageUrls(attachmentRaw);

  return {
    id: id ?? (index + 1),
    category,
    title,
    date,
    author,
    pinned,
    excerpt,
    body,
    images
  };
}

// --- デモ用サンプル記事（提案時の「中身が入ってる感」を維持するため常に表示） ---
const DEMO_ARTICLES = [
  {
    id: 1,
    category: 'safety',
    title: '4月は全国安全月間です',
    date: '2026-04-01',
    author: '安全衛生委員会',
    pinned: true,
    excerpt: '今月は全社で安全意識を高める強化月間です。朝礼でのKY活動、保護具の再確認、ヒヤリハット報告の徹底にご協力ください。',
    body: `今月は全社で安全意識を高める強化月間です。\n\n【重点項目】\n・朝礼でのKY（危険予知）活動の実施\n・保護具（ヘルメット・安全靴・保護メガネ）の着用状態再確認\n・ヒヤリハット報告の積極提出\n\n「慣れ」から来る不注意が最も多い事故原因です。毎朝の声掛けと指差し確認を徹底し、全員で無事故・無災害を達成しましょう。\n\nご不明な点は安全衛生委員会までお問い合わせください。`
  },
  {
    id: 2,
    category: 'event',
    title: '春の社内BBQ大会を開催します',
    date: '2026-04-18',
    author: '親睦会',
    pinned: false,
    excerpt: '今年も恒例の春BBQを開催します。ご家族のご参加も大歓迎です。参加希望の方は4/25までに総務までお申し込みください。',
    body: `今年も恒例の春BBQ大会を開催します！\n\n【日時】5月17日(日) 11:00〜15:00\n【場所】◯◯河川敷 第3バーベキュー広場\n【会費】大人 2,000円 / 子ども 500円\n\nご家族のご参加も大歓迎です。ビンゴ大会・子ども向けゲーム・豪華景品もご用意しています。\n\n参加希望の方は4/25(金)までに総務 田中までお申し込みください。雨天の場合は翌週日曜に順延します。`
  },
  {
    id: 3,
    category: 'general',
    title: '定期健康診断の受付開始',
    date: '2026-04-15',
    author: '総務部',
    pinned: false,
    excerpt: '今年度の定期健康診断の受付を開始しました。所属と希望日を確認のうえ、5/9までに予約システムから申し込みをお願いします。',
    body: `今年度の定期健康診断の受付を開始しました。\n\n【実施期間】6月1日〜6月26日\n【実施場所】第2会議室（巡回健診車）\n【対象】全正社員・契約社員\n\n所属ごとに希望可能な曜日が異なります。社内ポータルの予約システムより、5/9(金) 17:00までにお申し込みをお願いします。\n\n※バリウム検査を希望する方は前日21時以降の絶食が必要です。\n※婦人科検診はオプション申し込みとなります。`
  },
  {
    id: 4,
    category: 'people',
    title: '新入社員の紹介（2026年度）',
    date: '2026-04-08',
    author: '人事部',
    pinned: false,
    excerpt: '本年度、新たに8名の仲間が加わりました。配属先は製造部・品質管理部・システム部です。見かけたらぜひお声がけください。',
    body: `本年度、新たに8名の仲間が加わりました。\n\n【配属先】\n・製造部 第1課　3名\n・製造部 第2課　2名\n・品質管理部　　2名\n・システム部　　1名\n\n現在、各部署でOJT研修を受けています。構内で見かけたらぜひお声がけください。温かく迎えていただけると嬉しいです。\n\n配属メンバーの詳細な自己紹介は、社内報「こんにちは新人さん」特集号（5月号）に掲載予定です。`
  },
  {
    id: 5,
    category: 'notice',
    title: '駐車場の利用ルール変更について',
    date: '2026-04-12',
    author: '総務部',
    pinned: false,
    excerpt: '5/1より、第2駐車場の区画割を変更します。新しい区画表は掲示板および社内ポータルで公開していますのでご確認ください。',
    body: `5月1日より、第2駐車場の区画割を変更します。\n\n【変更の背景】\n来客用スペースの拡充と、大型車両の動線改善のため、全体レイアウトを見直しました。\n\n【変更点】\n・一般社員区画：従来の1列目→3列目へ移動\n・来客区画：入口側2列を確保\n・大型車両区画：西側奥に集約\n\n新しい区画表は本掲示板および社内ポータル「お知らせ」欄に掲載しています。ご自身の新しい駐車位置を必ずご確認ください。\n\n初日は誘導係を配置します。ご不便をおかけしますがご協力をお願いします。`
  },
  {
    id: 6,
    category: 'event',
    title: 'お花見会のご報告',
    date: '2026-03-30',
    author: '親睦会',
    pinned: false,
    excerpt: '3/28に開催したお花見会は天候にも恵まれ、総勢52名の大盛況となりました。ご参加・ご協力ありがとうございました。',
    body: `3/28(土)に◯◯公園で開催したお花見会は、総勢52名の大盛況となりました。\n\n当日はお天気にも恵まれ、桜も満開のタイミング。お子様連れのご家族も多く、和やかなひとときを過ごせました。\n\n準備・片付けにご協力いただいた有志のみなさま、本当にありがとうございました。写真は社内ポータルのアルバムに順次アップしていきます。`
  },
  {
    id: 7,
    category: 'general',
    title: '年度末の勤務報告書提出について',
    date: '2026-03-20',
    author: '総務部',
    pinned: false,
    excerpt: '2025年度の勤務報告書を4/10までにご提出ください。書式は社内ポータルの様式集からダウンロードできます。',
    body: `2025年度の勤務報告書の提出期限が近づいています。\n\n【提出期限】4月10日(金) 17:00\n【提出先】総務部（メールまたは紙）\n【書式】社内ポータル＞様式集＞「2025年度 勤務報告書」\n\n有給残日数の確認もあわせてお願いします。ご不明な点は総務 田中までお問い合わせください。`
  },
  {
    id: 8,
    category: 'notice',
    title: '春の交通安全運動（3/10-3/20）',
    date: '2026-03-08',
    author: '安全衛生委員会',
    pinned: false,
    excerpt: '春の全国交通安全運動の期間中、通勤時の安全運転を改めてお願いします。通勤経路の見直しも忘れずに。',
    body: `3月10日〜3月20日は春の全国交通安全運動期間です。\n\n新生活が始まる時期は交通事故が増えやすくなります。\n\n【お願い】\n・朝夕のスピードに余裕を\n・スマホながら運転は絶対に\n・自転車通勤の方はヘルメット着用を\n\n事故やヒヤリハットがあった場合は、軽微でも必ず安全衛生委員会までご報告ください。`
  },
  {
    id: 9,
    category: 'people',
    title: '社員表彰式を開催しました（2月）',
    date: '2026-02-18',
    author: '人事部',
    pinned: false,
    excerpt: '2/15に2025年度下期の社員表彰式を開催しました。改善提案部門・安全功労部門・永年勤続表彰の受賞者をご紹介します。',
    body: `2月15日に2025年度下期の社員表彰式を開催しました。\n\n【改善提案部門】製造部 佐藤さん、品質管理部 鈴木さん\n【安全功労部門】製造部 山田さん\n【永年勤続表彰（20年）】総務部 高橋さん\n\n受賞されたみなさま、おめでとうございます。日々の業務の中での気づきや工夫が、会社全体の成長につながっています。`
  },
  {
    id: 10,
    category: 'general',
    title: 'インフルエンザ予防接種費用補助のお知らせ（終了）',
    date: '2026-01-15',
    author: '総務部',
    pinned: false,
    excerpt: '2025年度のインフルエンザ予防接種費用補助（上限3,000円）は、1/31をもって受付を終了しました。',
    body: `2025年度のインフルエンザ予防接種費用補助は、1月31日をもって受付を終了しました。\n\n【利用実績】対象者の約78%が申請（前年比+12pt）\n\nご利用ありがとうございました。2026年度の補助内容は秋頃あらためてご案内いたします。`
  }
];

// --- 公開CSVから記事を読み込む（取得失敗してもデモ記事は表示） ---
async function loadArticles() {
  // キャッシュバスティング: 更新が反映されやすいように
  const url = `${ARTICLES_CSV_URL}&_=${Date.now()}`;

  let csvArticles = [];
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();

    const rows = parseCSV(text);
    if (rows.length >= 2) {
      const headers = rows[0].map(h => h.trim());
      const dataRows = rows.slice(1);
      csvArticles = dataRows
        .map((row, i) => rowToArticle(row, headers, i, 1000 + i + 1)) // IDは 1001 以降
        .filter(a => a !== null);
    }
  } catch (err) {
    console.warn('CSV取得に失敗、デモ記事のみで表示します:', err);
  }

  // CSV投稿 + デモ記事 を合わせて返す（並びは呼び出し側の sort に任せる）
  return [...csvArticles, ...DEMO_ARTICLES];
}
