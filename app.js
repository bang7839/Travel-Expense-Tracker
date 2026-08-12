/**
 * TravelPay — app.js (Claude Ver)
 *
 * Architecture:
 *  - Store   : single source of truth, persisted to localStorage
 *  - Auth    : role-based permission gate (owner / member / guest)
 *  - TripMgr : CRUD for trips
 *  - UI      : pure render functions (no state mutation in render)
 *  - Events  : wired once in init()
 */

'use strict';

/* ═══════════════════════════════════════════════════════════
   CONSTANTS
   ═══════════════════════════════════════════════════════════ */

const STORAGE_KEY      = 'travelpay_v3';
const GLOBAL_GAS_KEY   = 'travelpay_gas_url';
const DEFAULT_OWNER_PWD = '1234';
const DEFAULT_MEMBER_PWD = '0000';

const CURRENCY_SYMBOLS = {
  JPY: '¥', KRW: '₩', USD: '$', EUR: '€', THB: '฿', TWD: '$', HKD: '$'
};

const CATEGORY_META = {
  '餐飲': { icon: '🍔', cls: 'food'    },
  '交通': { icon: '🚗', cls: 'transit' },
  '住宿': { icon: '🏨', cls: 'lodging' },
  '購物': { icon: '🛍️', cls: 'shop'   },
  '門票': { icon: '🎟️', cls: 'ticket' },
  '其他': { icon: '🎈', cls: 'other'   },
};

/* ═══════════════════════════════════════════════════════════
   STORE — Single Source of Truth
   ═══════════════════════════════════════════════════════════ */

/**
 * Runtime state. Never mutate directly from UI — use Store methods.
 */
