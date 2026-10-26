import {
  STORAGE_KEYS,
  COLLECTION_KINDS,
  validateCollection,
  buildSnapshot,
  getNonFollowers,
  diffSnapshots,
  filterAndSortUsers,
  formatSnapshotLabel,
} from './lib/core.js?v=0.3.1';
import { validateStoryCollection, formatStoryAge } from './lib/stories.js?v=0.3.1';
import { applyDocumentTranslations, localizeError, normalizeLocale } from './lib/i18n.js?v=0.3.1';

const PAGE_COPY = {
  en: {
    overview: ['CURRENT STATUS', 'Overview', 'Review follow relationships in one place.'],
    'non-followers': ['RELATIONSHIP ANALYSIS', 'Not following back', 'Visible accounts you follow that do not follow you back.'],
    changes: ['SNAPSHOT COMPARISON', 'Changes', 'Review follow changes between two dates.'],
    stories: ['ACTIVE STORIES', 'Stories', 'View active photos and videos from accounts you follow.'],
    data: ['LOCAL DATA MANAGEMENT', 'Data and snapshots', 'Collect automatically from Instagram or import JSON.'],
  },
  tr: {
    overview: ['GÜNCEL DURUM', 'Genel bakış', 'Takip ilişkilerini tek ekranda inceleyin.'],
    'non-followers': ['İLİŞKİ ANALİZİ', 'Geri takip etmeyenler', 'Takip ettiğiniz fakat sizi takip etmeyen görünür hesaplar.'],
    changes: ['SNAPSHOT KARŞILAŞTIRMASI', 'Değişiklikler', 'İki tarih arasındaki takip değişimlerini inceleyin.'],
    stories: ['AKTİF HİKÂYELER', 'Hikâyeler', 'Takip ettiğiniz hesapların aktif fotoğraf ve videolarını görüntüleyin.'],
    data: ['YEREL VERİ YÖNETİMİ', 'Veri ve snapshot’lar', 'Instagram arayüzünden otomatik toplayın veya JSON içe aktarın.'],
  },
};

const state = {
  view: 'overview',
  draft: { followers: null, following: null },
  snapshots: [],
  activeSnapshotId: 'draft',
  previousSnapshotId: '',
  currentSnapshotId: '',
  changeGroup: 'lostFollowers',
  nonFollowersQuery: '',
  nonFollowersSort: 'source',
  stories: null,
  storyViewer: { groupIndex: -1, itemIndex: 0 },
  locale: 'en',
};

const elements = {};
let toastTimer = null;

const storage = {
  async get(keys) {
    if (globalThis.chrome?.storage?.local) {
      return chrome.storage.local.get(keys);
    }
    return Object.fromEntries(keys.map((key) => {
      try {
        return [key, JSON.parse(localStorage.getItem(key) ?? 'null')];
      } catch {
        return [key, null];
      }
    }));
  },
  async set(values) {
    if (globalThis.chrome?.storage?.local) {
      await chrome.storage.local.set(values);
      return;
    }
    Object.entries(values).forEach(([key, value]) => localStorage.setItem(key, JSON.stringify(value)));
  },
};

function $(selector) {
  return document.querySelector(selector);
}

function $all(selector) {
  return [...document.querySelectorAll(selector)];
}

function cacheElements() {
  elements.pageEyebrow = $('#page-eyebrow');
  elements.pageTitle = $('#page-title');
  elements.pageSubtitle = $('#page-subtitle');
  elements.globalWarning = $('#global-warning');
  elements.activeSnapshotSelect = $('#active-snapshot-select');
  elements.previousSnapshotSelect = $('#previous-snapshot-select');
  elements.currentSnapshotSelect = $('#current-snapshot-select');
  elements.nonFollowersList = $('#non-followers-list');
  elements.nonFollowersQuality = $('#non-followers-quality');
  elements.changesList = $('#changes-list');
  elements.changesQuality = $('#changes-quality');
  elements.snapshotList = $('#snapshot-list');
  elements.storiesGrid = $('#stories-grid');
  elements.storiesStatus = $('#stories-status');
  elements.storyModal = $('#story-modal');
  elements.storyStage = $('#story-stage');
  elements.storyProgress = $('#story-progress');
  elements.languageSelect = $('#language-select');
  elements.toast = $('#toast');
}

function localized(en, tr) {
  return state.locale === 'tr' ? tr : en;
}

function localeTag() {
  return state.locale === 'tr' ? 'tr-TR' : 'en-US';
}

function snapshotLabel(snapshot) {
  return formatSnapshotLabel(snapshot, localeTag());
}

function showToast(message, type = 'info') {
  clearTimeout(toastTimer);
  elements.toast.textContent = message;
  elements.toast.classList.toggle('error', type === 'error');
  elements.toast.classList.add('is-visible');
  toastTimer = setTimeout(() => elements.toast.classList.remove('is-visible'), 3600);
}

function setNotice(element, message, type = 'info') {
  if (!message) {
    element.textContent = '';
    element.classList.add('is-hidden');
    element.classList.remove('warning');
    return;
  }
  element.textContent = message;
  element.classList.remove('is-hidden');
  element.classList.toggle('warning', type === 'warning');
}

function getDraftSnapshot() {
  if (!state.draft.followers || !state.draft.following) return null;
  return {
    id: 'draft',
    version: 1,
    label: localized('Unsaved current data', 'Kaydedilmemiş güncel veri'),
    account: state.draft.followers.account || state.draft.following.account,
    created_at: [state.draft.followers.captured_at, state.draft.following.captured_at].sort().at(-1),
    complete: state.draft.followers.complete && state.draft.following.complete,
    followers: state.draft.followers,
    following: state.draft.following,
  };
}

function getSnapshotById(id) {
  if (id === 'draft') return getDraftSnapshot();
  return state.snapshots.find((snapshot) => snapshot.id === id) ?? null;
}

function getActiveSnapshot() {
  return getSnapshotById(state.activeSnapshotId) ?? state.snapshots[0] ?? getDraftSnapshot();
}

function formatCount(collection) {
  if (!collection) return '—';
  const expected = collection.expected_count;
  return expected !== null && expected !== collection.extracted_count
    ? `${collection.extracted_count}/${expected}`
    : String(collection.extracted_count);
}

function qualityText(collection) {
  if (!collection) return localized('Waiting for list', 'Liste bekleniyor');
  if (collection.complete) return localized('Complete list', 'Tam liste');
  if (collection.expected_count !== null) return localized(`${collection.extracted_count}/${collection.expected_count} visible accounts`, `${collection.extracted_count}/${collection.expected_count} görünür hesap`);
  return localized(`${collection.extracted_count} accounts · completeness not verified`, `${collection.extracted_count} hesap · tamlık doğrulanamadı`);
}

function collectionCoverage(collection) {
  if (!collection) return 0;
  if (!collection.expected_count) return collection.extracted_count ? 100 : 0;
  return Math.min(100, Math.round((collection.extracted_count / collection.expected_count) * 100));
}

