import {
  validateCollection,
  buildSnapshot,
  getNonFollowers,
  diffSnapshots,
  filterAndSortUsers,
  getProfilePicKey,
} from '../lib/core.js?v=0.3.1';
import { validateStoryCollection, formatStoryAge } from '../lib/stories.js?v=0.3.1';

const results = [];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function test(name, callback) {
  try {
    callback();
    results.push(`✓ ${name}`);
  } catch (error) {
    results.push(`✗ ${name}: ${error.message}`);
  }
}

function collection(kind, usernames, complete = true, expectedCount = usernames.length) {
  return {
    kind,
    account: 'ornek',
    captured_at: '2026-10-24T10:00:00.000Z',
    expected_count: expectedCount,
    complete,
    users: usernames.map((username, index) => ({
      source_index: index,
      username,
      full_name: username.toUpperCase(),
      profile_pic_url: '',
      is_verified: false,
    })),
  };
}

test('Kullanıcı adlarını tekilleştirir ve sırayı korur', () => {
  const validated = validateCollection(collection('followers', ['zeta', 'alpha', 'zeta'], false, 3));
  assert(validated.users.length === 2, 'Tekrarlı kullanıcı silinmedi.');
  assert(validated.users[0].username === 'zeta', 'Kaynak sırası korunmadı.');
  assert(validated.complete === false, 'Eksik liste tam işaretlendi.');
});

test('Sayaç eşleşmeyen listeyi eksik işaretler', () => {
  const validated = validateCollection(collection('following', ['a', 'b'], true, 3));
  assert(validated.complete === false, 'Sayaç uyuşmazlığı kabul edildi.');
  assert(validated.profile_count_discrepancy === 1, 'Eksik hesap farkı yanlış.');
});

test('Geri takip etmeyenleri hesaplar', () => {
  const snapshot = buildSnapshot({
    followers: collection('followers', ['a', 'b']),
    following: collection('following', ['a', 'b', 'c']),
  });
  const result = getNonFollowers(snapshot);
  assert(result.users.length === 1 && result.users[0].username === 'c', 'Küme farkı yanlış.');
  assert(result.reliable === true, 'Tam takipçi listesi güvenilir sayılmadı.');
});

test('Beş değişiklik grubunu hesaplar', () => {
  const previous = buildSnapshot({
    followers: collection('followers', ['a', 'b']),
    following: collection('following', ['a', 'c']),
  });
  const current = buildSnapshot({
    followers: collection('followers', ['b', 'd']),
    following: collection('following', ['a', 'e']),
  });
  const diff = diffSnapshots(previous, current);
  assert(diff.lostFollowers.users[0].username === 'a', 'Takipten çıkan yanlış.');
  assert(diff.newFollowers.users[0].username === 'd', 'Yeni takipçi yanlış.');
  assert(diff.removedFollowing.users[0].username === 'c', 'Artık takip edilmeyen yanlış.');
  assert(diff.newFollowing.users[0].username === 'e', 'Yeni takip edilen yanlış.');
  assert(Array.isArray(diff.changedProfilePhotos.users), 'Profil fotoğrafı grubu bulunamadı.');
});

test('Profil fotoğrafı anahtarı CDN adresinin host ve sorgu bölümünü yok sayar', () => {
  const first = getProfilePicKey('https://scontent-a.cdninstagram.com/v/t51/avatar_123.jpg?stp=abc&x=1');
  const second = getProfilePicKey('https://scontent-b.fbcdn.net/v/t51/avatar_123.jpg?stp=def&x=2');
  assert(first === second && first === 'avatar_123.jpg', 'Kararlı fotoğraf anahtarı üretilemedi.');
});