const Store = (() => {
  // Default shape for a new trip
  function createTrip(id, name, ownerPwd = DEFAULT_OWNER_PWD, memberPwd = DEFAULT_MEMBER_PWD) {
    return {
      id,
      settings: {
        tripName:       name,
        baseCurrency:   'TWD',
        foreignCurrency:'JPY',
        exchangeRate:   0.215,
        members:        ['小明', '小美', '阿強'],
        creditCards:    ['玉山FlyGo', '富邦J卡', '國泰CUBE'],
        ownerPassword:  ownerPwd,
        memberPassword: memberPwd,
      },
      expenses: [],
      links: [], // Quick links list
    };
  }

  // Load from localStorage
  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  // Save to localStorage
  function save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      trips:         state.trips,
      currentTripId: state.currentTripId,
    }));
  }

  // ── Internal State ──
  const state = {
    trips:         {},   // { [tripId]: Trip }
    currentTripId: null, // string
  };

  // ── Auth State (session only, not persisted) ──
  const auth = {
    role: 'guest', // 'owner' | 'member' | 'guest'
  };

  // ── GAS URL (global, shared across all trips) ──
  let gasUrl = localStorage.getItem(GLOBAL_GAS_KEY) || '';

  // ── Init ──
  function init() {
    const saved = load();
    if (saved && saved.trips && Object.keys(saved.trips).length > 0) {
      state.trips = saved.trips;

      // Migrate old single-password trips
      Object.values(state.trips).forEach(trip => {
        if (!trip.settings.ownerPassword) {
          trip.settings.ownerPassword  = trip.settings.appPassword || DEFAULT_OWNER_PWD;
          trip.settings.memberPassword = DEFAULT_MEMBER_PWD;
          delete trip.settings.appPassword;
        }
        if (!trip.settings.creditCards) {
          trip.settings.creditCards = ['玉山FlyGo', '富邦J卡', '國泰CUBE'];
        }
        if (!trip.links) {
          trip.links = [];
        }
      });

      // Restore current trip
      if (saved.currentTripId && state.trips[saved.currentTripId]) {
        state.currentTripId = saved.currentTripId;
      } else {
        state.currentTripId = Object.keys(state.trips)[0];
      }
    } else {
      // First run: create a default demo trip
      const demo = createTrip('trip_demo', '東京快樂之旅 🎌');
      state.trips[demo.id] = demo;
      state.currentTripId  = demo.id;
    }
  }

  // ── Getters ──
  function currentTrip()   { return state.trips[state.currentTripId]; }
  function settings()      { return currentTrip().settings; }
  function expenses()      { return currentTrip().expenses; }
  function allTrips()      { return Object.values(state.trips); }
  function getRole()       { return auth.role; }
  function getGasUrl()     { return gasUrl; }

  // ── Trip CRUD ──
  function selectTrip(id) {
    if (!state.trips[id]) return false;
    state.currentTripId = id;
    auth.role = 'guest'; // reset auth when switching trips
    save();
    return true;
  }

  function addTrip(name, ownerPwd, memberPwd) {
    const prevTrip = currentTrip();
    const id   = `trip_${Date.now()}`;
    const trip = createTrip(id, name, ownerPwd || DEFAULT_OWNER_PWD, memberPwd || DEFAULT_MEMBER_PWD);
    
    if (prevTrip && prevTrip.settings) {
      trip.settings.baseCurrency = prevTrip.settings.baseCurrency;
      trip.settings.exchangeRate = prevTrip.settings.exchangeRate;
      trip.settings.members = [...(prevTrip.settings.members || [])];
      trip.settings.creditCards = [...(prevTrip.settings.creditCards || [])];
    }
    
    state.trips[id] = trip;
    state.currentTripId = id;
    save();
    return trip;
  }

  function deleteCurrentTrip() {
    const id = state.currentTripId;
    delete state.trips[id];
    
    // Remember deleted trip to prevent cloud from bringing it back
    state.deletedTrips = state.deletedTrips || {};
    state.deletedTrips[id] = true;
    
    const remaining = Object.keys(state.trips);
    if (remaining.length === 0) {
      const newId = `trip_${Date.now()}`;
      const demo = createTrip(newId, '新旅遊行程');
      state.trips[newId] = demo;
      state.currentTripId = newId;
    } else {
      state.currentTripId = remaining[0];
    }
    auth.role = 'guest';
    save();
    return id;
  }

  function saveSettings(newSettings) {
    currentTrip().settings = { ...currentTrip().settings, ...newSettings };
    save();
  }

  function saveGasUrl(url) {
    gasUrl = url;
    localStorage.setItem(GLOBAL_GAS_KEY, url);
  }

  // ── Quick Link CRUD ──
  function addLink(title, url) {
    if (!currentTrip().links) currentTrip().links = [];
    const link = { id: `link_${Date.now()}`, title, url };
    currentTrip().links.push(link);
    save();
    return link;
  }

  function deleteLink(id) {
    const list = currentTrip().links || [];
    const idx  = list.findIndex(l => l.id === id);
    if (idx === -1) return false;
    list.splice(idx, 1);
    save();
    return true;
  }

  // ── Expense CRUD ──
  function addExpense(expense) {
    const id = `exp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const newExp = { ...expense, id };
    currentTrip().expenses.push(newExp);
    save();
    return newExp;
  }

  function updateExpense(id, expense) {
    const list = currentTrip().expenses;
    const idx  = list.findIndex(e => e.id === id);
    if (idx === -1) return null;
    list[idx] = { ...expense, id };
    save();
    return list[idx];
  }

  function deleteExpense(id) {
    const list = currentTrip().expenses;
    const idx  = list.findIndex(e => e.id === id);
    if (idx === -1) return false;
    list.splice(idx, 1);
    save();
    return true;
  }

  // ── Auth ──
  function unlock(role) {
    auth.role = role;
  }

  function lockout() {
    auth.role = 'guest';
  }

  function canWrite() { return auth.role === 'owner' || auth.role === 'member'; }
  function isOwner()  { return auth.role === 'owner'; }
  function isDeleted(id) { return !!(state.deletedTrips && state.deletedTrips[id]); }

  // Public API
  return {
    init, save,
    currentTrip, settings, expenses, allTrips,
    getRole, getGasUrl, saveGasUrl,
    selectTrip, addTrip, deleteCurrentTrip, saveSettings,
    addExpense, updateExpense, deleteExpense,
    addLink, deleteLink,
    unlock, lockout, canWrite, isOwner, isDeleted,
    // expose raw state id for rendering
    get currentTripId() { return state.currentTripId; },
  };
})();

/* ═══════════════════════════════════════════════════════════
   AUTH — Role Permission Gate
   ═══════════════════════════════════════════════════════════ */

const Auth = (() => {
  /**
   * Attempt to verify a passcode for a specific role. Returns role or null.
   */
  function verifyPasscode(passcode, role) {
    const { ownerPassword, memberPassword } = Store.settings();
    const ownerPwd  = ownerPassword  || DEFAULT_OWNER_PWD;
    const memberPwd = memberPassword || DEFAULT_MEMBER_PWD;

    if (role === 'owner' && passcode === ownerPwd)  return 'owner';
    if (role === 'member' && passcode === memberPwd) return 'member';
    return null;
  }

  /**
   * Check if the current trip even needs a password.
   * Returns true if no passwords are set (auto-unlock as owner).
   */
  function isOpenTrip() {
    const { ownerPassword, memberPassword } = Store.settings();
    return !ownerPassword && !memberPassword;
  }

  return { verifyPasscode, isOpenTrip };
})();

/* ═══════════════════════════════════════════════════════════
   GAS SYNC — Google Apps Script Cloud Sync
   ═══════════════════════════════════════════════════════════ */

const Sync = (() => {
  async function pull() {
    const url = Store.getGasUrl();
    if (!url) return;

    setSyncStatus('syncing', '同步中…');
    try {
      const res  = await fetch(`${url}?tripId=${encodeURIComponent(Store.currentTripId)}`);
      const data = await res.json();
      if (data.success) {
        // Merge remote trips metadata (no overwrite of local expenses unless remote has more)
        if (data.allTrips) {
          Object.entries(data.allTrips).forEach(([id, remote]) => {
            if (Store.isDeleted(id)) return; // Skip trips that were deleted locally
            
            const localTrip = Store.allTrips().find(t => t.id === id);
            if (!localTrip) {
              // New trip from cloud — add skeleton
              Store.addTrip(remote.settings.tripName, remote.settings.ownerPassword);
            } else if (remote.settings) {
              // Sync settings for existing trips (like tripName, members, etc.)
              localTrip.settings = { ...localTrip.settings, ...remote.settings };
            }
          });
        }
        if (data.expenses && Array.isArray(data.expenses)) {
          Store.currentTrip().expenses = data.expenses;
          Store.save();
        }
        setSyncStatus('online', '雲端已同步');
        UI.renderAll();
      }
    } catch {
      setSyncStatus('offline', '同步失敗（使用本地）');
    }
  }

  async function push(action, payload) {
    const url = Store.getGasUrl();
    if (!url) return;
    try {
      setSyncStatus('syncing', '更新雲端…');
      await fetch(url, {
        method: 'POST',
        mode:   'no-cors',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, tripId: Store.currentTripId, ...payload }),
      });
      setSyncStatus('online', '雲端已更新');
    } catch {
      setSyncStatus('offline', '僅存於本地');
    }
  }

  function setSyncStatus(type, label) {
    const el  = document.getElementById('sync-status');
    const lbl = document.getElementById('sync-label');
    if (!el) return;
    el.className = `sync-status ${type}`;
    if (lbl) lbl.textContent = label;
  }

  return { pull, push, setSyncStatus };
})();

/* ═══════════════════════════════════════════════════════════
   UI — Pure Render Functions
   ═══════════════════════════════════════════════════════════ */

const UI = (() => {
  // ── helpers ──
  function esc(str) {
    if (str == null) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function fmtMoney(n, decimals = 0) {
    return Number(n).toLocaleString('zh-TW', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
  }

  function currSym(code) {
    return CURRENCY_SYMBOLS[code] || '';
  }

  // ── Lock Screen ──
  function renderTripDropdown() {
    const sel = document.getElementById('select-trip');
    if (!sel) return;
    sel.innerHTML = '';
    Store.allTrips().forEach(trip => {
      const opt = document.createElement('option');
      opt.value = trip.id;
      const hasLock = trip.settings.ownerPassword || trip.settings.memberPassword;
      opt.textContent = `${trip.settings.tripName}  ${hasLock ? '🔒' : '🔓'}`;
      if (trip.id === Store.currentTripId) opt.selected = true;
      sel.appendChild(opt);
    });
  }

  function renderPasscodeDots(len) {
    const container = document.getElementById('passcode-dots');
    if (!container) return;
    container.innerHTML = '';
    for (let i = 0; i < 4; i++) {
      const dot = document.createElement('div');
      dot.className = 'passcode-dot' + (i < len ? ' filled' : '');
      container.appendChild(dot);
    }
  }

  // ── Lock / Unlock App Shell ──
  function showLockScreen() {
    const lock = document.getElementById('lock-screen');
    const app  = document.getElementById('app');
    lock.classList.remove('is-hidden');
    app.classList.add('is-blurred');
    renderTripDropdown();
    renderPasscodeDots(0);
    document.getElementById('passcode-error').textContent = '';
  }

  function hideLockScreen() {
    const lock = document.getElementById('lock-screen');
    const app  = document.getElementById('app');
    lock.classList.add('is-hidden');
    app.classList.remove('is-blurred');
  }

  function checkTripNeedsPassword() {
    if (Auth.isOpenTrip()) {
      Store.unlock('owner');
      hideLockScreen();
      renderAll();
      return;
    }
    showLockScreen();
  }

  // ── Header ──
  function renderHeader() {
    const s = Store.settings();
    document.getElementById('trip-name-display').textContent = s.tripName;
    const fc = s.foreignCurrency || 'JPY';
    document.getElementById('trip-subtitle').textContent =
      `主幣別：${s.baseCurrency}  ·  1 ${fc} = ${s.exchangeRate} ${s.baseCurrency}`;

    const badge = document.getElementById('role-badge');
    const role  = Store.getRole();
    if (role === 'owner') {
      badge.className   = 'role-badge owner';
      badge.textContent = '👑 管理者';
      badge.style.display = '';
    } else if (role === 'member') {
      badge.className   = 'role-badge member';
      badge.textContent = '👤 成員';
      badge.style.display = '';
    } else {
      badge.style.display = 'none';
    }
  }

  // ── Summary Card ──
  function renderSummary() {
    const s   = Store.settings();
    const exs = Store.expenses();

    let totalBase    = 0;
    let totalForeign = 0;

    exs.forEach(e => {
      const amt = parseFloat(e.amount) || 0;
      if (e.currency === s.baseCurrency) {
        totalBase += amt;
      } else {
        totalForeign += amt;
        totalBase    += amt * (parseFloat(s.exchangeRate) || 1);
      }
    });

    document.getElementById('total-base').textContent =
      `${currSym(s.baseCurrency)}${fmtMoney(Math.round(totalBase))}`;

    const sym = currSym(s.foreignCurrency || 'JPY');
    document.getElementById('total-foreign').textContent =
      totalForeign > 0 ? `${sym}${fmtMoney(Math.round(totalForeign))} 原幣` : '';

    document.getElementById('expense-count').textContent = exs.length;
  }

  // ── Current filter ──
  let _catFilter = 'all';

  function setCatFilter(cat) { _catFilter = cat; }

  // ── Expense List ──
  function renderExpenseList() {
    const container = document.getElementById('expense-list');
    const s         = Store.settings();
    let exs         = Store.expenses();

    if (_catFilter !== 'all') {
      exs = exs.filter(e => e.category === _catFilter);
    }

    if (exs.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">🧾</div>
          <div class="empty-state-title">還沒有記帳紀錄</div>
          <div class="empty-state-desc">點下方「＋」新增第一筆消費</div>
        </div>`;
      return;
    }

    // Sort: newest first
    const sorted = [...exs].sort((a, b) => {
      const d = new Date(b.date) - new Date(a.date);
      return d !== 0 ? d : b.id.localeCompare(a.id);
    });

    // Group by date
    const groups = {};
    sorted.forEach(e => {
      if (!groups[e.date]) groups[e.date] = [];
      groups[e.date].push(e);
    });

    let html = '';
    Object.entries(groups).forEach(([date, items]) => {
      const label = formatDateLabel(date);
      html += `<div class="expense-group-header">${esc(label)}</div>`;
      items.forEach(e => {
        html += renderExpenseCard(e, s);
      });
    });

    container.innerHTML = html;

    // Attach swipe-delete listeners
    container.querySelectorAll('.expense-card').forEach(card => {
      attachSwipeDelete(card);
    });
  }

  function formatDateLabel(dateStr) {
    if (!dateStr) return '';
    const d     = new Date(dateStr + 'T00:00:00');
    const today = new Date();
    const yest  = new Date(); yest.setDate(today.getDate() - 1);
    const fmt   = (dt) => `${dt.getMonth()+1}/${dt.getDate()}`;
    if (fmt(d) === fmt(today)) return '今天 · ' + dateStr;
    if (fmt(d) === fmt(yest))  return '昨天 · ' + dateStr;
    return dateStr;
  }

  function renderExpenseCard(e, s) {
    const meta   = CATEGORY_META[e.category] || CATEGORY_META['其他'];
    const amt    = parseFloat(e.amount) || 0;
    const sym    = currSym(e.currency);
    const isBase = e.currency === s.baseCurrency;
    const conv   = isBase ? '' : `≈ ${currSym(s.baseCurrency)}${fmtMoney(Math.round(amt * (s.exchangeRate||1)))}`;

    const hasAtt  = !!e.attachmentData;
    const isImg   = hasAtt && e.attachmentType && e.attachmentType.startsWith('image/');
    const attHtml = hasAtt
      ? `<span class="chip chip-media" onclick="AppEvents.viewAttachment('${esc(e.id)}')" title="查看附件">
           <i class="fa-solid ${isImg ? 'fa-image' : 'fa-paperclip'}"></i>
           ${isImg ? '相片' : '附件'}
         </span>`
      : '';

    const method = e.paymentMethod || '現金';
    const isCash = method === '現金';
    const methodChip = `<span class="chip chip-other" style="font-size:10px;">${isCash ? '💵' : '💳'} ${esc(method.replace('信用卡(','').replace(')',''))}</span>`;

    return `
      <div class="expense-card" data-id="${esc(e.id)}" role="listitem">
        <div class="cat-avatar ${meta.cls}" aria-label="${esc(e.category)}" onclick="AppEvents.editExpense('${esc(e.id)}')">${meta.icon}</div>
        <div class="expense-info" onclick="AppEvents.editExpense('${esc(e.id)}')">
          <div class="expense-title">${esc(e.title)}</div>
          <div class="expense-meta">
            <span class="expense-meta-text">${esc(e.paidBy)}</span>
            <span class="expense-meta-dot">•</span>
            ${methodChip}
            ${attHtml}
          </div>
          ${e.note ? `<div class="expense-meta" style="margin-top:2px;"><span class="expense-meta-text" style="opacity:0.7;"><i class="fa-regular fa-note-sticky"></i> ${esc(e.note)}</span></div>` : ''}
        </div>
        <div class="expense-amount-area" onclick="AppEvents.editExpense('${esc(e.id)}')">
          <div class="expense-amount">${sym}${fmtMoney(amt)}</div>
          ${conv ? `<div class="expense-converted">${esc(conv)}</div>` : ''}
        </div>
        <button class="icon-btn" style="background:transparent;border:none;color:var(--text-muted);width:30px;height:30px;font-size:13px;" onclick="AppEvents.deleteExpense('${esc(e.id)}')" aria-label="刪除" title="刪除">
          <i class="fa-solid fa-trash-can"></i>
        </button>
      </div>`;
  }

  // ── Settlement ──
  function renderSettlement() {
    const s       = Store.settings();
    const exs     = Store.expenses();
    const members = s.members || [];

    // Calculate net balance for each member
    const balance = {};
    members.forEach(m => { balance[m] = 0; });

    exs.forEach(e => {
      const rate    = e.currency === s.baseCurrency ? 1 : (parseFloat(s.exchangeRate) || 1);
      const baseAmt = (parseFloat(e.amount) || 0) * rate;

      // payer gets credit
      if (balance[e.paidBy] !== undefined) {
        balance[e.paidBy] += baseAmt;
      }

      // split owers share the debt
      const splitWith = (e.splitWith && e.splitWith.length > 0) ? e.splitWith : members;
      const share     = baseAmt / splitWith.length;
      splitWith.forEach(m => {
        if (balance[m] !== undefined) balance[m] -= share;
      });
    });

    // Render member balances
    const balContainer = document.getElementById('member-balances');
    const sym = currSym(s.baseCurrency);

    if (members.length === 0) {
      balContainer.innerHTML = `<p style="color:var(--text-muted);font-size:var(--fz-sm);text-align:center;">尚未設定成員</p>`;
    } else {
      balContainer.innerHTML = members.map(m => {
        const net   = balance[m] || 0;
        const isPos = net > 0.5;
        const isNeg = net < -0.5;
        const cls   = isPos ? 'amount-positive' : (isNeg ? 'amount-negative' : 'amount-zero');
        const label = isPos ? '可收回' : (isNeg ? '尚需付' : '已結清');
        return `
          <div class="member-balance-card">
            <div class="flex items-center gap-3">
              <div class="member-avatar">${esc(m.charAt(0))}</div>
              <span style="font-size:var(--fz-sm);font-weight:600;">${esc(m)}</span>
            </div>
            <span class="${cls}" style="font-size:var(--fz-sm);">
              ${label} ${sym}${fmtMoney(Math.abs(Math.round(net)))}
            </span>
          </div>`;
      }).join('');
    }

    // Greedy minimum-transfer settlement algorithm
    const debtors   = [];
    const creditors = [];
    Object.entries(balance).forEach(([m, v]) => {
      const rv = Math.round(v);
      if (rv < -1)   debtors.push({ name: m, amount: -rv });
      else if (rv > 1) creditors.push({ name: m, amount: rv });
    });

    const planContainer = document.getElementById('settlement-plan');
    if (debtors.length === 0) {
      planContainer.innerHTML = `<p style="color:var(--text-muted);font-size:var(--fz-sm);text-align:center;padding:var(--sp-4);">🎉 大家都結清了，無需轉帳！</p>`;
      document.getElementById('btn-copy-settle').style.display = 'none';
      return;
    }

    document.getElementById('btn-copy-settle').style.display = '';
    const transfers = [];
    let i = 0, j = 0;
    const dCopy = debtors.map(d => ({ ...d }));
    const cCopy = creditors.map(c => ({ ...c }));

    while (i < dCopy.length && j < cCopy.length) {
      const pay = Math.min(dCopy[i].amount, cCopy[j].amount);
      transfers.push({ from: dCopy[i].name, to: cCopy[j].name, amount: pay });
      dCopy[i].amount -= pay;
      cCopy[j].amount -= pay;
      if (dCopy[i].amount === 0) i++;
      if (cCopy[j].amount === 0) j++;
    }

    planContainer.innerHTML = transfers.map(t => `
      <div class="settle-arrow-card">
        <div class="flex items-center gap-2" style="flex:1;min-width:0;">
          <i class="fa-solid fa-arrow-right-long" style="color:var(--teal-400);flex-shrink:0;"></i>
          <span class="settle-names"><b>${esc(t.from)}</b> → <b>${esc(t.to)}</b></span>
        </div>
        <span class="settle-amount">${sym}${fmtMoney(t.amount)}</span>
      </div>`).join('');

    // Store for copy function
    planContainer.dataset.transfers = JSON.stringify(transfers.map(t => ({
      ...t,
      sym,
    })));
  }

  // ── Stats ──
  function renderStats() {
    const s   = Store.settings();
    const exs = Store.expenses();

    const catTotals  = {};
    const payTotals  = {};
    let   grandTotal = 0;

    exs.forEach(e => {
      const rate   = e.currency === s.baseCurrency ? 1 : (parseFloat(s.exchangeRate) || 1);
      const base   = (parseFloat(e.amount) || 0) * rate;
      grandTotal  += base;
      catTotals[e.category]              = (catTotals[e.category] || 0) + base;
      const m = e.paymentMethod || '現金';
      payTotals[m] = (payTotals[m] || 0) + base;
    });

    const noData = `<p style="color:var(--text-muted);font-size:var(--fz-sm);text-align:center;padding:var(--sp-4);">暫無數據</p>`;

    // Category chart
    const catBox = document.getElementById('stats-categories');
    if (grandTotal === 0) {
      catBox.innerHTML = noData;
    } else {
      catBox.innerHTML = Object.entries(catTotals)
        .sort((a, b) => b[1] - a[1])
        .map(([cat, amt]) => {
          const pct = Math.round((amt / grandTotal) * 100);
          const meta = CATEGORY_META[cat] || CATEGORY_META['其他'];
          return `
            <div class="stat-bar-row">
              <div class="stat-bar-label">
                <span class="stat-bar-cat">${meta.icon} ${esc(cat)}</span>
                <span class="stat-bar-val">${currSym(s.baseCurrency)}${fmtMoney(Math.round(amt))} (${pct}%)</span>
              </div>
              <div class="stat-bar-track">
                <div class="stat-bar-fill" style="width:${pct}%"></div>
              </div>
            </div>`;
        }).join('');
    }

    // Payment method chart
    const payBox = document.getElementById('stats-payment');
    if (grandTotal === 0) {
      payBox.innerHTML = noData;
    } else {
      payBox.innerHTML = Object.entries(payTotals)
        .sort((a, b) => b[1] - a[1])
        .map(([method, amt]) => {
          const pct = Math.round((amt / grandTotal) * 100);
          return `
            <div class="stat-bar-row">
              <div class="stat-bar-label">
                <span class="stat-bar-cat">${esc(method)}</span>
                <span class="stat-bar-val">${currSym(s.baseCurrency)}${fmtMoney(Math.round(amt))} (${pct}%)</span>
              </div>
              <div class="stat-bar-track">
                <div class="stat-bar-fill fill-ocean" style="width:${pct}%"></div>
              </div>
            </div>`;
        }).join('');
    }
  }

  // ── Quick Links ──
  function renderLinks() {
    const trip = Store.currentTrip();
    const links = trip.links || [];
    const container = document.getElementById('links-list');
    const form = document.getElementById('form-add-link');
    const divider = document.getElementById('link-form-divider');
    if (!container) return;

    const canWrite = Store.canWrite();
    if (form) form.style.display = canWrite ? 'flex' : 'none';
    if (divider) divider.style.display = canWrite ? 'block' : 'none';

    if (links.length === 0) {
      container.innerHTML = `<p style="color:var(--text-muted);font-size:var(--fz-sm);text-align:center;padding:var(--sp-4);">目前沒有常用連結</p>`;
      return;
    }

    container.innerHTML = links.map(l => `
      <div class="member-balance-card" style="padding:var(--sp-2) var(--sp-4); align-items:center;">
        <a href="${esc(l.url)}" target="_blank" class="flex items-center gap-2 text-primary" style="flex:1;min-width:0;text-decoration:none;">
          <i class="fa-solid fa-arrow-up-right-from-square" style="color:var(--orange-400);font-size:13px;flex-shrink:0;"></i>
          <span class="truncate" style="font-weight:600;font-size:var(--fz-sm);">${esc(l.title)}</span>
        </a>
        ${canWrite ? `
          <button class="icon-btn" style="background:transparent;border:none;color:var(--text-muted);width:32px;height:32px;font-size:13px;" onclick="AppEvents.deleteLink('${esc(l.id)}')" aria-label="刪除" title="刪除">
            <i class="fa-solid fa-trash-can"></i>
          </button>
        ` : ''}
      </div>`).join('');
  }

  // ── Full Re-render ──
  function renderAll() {
    renderHeader();
    renderSummary();
    renderExpenseList();
    renderSettlement();
    renderStats();
    renderLinks();
  }

  return {
    esc, fmtMoney, currSym,
    renderTripDropdown, renderPasscodeDots,
    showLockScreen, hideLockScreen, checkTripNeedsPassword,
    renderHeader, renderSummary, renderExpenseList,
    renderSettlement, renderStats, renderAll,
    setCatFilter, renderLinks,
  };
})();