function setView(view) {
  if (!PAGE_COPY[state.locale]?.[view]) return;
  state.view = view;
  $all('[data-view-panel]').forEach((panel) => panel.classList.toggle('is-active', panel.dataset.viewPanel === view));
  $all('.nav-item[data-view]').forEach((button) => button.classList.toggle('is-active', button.dataset.view === view));
  const [eyebrow, title, subtitle] = PAGE_COPY[state.locale][view];
  elements.pageEyebrow.textContent = eyebrow;
  elements.pageTitle.textContent = title;
  elements.pageSubtitle.textContent = subtitle;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function createEmptyState(title, detail) {
  const container = document.createElement('div');
  container.className = 'empty-state';
  const content = document.createElement('div');
  const strong = document.createElement('strong');
  strong.textContent = title;
  const span = document.createElement('span');
  span.textContent = detail;
  content.append(strong, span);
  container.append(content);
  return container;
}

function createPersonCard(user) {
  const link = document.createElement('a');
  link.className = 'person-card';
  link.href = `https://www.instagram.com/${encodeURIComponent(user.username)}/`;
  link.target = '_blank';
  link.rel = 'noreferrer';

  const createAvatar = (url, extraClass = '') => {
    const avatar = document.createElement('span');
    avatar.className = `avatar-wrap ${extraClass}`.trim();
    avatar.textContent = user.username.slice(0, 1).toUpperCase();
    if (!url) return avatar;
    const image = document.createElement('img');
    image.src = url;
    image.alt = '';
    image.loading = 'lazy';
    image.referrerPolicy = 'no-referrer';
    image.addEventListener('error', () => image.remove(), { once: true });
    avatar.append(image);
    return avatar;
  };

  const avatar = document.createElement('span');
  avatar.className = user.previous_profile_pic_url ? 'avatar-comparison' : 'avatar-single';
  if (user.previous_profile_pic_url) {
    avatar.append(createAvatar(user.previous_profile_pic_url, 'previous-photo'));
    const arrow = document.createElement('span');
    arrow.className = 'avatar-change-arrow';
    arrow.textContent = '→';
    avatar.append(arrow, createAvatar(user.profile_pic_url, 'current-photo'));
  } else {
    avatar.append(createAvatar(user.profile_pic_url));
  }

  const info = document.createElement('span');
  info.className = 'person-info';
  const username = document.createElement('strong');
  username.textContent = `@${user.username}`;
  const fullName = document.createElement('span');
  fullName.textContent = user.full_name || localized('No display name', 'Görünen ad yok');
  info.append(username, fullName);

  link.append(avatar, info);
  if (user.is_verified) {
    const badge = document.createElement('span');
    badge.className = 'person-badge';
    badge.title = localized('Verified account', 'Doğrulanmış hesap');
    badge.textContent = '✓';
    link.append(badge);
  }
  return link;
}

function renderUserList(container, users, emptyTitle, emptyDetail) {
  container.replaceChildren();
  if (!users.length) {
    container.append(createEmptyState(emptyTitle, emptyDetail));
    return;
  }
  const fragment = document.createDocumentFragment();
  users.forEach((user) => fragment.append(createPersonCard(user)));
  container.append(fragment);
}

function createStoryCard(group, groupIndex) {
  const firstItem = group.items[0];
  const button = document.createElement('button');
  button.className = 'story-card';
  button.type = 'button';
  button.dataset.storyGroupIndex = String(groupIndex);
  button.setAttribute('aria-label', localized(`Open @${group.username} stories`, `@${group.username} hikâyelerini aç`));

  const preview = document.createElement('span');
  preview.className = 'story-card-preview';
  const image = document.createElement('img');
  image.src = firstItem.display_url;
  image.alt = localized(`@${group.username} story preview`, `@${group.username} hikâye önizlemesi`);
  image.loading = 'lazy';
  image.referrerPolicy = 'no-referrer';
  image.addEventListener('error', () => {
    preview.classList.add('media-failed');
    image.remove();
  }, { once: true });
  preview.append(image);

  const mediaBadge = document.createElement('span');
  mediaBadge.className = 'story-media-badge';
  mediaBadge.textContent = group.items.some((item) => item.media_type === 'video') ? '▶' : '●';
  preview.append(mediaBadge);

  if (group.items.length > 1) {
    const count = document.createElement('span');
    count.className = 'story-count-badge';
    count.textContent = String(group.items.length);
    preview.append(count);
  }

  const account = document.createElement('span');
  account.className = 'story-card-account';
  const avatar = document.createElement('span');
  avatar.className = `story-avatar ${group.has_unseen ? 'unseen' : ''}`;
  avatar.textContent = group.username.slice(0, 1).toUpperCase();
  if (group.profile_pic_url) {
    const avatarImage = document.createElement('img');
    avatarImage.src = group.profile_pic_url;
    avatarImage.alt = '';
    avatarImage.loading = 'lazy';
    avatarImage.referrerPolicy = 'no-referrer';
    avatarImage.addEventListener('error', () => avatarImage.remove(), { once: true });
    avatar.append(avatarImage);
  }

  const text = document.createElement('span');
  text.className = 'story-account-text';
  const username = document.createElement('strong');
  username.textContent = `@${group.username}`;
  const meta = document.createElement('span');
  const age = formatStoryAge(firstItem.taken_at, Date.now(), localeTag());
  meta.textContent = [group.full_name, age].filter(Boolean).join(' · ') || localized(`${group.items.length} stories`, `${group.items.length} hikâye`);
  text.append(username, meta);
  account.append(avatar, text);
  button.append(preview, account);
  return button;
}

function renderStories() {
  elements.storiesGrid.replaceChildren();
  const collection = state.stories;
  $('#nav-stories-count').textContent = collection ? String(collection.account_count) : '0';

  if (!collection) {
    setNotice(elements.storiesStatus, localized('Press “Refresh stories” to collect current stories from Instagram Home.', 'Instagram ana sayfanızdaki güncel hikâyeleri almak için “Hikâyeleri yenile” düğmesine basın.'));
    elements.storiesGrid.append(createEmptyState(localized('Story data has not been collected', 'Hikâye verisi henüz alınmadı'), localized('A signed-in Instagram tab must be open.', 'Instagram’a giriş yapılmış bir sekme açık olmalıdır.')));
    return;
  }

  const captureTime = new Date(collection.captured_at).toLocaleString(localeTag());
  const retries = collection.retry_count
    ? localized(` · Retries: ${collection.retry_count}`, ` · Yeniden deneme: ${collection.retry_count}`)
    : '';
  const detail = localized(
    `Source: ${collection.source_count} · Resolved: ${collection.resolved_count} · Shown: ${collection.account_count} · Skipped: ${collection.skipped_count}${retries} · ${collection.item_count} stories · ${captureTime}`,
    `Kaynak: ${collection.source_count} · İşlenen: ${collection.resolved_count} · Gösterilen: ${collection.account_count} · Atlanan: ${collection.skipped_count}${retries} · ${collection.item_count} hikâye · ${captureTime}`,
  );
  const partialWarning = localized(
    `${collection.failed_count} source accounts could not be resolved; the result may be incomplete.`,
    `${collection.failed_count} kaynak hesap işlenemedi; sonuç eksik olabilir.`,
  );
  setNotice(
    elements.storiesStatus,
    collection.partial ? `${detail}. ${partialWarning}` : detail,
    collection.partial ? 'warning' : 'info',
  );

  if (!collection.groups.length) {
    elements.storiesGrid.append(createEmptyState(localized('No active stories found', 'Aktif hikâye bulunamadı'), localized('No playable media from followed accounts was found in the Instagram story tray.', 'Instagram hikâye şeridinde takip ettiğiniz bir hesaba ait oynatılabilir medya bulunmadı.')));
    return;
  }

  const fragment = document.createDocumentFragment();
  collection.groups.forEach((group, index) => fragment.append(createStoryCard(group, index)));
  elements.storiesGrid.append(fragment);
}

function renderStoryViewer() {
  const group = state.stories?.groups[state.storyViewer.groupIndex];
  const item = group?.items[state.storyViewer.itemIndex];
  if (!group || !item) {
    closeStoryViewer();
    return;
  }

  $('#story-viewer-username').textContent = `@${group.username}`;
  $('#story-viewer-meta').textContent = [
    formatStoryAge(item.taken_at, Date.now(), localeTag()),
    item.media_type === 'video' ? 'Video' : localized('Photo', 'Fotoğraf'),
  ].filter(Boolean).join(' · ');
  $('#story-position').textContent = `${state.storyViewer.itemIndex + 1} / ${group.items.length}`;
  $('#previous-story-button').disabled = state.storyViewer.itemIndex === 0;
  $('#next-story-button').disabled = state.storyViewer.itemIndex >= group.items.length - 1;

  const avatar = $('#story-viewer-avatar');
  avatar.replaceChildren();
  avatar.textContent = group.username.slice(0, 1).toUpperCase();
  if (group.profile_pic_url) {
    const image = document.createElement('img');
    image.src = group.profile_pic_url;
    image.alt = '';
    image.referrerPolicy = 'no-referrer';
    image.addEventListener('error', () => image.remove(), { once: true });
    avatar.append(image);
  }

  elements.storyProgress.replaceChildren();
  group.items.forEach((_, index) => {
    const segment = document.createElement('span');
    if (index <= state.storyViewer.itemIndex) segment.classList.add('is-active');
    elements.storyProgress.append(segment);
  });

  elements.storyStage.replaceChildren();
  if (item.media_type === 'video') {
    const video = document.createElement('video');
    video.src = item.video_url;
    video.poster = item.display_url;
    video.controls = true;
    video.autoplay = true;
    video.muted = true;
    video.playsInline = true;
    video.preload = 'metadata';
    video.referrerPolicy = 'no-referrer';
    elements.storyStage.append(video);
  } else {
    const image = document.createElement('img');
    image.src = item.display_url;
    image.alt = localized(`@${group.username} story`, `@${group.username} hikâyesi`);
    image.referrerPolicy = 'no-referrer';
    elements.storyStage.append(image);
  }
}

function openStoryViewer(groupIndex) {
  if (!state.stories?.groups[groupIndex]) return;
  state.storyViewer = { groupIndex, itemIndex: 0 };
  elements.storyModal.classList.remove('is-hidden');
  document.body.classList.add('modal-open');
  renderStoryViewer();
}

function closeStoryViewer() {
  elements.storyStage?.querySelector('video')?.pause();
  elements.storyModal.classList.add('is-hidden');
  document.body.classList.remove('modal-open');
  state.storyViewer = { groupIndex: -1, itemIndex: 0 };
}

function moveStoryViewer(delta) {
  const group = state.stories?.groups[state.storyViewer.groupIndex];
  if (!group) return;
  const nextIndex = state.storyViewer.itemIndex + delta;
  if (nextIndex < 0 || nextIndex >= group.items.length) return;
  state.storyViewer.itemIndex = nextIndex;
  renderStoryViewer();
}

function renderSnapshotOptions() {
  const draft = getDraftSnapshot();
  const options = [];
  if (draft) options.push(draft);
  options.push(...state.snapshots);

  if (!options.length) {
    elements.activeSnapshotSelect.replaceChildren(new Option(localized('No snapshot', 'Snapshot yok'), '', true, true));
    elements.activeSnapshotSelect.disabled = true;
  } else {
    elements.activeSnapshotSelect.disabled = false;
    elements.activeSnapshotSelect.replaceChildren(...options.map((snapshot) => new Option(
      snapshotLabel(snapshot),
      snapshot.id,
      false,
      snapshot.id === state.activeSnapshotId,
    )));
    if (!options.some((snapshot) => snapshot.id === state.activeSnapshotId)) {
      state.activeSnapshotId = options[0].id;
      elements.activeSnapshotSelect.value = state.activeSnapshotId;
    }
  }

  const savedOptions = state.snapshots.map((snapshot) => new Option(snapshotLabel(snapshot), snapshot.id));
  elements.previousSnapshotSelect.replaceChildren(...savedOptions.map((option) => option.cloneNode(true)));
  elements.currentSnapshotSelect.replaceChildren(...savedOptions.map((option) => option.cloneNode(true)));
  elements.previousSnapshotSelect.disabled = state.snapshots.length < 2;
  elements.currentSnapshotSelect.disabled = state.snapshots.length < 2;

  if (state.snapshots.length >= 2) {
    if (!state.snapshots.some((snapshot) => snapshot.id === state.currentSnapshotId)) {
      state.currentSnapshotId = state.snapshots[0].id;
    }
    if (!state.snapshots.some((snapshot) => snapshot.id === state.previousSnapshotId) || state.previousSnapshotId === state.currentSnapshotId) {
      state.previousSnapshotId = state.snapshots[1].id;
    }
    elements.previousSnapshotSelect.value = state.previousSnapshotId;
    elements.currentSnapshotSelect.value = state.currentSnapshotId;
  }
}

function renderOverview() {
  const snapshot = getActiveSnapshot();
  const followers = snapshot?.followers ?? state.draft.followers;
  const following = snapshot?.following ?? state.draft.following;
  const nonFollowers = snapshot ? getNonFollowers(snapshot) : { users: [], reliable: false };
  const mutualCount = snapshot
    ? snapshot.following.users.length - nonFollowers.users.length
    : null;

  $('#metric-followers').textContent = formatCount(followers);
  $('#metric-following').textContent = formatCount(following);
  $('#metric-non-followers').textContent = snapshot ? String(nonFollowers.users.length) : '—';
  $('#metric-mutual').textContent = mutualCount === null ? '—' : String(mutualCount);
  $('#metric-followers-meta').textContent = qualityText(followers);
  $('#metric-following-meta').textContent = qualityText(following);
  $('#metric-non-followers-meta').textContent = snapshot
    ? (nonFollowers.reliable ? localized('Follower list verified', 'Takipçi listesi doğrulandı') : localized('Follower data may be incomplete', 'Eksik takipçi verisi olabilir'))
    : localized('Waiting for comparison', 'Karşılaştırma bekleniyor');
  $('#nav-non-followers-count').textContent = snapshot ? String(nonFollowers.users.length) : '0';

  const title = $('#overview-snapshot-title');
  const summary = $('#overview-summary');
  const qualityPill = $('#overview-quality-pill');
  const coverage = $('#overview-coverage');
  coverage.replaceChildren();

  if (!snapshot) {
    title.textContent = localized('No data yet', 'Henüz veri yok');
    summary.textContent = localized('Add the Followers and Following lists to create your first snapshot.', 'Followers ve Following listelerini ekleyerek ilk snapshot’ı oluşturun.');
    qualityPill.textContent = localized('Waiting', 'Bekleniyor');
    qualityPill.className = 'quality-pill';
    setNotice(elements.globalWarning, '');
    return;
  }

  title.textContent = snapshotLabel(snapshot);
  summary.textContent = localized(
    `Comparing ${snapshot.followers.extracted_count} followers and ${snapshot.following.extracted_count} following accounts for @${snapshot.account || 'account'}.`,
    `@${snapshot.account || 'hesap'} için ${snapshot.followers.extracted_count} takipçi ve ${snapshot.following.extracted_count} takip edilen hesap karşılaştırılıyor.`,
  );
  qualityPill.textContent = snapshot.complete ? localized('Complete data', 'Tam veri') : localized('Incomplete data', 'Eksik veri');
  qualityPill.className = `quality-pill ${snapshot.complete ? 'complete' : 'incomplete'}`;

  [
    [localized('Followers', 'Takipçiler'), snapshot.followers],
    [localized('Following', 'Takip edilenler'), snapshot.following],
  ].forEach(([label, collection]) => {
    const row = document.createElement('div');
    row.className = 'coverage-row';
    const name = document.createElement('span');
    name.textContent = label;
    const track = document.createElement('span');
    track.className = 'coverage-track';
    const bar = document.createElement('span');
    bar.className = 'coverage-bar';
    bar.style.width = `${collectionCoverage(collection)}%`;
    track.append(bar);
    const count = document.createElement('strong');
    count.textContent = formatCount(collection);
    row.append(name, track, count);
    coverage.append(row);
  });

  setNotice(
    elements.globalWarning,
    snapshot.complete ? '' : localized('At least one list in this snapshot does not match the profile count. Results are limited to visible accounts and must not be treated as a definitive lost-account result.', 'Bu snapshot’taki listelerden en az biri profil sayacıyla eşleşmiyor. Sonuçlar görünür hesaplarla sınırlıdır; kesin kayıp hesabı sonucu olarak kullanılmamalıdır.'),
    'warning',
  );
}

function renderNonFollowers() {
  const snapshot = getActiveSnapshot();
  if (!snapshot) {
    setNotice(elements.nonFollowersQuality, '');
    renderUserList(elements.nonFollowersList, [], localized('No data to compare', 'Karşılaştırılacak veri yok'), localized('Add the Followers and Following lists first.', 'Önce Followers ve Following listelerini ekleyin.'));
    return;
  }
  const result = getNonFollowers(snapshot);
  const users = filterAndSortUsers(result.users, state.nonFollowersQuery, state.nonFollowersSort);
  const expectedText = result.coverage?.expected && result.coverage.expected !== result.coverage.evaluated
    ? localized(` ${result.coverage.evaluated}/${result.coverage.expected} visible following accounts were evaluated.`, ` ${result.coverage.evaluated}/${result.coverage.expected} görünür takip edilen hesap değerlendirildi.`)
    : '';
  setNotice(
    elements.nonFollowersQuality,
    result.reliable
      ? localized(`The follower list is complete. This result is reliable for visible following accounts.${expectedText}`, `Takipçi listesi tam. Bu sonuç görünür takip edilen hesaplar için güvenilirdir.${expectedText}`)
      : localized(`Because the follower list is incomplete, this section may contain false positives.${expectedText}`, `Takipçi listesi eksik olduğu için bu bölüm yanlış pozitif hesaplar içerebilir.${expectedText}`),
    result.reliable ? 'info' : 'warning',
  );
  renderUserList(elements.nonFollowersList, users, localized('No matching accounts', 'Eşleşen hesap yok'), state.nonFollowersQuery ? localized('Change the search criteria.', 'Arama ölçütünü değiştirin.') : localized('No visible account that does not follow you back was found.', 'Görünür listede sizi geri takip etmeyen hesap bulunmadı.'));
}

function renderChanges() {
  const previous = getSnapshotById(state.previousSnapshotId);
  const current = getSnapshotById(state.currentSnapshotId);
  const diff = diffSnapshots(previous, current);
  Object.entries(diff).forEach(([key, value]) => {
    const count = $(`#change-count-${key}`);
    if (count) count.textContent = String(value.users.length);
  });

  const selected = diff[state.changeGroup];
  if (!previous || !current) {
    setNotice(elements.changesQuality, '');
    renderUserList(elements.changesList, [], localized('At least two snapshots are required', 'En az iki snapshot gerekli'), localized('Collect lists on two different dates and save them as snapshots.', 'İki farklı tarihte liste toplayıp snapshot olarak kaydedin.'));
    return;
  }
  if (previous.id === current.id) {
    setNotice(elements.changesQuality, localized('Select two different snapshots for comparison.', 'Karşılaştırma için iki farklı snapshot seçin.'), 'warning');
    renderUserList(elements.changesList, [], localized('The same snapshot is selected', 'Aynı snapshot seçildi'), localized('Select different records in Previous and Current.', 'Önceki ve güncel alanlarında farklı kayıtlar seçin.'));
    return;
  }

  setNotice(
    elements.changesQuality,
    selected.reliable
      ? localized(`Showing the verified difference between ${snapshotLabel(previous)} and ${snapshotLabel(current)}.`, `${snapshotLabel(previous)} ile ${snapshotLabel(current)} arasındaki doğrulanmış fark gösteriliyor.`)
      : localized('At least one snapshot in this change group is incomplete. Treat the result as a possible change, not a definitive one.', 'Bu değişiklik grubundaki snapshot’lardan en az biri eksik. Sonuç olası değişikliktir; kesin kabul edilmemelidir.'),
    selected.reliable ? 'info' : 'warning',
  );
  renderUserList(elements.changesList, selected.users, localized('No changes in this group', 'Bu grupta değişiklik yok'), localized('No matching change was found between the selected snapshots.', 'Seçilen iki snapshot arasında eşleşen bir değişiklik bulunmadı.'));
}

function renderCaptureStatus(kind) {
  const collection = state.draft[kind];
  const card = $(`#${kind}-capture-card`);
  const status = $(`#${kind}-capture-status`);
  card.classList.remove('is-ready', 'is-incomplete');
  status.classList.remove('complete', 'incomplete');
  if (!collection) {
    status.textContent = localized('Not added yet', 'Henüz eklenmedi');
    return;
  }
  const message = `${qualityText(collection)} · ${new Date(collection.captured_at).toLocaleString(localeTag())}`;
  status.textContent = message;
  const qualityClass = collection.complete ? 'complete' : 'incomplete';
  status.classList.add(qualityClass);
  card.classList.add(collection.complete ? 'is-ready' : 'is-incomplete');
}

function createSnapshotRow(snapshot) {
  const row = document.createElement('div');
  row.className = 'snapshot-row';

  const main = document.createElement('div');
  main.className = 'snapshot-main';
  const title = document.createElement('strong');
  title.textContent = snapshotLabel(snapshot);
  const meta = document.createElement('span');
  meta.textContent = localized(`@${snapshot.account || 'account'} · ${formatCount(snapshot.followers)} followers · ${formatCount(snapshot.following)} following`, `@${snapshot.account || 'hesap'} · ${formatCount(snapshot.followers)} takipçi · ${formatCount(snapshot.following)} takip edilen`);
  main.append(title, meta);

  const actions = document.createElement('div');
  actions.className = 'snapshot-actions';
  const badge = document.createElement('span');
  badge.className = `status-badge ${snapshot.complete ? 'complete' : 'incomplete'}`;
  badge.textContent = snapshot.complete ? localized('Complete', 'Tam') : localized('Incomplete', 'Eksik');
  const exportButton = document.createElement('button');
  exportButton.className = 'button secondary';
  exportButton.type = 'button';
  exportButton.textContent = localized('Export', 'Dışa aktar');
  exportButton.dataset.exportSnapshot = snapshot.id;
  const deleteButton = document.createElement('button');
  deleteButton.className = 'button danger';
  deleteButton.type = 'button';
  deleteButton.textContent = localized('Delete', 'Sil');
  deleteButton.dataset.deleteSnapshot = snapshot.id;
  actions.append(badge, exportButton, deleteButton);
  row.append(main, actions);
  return row;
}

function renderData() {
  renderCaptureStatus(COLLECTION_KINDS.followers);
  renderCaptureStatus(COLLECTION_KINDS.following);
  $('#save-snapshot-button').disabled = !(state.draft.followers && state.draft.following);

  elements.snapshotList.replaceChildren();
  if (!state.snapshots.length) {
    elements.snapshotList.append(createEmptyState(localized('No snapshots', 'Snapshot yok'), localized('Add both lists, then save your first snapshot.', 'İki listeyi ekledikten sonra ilk snapshot’ı kaydedin.')));
    return;
  }
  const fragment = document.createDocumentFragment();
  state.snapshots.forEach((snapshot) => fragment.append(createSnapshotRow(snapshot)));
  elements.snapshotList.append(fragment);
}

function renderAll() {
  renderSnapshotOptions();
  renderOverview();
  renderNonFollowers();
  renderChanges();
  renderStories();
  renderData();
}

async function setLanguage(locale, persist = true) {
  state.locale = normalizeLocale(locale);
  document.documentElement.lang = state.locale;
  elements.languageSelect.value = state.locale;
  applyDocumentTranslations(document, state.locale);
  setView(state.view);
  renderAll();
  if (persist) {
    await storage.set({ [STORAGE_KEYS.preferences]: { locale: state.locale } });
  }
}

async function persistDraft() {
  await storage.set({ [STORAGE_KEYS.draft]: state.draft });
}

async function importCollection(file, expectedKind) {
  const text = await file.text();
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(localized('The JSON file could not be read.', 'JSON dosyası okunamadı.'));
  }
  const collection = validateCollection(parsed, expectedKind);
  state.draft[expectedKind] = collection;
  state.activeSnapshotId = 'draft';
  await persistDraft();
  renderAll();
  showToast(localized(
    `${expectedKind === 'followers' ? 'Follower' : 'Following'} list added: ${collection.extracted_count} accounts.`,
    `${expectedKind === 'followers' ? 'Takipçi' : 'Takip edilen'} listesi eklendi: ${collection.extracted_count} hesap.`,
  ));
}

