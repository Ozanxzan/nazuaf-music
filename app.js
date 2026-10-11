(() => {
  'use strict';

  const CFG = Object.assign({
    API_BASE: 'https://saavn.sumit.co',
    ENABLE_API_AUDIO_PLAYBACK: false,
    DEFAULT_PAGE_SIZE: 12,
    PLAYLIST_PAGE_SIZE: 30,
    ARTIST_SONG_COUNT: 30,
    ARTIST_ALBUM_COUNT: 20,
    REQUEST_TIMEOUT_MS: 12000
  }, window.NAZUAF_CONFIG || {});

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const state = {
    route: 'home', query: '', type: 'all', results: { songs: [], albums: [], artists: [], playlists: [] },
    itemRegistry: new Map(), favorites: loadFavorites(), queue: [], queueIndex: -1,
    currentTrack: null, autoplay: false, detail: null, artistPage: 0, playlistPage: 0,
    playlistSongs: [], playlistHasMore: false, searchAbort: null, toasts: [], searchRequestId: 0
  };

  const audio = $('#audio-element');
  const types = ['songs', 'albums', 'artists', 'playlists'];
  const typeLabels = { all: 'Semua', songs: 'Lagu', albums: 'Album', artists: 'Artis', playlists: 'Playlist' };
  const typeSingular = { songs: 'song', albums: 'album', artists: 'artist', playlists: 'playlist' };
  const typeIcons = { songs: '♫', albums: '▤', artists: '♙', playlists: '☷' };

  function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  }
  function safeUrl(value) {
    if (!value || typeof value !== 'string') return '';
    try { const url = new URL(value, location.href); return ['https:', 'http:'].includes(url.protocol) ? url.href : ''; }
    catch { return ''; }
  }
  function normalizeArray(value) { return Array.isArray(value) ? value : value ? [value] : []; }
  function getTitle(item = {}) { return item.name || item.title || item.label || item.album?.name || 'Tanpa judul'; }
  function getId(item = {}) { return String(item.id ?? item.songId ?? item.albumId ?? item.artistId ?? item.playlistId ?? ''); }
  function getArtists(item = {}) {
    const a = item.artists ?? item.artist ?? item.primaryArtists ?? item.singers ?? item.subtitle ?? '';
    if (typeof a === 'string') return a;
    if (Array.isArray(a)) return a.map(x => typeof x === 'string' ? x : x?.name || x?.title).filter(Boolean).join(', ');
    if (a && typeof a === 'object') {
      const list = normalizeArray(a.primary?.length ? a.primary : a.all?.length ? a.all : a.featured);
      return list.map(x => x?.name || x?.title).filter(Boolean).join(', ') || a.name || '';
    }
    return '';
  }
  function getImage(item = {}) {
    let images = normalizeArray(item.image || item.images || item.artwork || item.thumbnail);
    if (images.length && typeof images[0] === 'string') return safeUrl(images[0]);
    if (!images.length && item.album?.image) images = normalizeArray(item.album.image);
    const valid = images.map(x => typeof x === 'string' ? x : x?.url).map(safeUrl).filter(Boolean);
    return valid[valid.length - 1] || '';
  }
  function getSourceLink(item = {}) { return safeUrl(item.url || item.perma_url || item.permaUrl || item.link || ''); }
  function getDuration(item = {}) {
    const n = Number(item.duration);
    if (!Number.isFinite(n) || n <= 0) return '';
    const seconds = n > 10000 ? Math.round(n / 1000) : Math.round(n);
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  }
  function getCount(item = {}) {
    const n = Number(item.songCount ?? item.total ?? item.count);
    return Number.isFinite(n) && n > 0 ? `${n.toLocaleString('id-ID')} lagu` : '';
  }
  function loadFavorites() {
    try { const value = JSON.parse(localStorage.getItem('nazuaf-music-favorites') || '[]'); return Array.isArray(value) ? value : []; }
    catch { return []; }
  }
  function persistFavorites() {
    try { localStorage.setItem('nazuaf-music-favorites', JSON.stringify(state.favorites)); }
    catch { toast('Favorit tidak bisa disimpan di perangkat ini.'); }
  }
  function isFavorite(type, item) {
    const id = getId(item);
    return !!id && state.favorites.some(x => x.type === type && String(x.item?.id) === id);
  }
  function registerItem(type, item) {
    const id = getId(item) || `${getTitle(item)}-${Math.random().toString(36).slice(2, 7)}`;
    const key = `${type}|${id}`;
    state.itemRegistry.set(key, item);
    return key;
  }
  function imageMarkup(item, extraClass = '') {
    const url = getImage(item);
    return url
      ? `<img class="${extraClass}" src="${esc(url)}" alt="${esc(getTitle(item))}" loading="lazy" referrerpolicy="no-referrer" onerror="this.style.display='none';this.nextElementSibling?.classList.remove('hidden')"><div class="cover-placeholder ${extraClass ? 'hidden' : ''}" aria-hidden="true">${typeIcons[item.__type] || '♫'}</div>`
      : `<div class="cover-placeholder" aria-hidden="true">${typeIcons[item.__type] || '♫'}</div>`;
  }
  function coverBlock(item, type, key) {
    item.__type = type;
    const url = getImage(item);
    const fav = isFavorite(type, item);
    return `<div class="cover-wrap ${type === 'artists' ? 'artist-cover-wrap' : ''}">${url ? `<img src="${esc(url)}" alt="${esc(getTitle(item))}" loading="lazy" referrerpolicy="no-referrer" onerror="this.style.display='none';this.nextElementSibling.classList.remove('hidden')"><div class="cover-placeholder hidden">${typeIcons[type] || '♫'}</div>` : `<div class="cover-placeholder">${typeIcons[type] || '♫'}</div>`}${type === 'songs' ? `<div class="cover-overlay"></div><button class="cover-play" data-play-key="${esc(key)}" aria-label="Putar ${esc(getTitle(item))}" title="Putar">▶</button>` : ''}<button class="cover-favorite ${fav ? 'saved' : ''}" data-favorite-key="${esc(key)}" aria-label="${fav ? 'Hapus dari' : 'Simpan ke'} favorit" title="${fav ? 'Hapus dari' : 'Simpan ke'} favorit">${fav ? '♥' : '♡'}</button></div>`;
  }
  function mediaCard(type, item) {
    if (!item || typeof item !== 'object') return '';
    const key = registerItem(type, item);
    const title = getTitle(item);
    const subtitle = type === 'songs' ? getArtists(item) || item.album?.name || item.language || 'Lagu' : type === 'albums' ? (getArtists(item) || item.language || item.year || 'Album') : type === 'artists' ? (item.role || item.type || item.dominantLanguage || 'Artis') : `${getCount(item) || item.language || 'Playlist'}`;
    const meta = type === 'songs' ? getDuration(item) : type === 'albums' ? (item.year || '') : type === 'artists' ? (item.isVerified ? '✓ Terverifikasi' : '') : (item.language || '');
    const keyForOpen = esc(key);
    return `<article class="media-card" data-card-type="${type}">${coverBlock(item, type, key)}<div class="media-info"><button class="media-title title-button" data-open-key="${keyForOpen}">${esc(title)}</button><span class="media-subtitle">${esc(subtitle)}</span><div class="media-meta-row"><span>${esc(meta)}</span>${type !== 'songs' ? `<button class="mini-action" data-open-key="${keyForOpen}" aria-label="Buka detail">↗</button>` : `<button class="mini-action" data-play-key="${keyForOpen}" aria-label="Putar lagu">▶</button>`}</div></div></article>`;
  }
  function loadingMarkup(message = 'Sedang mengambil data...') { return `<div class="loading-state"><div class="loading-spinner"></div><strong>${esc(message)}</strong><p>Mohon tunggu sebentar.</p></div>`; }
  function emptyMarkup(title, message, symbol = '⌕') { return `<div class="empty-state"><span class="empty-symbol">${esc(symbol)}</span><strong>${esc(title)}</strong><p>${esc(message)}</p></div>`; }
  function errorMarkup(title, message, action = '') { return `<div class="error-state"><span class="empty-symbol">!</span><strong>${esc(title)}</strong><p>${esc(message)}</p>${action}</div>`; }

  async function apiGet(path, opts = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), CFG.REQUEST_TIMEOUT_MS);
    try {
      const url = `${String(CFG.API_BASE).replace(/\/$/, '')}${path}`;
      const response = await fetch(url, { method: 'GET', headers: { Accept: 'application/json' }, signal: controller.signal, cache: 'no-store' });
      if (!response.ok) throw new Error(`API merespons HTTP ${response.status}.`);
      const payload = await response.json();
      if (payload && payload.success === false) throw new Error(payload.message || payload.error || 'API melaporkan permintaan gagal.');
      return payload;
    } catch (error) {
      if (error.name === 'AbortError') throw new Error('Permintaan API terlalu lama. Coba lagi sebentar lagi.');
      if (error instanceof TypeError) throw new Error('API tidak dapat diakses dari browser. Periksa koneksi, CORS, atau ketersediaan server API.');
      throw error;
    } finally { clearTimeout(timeout); }
  }
  function dataFrom(payload) { return payload?.data ?? payload ?? {}; }
  function itemsFrom(payload, type) {
    const data = dataFrom(payload);
    if (Array.isArray(data)) return data;
    const singular = type.slice(0, -1);
    const candidates = [data?.[type], data?.[singular], data?.results?.[type], data?.results?.[singular], data?.results, payload?.[type], payload?.results];
    for (const candidate of candidates) if (Array.isArray(candidate)) return candidate;
    return [];
  }
  function normalizeSearchResult(payload, type) {
    const data = dataFrom(payload);
    if (type === 'all') {
      const result = {};
      for (const category of types) result[category] = itemsFrom(data, category);
      return result;
    }
    return { [type]: itemsFrom(payload, type) };
  }
  function setLoadingResults(title, description = '') {
    $('#browse-section').classList.add('hidden'); $('#favorites-section').classList.add('hidden'); $('#detail-section').classList.add('hidden');
    $('#search-results-section').classList.remove('hidden');
    $('#results-kicker').textContent = state.query ? 'HASIL PENCARIAN' : 'JELAJAHI KATEGORI';
    $('#results-title').textContent = title;
    $('#results-description').textContent = description;
    $('#results-container').innerHTML = loadingMarkup();
    $$('.filter-tab').forEach(button => button.classList.toggle('active', button.dataset.type === state.type));
  }
  function renderSearchResults() {
    const container = $('#results-container');
    const results = state.results;
    let html = '';
    if (state.type === 'all') {
      types.forEach(type => {
        const items = normalizeArray(results[type]).slice(0, 8);
        if (!items.length) return;
        html += `<section class="result-group"><div class="group-heading"><h3>${typeLabels[type]}</h3><button data-filter-type="${type}">Lihat semua ↗</button></div><div class="result-grid ${type === 'artists' ? 'artists-grid' : ''}">${items.map(item => mediaCard(type, item)).join('')}</div></section>`;
      });
    } else {
      const items = normalizeArray(results[state.type]);
      if (items.length) html = `<div class="result-grid ${state.type === 'artists' ? 'artists-grid' : ''}">${items.map(item => mediaCard(state.type, item)).join('')}</div>`;
    }
    if (!html) html = emptyMarkup(state.query ? 'Belum ada hasil yang cocok' : 'Mulai dengan pencarian', state.query ? 'Coba ejaan lain, nama artis yang berbeda, atau kata kunci yang lebih pendek.' : `Masukkan kata kunci di kolom pencarian untuk menemukan ${typeLabels[state.type].toLowerCase()}.`);
    container.innerHTML = html;
  }
  async function executeSearch(query, type = 'all') {
    state.query = query.trim(); state.type = type;
    if (!state.query) {
      state.results = { songs: [], albums: [], artists: [], playlists: [] };
      setLoadingResults(type === 'all' ? 'Cari musik favoritmu' : `Jelajahi ${typeLabels[type].toLowerCase()}`, 'Gunakan kolom pencarian untuk memuat hasil dari API.');
      $('#results-container').innerHTML = emptyMarkup('Mau dengar apa hari ini?', `Cari ${typeLabels[type].toLowerCase()}, album, artis, atau playlist berdasarkan nama.`, '♫');
      return;
    }
    const requestId = ++state.searchRequestId;
    if (state.searchAbort) state.searchAbort.abort();
    const controller = new AbortController(); state.searchAbort = controller;
    setLoadingResults(`Mencari “${state.query}”`, `Menampilkan ${typeLabels[type].toLowerCase()} yang cocok dengan pencarianmu.`);
    try {
      const endpoint = type === 'all'
        ? `/api/search?query=${encodeURIComponent(state.query)}`
        : `/api/search/${type}?query=${encodeURIComponent(state.query)}&page=0&limit=${Number(CFG.DEFAULT_PAGE_SIZE) || 12}`;
      const payload = await apiGet(endpoint, { signal: controller.signal });
      if (requestId !== state.searchRequestId) return;
      state.results = normalizeSearchResult(payload, type);
      renderSearchResults();
    } catch (error) {
      if (requestId !== state.searchRequestId) return;
      $('#results-container').innerHTML = errorMarkup('Pencarian belum berhasil', `${error.message} API yang digunakan bersifat tidak resmi dan sewaktu-waktu bisa tidak merespons.`, `<button class="quiet-button" data-retry-search>↻ Coba lagi</button>`);
    }
  }
  function changeHash(hash) {
    if (location.hash === hash) routeFromHash(); else location.hash = hash;
  }
  function goSearch(query = '', type = 'all') {
    const params = new URLSearchParams();
    if (query) params.set('q', query);
    if (type !== 'all') params.set('type', type);
    changeHash(`#search${params.toString() ? `?${params.toString()}` : ''}`);
  }
  function syncSearchBoxes(query) { $('#top-search-input').value = query || ''; $('#hero-search-input').value = query || ''; }
  function updateNav(route) {
    $$('[data-nav]').forEach(el => el.classList.toggle('active', el.dataset.nav === route));
    $$('[data-browse]').forEach(el => el.classList.remove('active'));
  }
  function showRouteBase(route) {
    state.route = route;
    $('#browse-section').classList.toggle('hidden', route !== 'home');
    $('#search-results-section').classList.toggle('hidden', route !== 'search');
    $('#detail-section').classList.toggle('hidden', route !== 'detail');
    $('#favorites-section').classList.toggle('hidden', route !== 'favorites');
    const crumb = { home: 'Beranda', search: 'Cari musik', favorites: 'Favorit', detail: 'Detail' }[route] || 'Beranda';
    $('#breadcrumbs').innerHTML = `<span class="crumb-muted">Discover</span><span class="crumb-slash">/</span><strong>${esc(crumb)}</strong>`;
    updateNav(route);
  }
  async function routeFromHash() {
    const raw = location.hash.replace(/^#/, '') || 'home';
    const [path, queryString = ''] = raw.split('?');
    const params = new URLSearchParams(queryString);
    if (path.startsWith('album/')) return openDetail('albums', decodeURIComponent(path.slice(6)));
    if (path.startsWith('artist/')) return openDetail('artists', decodeURIComponent(path.slice(7)));
    if (path.startsWith('playlist/')) return openDetail('playlists', decodeURIComponent(path.slice(9)));
    if (path === 'search') {
      showRouteBase('search');
      const query = params.get('q') || '';
      const type = types.includes(params.get('type')) ? params.get('type') : 'all';
      syncSearchBoxes(query);
      const currentKey = `${query}|${type}`;
      if (state.lastSearchKey !== currentKey) { state.lastSearchKey = currentKey; await executeSearch(query, type); }
      else { state.query = query; state.type = type; $$('.filter-tab').forEach(b => b.classList.toggle('active', b.dataset.type === type)); }
      return;
    }
    if (path === 'favorites') { showRouteBase('favorites'); syncSearchBoxes(''); renderFavorites(); return; }
    showRouteBase('home'); syncSearchBoxes(''); state.lastSearchKey = '';
  }
  function setDetailBreadcrumb(name) {
    $('#breadcrumbs').innerHTML = `<span class="crumb-muted">Discover</span><span class="crumb-slash">/</span><strong>${esc(name || 'Detail')}</strong>`;
  }

  function artistNameLine(data) { return getArtists(data) || data?.artists?.primary?.map(a => a.name).filter(Boolean).join(', ') || data?.artist || ''; }
  function renderDetailHero(type, data, description = '') {
    const cover = getImage(data);
    const kind = typeLabels[type] || 'Musik';
    const info = type === 'artists' ? (data.isVerified ? '✓ Artis terverifikasi' : (data.dominantLanguage || data.dominantType || 'Profil artis')) : type === 'albums' ? (data.year || data.language || 'Album') : (data.language || 'Playlist');
    const count = data.songCount ? `${Number(data.songCount).toLocaleString('id-ID')} lagu` : '';
    const year = data.year && type !== 'artists' ? String(data.year) : '';
    const stats = [info, count, year].filter(Boolean);
    const url = getSourceLink(data);
    return `<div class="detail-hero"><div class="detail-cover ${type === 'artists' ? 'artist-cover' : ''}">${cover ? `<img src="${esc(cover)}" alt="${esc(getTitle(data))}" referrerpolicy="no-referrer" onerror="this.style.display='none'">` : `<div class="cover-placeholder">${typeIcons[type] || '♫'}</div>`}</div><div><div class="detail-kind">${esc(kind)}</div><h2>${esc(getTitle(data))}</h2><p>${esc(description || data.description || data.bio?.map(x => x.text).filter(Boolean).join(' ') || artistNameLine(data) || 'Jelajahi koleksi musik dan rilisan terkait.')}</p><div class="detail-stats">${stats.map(s => `<span>${esc(s)}</span>`).join('')}</div><div class="detail-actions"><button class="primary-button" data-play-detail="${esc(type)}">▶ ${type === 'artists' ? 'Putar lagu populer' : type === 'albums' ? 'Putar album' : 'Putar playlist'}</button>${url ? `<a class="quiet-button" href="${esc(url)}" target="_blank" rel="noopener noreferrer">Buka sumber ↗</a>` : ''}</div></div></div>`;
  }
  function renderTrackTable(items, keyType = 'songs') {
    const list = normalizeArray(items);
    if (!list.length) return emptyMarkup('Belum ada lagu di bagian ini', 'Data katalog tidak tersedia atau API mengembalikan daftar kosong.', '♫');
    return `<div class="track-table-wrap"><table class="track-table"><thead><tr><th style="width:54%">LAGU</th><th>ALBUM</th><th>DURASI</th><th></th></tr></thead><tbody>${list.map((song, index) => {
      const key = registerItem('songs', song);
      return `<tr><td><div class="track-cell"><span class="track-number">${index + 1}</span><div class="track-thumb">${getImage(song) ? `<img src="${esc(getImage(song))}" alt="" loading="lazy" referrerpolicy="no-referrer">` : '♫'}</div><div class="track-name-wrap"><button class="track-name title-button" data-play-key="${esc(key)}">${esc(getTitle(song))}</button><span class="track-artist">${esc(getArtists(song) || 'Artis tidak diketahui')}</span></div></div></td><td>${esc(song.album?.name || song.album || '—')}</td><td>${esc(getDuration(song) || '—')}</td><td><button class="table-play" data-play-key="${esc(key)}" aria-label="Putar ${esc(getTitle(song))}">▶</button></td></tr>`;
    }).join('')}</tbody></table></div>`;
  }
  function albumGridMarkup(items) {
    const list = normalizeArray(items);
    if (!list.length) return emptyMarkup('Belum ada album', 'Tidak ada album yang dikembalikan untuk artis ini.', '▤');
    return `<div class="result-grid">${list.map(item => mediaCard('albums', item)).join('')}</div>`;
  }
  async function openDetail(type, id, providedItem = null) {
    if (!id && !providedItem) return toast('ID konten tidak tersedia.');
    const routeSlug = type === 'albums' ? 'album' : type === 'artists' ? 'artist' : 'playlist';
    const hash = `#${routeSlug}/${encodeURIComponent(id || getId(providedItem))}`;
    if (providedItem && location.hash !== hash) { history.pushState(null, '', hash); }
    showRouteBase('detail'); $('#detail-section').classList.remove('hidden');
    $('#detail-container').innerHTML = loadingMarkup('Memuat detail...');
    state.detail = { type, id, data: providedItem || null };
    state.artistPage = 0; state.playlistPage = 0; state.playlistSongs = []; state.playlistHasMore = false;
    let data = providedItem;
    try {
      if (type === 'albums') {
        if (!data || !Array.isArray(data.songs)) data = dataFrom(await apiGet(`/api/albums?id=${encodeURIComponent(id)}`));
      } else if (type === 'artists') {
        try { data = dataFrom(await apiGet(`/api/artists/${encodeURIComponent(id)}?page=0&songCount=${CFG.ARTIST_SONG_COUNT}&albumCount=${CFG.ARTIST_ALBUM_COUNT}&sortBy=popularity&sortOrder=desc`)); }
        catch (firstError) { if (!providedItem) throw firstError; data = dataFrom(await apiGet(`/api/artists?id=${encodeURIComponent(id)}`)); }
      } else if (type === 'playlists') {
        data = dataFrom(await apiGet(`/api/playlists?id=${encodeURIComponent(id)}&page=0&limit=${CFG.PLAYLIST_PAGE_SIZE}`));
      }
      if (!data || (!getId(data) && !getTitle(data))) throw new Error('Respons detail tidak berisi informasi yang dapat ditampilkan.');
      state.detail = { type, id: getId(data) || id, data };
      setDetailBreadcrumb(getTitle(data));
      renderDetailPage(type, data);
    } catch (error) {
      $('#detail-container').innerHTML = errorMarkup('Detail belum bisa dimuat', `${error.message} Kamu masih bisa membuka halaman sumber jika tautannya tersedia.`, `<button class="quiet-button" data-retry-detail>↻ Coba lagi</button>`);
    }
  }
  function renderDetailPage(type, data) {
    const container = $('#detail-container');
    let html = renderDetailHero(type, data);
    if (type === 'albums') {
      const songs = normalizeArray(data.songs);
      state.playlistSongs = songs; state.playlistHasMore = false;
      html += `<section class="detail-block"><div class="detail-block-header"><h3>Daftar lagu</h3><span>${songs.length} lagu ditampilkan</span></div><div id="detail-track-list">${renderTrackTable(songs)}</div></section>`;
    } else if (type === 'playlists') {
      const songs = normalizeArray(data.songs);
      state.playlistSongs = songs; state.playlistHasMore = Number(data.songCount || 0) > songs.length;
      state.playlistPage = 0;
      html += `<section class="detail-block"><div class="detail-block-header"><h3>Daftar lagu</h3><span>${esc(data.songCount ?? songs.length)} lagu</span></div><div id="detail-track-list">${renderTrackTable(songs)}</div>${state.playlistHasMore ? `<div class="pagination-row"><button id="load-more-playlist">Muat lagu berikutnya</button></div>` : ''}</section>`;
    } else if (type === 'artists') {
      const topSongs = normalizeArray(data.topSongs);
      const albums = normalizeArray(data.topAlbums);
      const singles = normalizeArray(data.singles);
      html += `<section class="detail-block"><div class="detail-block-header"><h3>Lagu populer</h3><button class="quiet-button" data-artist-list="songs">Lihat semua lagu ↗</button></div><div id="artist-songs-area">${renderTrackTable(topSongs.slice(0, 8))}</div></section>`;
      html += `<section class="detail-block"><div class="detail-block-header"><h3>Album</h3><button class="quiet-button" data-artist-list="albums">Lihat semua album ↗</button></div><div id="artist-albums-area">${albumGridMarkup(albums.slice(0, 8))}</div></section>`;
      if (singles.length) html += `<section class="detail-block"><div class="detail-block-header"><h3>Single</h3><span>${singles.length} rilisan</span></div><div class="result-grid">${singles.slice(0, 8).map(item => mediaCard('songs', item)).join('')}</div></section>`;
      if (normalizeArray(data.similarArtists).length) html += `<section class="detail-block"><div class="detail-block-header"><h3>Artis serupa</h3></div><div class="result-grid artists-grid">${data.similarArtists.slice(0, 8).map(item => mediaCard('artists', item)).join('')}</div></section>`;
    }
    container.innerHTML = html;
    container.querySelectorAll('img').forEach(img => img.addEventListener('error', () => { img.style.display = 'none'; }, { once: true }));
  }
  async function loadArtistList(which) {
    if (!state.detail || state.detail.type !== 'artists') return;
    const id = state.detail.id; const target = which === 'songs' ? $('#artist-songs-area') : $('#artist-albums-area');
    if (!target) return;
    target.innerHTML = loadingMarkup(which === 'songs' ? 'Memuat lagu artis...' : 'Memuat album artis...');
    try {
      const page = 0;
      const payload = await apiGet(`/api/artists/${encodeURIComponent(id)}/${which}?page=${page}&sortBy=popularity&sortOrder=desc`);
      const data = dataFrom(payload);
      const items = which === 'songs' ? normalizeArray(data.songs) : normalizeArray(data.albums);
      target.innerHTML = which === 'songs' ? renderTrackTable(items) : albumGridMarkup(items);
      const total = Number(data.total || 0);
      const group = target.closest('.detail-block')?.querySelector('.detail-block-header');
      if (group) group.querySelector('h3').textContent = `${which === 'songs' ? 'Semua lagu' : 'Semua album'}${total ? ` (${total})` : ''}`;
    } catch (error) {
      target.innerHTML = errorMarkup('Katalog tidak tersedia', error.message, `<button class="quiet-button" data-artist-list="${which}">↻ Coba lagi</button>`);
    }
  }
  async function loadMorePlaylist() {
    if (!state.detail || state.detail.type !== 'playlists' || !state.playlistHasMore) return;
    const button = $('#load-more-playlist'); if (button) { button.disabled = true; button.textContent = 'Memuat...'; }
    try {
      const nextPage = state.playlistPage + 1;
      const payload = await apiGet(`/api/playlists?id=${encodeURIComponent(state.detail.id)}&page=${nextPage}&limit=${CFG.PLAYLIST_PAGE_SIZE}`);
      const data = dataFrom(payload); const newSongs = normalizeArray(data.songs);
      if (!newSongs.length) state.playlistHasMore = false;
      else { state.playlistSongs.push(...newSongs); state.playlistPage = nextPage; }
      state.playlistHasMore = state.playlistHasMore && state.playlistSongs.length < Number(state.detail.data.songCount || Infinity);
      const target = $('#detail-track-list'); if (target) target.innerHTML = renderTrackTable(state.playlistSongs);
      const row = $('.detail-block .pagination-row'); if (row) row.innerHTML = state.playlistHasMore ? `<button id="load-more-playlist">Muat lagu berikutnya</button>` : '<span>Semua lagu yang tersedia sudah dimuat.</span>';
    } catch (error) { toast(`Gagal memuat lagu berikutnya: ${error.message}`); if (button) { button.disabled = false; button.textContent = 'Coba lagi'; } }
  }

  function renderFavorites() {
    const container = $('#favorites-container');
    if (!state.favorites.length) { container.innerHTML = emptyMarkup('Favoritmu masih kosong', 'Tekan ikon hati pada kartu lagu, album, artis, atau playlist untuk menyimpannya di perangkat ini.', '♡'); return; }
    const groups = { songs: [], albums: [], artists: [], playlists: [] };
    for (const fav of state.favorites) if (groups[fav.type]) groups[fav.type].push(fav.item);
    container.innerHTML = types.filter(type => groups[type].length).map(type => `<section class="result-group"><div class="group-heading"><h3>${typeLabels[type]}</h3><span>${groups[type].length} disimpan</span></div><div class="result-grid ${type === 'artists' ? 'artists-grid' : ''}">${groups[type].map(item => mediaCard(type, item)).join('')}</div></section>`).join('');
  }
  function toggleFavorite(type, item) {
    const id = getId(item);
    if (!id) return toast('Item ini tidak memiliki ID, jadi tidak bisa disimpan.');
    const index = state.favorites.findIndex(f => f.type === type && String(f.item?.id) === id);
    if (index >= 0) { state.favorites.splice(index, 1); toast('Dihapus dari favorit.'); }
    else {
      const plainItem = JSON.parse(JSON.stringify(item)); delete plainItem.__type;
      state.favorites.unshift({ type, item: plainItem }); toast('Disimpan ke favorit.');
    }
    persistFavorites();
    if (state.route === 'favorites') renderFavorites();
    else {
      const key = `${type}|${id}`;
      $$(`[data-favorite-key="${CSS.escape(key)}"]`).forEach(button => {
        const saved = isFavorite(type, item); button.classList.toggle('saved', saved); button.textContent = saved ? '♥' : '♡';
        button.setAttribute('aria-label', `${saved ? 'Hapus dari' : 'Simpan ke'} favorit`);
      });
    }
    if (state.currentTrack && String(state.currentTrack.id) === id) updatePlayerFavorite();
  }
  function cleanSong(item) {
    const id = getId(item);
    return { ...item, id, name: getTitle(item), image: item.image || [], artists: item.artists || { primary: [{ name: getArtists(item) }] } };
  }
  function getAudioUrl(song) {
    const candidates = normalizeArray(song?.downloadUrl || song?.download_url || song?.audioUrls || song?.audio_url);
    const ranked = candidates.map(entry => typeof entry === 'string' ? { quality: '', url: entry } : entry).filter(x => safeUrl(x?.url));
    const score = q => /320|high|lossless/i.test(String(q)) ? 3 : /160|medium/i.test(String(q)) ? 2 : /96|low/i.test(String(q)) ? 1 : 0;
    ranked.sort((a, b) => score(b.quality) - score(a.quality));
    return ranked[0]?.url ? safeUrl(ranked[0].url) : '';
  }
  async function enrichSong(item) {
    const clean = cleanSong(item);
    if (!getId(clean) || clean.downloadUrl?.length) return clean;
    try {
      const payload = await apiGet(`/api/songs/${encodeURIComponent(getId(clean))}`);
      const data = dataFrom(payload); const song = Array.isArray(data) ? data[0] : data?.songs?.[0] || data;
      if (song && typeof song === 'object') return { ...clean, ...song, id: getId(song) || getId(clean) };
    } catch { /* Use search result data and its source link as fallback. */ }
    return clean;
  }
  function queueFromDetail() {
    if (!state.detail) return [];
    const data = state.detail.data;
    if (state.detail.type === 'albums' || state.detail.type === 'playlists') return normalizeArray(data?.songs).map(cleanSong);
    if (state.detail.type === 'artists') return normalizeArray(data?.topSongs).map(cleanSong);
    return [];
  }
  async function playItem(item, queue = null) {
    if (!item) return;
    const sourceQueue = normalizeArray(queue).map(cleanSong);
    const selected = cleanSong(item);
    const matchingIndex = sourceQueue.findIndex(song => getId(song) === getId(selected));
    state.queue = sourceQueue.length ? sourceQueue : [selected];
    state.queueIndex = matchingIndex >= 0 ? matchingIndex : state.queue.findIndex(song => getId(song) === getId(selected));
    if (state.queueIndex < 0) { state.queue.push(selected); state.queueIndex = state.queue.length - 1; }
    state.currentTrack = await enrichSong(selected);
    state.queue[state.queueIndex] = state.currentTrack;
    updatePlayer();
    if (!CFG.ENABLE_API_AUDIO_PLAYBACK) {
      const link = getSourceLink(state.currentTrack);
      const anchor = link ? ` <a href="${esc(link)}" target="_blank" rel="noopener noreferrer">Buka di sumber ↗</a>` : '';
      toast(`Pemutaran audio dari API dinonaktifkan. Aktifkan hanya setelah izin streaming dipastikan.${anchor}`);
      return;
    }
    await startCurrentAudio();
  }
  async function startCurrentAudio() {
    if (!state.currentTrack) return;
    const url = getAudioUrl(state.currentTrack);
    if (!url) { toast('URL audio tidak tersedia untuk lagu ini.'); return; }
    try {
      audio.src = url; audio.volume = Number($('#volume-range').value || 0.8);
      await audio.play(); updatePlayButton(true);
      toast(`Memutar ${getTitle(state.currentTrack)}`);
    } catch (error) {
      updatePlayButton(false);
      toast(error.name === 'NotAllowedError' ? 'Browser meminta tindakan pemutaran langsung. Tekan tombol putar sekali lagi.' : 'Audio gagal diputar. URL bisa kedaluwarsa, diblokir, atau tidak kompatibel.');
    }
  }
  function updatePlayer() {
    const song = state.currentTrack;
    $('#player-title').textContent = song ? getTitle(song) : 'Belum ada lagu dipilih';
    $('#player-artist').textContent = song ? (getArtists(song) || song.album?.name || 'Artis tidak diketahui') : 'Cari lagu untuk memulai';
    const art = $('#player-art'); const image = getImage(song || {});
    art.innerHTML = image ? `<img src="${esc(image)}" alt="" referrerpolicy="no-referrer">` : '<span>♫</span>';
    updatePlayerFavorite();
    $('#current-time').textContent = formatTime(audio.currentTime || 0);
    $('#duration-time').textContent = formatTime(audio.duration || Number(song?.duration || 0));
    $('#progress-range').value = audio.duration ? String((audio.currentTime / audio.duration) * 100) : '0';
  }
  function updatePlayerFavorite() {
    const button = $('#player-like'); const song = state.currentTrack;
    const saved = song && isFavorite('songs', song);
    button.classList.toggle('saved', !!saved); button.textContent = saved ? '♥' : '♡';
    button.disabled = !song;
  }
  function updatePlayButton(playing) { $('#play-button').textContent = playing ? 'Ⅱ' : '▶'; $('#play-button').setAttribute('aria-label', playing ? 'Jeda' : 'Putar'); }
  function formatTime(seconds) { const n = Number(seconds); if (!Number.isFinite(n) || n < 0) return '0:00'; return `${Math.floor(n / 60)}:${String(Math.floor(n % 60)).padStart(2, '0')}`; }
  async function playQueueIndex(index) {
    if (index < 0 || index >= state.queue.length) return;
    state.queueIndex = index;
    state.currentTrack = await enrichSong(state.queue[index]);
    state.queue[index] = state.currentTrack;
    updatePlayer();
    if (CFG.ENABLE_API_AUDIO_PLAYBACK) await startCurrentAudio();
    else {
      const link = getSourceLink(state.currentTrack);
      toast(`Lagu dipilih: ${getTitle(state.currentTrack)}. Pemutaran API belum diaktifkan.${link ? ` <a href="${esc(link)}" target="_blank" rel="noopener noreferrer">Buka sumber ↗</a>` : ''}`);
    }
  }
  async function nextTrack() {
    if (state.queueIndex + 1 < state.queue.length) return playQueueIndex(state.queueIndex + 1);
    if (state.autoplay && state.currentTrack && CFG.ENABLE_API_AUDIO_PLAYBACK) {
      try {
        const payload = await apiGet(`/api/songs/${encodeURIComponent(getId(state.currentTrack))}/suggestions?limit=10`);
        const suggestions = normalizeArray(dataFrom(payload));
        const known = new Set(state.queue.map(getId));
        const fresh = suggestions.filter(song => getId(song) && !known.has(getId(song))).map(cleanSong);
        state.queue.push(...fresh);
        if (state.queueIndex + 1 < state.queue.length) return playQueueIndex(state.queueIndex + 1);
      } catch { toast('Rekomendasi otomatis belum tersedia dari API.'); }
    }
    if (state.queueIndex >= 0 && state.queueIndex + 1 >= state.queue.length) toast('Antrean sudah selesai.');
  }
  function previousTrack() {
    if (audio.currentTime > 4) { audio.currentTime = 0; return; }
    if (state.queueIndex > 0) playQueueIndex(state.queueIndex - 1);
    else if (state.currentTrack) { audio.currentTime = 0; if (CFG.ENABLE_API_AUDIO_PLAYBACK) startCurrentAudio(); }
  }
  function toast(message) {
    const region = $('#toast-region'); const node = document.createElement('div'); node.className = 'toast'; node.innerHTML = message;
    region.appendChild(node); state.toasts.push(node);
    setTimeout(() => { node.style.opacity = '0'; node.style.transform = 'translateY(5px)'; setTimeout(() => node.remove(), 220); }, 4700);
  }
  function openQueue() {
    const root = $('#modal-root');
    root.innerHTML = `<div class="modal-backdrop" data-close-modal><aside class="queue-drawer" role="dialog" aria-modal="true" aria-label="Antrean musik"><div class="drawer-header"><div><div class="section-kicker">NOW & NEXT</div><h2>Antrean musik</h2></div><button class="drawer-close" data-close-modal aria-label="Tutup">×</button></div><div class="queue-list">${state.queue.length ? state.queue.map((song, index) => `<div class="queue-item ${index === state.queueIndex ? 'current' : ''}"><div class="queue-cover">${getImage(song) ? `<img src="${esc(getImage(song))}" alt="" referrerpolicy="no-referrer">` : '♫'}</div><div class="queue-text"><strong>${esc(getTitle(song))}</strong><span>${esc(getArtists(song) || song.album?.name || 'Artis tidak diketahui')}</span></div><button data-queue-play="${index}" aria-label="Pilih lagu">${index === state.queueIndex ? '●' : '▶'}</button></div>`).join('') : '<div class="empty-queue">Pilih sebuah lagu untuk membangun antrean.</div>'}</div></aside></div>`;
  }

  // Events: delegated for dynamic catalog cards.
  document.addEventListener('click', async event => {
    const target = event.target.closest('button,a');
    if (!target) return;
    if (target.dataset.query) { event.preventDefault(); syncSearchBoxes(target.dataset.query); goSearch(target.dataset.query, 'all'); return; }
    if (target.dataset.browse) { event.preventDefault(); goSearch('', target.dataset.browse); return; }
    if (target.id === 'sidebar-search') { goSearch('', 'all'); return; }
    if (target.id === 'favorites-shortcut') { changeHash('#favorites'); return; }
    if (target.dataset.nav === 'search') { event.preventDefault(); goSearch('', 'all'); return; }
    if (target.dataset.filterType) { goSearch(state.query, target.dataset.filterType); return; }
    if (target.dataset.type && target.classList.contains('filter-tab')) { goSearch(state.query, target.dataset.type); return; }
    if (target.id === 'clear-search') { changeHash('#home'); return; }
    if (target.hasAttribute('data-retry-search')) { state.lastSearchKey = ''; executeSearch(state.query, state.type); return; }
    if (target.hasAttribute('data-retry-detail')) { const d = state.detail; if (d) openDetail(d.type, d.id, d.data); return; }
    if (target.dataset.openKey) {
      const [type, id] = target.dataset.openKey.split('|'); const item = state.itemRegistry.get(target.dataset.openKey);
      if (!item) return;
      if (type === 'songs') { await playItem(item, state.results.songs || []); }
      else openDetail(type, id, item);
      return;
    }
    if (target.dataset.playKey) {
      const [type] = target.dataset.playKey.split('|'); const item = state.itemRegistry.get(target.dataset.playKey);
      if (item) await playItem(item, type === 'songs' ? (state.route === 'detail' && queueFromDetail().length ? queueFromDetail() : (state.results.songs?.length ? state.results.songs : [item])) : [item]);
      return;
    }
    if (target.dataset.favoriteKey) {
      const [type] = target.dataset.favoriteKey.split('|'); const item = state.itemRegistry.get(target.dataset.favoriteKey); if (item) toggleFavorite(type, item); return;
    }
    if (target.dataset.playDetail) { const queue = queueFromDetail(); if (!queue.length) return toast('Daftar lagu belum tersedia untuk diputar.'); await playItem(queue[0], queue); return; }
    if (target.dataset.artistList) { await loadArtistList(target.dataset.artistList); return; }
    if (target.id === 'load-more-playlist') { await loadMorePlaylist(); return; }
    if (target.id === 'queue-button') { openQueue(); return; }
    if (target.hasAttribute('data-close-modal')) { if (event.target === target || target.dataset.closeModal !== undefined) $('#modal-root').innerHTML = ''; return; }
    if (target.dataset.queuePlay !== undefined) { await playQueueIndex(Number(target.dataset.queuePlay)); $('#modal-root').innerHTML = ''; return; }
    if (target.id === 'play-button') {
      if (!state.currentTrack) { toast('Cari dan pilih lagu terlebih dahulu.'); return; }
      if (!CFG.ENABLE_API_AUDIO_PLAYBACK) {
        const link = getSourceLink(state.currentTrack); toast(`Pemutaran audio API belum aktif.${link ? ` <a href="${esc(link)}" target="_blank" rel="noopener noreferrer">Buka sumber ↗</a>` : ''}`); return;
      }
      if (audio.paused) await startCurrentAudio(); else audio.pause();
      return;
    }
    if (target.id === 'next-button') { await nextTrack(); return; }
    if (target.id === 'previous-button') { previousTrack(); return; }
    if (target.id === 'player-like') { if (state.currentTrack) toggleFavorite('songs', state.currentTrack); return; }
    if (target.id === 'autoplay-button') { state.autoplay = !state.autoplay; target.classList.toggle('active', state.autoplay); toast(state.autoplay ? 'Autoplay rekomendasi aktif.' : 'Autoplay rekomendasi nonaktif.'); return; }
  });

  $('#top-search-form').addEventListener('submit', event => { event.preventDefault(); const q = $('#top-search-input').value.trim(); syncSearchBoxes(q); goSearch(q, 'all'); });
  $('#hero-search-form').addEventListener('submit', event => { event.preventDefault(); const q = $('#hero-search-input').value.trim(); syncSearchBoxes(q); goSearch(q, 'all'); });
  $('#top-search-input').addEventListener('keydown', event => { if (event.key === 'Escape') { event.currentTarget.value = ''; event.currentTarget.blur(); } });
  $('#hero-search-input').addEventListener('keydown', event => { if (event.key === 'Escape') { event.currentTarget.value = ''; event.currentTarget.blur(); } });
  $('#progress-range').addEventListener('input', event => { if (audio.duration && CFG.ENABLE_API_AUDIO_PLAYBACK) audio.currentTime = (Number(event.target.value) / 100) * audio.duration; });
  $('#volume-range').addEventListener('input', event => { audio.volume = Number(event.target.value); });
  audio.addEventListener('timeupdate', () => { $('#current-time').textContent = formatTime(audio.currentTime); $('#duration-time').textContent = formatTime(audio.duration || 0); $('#progress-range').value = audio.duration ? String((audio.currentTime / audio.duration) * 100) : '0'; });
  audio.addEventListener('loadedmetadata', updatePlayer);
  audio.addEventListener('play', () => updatePlayButton(true));
  audio.addEventListener('pause', () => updatePlayButton(false));
  audio.addEventListener('ended', nextTrack);
  audio.addEventListener('error', () => { updatePlayButton(false); toast('Audio tidak bisa diputar. Sumber mungkin tidak tersedia atau menolak pemutaran lintas situs.'); });
  window.addEventListener('hashchange', routeFromHash);
  window.addEventListener('keydown', event => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); $('#top-search-input').focus(); }
    if (event.key === 'Escape') $('#modal-root').innerHTML = '';
  });

  $('#year-now').textContent = String(new Date().getFullYear());
  $('#volume-range').value = '0.8'; audio.volume = .8;
  routeFromHash();
})();