/* ═══════════════════════════════════════════════════════════
   DIALOG — Promise-based custom dialog
   ═══════════════════════════════════════════════════════════ */

const Dialog = (() => {
  let _resolve = null;

  function _open({ icon, iconColor, title, msg, inputs, okText, cancelText, isDanger }) {
    return new Promise(resolve => {
      _resolve = resolve;

      const modal  = document.getElementById('modal-dialog');
      const iconEl = document.getElementById('dialog-icon');
      const titleEl= document.getElementById('dialog-title');
      const msgEl  = document.getElementById('dialog-msg');
      const inputsEl=document.getElementById('dialog-inputs');
      const okBtn  = document.getElementById('btn-dialog-ok');
      const cancelBtn=document.getElementById('btn-dialog-cancel');

      iconEl.innerHTML  = `<i class="fa-solid ${icon || 'fa-circle-info'}" style="color:${iconColor || 'var(--orange-400)'};"></i>`;
      titleEl.textContent = title || '提示';
      msgEl.innerHTML   = msg   || '';

      // Clear old inputs
      inputsEl.innerHTML = '';
      inputsEl.style.display = 'none';
      if (inputs && inputs.length > 0) {
        inputsEl.style.display = '';
        inputs.forEach((inp, i) => {
          const field = document.createElement('input');
          field.type        = inp.type || 'text';
          field.placeholder = inp.placeholder || '';
          field.className   = 'form-input';
          field.id          = `dialog-inp-${i}`;
          if (inp.maxlength) field.maxLength = inp.maxlength;
          inputsEl.appendChild(field);
        });
        // Focus first input after opening
        setTimeout(() => {
          const first = document.getElementById('dialog-inp-0');
          if (first) first.focus();
        }, 320);
      }

      okBtn.textContent       = okText     || '確定';
      okBtn.className         = `btn flex-1 ${isDanger ? 'btn-danger' : 'btn-primary'}`;
      cancelBtn.textContent   = cancelText || '取消';
      cancelBtn.style.display = cancelText ? '' : 'none';

      modal.classList.add('is-open');
    });
  }

  function _close(value) {
    document.getElementById('modal-dialog').classList.remove('is-open');
    if (_resolve) _resolve(value);
    _resolve = null;
  }

  // Initialise buttons once
  document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('btn-dialog-ok').addEventListener('click', () => {
      // Collect input values
      const inputsEl = document.getElementById('dialog-inputs');
      const fields   = [...inputsEl.querySelectorAll('input')];
      const values   = fields.map(f => f.value.trim());
      _close({ ok: true, values });
    });

    document.getElementById('btn-dialog-cancel').addEventListener('click', () => {
      _close({ ok: false, values: [] });
    });
  });

  // Public shortcuts
  function alert(title, msg, iconClass = 'fa-circle-info', iconColor = 'var(--orange-400)') {
    return _open({ icon: iconClass, iconColor, title, msg, okText: '我知道了' });
  }

  function confirm(title, msg, isDanger = false) {
    return _open({
      icon: isDanger ? 'fa-triangle-exclamation' : 'fa-circle-question',
      iconColor: isDanger ? 'var(--danger)' : 'var(--orange-400)',
      title, msg, isDanger,
      okText: '確定', cancelText: '取消',
    });
  }

  function prompt(title, msg, inputs) {
    return _open({
      icon: 'fa-pen-to-square', iconColor: 'var(--orange-400)',
      title, msg, inputs,
      okText: '確定', cancelText: '取消',
    });
  }

  return { alert, confirm, prompt };
})();