function downloadJson(filename, payload) {
  const blob = new Blob([`${JSON.stringify(payload, null, 2)}\n`], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function safeFilenamePart(value) {
  return String(value || 'instagram').replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'instagram';
}

async function saveSnapshot() {
  if (!state.draft.followers || !state.draft.following) return;
  const isIncomplete = !state.draft.followers.complete || !state.draft.following.complete;
  if (isIncomplete) {
    const approved = window.confirm(localized('At least one list does not match the profile count. The snapshot will be saved, but change results will not be definitive. Continue?', 'Listelerden en az biri profil sayacıyla eşleşmiyor. Snapshot kaydedilecek ancak değişiklik sonuçları kesin kabul edilmeyecek. Devam edilsin mi?'));
    if (!approved) return;
  }

  const snapshot = buildSnapshot({
    followers: state.draft.followers,
    following: state.draft.following,
    label: $('#snapshot-label').value,
  });
  const nextSnapshots = [snapshot, ...state.snapshots];
  await storage.set({ [STORAGE_KEYS.snapshots]: nextSnapshots });
  state.snapshots = nextSnapshots;
  state.activeSnapshotId = snapshot.id;
  state.currentSnapshotId = snapshot.id;
  state.previousSnapshotId = state.snapshots[1]?.id ?? '';
  $('#snapshot-label').value = '';
  renderAll();
  showToast(localized('Snapshot saved locally.', 'Snapshot yerel olarak kaydedildi.'));
}

async function deleteSnapshot(id) {
  const snapshot = getSnapshotById(id);
  if (!snapshot) return;
  const approved = window.confirm(localized(`Delete “${snapshotLabel(snapshot)}” from this device? This action cannot be undone.`, `“${snapshotLabel(snapshot)}” snapshot’ı bu cihazdan silinsin mi? Bu işlem geri alınamaz.`));
  if (!approved) return;
  const nextSnapshots = state.snapshots.filter((item) => item.id !== id);
  await storage.set({ [STORAGE_KEYS.snapshots]: nextSnapshots });
  state.snapshots = nextSnapshots;
  if (state.activeSnapshotId === id) state.activeSnapshotId = state.snapshots[0]?.id ?? (getDraftSnapshot() ? 'draft' : '');
  renderAll();
  showToast(localized('Snapshot deleted.', 'Snapshot silindi.'));
}

async function openInstagram() {
  if (!globalThis.chrome?.tabs) {
    window.open('https://www.instagram.com/', '_blank', 'noreferrer');
    return;
  }
  const tabs = await chrome.tabs.query({ url: 'https://www.instagram.com/*' });
  const tab = tabs.sort((a, b) => (b.lastAccessed ?? 0) - (a.lastAccessed ?? 0))[0];
  if (tab?.id) {
    await chrome.tabs.update(tab.id, { active: true });
    if (typeof tab.windowId === 'number') await chrome.windows.update(tab.windowId, { focused: true });
    return;
  }
  await chrome.tabs.create({ url: 'https://www.instagram.com/' });
}

async function refreshStoriesFromInstagram(button) {
  if (!globalThis.chrome?.scripting || !globalThis.chrome?.tabs) {
    throw new Error(localized('Story collection is available only in the installed Chrome extension.', 'Hikâye toplama yalnızca kurulu Chrome eklentisinde kullanılabilir.'));
  }

  const tabs = (await chrome.tabs.query({ url: 'https://www.instagram.com/*' }))
    .sort((a, b) => {
      const aHome = a.url === 'https://www.instagram.com/' ? 1 : 0;
      const bHome = b.url === 'https://www.instagram.com/' ? 1 : 0;
      return bHome - aHome || (b.lastAccessed ?? 0) - (a.lastAccessed ?? 0);
    });
  if (!tabs.length) throw new Error(localized('No open signed-in Instagram tab was found.', 'Instagram’a giriş yapılmış açık bir sekme bulunamadı.'));

  const activeSnapshot = getActiveSnapshot();
  const knownFollowing = (activeSnapshot?.following?.users ?? state.draft.following?.users ?? [])
    .map((user) => user.username);
  const dashboardTab = await chrome.tabs.getCurrent();
  const originalText = button.textContent;
  const startedAt = Date.now();
  button.disabled = true;
  button.textContent = localized('Collecting stories…', 'Hikâyeler alınıyor…');
  const elapsedTimer = setInterval(() => {
    const elapsedSeconds = Math.max(1, Math.round((Date.now() - startedAt) / 1000));
    button.textContent = localized(`Collecting stories… ${elapsedSeconds}s`, `Hikâyeler alınıyor… ${elapsedSeconds} sn`);
  }, 1000);

  try {
    let lastError = null;
    for (const tab of tabs) {
      if (!tab.id) continue;
      try {
        await chrome.tabs.update(tab.id, { active: true });
        if (typeof tab.windowId === 'number') await chrome.windows.update(tab.windowId, { focused: true });
        const results = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          world: 'MAIN',
          func: collectInstagramStories,
          args: [knownFollowing],
        });
        const result = results?.[0]?.result;
        if (!result?.ok) {
          lastError = new Error(result?.error ? localizeError(result.error, state.locale) : localized('Instagram stories could not be collected.', 'Instagram hikâyeleri alınamadı.'));
          continue;
        }
        state.stories = validateStoryCollection(result.collection);
        renderStories();
        showToast(localized(`${state.stories.item_count} stories loaded from ${state.stories.account_count} accounts.`, `${state.stories.account_count} hesaptan ${state.stories.item_count} hikâye yüklendi.`));
        return;
      } catch (error) {
        lastError = new Error(localizeError(error, state.locale));
      }
    }
    throw lastError ?? new Error(localized('No suitable Instagram tab provided story data.', 'Hikâye verisi sağlayan uygun Instagram sekmesi bulunamadı.'));
  } finally {
    clearInterval(elapsedTimer);
    button.disabled = false;
    button.textContent = originalText;
    if (dashboardTab?.id) {
      try {
        await chrome.tabs.update(dashboardTab.id, { active: true });
        if (typeof dashboardTab.windowId === 'number') await chrome.windows.update(dashboardTab.windowId, { focused: true });
      } catch { /* The dashboard may have been closed during collection. */ }
    }
  }
}

