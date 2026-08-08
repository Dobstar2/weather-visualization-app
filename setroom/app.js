(() => {
  'use strict';

  const CATALOG = Array.isArray(window.SETROOM_CATALOG) ? window.SETROOM_CATALOG : [];
  const DEFAULT_STATE = window.SETROOM_DEFAULT_STATE || {};
  const CONFIG = window.SETROOM_CONFIG || {};
  const STORAGE_KEY = 'setroom.state.v1';
  const PRO_ROUTES = new Set(['build', 'sell', 'buy']);
  const ROUTES = new Set(['studio', 'dashboard', 'collection', 'space', 'build', 'sell', 'buy', 'settings']);
  const moneyFormatter = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' });
  const numberFormatter = new Intl.NumberFormat('en-GB');

  let state = loadState();
  let currentRoute = 'dashboard';
  let ui = {
    collectionFilter: 'all',
    collectionSearch: '',
    selectedBuildSetId: '',
    selectedSellSetId: '',
    buyBudget: null,
    buyFitOnly: false,
    sidebarOpen: false,
    studioSearch: '',
    studioSelectedSetId: '76269',
    studioSelectedPlacementId: '',
    studioActiveShelfId: '',
    studioEnteringPlacementId: '',
    studioCamera: { yaw:-16, pitch:-9, zoom:.9 }
  };

  let timer = { running: false, startedAt: 0, elapsedMs: 0, intervalId: null };
  let cameraStream = null;
  let mediaRecorder = null;
  let mediaChunks = [];
  let recordingUrl = '';
  let recordingStartedAt = 0;
  let shelfStudio = null;

  init();

  function init() {
    normaliseShelfPlacements();
    document.documentElement.classList.toggle('reduce-motion', Boolean(state.settings?.reducedMotion));
    window.addEventListener('hashchange', handleHash);
    document.addEventListener('click', handleClick);
    document.addEventListener('input', handleInput);
    document.addEventListener('change', handleChange);
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape') closeModal();
    });
    document.getElementById('import-file')?.addEventListener('change', importBackupFile);
    handleHash();
    if ('serviceWorker' in navigator && location.protocol !== 'file:') {
      navigator.serviceWorker.register('./sw.js').catch(() => {});
    }
  }

  function deepClone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function mergeState(saved) {
    const base = deepClone(DEFAULT_STATE);
    if (!saved || typeof saved !== 'object') return base;
    return {
      ...base,
      ...saved,
      collection: Array.isArray(saved.collection) ? saved.collection : base.collection,
      shelves: Array.isArray(saved.shelves) ? saved.shelves : base.shelves,
      sessions: Array.isArray(saved.sessions) ? saved.sessions : base.sessions,
      sales: Array.isArray(saved.sales) ? saved.sales : base.sales,
      customSets: Array.isArray(saved.customSets) ? saved.customSets : [],
      preferences: { ...(base.preferences || {}), ...(saved.preferences || {}) },
      goal: { ...(base.goal || {}), ...(saved.goal || {}) },
      settings: { ...(base.settings || {}), ...(saved.settings || {}) }
    };
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return mergeState(raw ? JSON.parse(raw) : null);
    } catch (error) {
      return mergeState(null);
    }
  }

  function saveState() {
    state.version = 2;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (error) {
      toast('This browser could not save the latest change.', 'error');
    }
  }

  function handleHash() {
    const hash = location.hash || '';
    if (!hash.startsWith('#app')) {
      showMarketing();
      return;
    }
    const route = hash.replace(/^#app\/?/, '').split(/[/?]/)[0] || 'studio';
    currentRoute = ROUTES.has(route) ? route : 'studio';
    showApplication();
  }

  function showMarketing() {
    stopCamera();
    shelfStudio?.destroy();
    shelfStudio = null;
    document.querySelector('[data-marketing-header]')?.removeAttribute('hidden');
    document.getElementById('marketing-view')?.removeAttribute('hidden');
    const app = document.getElementById('app-view');
    if (app) {
      app.hidden = true;
      app.innerHTML = '';
    }
  }

  function showApplication() {
    document.querySelector('[data-marketing-header]')?.setAttribute('hidden', '');
    document.getElementById('marketing-view')?.setAttribute('hidden', '');
    const app = document.getElementById('app-view');
    if (app) app.hidden = false;
    renderApp();
  }

  function navigate(route) {
    const safeRoute = ROUTES.has(route) ? route : 'studio';
    if (location.hash === `#app/${safeRoute}`) {
      currentRoute = safeRoute;
      showApplication();
    } else {
      location.hash = `app/${safeRoute}`;
    }
  }

  function renderApp() {
    stopTimerIntervalOnly();
    if (currentRoute !== 'build') stopCamera();
    shelfStudio?.destroy();
    shelfStudio = null;
    const app = document.getElementById('app-view');
    if (!app) return;
    const goal = goalProgress();
    const trial = trialDaysLeft();
    const plan = hasPro() ? (state.licensed ? 'PRO' : `TRIAL · ${trial}D`) : 'FREE';
    const route = currentRoute === 'dashboard' || currentRoute === 'space' ? 'studio' : currentRoute;
    const trialStrip = state.trialStartedAt && !state.licensed && trial > 0
      ? `<div class="trial-strip"><span>Pro trial · ${trial} day${trial === 1 ? '' : 's'} left</span><button type="button" data-action="paywall">View plan</button></div>`
      : '';

    app.innerHTML = `<div class="app-shell">
      <header class="app-header">
        <a class="brand" href="#app/studio" aria-label="SetRoom shelf studio"><span class="brand-brick" aria-hidden="true"><i></i><i></i><i></i><i></i></span><span class="brand-word">SetRoom</span></a>
        <nav class="app-nav" aria-label="Workspace navigation">
          ${navButton('studio', 'Shelf')}
          ${navButton('collection', 'Collection')}
          ${navButton('build', 'Build', true)}
          ${navButton('sell', 'Sell', true)}
          ${navButton('buy', 'Buy', true)}
        </nav>
        <div class="app-header-actions"><button class="plan-pill" type="button" data-action="paywall">${plan}</button><button class="button button-primary" type="button" data-action="add-set">Add set</button><button class="mobile-menu" type="button" data-action="open-sidebar" aria-label="Open menu">Menu</button></div>
      </header>
      <div class="mobile-nav-drawer" aria-label="Mobile workspace navigation">
        ${navButton('studio', 'Shelf')}${navButton('collection', 'Collection')}${navButton('build', 'Build', true)}${navButton('sell', 'Sell', true)}${navButton('buy', 'Buy', true)}${navButton('settings', 'Settings')}
      </div>
      ${trialStrip}
      <main class="app-main"><section class="app-content" id="app-content">${renderRoute()}</section></main>
      <nav class="mobile-bottom-nav" aria-label="Mobile quick navigation">${navButton('studio', 'Shelf')}${navButton('collection', 'Sets')}${navButton('build', 'Build', true)}${navButton('sell', 'Sell', true)}</nav>
    </div>`;
    ui.sidebarOpen = false;
    afterRender();
  }

  function navButton(route, label, pro = false) {
    const activeRoute = currentRoute === 'dashboard' || currentRoute === 'space' ? 'studio' : currentRoute;
    const icon = ({studio:'▦',collection:'□',build:'◷',sell:'£',buy:'+',settings:'·'})[route] || '·';
    return `<button class="nav-button ${activeRoute === route ? 'is-active' : ''}" type="button" data-route="${route}"><span class="nav-icon" aria-hidden="true">${icon}</span><span>${label}</span>${pro ? '<small>PRO</small>' : ''}</button>`;
  }

  function routeTitle(route) {
    return ({ studio:'Shelf studio', dashboard:'Shelf studio', collection:'Collection', space:'Shelf studio', build:'Build replay', sell:'Sell mode', buy:'Buy smart', settings:'Settings' })[route] || 'Shelf studio';
  }

  function renderRoute() {
    const route = currentRoute === 'dashboard' || currentRoute === 'space' ? 'studio' : currentRoute;
    if (PRO_ROUTES.has(route) && !hasPro()) return renderLocked(route);
    return ({ studio:renderStudio, collection:renderCollection, build:renderBuild, sell:renderSell, buy:renderBuy, settings:renderSettings })[route]?.() || renderStudio();
  }

  function afterRender() {
    const route = currentRoute === 'dashboard' || currentRoute === 'space' ? 'studio' : currentRoute;
    if (route === 'studio') setupStudio();
    if (route === 'collection') setupCollection();
    if (route === 'build' && hasPro()) setupBuild();
    if (route === 'sell' && hasPro()) setupSell();
    if (route === 'buy' && hasPro()) setupBuy();
  }

  function pageHead(kicker, title, copy, actions = '') {
    return `<header class="page-head"><div><span class="page-kicker">${escapeHTML(kicker)}</span><h1>${escapeHTML(title)}</h1><p>${escapeHTML(copy)}</p></div>${actions ? `<div class="page-actions">${actions}</div>` : ''}</header>`;
  }

  function hasPro() {
    return Boolean(state.licensed) || trialDaysLeft() > 0;
  }

  function trialDaysLeft() {
    if (!state.trialStartedAt) return 0;
    const elapsed = Date.now() - new Date(state.trialStartedAt).getTime();
    return Math.max(0, 7 - Math.floor(elapsed / 86400000));
  }

  function startTrial(route = 'space') {
    if (!state.trialStartedAt || trialDaysLeft() === 0) state.trialStartedAt = new Date().toISOString();
    state.mode = 'live';
    saveState();
    closeModal();
    toast('Your seven-day Pro trial is active.', 'success');
    navigate(route);
  }

  function allSets() {
    return [...CATALOG, ...(Array.isArray(state.customSets) ? state.customSets : [])];
  }

  function getSet(id) {
    return allSets().find(set => set.id === id || set.number === id);
  }

  function getCollectionItem(setId) {
    return state.collection.find(item => item.setId === setId);
  }

  function ownedItems() {
    return state.collection.filter(item => item.status === 'owned' && getSet(item.setId));
  }

  function wishlistItems() {
    return state.collection.filter(item => item.status === 'wishlist' && getSet(item.setId));
  }

  function soldItems() {
    return state.collection.filter(item => item.status === 'sold');
  }

  function placedSetIds() {
    return new Set((state.shelves || []).flatMap(shelf => (shelf.placements || []).map(placement => placement.setId)));
  }

  function money(value) {
    return moneyFormatter.format(Number(value) || 0);
  }

  function number(value) {
    return numberFormatter.format(Number(value) || 0);
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, Number(value) || 0));
  }

  function uid(prefix) {
    return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  }

  function escapeHTML(value) {
    return String(value ?? '').replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]);
  }

  function dateLabel(value) {
    if (!value) return 'Not set';
    const date = new Date(String(value).length <= 10 ? `${value}T12:00:00` : value);
    if (Number.isNaN(date.getTime())) return 'Not set';
    return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  function imageMarkup(set, className = '') {
    return `<div class="set-art ${className}"><img src="${escapeHTML(set?.image || '')}" alt="${escapeHTML(set?.name || 'Set')} box image" loading="lazy" onerror="this.parentElement.classList.add('broken');this.remove()"></div>`;
  }

  function bareImage(set) {
    return `<img src="${escapeHTML(set?.image || '')}" alt="${escapeHTML(set?.name || 'Set')} box image" loading="lazy" onerror="this.style.display='none'">`;
  }

  function goalProgress() {
    const current = Math.max(0, (state.sales || []).reduce((sum, sale) => sum + (Number(sale.profit) || 0), 0));
    const target = Math.max(1, Number(state.goal?.target) || 500);
    return { current, target, percent: clamp(current / target * 100, 0, 100) };
  }

  function toast(message, type = 'info') {
    const region = document.getElementById('toast-region');
    if (!region) return;
    const node = document.createElement('div');
    node.className = `toast ${type}`;
    node.textContent = message;
    region.appendChild(node);
    window.setTimeout(() => node.remove(), 3600);
  }

  function renderLocked(route) {
    const copy = {
      space: ['SPACE PLANNER', 'Know where the next set goes.', 'Measure shelves, test both orientations and auto-arrange the room before buying furniture or another oversized set.', '01'],
      build: ['BUILD REPLAY', 'Turn the build into a record.', 'Time sessions, track progress and record private camera footage directly in the browser.', '02'],
      sell: ['SELL MODE', 'Count money that reaches the bank.', 'Calculate fees, postage, packaging and original spend before you decide what a sale is worth.', '03'],
      buy: ['BUY SMART', 'Let the whole collection choose next.', 'Rank sets by budget, taste and the free shelf space you actually have.', '04']
    }[route];
    return `<section class="locked-page"><div class="locked-copy"><span>PRO · ${copy[0]}</span><h1>${copy[1]}</h1><p>${copy[2]}</p><button class="button button-acid button-large" type="button" data-action="start-trial" data-route-after="${route}">Start seven-day trial</button></div><aside class="locked-side"><strong>${copy[3]}</strong><span>ONE OF FOUR PAID DECISION TOOLS</span><p>The free catalogue remains available after the trial. SetRoom only charges for the tools designed to prevent expensive mistakes.</p></aside></section>`;
  }

  function normaliseShelfPlacements() {
    (state.shelves || []).forEach(shelf => {
      let cursor = 0;
      shelf.placements = Array.isArray(shelf.placements) ? shelf.placements : [];
      shelf.placements.forEach(placement => {
        const set = getSet(placement.setId);
        const dims = orientedDimensions(set, placement.orientation || 'normal');
        placement.id = placement.id || uid('place');
        placement.orientation = placement.orientation === 'rotated' ? 'rotated' : 'normal';
        if (!Number.isFinite(Number(placement.x))) placement.x = cursor;
        if (!Number.isFinite(Number(placement.z))) placement.z = 0;
        placement.x = clamp(placement.x, 0, Math.max(0, Number(shelf.width) - dims.w));
        placement.z = clamp(placement.z, 0, Math.max(0, Number(shelf.depth) - dims.d));
        cursor = Math.max(cursor, placement.x + dims.w + 2);
      });
    });
  }

  function placementRecord(key) {
    for (const shelf of state.shelves || []) {
      const placement = (shelf.placements || []).find(item => String(item.id) === String(key));
      if (placement) return { shelf, placement, set:getSet(placement.setId) };
    }
    return null;
  }

  function placementForSet(setId) {
    for (const shelf of state.shelves || []) {
      const placement = (shelf.placements || []).find(item => item.setId === setId);
      if (placement) return { shelf, placement, set:getSet(setId) };
    }
    return null;
  }

  function placementCollision(shelf, candidate, excludingId = '') {
    const dims = orientedDimensions(candidate.set, candidate.orientation);
    return (shelf.placements || []).some(other => {
      if (String(other.id) === String(excludingId)) return false;
      const otherSet = getSet(other.setId);
      const otherDims = orientedDimensions(otherSet, other.orientation);
      return candidate.x < Number(other.x || 0) + otherDims.w && candidate.x + dims.w > Number(other.x || 0) && candidate.z < Number(other.z || 0) + otherDims.d && candidate.z + dims.d > Number(other.z || 0);
    });
  }

  function firstOpenPosition(set, shelf, orientation = 'normal', excludingId = '') {
    const dims = orientedDimensions(set, orientation);
    const width = Number(shelf.width) || 0;
    const depth = Number(shelf.depth) || 0;
    const height = Number(shelf.height) || 0;
    if (dims.w > width || dims.d > depth || dims.h > height) return { fits:false, dims, reason:dims.w > width ? 'width' : dims.d > depth ? 'depth' : 'height' };
    const step = 2;
    for (let z = 0; z <= Math.max(0, depth - dims.d) + .01; z += step) {
      for (let x = 0; x <= Math.max(0, width - dims.w) + .01; x += step) {
        const candidate = { set, orientation, x, z };
        if (!placementCollision(shelf, candidate, excludingId)) {
          return { fits:true, dims, x, z, remainingWidth:Math.max(0, width - x - dims.w), remainingDepth:Math.max(0, depth - z - dims.d), remainingHeight:Math.max(0, height - dims.h) };
        }
      }
    }
    return { fits:false, dims, reason:'space' };
  }

  function bestStudioFit(set, excludingId = '') {
    if (!set) return null;
    const fits = [];
    (state.shelves || []).forEach(shelf => ['normal','rotated'].forEach(orientation => {
      const fit = firstOpenPosition(set, shelf, orientation, excludingId);
      if (fit.fits) fits.push({ shelf, orientation, ...fit, waste:(fit.remainingWidth + fit.remainingDepth * .35 + fit.remainingHeight * .12) });
    }));
    fits.sort((a,b) => a.waste - b.waste || Number(a.shelf.width) - Number(b.shelf.width));
    return fits[0] || null;
  }

  function studioSearchResults(query = ui.studioSearch) {
    const q = String(query || '').trim().toLowerCase();
    const pool = allSets().filter(set => !q || `${set.number} ${set.name} ${set.theme}`.toLowerCase().includes(q));
    return pool.sort((a,b) => Number(b.demand || 0) - Number(a.demand || 0)).slice(0, q ? 8 : 5);
  }

  function studioResultsMarkup() {
    const results = studioSearchResults();
    return results.map(set => `<button class="studio-search-result ${set.id === ui.studioSelectedSetId ? 'is-selected' : ''}" type="button" data-action="studio-select-set" data-set-id="${escapeHTML(set.id)}"><span class="search-thumb">${bareImage(set)}</span><span><b>${escapeHTML(set.name)}</b><small>${escapeHTML(set.number)} · ${escapeHTML(set.theme)} · ${number(set.pieces)} pieces</small></span><i aria-hidden="true">›</i></button>`).join('') || `<div class="studio-search-empty"><b>No matching set</b><span>Try a set number, name or theme.</span></div>`;
  }

  function studioProductMarkup(set) {
    if (!set) return '';
    const existing = placementForSet(set.id);
    const best = bestStudioFit(set, existing?.placement.id || '');
    const placed = Boolean(existing);
    const fitClass = best ? 'is-fit' : 'is-no-fit';
    const fitTitle = best ? `Best fit: ${best.shelf.name}` : 'No shelf fits this set';
    const fitDetail = best ? `${best.orientation === 'rotated' ? 'Rotated · ' : ''}${best.remainingWidth.toFixed(0)} cm width, ${best.remainingDepth.toFixed(0)} cm depth and ${best.remainingHeight.toFixed(0)} cm height left` : 'Add a larger shelf or rearrange the current boxes.';
    return `<article class="studio-product-card">
      <div class="studio-product-art">${bareImage(set)}<span>ACTUAL BOX ARTWORK</span></div>
      <div class="studio-product-copy"><span class="product-kicker">${escapeHTML(set.theme)} · ${escapeHTML(set.number)}</span><h2>${escapeHTML(set.name)}</h2><div class="product-facts"><span><b>${number(set.pieces)}</b> pieces</span><span><b>${set.dimensions.w} × ${set.dimensions.d} × ${set.dimensions.h}</b> cm</span><span><b>${set.year || '—'}</b> release</span></div><div class="fit-banner ${fitClass}"><i></i><span><b>${escapeHTML(fitTitle)}</b><small>${escapeHTML(fitDetail)}</small></span></div></div>
      <div class="studio-product-action"><button class="button button-primary button-large" type="button" data-action="studio-add-set" data-set-id="${escapeHTML(set.id)}" ${best ? '' : 'disabled'}>${placed ? 'Move to best shelf' : 'Add to shelf'}</button><small>${best ? 'Placement is calculated automatically.' : 'This set is kept in the preview until it fits.'}</small></div>
    </article>`;
  }

  function selectedPlacementMarkup() {
    const record = placementRecord(ui.studioSelectedPlacementId);
    if (!record) {
      const active = state.shelves.find(shelf => shelf.id === ui.studioActiveShelfId) || state.shelves[0];
      if (!active) return `<div class="inspector-empty"><b>Add your first shelf</b><p>Measure the usable width, depth and height.</p><button class="button button-primary" type="button" data-action="add-shelf">Add shelf</button></div>`;
      const used = shelfUsage(active);
      return `<div class="inspector-empty"><span class="inspector-label">SELECTED SHELF</span><h3>${escapeHTML(active.name)}</h3><p>${escapeHTML(active.room || 'No room set')} · ${active.width} W × ${active.depth} D × ${active.height} H cm</p><div class="capacity-meter"><i style="width:${clamp(used / Math.max(1, active.width) * 100,0,100)}%"></i></div><strong>${Math.max(0, active.width-used).toFixed(1)} cm width free</strong><small>Select a box to move, rotate or remove it.</small></div>`;
    }
    const { shelf, placement, set } = record;
    const dims = orientedDimensions(set, placement.orientation);
    return `<div class="selected-box-panel"><span class="inspector-label">SELECTED BOX</span><div class="selected-box-head"><span class="selected-box-thumb">${bareImage(set)}</span><div><h3>${escapeHTML(set.name)}</h3><p>${escapeHTML(set.number)} · ${dims.w} W × ${dims.d} D × ${dims.h} H cm</p></div></div><div class="form-grid compact"><label class="form-field full"><span>Move to shelf</span><select id="studio-placement-shelf">${state.shelves.map(item => `<option value="${escapeHTML(item.id)}" ${item.id === shelf.id ? 'selected' : ''}>${escapeHTML(item.name)}</option>`).join('')}</select></label><label class="form-field full"><span>Box direction</span><select id="studio-placement-orientation"><option value="normal" ${placement.orientation !== 'rotated' ? 'selected' : ''}>Front facing</option><option value="rotated" ${placement.orientation === 'rotated' ? 'selected' : ''}>Turn 90°</option></select></label></div><button class="button button-primary full-button" type="button" data-action="studio-apply-placement" data-placement-id="${escapeHTML(placement.id)}">Apply placement</button><button class="button button-quiet full-button" type="button" data-action="studio-remove-placement" data-placement-id="${escapeHTML(placement.id)}">Remove from shelf</button><p class="drag-hint">You can also drag this box directly inside the 3D shelf.</p></div>`;
  }

  function renderSavedShelves() {
    return (state.shelves || []).map((shelf,index) => {
      const used = shelfUsage(shelf);
      const count = (shelf.placements || []).length;
      return `<button class="saved-shelf-card ${ui.studioActiveShelfId === shelf.id ? 'is-active' : ''}" type="button" data-action="studio-select-shelf" data-shelf-id="${escapeHTML(shelf.id)}"><span class="shelf-card-number">${String(index+1).padStart(2,'0')}</span><div><b>${escapeHTML(shelf.name)}</b><small>${escapeHTML(shelf.room || 'Unassigned')} · ${count} box${count === 1 ? '' : 'es'}</small></div><span class="shelf-free"><b>${Math.max(0, Number(shelf.width)-used).toFixed(0)} cm</b><small>width free</small></span><i style="--used:${clamp(used/Math.max(1,shelf.width)*100,0,100)}%"></i></button>`;
    }).join('') || `<div class="empty-state compact"><h3>No shelves yet</h3><p>Add a shelf to start checking fit.</p></div>`;
  }

  function renderStudio() {
    normaliseShelfPlacements();
    const set = getSet(ui.studioSelectedSetId) || CATALOG[0];
    ui.studioSelectedSetId = set?.id || '';
    if (!ui.studioActiveShelfId) ui.studioActiveShelfId = state.shelves[0]?.id || '';
    const placements = (state.shelves || []).reduce((sum,shelf) => sum + (shelf.placements || []).length,0);
    const existing = placementForSet(set?.id);
    const best = bestStudioFit(set, existing?.placement.id || '');
    return `<div class="studio-page">
      <header class="studio-heading"><div><span class="page-kicker">3D SHELF PLANNER</span><h1>See where every box fits.</h1><p>Search a set, check the suggested shelf, then place and rearrange it in 3D.</p></div><div class="studio-steps" aria-label="How to use SetRoom"><span class="is-active"><b>1</b>Pick a set</span><span><b>2</b>Check the fit</span><span><b>3</b>Place the box</span></div></header>
      <section class="studio-search-section" aria-label="Find a LEGO set"><div class="studio-search-box"><label for="studio-search">Search by set number, name or theme</label><div><span aria-hidden="true">⌕</span><input id="studio-search" type="search" value="${escapeHTML(ui.studioSearch)}" placeholder="Try 76269 or Avengers Tower" autocomplete="off"><kbd>SEARCH</kbd></div></div><div class="studio-search-results" id="studio-search-results">${studioResultsMarkup()}</div></section>
      <div id="studio-product-panel">${studioProductMarkup(set)}</div>
      <section class="studio-workspace"><div class="studio-scene-card"><header><div><span class="page-kicker">YOUR DISPLAY</span><h2>Drag to explore. Select a box to move it.</h2></div><div class="scene-status"><span>${state.shelves.length} shelves</span><span>${placements} boxes</span><button type="button" data-action="studio-auto-arrange">Auto-arrange</button></div></header><div class="studio-scene" id="studio-scene" aria-label="Interactive 3D shelf"></div></div><aside class="studio-inspector"><header><span>BOX & SHELF DETAILS</span><button type="button" data-action="add-shelf">+ Shelf</button></header><div id="studio-inspector-body">${selectedPlacementMarkup()}</div>${!hasPro() ? '<button class="pro-nudge" type="button" data-action="paywall"><b>Unlock smart layouts</b><span>Auto-arrange, build replay, selling tools and purchase recommendations.</span><i>View Pro</i></button>' : ''}</aside></section>
      <section class="saved-shelves"><header><div><span class="page-kicker">SAVED SHELVES</span><h2>Your measured spaces</h2></div><button class="button button-secondary" type="button" data-action="add-shelf">Add shelf</button></header><div class="saved-shelf-list">${renderSavedShelves()}</div></section>
      <section class="studio-stats"><article><span>COLLECTION</span><strong>${ownedItems().length}</strong><p>owned sets</p></article><article><span>ON DISPLAY</span><strong>${placements}</strong><p>boxes placed</p></article><article><span>NEXT FIT</span><strong>${best ? escapeHTML(best.shelf.name) : 'No fit'}</strong><p>${best ? `${best.remainingWidth.toFixed(0)} cm width left` : 'rearrange or add space'}</p></article><article><span>LOCAL SAVE</span><strong>On</strong><p>persists after refresh</p></article></section>
    </div>`;
  }

  function setupStudio() {
    const target = document.getElementById('studio-scene');
    if (!target || !window.SetRoomShelf3D?.ShelfStudio) return;
    const selectedSet = getSet(ui.studioSelectedSetId);
    const existing = placementForSet(selectedSet?.id);
    const best = bestStudioFit(selectedSet, existing?.placement.id || '');
    const ghost = best && !existing ? { shelfId:best.shelf.id, set:selectedSet, orientation:best.orientation, x:best.x, z:best.z, fits:true } : null;
    shelfStudio = new window.SetRoomShelf3D.ShelfStudio(target, {
      shelves:state.shelves,
      getSet,
      getPlacementDimensions:(placement,set) => set.dimensions,
      selectedPlacementId:ui.studioSelectedPlacementId,
      enteringPlacementId:ui.studioEnteringPlacementId,
      activeShelfId:ui.studioActiveShelfId,
      ghost,
      camera:ui.studioCamera,
      onSelect:key => { ui.studioSelectedPlacementId = key; ui.studioEnteringPlacementId = ''; const record=placementRecord(key); if(record) ui.studioActiveShelfId=record.shelf.id; renderApp(); },
      onShelfSelect:shelfId => { ui.studioActiveShelfId=shelfId; ui.studioSelectedPlacementId=''; renderApp(); },
      onMove:(key,position) => moveStudioPlacement(key,position),
      onCameraChange:camera => { ui.studioCamera=camera; }
    });
    window.setTimeout(() => { ui.studioEnteringPlacementId=''; },700);
  }

  function addStudioSet(setId) {
    const set = getSet(setId || ui.studioSelectedSetId);
    if (!set) return;
    const existing = placementForSet(set.id);
    const best = bestStudioFit(set, existing?.placement.id || '');
    if (!best) return toast('This box does not fit the measured shelves yet.', 'error');
    let item = getCollectionItem(set.id);
    if (!item) { item={ setId:set.id,status:'owned',paid:0,progress:0,condition:'',acquiredAt:'',notes:'',quantity:1 }; state.collection.push(item); }
    else item.status='owned';
    const placement = existing?.placement || { id:uid('place'), setId:set.id };
    if (existing) existing.shelf.placements = existing.shelf.placements.filter(candidate => candidate.id !== placement.id);
    Object.assign(placement, { setId:set.id, orientation:best.orientation, x:best.x, z:best.z });
    best.shelf.placements = Array.isArray(best.shelf.placements) ? best.shelf.placements : [];
    best.shelf.placements.push(placement);
    ui.studioSelectedPlacementId=placement.id;
    ui.studioEnteringPlacementId=placement.id;
    ui.studioActiveShelfId=best.shelf.id;
    saveState();
    toast(`${set.name} added to ${best.shelf.name}.`, 'success');
    renderApp();
  }

  function moveStudioPlacement(key, position) {
    const record=placementRecord(key);
    if(!record) return;
    ui.studioSelectedPlacementId=key;
    ui.studioActiveShelfId=record.shelf.id;
    const original={x:record.placement.x,z:record.placement.z};
    record.placement.x=Number(position.x)||0;
    record.placement.z=Number(position.z)||0;
    const candidate={set:record.set,orientation:record.placement.orientation,x:record.placement.x,z:record.placement.z};
    if(placementCollision(record.shelf,candidate,record.placement.id)) {
      Object.assign(record.placement,original);
      toast('That spot overlaps another box. Try the open space beside or behind it.','error');
    } else {
      saveState();
      toast('Box position saved.','success');
    }
    renderApp();
  }

  function applyStudioPlacement(key) {
    const record=placementRecord(key);
    if(!record) return;
    const shelf=state.shelves.find(item=>item.id===document.getElementById('studio-placement-shelf')?.value);
    const orientation=document.getElementById('studio-placement-orientation')?.value || 'normal';
    if(!shelf) return;
    const fit=firstOpenPosition(record.set,shelf,orientation,record.placement.id);
    if(!fit.fits) return toast('That shelf has no open space for this box in that direction.','error');
    record.shelf.placements=record.shelf.placements.filter(item=>item.id!==record.placement.id);
    Object.assign(record.placement,{orientation,x:fit.x,z:fit.z});
    shelf.placements.push(record.placement);
    ui.studioActiveShelfId=shelf.id;
    saveState();
    toast(`${record.set.name} moved to ${shelf.name}.`,'success');
    renderApp();
  }

  function removeStudioPlacement(key) {
    const record=placementRecord(key);
    if(!record) return;
    record.shelf.placements=record.shelf.placements.filter(item=>item.id!==record.placement.id);
    ui.studioSelectedPlacementId='';
    saveState();
    toast(`${record.set.name} removed from the shelf. It remains in your collection.`,'info');
    renderApp();
  }

  function autoArrangeStudio() {
    if(!hasPro()) return openPaywall();
    autoArrange();
  }

  function refreshStudioSearch() {
    const results=document.getElementById('studio-search-results');
    if(results) results.innerHTML=studioResultsMarkup();
  }

  function greetingLine() {
    const hour = new Date().getHours();
    const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
    const firstName = String(state.preferences?.displayName || '').trim().split(/\s+/)[0];
    return `${greeting}${firstName ? `, ${firstName}` : ''}.`;
  }

  function renderDashboard() {
    const owned = ownedItems();
    const wanted = wishlistItems();
    const pieces = owned.reduce((sum, item) => sum + ((getSet(item.setId)?.pieces || 0) * (Number(item.quantity) || 1)), 0);
    const spend = owned.reduce((sum, item) => sum + ((Number(item.paid) || 0) * (Number(item.quantity) || 1)), 0);
    const goal = goalProgress();
    const next = nextBuild();
    const activities = recentActivities();
    const rec = recommendations(Number(state.preferences?.monthlyBudget || 220))[0];
    const fitCopy = wanted.length ? fitSummaryForSet(getSet(wanted[0].setId)) : 'Add a wishlist set to check the room.';
    const goalActions = '<button class="button button-acid" type="button" data-route="sell">Open sell mode</button>';
    return `${pageHead('YOUR DISPLAY HQ', greetingLine(), 'A useful collection is more than a list. This dashboard connects every box to space, time and money.', '<button class="button" type="button" data-action="add-set">+ Log a set</button>')}
      <div class="stat-grid">
        <article class="stat-card"><span>OWNED SETS</span><strong>${number(owned.length)}</strong><small>${number(pieces)} pieces logged</small></article>
        <article class="stat-card stat-card-blue"><span>COLLECTION SPEND</span><strong>${money(spend)}</strong><small>based on prices you entered</small></article>
        <article class="stat-card stat-card-acid"><span>WISHLIST</span><strong>${number(wanted.length)}</strong><small>${wanted.filter(item => bestFitForSet(getSet(item.setId))).length} fit somewhere now</small></article>
        <article class="stat-card"><span>BUILD TIME</span><strong>${formatMinutes((state.sessions || []).reduce((sum, session) => sum + (Number(session.minutes) || 0), 0), true)}</strong><small>${state.sessions.length} sessions saved</small></article>
      </div>
      <div class="dashboard-grid">
        <div class="dashboard-stack">
          <section class="panel panel-dark"><header class="panel-head"><span>${escapeHTML(state.goal?.name || 'PROFIT GOAL')}</span><b>SALE PROFIT ONLY</b></header><div class="goal-hero"><div><span class="page-kicker">OPERATION AVENGERS TOWER</span><h2>${Math.round(goal.percent)}% funded.</h2><p>Logged profit—not revenue—moves this target.</p></div><div class="goal-number"><strong>${money(goal.current)}</strong><span>OF ${money(goal.target)}</span></div><div class="goal-large-track"><i style="width:${goal.percent}%"></i></div>${goalActions}</div></section>
          <section><header class="panel-head"><span>THE FOUR DECISIONS</span><b>PRO WORKFLOW</b></header><div class="decision-grid">
            <article class="decision-card"><span>SPACE</span><h3>${escapeHTML(fitCopy)}</h3><p>Use real shelf dimensions before the next box lands.</p><button class="text-button" type="button" data-route="space">Plan the room <span>↘</span></button></article>
            <article class="decision-card"><span>SELL</span><h3>${state.sales.length ? `${money(goal.current)} real profit logged` : 'No sale profit logged yet'}</h3><p>Fees and fulfilment are counted before the result.</p><button class="text-button" type="button" data-route="sell">Price a sale <span>↘</span></button></article>
            <article class="decision-card"><span>BUY</span><h3>${escapeHTML(rec ? rec.set.name : 'Add preferences')}</h3><p>${escapeHTML(rec ? recommendationSentence(rec) : 'Save a budget and favourite themes to rank the catalogue.')}</p><button class="text-button" type="button" data-route="buy">See the ranking <span>↘</span></button></article>
          </div></section>
        </div>
        <div class="dashboard-stack">
          <section class="panel"><header class="panel-head"><span>NEXT BUILD</span><b>${next ? `${next.progress}%` : 'EMPTY'}</b></header>${next ? `<div class="next-build"><div class="next-build-art">${bareImage(next.set)}</div><div class="next-build-copy"><span>SET ${escapeHTML(next.set.number)}</span><h3>${escapeHTML(next.set.name)}</h3><p>${next.progress}% complete · approx. ${next.set.hours} hours total</p><button class="button button-small" type="button" data-action="build-set" data-set-id="${escapeHTML(next.set.id)}">Continue build</button></div></div>` : '<div class="panel-body"><p>No owned set is waiting to be built.</p></div>'}</section>
          <section class="panel"><header class="panel-head"><span>RECENT ACTIVITY</span><b>${activities.length} ITEMS</b></header><div class="panel-body activity-list">${activities.length ? activities.map(activityRow).join('') : '<p>No activity yet.</p>'}</div></section>
        </div>
      </div>`;
  }

  function nextBuild() {
    const candidates = ownedItems().filter(item => clamp(item.progress, 0, 100) < 100).sort((a, b) => Number(b.progress) - Number(a.progress));
    const item = candidates[0];
    return item ? { item, set: getSet(item.setId), progress: clamp(item.progress, 0, 100) } : null;
  }

  function recentActivities() {
    const entries = [];
    (state.sessions || []).forEach(session => {
      const set = getSet(session.setId);
      entries.push({ type: 'B', title: set?.name || 'Build session', detail: `${formatMinutes(session.minutes)} · ${session.progressAfter || 0}% complete`, date: session.startedAt });
    });
    (state.sales || []).forEach(sale => entries.push({ type: '£', title: sale.name || getSet(sale.setId)?.name || 'Set sold', detail: `${money(sale.profit)} profit via ${sale.channel || 'sale'}`, date: sale.soldAt }));
    state.collection.forEach(item => {
      if (item.acquiredAt) entries.push({ type: item.status === 'wishlist' ? 'W' : 'C', title: getSet(item.setId)?.name || 'Collection item', detail: item.status === 'wishlist' ? 'Added to wishlist' : 'Added to collection', date: item.acquiredAt });
    });
    return entries.sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 6);
  }

  function activityRow(item) {
    return `<div class="activity-row"><span class="activity-icon">${item.type}</span><div><strong>${escapeHTML(item.title)}</strong><p>${escapeHTML(item.detail)}</p></div><time>${escapeHTML(dateLabel(item.date))}</time></div>`;
  }

  function renderCollection() {
    const statuses = { all: state.collection.length, owned: ownedItems().length, wishlist: wishlistItems().length, sold: soldItems().length };
    const cards = state.collection.map(renderSetCard).join('');
    return `${pageHead('FREE · COLLECTION', 'Every set. Properly remembered.', 'Log ownership, price paid, condition, progress and the box image. This part stays free.', '<button class="button button-acid" type="button" data-action="add-set">+ Add a set</button>')}
      <div class="toolbar"><label class="search-box"><input id="collection-search" type="search" value="${escapeHTML(ui.collectionSearch)}" placeholder="Search number, set or theme" autocomplete="off"></label><div class="segmented">${['all','owned','wishlist','sold'].map(status => `<button class="${ui.collectionFilter === status ? 'is-active' : ''}" type="button" data-action="collection-filter" data-status="${status}">${status} · ${statuses[status]}</button>`).join('')}</div><button class="button button-quiet" type="button" data-action="export-backup">Export</button></div>
      <div class="summary-strip"><span class="summary-chip">${number(ownedItems().reduce((sum,item)=>sum+(getSet(item.setId)?.pieces||0),0))} pieces owned</span><span class="summary-chip">${placedSetIds().size} placed on shelves</span><span class="summary-chip">${wishlistItems().filter(item => bestFitForSet(getSet(item.setId))).length} wishlist sets fit now</span></div>
      ${cards ? `<div class="collection-grid" id="collection-grid">${cards}</div>` : `<div class="empty-state"><div><span class="empty-state-mark">C</span><h3>Your room starts with one box.</h3><p>Add the first set to begin the free catalogue.</p><button class="button button-acid" type="button" data-action="add-set">Add a set</button></div></div>`}`;
  }

  function renderSetCard(item) {
    const set = getSet(item.setId);
    if (!set) return '';
    const status = item.status || 'owned';
    const progress = clamp(item.progress, 0, 100);
    const search = `${set.number} ${set.name} ${set.theme} ${status}`.toLowerCase();
    return `<article class="set-card" data-collection-card data-status="${escapeHTML(status)}" data-search="${escapeHTML(search)}">
      <div class="set-card-art">${bareImage(set)}<span class="set-status ${status}">${escapeHTML(status)}</span></div>
      <div class="set-card-body"><span class="set-theme">${escapeHTML(set.theme)} · SET ${escapeHTML(set.number)}</span><h3>${escapeHTML(set.name)}</h3><div class="set-card-meta"><span>${number(set.pieces)} PCS</span><span>${set.dimensions.w} × ${set.dimensions.d} × ${set.dimensions.h} CM</span></div>
      ${status === 'owned' ? `<div class="progress-row"><div class="progress-label"><span>BUILD</span><b>${progress}%</b></div><div class="progress-track"><i style="width:${progress}%"></i></div></div>` : status === 'wishlist' ? `<div class="progress-row"><div class="progress-label"><span>PLANNING PRICE</span><b>${money(set.price)}</b></div><div class="progress-track"><i style="width:${bestFitForSet(set) ? '100' : '18'}%"></i></div></div>` : `<div class="progress-row"><div class="progress-label"><span>SOLD</span><b>${item.soldAt ? dateLabel(item.soldAt) : 'LOGGED'}</b></div><div class="progress-track"><i style="width:100%"></i></div></div>`}
      <div class="set-card-actions"><button class="button button-small" type="button" data-action="edit-set" data-set-id="${escapeHTML(set.id)}">Details</button>${status === 'wishlist' ? `<button class="button button-quiet button-small" type="button" data-action="quick-fit" data-set-id="${escapeHTML(set.id)}">Fit check</button>` : status === 'owned' ? `<button class="button button-quiet button-small" type="button" data-action="build-set" data-set-id="${escapeHTML(set.id)}">Build</button>` : ''}</div></div>
    </article>`;
  }

  function setupCollection() {
    applyCollectionFilter();
  }

  function applyCollectionFilter() {
    const query = ui.collectionSearch.trim().toLowerCase();
    let visible = 0;
    document.querySelectorAll('[data-collection-card]').forEach(card => {
      const statusMatch = ui.collectionFilter === 'all' || card.dataset.status === ui.collectionFilter;
      const searchMatch = !query || (card.dataset.search || '').includes(query);
      card.hidden = !(statusMatch && searchMatch);
      if (!card.hidden) visible += 1;
    });
    let empty = document.getElementById('collection-filter-empty');
    if (!visible && document.getElementById('collection-grid')) {
      if (!empty) {
        empty = document.createElement('div');
        empty.id = 'collection-filter-empty';
        empty.className = 'data-warning';
        empty.textContent = 'No collection item matches this search and status filter.';
        document.getElementById('collection-grid').before(empty);
      }
    } else empty?.remove();
  }

  function collectionFields(item = {}) {
    const status = item.status || 'owned';
    return `<div class="form-grid" id="collection-fields">
      <label class="form-field"><span>Status</span><select id="set-status"><option value="owned" ${status === 'owned' ? 'selected' : ''}>Owned</option><option value="wishlist" ${status === 'wishlist' ? 'selected' : ''}>Wishlist</option><option value="sold" ${status === 'sold' ? 'selected' : ''}>Sold</option></select></label>
      <label class="form-field"><span>Quantity</span><input id="set-quantity" type="number" min="1" step="1" value="${Math.max(1, Number(item.quantity) || 1)}"></label>
      <label class="form-field"><span>Price paid</span><span class="money-input"><span>£</span><input id="set-paid" type="number" min="0" step="0.01" value="${Number(item.paid || 0)}"></span></label>
      <label class="form-field"><span>Acquired</span><input id="set-acquired" type="date" value="${escapeHTML(item.acquiredAt || '')}"></label>
      <label class="form-field full"><span>Build progress · <b id="set-progress-copy">${clamp(item.progress,0,100)}%</b></span><input id="set-progress" type="range" min="0" max="100" value="${clamp(item.progress,0,100)}"></label>
      <label class="form-field full"><span>Condition</span><input id="set-condition" type="text" value="${escapeHTML(item.condition || '')}" placeholder="Complete with box, sealed, missing instructions…"></label>
      <label class="form-field full"><span>Notes</span><textarea id="set-notes" placeholder="Storage, missing parts, purchase story…">${escapeHTML(item.notes || '')}</textarea></label>
    </div>`;
  }

  function openAddSetModal(prefill = '') {
    const chosen = getSet(prefill) || CATALOG[0];
    const options = CATALOG.map(set => `<button class="catalog-option ${set.id === chosen?.id ? 'is-selected' : ''}" type="button" data-action="choose-catalog-set" data-set-id="${escapeHTML(set.id)}"><img src="${escapeHTML(set.image)}" alt="" loading="lazy"><div><strong>${escapeHTML(set.name)}</strong><span>${escapeHTML(set.number)} · ${escapeHTML(set.theme)} · ${money(set.price)}</span></div></button>`).join('');
    const body = `<div class="segmented"><button class="is-active" type="button" data-action="set-mode" data-mode="catalog">Popular catalogue</button><button type="button" data-action="set-mode" data-mode="custom">Any other set</button></div>
      <div id="catalog-panel"><label class="search-box" style="display:block;margin-top:14px"><input id="catalog-search" type="search" placeholder="Search number, name or theme" autocomplete="off"></label><div class="catalog-picker" id="catalog-picker">${options}</div><div id="add-set-preview" style="margin-top:16px">${addSetPreview(chosen)}</div></div>
      <div id="custom-panel" hidden><div class="form-grid" style="margin-top:16px"><label class="form-field"><span>Set number</span><input id="custom-number" type="text" placeholder="e.g. 10316"></label><label class="form-field"><span>Set name</span><input id="custom-name" type="text" placeholder="Rivendell"></label><label class="form-field"><span>Theme</span><input id="custom-theme" type="text" placeholder="Icons"></label><label class="form-field"><span>Year</span><input id="custom-year" type="number" min="1949" max="2100" value="${new Date().getFullYear()}"></label><label class="form-field"><span>Pieces</span><input id="custom-pieces" type="number" min="0"></label><label class="form-field"><span>Planning price</span><span class="money-input"><span>£</span><input id="custom-price" type="number" min="0" step="0.01"></span></label><label class="form-field"><span>Width cm</span><input id="custom-width" type="number" min="1" step="0.1"></label><label class="form-field"><span>Depth cm</span><input id="custom-depth" type="number" min="1" step="0.1"></label><label class="form-field"><span>Height cm</span><input id="custom-height" type="number" min="1" step="0.1"></label><label class="form-field full"><span>Box image URL</span><input id="custom-image" type="url" placeholder="Optional — leave blank to try Brickset by set number"></label></div><div class="data-warning" style="margin-top:14px">For sets outside the starter catalogue, dimensions and prices are entered by you. Check critical measurements against the box or manufacturer listing.</div></div>
      <hr style="border:0;border-top:1px solid var(--ink);margin:20px 0">${collectionFields({ status:'owned', quantity:1, paid:0, progress:0, acquiredAt:'', condition:'', notes:'' })}`;
    openModal('ADD TO SETROOM', 'Log a set.', body, '<button class="button button-quiet" type="button" data-action="close-modal">Cancel</button><button class="button button-acid" type="button" data-action="save-new-set">Add to collection</button>', 'large');
    const root = document.getElementById('modal-root');
    if (root) {
      root.dataset.setMode = 'catalog';
      root.dataset.selectedSetId = chosen?.id || '';
    }
  }

  function addSetPreview(set) {
    if (!set) return '';
    return `<div class="modal-product"><div class="modal-product-art">${bareImage(set)}</div><div><span class="set-theme">${escapeHTML(set.theme)}</span><h3>${escapeHTML(set.name)}</h3><p>SET ${escapeHTML(set.number)} · ${number(set.pieces)} PIECES · ${set.dimensions.w} × ${set.dimensions.d} × ${set.dimensions.h} CM · ${money(set.price)}</p></div></div>`;
  }

  function openEditSetModal(setId) {
    const set = getSet(setId);
    const item = getCollectionItem(setId);
    if (!set || !item) return;
    const body = `${addSetPreview(set)}${collectionFields(item)}<div class="data-warning" style="margin-top:15px">Planning prices and dimensions are not live valuations. Confirm critical facts before buying furniture or publishing a listing.</div>`;
    openModal('COLLECTION DETAILS', escapeHTML(set.name), body, `<button class="button button-danger" type="button" data-action="delete-set" data-set-id="${escapeHTML(setId)}">Remove</button><button class="button" type="button" data-action="save-edited-set" data-set-id="${escapeHTML(setId)}">Save changes</button>`);
  }

  function readCollectionFields() {
    const status = document.getElementById('set-status')?.value || 'owned';
    return {
      status,
      quantity: Math.max(1, Number(document.getElementById('set-quantity')?.value) || 1),
      paid: status === 'wishlist' ? 0 : Math.max(0, Number(document.getElementById('set-paid')?.value) || 0),
      progress: status === 'wishlist' ? 0 : clamp(document.getElementById('set-progress')?.value, 0, 100),
      condition: document.getElementById('set-condition')?.value.trim() || '',
      acquiredAt: status === 'wishlist' ? '' : document.getElementById('set-acquired')?.value || '',
      notes: document.getElementById('set-notes')?.value.trim() || ''
    };
  }

  function saveNewSet() {
    const root = document.getElementById('modal-root');
    const mode = root?.dataset.setMode || 'catalog';
    let setId = root?.dataset.selectedSetId || '';
    if (mode === 'custom') {
      const setNumber = document.getElementById('custom-number')?.value.trim().replace(/-1$/, '') || '';
      const name = document.getElementById('custom-name')?.value.trim() || '';
      if (!setNumber || !name) return toast('Enter the custom set number and name.', 'error');
      const duplicate = allSets().find(set => set.number === setNumber);
      if (duplicate) setId = duplicate.id;
      else {
        setId = `custom-${setNumber}-${Date.now().toString(36)}`;
        state.customSets = Array.isArray(state.customSets) ? state.customSets : [];
        state.customSets.push({
          id: setId,
          number: setNumber,
          name,
          theme: document.getElementById('custom-theme')?.value.trim() || 'Custom',
          year: Number(document.getElementById('custom-year')?.value) || new Date().getFullYear(),
          pieces: Math.max(0, Number(document.getElementById('custom-pieces')?.value) || 0),
          price: Math.max(0, Number(document.getElementById('custom-price')?.value) || 0),
          dimensions: {
            w: Math.max(1, Number(document.getElementById('custom-width')?.value) || 1),
            d: Math.max(1, Number(document.getElementById('custom-depth')?.value) || 1),
            h: Math.max(1, Number(document.getElementById('custom-height')?.value) || 1)
          },
          hours: 0,
          demand: 80,
          image: document.getElementById('custom-image')?.value.trim() || `https://images.brickset.com/sets/images/${encodeURIComponent(setNumber)}-1.jpg`
        });
      }
    }
    if (!getSet(setId)) return toast('Choose a set first.', 'error');
    const fields = readCollectionFields();
    const existing = getCollectionItem(setId);
    if (existing) Object.assign(existing, fields);
    else state.collection.push({ setId, ...fields });
    if (fields.status !== 'owned') removeSetFromShelves(setId);
    state.mode = 'live';
    saveState();
    closeModal();
    toast(existing ? 'Collection details updated.' : 'Set added to the collection.', 'success');
    renderApp();
  }

  function saveEditedSet(setId) {
    const item = getCollectionItem(setId);
    if (!item) return;
    Object.assign(item, readCollectionFields());
    if (item.status !== 'owned') removeSetFromShelves(setId);
    state.mode = 'live';
    saveState();
    closeModal();
    toast('Set details saved.', 'success');
    renderApp();
  }

  function deleteSet(setId) {
    const set = getSet(setId);
    state.collection = state.collection.filter(item => item.setId !== setId);
    state.sessions = (state.sessions || []).filter(session => session.setId !== setId);
    removeSetFromShelves(setId);
    saveState();
    closeModal();
    toast(`${set?.name || 'Set'} removed.`, 'info');
    renderApp();
  }

  function addWishlist(setId) {
    const set = getSet(setId);
    if (!set) return;
    const item = getCollectionItem(setId);
    if (item) item.status = 'wishlist';
    else state.collection.push({ setId, status:'wishlist', paid:0, progress:0, condition:'', acquiredAt:'', notes:'', quantity:1 });
    saveState();
    toast(`${set.name} added to the wishlist.`, 'success');
    renderApp();
  }

  function removeSetFromShelves(setId) {
    (state.shelves || []).forEach(shelf => {
      shelf.placements = (shelf.placements || []).filter(placement => placement.setId !== setId);
    });
  }

  function orientedDimensions(set, orientation = 'normal') {
    if (!set?.dimensions) return { w:0, d:0, h:0 };
    return orientation === 'rotated'
      ? { w:Number(set.dimensions.d)||0, d:Number(set.dimensions.w)||0, h:Number(set.dimensions.h)||0 }
      : { w:Number(set.dimensions.w)||0, d:Number(set.dimensions.d)||0, h:Number(set.dimensions.h)||0 };
  }

  function shelfUsage(shelf, excludingSetId = '') {
    return (shelf.placements || []).reduce((total, placement) => {
      if (placement.setId === excludingSetId) return total;
      const set = getSet(placement.setId);
      return total + orientedDimensions(set, placement.orientation).w;
    }, 0);
  }

  function fitOnShelf(set, shelf, orientation = 'normal', excludingSetId = '') {
    const dims = orientedDimensions(set, orientation);
    const freeWidth = Math.max(0, Number(shelf.width) - shelfUsage(shelf, excludingSetId));
    const widthOkay = dims.w <= freeWidth;
    const depthOkay = dims.d <= Number(shelf.depth);
    const heightOkay = dims.h <= Number(shelf.height);
    return { fits: widthOkay && depthOkay && heightOkay, dims, freeWidth, widthOkay, depthOkay, heightOkay };
  }

  function bestFitForSet(set, excludingSetId = '') {
    if (!set) return null;
    const candidates = [];
    (state.shelves || []).forEach(shelf => {
      ['normal','rotated'].forEach(orientation => {
        const fit = fitOnShelf(set, shelf, orientation, excludingSetId);
        if (fit.fits) candidates.push({ shelf, orientation, ...fit, leftover: fit.freeWidth - fit.dims.w });
      });
    });
    candidates.sort((a,b) => a.leftover - b.leftover || Number(a.shelf.width) - Number(b.shelf.width));
    return candidates[0] || null;
  }

  function fitSummaryForSet(set) {
    if (!set) return 'No set selected.';
    const best = bestFitForSet(set);
    return best ? `Fits ${best.shelf.name}${best.orientation === 'rotated' ? ' rotated' : ''}` : 'No shelf fits right now';
  }

  function renderSpace() {
    const placed = placedSetIds();
    const unplaced = ownedItems().filter(item => !placed.has(item.setId));
    const shelves = (state.shelves || []).map(renderShelfCard).join('');
    const unplacedRows = unplaced.map(item => {
      const set = getSet(item.setId);
      const best = bestFitForSet(set);
      return `<div class="unplaced-row">${bareImage(set)}<div><strong>${escapeHTML(set.name)}</strong><span>${set.dimensions.w} × ${set.dimensions.d} × ${set.dimensions.h} CM · ${best ? `FITS ${best.shelf.name.toUpperCase()}` : 'NO CURRENT FIT'}</span></div><button class="button button-small" type="button" data-action="place-set" data-set-id="${escapeHTML(set.id)}">Place</button></div>`;
    }).join('') || '<div class="space-note">Every owned set is placed. Add another set or create a new shelf.</div>';
    return `${pageHead('PRO · BRICKSPACE', 'Plan the room to scale.', 'Every fit check uses the remaining width plus the shelf depth and height. Rotate a set when the footprint makes more sense.', '<button class="button button-quiet" type="button" data-action="auto-arrange">Auto-arrange</button><button class="button button-acid" type="button" data-action="add-shelf">+ Add shelf</button>')}
      <div class="summary-strip"><span class="summary-chip">${state.shelves.length} shelves measured</span><span class="summary-chip">${placed.size} sets placed</span><span class="summary-chip">${unplaced.length} waiting for space</span></div>
      <div class="space-layout"><div class="shelf-grid">${shelves || '<div class="empty-state"><div><span class="empty-state-mark">S</span><h3>Measure the first shelf.</h3><p>Width, depth and height unlock every fit decision.</p><button class="button button-acid" type="button" data-action="add-shelf">Add shelf</button></div></div>'}</div><aside class="panel"><header class="panel-head"><span>UNPLACED OWNED SETS</span><b>${unplaced.length}</b></header><div class="panel-body"><div class="unplaced-list">${unplacedRows}</div><div class="space-note" style="margin-top:14px">SetRoom treats each shelf as one horizontal row. Leave real-world clearance for doors, lighting, cables and safe handling.</div></div></aside></div>`;
  }

  function renderShelfCard(shelf) {
    const usage = shelfUsage(shelf);
    const percent = clamp(usage / Math.max(1, Number(shelf.width)) * 100, 0, 100);
    const placements = (shelf.placements || []).map(placement => {
      const set = getSet(placement.setId);
      if (!set) return '';
      const dims = orientedDimensions(set, placement.orientation);
      const widthPct = clamp(dims.w / Math.max(1, Number(shelf.width)) * 100, 8, 100);
      const heightPct = clamp(dims.h / Math.max(1, Number(shelf.height)) * 100, 16, 100);
      return `<button class="shelf-placement" type="button" style="--display-w:${widthPct}%;--display-h:${heightPct}%" data-action="unplace-set" data-set-id="${escapeHTML(set.id)}" data-shelf-id="${escapeHTML(shelf.id)}" title="Remove ${escapeHTML(set.name)} from this shelf">${bareImage(set)}<span>${escapeHTML(set.name)}${placement.orientation === 'rotated' ? ' ↻' : ''}</span></button>`;
    }).join('');
    return `<article class="shelf-card"><header class="shelf-card-head"><div><h3>${escapeHTML(shelf.name)}</h3><p>${escapeHTML(shelf.room || 'Unassigned room')} · ${shelf.width} W × ${shelf.depth} D × ${shelf.height} H CM</p></div><div class="shelf-card-actions"><button class="button button-small" type="button" data-action="place-set" data-shelf-id="${escapeHTML(shelf.id)}">Place</button><button class="button button-quiet button-small" type="button" data-action="edit-shelf" data-shelf-id="${escapeHTML(shelf.id)}">Edit</button></div></header><div class="shelf-stage-wrap"><div class="shelf-stage">${placements || '<div class="shelf-empty">EMPTY SHELF · READY FOR A DISPLAY</div>'}</div></div><footer class="shelf-footer"><span>${usage.toFixed(1)} / ${Number(shelf.width).toFixed(1)} CM USED</span><div class="shelf-usage-track"><i style="width:${percent}%"></i></div><span>${Math.max(0, Number(shelf.width)-usage).toFixed(1)} CM FREE</span></footer></article>`;
  }

  function setupSpace() {}

  function openShelfModal(shelfId = '') {
    const shelf = (state.shelves || []).find(item => item.id === shelfId) || { name:'', room:'', width:80, depth:35, height:40 };
    const body = `<div class="form-grid"><label class="form-field full"><span>Shelf name</span><input id="shelf-name" type="text" value="${escapeHTML(shelf.name)}" placeholder="Billy bookcase · shelf 2"></label><label class="form-field full"><span>Room</span><input id="shelf-room" type="text" value="${escapeHTML(shelf.room || '')}" placeholder="Living room"></label><label class="form-field"><span>Usable width cm</span><input id="shelf-width" type="number" min="1" step="0.1" value="${Number(shelf.width)}"></label><label class="form-field"><span>Usable depth cm</span><input id="shelf-depth" type="number" min="1" step="0.1" value="${Number(shelf.depth)}"></label><label class="form-field"><span>Usable height cm</span><input id="shelf-height" type="number" min="1" step="0.1" value="${Number(shelf.height)}"></label></div><div class="data-warning" style="margin-top:15px">Measure the usable inside dimensions, not the outside of the furniture. Leave practical clearance for fingers, doors and lights.</div>`;
    openModal(shelfId ? 'EDIT DISPLAY SPACE' : 'NEW DISPLAY SPACE', shelfId ? 'Update the shelf.' : 'Measure once.', body, `${shelfId ? `<button class="button button-danger" type="button" data-action="delete-shelf" data-shelf-id="${escapeHTML(shelfId)}">Delete</button>` : ''}<button class="button" type="button" data-action="save-shelf" data-shelf-id="${escapeHTML(shelfId)}">Save shelf</button>`);
  }

  function saveShelf(shelfId = '') {
    const name = document.getElementById('shelf-name')?.value.trim() || '';
    const width = Number(document.getElementById('shelf-width')?.value) || 0;
    const depth = Number(document.getElementById('shelf-depth')?.value) || 0;
    const height = Number(document.getElementById('shelf-height')?.value) || 0;
    if (!name || width <= 0 || depth <= 0 || height <= 0) return toast('Enter a name and all three usable dimensions.', 'error');
    const payload = { name, room:document.getElementById('shelf-room')?.value.trim() || '', width, depth, height };
    const existing = state.shelves.find(shelf => shelf.id === shelfId);
    if (existing) Object.assign(existing, payload);
    else state.shelves.push({ id:uid('shelf'), ...payload, placements:[] });
    saveState();
    closeModal();
    toast(existing ? 'Shelf updated.' : 'Shelf added.', 'success');
    renderApp();
  }

  function deleteShelf(shelfId) {
    const shelf = state.shelves.find(item => item.id === shelfId);
    state.shelves = state.shelves.filter(item => item.id !== shelfId);
    saveState();
    closeModal();
    toast(`${shelf?.name || 'Shelf'} removed. Its sets are unplaced, not deleted.`, 'info');
    renderApp();
  }

  function openPlacementModal(setId = '', fixedShelfId = '') {
    const eligible = ownedItems().map(item => getSet(item.setId)).filter(Boolean);
    if (!eligible.length) return toast('Add an owned set before placing it.', 'error');
    const set = getSet(setId) || eligible[0];
    const shelves = fixedShelfId ? state.shelves.filter(shelf => shelf.id === fixedShelfId) : state.shelves;
    if (!shelves.length) return openShelfModal();
    const shelfOptions = shelves.map(shelf => `<option value="${escapeHTML(shelf.id)}">${escapeHTML(shelf.room ? `${shelf.room} · ` : '')}${escapeHTML(shelf.name)}</option>`).join('');
    const setOptions = eligible.map(candidate => `<option value="${escapeHTML(candidate.id)}" ${candidate.id === set.id ? 'selected' : ''}>${escapeHTML(candidate.number)} — ${escapeHTML(candidate.name)}</option>`).join('');
    const body = `<div class="form-grid"><label class="form-field full"><span>Owned set</span><select id="placement-set">${setOptions}</select></label><label class="form-field full"><span>Shelf</span><select id="placement-shelf">${shelfOptions}</select></label><label class="form-field full"><span>Orientation</span><select id="placement-orientation"><option value="normal">Normal footprint</option><option value="rotated">Rotated 90°</option></select></label></div><div id="placement-preview" style="margin-top:15px"></div>`;
    openModal('PLACE TO SCALE', 'Does it fit?', body, '<button class="button button-quiet" type="button" data-action="close-modal">Cancel</button><button class="button button-acid" type="button" data-action="save-placement">Place set</button>');
    updatePlacementPreview();
  }

  function updatePlacementPreview() {
    const set = getSet(document.getElementById('placement-set')?.value);
    const shelf = state.shelves.find(item => item.id === document.getElementById('placement-shelf')?.value);
    const orientation = document.getElementById('placement-orientation')?.value || 'normal';
    const target = document.getElementById('placement-preview');
    if (!set || !shelf || !target) return;
    const fit = fitOnShelf(set, shelf, orientation, set.id);
    target.innerHTML = `${addSetPreview(set)}<div class="fit-result-list"><div class="fit-row ${fit.widthOkay ? 'good' : ''}"><i></i><div><strong>Width</strong><span>${fit.dims.w} cm set footprint · ${fit.freeWidth.toFixed(1)} cm free</span></div><b>${fit.widthOkay ? 'PASS' : 'FAIL'}</b></div><div class="fit-row ${fit.depthOkay ? 'good' : ''}"><i></i><div><strong>Depth</strong><span>${fit.dims.d} cm set · ${shelf.depth} cm shelf</span></div><b>${fit.depthOkay ? 'PASS' : 'FAIL'}</b></div><div class="fit-row ${fit.heightOkay ? 'good' : ''}"><i></i><div><strong>Height</strong><span>${fit.dims.h} cm set · ${shelf.height} cm shelf</span></div><b>${fit.heightOkay ? 'PASS' : 'FAIL'}</b></div></div>`;
  }

  function savePlacement() {
    const setId = document.getElementById('placement-set')?.value || '';
    const shelfId = document.getElementById('placement-shelf')?.value || '';
    const orientation = document.getElementById('placement-orientation')?.value || 'normal';
    const set = getSet(setId);
    const shelf = state.shelves.find(item => item.id === shelfId);
    if (!set || !shelf) return;
    const fit = fitOnShelf(set, shelf, orientation, setId);
    if (!fit.fits) return toast('That orientation does not fit the remaining shelf space.', 'error');
    removeSetFromShelves(setId);
    shelf.placements = Array.isArray(shelf.placements) ? shelf.placements : [];
    const position = firstOpenPosition(set, shelf, orientation, setId);
    shelf.placements.push({ id:uid('place'), setId, orientation, x:position.x || 0, z:position.z || 0 });
    saveState();
    closeModal();
    toast(`${set.name} placed on ${shelf.name}.`, 'success');
    renderApp();
  }

  function unplaceSet(setId, shelfId) {
    const shelf = state.shelves.find(item => item.id === shelfId);
    if (!shelf) return;
    shelf.placements = (shelf.placements || []).filter(placement => placement.setId !== setId);
    saveState();
    toast('Set moved back to the unplaced list.', 'info');
    renderApp();
  }

  function openFitModal(setId) {
    const set = getSet(setId);
    if (!set) return;
    const rows = (state.shelves || []).flatMap(shelf => ['normal','rotated'].map(orientation => {
      const fit = fitOnShelf(set, shelf, orientation, set.id);
      return { shelf, orientation, ...fit };
    })).sort((a,b) => Number(b.fits)-Number(a.fits) || (a.freeWidth-a.dims.w)-(b.freeWidth-b.dims.w));
    const body = `${addSetPreview(set)}<div class="fit-result-list">${rows.length ? rows.map(row => `<div class="fit-row ${row.fits ? 'good' : ''}"><i></i><div><strong>${escapeHTML(row.shelf.name)} · ${row.orientation === 'rotated' ? 'rotated' : 'normal'}</strong><span>${row.dims.w} W × ${row.dims.d} D × ${row.dims.h} H CM · ${row.freeWidth.toFixed(1)} CM width free</span></div><b>${row.fits ? 'FITS' : !row.widthOkay ? 'WIDTH' : !row.depthOkay ? 'DEPTH' : 'HEIGHT'}</b></div>`).join('') : '<div class="data-warning">No shelves have been measured yet.</div>'}</div>`;
    openModal('BRICKSPACE FIT CHECK', escapeHTML(fitSummaryForSet(set)), body, '<button class="button" type="button" data-action="close-modal">Done</button>', 'large');
  }

  function autoArrange() {
    const sets = ownedItems().map(item => getSet(item.setId)).filter(Boolean).sort((a,b) => (b.dimensions.w*b.dimensions.d)-(a.dimensions.w*a.dimensions.d));
    state.shelves.forEach(shelf => { shelf.placements = []; });
    let placed = 0;
    sets.forEach(set => {
      const best = bestStudioFit(set);
      if (best) {
        best.shelf.placements.push({ id:uid('place'), setId:set.id, orientation:best.orientation, x:best.x, z:best.z });
        placed += 1;
      }
    });
    saveState();
    toast(`Auto-arranged ${placed} of ${sets.length} owned sets.`, placed === sets.length ? 'success' : 'info');
    renderApp();
  }

  function formatMinutes(minutes, compact = false) {
    const total = Math.max(0, Math.round(Number(minutes) || 0));
    const hours = Math.floor(total / 60);
    const mins = total % 60;
    if (compact) return hours ? `${hours}h ${mins}m` : `${mins}m`;
    return hours ? `${hours} hr ${mins} min` : `${mins} min`;
  }

  function formatDuration(milliseconds) {
    const seconds = Math.max(0, Math.floor(milliseconds / 1000));
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return [hours, minutes, secs].map(value => String(value).padStart(2, '0')).join(':');
  }

  function currentTimerElapsed() {
    return timer.elapsedMs + (timer.running ? Date.now() - timer.startedAt : 0);
  }

  function renderBuild() {
    const owned = ownedItems();
    if (!owned.length) {
      return `${pageHead('PRO · BUILDREPLAY', 'Build time deserves a history.', 'Choose an owned set, time the session and keep an optional private camera replay.')}<div class="empty-state"><div><span class="empty-state-mark">B</span><h3>No owned set to build.</h3><p>Add a set with Owned status first.</p><button class="button button-acid" type="button" data-action="add-set">Add a set</button></div></div>`;
    }
    if (!ui.selectedBuildSetId || !owned.some(item => item.setId === ui.selectedBuildSetId)) {
      ui.selectedBuildSetId = nextBuild()?.set.id || owned[0].setId;
    }
    const set = getSet(ui.selectedBuildSetId);
    const item = getCollectionItem(ui.selectedBuildSetId);
    const options = owned.map(entry => {
      const candidate = getSet(entry.setId);
      return `<option value="${escapeHTML(candidate.id)}" ${candidate.id === set.id ? 'selected' : ''}>${escapeHTML(candidate.number)} — ${escapeHTML(candidate.name)}</option>`;
    }).join('');
    const sessions = (state.sessions || []).filter(session => session.setId === set.id).sort((a,b) => new Date(b.startedAt)-new Date(a.startedAt));
    const totalMinutes = sessions.reduce((sum, session) => sum + (Number(session.minutes) || 0), 0);
    return `${pageHead('PRO · BUILDREPLAY', 'Keep the hours, not just the finished model.', 'Time focused sessions, update the build percentage and record a local camera replay when the browser allows it.')}
      <div class="build-layout">
        <section class="camera-panel"><header class="panel-head"><span>PRIVATE CAMERA REPLAY</span><b>LOCAL TO THIS TAB</b></header><div class="camera-stage" id="camera-stage"><video id="build-video" playsinline muted hidden></video><div class="camera-placeholder" id="camera-placeholder"><span class="camera-placeholder-mark">REC</span><strong>Camera is off.</strong><p>SetRoom requests camera access only when you press Start camera. Nothing is uploaded by this static release.</p></div><div class="record-badge" id="record-badge" hidden><i></i><span id="record-time">00:00</span></div></div><div class="camera-controls"><button class="button button-acid button-small" type="button" data-action="camera-start">Start camera</button><button class="button button-small" type="button" data-action="record-start">Record replay</button><button class="button button-red button-small" type="button" data-action="record-stop">Stop recording</button><button class="button button-quiet button-small" type="button" data-action="camera-stop">Turn camera off</button></div>${recordingUrl ? `<div class="recording-ready"><strong>Replay ready in this tab.</strong><p>Download it before refreshing or leaving the page. Large recordings may use significant memory.</p><a class="button button-acid button-small" href="${recordingUrl}" download="setroom-${escapeHTML(set.number)}-build.webm">Download replay</a></div>` : ''}</section>
        <div class="build-controls">
          <section class="session-card"><div class="session-clock" id="session-clock">${formatDuration(currentTimerElapsed())}</div><div class="session-body"><label class="form-field"><span>SET BEING BUILT</span><select id="build-set-select">${options}</select></label><div class="build-product">${bareImage(set)}<div><span class="set-theme">${escapeHTML(set.theme)}</span><h3>${escapeHTML(set.name)}</h3><p>${number(set.pieces)} PIECES · APPROX. ${set.hours || '?'} HOURS · ${formatMinutes(totalMinutes)} LOGGED</p></div></div><div class="range-row"><label><span>BUILD PROGRESS</span><b id="build-progress-copy">${clamp(item.progress,0,100)}%</b></label><input id="build-progress" type="range" min="0" max="100" value="${clamp(item.progress,0,100)}"></div><label class="form-field"><span>SESSION NOTE</span><textarea id="build-note" placeholder="Bags completed, difficult section, next step…"></textarea></label><div class="session-actions"><button class="button button-acid" type="button" data-action="timer-toggle">${timer.running ? 'Pause timer' : currentTimerElapsed() ? 'Resume timer' : 'Start timer'}</button><button class="button" type="button" data-action="save-session">Save session</button><button class="button button-quiet" type="button" data-action="timer-reset">Reset</button></div></div></section>
          <section class="panel"><header class="panel-head"><span>BUILD HISTORY</span><b>${formatMinutes(totalMinutes)}</b></header><div class="panel-body sessions-list">${sessions.length ? sessions.map(session => `<div class="session-row"><div><strong>${dateLabel(session.startedAt)} · ${session.progressAfter || 0}% complete</strong><p>${escapeHTML(session.note || 'No note')}</p></div><b>${formatMinutes(session.minutes)}</b></div>`).join('') : '<div class="space-note">No saved sessions for this set yet.</div>'}</div></section>
        </div>
      </div>`;
  }

  function setupBuild() {
    document.getElementById('build-set-select')?.addEventListener('change', event => {
      ui.selectedBuildSetId = event.target.value;
      resetTimer(false);
      renderApp();
    });
    if (timer.running) startTimerInterval();
  }

  function startTimerInterval() {
    stopTimerIntervalOnly();
    refreshTimerClock();
    timer.intervalId = window.setInterval(refreshTimerClock, 250);
  }

  function stopTimerIntervalOnly() {
    if (timer.intervalId) window.clearInterval(timer.intervalId);
    timer.intervalId = null;
  }

  function refreshTimerClock() {
    const clock = document.getElementById('session-clock');
    if (clock) clock.textContent = formatDuration(currentTimerElapsed());
    if (recordingStartedAt && mediaRecorder?.state === 'recording') {
      const node = document.getElementById('record-time');
      if (node) node.textContent = formatDuration(Date.now() - recordingStartedAt).slice(3);
    }
  }

  function toggleTimer() {
    if (timer.running) {
      timer.elapsedMs += Date.now() - timer.startedAt;
      timer.running = false;
      timer.startedAt = 0;
      stopTimerIntervalOnly();
    } else {
      timer.running = true;
      timer.startedAt = Date.now();
      startTimerInterval();
    }
    renderApp();
  }

  function resetTimer(announce = true) {
    timer.running = false;
    timer.startedAt = 0;
    timer.elapsedMs = 0;
    stopTimerIntervalOnly();
    if (announce) toast('Session timer reset.', 'info');
    if (currentRoute === 'build') renderApp();
  }

  function saveBuildSession() {
    const set = getSet(ui.selectedBuildSetId);
    const item = getCollectionItem(ui.selectedBuildSetId);
    if (!set || !item) return;
    if (timer.running) {
      timer.elapsedMs += Date.now() - timer.startedAt;
      timer.running = false;
      timer.startedAt = 0;
    }
    const minutes = Math.max(1, Math.round(timer.elapsedMs / 60000));
    if (!timer.elapsedMs) return toast('Start the timer before saving a session.', 'error');
    const progress = clamp(document.getElementById('build-progress')?.value, 0, 100);
    item.progress = progress;
    state.sessions.push({ id:uid('session'), setId:set.id, startedAt:new Date().toISOString(), minutes, progressAfter:progress, note:document.getElementById('build-note')?.value.trim() || '' });
    saveState();
    timer.elapsedMs = 0;
    stopTimerIntervalOnly();
    toast(`${formatMinutes(minutes)} saved for ${set.name}.`, 'success');
    renderApp();
  }

  async function startCamera() {
    if (!navigator.mediaDevices?.getUserMedia) return toast('This browser does not expose camera recording here.', 'error');
    try {
      stopCamera();
      cameraStream = await navigator.mediaDevices.getUserMedia({ video:{ facingMode:'environment' }, audio:false });
      const video = document.getElementById('build-video');
      if (video) {
        video.srcObject = cameraStream;
        video.hidden = false;
        await video.play();
      }
      document.getElementById('camera-placeholder')?.setAttribute('hidden','');
      toast('Camera is ready. Recording has not started.', 'success');
    } catch (error) {
      toast('Camera permission was unavailable or declined.', 'error');
    }
  }

  function stopCamera() {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      try { mediaRecorder.stop(); } catch (error) {}
    }
    mediaRecorder = null;
    cameraStream?.getTracks().forEach(track => track.stop());
    cameraStream = null;
    const video = document.getElementById('build-video');
    if (video) {
      video.srcObject = null;
      video.hidden = true;
    }
    document.getElementById('camera-placeholder')?.removeAttribute('hidden');
    document.getElementById('record-badge')?.setAttribute('hidden','');
  }

  async function startRecording() {
    if (!cameraStream) await startCamera();
    if (!cameraStream) return;
    if (!window.MediaRecorder) return toast('MediaRecorder is not supported in this browser.', 'error');
    if (mediaRecorder?.state === 'recording') return toast('A replay is already recording.', 'info');
    if (recordingUrl) {
      URL.revokeObjectURL(recordingUrl);
      recordingUrl = '';
    }
    mediaChunks = [];
    const types = ['video/webm;codecs=vp9','video/webm;codecs=vp8','video/webm'];
    const mimeType = types.find(type => MediaRecorder.isTypeSupported?.(type)) || '';
    try {
      mediaRecorder = new MediaRecorder(cameraStream, mimeType ? { mimeType } : undefined);
      mediaRecorder.addEventListener('dataavailable', event => { if (event.data?.size) mediaChunks.push(event.data); });
      mediaRecorder.addEventListener('stop', () => {
        if (!mediaChunks.length) return;
        const blob = new Blob(mediaChunks, { type:mediaRecorder?.mimeType || 'video/webm' });
        recordingUrl = URL.createObjectURL(blob);
        recordingStartedAt = 0;
        if (currentRoute === 'build') renderApp();
        toast('Replay captured. Download it before leaving this tab.', 'success');
      }, { once:true });
      mediaRecorder.start(1000);
      recordingStartedAt = Date.now();
      document.getElementById('record-badge')?.removeAttribute('hidden');
      startTimerInterval();
      toast('Replay recording started.', 'success');
    } catch (error) {
      toast('This browser could not start a camera recording.', 'error');
    }
  }

  function stopRecording() {
    if (!mediaRecorder || mediaRecorder.state !== 'recording') return toast('No replay is recording.', 'info');
    mediaRecorder.stop();
    document.getElementById('record-badge')?.setAttribute('hidden','');
  }

  function saleFormDefaults(setId) {
    const item = getCollectionItem(setId);
    const set = getSet(setId);
    return {
      salePrice: Number(set?.price || 0),
      originalPaid: Number(item?.paid || 0),
      feePercent: Number(state.preferences?.defaultFeePercent ?? 12),
      shipping: 0,
      packaging: 2,
      channel: 'eBay',
      condition: item?.condition || 'Complete, used condition',
      notes: item?.notes || ''
    };
  }

  function calculateSale(values) {
    const salePrice = Math.max(0, Number(values.salePrice) || 0);
    const originalPaid = Math.max(0, Number(values.originalPaid) || 0);
    const feePercent = clamp(values.feePercent, 0, 100);
    const shipping = Math.max(0, Number(values.shipping) || 0);
    const packaging = Math.max(0, Number(values.packaging) || 0);
    const fees = salePrice * feePercent / 100;
    const net = salePrice - fees - shipping - packaging;
    return { salePrice, originalPaid, feePercent, shipping, packaging, fees, net, profit:net - originalPaid };
  }

  function listingText(set, item, values) {
    if (!set) return 'Choose an owned set to prepare a listing.';
    const condition = values.condition || item?.condition || 'Used condition';
    const notes = values.notes || item?.notes || '';
    return `${set.name} — LEGO set ${set.number}\n\n${number(set.pieces)}-piece ${set.theme} display set. Built size is approximately ${set.dimensions.w} cm wide × ${set.dimensions.d} cm deep × ${set.dimensions.h} cm high.\n\nCondition: ${condition}.${notes ? `\nNotes: ${notes}.` : ''}\n\nBefore publishing, confirm the exact contents, minifigures, instructions, box condition, spare parts and any missing or damaged pieces. The photos should show the exact set being sold.\n\nCollection is sensible for large sets; if posted, the model will be packed with care.`;
  }

  function renderSell() {
    const owned = ownedItems();
    if (!owned.length) {
      return `${pageHead('PRO · BRICKEXIT', 'Sell without lying to yourself.', 'Calculate the money that reaches the bank after every cost.')}<div class="empty-state"><div><span class="empty-state-mark">£</span><h3>No owned set is ready for Sell Mode.</h3><p>Add an owned set first, then calculate the real take-home number.</p><button class="button button-acid" type="button" data-action="add-set">Add a set</button></div></div>`;
    }
    if (!ui.selectedSellSetId || !owned.some(item => item.setId === ui.selectedSellSetId)) ui.selectedSellSetId = owned[0].setId;
    const set = getSet(ui.selectedSellSetId);
    const item = getCollectionItem(ui.selectedSellSetId);
    const values = saleFormDefaults(set.id);
    const result = calculateSale(values);
    const options = owned.map(entry => {
      const candidate = getSet(entry.setId);
      return `<option value="${escapeHTML(candidate.id)}" ${candidate.id === set.id ? 'selected' : ''}>${escapeHTML(candidate.number)} — ${escapeHTML(candidate.name)}</option>`;
    }).join('');
    const rows = state.sales.slice().sort((a,b) => new Date(b.soldAt)-new Date(a.soldAt)).map(sale => `<tr><td>${escapeHTML(sale.name || getSet(sale.setId)?.name || 'Sale')}</td><td>${dateLabel(sale.soldAt)}</td><td>${escapeHTML(sale.channel || 'Other')}</td><td>${money(sale.net)}</td><td class="${Number(sale.profit) >= 0 ? 'positive' : 'negative'}">${money(sale.profit)}</td></tr>`).join('') || '<tr><td colspan="5">No completed sales yet.</td></tr>';

    return `${pageHead('PRO · BRICKEXIT', 'Price the exit, not the advert.', 'Fees, postage, packaging and original spend are deducted before profit reaches your goal.')}
      <div class="sell-layout">
        <section class="sell-calculator">
          <div class="sell-product"><div>${bareImage(set)}</div><div><label class="form-field"><span>SET TO SELL</span><select id="sell-set-select">${options}</select></label><h2>${escapeHTML(set.name)}</h2><p>${number(set.pieces)} PIECES · ${set.dimensions.w} × ${set.dimensions.d} × ${set.dimensions.h} CM</p></div></div>
          <div class="form-grid" id="sell-form"><label class="form-field"><span>Sale price</span><span class="money-input"><span>£</span><input id="sale-price" type="number" min="0" step="0.01" value="${values.salePrice.toFixed(2)}"></span></label><label class="form-field"><span>Original price paid</span><span class="money-input"><span>£</span><input id="sale-paid" type="number" min="0" step="0.01" value="${values.originalPaid.toFixed(2)}"></span></label><label class="form-field"><span>Platform fee %</span><input id="sale-fee" type="number" min="0" max="100" step="0.1" value="${values.feePercent}"></label><label class="form-field"><span>Selling channel</span><select id="sale-channel"><option>eBay</option><option>BrickLink</option><option>Marketplace</option><option>Vinted</option><option>Local sale</option><option>Other</option></select></label><label class="form-field"><span>Postage you pay</span><span class="money-input"><span>£</span><input id="sale-shipping" type="number" min="0" step="0.01" value="${values.shipping.toFixed(2)}"></span></label><label class="form-field"><span>Packaging</span><span class="money-input"><span>£</span><input id="sale-packaging" type="number" min="0" step="0.01" value="${values.packaging.toFixed(2)}"></span></label><label class="form-field full"><span>Condition</span><input id="sale-condition" type="text" value="${escapeHTML(values.condition)}"></label><label class="form-field full"><span>Notes for buyer</span><textarea id="sale-notes" placeholder="Missing pieces, smoke-free home, collection only…">${escapeHTML(values.notes)}</textarea></label></div>
          <div class="profit-output"><div><span>PLATFORM FEE</span><strong id="sale-fees-output">${money(result.fees)}</strong></div><div><span>TAKE-HOME</span><strong id="sale-net-output">${money(result.net)}</strong></div><div class="profit-main ${result.profit < 0 ? 'is-negative' : ''}" id="sale-profit-card"><span>PROFIT / LOSS</span><strong id="sale-profit-output">${money(result.profit)}</strong></div></div>
          <div class="profit-breakdown"><div><span>Buyer pays</span><b id="sale-breakdown-price">${money(result.salePrice)}</b></div><div><span>Fees + fulfilment</span><b id="sale-breakdown-costs">−${money(result.fees+result.shipping+result.packaging)}</b></div><div><span>Original spend</span><b id="sale-breakdown-paid">−${money(result.originalPaid)}</b></div><div><span>Profit towards ${escapeHTML(state.goal.name)}</span><b id="sale-breakdown-profit">${money(result.profit)}</b></div></div>
          <div class="sell-actions"><button class="button button-acid" type="button" data-action="mark-sold">Mark sold + record profit</button><button class="button button-quiet" type="button" data-action="copy-listing">Copy listing</button></div>
        </section>
        <section class="listing-panel"><header class="panel-head"><span>READY-TO-EDIT LISTING</span><b>CHECK EVERY CLAIM</b></header><div class="panel-body"><div class="listing-copy" id="listing-copy">${escapeHTML(listingText(set,item,values))}</div><div class="photo-checklist"><label class="check-row"><input type="checkbox"> Front, back and side of the exact set</label><label class="check-row"><input type="checkbox"> Minifigures and valuable accessories</label><label class="check-row"><input type="checkbox"> Box corners and instruction condition</label><label class="check-row"><input type="checkbox"> Every defect or missing piece</label><label class="check-row"><input type="checkbox"> Set number visible in one photo</label></div></div></section>
        <section class="sales-panel"><header class="panel-head"><span>COMPLETED SALES</span><b>${state.sales.length} LOGGED</b></header><div style="overflow:auto"><table class="sales-table"><thead><tr><th>ITEM</th><th>DATE</th><th>CHANNEL</th><th>NET</th><th>PROFIT</th></tr></thead><tbody>${rows}</tbody></table></div></section>
      </div>`;
  }

  function readSaleForm() {
    return { salePrice:document.getElementById('sale-price')?.value, originalPaid:document.getElementById('sale-paid')?.value, feePercent:document.getElementById('sale-fee')?.value, shipping:document.getElementById('sale-shipping')?.value, packaging:document.getElementById('sale-packaging')?.value, channel:document.getElementById('sale-channel')?.value || 'Other', condition:document.getElementById('sale-condition')?.value.trim() || '', notes:document.getElementById('sale-notes')?.value.trim() || '' };
  }

  function setupSell() {
    document.getElementById('sell-set-select')?.addEventListener('change', event => { ui.selectedSellSetId = event.target.value; renderApp(); });
    document.querySelectorAll('#sell-form input,#sell-form select,#sell-form textarea').forEach(field => field.addEventListener('input', refreshSaleCalculator));
  }

  function refreshSaleCalculator() {
    const values = readSaleForm();
    const result = calculateSale(values);
    const set = getSet(ui.selectedSellSetId);
    const item = getCollectionItem(ui.selectedSellSetId);
    const valuesById = { 'sale-fees-output':money(result.fees), 'sale-net-output':money(result.net), 'sale-profit-output':money(result.profit), 'sale-breakdown-price':money(result.salePrice), 'sale-breakdown-costs':`−${money(result.fees+result.shipping+result.packaging)}`, 'sale-breakdown-paid':`−${money(result.originalPaid)}`, 'sale-breakdown-profit':money(result.profit) };
    Object.entries(valuesById).forEach(([id,value]) => { const node = document.getElementById(id); if (node) node.textContent = value; });
    document.getElementById('sale-profit-card')?.classList.toggle('is-negative', result.profit < 0);
    const listing = document.getElementById('listing-copy');
    if (listing) listing.textContent = listingText(set,item,values);
  }

  function copyListing() {
    const text = document.getElementById('listing-copy')?.textContent || '';
    if (!text) return;
    const fallback = () => {
      const area = document.createElement('textarea');
      area.value = text;
      document.body.append(area);
      area.select();
      document.execCommand('copy');
      area.remove();
      toast('Listing copied.', 'success');
    };
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text).then(() => toast('Listing copied.', 'success')).catch(fallback);
    else fallback();
  }

  function markSold() {
    const item = getCollectionItem(ui.selectedSellSetId);
    const set = getSet(ui.selectedSellSetId);
    if (!item || !set) return;
    const values = readSaleForm();
    const result = calculateSale(values);
    if (result.salePrice <= 0) return toast('Enter the actual sale price first.', 'error');
    state.sales.push({ id:uid('sale'), name:set.name, setId:set.id, soldAt:new Date().toISOString().slice(0,10), salePrice:result.salePrice, fees:result.fees, shipping:result.shipping, packaging:result.packaging, originalPaid:result.originalPaid, net:result.net, profit:result.profit, channel:values.channel });
    item.status = 'sold';
    item.soldAt = new Date().toISOString();
    removeSetFromShelves(set.id);
    saveState();
    ui.selectedSellSetId = '';
    toast(`${set.name} sold. ${money(result.profit)} recorded against the goal.`, result.profit >= 0 ? 'success' : 'info');
    renderApp();
  }

  function scoreRecommendation(set, budget = Number(state.preferences?.monthlyBudget || 220)) {
    const themes = state.preferences?.themes || [];
    const collectionItem = getCollectionItem(set.id);
    const fit = bestFitForSet(set);
    const themeMatch = themes.includes(set.theme);
    const underBudget = Number(set.price) <= budget;
    const wanted = collectionItem?.status === 'wishlist';
    const budgetRatio = budget > 0 ? Number(set.price) / budget : 10;
    let score = 30;
    score += themeMatch ? 22 : 2;
    score += fit ? 23 : -16;
    score += underBudget ? Math.max(4, 20 - Math.abs(1-budgetRatio)*9) : Math.max(-22, -((budgetRatio-1)*20));
    score += (Number(set.demand || 80)-75)*0.35;
    score += wanted ? 10 : 0;
    const ownedThemes = ownedItems().map(item => getSet(item.setId)?.theme).filter(Boolean);
    if (ownedThemes.includes(set.theme)) score += 4;
    const reasons = [
      { good:themeMatch, text:themeMatch ? `Matches saved ${set.theme} taste` : `${set.theme} is outside saved themes` },
      { good:Boolean(fit), text:fit ? `Fits ${fit.shelf.name}${fit.orientation === 'rotated' ? ' rotated' : ''}` : 'No current shelf position fits' },
      { good:underBudget, text:underBudget ? `${money(budget-set.price)} under this budget` : `${money(set.price-budget)} over this budget` }
    ];
    if (wanted) reasons.push({ good:true, text:'Already on your wishlist' });
    return { set, score:clamp(Math.round(score),1,99), fit, themeMatch, underBudget, wanted, reasons };
  }

  function recommendations(budget = Number(ui.buyBudget ?? state.preferences?.monthlyBudget ?? 220)) {
    return allSets().filter(set => {
      const status = getCollectionItem(set.id)?.status;
      return status !== 'owned' && status !== 'sold';
    }).map(set => scoreRecommendation(set,budget)).sort((a,b) => b.score-a.score || Number(a.set.price)-Number(b.set.price));
  }

  function recommendationSentence(entry) {
    if (!entry) return 'Add more collection information to get a recommendation.';
    if (entry.fit && entry.underBudget) return `${entry.set.name} fits ${entry.fit.shelf.name} and stays within the saved budget.`;
    if (entry.fit) return `${entry.set.name} fits the room but sits above the saved budget.`;
    if (entry.underBudget) return `${entry.set.name} is affordable, but the current room has nowhere safe for it.`;
    return `${entry.set.name} misses both the current budget and shelf-space rules.`;
  }

  function renderBuy() {
    ui.buyBudget = Number(ui.buyBudget ?? state.preferences?.monthlyBudget ?? 220);
    const themes = [...new Set(allSets().map(set => set.theme))].sort();
    let ranked = recommendations(ui.buyBudget);
    if (ui.buyFitOnly) ranked = ranked.filter(entry => entry.fit);
    const cards = ranked.slice(0,12).map(entry => `<article class="recommendation-card"><div class="recommendation-art"><span class="match-score">${entry.score}</span>${imageMarkup(entry.set)}</div><div class="recommendation-body"><span class="set-theme">${escapeHTML(entry.set.theme)} · SET ${escapeHTML(entry.set.number)}</span><h3>${escapeHTML(entry.set.name)}</h3><div class="recommendation-price">${money(entry.set.price)}</div><div class="reason-list">${entry.reasons.slice(0,3).map(reason => `<div class="reason ${reason.good ? 'good' : 'warning'}"><i></i><span>${escapeHTML(reason.text)}</span></div>`).join('')}</div><button class="button ${entry.wanted ? 'button-quiet' : ''}" type="button" data-action="${entry.wanted ? 'quick-fit' : 'add-wishlist'}" data-set-id="${escapeHTML(entry.set.id)}">${entry.wanted ? 'Open fit check' : 'Add to wishlist'}</button></div></article>`).join('');
    return `${pageHead('PRO · BRICKBRAIN', 'Make the next box earn its space.', 'The ranking combines budget, taste, wishlist intent and the actual free room on your shelves.')}
      <div class="buy-controls"><label class="form-field"><span>This purchase budget</span><div class="budget-display"><strong id="buy-budget-copy">${money(ui.buyBudget)}</strong><small>MAX £800</small></div><input id="buy-budget" type="range" min="25" max="800" step="5" value="${ui.buyBudget}"></label><div class="form-field"><span>Favourite themes</span><div class="theme-pills">${themes.map(theme => `<button class="theme-pill ${(state.preferences.themes || []).includes(theme) ? 'is-active' : ''}" type="button" data-action="toggle-buy-theme" data-theme="${escapeHTML(theme)}">${escapeHTML(theme)}</button>`).join('')}</div></div><div class="form-field"><span>Space rule</span><label class="check-row"><input id="buy-fit-only" type="checkbox" ${ui.buyFitOnly ? 'checked' : ''}> Only show sets that fit now</label><small>Prices are planning inputs, not live retailer offers.</small></div></div>
      ${cards ? `<div class="recommendation-grid">${cards}</div>` : '<div class="empty-state"><div><span class="empty-state-mark">N</span><h3>No set passes those rules.</h3><p>Raise the budget, add a larger shelf or allow recommendations that need a future space.</p><button class="button button-acid" type="button" data-action="relax-buy">Show best alternatives</button></div></div>'}`;
  }

  function setupBuy() {
    const slider = document.getElementById('buy-budget');
    slider?.addEventListener('input', () => { ui.buyBudget = Number(slider.value); const copy = document.getElementById('buy-budget-copy'); if (copy) copy.textContent = money(ui.buyBudget); });
    slider?.addEventListener('change', () => renderApp());
    document.getElementById('buy-fit-only')?.addEventListener('change', event => { ui.buyFitOnly = event.target.checked; renderApp(); });
  }

  function renderSettings() {
    const themes = [...new Set(allSets().map(set => set.theme))].sort();
    const active = hasPro();
    const planCopy = state.licensed ? 'Pro licence active' : trialDaysLeft() > 0 ? `Pro trial · ${trialDaysLeft()} day${trialDaysLeft() === 1 ? '' : 's'} left` : 'Free catalogue plan';
    return `${pageHead('LOCAL-FIRST CONTROL', 'Settings.', 'Tune recommendations, define the profit target and keep a portable backup of the collection.')}
      <div class="settings-grid">
        <section class="settings-panel"><h2>Collector profile</h2><p>These details shape Buy Smart and the dashboard greeting.</p><div class="form-grid"><label class="form-field"><span>Display name</span><input id="settings-name" type="text" value="${escapeHTML(state.preferences?.displayName || '')}" placeholder="Your name"></label><label class="form-field"><span>Monthly LEGO budget</span><span class="money-input"><span>£</span><input id="settings-budget" type="number" min="0" step="1" value="${Number(state.preferences?.monthlyBudget || 0)}"></span></label><label class="form-field"><span>Default selling fee %</span><input id="settings-fee" type="number" min="0" max="100" step="0.1" value="${Number(state.preferences?.defaultFeePercent ?? 12)}"></label><div class="form-field full"><span>Favourite themes</span><div class="theme-pills">${themes.map(theme => `<button class="theme-pill ${(state.preferences?.themes || []).includes(theme) ? 'is-active' : ''}" type="button" data-action="toggle-settings-theme" data-theme="${escapeHTML(theme)}">${escapeHTML(theme)}</button>`).join('')}</div></div></div><div class="settings-actions"><button class="button" type="button" data-action="save-profile">Save profile</button></div></section>
        <section class="settings-panel"><h2>Profit goal</h2><p>The dashboard counts recorded sale profit—not revenue—against this target.</p><div class="form-grid"><label class="form-field"><span>Goal name</span><input id="settings-goal-name" type="text" value="${escapeHTML(state.goal?.name || '')}"></label><label class="form-field"><span>Target</span><span class="money-input"><span>£</span><input id="settings-goal-target" type="number" min="1" step="1" value="${Number(state.goal?.target || 500)}"></span></label></div><div class="settings-actions"><button class="button button-acid" type="button" data-action="save-goal">Update goal</button></div></section>
        <section class="settings-panel"><h2>SetRoom Pro</h2><p>Collection logging stays free. Space, Build, Sell and Buy Smart are the subscription layer.</p><div class="plan-status ${active ? 'active' : ''}"><i></i><div><strong>${escapeHTML(planCopy)}</strong><p>${state.licensed ? 'This browser has a locally marked licence.' : active ? 'All four decision tools are currently unlocked.' : 'Start the browser trial to inspect the complete product.'}</p></div></div><div class="settings-actions"><button class="button" type="button" data-action="paywall">Compare plans</button>${!active ? '<button class="button button-acid" type="button" data-action="start-trial">Start trial</button>' : ''}</div></section>
        <section class="settings-panel"><h2>App behaviour</h2><p>The site can be installed from supporting browsers and remains useful on phone, tablet or desktop.</p><div class="form-grid"><label class="check-row"><input id="settings-motion" type="checkbox" ${state.settings?.reducedMotion ? 'checked' : ''}> Reduce interface motion</label><label class="check-row"><input id="settings-compact" type="checkbox" ${state.settings?.compactCards ? 'checked' : ''}> Prefer compact collection cards</label></div><div class="settings-actions"><button class="button" type="button" data-action="save-behaviour">Save behaviour</button><button class="button button-quiet" type="button" data-action="install-app">Install web app</button></div></section>
        <section class="settings-panel"><h2>Your data</h2><p>This release stores the collection in this browser. Export before clearing site data or changing device.</p><div class="data-warning">Camera replay video is not included in JSON backups. Download important recordings individually before leaving the Build screen.</div><div class="settings-actions"><button class="button" type="button" data-action="export-backup">Export backup</button><button class="button button-quiet" type="button" data-action="import-backup">Import backup</button><button class="button button-danger" type="button" data-action="reset-app">Reset app</button></div></section>
        <section class="settings-panel"><h2>Launch checklist</h2><p>The polished static product is ready for GitHub Pages. Two commercial connections remain deliberately configurable.</p><div class="activity-list"><div class="activity-row"><span class="activity-icon">${CONFIG.checkoutUrl ? '✓' : '1'}</span><div><strong>Checkout URL</strong><p>${CONFIG.checkoutUrl ? 'Configured in config.js' : 'Add a Stripe or Lemon Squeezy checkout URL'}</p></div><time>${CONFIG.checkoutUrl ? 'READY' : 'TODO'}</time></div><div class="activity-row"><span class="activity-icon">2</span><div><strong>Secure entitlement</strong><p>Use a small backend or payment provider licence API for production</p></div><time>TODO</time></div><div class="activity-row"><span class="activity-icon">✓</span><div><strong>GitHub Pages build</strong><p>Static files, manifest and offline shell included</p></div><time>READY</time></div></div></section>
      </div>`;
  }

  function saveProfile() {
    state.preferences.displayName = document.getElementById('settings-name')?.value.trim() || '';
    state.preferences.monthlyBudget = Math.max(0, Number(document.getElementById('settings-budget')?.value) || 0);
    state.preferences.defaultFeePercent = clamp(document.getElementById('settings-fee')?.value,0,100);
    saveState();
    toast('Collector profile saved.', 'success');
    renderApp();
  }

  function saveGoal() {
    state.goal.name = document.getElementById('settings-goal-name')?.value.trim() || 'Savings goal';
    state.goal.target = Math.max(1, Number(document.getElementById('settings-goal-target')?.value) || 500);
    saveState();
    toast('Profit goal updated.', 'success');
    renderApp();
  }

  function saveBehaviour() {
    state.settings.reducedMotion = Boolean(document.getElementById('settings-motion')?.checked);
    state.settings.compactCards = Boolean(document.getElementById('settings-compact')?.checked);
    document.documentElement.classList.toggle('reduce-motion', state.settings.reducedMotion);
    saveState();
    toast('App behaviour saved.', 'success');
  }

  function togglePreferenceTheme(theme) {
    const current = new Set(state.preferences.themes || []);
    if (current.has(theme)) current.delete(theme); else current.add(theme);
    state.preferences.themes = [...current];
    saveState();
    renderApp();
  }

  function exportBackup() {
    const payload = { exportedAt:new Date().toISOString(), product:'SetRoom', state };
    const blob = new Blob([JSON.stringify(payload,null,2)], { type:'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `setroom-backup-${new Date().toISOString().slice(0,10)}.json`;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url),1000);
    toast('Backup exported.', 'success');
  }

  function importBackupFile(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result || '{}'));
        state = mergeState(parsed.state || parsed);
        saveState();
        toast('Backup imported.', 'success');
        renderApp();
      } catch (error) {
        toast('That file is not a valid SetRoom backup.', 'error');
      }
    };
    reader.readAsText(file);
  }

  function requestReset() {
    openModal('DESTRUCTIVE ACTION', 'Reset SetRoom?', '<div class="data-warning">This removes the local collection, shelves, sessions, sales and preferences from this browser. Export a backup first when the data matters.</div>', '<button class="button button-quiet" type="button" data-action="close-modal">Cancel</button><button class="button button-danger" type="button" data-action="confirm-reset">Reset everything</button>');
  }

  function confirmReset() {
    stopCamera();
    resetTimer(false);
    localStorage.removeItem(STORAGE_KEY);
    state = mergeState(null);
    ui = { collectionFilter:'all', collectionSearch:'', selectedBuildSetId:'', selectedSellSetId:'', buyBudget:null, buyFitOnly:false, sidebarOpen:false };
    closeModal();
    toast('SetRoom reset to the sample room.', 'info');
    renderApp();
  }

  function openModal(kicker,title,body,footer='',size='') {
    const root = document.getElementById('modal-root');
    if (!root) return;
    document.body.classList.add('modal-open');
    root.innerHTML = `<div class="modal-backdrop" data-modal-backdrop><section class="modal ${size}" role="dialog" aria-modal="true" aria-labelledby="modal-title" data-modal-card><header class="modal-header"><div><span>${kicker}</span><h2 id="modal-title">${title}</h2></div><button class="modal-close" type="button" data-action="close-modal" aria-label="Close">×</button></header><div class="modal-body">${body}</div>${footer ? `<footer class="modal-footer">${footer}</footer>` : ''}</section></div>`;
    root.querySelector('button,input,select,textarea')?.focus({preventScroll:true});
  }

  function closeModal() {
    document.body.classList.remove('modal-open');
    const root = document.getElementById('modal-root');
    if (root) root.innerHTML = '';
  }

  function openTour() {
    const body = `<div class="tour-hero"><div><span>START WITH THE FREE CATALOGUE</span><h3>Five jobs. One calm collection.</h3><p>SetRoom is deliberately not another speculative price chart. It is a working system for the boxes, shelves, build time and sale decisions around a display collection.</p></div><div class="tour-free"><strong>FREE</strong><span>catalogue forever</span></div></div><div class="tour-grid"><article class="tour-card"><span>01 · COLLECTION</span><h4>Know exactly what you own.</h4><p>Log owned, wanted and sold sets with box imagery, spend, progress, condition and notes.</p></article><article class="tour-card"><span>02 · SPACE</span><h4>Measure once. Stop guessing.</h4><p>Add shelf dimensions, check normal and rotated fit, then auto-arrange the room.</p></article><article class="tour-card"><span>03 · BUILD</span><h4>Keep the story of the build.</h4><p>Time sessions, update progress and record local camera replays.</p></article><article class="tour-card"><span>04 · SELL</span><h4>Count take-home money.</h4><p>See fees, fulfilment, cost and actual profit before listing a set.</p></article><article class="tour-card"><span>05 · BUY SMART</span><h4>Block the wrong next box.</h4><p>Rank sets against budget, favourite themes and free shelf space.</p></article></div>`;
    openModal('TWO-MINUTE PRODUCT TOUR','Meet SetRoom.',body,'<button class="button button-quiet" type="button" data-action="close-modal">Explore sample room</button><button class="button button-acid" type="button" data-action="tour-add-set">Add my first set</button>','large');
  }

  function openLegal(type) {
    const privacy = type === 'privacy';
    const title = privacy ? 'Privacy in this release.' : 'Terms for this prototype.';
    const body = privacy ? `<div class="legal-copy"><h3>Local collection data</h3><p>Collection, shelf, session, sale and preference data is stored in this browser using localStorage. Export a backup before clearing browser data or moving device.</p><h3>Camera</h3><p>Camera access is requested only after you press Start camera. The video stream remains in the browser. A recording becomes a temporary local object URL and is not uploaded by this static build.</p><h3>External images</h3><p>Set imagery is loaded from Brickset.com. Your browser requests those images directly, so that service may receive ordinary request information such as IP address and browser headers.</p><h3>No analytics by default</h3><p>This repository ships without analytics, advertising or account tracking.</p></div>` : `<div class="legal-copy"><h3>Independent product</h3><p>SetRoom is an unofficial fan-made collector tool and is not affiliated with, endorsed by or sponsored by the LEGO Group. LEGO and related marks belong to their respective owner.</p><h3>Planning information</h3><p>Dimensions, prices and recommendations are planning aids, not guarantees, live valuations or investment advice. Verify critical measurements, contents, fees and prices independently.</p><h3>Static prototype</h3><p>The included trial and plan status are local product demonstrations. A commercial launch requires secure server-side entitlement validation and the actual terms of your payment provider.</p><h3>No profit guarantee</h3><p>The product is designed around a viable offer, but sales, revenue and profit depend on demand, pricing, acquisition costs, taxes, support and execution.</p></div>`;
    openModal(privacy ? 'PRIVACY' : 'TERMS',title,body,'<button class="button" type="button" data-action="close-modal">Close</button>');
  }

  function openPaywall() {
    const body = `<div class="paywall-hero"><div class="paywall-copy"><span>SETROOM PRO</span><h3>Four expensive decisions, handled properly.</h3><p>The free catalogue proves the habit. Pro earns the subscription when a collector needs to know what fits, what a sale really makes, or what box deserves the next purchase.</p></div><div class="paywall-price"><strong>${escapeHTML(CONFIG.annualPrice || '£29')}</strong><span>PER YEAR · FOUNDING PRICE</span></div></div><div class="paywall-features"><article class="paywall-feature"><b>BrickSpace</b><p>Measure shelves, run fit checks and auto-arrange the room.</p></article><article class="paywall-feature"><b>BuildReplay</b><p>Time sessions, track progress and capture local camera replays.</p></article><article class="paywall-feature"><b>BrickExit</b><p>Calculate net proceeds and prepare an honest listing workflow.</p></article><article class="paywall-feature"><b>BrickBrain</b><p>Rank purchases by budget, taste and actual free display space.</p></article></div><div class="data-warning" style="margin-top:15px">This GitHub Pages build demonstrates the complete product and local trial. Secure paid access needs a checkout URL plus server-side or provider-backed entitlement validation.</div>`;
    openModal('UPGRADE',hasPro() ? 'Your current plan.' : 'Unlock SetRoom Pro.',body,`<button class="button button-quiet" type="button" data-action="close-modal">Not now</button>${!hasPro() ? '<button class="button" type="button" data-action="start-trial">Start free trial</button>' : ''}<button class="button button-acid" type="button" data-action="checkout">${CONFIG.checkoutUrl ? 'Choose Pro' : 'Checkout setup'}</button>`,'large');
  }

  function openCheckout() {
    if (CONFIG.checkoutUrl) {
      window.open(CONFIG.checkoutUrl,'_blank','noopener,noreferrer');
      return;
    }
    const body = `<div class="legal-copy"><h3>The product is ready; the payment link is not.</h3><p>Open <code>setroom/config.js</code> in the GitHub repository and paste a Stripe Payment Link, Lemon Squeezy checkout or equivalent into <code>checkoutUrl</code>.</p><h3>Do not rely on the local trial for paid enforcement.</h3><p>A serious launch should validate subscriptions or licence keys through a backend or payment-provider API before unlocking Pro.</p><h3>Commercial target</h3><p>At the founding price of ${escapeHTML(CONFIG.annualPrice || '£29')}, 18 annual customers produce £522 gross revenue before payment fees, taxes and other costs.</p></div>`;
    openModal('LAUNCH SETUP','Connect the money layer.',body,'<button class="button" type="button" data-action="close-modal">Understood</button>');
  }

  function handleClick(event) {
    if (event.target.matches?.('[data-modal-backdrop]')) {
      closeModal();
      return;
    }
    const routeNode = event.target.closest('[data-route]');
    if (routeNode) {
      event.preventDefault();
      navigate(routeNode.dataset.route);
      return;
    }
    const actionNode = event.target.closest('[data-action]');
    if (!actionNode) return;
    const action = actionNode.dataset.action;
    const setId = actionNode.dataset.setId || '';
    const shelfId = actionNode.dataset.shelfId || '';
    const actions = {
      'open-app': () => navigate('studio'),
      'tour': openTour,
      'privacy': () => openLegal('privacy'),
      'terms': () => openLegal('terms'),
      'paywall': openPaywall,
      'checkout': openCheckout,
      'start-trial': () => startTrial(actionNode.dataset.routeAfter || 'space'),
      'close-modal': closeModal,
      'open-sidebar': () => { ui.sidebarOpen = !ui.sidebarOpen; document.querySelector('.app-shell')?.classList.toggle('mobile-nav-open',ui.sidebarOpen); },
      'close-sidebar': () => { ui.sidebarOpen = false; document.querySelector('.app-shell')?.classList.remove('mobile-nav-open'); },
      'add-set': () => { if ((currentRoute === 'studio' || currentRoute === 'dashboard' || currentRoute === 'space')) document.getElementById('studio-search')?.focus(); else openAddSetModal(); },
      'studio-select-set': () => { ui.studioSelectedSetId=setId; ui.studioSearch=''; ui.studioSelectedPlacementId=''; renderApp(); },
      'studio-add-set': () => addStudioSet(setId),
      'studio-select-shelf': () => { ui.studioActiveShelfId=shelfId; ui.studioSelectedPlacementId=''; renderApp(); },
      'studio-apply-placement': () => applyStudioPlacement(actionNode.dataset.placementId || ''),
      'studio-remove-placement': () => removeStudioPlacement(actionNode.dataset.placementId || ''),
      'studio-auto-arrange': autoArrangeStudio,
      'tour-add-set': () => { closeModal(); navigate('studio'); window.setTimeout(() => document.getElementById('studio-search')?.focus(),80); },
      'choose-catalog-set': () => {
        const root = document.getElementById('modal-root');
        if (root) root.dataset.selectedSetId = setId;
        document.querySelectorAll('[data-action="choose-catalog-set"]').forEach(node => node.classList.toggle('is-selected', node.dataset.setId === setId));
        const preview = document.getElementById('add-set-preview');
        if (preview) preview.innerHTML = addSetPreview(getSet(setId));
      },
      'set-mode': () => {
        const mode = actionNode.dataset.mode || 'catalog';
        const root = document.getElementById('modal-root');
        if (root) root.dataset.setMode = mode;
        document.querySelectorAll('[data-action="set-mode"]').forEach(node => node.classList.toggle('is-active', node.dataset.mode === mode));
        document.getElementById('catalog-panel')?.toggleAttribute('hidden', mode !== 'catalog');
        document.getElementById('custom-panel')?.toggleAttribute('hidden', mode !== 'custom');
      },
      'save-new-set': saveNewSet,
      'edit-set': () => openEditSetModal(setId),
      'save-edited-set': () => saveEditedSet(setId),
      'delete-set': () => deleteSet(setId),
      'collection-filter': () => { ui.collectionFilter = actionNode.dataset.status || 'all'; renderApp(); },
      'export-backup': exportBackup,
      'import-backup': () => document.getElementById('import-file')?.click(),
      'add-shelf': () => openShelfModal(),
      'edit-shelf': () => openShelfModal(shelfId),
      'save-shelf': () => saveShelf(shelfId),
      'delete-shelf': () => deleteShelf(shelfId),
      'place-set': () => openPlacementModal(setId,shelfId),
      'unplace-set': () => unplaceSet(setId,shelfId),
      'save-placement': savePlacement,
      'quick-fit': () => openFitModal(setId),
      'auto-arrange': autoArrange,
      'build-set': () => { ui.selectedBuildSetId = setId; navigate('build'); },
      'timer-toggle': toggleTimer,
      'timer-reset': () => resetTimer(true),
      'save-session': saveBuildSession,
      'camera-start': startCamera,
      'camera-stop': () => { stopCamera(); toast('Camera turned off.', 'info'); },
      'record-start': startRecording,
      'record-stop': stopRecording,
      'copy-listing': copyListing,
      'mark-sold': markSold,
      'add-wishlist': () => addWishlist(setId),
      'toggle-buy-theme': () => togglePreferenceTheme(actionNode.dataset.theme || ''),
      'toggle-settings-theme': () => togglePreferenceTheme(actionNode.dataset.theme || ''),
      'relax-buy': () => { ui.buyFitOnly = false; renderApp(); },
      'save-profile': saveProfile,
      'save-goal': saveGoal,
      'save-behaviour': saveBehaviour,
      'reset-app': requestReset,
      'confirm-reset': confirmReset,
      'install-app': installApp
    };
    if (actions[action]) {
      event.preventDefault();
      actions[action]();
    }
  }

  function handleInput(event) {
    if (event.target.id === 'studio-search') { ui.studioSearch=event.target.value; refreshStudioSearch(); }
    if (event.target.id === 'collection-search') {
      ui.collectionSearch = event.target.value;
      applyCollectionFilter();
    }
    if (event.target.id === 'catalog-search') {
      const query = event.target.value.trim().toLowerCase();
      document.querySelectorAll('[data-action="choose-catalog-set"]').forEach(option => {
        const set = getSet(option.dataset.setId);
        const text = `${set?.number || ''} ${set?.name || ''} ${set?.theme || ''}`.toLowerCase();
        option.hidden = Boolean(query) && !text.includes(query);
      });
    }
    if (event.target.id === 'set-progress') {
      const copy = document.getElementById('set-progress-copy');
      if (copy) copy.textContent = `${event.target.value}%`;
    }
    if (event.target.id === 'build-progress') {
      const copy = document.getElementById('build-progress-copy');
      if (copy) copy.textContent = `${event.target.value}%`;
    }
  }

  function handleChange(event) {
    if (['placement-set','placement-shelf','placement-orientation'].includes(event.target.id)) updatePlacementPreview();
  }

  async function installApp() {
    const prompt = window.__setroomInstallPrompt;
    if (prompt) {
      prompt.prompt();
      await prompt.userChoice.catch(() => null);
      window.__setroomInstallPrompt = null;
    } else {
      toast('Use your browser menu and choose “Install app” or “Add to Home Screen”.', 'info');
    }
  }

  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    window.__setroomInstallPrompt = event;
  });
})();
