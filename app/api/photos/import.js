import { createClient } from '@supabase/supabase-js';

const BUCKET = 'articles_photo';
const TABLE = 'articles';
const ARTICLE_COL = 'articles_numero';
const PHOTO_COL = 'articles_photo';

function getEnv() {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey =
    process.env.SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl) throw new Error('SUPABASE_URL manquant dans Vercel.');
  if (!serviceRoleKey) throw new Error('SUPABASE_SERVICE_ROLE_KEY manquant dans Vercel.');
  if (!anonKey) throw new Error('SUPABASE_ANON_KEY ou NEXT_PUBLIC_SUPABASE_ANON_KEY manquant dans Vercel.');

  return { supabaseUrl, serviceRoleKey, anonKey };
}

function normalize(value) {
  return String(value ?? '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

function stem(fileName) {
  return String(fileName ?? '').replace(/\.[^.]+$/, '');
}

async function loadAllArticles(supabase) {
  const rows = [];
  const pageSize = 1000;

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from(TABLE)
      .select(`${ARTICLE_COL},${PHOTO_COL}`)
      .range(from, from + pageSize - 1);

    if (error) throw error;
    if (!data?.length) break;
    rows.push(...data);
    if (data.length < pageSize) break;
  }
  return rows;
}

async function loadAllStorageNames(supabase) {
  const names = new Set();
  const pageSize = 1000;

  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .list('', {
        limit: pageSize,
        offset,
        sortBy: { column: 'name', order: 'asc' }
      });

    if (error) throw error;
    if (!data?.length) break;

    for (const item of data) {
      if (item?.id && item?.name) names.add(item.name.toLowerCase());
    }
    if (data.length < pageSize) break;
  }
  return names;
}

function buildPhotoIndex(files) {
  return (files || [])
    .filter(f => /\.png$/i.test(String(f.name || '')))
    .map(f => ({
      name: String(f.name),
      normalized: normalize(stem(f.name))
    }))
    .filter(f => f.normalized);
}

function findBestSourceForArticle(articleNumero, photos) {
  const articleNorm = normalize(articleNumero);
  if (!articleNorm) return { type: 'none' };

  const exact = photos.filter(p => p.normalized === articleNorm);
  if (exact.length === 1) return { type: 'exacte', photo: exact[0] };
  if (exact.length > 1) {
    return {
      type: 'ambigue',
      detail: 'Plusieurs fichiers correspondent exactement : ' + exact.map(x => x.name).join(' | ')
    };
  }

  const prefixes = photos.filter(p => articleNorm.startsWith(p.normalized));
  if (!prefixes.length) return { type: 'none' };

  const maxLen = Math.max(...prefixes.map(p => p.normalized.length));
  const best = prefixes.filter(p => p.normalized.length === maxLen);

  if (best.length === 1) {
    return {
      type: 'prefixe',
      photo: best[0],
      detail: `Préfixe retenu : ${best[0].name}`
    };
  }

  return {
    type: 'ambigue',
    detail: 'Plusieurs meilleurs préfixes : ' + best.map(x => x.name).join(' | ')
  };
}

