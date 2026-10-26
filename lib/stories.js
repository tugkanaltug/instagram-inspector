const ALLOWED_MEDIA_SUFFIXES = Object.freeze([
  'cdninstagram.com',
  'fbcdn.net',
]);

function asHttpsMediaUrl(value) {
  try {
    const url = new URL(String(value ?? ''));
    if (url.protocol !== 'https:') return '';
    const hostname = url.hostname.toLocaleLowerCase('en-US');
    const allowed = ALLOWED_MEDIA_SUFFIXES.some((suffix) => (
      hostname === suffix || hostname.endsWith(`.${suffix}`)
    ));
    return allowed ? url.href : '';
  } catch {
    return '';
  }
}

function asTimestamp(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.trunc(number) : null;
}

function normalizeStoryItem(rawItem, index) {
  if (!rawItem || typeof rawItem !== 'object') return null;
  const displayUrl = asHttpsMediaUrl(rawItem.display_url);
  const videoUrl = asHttpsMediaUrl(rawItem.video_url);
  if (!displayUrl) return null;

  const isVideo = rawItem.media_type === 'video' || rawItem.media_type === 2 || Boolean(videoUrl);
  if (isVideo && !videoUrl) return null;

  return {
    id: String(rawItem.id ?? `story-${index}`),
    media_type: isVideo ? 'video' : 'image',
    display_url: displayUrl,
    video_url: isVideo ? videoUrl : '',
    taken_at: asTimestamp(rawItem.taken_at),
    expires_at: asTimestamp(rawItem.expires_at),
    width: Math.max(0, Number(rawItem.width) || 0),
    height: Math.max(0, Number(rawItem.height) || 0),
    has_audio: rawItem.has_audio === true,
    seen: rawItem.seen === true,
  };
}

function normalizeStoryGroup(rawGroup, sourceIndex) {
  const username = String(rawGroup?.username ?? '').trim().replace(/^@/, '');
  if (!/^[A-Za-z0-9._]+$/.test(username) || rawGroup?.following !== true) return null;

  const items = (Array.isArray(rawGroup.items) ? rawGroup.items : [])
    .slice(0, 100)
    .map(normalizeStoryItem)
    .filter(Boolean);
  if (!items.length) return null;

  return {
    source_index: sourceIndex,
    username,
    full_name: String(rawGroup.full_name ?? '').trim(),
    profile_pic_url: asHttpsMediaUrl(rawGroup.profile_pic_url),
    is_verified: rawGroup.is_verified === true,
    is_private: rawGroup.is_private === true,
    has_unseen: items.some((item) => !item.seen),
    items,
  };
}

export function validateStoryCollection(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('Hikâye yanıtı geçerli değil.');
  }

  const groups = (Array.isArray(payload.groups) ? payload.groups : [])
    .slice(0, 500)
    .map(normalizeStoryGroup)
    .filter(Boolean)
    .sort((a, b) => a.source_index - b.source_index);

  const itemCount = groups.reduce((total, group) => total + group.items.length, 0);
  const sourceCount = Math.max(groups.length, Number(payload.source_count) || 0);
  const resolvedCount = Math.min(sourceCount, Math.max(groups.length, Number(payload.resolved_count) || groups.length));
  const skippedCount = Math.max(0, Number(payload.skipped_count) || (sourceCount - groups.length));
  const failedCount = Math.max(0, Number(payload.failed_count) || (sourceCount - resolvedCount));
  return {
    captured_at: String(payload.captured_at ?? new Date().toISOString()),
    groups,
    account_count: groups.length,
    item_count: itemCount,
    source_count: sourceCount,
    resolved_count: resolvedCount,
    skipped_count: skippedCount,
    failed_count: failedCount,
    retry_count: Math.max(0, Number(payload.retry_count) || 0),
    partial: payload.partial === true || failedCount > 0,
  };
}

export function formatStoryAge(timestamp, now = Date.now(), locale = 'tr-TR') {
  const seconds = asTimestamp(timestamp);
  if (!seconds) return '';
  const differenceMinutes = Math.max(0, Math.round((now - (seconds * 1000)) / 60_000));
  const formatter = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  if (differenceMinutes < 60) return formatter.format(-differenceMinutes, 'minute');
  return formatter.format(-Math.round(differenceMinutes / 60), 'hour');
}