// This function runs in Instagram's main page world so it can reuse the active web session.
// It never returns cookies, request tokens, captions, replies, viewers or other private fields.
async function collectInstagramStories(knownFollowingUsernames = []) {
  const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
  const normalizeUsername = (value) => String(value ?? '').trim().replace(/^@/, '').toLocaleLowerCase('en-US');
  const knownFollowing = new Set((knownFollowingUsernames ?? []).map(normalizeUsername).filter(Boolean));
  const appHeaders = {
    'x-ig-app-id': '936619743392459',
    'x-requested-with': 'XMLHttpRequest',
  };

  if (location.hostname !== 'www.instagram.com') {
    return { ok: false, error: 'Bu sekme Instagram web sayfası değil.' };
  }
  if (typeof window.require !== 'function') {
    return { ok: false, error: 'Instagram sayfası henüz hazır değil. Sayfayı yenileyip tekrar deneyin.' };
  }

  const chooseLargestImage = (candidates) => [...(Array.isArray(candidates) ? candidates : [])]
    .filter((candidate) => typeof candidate?.url === 'string')
    .sort((a, b) => ((Number(b.width) || 0) * (Number(b.height) || 0)) - ((Number(a.width) || 0) * (Number(a.height) || 0)))[0] ?? null;

  try {
    const trayResponse = await fetch('/api/v1/feed/reels_tray/', {
      credentials: 'include',
      headers: appHeaders,
    });
    if (!trayResponse.ok) {
      return { ok: false, error: trayResponse.status === 401 ? 'Instagram oturumu açık değil.' : `Hikâye şeridi alınamadı (${trayResponse.status}).` };
    }
    const trayPayload = await trayResponse.json();
    if (!Array.isArray(trayPayload?.tray)) {
      return { ok: false, error: 'Instagram hikâye şeridi beklenen biçimde dönmedi.' };
    }

    const trayEntries = trayPayload.tray.filter((entry) => (
      entry?.id && entry?.user?.username && Number(entry?.media_count ?? entry?.media_ids?.length ?? 0) > 0
    ));
    if (!trayEntries.length) {
      return {
        ok: true,
        collection: {
          captured_at: new Date().toISOString(),
          groups: [],
          source_count: 0,
          resolved_count: 0,
          skipped_count: 0,
          failed_count: 0,
          retry_count: 0,
          partial: false,
        },
      };
    }

    const trayById = new Map(trayEntries.map((entry, index) => [String(entry.id), { entry, index }]));
    const groupsByUsername = new Map();
    const failedBatches = [];
    const resolvedReelIds = new Set();
    const batchSize = 10;
    const maxRetryDepth = 3;
    let retryCount = 0;
    let queryDocumentId = '29306733562261201';
    try {
      queryDocumentId = window.require('PolarisStoriesV3ReelPageGalleryQuery.graphql')?.params?.id || queryDocumentId;
    } catch { /* The route-specific query module is optional on the home page. */ }

    let communityNoteProvider = true;
    try {
      communityNoteProvider = window.require('PolarisCommunityNoteStoriesLabelEnabled.relayprovider')?.get() ?? true;
    } catch { /* Keep the live query's current fallback. */ }

    const processEdges = (edges) => {
      edges.forEach((edge) => {
        const node = edge?.node;
        const nodeId = String(node?.id ?? '');
        if (nodeId) resolvedReelIds.add(nodeId);
        const user = node?.user;
        const username = String(user?.username ?? '').trim();
        const usernameKey = normalizeUsername(username);
        const trayMatch = trayById.get(nodeId);
        const liveFollowing = user?.friendship_status?.following === true;
        const following = liveFollowing || knownFollowing.has(usernameKey);
        if (!usernameKey || !following || !Array.isArray(node?.items)) return;

        const items = node.items.map((item) => {
          const image = chooseLargestImage(item?.image_versions2?.candidates);
          const video = (Array.isArray(item?.video_versions) ? item.video_versions : [])
            .find((candidate) => typeof candidate?.url === 'string');
          if (!image?.url) return null;
          const isVideo = Number(item?.media_type) === 2 || Boolean(video?.url);
          if (isVideo && !video?.url) return null;
          return {
            id: String(item?.pk ?? item?.id ?? ''),
            media_type: isVideo ? 'video' : 'image',
            display_url: image.url,
            video_url: isVideo ? video.url : '',
            taken_at: Number(item?.taken_at) || null,
            expires_at: Number(item?.expiring_at) || null,
            width: Number(item?.original_width ?? image.width) || 0,
            height: Number(item?.original_height ?? image.height) || 0,
            has_audio: item?.has_audio === true,
            seen: Number(node?.seen) >= Number(item?.taken_at),
          };
        }).filter(Boolean);
        if (!items.length) return;

        groupsByUsername.set(usernameKey, {
          source_index: trayMatch?.index ?? groupsByUsername.size,
          username,
          full_name: String(trayMatch?.entry?.user?.full_name ?? ''),
          profile_pic_url: String(user?.profile_pic_url ?? trayMatch?.entry?.user?.profile_pic_url ?? ''),
          is_verified: user?.is_verified === true,
          is_private: user?.is_private === true,
          following: true,
          items,
        });
      });
    };

    const requestBatch = async (inputBatch, retryDepth = 0) => {
      const batch = inputBatch.filter((entry) => !resolvedReelIds.has(String(entry.id)));
      if (!batch.length) return;
      const reelIds = batch.map((entry) => String(entry.id));
      const operationName = 'PolarisStoriesV3ReelPageGalleryQuery';
      const variables = {
        initial_reel_id: reelIds[0],
        reel_ids: reelIds,
        first: reelIds.length,
        last: 2,
        is_highlight: false,
        __relay_internal__pv__PolarisCommunityNoteStoriesLabelEnabledrelayprovider: communityNoteProvider,
      };

      try {
        const requestParams = window.require('getAsyncParams')('POST');
        requestParams.av = window.require('CurrentUserInitialData').USER_ID;
        requestParams.fb_api_caller_class = 'RelayModern';
        requestParams.fb_api_req_friendly_name = operationName;
        requestParams.server_timestamps = 'true';
        requestParams.variables = JSON.stringify(variables);
        requestParams.doc_id = queryDocumentId;

        const body = new URLSearchParams();
        Object.entries(requestParams).forEach(([key, value]) => {
          if (value !== undefined && value !== null) body.append(key, String(value));
        });
        const graphResponse = await fetch('/graphql/query', {
          method: 'POST',
          credentials: 'include',
          headers: {
            'content-type': 'application/x-www-form-urlencoded',
            'x-fb-friendly-name': operationName,
            'x-fb-lsd': window.require('LSD').token,
            'x-ig-app-id': '936619743392459',
          },
          body,
        });
        let responseText = await graphResponse.text();
        if (responseText.startsWith('for (;;);')) responseText = responseText.slice(9);
        const graphPayload = JSON.parse(responseText);
        const connection = graphPayload?.data?.xdt_api__v1__feed__reels_media__connection;
        if (!graphResponse.ok || !Array.isArray(connection?.edges)) {
          throw new Error('Instagram hikâye medya sorgusu değişmiş olabilir.');
        }
        processEdges(connection.edges);

        const returnedIds = new Set(connection.edges.map((edge) => String(edge?.node?.id ?? '')).filter(Boolean));
        const missingEntries = batch.filter((entry) => !returnedIds.has(String(entry.id)));
        if (missingEntries.length) {
          if (retryDepth >= maxRetryDepth) {
            failedBatches.push({ size: missingEntries.length, message: 'Instagram hikâye medya sorgusu bazı hesapları döndürmedi.' });
            return;
          }
          const midpoint = Math.max(1, Math.ceil(missingEntries.length / 2));
          const retryGroups = missingEntries.length === 1
            ? [missingEntries]
            : [missingEntries.slice(0, midpoint), missingEntries.slice(midpoint)].filter((group) => group.length);
          for (const retryGroup of retryGroups) {
            retryCount += 1;
            await sleep(450 + (retryDepth * 250));
            await requestBatch(retryGroup, retryDepth + 1);
          }
        }
      } catch (error) {
        if (retryDepth < maxRetryDepth) {
          const midpoint = Math.max(1, Math.ceil(batch.length / 2));
          const retryGroups = batch.length === 1
            ? [batch]
            : [batch.slice(0, midpoint), batch.slice(midpoint)].filter((group) => group.length);
          for (const retryGroup of retryGroups) {
            retryCount += 1;
            await sleep(650 + (retryDepth * 300));
            await requestBatch(retryGroup, retryDepth + 1);
          }
          return;
        }
        failedBatches.push({ size: batch.length, message: String(error?.message ?? error) });
      }
    };

    for (let offset = 0; offset < trayEntries.length; offset += batchSize) {
      const batch = trayEntries.slice(offset, offset + batchSize);
      await requestBatch(batch);
      if (offset + batchSize < trayEntries.length) await sleep(850);
    }

    const groups = [...groupsByUsername.values()].sort((a, b) => a.source_index - b.source_index);
    if (!groups.length && failedBatches.length) {
      return { ok: false, error: 'Hikâye medyası alınamadı. Instagram sorgusu değişmiş veya hesap geçici olarak sınırlandırılmış olabilir.' };
    }

    const failedCount = trayEntries.filter((entry) => !resolvedReelIds.has(String(entry.id))).length;
    return {
      ok: true,
      collection: {
        captured_at: new Date().toISOString(),
        groups,
        source_count: trayEntries.length,
        resolved_count: resolvedReelIds.size,
        skipped_count: Math.max(0, trayEntries.length - groups.length),
        failed_count: failedCount,
        retry_count: retryCount,
        partial: failedBatches.length > 0 || failedCount > 0,
      },
    };
  } catch (error) {
    return { ok: false, error: error?.message || 'Instagram hikâyeleri alınamadı.' };
  }
}

