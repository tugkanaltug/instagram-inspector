export const STORAGE_KEYS = Object.freeze({
  snapshots: 'ira:snapshots:v1',
  draft: 'ira:draft:v1',
  preferences: 'ira:preferences:v1',
});

export const COLLECTION_KINDS = Object.freeze({
  followers: 'followers',
  following: 'following',
});

export function normalizeUsername(value) {
  return String(value ?? '').trim().replace(/^@/, '').toLocaleLowerCase('en-US');
}

function asFiniteInteger(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.trunc(number) : null;
}

export function getProfilePicKey(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  try {
    const url = new URL(raw, 'https://www.instagram.com/');
    const segments = url.pathname.split('/').filter(Boolean);
    return decodeURIComponent(segments.at(-1) ?? '').toLocaleLowerCase('en-US');
  } catch {
    return raw.split(/[?#]/, 1)[0].split('/').filter(Boolean).at(-1)?.toLocaleLowerCase('en-US') ?? '';
  }
}

function createUser(rawUser, sourceIndex) {
  const username = String(rawUser?.username ?? '').trim().replace(/^@/, '');
  if (!username || !/^[A-Za-z0-9._]+$/.test(username)) {
    return null;
  }

  const profilePicUrl = String(rawUser?.profile_pic_url ?? '').trim();
  return {
    source_index: asFiniteInteger(rawUser?.source_index) ?? sourceIndex,
    username,
    full_name: String(rawUser?.full_name ?? '').trim(),
    profile_pic_url: profilePicUrl,
    profile_pic_key: String(rawUser?.profile_pic_key ?? '').trim() || getProfilePicKey(profilePicUrl),
    is_verified: rawUser?.is_verified === true,
    follows_viewer: rawUser?.follows_viewer === true,
    followed_by_viewer: rawUser?.followed_by_viewer === true,
  };
}

export function validateCollection(payload, expectedKind = null) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('Dosya geçerli bir JSON nesnesi değil.');
  }

  const kind = String(payload.kind ?? '');
  if (!Object.values(COLLECTION_KINDS).includes(kind)) {
    throw new Error('Dosya türü followers veya following olmalı.');
  }
  if (expectedKind && kind !== expectedKind) {
    const expectedLabel = expectedKind === COLLECTION_KINDS.followers ? 'takipçi' : 'takip edilen';
    throw new Error(`Bu alana ${expectedLabel} dosyası yüklenmeli.`);
  }
  if (!Array.isArray(payload.users)) {
    throw new Error('Dosyada users listesi bulunamadı.');
  }

  const usersByUsername = new Map();
  payload.users.forEach((rawUser, index) => {
    const user = createUser(rawUser, index);
    if (!user) return;
    const key = normalizeUsername(user.username);
    if (!usersByUsername.has(key)) usersByUsername.set(key, user);
  });

  const users = [...usersByUsername.values()].map((user, index) => ({
    ...user,
    source_index: index,
    follows_viewer: kind === COLLECTION_KINDS.followers ? true : user.follows_viewer,
    followed_by_viewer: kind === COLLECTION_KINDS.following ? true : user.followed_by_viewer,
  }));

  if (!users.length && payload.users.length) {
    throw new Error('Dosyada geçerli bir Instagram kullanıcı adı bulunamadı.');
  }

  const expectedCount = asFiniteInteger(payload.expected_count);
  const extractedCount = users.length;
  const countMatches = expectedCount === null || expectedCount === extractedCount;

  return {
    version: 1,
    source: String(payload.source ?? 'manual_json_import'),
    kind,
    account: String(payload.account ?? '').trim(),
    captured_at: String(payload.captured_at ?? new Date().toISOString()),
    expected_count: expectedCount,
    extracted_count: extractedCount,
    complete: payload.complete === true && expectedCount !== null && countMatches,
    ui_end_reached: payload.ui_end_reached === true,
    profile_count_discrepancy: expectedCount === null ? 0 : Math.max(0, expectedCount - extractedCount),
    completion_reason: String(payload.completion_reason ?? (countMatches ? 'count_matches_profile' : 'count_mismatch')),
    users,
  };
}