/* ═══════════════════════════════════════════════════════════
   TOAST
   ═══════════════════════════════════════════════════════════ */

function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const icons = {
    success: 'fa-circle-check',
    error:   'fa-triangle-exclamation',
    warning: 'fa-circle-exclamation',
    info:    'fa-circle-info',
  };

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `
    <i class="fa-solid ${icons[type] || icons.info} toast-icon"></i>
    <div class="toast-msg">${UI.esc(message)}</div>`;

  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('toast-out');
    toast.addEventListener('animationend', () => toast.remove(), { once: true });
    // Fallback
    setTimeout(() => toast.remove(), 600);
  }, 3000);
}

/* ═══════════════════════════════════════════════════════════
   MODAL HELPERS
   ═══════════════════════════════════════════════════════════ */

function openModal(id)  { document.getElementById(id)?.classList.add('is-open'); }
function closeModal(id) { document.getElementById(id)?.classList.remove('is-open'); }

/* ═══════════════════════════════════════════════════════════
   EXPENSE FORM
   ═══════════════════════════════════════════════════════════ */

const ExpenseForm = (() => {
  function _populatePayerSelect() {
    const sel = document.getElementById('expense-paid-by');
    sel.innerHTML = '';
    Store.settings().members.forEach(m => {
      const opt = document.createElement('option');
      opt.value = opt.textContent = m;
      sel.appendChild(opt);
    });
  }

  function _populatePayMethodSelect() {
    const sel = document.getElementById('expense-pay-method');
    sel.innerHTML = '';
    const addOpt = (val, text) => {
      const opt = document.createElement('option');
      opt.value = val; opt.textContent = text;
      sel.appendChild(opt);
    };
    addOpt('現金', '💵 現金');
    const cards = Store.settings().creditCards || [];
    cards.forEach(c => addOpt(`信用卡(${c})`, `💳 ${c}`));
    addOpt('信用卡(其他)', '💳 其他信用卡');
    addOpt('IC卡/Pay', '📱 IC卡 / 街口 / LINE Pay');
  }

  function _renderSplitCheckboxes(preChecked = null) {
    const container = document.getElementById('split-checkboxes');
    container.innerHTML = '';
    const members = Store.settings().members;
    const checked = preChecked || members;

    members.forEach(m => {
      const isChecked = checked.includes(m);
      const label = document.createElement('label');
      label.className = `checkbox-item${isChecked ? ' is-checked' : ''}`;
      label.innerHTML = `
        <input type="checkbox" value="${UI.esc(m)}" ${isChecked ? 'checked' : ''}
          onchange="this.parentElement.classList.toggle('is-checked', this.checked)">
        <span>${UI.esc(m)}</span>`;
      container.appendChild(label);
    });
  }

  function _setAllChecked(val) {
    document.querySelectorAll('#split-checkboxes input[type=checkbox]').forEach(cb => {
      cb.checked = val;
      cb.parentElement.classList.toggle('is-checked', val);
    });
  }

  function _clearAttachment() {
    document.getElementById('expense-attachment-input').value = '';
    document.getElementById('expense-att-data').value = '';
    document.getElementById('expense-att-name').value = '';
    document.getElementById('expense-att-type').value = '';
    const prev = document.getElementById('attachment-preview');
    prev.style.display = 'none';
    prev.innerHTML = '';
  }

  function open(expense = null) {
    const isEdit = !!expense;
    document.getElementById('expense-modal-heading').textContent = isEdit ? '編輯消費' : '新增消費';
    document.getElementById('expense-id').value     = isEdit ? expense.id : '';
    document.getElementById('expense-amount').value = isEdit ? expense.amount : '';
    document.getElementById('expense-title').value  = isEdit ? expense.title : '';
    document.getElementById('expense-note').value   = isEdit ? (expense.note || '') : '';
    document.getElementById('expense-date').value   = isEdit ? expense.date : new Date().toISOString().split('T')[0];

    _populatePayerSelect();
    _populatePayMethodSelect();

    // Category
    const catBtns = document.querySelectorAll('#cat-selector .cat-btn');
    catBtns.forEach(btn => {
      btn.classList.toggle('active', btn.dataset.val === (isEdit ? expense.category : '餐飲'));
    });
    document.getElementById('expense-category').value = isEdit ? expense.category : '餐飲';

    // Currency
    if (isEdit) document.getElementById('expense-currency').value = expense.currency;

    // Payer
    if (isEdit) document.getElementById('expense-paid-by').value = expense.paidBy;

    // Payment method
    if (isEdit) {
      const methEl = document.getElementById('expense-pay-method');
      // Try to set value; if not found it'll stay at first
      setTimeout(() => { methEl.value = expense.paymentMethod; }, 0);
    }

    // Split
    const splitAll = document.getElementById('btn-split-all');
    const splitCus = document.getElementById('btn-split-custom');
    const members  = Store.settings().members;
    const preCheck = isEdit ? expense.splitWith : null;
    const isAllSplit = !preCheck || preCheck.length === members.length;

    splitAll.classList.toggle('active', isAllSplit);
    splitCus.classList.toggle('active', !isAllSplit);
    _renderSplitCheckboxes(preCheck || members);

    // Clear attachment
    _clearAttachment();

    // Restore attachment if editing
    if (isEdit && expense.attachmentData) {
      document.getElementById('expense-att-data').value = expense.attachmentData;
      document.getElementById('expense-att-name').value = expense.attachmentName || '';
      document.getElementById('expense-att-type').value = expense.attachmentType || '';
      _showAttachmentPreview(expense.attachmentData, expense.attachmentType, expense.attachmentName);
    }

    openModal('modal-expense');
    setTimeout(() => document.getElementById('expense-amount').focus(), 300);
  }

  function _showAttachmentPreview(data, type, name) {
    const container = document.getElementById('attachment-preview');
    container.style.display = '';
    const isImage = type && type.startsWith('image/');
    if (isImage) {
      container.innerHTML = `
        <div class="attachment-preview">
          <img src="${data}" alt="附件預覽">
          <button type="button" class="attachment-remove-btn" id="btn-remove-att" title="移除"><i class="fa-solid fa-xmark"></i></button>
        </div>`;
    } else {
      container.innerHTML = `
        <div class="attachment-preview" style="border:1px solid var(--glass-border-warm);border-radius:var(--r-xl);padding:var(--sp-4);">
          <div class="attachment-preview-file">
            <i class="fa-solid fa-file-lines" style="font-size:2.5rem;color:var(--orange-400);"></i>
            <span style="font-size:var(--fz-sm);color:var(--text-secondary);word-break:break-all;">${UI.esc(name)}</span>
          </div>
          <button type="button" class="attachment-remove-btn" id="btn-remove-att" title="移除" style="position:relative;top:0;right:0;margin-top:var(--sp-2);"><i class="fa-solid fa-xmark"></i> 移除</button>
        </div>`;
    }
    document.getElementById('btn-remove-att')?.addEventListener('click', () => {
      _clearAttachment();
    });
  }

  function save() {
    const id       = document.getElementById('expense-id').value;
    const currency = document.getElementById('expense-currency').value;
    const amount   = parseFloat(document.getElementById('expense-amount').value);
    const title    = document.getElementById('expense-title').value.trim();
    const category = document.getElementById('expense-category').value;
    const paidBy   = document.getElementById('expense-paid-by').value;
    const method   = document.getElementById('expense-pay-method').value;
    const date     = document.getElementById('expense-date').value;
    const note     = document.getElementById('expense-note').value.trim();

    const splitWith = [...document.querySelectorAll('#split-checkboxes input:checked')].map(cb => cb.value);

    // Validation
    if (!amount || amount <= 0) { showToast('請輸入有效金額！', 'warning'); return false; }
    if (!title)                 { showToast('請填寫消費名稱！', 'warning'); return false; }
    if (splitWith.length === 0) { showToast('請選擇至少一位分攤成員！', 'warning'); return false; }
    if (!date)                  { showToast('請選擇日期！', 'warning'); return false; }

    const expense = {
      currency, amount, title, category, paidBy,
      paymentMethod: method, date, note, splitWith,
      attachmentData: document.getElementById('expense-att-data').value,
      attachmentName: document.getElementById('expense-att-name').value,
      attachmentType: document.getElementById('expense-att-type').value,
    };

    let saved;
    if (id) {
      saved = Store.updateExpense(id, expense);
    } else {
      saved = Store.addExpense(expense);
    }

    if (saved) {
      closeModal('modal-expense');
      UI.renderAll();
      showToast(id ? '消費已更新' : '記帳成功！', 'success');
      Sync.push('add_expense', { expense: saved });
      return true;
    }
    return false;
  }

  // wire split toggle
  document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('btn-split-all').addEventListener('click', () => {
      document.getElementById('btn-split-all').classList.add('active');
      document.getElementById('btn-split-custom').classList.remove('active');
      _setAllChecked(true);
    });
    document.getElementById('btn-split-custom').addEventListener('click', () => {
      document.getElementById('btn-split-custom').classList.add('active');
      document.getElementById('btn-split-all').classList.remove('active');
    });

    // Category selector
    document.getElementById('cat-selector').addEventListener('click', e => {
      const btn = e.target.closest('.cat-btn');
      if (!btn) return;
      document.querySelectorAll('#cat-selector .cat-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('expense-category').value = btn.dataset.val;
    });

    // File upload
    const fileInput = document.getElementById('expense-attachment-input');
    document.getElementById('btn-upload-trigger').addEventListener('click', () => fileInput.click());
    document.getElementById('btn-upload-trigger').addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') fileInput.click();
    });

    fileInput.addEventListener('change', e => {
      const file = e.target.files[0];
      if (!file) return;
      if (file.size > 5 * 1024 * 1024) {
        showToast('附件大小不能超過 5MB！', 'warning');
        fileInput.value = '';
        return;
      }
      const reader = new FileReader();
      reader.onload = ev => {
        const data = ev.target.result;
        document.getElementById('expense-att-data').value = data;
        document.getElementById('expense-att-name').value = file.name;
        document.getElementById('expense-att-type').value = file.type;
        _showAttachmentPreview(data, file.type, file.name);
      };
      reader.readAsDataURL(file);
    });
  });

  return { open, save };
})();