async function captureFromInstagram(expectedKind, button) {
  if (!globalThis.chrome?.scripting || !globalThis.chrome?.tabs) {
    throw new Error(localized('Automatic collection is available only in the installed Chrome extension.', 'Otomatik toplama yalnızca kurulu Chrome eklentisinde kullanılabilir.'));
  }

  const tabs = (await chrome.tabs.query({ url: 'https://www.instagram.com/*' }))
    .sort((a, b) => {
      const aProfile = /^https:\/\/www\.instagram\.com\/[A-Za-z0-9._]+\/?(?:followers|following)?\/?(?:\?.*)?$/.test(a.url ?? '') ? 1 : 0;
      const bProfile = /^https:\/\/www\.instagram\.com\/[A-Za-z0-9._]+\/?(?:followers|following)?\/?(?:\?.*)?$/.test(b.url ?? '') ? 1 : 0;
      return bProfile - aProfile || (b.lastAccessed ?? 0) - (a.lastAccessed ?? 0);
    });
  if (!tabs.length) throw new Error(localized('No open Instagram tab was found. Open your own profile first.', 'Açık bir Instagram sekmesi bulunamadı. Önce kendi profilinizi açın.'));

  const dashboardTab = await chrome.tabs.getCurrent();
  const originalText = button.textContent;
  const startedAt = Date.now();
  button.disabled = true;
  button.textContent = localized('Collecting automatically…', 'Otomatik toplanıyor…');
  const elapsedTimer = setInterval(() => {
    const elapsedSeconds = Math.max(1, Math.round((Date.now() - startedAt) / 1000));
    button.textContent = localized(`Collecting automatically… ${elapsedSeconds}s`, `Otomatik toplanıyor… ${elapsedSeconds} sn`);
  }, 1000);
  try {
    let lastError = null;
    for (const tab of tabs) {
      if (!tab.id) continue;
      try {
        await chrome.tabs.update(tab.id, { active: true });
        if (typeof tab.windowId === 'number') await chrome.windows.update(tab.windowId, { focused: true });
        const results = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: collectInstagramList,
          args: [expectedKind],
        });
        const result = results?.[0]?.result;
        if (!result?.ok) {
          const manualKind = expectedKind === 'followers' ? 'Followers' : 'Following';
          const fallback = result?.code === 'manual_open_required'
            ? localized(`The ${manualKind} window could not be opened automatically. Open it on your profile, leave it visible, then run collection again.`, `${manualKind} penceresi otomatik açılamadı. Profilinizde bu pencereyi elle açıp görünür bırakın ve toplamayı yeniden çalıştırın.`)
            : localized('The Instagram list could not be read.', 'Instagram listesi okunamadı.');
          lastError = new Error(result?.error || fallback);
          continue;
        }
        const collection = validateCollection(result.collection, expectedKind);
        state.draft[expectedKind] = collection;
        state.activeSnapshotId = 'draft';
        await persistDraft();
        renderAll();
        showToast(localized(
          `${expectedKind === 'followers' ? 'Follower' : 'Following'} list collected automatically: ${collection.extracted_count} accounts.`,
          `${expectedKind === 'followers' ? 'Takipçi' : 'Takip edilen'} listesi otomatik toplandı: ${collection.extracted_count} hesap.`,
        ));
        return;
      } catch (error) {
        lastError = new Error(localizeError(error, state.locale));
      }
    }
    throw lastError ?? new Error(localized('No suitable Instagram profile tab was found.', 'Uygun Instagram profil sekmesi bulunamadı.'));
  } finally {
    clearInterval(elapsedTimer);
    button.disabled = false;
    button.textContent = originalText;
    if (dashboardTab?.id) {
      try {
        await chrome.tabs.update(dashboardTab.id, { active: true });
        if (typeof dashboardTab.windowId === 'number') await chrome.windows.update(dashboardTab.windowId, { focused: true });
      } catch { /* The dashboard may have been closed during collection. */ }
    }
  }
}