test('Yalnızca iki snapshotta da bulunan hesabın gerçek fotoğraf değişimini bildirir', () => {
  const withPictures = (kind, rows) => ({
    ...collection(kind, rows.map(([username]) => username)),
    users: rows.map(([username, picture], index) => ({
      source_index: index,
      username,
      full_name: username,
      profile_pic_url: picture,
    })),
  });
  const previous = buildSnapshot({
    followers: withPictures('followers', [
      ['same', 'https://a.cdninstagram.com/p/same.jpg?sig=old'],
      ['changed', 'https://a.cdninstagram.com/p/old.jpg?sig=1'],
      ['gone', 'https://a.cdninstagram.com/p/gone.jpg'],
    ]),
    following: withPictures('following', []),
  });
  const current = buildSnapshot({
    followers: withPictures('followers', [
      ['same', 'https://b.fbcdn.net/p/same.jpg?sig=new'],
      ['changed', 'https://b.fbcdn.net/p/new.jpg?sig=2'],
      ['added', 'https://b.fbcdn.net/p/added.jpg'],
    ]),
    following: withPictures('following', []),
  });
  const diff = diffSnapshots(previous, current);
  assert(diff.changedProfilePhotos.users.length === 1, 'Yanlış sayıda fotoğraf değişimi bulundu.');
  assert(diff.changedProfilePhotos.users[0].username === 'changed', 'Değişen fotoğraf hesabı yanlış.');
  assert(diff.changedProfilePhotos.users[0].previous_profile_pic_url.includes('old.jpg'), 'Önceki fotoğraf korunmadı.');
});

test('Instagram sırasını ve alfabetik sıralamayı destekler', () => {
  const users = [
    { username: 'zeta', full_name: '', source_index: 0 },
    { username: 'alpha', full_name: '', source_index: 1 },
  ];
  assert(filterAndSortUsers(users, '', 'source')[0].username === 'zeta', 'Kaynak sırası yanlış.');
  assert(filterAndSortUsers(users, '', 'username-asc')[0].username === 'alpha', 'Alfabetik sıra yanlış.');
});

test('Hikâye gruplarında yalnızca takip edilen ve güvenli medya adreslerini kabul eder', () => {
  const result = validateStoryCollection({
    captured_at: '2026-10-26T09:00:00.000Z',
    source_count: 3,
    resolved_count: 3,
    groups: [
      {
        username: 'takip_edilen',
        following: true,
        profile_pic_url: 'https://scontent.cdninstagram.com/avatar.jpg?x=1',
        items: [{
          id: '1',
          media_type: 'video',
          display_url: 'https://scontent.cdninstagram.com/cover.jpg',
          video_url: 'https://scontent.cdninstagram.com/story.mp4',
          taken_at: 1793000000,
        }],
      },
      {
        username: 'takip_edilmeyen',
        following: false,
        items: [{ display_url: 'https://scontent.cdninstagram.com/cover.jpg' }],
      },
      {
        username: 'guvensiz',
        following: true,
        items: [{ display_url: 'https://example.com/cover.jpg' }],
      },
    ],
  });
  assert(result.account_count === 1, 'Takip veya medya adresi filtresi uygulanmadı.');
  assert(result.item_count === 1, 'Hikâye öğesi sayısı yanlış.');
  assert(result.groups[0].items[0].media_type === 'video', 'Video türü korunmadı.');
  assert(result.source_count === 3 && result.resolved_count === 3, 'Hikâye kapsam sayaçları korunmadı.');
  assert(result.skipped_count === 2, 'Filtrelenen hikâye hesabı sayısı yanlış.');
});

test('Çözülemeyen hikâye hesaplarını kısmi sonuç olarak işaretler', () => {
  const result = validateStoryCollection({
    captured_at: '2026-10-26T09:00:00.000Z',
    source_count: 12,
    resolved_count: 10,
    failed_count: 2,
    retry_count: 1,
    groups: [{
      username: 'takip_edilen',
      following: true,
      items: [{ display_url: 'https://scontent.cdninstagram.com/story.jpg' }],
    }],
  });
  assert(result.partial === true, 'Çözülemeyen hesaplar kısmi sonuç sayılmadı.');
  assert(result.failed_count === 2 && result.retry_count === 1, 'Yeniden deneme sayaçları yanlış.');
});

test('Hikâye yaşını göreli zaman olarak biçimlendirir', () => {
  const now = Date.UTC(2026, 9, 26, 12, 0, 0);
  const timestamp = Math.floor((now - (2 * 60 * 60 * 1000)) / 1000);
  assert(formatStoryAge(timestamp, now, 'tr-TR').includes('2 saat'), 'Göreli hikâye zamanı yanlış.');
});

const failed = results.filter((line) => line.startsWith('✗')).length;
document.querySelector('#results').textContent = `${results.join('\n')}\n\n${failed ? `${failed} test başarısız.` : 'Tüm testler geçti.'}`;
document.documentElement.dataset.testStatus = failed ? 'failed' : 'passed';