/* ═══════════════════════════════════════════════════════════
   SETTINGS FORM
   ═══════════════════════════════════════════════════════════ */

const SettingsForm = (() => {
  function open() {
    if (!Store.isOwner()) {
      Dialog.alert(
        '權限不足',
        '🔒 您目前以【成員】身份登入，無法查看或修改設定。\n請使用擁有者密碼重新登入。',
        'fa-lock',
        'var(--warning)'
      );
      return;
    }
    const s = Store.settings();
    document.getElementById('s-trip-name').value      = s.tripName;
    document.getElementById('s-base-currency').value  = s.baseCurrency;
    document.getElementById('s-exchange-rate').value  = s.exchangeRate;
    document.getElementById('s-members').value        = s.members.join(', ');
    document.getElementById('s-owner-pwd').value      = s.ownerPassword || '';
    document.getElementById('s-member-pwd').value     = s.memberPassword || '';
    document.getElementById('s-cards').value          = (s.creditCards || []).join(', ');
    document.getElementById('s-gas-url').value        = Store.getGasUrl();
    openModal('modal-settings');
  }

  function save(closeModalAfter = true) {
    const parsedMembers = document.getElementById('s-members').value
      .split(/[,，]/).map(s => s.trim()).filter(Boolean);
    const parsedCards = document.getElementById('s-cards').value
      .split(/[,，]/).map(s => s.trim()).filter(Boolean);
    const ownerPwd  = document.getElementById('s-owner-pwd').value.trim();
    const memberPwd = document.getElementById('s-member-pwd').value.trim();

    // Validate passwords (must be 4 digits or empty)
    if (ownerPwd  && !/^\d{4}$/.test(ownerPwd))  { showToast('擁有者密碼必須為 4 位數字！', 'warning'); return; }
    if (memberPwd && !/^\d{4}$/.test(memberPwd))  { showToast('成員密碼必須為 4 位數字！', 'warning'); return; }

    Store.saveSettings({
      tripName:       document.getElementById('s-trip-name').value.trim() || '旅遊行程',
      baseCurrency:   document.getElementById('s-base-currency').value,
      exchangeRate:   parseFloat(document.getElementById('s-exchange-rate').value) || 1,
      members:        parsedMembers.length > 0 ? parsedMembers : ['我'],
      creditCards:    parsedCards,
      ownerPassword:  ownerPwd,
      memberPassword: memberPwd,
    });

    Store.saveGasUrl(document.getElementById('s-gas-url').value.trim());

    if (closeModalAfter) {
      closeModal('modal-settings');
    }
    UI.renderAll();
    showToast('設定已儲存', 'success');
    Sync.push('save_settings', { settings: Store.settings() });
  }

  document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('btn-copy-invite')?.addEventListener('click', () => {
      const url = document.getElementById('s-gas-url').value.trim();
      if (!url) {
        showToast('請先輸入並儲存雲端網址！', 'warning');
        return;
      }
      let param = url;
      const match = url.match(/\/s\/([^/]+)\/exec/);
      if (match) param = match[1];
      
      const inviteLink = `${window.location.origin}${window.location.pathname}?gas=${param}&trip=${Store.currentTripId}`;
      navigator.clipboard.writeText(inviteLink).then(() => {
        showToast('已複製邀請連結！傳給親友即可自動匯入', 'success');
      }).catch(() => {
        prompt('複製失敗，請手動複製以下網址：', '', [{value: inviteLink}]);
      });
    });
  });

  return { open, save };
})();