// This function is serialized by chrome.scripting.executeScript. Keep it fully self-contained.
async function collectInstagramList(expectedKind) {
  const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
  const normalize = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();
  const normalizeLower = (value) => normalize(value).toLocaleLowerCase('tr-TR');
  const isProfileHref = (href) => /^\/[A-Za-z0-9._]+\/$/.test(href || '');
  const dialogNames = {
    followers: ['followers', 'takipçiler'],
    following: ['following', 'takip', 'takip edilenler', 'takip ettikleri'],
  };
  const profileLinkMatchers = {
    followers: [/\bfollowers\b/i, /takipçi/i],
    following: [/\bfollowing\b/i, /takip edilen/i, /^\s*[\d.,kmb]+\s+takip\s*$/i],
  };
  const targetPathSegment = expectedKind === 'followers' ? 'followers' : 'following';

  const parseCount = (value) => {
    const text = normalizeLower(value).replace(/\s/g, '');
    const compact = text.match(/([\d]+(?:[.,][\d]+)?)\s*([kmb])/i);
    if (compact) {
      const number = Number(compact[1].replace(',', '.'));
      const multiplier = { k: 1_000, m: 1_000_000, b: 1_000_000_000 }[compact[2].toLowerCase()];
      return Number.isFinite(number) ? Math.round(number * multiplier) : null;
    }
    const digits = text.match(/[\d.,]+/)?.[0]?.replace(/[^\d]/g, '');
    return digits ? Number(digits) : null;
  };

  const getDialogKind = (dialog) => {
    const heading = dialog.querySelector('h1, h2, [role="heading"]');
    const label = normalizeLower(heading?.textContent);
    if (dialogNames.followers.includes(label)) return 'followers';
    if (dialogNames.following.includes(label)) return 'following';
    return null;
  };

  const findDialog = () => [...document.querySelectorAll('[role="dialog"]')]
    .find((dialog) => getDialogKind(dialog) === expectedKind) ?? null;

  let profileCount = null;
  let dialog = findDialog();
  if (!dialog) {
    const openDialogs = [...document.querySelectorAll('[role="dialog"]')];
    for (const openDialog of openDialogs) {
      const closeControl = [...openDialog.querySelectorAll('button,[role="button"]')]
        .find((element) => ['close', 'kapat'].includes(normalizeLower(element.getAttribute('aria-label') || element.textContent)));
      if (closeControl) closeControl.click();
    }
    if (openDialogs.length) await sleep(700);

    const main = document.querySelector('main');
    const candidateLinks = [...(main?.querySelectorAll('a') ?? [])];
    const hrefMatch = candidateLinks.find((candidate) => {
      const href = candidate.getAttribute('href') || '';
      return new RegExp(`/${targetPathSegment}/?(?:\\?|$)`, 'i').test(href);
    });
    const textMatch = candidateLinks.find((candidate) => {
      const text = normalize(candidate.innerText || candidate.textContent);
      return profileLinkMatchers[expectedKind].some((matcher) => matcher.test(text));
    });
    const link = hrefMatch || textMatch;
    if (!link) {
      return { ok: false, code: 'manual_open_required' };
    }
    profileCount = parseCount(link.innerText || link.textContent);
    link.scrollIntoView({ block: 'center', inline: 'center' });
    await sleep(250);
    link.click();
    const openDeadline = Date.now() + 15_000;
    while (!dialog && Date.now() < openDeadline) {
      await sleep(200);
      dialog = findDialog();
    }
  }

  if (!dialog) return { ok: false, code: 'manual_open_required' };

  if (profileCount === null) {
    const main = document.querySelector('main');
    const links = [...(main?.querySelectorAll('a') ?? [])];
    const link = links.find((candidate) => new RegExp(`/${targetPathSegment}/?(?:\\?|$)`, 'i').test(candidate.getAttribute('href') || ''))
      ?? links.find((candidate) => {
      const text = normalize(candidate.innerText || candidate.textContent);
      return profileLinkMatchers[expectedKind].some((matcher) => matcher.test(text));
    });
    profileCount = link ? parseCount(link.innerText || link.textContent) : null;
  }

  const findScroller = () => [dialog, ...dialog.querySelectorAll('*')]
    .filter((element) => {
      const style = getComputedStyle(element);
      return element.scrollHeight > element.clientHeight + 4 && ['auto', 'scroll'].includes(style.overflowY);
    })
    .sort((a, b) => (b.scrollHeight - b.clientHeight) - (a.scrollHeight - a.clientHeight))[0] ?? null;

  const usersByUsername = new Map();
  const collectVisibleRows = () => {
    const anchors = [...dialog.querySelectorAll('a[href]')].filter((anchor) => isProfileHref(anchor.getAttribute('href')));
    const preferredAnchors = new Map();
    for (const anchor of anchors) {
      const href = anchor.getAttribute('href');
      const username = href.slice(1, -1);
      if (!preferredAnchors.has(username) || normalize(anchor.textContent) === username) {
        preferredAnchors.set(username, anchor);
      }
    }

    for (const [username, anchor] of preferredAnchors) {
      if (usersByUsername.has(username.toLocaleLowerCase('en-US'))) continue;
      let row = anchor;
      while (row?.parentElement && row.parentElement !== dialog) {
        const currentHrefs = new Set([...row.querySelectorAll('a[href]')]
          .map((item) => item.getAttribute('href'))
          .filter(isProfileHref));
        const parentHrefs = new Set([...row.parentElement.querySelectorAll('a[href]')]
          .map((item) => item.getAttribute('href'))
          .filter(isProfileHref));
        if (currentHrefs.size === 1 && parentHrefs.size > 1) break;
        row = row.parentElement;
      }
      if (!row || row === dialog) continue;

      const controlLabels = new Set([...row.querySelectorAll('button,[role="button"]')]
        .map((control) => normalize(control.textContent || control.getAttribute('aria-label')))
        .filter(Boolean));
      const excluded = new Set([username, '·', ...controlLabels]);
      const lines = (row.innerText || '').split('\n').map(normalize).filter(Boolean);
      const fullName = lines.find((line) => !excluded.has(line)) || '';
      const images = [...row.querySelectorAll('img')];
      const profileImage = images.find((image) => normalizeLower(image.alt).includes(username.toLocaleLowerCase('en-US')))
        ?? images.find((image) => normalizeLower(image.alt) !== 'verified')
        ?? null;
      const isVerified = images.some((image) => ['verified', 'doğrulanmış'].includes(normalizeLower(image.alt)));
      usersByUsername.set(username.toLocaleLowerCase('en-US'), {
        source_index: usersByUsername.size,
        username,
        full_name: fullName,
        profile_pic_url: profileImage?.currentSrc || profileImage?.src || '',
        is_verified: isVerified,
        follows_viewer: expectedKind === 'followers',
        followed_by_viewer: expectedKind === 'following',
      });
    }
  };

  let scroller = findScroller();
  const initialDeadline = Date.now() + 10_000;
  while (!scroller && Date.now() < initialDeadline) {
    collectVisibleRows();
    if (profileCount !== null && usersByUsername.size >= profileCount) break;
    await sleep(150);
    scroller = findScroller();
  }

  let stableRounds = 0;
  let recoveryAttempts = 0;
  let rounds = 0;
  const collectionDeadline = Date.now() + (8 * 60 * 1000);
  while (rounds < 350 && Date.now() < collectionDeadline) {
    rounds += 1;
    collectVisibleRows();
    if (profileCount !== null && usersByUsername.size >= profileCount) break;
    scroller = findScroller();
    if (!scroller) break;

    const beforeCount = usersByUsername.size;
    const beforeHeight = scroller.scrollHeight;
    scroller.scrollTo({ top: scroller.scrollHeight, behavior: 'instant' });
    scroller.dispatchEvent(new WheelEvent('wheel', { deltaY: Math.max(900, scroller.clientHeight * 2), bubbles: true }));

    const loadDeadline = Date.now() + 7_500;
    let changed = false;
    while (Date.now() < loadDeadline) {
      await sleep(160);
      collectVisibleRows();
      if (usersByUsername.size > beforeCount || scroller.scrollHeight > beforeHeight) {
        changed = true;
        break;
      }
      const loading = dialog.querySelector('[role="progressbar"]');
      const atEnd = Math.abs(scroller.scrollHeight - scroller.clientHeight - scroller.scrollTop) <= 3;
      if (atEnd && !loading && Date.now() + 800 < loadDeadline) await sleep(650);
    }

    collectVisibleRows();
    const atEnd = Math.abs(scroller.scrollHeight - scroller.clientHeight - scroller.scrollTop) <= 3;
    const loading = Boolean(dialog.querySelector('[role="progressbar"]'));
    if (!changed && atEnd && !loading && usersByUsername.size === beforeCount) {
      stableRounds += 1;
      if (profileCount !== null && usersByUsername.size < profileCount && recoveryAttempts < 6) {
        recoveryAttempts += 1;
        const nudge = Math.max(scroller.clientHeight * 0.7, 500);
        scroller.scrollTop = Math.max(0, scroller.scrollHeight - scroller.clientHeight - nudge);
        scroller.dispatchEvent(new WheelEvent('wheel', { deltaY: -nudge, bubbles: true }));
        await sleep(500 + (recoveryAttempts * 180));
        scroller.scrollTop = scroller.scrollHeight;
        scroller.dispatchEvent(new WheelEvent('wheel', { deltaY: nudge * 2, bubbles: true }));
        await sleep(900 + (recoveryAttempts * 220));
        collectVisibleRows();
      }
    } else {
      stableRounds = 0;
      recoveryAttempts = 0;
    }
    if (stableRounds >= 4 || recoveryAttempts >= 6) break;
    await sleep(850);
  }

  collectVisibleRows();
  scroller = findScroller();
  const uiEndReached = !scroller || Math.abs(scroller.scrollHeight - scroller.clientHeight - scroller.scrollTop) <= 3;
  const users = [...usersByUsername.values()].map((user, index) => ({ ...user, source_index: index }));
  const complete = profileCount !== null && users.length === profileCount;
  const account = location.pathname.split('/').filter(Boolean)[0] || '';

  return {
    ok: true,
    collection: {
      version: 1,
      source: 'instagram_ui_auto_scroll',
      kind: expectedKind,
      account,
      captured_at: new Date().toISOString(),
      expected_count: profileCount,
      extracted_count: users.length,
      complete,
      ui_end_reached: uiEndReached,
      profile_count_discrepancy: profileCount === null ? 0 : Math.max(0, profileCount - users.length),
      completion_reason: complete ? 'count_matches_profile' : (Date.now() >= collectionDeadline ? 'collection_timeout' : (recoveryAttempts >= 6 ? 'stalled_after_retries' : (uiEndReached ? 'ui_end_reached_but_profile_count_mismatch' : 'ui_not_at_end'))),
      collection_rounds: rounds,
      recovery_attempts: recoveryAttempts,
      users,
    },
  };
}