function randomId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `snapshot-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function buildSnapshot({ followers, following, label = '', createdAt = new Date().toISOString() }) {
  const cleanFollowers = validateCollection(followers, COLLECTION_KINDS.followers);
  const cleanFollowing = validateCollection(following, COLLECTION_KINDS.following);

  if (cleanFollowers.account && cleanFollowing.account && cleanFollowers.account !== cleanFollowing.account) {
    throw new Error('Takipçi ve takip edilen dosyaları farklı hesaplara ait.');
  }

  return {
    id: randomId(),
    version: 1,
    label: String(label ?? '').trim(),
    account: cleanFollowers.account || cleanFollowing.account,
    created_at: createdAt,
    complete: cleanFollowers.complete && cleanFollowing.complete,
    followers: cleanFollowers,
    following: cleanFollowing,
  };
}

function indexUsers(users) {
  return new Map((users ?? []).map((user) => [normalizeUsername(user.username), user]));
}

function subtractUsers(sourceUsers, targetUsers) {
  const targetIndex = indexUsers(targetUsers);
  return (sourceUsers ?? []).filter((user) => !targetIndex.has(normalizeUsername(user.username)));
}

export function getNonFollowers(snapshot) {
  if (!snapshot?.followers || !snapshot?.following) {
    return { users: [], reliable: false, coverage: null };
  }

  const users = subtractUsers(snapshot.following.users, snapshot.followers.users);
  return {
    users,
    reliable: snapshot.followers.complete === true,
    coverage: {
      evaluated: snapshot.following.extracted_count,
      expected: snapshot.following.expected_count,
    },
  };
}

export function diffSnapshots(previous, current) {
  if (!previous || !current) {
    return {
      lostFollowers: { users: [], reliable: false },
      newFollowers: { users: [], reliable: false },
      removedFollowing: { users: [], reliable: false },
      newFollowing: { users: [], reliable: false },
      changedProfilePhotos: { users: [], reliable: false },
    };
  }

  const followersReliable = previous.followers.complete === true && current.followers.complete === true;
  const followingReliable = previous.following.complete === true && current.following.complete === true;
  const combinedUsers = (snapshot) => {
    const index = new Map();
    for (const user of [...(snapshot?.following?.users ?? []), ...(snapshot?.followers?.users ?? [])]) {
      const key = normalizeUsername(user.username);
      if (!index.has(key) || !index.get(key).profile_pic_url) index.set(key, user);
    }
    return index;
  };
  const previousUsers = combinedUsers(previous);
  const currentUsers = combinedUsers(current);
  const changedProfilePhotos = [];
  for (const [username, currentUser] of currentUsers) {
    const previousUser = previousUsers.get(username);
    if (!previousUser) continue;
    const previousKey = previousUser.profile_pic_key || getProfilePicKey(previousUser.profile_pic_url);
    const currentKey = currentUser.profile_pic_key || getProfilePicKey(currentUser.profile_pic_url);
    if (!previousKey || !currentKey || previousKey === currentKey) continue;
    changedProfilePhotos.push({
      ...currentUser,
      previous_profile_pic_url: previousUser.profile_pic_url || '',
      previous_profile_pic_key: previousKey,
      profile_pic_key: currentKey,
    });
  }

  return {
    lostFollowers: {
      users: subtractUsers(previous.followers.users, current.followers.users),
      reliable: followersReliable,
    },
    newFollowers: {
      users: subtractUsers(current.followers.users, previous.followers.users),
      reliable: followersReliable,
    },
    removedFollowing: {
      users: subtractUsers(previous.following.users, current.following.users),
      reliable: followingReliable,
    },
    newFollowing: {
      users: subtractUsers(current.following.users, previous.following.users),
      reliable: followingReliable,
    },
    changedProfilePhotos: {
      users: changedProfilePhotos,
      reliable: previous.complete === true && current.complete === true,
    },
  };
}

export function filterAndSortUsers(users, query = '', sort = 'source') {
  const normalizedQuery = String(query ?? '').trim().toLocaleLowerCase('tr-TR');
  const filtered = (users ?? []).filter((user) => {
    if (!normalizedQuery) return true;
    return `${user.username} ${user.full_name}`.toLocaleLowerCase('tr-TR').includes(normalizedQuery);
  });

  if (sort === 'username-asc') {
    return [...filtered].sort((a, b) => a.username.localeCompare(b.username, 'tr', { sensitivity: 'base' }));
  }
  if (sort === 'username-desc') {
    return [...filtered].sort((a, b) => b.username.localeCompare(a.username, 'tr', { sensitivity: 'base' }));
  }
  return [...filtered].sort((a, b) => a.source_index - b.source_index);
}

export function formatSnapshotLabel(snapshot, locale = 'tr-TR') {
  if (snapshot?.label) return snapshot.label;
  const date = new Date(snapshot?.created_at ?? Date.now());
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}