/* ═══════════════════════════════════════════════════════════
   SWIPE-TO-DELETE (Touch gesture)
   ═══════════════════════════════════════════════════════════ */

function attachSwipeDelete(card) {
  let startX = 0;
  let currentX = 0;
  let isDragging = false;

  card.addEventListener('touchstart', e => {
    startX = e.touches[0].clientX;
    isDragging = true;
    card.classList.add('is-swiping');
  }, { passive: true });

  card.addEventListener('touchmove', e => {
    if (!isDragging) return;
    currentX = e.touches[0].clientX;
    const diff = currentX - startX;
    if (diff < 0) {
      card.style.transform = `translateX(${Math.max(diff, -80)}px)`;
    }
  }, { passive: true });

  card.addEventListener('touchend', () => {
    isDragging = false;
    card.classList.remove('is-swiping');
    const diff = currentX - startX;
    if (diff < -60) {
      // Confirmed swipe-delete
      const id = card.dataset.id;
      card.style.transform = 'translateX(-80px)';
      AppEvents.deleteExpense(id);
    } else {
      card.style.transform = '';
    }
    startX = 0; currentX = 0;
  });
}

/* ═══════════════════════════════════════════════════════════
   CSV EXPORT
   ═══════════════════════════════════════════════════════════ */

function exportCSV() {
  const s   = Store.settings();
  const exs = Store.expenses();

  const header = ['日期', '名稱', '分類', '付款人', '付款方式', '幣別', '金額', `換算${s.baseCurrency}`, '分攤成員', '備註'];
  const rows   = exs.map(e => {
    const rate = e.currency === s.baseCurrency ? 1 : (parseFloat(s.exchangeRate) || 1);
    const base = Math.round((parseFloat(e.amount) || 0) * rate);
    return [
      e.date, e.title, e.category, e.paidBy, e.paymentMethod,
      e.currency, e.amount, base,
      (e.splitWith || []).join('|'),
      e.note || '',
    ];
  });

  const csv = [header, ...rows]
    .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    .join('\n');

  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href  = url;
  link.download = `${s.tripName}_expenses.csv`;
  link.click();
  URL.revokeObjectURL(url);
  showToast('CSV 已匯出！', 'success');
}