function bindEvents() {
  document.addEventListener('click', async (event) => {
    const viewButton = event.target.closest('[data-view]');
    if (viewButton) setView(viewButton.dataset.view);

    const changeButton = event.target.closest('[data-change-group]');
    if (changeButton) {
      state.changeGroup = changeButton.dataset.changeGroup;
      $all('[data-change-group]').forEach((button) => button.classList.toggle('is-active', button === changeButton));
      renderChanges();
    }

    const captureButton = event.target.closest('[data-capture-kind]');
    if (captureButton) {
      try {
        await captureFromInstagram(captureButton.dataset.captureKind, captureButton);
      } catch (error) {
        showToast(localizeError(error, state.locale) || localized('The Instagram list could not be collected.', 'Instagram listesi alınamadı.'), 'error');
      }
    }

    const storyCard = event.target.closest('[data-story-group-index]');
    if (storyCard) openStoryViewer(Number(storyCard.dataset.storyGroupIndex));

    if (event.target.closest('[data-close-story]')) closeStoryViewer();

    const exportButton = event.target.closest('[data-export-snapshot]');
    if (exportButton) {
      const snapshot = getSnapshotById(exportButton.dataset.exportSnapshot);
      if (snapshot) downloadJson(`instagram-snapshot-${safeFilenamePart(snapshot.account)}-${snapshot.created_at.slice(0, 10)}.json`, snapshot);
    }

    const deleteButton = event.target.closest('[data-delete-snapshot]');
    if (deleteButton) await deleteSnapshot(deleteButton.dataset.deleteSnapshot);
  });

  $all('[data-import-kind]').forEach((input) => input.addEventListener('change', async () => {
    const [file] = input.files;
    if (!file) return;
    try {
      await importCollection(file, input.dataset.importKind);
    } catch (error) {
      showToast(localizeError(error, state.locale) || localized('The file could not be imported.', 'Dosya içe aktarılamadı.'), 'error');
    } finally {
      input.value = '';
    }
  }));

  elements.activeSnapshotSelect.addEventListener('change', () => {
    state.activeSnapshotId = elements.activeSnapshotSelect.value;
    renderOverview();
    renderNonFollowers();
  });
  elements.previousSnapshotSelect.addEventListener('change', () => {
    state.previousSnapshotId = elements.previousSnapshotSelect.value;
    renderChanges();
  });
  elements.currentSnapshotSelect.addEventListener('change', () => {
    state.currentSnapshotId = elements.currentSnapshotSelect.value;
    renderChanges();
  });
  $('#non-followers-search').addEventListener('input', (event) => {
    state.nonFollowersQuery = event.target.value;
    renderNonFollowers();
  });
  $('#non-followers-sort').addEventListener('change', (event) => {
    state.nonFollowersSort = event.target.value;
    renderNonFollowers();
  });
  elements.languageSelect.addEventListener('change', async (event) => {
    await setLanguage(event.target.value);
  });
  $('#save-snapshot-button').addEventListener('click', saveSnapshot);
  $('#open-instagram-button').addEventListener('click', openInstagram);
  $('#refresh-stories-button').addEventListener('click', async (event) => {
    try {
      await refreshStoriesFromInstagram(event.currentTarget);
    } catch (error) {
      showToast(localizeError(error, state.locale) || localized('Instagram stories could not be collected.', 'Instagram hikâyeleri alınamadı.'), 'error');
    }
  });
  $('#previous-story-button').addEventListener('click', () => moveStoryViewer(-1));
  $('#next-story-button').addEventListener('click', () => moveStoryViewer(1));
  document.addEventListener('keydown', (event) => {
    if (elements.storyModal.classList.contains('is-hidden')) return;
    if (event.key === 'Escape') closeStoryViewer();
    if (event.key === 'ArrowLeft') moveStoryViewer(-1);
    if (event.key === 'ArrowRight') moveStoryViewer(1);
  });
  $('#export-all-button').addEventListener('click', () => {
    downloadJson(`instagram-snapshot-arsivi-${new Date().toISOString().slice(0, 10)}.json`, {
      version: 1,
      exported_at: new Date().toISOString(),
      snapshots: state.snapshots,
    });
  });
}

