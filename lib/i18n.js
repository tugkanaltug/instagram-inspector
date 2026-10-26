export const SUPPORTED_LOCALES = Object.freeze(['en', 'tr']);

const messages = {
  en: {
    'brand.subtitle': 'Local Instagram analysis',
    'nav.label': 'Main menu',
    'nav.overview': 'Overview',
    'nav.nonFollowers': 'Not following back',
    'nav.changes': 'Changes',
    'nav.stories': 'Stories',
    'nav.data': 'Data and snapshots',
    'privacy.title': 'Only on this device',
    'privacy.detail': 'Data is not sent to a third-party server.',
    'language.label': 'Language',
    'snapshot.displayed': 'Displayed snapshot',
    'common.openInstagram': 'Open Instagram',
    'common.collect': 'Collect lists',
    'common.searchPlaceholder': 'Search username or name',
    'common.sort': 'Sort',
    'common.instagramOrder': 'Instagram order',
    'common.usernameAsc': 'Username A–Z',
    'common.usernameDesc': 'Username Z–A',
    'overview.followers': 'Followers',
    'overview.following': 'Following',
    'overview.nonFollowers': 'Not following back',
    'overview.mutual': 'Mutual follows',
    'overview.waitingList': 'Waiting for list',
    'overview.waitingCompare': 'Waiting for comparison',
    'overview.visibleAccounts': 'Among visible accounts',
    'overview.lastSnapshot': 'LATEST SNAPSHOT',
    'overview.noData': 'No data yet',
    'overview.waiting': 'Waiting',
    'overview.start': 'Add the Followers and Following lists to create your first snapshot.',
    'overview.goData': 'Go to data collection →',
    'security.eyebrow': 'SECURITY',
    'security.title': 'Read-only operation',
    'security.one': 'Does not follow or unfollow accounts.',
    'security.two': 'Does not store passwords or session cookies.',
    'security.three': 'Clearly marks incomplete lists.',
    'security.four': 'Keeps data in Chrome local storage.',
    'nonFollowers.title': 'Not following back',
    'nonFollowers.detail': 'Visible accounts you follow that do not follow you back.',
    'changes.title': 'Changes',
    'changes.detail': 'Accounts added or no longer present between two snapshots.',
    'changes.previous': 'Previous',
    'changes.current': 'Current',
    'changes.tabsLabel': 'Change types',
    'changes.lostFollowers': 'Stopped following you',
    'changes.removedFollowing': 'You no longer follow',
    'changes.newFollowers': 'New followers',
    'changes.newFollowing': 'New following',
    'changes.changedProfilePhotos': 'Changed profile photos',
    'stories.title': 'Stories',
    'stories.detail': 'Active stories served on Instagram Home for accounts you follow.',
    'stories.refresh': 'Refresh stories',
    'stories.warning': 'Your Instagram session is used. Stories are not saved to snapshots or local storage. The extension does not send a “seen” request, but it cannot guarantee that Instagram will not record viewing.',
    'data.title': 'Data and snapshots',
    'data.detail': 'Read an Instagram list automatically or select a previously created JSON file.',
    'data.followersTitle': 'Add follower list',
    'data.followersDetail': 'Keep your own Instagram profile open. The extension opens Followers and scrolls to the end automatically.',
    'data.followingTitle': 'Add following list',
    'data.followingDetail': 'Keep your own Instagram profile open. The extension opens Following and scrolls to the end automatically.',
    'data.notAdded': 'Not added yet',
    'data.autoCollect': 'Collect automatically',
    'data.selectJson': 'Select JSON',
    'data.createEyebrow': 'CREATE SNAPSHOT',
    'data.createTitle': 'Save both lists with a date',
    'data.createDetail': 'A new snapshot can be compared with earlier records. Incomplete lists can be saved, but their results are shown with a warning.',
    'data.optionalName': 'Optional name',
    'data.save': 'Save snapshot',
    'data.history': 'HISTORY',
    'data.records': 'Snapshot records',
    'data.exportAll': 'Export all',
    'viewer.close': 'Close',
    'viewer.closeDialog': 'Close story viewer',
    'viewer.previous': '← Previous',
    'viewer.next': 'Next →',
  },
  tr: {
    'brand.subtitle': 'Yerel Instagram analizi',
    'nav.label': 'Ana menü',
    'nav.overview': 'Genel bakış',
    'nav.nonFollowers': 'Geri takip etmeyenler',
    'nav.changes': 'Değişiklikler',
    'nav.stories': 'Hikâyeler',
    'nav.data': 'Veri ve snapshot’lar',
    'privacy.title': 'Yalnızca bu cihazda',
    'privacy.detail': 'Veriler üçüncü taraf bir sunucuya gönderilmez.',
    'language.label': 'Dil',
    'snapshot.displayed': 'Görüntülenen snapshot',
    'common.openInstagram': 'Instagram’ı aç',
    'common.collect': 'Liste al',
    'common.searchPlaceholder': 'Kullanıcı adı veya ad ara',
    'common.sort': 'Sıralama',
    'common.instagramOrder': 'Instagram sırası',
    'common.usernameAsc': 'Kullanıcı adı A–Z',
    'common.usernameDesc': 'Kullanıcı adı Z–A',
    'overview.followers': 'Takipçiler',
    'overview.following': 'Takip edilenler',
    'overview.nonFollowers': 'Geri takip etmeyenler',
    'overview.mutual': 'Karşılıklı takip',
    'overview.waitingList': 'Liste bekleniyor',
    'overview.waitingCompare': 'Karşılaştırma bekleniyor',
    'overview.visibleAccounts': 'Görünür hesaplar içinde',
    'overview.lastSnapshot': 'SON SNAPSHOT',
    'overview.noData': 'Henüz veri yok',
    'overview.waiting': 'Bekleniyor',
    'overview.start': 'Followers ve Following listelerini ekleyerek ilk snapshot’ı oluşturun.',
    'overview.goData': 'Veri eklemeye git →',
    'security.eyebrow': 'GÜVENLİK',
    'security.title': 'Salt okunur çalışma',
    'security.one': 'Takip veya takipten çıkarma işlemi yapmaz.',
    'security.two': 'Şifre veya oturum çerezi saklamaz.',
    'security.three': 'Eksik listeleri açıkça işaretler.',
    'security.four': 'Verileri Chrome’un yerel deposunda tutar.',
    'nonFollowers.title': 'Geri takip etmeyenler',
    'nonFollowers.detail': 'Takip ettiğiniz fakat sizi takip etmeyen görünür hesaplar.',
    'changes.title': 'Değişiklikler',
    'changes.detail': 'İki snapshot arasındaki eklenen ve artık bulunmayan hesaplar.',
    'changes.previous': 'Önceki',
    'changes.current': 'Güncel',
    'changes.tabsLabel': 'Değişiklik türleri',
    'changes.lostFollowers': 'Takipten çıkanlar',
    'changes.removedFollowing': 'Artık takip etmediklerin',
    'changes.newFollowers': 'Yeni takipçiler',
    'changes.newFollowing': 'Yeni takip ettiklerin',
    'changes.changedProfilePhotos': 'Profil fotoğrafını değiştirenler',
    'stories.title': 'Hikâyeler',
    'stories.detail': 'Takip ettiğiniz hesapların Instagram ana sayfasında sunulan aktif hikâyeleri.',
    'stories.refresh': 'Hikâyeleri yenile',
    'stories.warning': 'Instagram oturumunuz kullanılır. Hikâyeler snapshot’a veya yerel depoya kaydedilmez. Eklenti “görüldü” isteği göndermese de Instagram’ın görüntülemeyi kaydetmeyeceği garanti edilemez.',
    'data.title': 'Veri ve snapshot’lar',
    'data.detail': 'Instagram listesini otomatik okuyun veya daha önce oluşturduğunuz JSON dosyasını seçin.',
    'data.followersTitle': 'Takipçi listesini ekle',
    'data.followersDetail': 'Kendi Instagram profilinizi açık bırakın. Eklenti Followers penceresini açıp sonuna kadar otomatik kaydırır.',
    'data.followingTitle': 'Takip edilen listesini ekle',
    'data.followingDetail': 'Kendi Instagram profilinizi açık bırakın. Eklenti Following penceresini açıp sonuna kadar otomatik kaydırır.',
    'data.notAdded': 'Henüz eklenmedi',
    'data.autoCollect': 'Otomatik topla',
    'data.selectJson': 'JSON seç',
    'data.createEyebrow': 'SNAPSHOT OLUŞTUR',
    'data.createTitle': 'İki listeyi tarihli olarak kaydet',
    'data.createDetail': 'Yeni snapshot, önceki kayıtlarla karşılaştırılabilir. Eksik listeler kaydedilebilir fakat sonuçları uyarıyla gösterilir.',
    'data.optionalName': 'İsteğe bağlı ad',
    'data.save': 'Snapshot’ı kaydet',
    'data.history': 'GEÇMİŞ',
    'data.records': 'Snapshot kayıtları',
    'data.exportAll': 'Tümünü dışa aktar',
    'viewer.close': 'Kapat',
    'viewer.closeDialog': 'Hikâye görüntüleyicisini kapat',
    'viewer.previous': '← Önceki',
    'viewer.next': 'Sonraki →',
  },
};