/* ═══════════════════════════════════════════════════════════
   APP EVENTS — Public event handler surface
   (exposed to inline HTML onclick attributes)
   ═══════════════════════════════════════════════════════════ */

const AppEvents = {
  deleteLink(id) {
    Dialog.confirm('刪除連結', '確定要刪除此常用連結嗎？', true).then(res => {
      if (!res.ok) return;
      if (Store.deleteLink(id)) {
        UI.renderLinks();
        showToast('連結已刪除', 'success');
        // also push settings to GAS since links is part of trip metadata
        Sync.push('save_settings', { settings: Store.settings(), links: Store.currentTrip().links });
      }
    });
  },

  deleteExpense(id) {
    Dialog.confirm('刪除確認', '確定要永久刪除這筆記帳紀錄嗎？', true).then(res => {
      if (!res.ok) return;
      if (Store.deleteExpense(id)) {
        UI.renderAll();
        showToast('已刪除', 'success');
        Sync.push('delete_expense', { id });
      }
    });
  },

  editExpense(id) {
    if (!Store.canWrite()) {
      Dialog.alert('無法編輯', '請先解鎖行程後再編輯消費。', 'fa-lock', 'var(--warning)');
      return;
    }
    const e = Store.expenses().find(ex => ex.id === id);
    if (!e) return;
    ExpenseForm.open(e);
  },

  viewAttachment(id) {
    const e = Store.expenses().find(ex => ex.id === id);
    if (!e || !e.attachmentData) return;

    const viewer   = document.getElementById('media-viewer');
    const title    = document.getElementById('viewer-filename');
    const content  = document.getElementById('viewer-content');
    const download = document.getElementById('viewer-download');

    title.textContent   = e.attachmentName || '附件';
    download.href       = e.attachmentData;
    download.download   = e.attachmentName || 'attachment';
    content.innerHTML   = '';

    if (e.attachmentType && e.attachmentType.startsWith('image/')) {
      const img = document.createElement('img');
      img.src = e.attachmentData;
      content.appendChild(img);
    } else {
      content.innerHTML = `
        <div style="text-align:center;color:white;">
          <i class="fa-solid fa-file-lines" style="font-size:4rem;color:var(--orange-400);margin-bottom:var(--sp-4);display:block;"></i>
          <div style="font-size:var(--fz-md);font-weight:500;">${UI.esc(e.attachmentName)}</div>
          <div style="font-size:var(--fz-sm);color:var(--text-secondary);margin-top:var(--sp-2);">${UI.esc(e.attachmentType)}</div>
        </div>`;
    }

    viewer.classList.add('is-open');
  },
};

/* ═══════════════════════════════════════════════════════════
   PASSCODE CONTROLLER
   ═══════════════════════════════════════════════════════════ */

const Passcode = (() => {
  let buffer = '';
  let loginRole = 'owner'; // default to owner (admin)

  function reset() {
    buffer = '';
    loginRole = 'owner';
    // Reset toggle UI
    document.querySelectorAll('#login-role-toggle button').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.role === 'owner');
    });
    UI.renderPasscodeDots(0);
    document.getElementById('passcode-error').textContent = '';
  }

  function setLoginRole(role) {
    loginRole = role;
    buffer = '';
    document.querySelectorAll('#login-role-toggle button').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.role === role);
    });
    UI.renderPasscodeDots(0);
    document.getElementById('passcode-error').textContent = '';
  }

  function push(digit) {
    if (buffer.length >= 4) return;
    buffer += digit;
    UI.renderPasscodeDots(buffer.length);
    if (buffer.length === 4) {
      setTimeout(verify, 100);
    }
  }

  function pop() {
    if (buffer.length === 0) return;
    buffer = buffer.slice(0, -1);
    UI.renderPasscodeDots(buffer.length);
    document.getElementById('passcode-error').textContent = '';
  }

  function clear() {
    buffer = '';
    UI.renderPasscodeDots(0);
    document.getElementById('passcode-error').textContent = '';
  }

  function verify() {
    const role = Auth.verifyPasscode(buffer, loginRole);
    if (role) {
      Store.unlock(role);
      UI.hideLockScreen();
      UI.renderAll();
      showToast(`歡迎！以「${role === 'owner' ? '管理者' : '成員'}」身份登入`, 'success');
      if (Store.getGasUrl()) Sync.pull();
      buffer = '';
    } else {
      // Shake and show error
      const dots = document.getElementById('passcode-dots');
      dots.style.animation = 'shake 0.35s ease';
      document.getElementById('passcode-error').textContent = '❌ 密碼錯誤，請重試';
      if (navigator.vibrate) navigator.vibrate([80, 40, 80]);
      setTimeout(() => {
        dots.style.animation = '';
        buffer = '';
        UI.renderPasscodeDots(0);
      }, 350);
    }
  }

  return { reset, push, pop, clear, setLoginRole };
})();

/* ═══════════════════════════════════════════════════════════
   INIT — Wire everything together
   ═══════════════════════════════════════════════════════════ */