function loadPreviewData() {
  const makeCollection = (kind, names, capturedAt, complete = true, expectedCount = names.length) => validateCollection({
    kind,
    account: 'ornekhesap',
    captured_at: capturedAt,
    expected_count: expectedCount,
    complete,
    users: names.map(([username, fullName, verified, picture], index) => ({
      source_index: index,
      username,
      full_name: fullName,
      profile_pic_url: picture || '',
      is_verified: verified === true,
    })),
  }, kind);

  const previousFollowers = makeCollection('followers', [
    ['denizses', 'Deniz Ses', true, 'https://scontent.cdninstagram.com/profile-deniz-old.jpg'],
    ['mavidefter', 'Mavi Defter'],
    ['analogruya', 'Analog Rüya'],
    ['kentnotlari', 'Kent Notları'],
  ], '2026-10-01T09:30:00.000Z');
  const previousFollowing = makeCollection('following', [
    ['denizses', 'Deniz Ses', true, 'https://scontent.cdninstagram.com/profile-deniz-old.jpg'],
    ['mavidefter', 'Mavi Defter'],
    ['uzakrota', 'Uzak Rota'],
    ['sessizfilm', 'Sessiz Film'],
  ], '2026-10-01T09:31:00.000Z');
  const currentFollowers = makeCollection('followers', [
    ['denizses', 'Deniz Ses', true, 'https://scontent.cdninstagram.com/profile-deniz-new.jpg'],
    ['analogruya', 'Analog Rüya'],
    ['kentnotlari', 'Kent Notları'],
    ['yenisesler', 'Yeni Sesler'],
  ], '2026-10-24T08:42:00.000Z');
  const currentFollowing = makeCollection('following', [
    ['denizses', 'Deniz Ses', true, 'https://scontent.cdninstagram.com/profile-deniz-new.jpg'],
    ['uzakrota', 'Uzak Rota'],
    ['sessizfilm', 'Sessiz Film'],
    ['yenisesler', 'Yeni Sesler'],
  ], '2026-10-24T08:48:00.000Z');

  const previous = buildSnapshot({
    followers: previousFollowers,
    following: previousFollowing,
    label: localized('October 1 snapshot', '1 Ekim snapshot’ı'),
    createdAt: '2026-10-01T09:32:00.000Z',
  });
  const current = buildSnapshot({
    followers: currentFollowers,
    following: currentFollowing,
    label: localized('October 24 snapshot', '24 Ekim snapshot’ı'),
    createdAt: '2026-10-24T08:50:00.000Z',
  });
  state.draft = { followers: currentFollowers, following: currentFollowing };
  state.snapshots = [current, previous];
  state.stories = validateStoryCollection({
    captured_at: '2026-10-26T08:55:00.000Z',
    groups: [
      {
        username: 'analogruya',
        full_name: 'Analog Rüya',
        following: true,
        items: [{
          id: 'preview-1',
          media_type: 'video',
          display_url: 'https://scontent.cdninstagram.com/instagram-inspector-preview-1.jpg',
          video_url: 'https://scontent.cdninstagram.com/instagram-inspector-preview-1.mp4',
          taken_at: 1793000100,
          seen: false,
        }],
      },
      {
        username: 'kentnotlari',
        full_name: 'Kent Notları',
        following: true,
        is_verified: true,
        items: [
          { id: 'preview-2', display_url: 'https://scontent.cdninstagram.com/instagram-inspector-preview-2.jpg', taken_at: 1792996500, seen: false },
          { id: 'preview-3', display_url: 'https://scontent.cdninstagram.com/instagram-inspector-preview-3.jpg', taken_at: 1792996400, seen: false },
        ],
      },
      {
        username: 'uzakrota',
        full_name: 'Uzak Rota',
        following: true,
        items: [{ id: 'preview-4', display_url: 'https://scontent.cdninstagram.com/instagram-inspector-preview-4.jpg', taken_at: 1792978500, seen: true }],
      },
    ],
  });
}

async function initialize() {
  cacheElements();
  bindEvents();
  const saved = await storage.get([STORAGE_KEYS.draft, STORAGE_KEYS.snapshots, STORAGE_KEYS.preferences]);
  state.locale = normalizeLocale(saved[STORAGE_KEYS.preferences]?.locale);
  document.documentElement.lang = state.locale;
  elements.languageSelect.value = state.locale;
  applyDocumentTranslations(document, state.locale);
  const savedDraft = saved[STORAGE_KEYS.draft];
  if (savedDraft?.followers) {
    try { state.draft.followers = validateCollection(savedDraft.followers, COLLECTION_KINDS.followers); } catch { /* Ignore invalid legacy draft. */ }
  }
  if (savedDraft?.following) {
    try { state.draft.following = validateCollection(savedDraft.following, COLLECTION_KINDS.following); } catch { /* Ignore invalid legacy draft. */ }
  }
  state.snapshots = Array.isArray(saved[STORAGE_KEYS.snapshots]) ? saved[STORAGE_KEYS.snapshots] : [];
  if (location.hostname === '127.0.0.1' && new URLSearchParams(location.search).has('preview')) {
    loadPreviewData();
  }
  state.snapshots.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  state.activeSnapshotId = getDraftSnapshot() ? 'draft' : (state.snapshots[0]?.id ?? '');
  state.currentSnapshotId = state.snapshots[0]?.id ?? '';
  state.previousSnapshotId = state.snapshots[1]?.id ?? '';
  setView(state.view);
  renderAll();
}

initialize().catch((error) => {
  cacheElements();
  showToast(localizeError(error, state.locale) || localized('The extension could not be initialized.', 'Eklenti başlatılamadı.'), 'error');
});