async function handleAnalyze(supabase, files) {
  const photos = buildPhotoIndex(files);
  const [articles, storageNames] = await Promise.all([
    loadAllArticles(supabase),
    loadAllStorageNames(supabase)
  ]);

  const rows = [];
  const usedSources = new Set();

  for (const article of articles) {
    const articleNumero = String(article[ARTICLE_COL] ?? '').trim();
    if (!articleNumero) continue;

    const match = findBestSourceForArticle(articleNumero, photos);
    if (match.type === 'none') continue;

    if (match.type === 'ambigue') {
      rows.push({
        sourceName: '',
        articleNumero,
        targetName: '',
        matchType: 'ambigue',
        action: 'ambiguous',
        detail: match.detail || ''
      });
      continue;
    }

    const sourceName = match.photo.name;
    const targetName = `${articleNumero}.png`;
    usedSources.add(sourceName.toLowerCase());

    const exists = storageNames.has(targetName.toLowerCase());
    const currentPhoto = String(article[PHOTO_COL] ?? '').trim();

    let action;
    let detail = match.detail || '';

    if (exists) {
      if (currentPhoto.toLowerCase() === targetName.toLowerCase()) {
        action = 'existing';
        detail = [detail, 'Déjà présente dans le bucket ; aucun écrasement.'].filter(Boolean).join(' — ');
      } else {
        action = 'link-only';
        detail = [detail, 'Déjà présente dans le bucket ; seul articles_photo sera renseigné.'].filter(Boolean).join(' — ');
      }
    } else {
      action = 'upload';
      detail = [detail, 'Nouvelle photo à importer.'].filter(Boolean).join(' — ');
    }

    rows.push({
      sourceName,
      articleNumero,
      targetName,
      matchType: match.type,
      action,
      detail
    });
  }

  // Affiche aussi les PNG du dossier Q: qui ne servent à aucun article.
  for (const p of photos) {
    if (!usedSources.has(p.name.toLowerCase())) {
      rows.push({
        sourceName: p.name,
        articleNumero: '',
        targetName: '',
        matchType: 'aucune',
        action: 'no-match',
        detail: 'Aucun article correspondant.'
      });
    }
  }

  const order = {
    upload: 1,
    'link-only': 2,
    existing: 3,
    ambiguous: 4,
    'no-match': 5
  };

  rows.sort((a, b) =>
    (order[a.action] || 99) - (order[b.action] || 99) ||
    String(a.sourceName || a.articleNumero).localeCompare(String(b.sourceName || b.articleNumero), 'fr')
  );

  return rows;
}

async function objectExists(supabase, path) {
  const { data, error } = await supabase.storage.from(BUCKET).exists(path);
  if (error) throw error;
  return Boolean(data);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Méthode non autorisée.' });
  }

  try {
    const { supabaseUrl, serviceRoleKey, anonKey } = getEnv();
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false }
    });

    const body = req.body || {};
    const action = String(body.action || '');

    if (action === 'analyze') {
      const files = Array.isArray(body.files) ? body.files : [];
      if (!files.length) return res.status(400).json({ error: 'Aucun fichier reçu pour analyse.' });

      const rows = await handleAnalyze(supabase, files);
      return res.status(200).json({ rows });
    }

    if (action === 'prepare') {
      const articleNumero = String(body.articleNumero || '').trim();
      const sourceName = String(body.sourceName || '').trim();
      const targetName = String(body.targetName || '').trim();

      if (!articleNumero || !sourceName || !targetName) {
        return res.status(400).json({ error: 'Paramètres prepare incomplets.' });
      }
      if (!/\.png$/i.test(sourceName) || targetName !== `${articleNumero}.png`) {
        return res.status(400).json({ error: 'Nom de fichier non valide.' });
      }

      // Protection anti-écrasement, revalidée juste avant l'upload.
      if (await objectExists(supabase, targetName)) {
        return res.status(200).json({
          alreadyExists: true,
          path: targetName,
          supabaseUrl,
          supabaseAnonKey: anonKey
        });
      }

      const { data, error } = await supabase.storage
        .from(BUCKET)
        .createSignedUploadUrl(targetName, { upsert: false });

      if (error) throw error;

      return res.status(200).json({
        alreadyExists: false,
        path: data.path || targetName,
        token: data.token,
        supabaseUrl,
        supabaseAnonKey: anonKey
      });
    }

    if (action === 'confirm') {
      const articleNumero = String(body.articleNumero || '').trim();
      const targetName = String(body.targetName || '').trim();

      if (!articleNumero || targetName !== `${articleNumero}.png`) {
        return res.status(400).json({ error: 'Paramètres confirm invalides.' });
      }

      // On ne lie la DB que si le fichier existe réellement dans Storage.
      if (!(await objectExists(supabase, targetName))) {
        return res.status(409).json({ error: 'Le fichier n’existe pas encore dans le bucket.' });
      }

      const { error } = await supabase
        .from(TABLE)
        .update({ [PHOTO_COL]: targetName })
        .eq(ARTICLE_COL, articleNumero);

      if (error) throw error;

      return res.status(200).json({ ok: true });
    }

    return res.status(400).json({ error: 'Action inconnue.' });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      error: error?.message || 'Erreur serveur pendant l’import des photos.'
    });
  }
}