document.addEventListener('DOMContentLoaded', () => {
  // 1. Bootstrap store
  Store.init();

  // 1.5 Auto-import from URL (for easy sharing)
  const params = new URLSearchParams(window.location.search);
  const importGas = params.get('gas');
  const importTrip = params.get('trip');
  
  if (importGas) {
    const fullUrl = importGas.startsWith('http') ? importGas : `https://script.google.com/macros/s/${importGas}/exec`;
    Store.saveGasUrl(fullUrl);
    window.history.replaceState({}, document.title, window.location.pathname);
    
    // Lock screen UI to member by default for invite links
    if (importTrip) {
      Passcode.setLoginRole('member');
      const ownerBtn = document.querySelector('.split-toggle-btn[data-role="owner"]');
      if (ownerBtn) ownerBtn.style.display = 'none';
      const tripSelector = document.getElementById('select-trip');
      if (tripSelector) tripSelector.disabled = true;
    }
    
    Sync.pull().then(() => {
      if (importTrip) {
        Store.selectTrip(importTrip);
      }
      UI.renderTripDropdown();
      showToast('已透過連結自動載入專屬行程', 'success');
      UI.checkTripNeedsPassword();
    });
  } else {
    // 2. Show lock screen or auto-unlock if no import URL
    UI.checkTripNeedsPassword();
  }

  // 3. Lock screen events
  document.getElementById('btn-sync-cloud-lock')?.addEventListener('click', async () => {
    const res = await Dialog.prompt('從雲端匯入', '請輸入您的 Google Apps Script 網址：', [{ placeholder: 'https://script.google.com/macros/s/.../exec' }]);
    if (res.ok && res.values[0]) {
      Store.saveGasUrl(res.values[0].trim());
      await Sync.pull();
      UI.renderTripDropdown();
      showToast('行程已從雲端更新', 'success');
    }
  });

  // ── Passcode keypad ──
  document.querySelectorAll('.keypad-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const val = btn.dataset.val;
      if (val === 'del')   Passcode.pop();
      else if (val === 'clear') Passcode.clear();
      else Passcode.push(val);
    });
  });

  // ── Trip selector on lock screen ──
  document.getElementById('select-trip').addEventListener('change', e => {
    Store.selectTrip(e.target.value);
    Passcode.reset();
    // If new trip is open, skip lock
    UI.checkTripNeedsPassword();
  });

  // ── Login Role Toggle ──
  document.getElementById('login-role-toggle')?.addEventListener('click', e => {
    const btn = e.target.closest('.split-toggle-btn');
    if (!btn) return;
    document.querySelectorAll('#login-role-toggle .split-toggle-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    Passcode.setLoginRole(btn.dataset.role);
  });

  // ── Create new trip (accessible only from Admin Settings) ──
  document.getElementById('btn-settings-create-trip')?.addEventListener('click', async () => {
    const res = await Dialog.prompt(
      '建立新旅遊行程',
      '請填寫新行程名稱與密碼設定：',
      [
        { type: 'text',     placeholder: '新行程名稱（如：大阪自由行 🍡）' },
        { type: 'password', placeholder: `管理者密碼（預設 ${DEFAULT_OWNER_PWD}）`, maxlength: 4 },
        { type: 'password', placeholder: `一般成員密碼（預設 ${DEFAULT_MEMBER_PWD}）`, maxlength: 4 },
      ]
    );
    if (!res.ok) return;
    const [name, newOwnerPwd, newMemberPwd] = res.values;

    if (!name.trim()) { showToast('行程名稱不能為空！', 'warning'); return; }

    const trip = Store.addTrip(name.trim(), newOwnerPwd || DEFAULT_OWNER_PWD, newMemberPwd || DEFAULT_MEMBER_PWD);
    
    // Auto switch and unlock as owner
    Store.unlock('owner');
    closeModal('modal-settings');
    UI.renderTripDropdown();
    UI.hideLockScreen();
    UI.renderAll();
    Passcode.reset();
    showToast(`✅ 行程「${trip.settings.tripName}」建立成功！`, 'success');
  });

  // ── Lock / Go Home ──
  document.getElementById('btn-go-home').addEventListener('click', () => {
    Store.lockout();
    UI.showLockScreen();
    showToast('已返回首頁', 'info');
  });

  // ── Tab switching ──
  document.querySelectorAll('#bottom-nav .nav-item[data-tab]').forEach(btn => {
    btn.addEventListener('click', () => {
      const tabId = btn.dataset.tab;
      document.querySelectorAll('#bottom-nav .nav-item').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(tabId)?.classList.add('active');
    });
  });

  // ── Quick settle button ──
  document.getElementById('btn-settle').addEventListener('click', () => {
    document.querySelectorAll('#bottom-nav .nav-item').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    const settleBtn = document.querySelector('[data-tab="tab-settlement"]');
    if (settleBtn) settleBtn.classList.add('active');
    document.getElementById('tab-settlement')?.classList.add('active');
  });

  // ── Category filter ──
  document.getElementById('filter-bar').addEventListener('click', e => {
    const chip = e.target.closest('.filter-chip');
    if (!chip) return;
    document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    UI.setCatFilter(chip.dataset.cat);
    UI.renderExpenseList();
  });

  // ── FAB: open expense form ──
  document.getElementById('fab-add').addEventListener('click', () => {
    if (!Store.canWrite()) {
      Dialog.alert('無法新增', '請先解鎖行程後再新增消費。', 'fa-lock', 'var(--warning)');
      return;
    }
    ExpenseForm.open();
  });

  // ── Expense modal close/cancel ──
  document.getElementById('btn-close-expense').addEventListener('click', () => closeModal('modal-expense'));
  document.getElementById('btn-cancel-expense').addEventListener('click', () => closeModal('modal-expense'));

  // ── Expense form submit ──
  document.getElementById('form-expense').addEventListener('submit', e => {
    e.preventDefault();
    ExpenseForm.save();
  });

  // ── Settings ──
  document.getElementById('btn-open-settings').addEventListener('click', () => SettingsForm.open());
  document.getElementById('btn-nav-settings').addEventListener('click', () => SettingsForm.open());
  document.getElementById('btn-close-settings').addEventListener('click', () => closeModal('modal-settings'));

  // ── Settings apply and save ──
  document.getElementById('btn-apply-settings')?.addEventListener('click', () => SettingsForm.save(false));
  document.getElementById('btn-save-settings')?.addEventListener('click', () => SettingsForm.save(true));

  // ── Delete current trip ──
  document.getElementById('btn-delete-trip').addEventListener('click', async () => {
    const name = Store.settings().tripName;
    const res  = await Dialog.confirm(
      '刪除行程',
      `⚠️ 確定要永久刪除行程「${name}」及所有消費紀錄嗎？此操作無法復原！`,
      true
    );
    if (!res.ok) return;
    closeModal('modal-settings');
    const deletedId = Store.deleteCurrentTrip();
    UI.showLockScreen();
    showToast(`行程「${name}」已刪除`, 'success');
    
    // Tell cloud to delete it too
    Sync.push('delete_trip', { deletedTripId: deletedId });
  });

  // ── Sync now ──
  document.getElementById('btn-sync-now').addEventListener('click', () => {
    Sync.pull().then(() => showToast('同步完成', 'success'));
  });

  // ── Export CSV ──
  document.getElementById('btn-export-csv').addEventListener('click', exportCSV);

  // ── Copy settlement ──
  document.getElementById('btn-copy-settle').addEventListener('click', () => {
    const plan = document.getElementById('settlement-plan');
    try {
      const transfers = JSON.parse(plan.dataset.transfers || '[]');
      if (transfers.length === 0) return;
      const text = transfers
        .map(t => `${t.from} → ${t.to}：${t.sym}${t.amount}`)
        .join('\n');
      navigator.clipboard.writeText(text).then(() => showToast('結算結果已複製！', 'success'));
    } catch { showToast('複製失敗', 'error'); }
  });

  // ── Media viewer close ──
  document.getElementById('btn-close-viewer').addEventListener('click', () => {
    document.getElementById('media-viewer').classList.remove('is-open');
  });

  // ── Quick Links ──
  document.getElementById('btn-open-links')?.addEventListener('click', () => {
    UI.renderLinks();
    openModal('modal-links');
  });
  document.getElementById('btn-close-links')?.addEventListener('click', () => closeModal('modal-links'));

  document.getElementById('form-add-link')?.addEventListener('submit', e => {
    e.preventDefault();
    const titleEl = document.getElementById('link-title');
    const urlEl   = document.getElementById('link-url');
    const title   = titleEl.value.trim();
    let url       = urlEl.value.trim();

    if (!title) { showToast('請輸入連結名稱！', 'warning'); return; }
    if (!url)   { showToast('請輸入網址！', 'warning'); return; }

    // Auto prepend https if missing
    if (!/^https?:\/\//i.test(url)) {
      url = 'https://' + url;
    }

    if (Store.addLink(title, url)) {
      titleEl.value = '';
      urlEl.value   = '';
      UI.renderLinks();
      showToast('常用連結已新增！', 'success');
      // Push settings metadata to GAS
      Sync.push('save_settings', { settings: Store.settings(), links: Store.currentTrip().links });
    }
  });

  // ── Backdrop click to close modals ──
  ['modal-expense', 'modal-settings', 'modal-links'].forEach(id => {
    document.getElementById(id)?.addEventListener('click', e => {
      if (e.target === document.getElementById(id)) closeModal(id);
    });
  });

  // ── Pull cloud data if GAS URL is set ──
  if (Store.getGasUrl() && Store.canWrite()) {
    Sync.pull();
  }
});