export function normalizeLocale(value) {
  return SUPPORTED_LOCALES.includes(value) ? value : 'en';
}

export function translate(locale, key, variables = {}) {
  const selected = messages[normalizeLocale(locale)] ?? messages.en;
  const template = selected[key] ?? messages.en[key] ?? key;
  return String(template).replace(/\{(\w+)\}/g, (_, name) => String(variables[name] ?? ''));
}

export function applyDocumentTranslations(root, locale) {
  const t = (key) => translate(locale, key);
  root.querySelectorAll('[data-i18n]').forEach((element) => {
    element.textContent = t(element.dataset.i18n);
  });
  root.querySelectorAll('[data-i18n-placeholder]').forEach((element) => {
    element.setAttribute('placeholder', t(element.dataset.i18nPlaceholder));
  });
  root.querySelectorAll('[data-i18n-aria]').forEach((element) => {
    element.setAttribute('aria-label', t(element.dataset.i18nAria));
  });
}

const coreErrors = {
  'Dosya geçerli bir JSON nesnesi değil.': 'The file is not a valid JSON object.',
  'Dosya türü followers veya following olmalı.': 'The file type must be followers or following.',
  'Bu alana takipçi dosyası yüklenmeli.': 'A follower file must be selected here.',
  'Bu alana takip edilen dosyası yüklenmeli.': 'A following file must be selected here.',
  'Dosyada users listesi bulunamadı.': 'The file does not contain a users list.',
  'Dosyada geçerli bir Instagram kullanıcı adı bulunamadı.': 'No valid Instagram username was found in the file.',
  'Takipçi ve takip edilen dosyaları farklı hesaplara ait.': 'The follower and following files belong to different accounts.',
  'Bu sekme Instagram web sayfası değil.': 'This tab is not an Instagram web page.',
  'Instagram sayfası henüz hazır değil. Sayfayı yenileyip tekrar deneyin.': 'The Instagram page is not ready yet. Refresh the page and try again.',
  'Instagram oturumu açık değil.': 'The Instagram session is not signed in.',
  'Instagram hikâye şeridi beklenen biçimde dönmedi.': 'The Instagram story tray returned an unexpected format.',
  'Instagram hikâye medya sorgusu değişmiş olabilir.': 'The Instagram story media query may have changed.',
  'Hikâye medyası alınamadı. Instagram sorgusu değişmiş veya hesap geçici olarak sınırlandırılmış olabilir.': 'Story media could not be collected. The Instagram query may have changed or the account may be temporarily limited.',
  'Instagram hikâyeleri alınamadı.': 'Instagram stories could not be collected.',
  'Hikâye yanıtı geçerli değil.': 'The story response is invalid.',
};

export function localizeError(error, locale) {
  const message = String(error?.message ?? error ?? '');
  if (normalizeLocale(locale) === 'tr') return message;
  const storyTrayStatus = message.match(/^Hikâye şeridi alınamadı \((\d+)\)\.$/);
  if (storyTrayStatus) return `The story tray could not be loaded (${storyTrayStatus[1]}).`;
  return coreErrors[message] ?? message;
}
