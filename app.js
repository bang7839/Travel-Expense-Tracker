/**
 * TravelPay - 旅遊記帳前端核心 Logic (app.js) - 多行程支援版
 */

// 預設單一行程結構
const CREATE_DEFAULT_TRIP = (id = "trip_tokyo", name = "東京快樂之旅 🎌", ownerPwd = "1234", memberPwd = "0000") => ({
  id: id,
  settings: {
    tripName: name,
    baseCurrency: "TWD",
    foreignCurrency: "JPY",
    exchangeRate: 0.215, // 1 JPY = 0.215 TWD
    members: ["小明", "小美", "阿強"],
    creditCards: ["玉山FlyGo", "富邦J卡", "國泰CUBE", "吉鶴卡"],
    ownerPassword: ownerPwd,  // 擁有者密碼 (可改設定/刪行程/建行程)
    memberPassword: memberPwd  // 成員密碼 (僅能看帳與記帳)
  },
  expenses: []
});

// 全域 State
let globalGasUrl = localStorage.getItem("travelpay_global_gas_url") || "";
let tripsStore = {};
let currentTripId = "trip_tokyo";

let appState = {
  settings: null,
  expenses: [],
  currentCategoryFilter: "all",
  activeTab: "tab-records",
  isUnlocked: false,
  currentUserRole: "guest" // "owner" | "member" | "guest"
};

// 初始化 App
document.addEventListener("DOMContentLoaded", () => {
  loadLocalStorage();
  renderTripSelectDropdown();
  initEventListeners();
  checkPasswordLockStatus();

  // 設定預設日期為今天
  document.getElementById("expense-date").value = new Date().toISOString().split("T")[0];
});

// 1. 本地 LocalStorage 管理 (多行程)
function loadLocalStorage() {
  const savedTrips = localStorage.getItem("travelpay_trips_store");
  const savedCurrentId = localStorage.getItem("travelpay_current_trip_id");

  if (savedTrips) {
    try {
      tripsStore = JSON.parse(savedTrips);
    } catch(e) {
      tripsStore = {};
    }
  }

  // 自動去重 (刪除重複名稱的預設 Sample 行程)
  const uniqueStore = {};
  const seenNames = new Set();
  Object.keys(tripsStore).forEach(id => {
    const name = tripsStore[id].settings ? tripsStore[id].settings.tripName : "";
    if (!name || !seenNames.has(name)) {
      if (name) seenNames.add(name);
      uniqueStore[id] = tripsStore[id];
    }
  });
  tripsStore = uniqueStore;

  // 若去重後完全無行程，初始化一個預設行程
  if (Object.keys(tripsStore).length === 0) {
    const defaultTrip = CREATE_DEFAULT_TRIP();
    tripsStore[defaultTrip.id] = defaultTrip;
  }

  // 移轉舊單行程資料（相容性）
  const oldSettings = localStorage.getItem("travelpay_settings");
  const oldExpenses = localStorage.getItem("travelpay_expenses");
  if (oldSettings && !savedTrips) {
    const parsed = JSON.parse(oldSettings);
    tripsStore["trip_default"] = {
      id: "trip_default",
      settings: parsed,
      expenses: oldExpenses ? JSON.parse(oldExpenses) : []
    };
    currentTripId = "trip_default";
  } else if (savedCurrentId && tripsStore[savedCurrentId]) {
    currentTripId = savedCurrentId;
  } else {
    currentTripId = Object.keys(tripsStore)[0];
  }

  activeTrip(currentTripId);
}

function activeTrip(tripId) {
  if (!tripsStore[tripId]) return;
  currentTripId = tripId;

  // 移轉單密碼 -> 雙層密碼 (向下相容)
  if (tripsStore[tripId].settings.appPassword !== undefined) {
    const oldPwd = tripsStore[tripId].settings.appPassword;
    tripsStore[tripId].settings.ownerPassword = oldPwd || "1234";
    tripsStore[tripId].settings.memberPassword = "0000";
    delete tripsStore[tripId].settings.appPassword;
  }

  appState.settings = tripsStore[tripId].settings;
  appState.expenses = tripsStore[tripId].expenses || [];
  localStorage.setItem("travelpay_current_trip_id", currentTripId);
}

function saveLocalStorage() {
  if (tripsStore[currentTripId]) {
    tripsStore[currentTripId].settings = appState.settings;
    tripsStore[currentTripId].expenses = appState.expenses;
  }
  localStorage.setItem("travelpay_trips_store", JSON.stringify(tripsStore));
  localStorage.setItem("travelpay_current_trip_id", currentTripId);
  localStorage.setItem("travelpay_global_gas_url", globalGasUrl);
}

// 登入畫面渲染行程選單
function renderTripSelectDropdown() {
  const select = document.getElementById("select-login-trip");
  select.innerHTML = "";

  Object.values(tripsStore).forEach(trip => {
    const opt = document.createElement("option");
    opt.value = trip.id;
    const hasLock = trip.settings.ownerPassword || trip.settings.memberPassword;
    opt.textContent = `${trip.settings.tripName} ${hasLock ? '🔒' : '🔓'}`;
    if (trip.id === currentTripId) {
      opt.selected = true;
    }
    select.appendChild(opt);
  });
}

function checkPasswordLockStatus() {
  const lockOverlay = document.getElementById("lock-screen");
  const appContainer = document.getElementById("app");

  renderTripSelectDropdown();

  const hasOwnerPwd = !!appState.settings.ownerPassword;
  const hasMemberPwd = !!appState.settings.memberPassword;

  if (!hasOwnerPwd && !hasMemberPwd) {
    // 該行程未設置任何密碼，預設為擁有者全權存取
    appState.isUnlocked = true;
    appState.currentUserRole = "owner";
    lockOverlay.classList.add("unlocked");
    appContainer.classList.remove("app-locked");
    renderApp();
    if (globalGasUrl) syncFromGoogleSheets();
  } else {
    // 需解鎖
    appState.isUnlocked = false;
    appState.currentUserRole = "guest";
    lockOverlay.classList.remove("unlocked");
    appContainer.classList.add("app-locked");
  }
}

// 2. Google Apps Script 雲端同步 (使用全域 API 網址)
async function syncFromGoogleSheets() {
  const baseUrl = globalGasUrl || appState.settings.gasUrl;
  if (!baseUrl) return;

  const url = `${baseUrl}?tripId=${encodeURIComponent(currentTripId)}`;

  updateSyncStatus("loading", "同步中...");
  try {
    const res = await fetch(url);
    const data = await res.json();
    
    if (data.success) {
      if (data.expenses && data.expenses.length > 0) {
        appState.expenses = data.expenses;
      }
      if (data.settings) {
        appState.settings = { ...appState.settings, ...data.settings };
      }
      saveLocalStorage();
      renderApp();
      updateSyncStatus("online", "雲端已同步");
    }
  } catch (err) {
    console.error("GAS Sync Error:", err);
    updateSyncStatus("offline", "同步失敗 (使用本地)");
  }
}

async function sendToGoogleSheets(action, payload) {
  const url = globalGasUrl || appState.settings.gasUrl;
  if (!url) return;

  try {
    updateSyncStatus("loading", "更新雲端...");
    await fetch(url, {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, tripId: currentTripId, ...payload })
    });
    updateSyncStatus("online", "雲端已更新");
  } catch (err) {
    console.error("Post Error:", err);
    updateSyncStatus("offline", "僅存於本地");
  }
}

function updateSyncStatus(type, text) {
  const el = document.getElementById("sync-status-indicator");
  if (type === "online") {
    el.className = "status-online";
    el.innerHTML = `<i class="fa-solid fa-cloud-check"></i> ${text}`;
  } else if (type === "loading") {
    el.className = "status-offline";
    el.innerHTML = `<i class="fa-solid fa-arrows-rotate fa-spin"></i> ${text}`;
  } else {
    el.className = "status-offline";
    el.innerHTML = `<i class="fa-solid fa-cloud-slash"></i> ${text}`;
  }
}

// 3. UI 渲染引擎
function renderApp() {
  // 渲染頂部資訊
  document.getElementById("display-trip-name").textContent = appState.settings.tripName;
  document.getElementById("trip-badge-currency").textContent = appState.settings.baseCurrency;

  // 計算金額總計
  let totalBase = 0;
  let totalForeign = 0;

  appState.expenses.forEach(item => {
    const amt = parseFloat(item.amount) || 0;
    if (item.currency === appState.settings.baseCurrency) {
      totalBase += amt;
    } else {
      totalForeign += amt;
      totalBase += amt * (appState.settings.exchangeRate || 1);
    }
  });

  document.getElementById("total-expense-base").textContent = `$${Math.round(totalBase).toLocaleString()}`;
  document.getElementById("total-expense-foreign").textContent = `¥${Math.round(totalForeign).toLocaleString()}`;

  // 根據 Tab 渲染內容
  renderExpenseList();
  renderSettlement();
  renderStats();
}

function renderExpenseList() {
  const container = document.getElementById("expense-list-container");
  container.innerHTML = "";

  const filter = appState.currentCategoryFilter;
  const filtered = filter === "all" 
    ? appState.expenses 
    : appState.expenses.filter(x => x.category === filter);

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <i class="fa-solid fa-receipt"></i>
        <p>尚無記帳紀錄</p>
        <small>點擊下方「＋」新增第一筆消費</small>
      </div>`;
    return;
  }

  // 依日期倒序排列
  const sorted = [...filtered].sort((a, b) => new Date(b.date) - new Date(a.date));

  sorted.forEach(item => {
    const card = document.createElement("div");
    card.className = "expense-card";

    const catIconMap = {
      "餐飲": "🍔", "交通": "🚗", "住宿": "🏨", 
      "購物": "🛍️", "門票": "🎟️", "其他": "🎈"
    };

    const currencySymbol = item.currency === "JPY" ? "¥" : "$";
    const convertedText = item.currency !== appState.settings.baseCurrency 
      ? `(約 NT$${Math.round(item.amount * appState.settings.exchangeRate)})`
      : "";

    const hasAttachment = !!item.attachmentData;
    const isImage = item.attachmentType && item.attachmentType.startsWith("image/");
    const attachmentBtnHtml = hasAttachment 
      ? `<button type="button" class="btn-attachment-badge" onclick="viewAttachment('${item.id}')" title="點擊檢視附件">
          <i class="fa-solid ${isImage ? 'fa-image' : 'fa-paperclip'}"></i> ${isImage ? '相片' : '附件'}
         </button>` 
      : "";

    card.innerHTML = `
      <div class="expense-left">
        <div class="cat-icon">${catIconMap[item.category] || "💸"}</div>
        <div class="expense-info">
          <div class="title">${escapeHtml(item.title)} ${attachmentBtnHtml}</div>
          <div class="meta">
            <span>${item.date}</span>
            <span>• ${escapeHtml(item.paidBy)} 付款</span>
            <span class="badge-pay-method">${escapeHtml(item.paymentMethod || '現金')}</span>
          </div>
          ${item.note ? `<div class="expense-note-text"><i class="fa-regular fa-sticky-note"></i> ${escapeHtml(item.note)}</div>` : ''}
        </div>
      </div>
      <div class="expense-right">
        <div class="expense-amount-main">${currencySymbol}${Number(item.amount).toLocaleString()}</div>
        <div class="expense-amount-sub">${convertedText}</div>
      </div>
      <button class="btn-delete-item" onclick="deleteExpense('${item.id}')" title="刪除">
        <i class="fa-solid fa-trash-can"></i>
      </button>
    `;
    container.appendChild(card);
  });
}

// 結算試算演算法
function renderSettlement() {
  const members = appState.settings.members;
  const balances = {};
  members.forEach(m => balances[m] = 0);

  // 計算每個人支付與應付的淨額 (統一換算為 Base Currency)
  appState.expenses.forEach(item => {
    const rate = item.currency === appState.settings.baseCurrency ? 1 : appState.settings.exchangeRate;
    const amountInBase = item.amount * rate;
    
    // 付款者 +金額
    if (balances[item.paidBy] !== undefined) {
      balances[item.paidBy] += amountInBase;
    }

    // 分攤者 -金額
    const splitWith = (item.splitWith && item.splitWith.length > 0) ? item.splitWith : members;
    const share = amountInBase / splitWith.length;
    splitWith.forEach(m => {
      if (balances[m] !== undefined) {
        balances[m] -= share;
      }
    });
  });

  // 渲染個人收支概況
  const balanceContainer = document.getElementById("members-balance-list");
  balanceContainer.innerHTML = "";
  members.forEach(m => {
    const net = balances[m] || 0;
    const isPos = net >= 0;
    const div = document.createElement("div");
    div.className = "member-balance-item";
    div.innerHTML = `
      <span>${escapeHtml(m)}</span>
      <span class="${isPos ? 'balance-positive' : 'balance-negative'}">
        ${isPos ? '應收' : '應付'} $${Math.abs(Math.round(net)).toLocaleString()}
      </span>
    `;
    balanceContainer.appendChild(div);
  });

  // 最小化轉帳次數演算法 (Greedy Settlement Algorithm)
  const debtors = [];   // 應付者 (負數)
  const creditors = []; // 應收者 (正數)

  Object.keys(balances).forEach(m => {
    const val = Math.round(balances[m]);
    if (val < -1) debtors.push({ name: m, amount: -val });
    else if (val > 1) creditors.push({ name: m, amount: val });
  });

  const suggestionsContainer = document.getElementById("settlement-suggestions");
  suggestionsContainer.innerHTML = "";

  if (debtors.length === 0 && creditors.length === 0) {
    suggestionsContainer.innerHTML = `<p style="color:var(--text-muted); font-size:0.85rem;">大家都結清囉！目前無須補繳。</p>`;
    return;
  }

  let i = 0, j = 0;
  while (i < debtors.length && j < creditors.length) {
    const payAmt = Math.min(debtors[i].amount, creditors[j].amount);
    
    const div = document.createElement("div");
    div.className = "suggestion-item";
    div.innerHTML = `
      <span><b>${escapeHtml(debtors[i].name)}</b> 應給 <b>${escapeHtml(creditors[j].name)}</b></span>
      <span style="font-weight:800; color:var(--accent);">$${Math.round(payAmt).toLocaleString()} NTD</span>
    `;
    suggestionsContainer.appendChild(div);

    debtors[i].amount -= payAmt;
    creditors[j].amount -= payAmt;

    if (debtors[i].amount === 0) i++;
    if (creditors[j].amount === 0) j++;
  }
}

// 統計圖表渲染 (CSS 條狀圖)
function renderStats() {
  const catTotal = {};
  const payMethodTotal = {};
  let grandTotal = 0;

  appState.expenses.forEach(item => {
    const rate = item.currency === appState.settings.baseCurrency ? 1 : appState.settings.exchangeRate;
    const baseAmt = item.amount * rate;
    grandTotal += baseAmt;

    catTotal[item.category] = (catTotal[item.category] || 0) + baseAmt;
    const method = item.paymentMethod || "現金";
    payMethodTotal[method] = (payMethodTotal[method] || 0) + baseAmt;
  });

  // 分類圖表
  const catBox = document.getElementById("category-chart-container");
  catBox.innerHTML = grandTotal === 0 ? `<p class="help-text">暫無數據</p>` : "";

  Object.keys(catTotal).forEach(cat => {
    const amt = catTotal[cat];
    const pct = Math.round((amt / grandTotal) * 100);
    const row = document.createElement("div");
    row.className = "chart-bar-row";
    row.innerHTML = `
      <div class="chart-bar-label">
        <span>${cat}</span>
        <span>$${Math.round(amt).toLocaleString()} (${pct}%)</span>
      </div>
      <div class="chart-bar-track">
        <div class="chart-bar-fill" style="width: ${pct}%;"></div>
      </div>
    `;
    catBox.appendChild(row);
  });

  // 付款方式圖表
  const payBox = document.getElementById("payment-method-chart-container");
  payBox.innerHTML = grandTotal === 0 ? `<p class="help-text">暫無數據</p>` : "";

  Object.keys(payMethodTotal).forEach(method => {
    const amt = payMethodTotal[method];
    const pct = Math.round((amt / grandTotal) * 100);
    const row = document.createElement("div");
    row.className = "chart-bar-row";
    row.innerHTML = `
      <div class="chart-bar-label">
        <span>${method}</span>
        <span>$${Math.round(amt).toLocaleString()} (${pct}%)</span>
      </div>
      <div class="chart-bar-track">
        <div class="chart-bar-fill" style="width: ${pct}%; background: var(--accent-orange);"></div>
      </div>
    `;
    payBox.appendChild(row);
  });
}

// 4. 事件監聽設定 (Event Listeners)
function initEventListeners() {
  // 切換選取的行程
  document.getElementById("select-login-trip").addEventListener("change", (e) => {
    const selectedId = e.target.value;
    activeTrip(selectedId);
    document.getElementById("input-lock-password").value = "";
    document.getElementById("lock-error-msg").textContent = "";
    checkPasswordLockStatus();
  });

  // 登入解鎖表單送出
  document.getElementById("form-login").addEventListener("submit", (e) => {
    e.preventDefault();
    const inputPwd = document.getElementById("input-lock-password").value.trim();
    const errorEl = document.getElementById("lock-error-msg");

    const ownerPwd = appState.settings.ownerPassword || "1234";
    const memberPwd = appState.settings.memberPassword || "0000";

    if (inputPwd === ownerPwd) {
      appState.isUnlocked = true;
      appState.currentUserRole = "owner";
      unlockAppUI();
    } else if (inputPwd === memberPwd) {
      appState.isUnlocked = true;
      appState.currentUserRole = "member";
      unlockAppUI();
    } else {
      errorEl.textContent = "❌ 密碼錯誤！請輸入擁有者密碼 (預設1234) 或成員密碼 (預設0000)";
      document.getElementById("input-lock-password").select();
    }
  });

  function unlockAppUI() {
    document.getElementById("lock-screen").classList.add("unlocked");
    document.getElementById("app").classList.remove("app-locked");
    document.getElementById("lock-error-msg").textContent = "";
    document.getElementById("input-lock-password").value = "";
    renderApp();

    if (globalGasUrl) {
      syncFromGoogleSheets();
    }
  }

  // 建立新行程
  document.getElementById("btn-create-new-trip-login").addEventListener("click", async () => {
    const res = await showCreateTripModal();
    if (!res || !res.name) return;

    const newId = `trip_${Date.now()}`;
    const newTrip = CREATE_DEFAULT_TRIP(newId, res.name, res.pwd, "0000");
    
    tripsStore[newId] = newTrip;
    activeTrip(newId);
    saveLocalStorage();
    
    renderTripSelectDropdown();
    checkPasswordLockStatus();

    showCustomAlert("建立成功", `🎉 成功建立行程「${res.name}」！`, "fa-circle-check", "var(--accent)");
  });

  // 手動鎖定 / 返回首頁
  document.getElementById("btn-lock-app").addEventListener("click", () => {
    appState.isUnlocked = false;
    appState.currentUserRole = "guest";
    checkPasswordLockStatus();
  });

  // 密碼顯示/隱藏切換
  document.getElementById("btn-toggle-pwd").addEventListener("click", () => {
    const input = document.getElementById("input-lock-password");
    const icon = document.querySelector("#btn-toggle-pwd i");
    if (input.type === "password") {
      input.type = "text";
      icon.className = "fa-regular fa-eye-slash";
    } else {
      input.type = "password";
      icon.className = "fa-regular fa-eye";
    }
  });

  // Tab 切換
  document.querySelectorAll(".bottom-nav .nav-item[data-tab]").forEach(btn => {
    btn.addEventListener("click", () => {
      const tabId = btn.dataset.tab;
      switchTab(tabId);
    });
  });

  document.getElementById("btn-quick-settle").addEventListener("click", () => {
    switchTab("tab-settlement");
  });

  // Category 過濾晶片
  document.querySelectorAll(".filter-chip").forEach(chip => {
    chip.addEventListener("click", () => {
      document.querySelectorAll(".filter-chip").forEach(c => c.classList.remove("active"));
      chip.classList.add("active");
      appState.currentCategoryFilter = chip.dataset.cat;
      renderExpenseList();
    });
  });

  // 開啟 / 關閉 Modal
  const modalExpense = document.getElementById("modal-expense");
  const modalSettings = document.getElementById("modal-settings");

  document.getElementById("btn-add-expense").addEventListener("click", () => {
    openAddExpenseModal();
  });
  document.getElementById("btn-close-expense-modal").addEventListener("click", () => {
    modalExpense.classList.remove("active");
  });
  document.getElementById("btn-cancel-expense").addEventListener("click", () => {
    modalExpense.classList.remove("active");
  });

  document.getElementById("btn-open-settings").addEventListener("click", openSettingsModal);
  document.getElementById("btn-nav-settings").addEventListener("click", openSettingsModal);
  document.getElementById("btn-close-settings-modal").addEventListener("click", () => {
    modalSettings.classList.remove("active");
  });

  // Modal 內的分類選擇
  document.querySelectorAll("#category-selector .cat-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("#category-selector .cat-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      document.getElementById("expense-category").value = btn.dataset.val;
    });
  });

  // 分攤成員切換 (全員 vs 指定)
  const splitAllBtn = document.getElementById("split-all-btn");
  const splitCustomBtn = document.getElementById("split-custom-btn");
  splitAllBtn.addEventListener("click", () => {
    splitAllBtn.classList.add("active");
    splitCustomBtn.classList.remove("active");
    toggleAllMemberCheckboxes(true);
  });
  splitCustomBtn.addEventListener("click", () => {
    splitCustomBtn.classList.add("active");
    splitAllBtn.classList.remove("active");
  });

  // 觸發選擇附件
  const fileInput = document.getElementById("expense-attachment-input");
  document.getElementById("btn-trigger-upload").addEventListener("click", () => {
    fileInput.click();
  });

  fileInput.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // 限制檔案大小不大於 5MB
    if (file.size > 5 * 1024 * 1024) {
      showCustomAlert("檔案太大", "上傳的附件大小不能超過 5MB！", "fa-triangle-exclamation", "#ef4444");
      fileInput.value = "";
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const base64Data = event.target.result;
      document.getElementById("expense-attachment-data").value = base64Data;
      document.getElementById("expense-attachment-name").value = file.name;
      document.getElementById("expense-attachment-type").value = file.type;

      document.getElementById("btn-remove-attachment").style.display = "inline-block";
      const prevContainer = document.getElementById("attachment-preview-container");
      prevContainer.style.display = "block";

      if (file.type.startsWith("image/")) {
        prevContainer.innerHTML = `
          <div style="position:relative; display:inline-block;">
            <img src="${base64Data}" style="max-width:120px; max-height:120px; border-radius:8px; border:1px solid var(--border-color); object-fit:cover;">
            <small style="display:block; font-size:0.75rem; color:var(--text-muted); text-align:center; margin-top:2px;">${escapeHtml(file.name)}</small>
          </div>`;
      } else {
        prevContainer.innerHTML = `
          <div style="background:var(--bg-input); padding:8px 12px; border-radius:8px; display:inline-flex; align-items:center; gap:8px; font-size:0.85rem;">
            <i class="fa-solid fa-file-lines" style="color:var(--primary);"></i>
            <span>${escapeHtml(file.name)}</span>
          </div>`;
      }
    };
    reader.readAsDataURL(file);
  });

  // 移除附件
  document.getElementById("btn-remove-attachment").addEventListener("click", () => {
    fileInput.value = "";
    document.getElementById("expense-attachment-data").value = "";
    document.getElementById("expense-attachment-name").value = "";
    document.getElementById("expense-attachment-type").value = "";
    document.getElementById("btn-remove-attachment").style.display = "none";
    const prevContainer = document.getElementById("attachment-preview-container");
    prevContainer.style.display = "none";
    prevContainer.innerHTML = "";
  });

  // 關閉多媒體檢視器 Modal
  document.getElementById("btn-close-media-viewer").addEventListener("click", () => {
    document.getElementById("modal-media-viewer").classList.remove("active");
  });

  // 提交記帳表單
  document.getElementById("form-expense").addEventListener("submit", (e) => {
    e.preventDefault();
    saveExpenseFromForm();
  });

  // 儲存設定表單
  document.getElementById("btn-save-settings").addEventListener("click", () => {
    saveSettingsFromForm();
  });

  // 刪除此旅遊行程
  document.getElementById("btn-delete-current-trip").addEventListener("click", () => {
    deleteCurrentTrip();
  });

  document.getElementById("btn-sync-now").addEventListener("click", () => {
    syncFromGoogleSheets();
  });
}

function switchTab(tabId) {
  document.querySelectorAll(".bottom-nav nav-item").forEach(i => i.classList.remove("active"));
  document.querySelectorAll(".tab-panel").forEach(p => p.classList.remove("active"));
  
  const navBtn = document.querySelector(`.bottom-nav [data-tab="${tabId}"]`);
  if (navBtn) navBtn.classList.add("active");
  
  const panel = document.getElementById(tabId);
  if (panel) panel.classList.add("active");
}

function openAddExpenseModal() {
  const modal = document.getElementById("modal-expense");
  document.getElementById("modal-title").textContent = "新增消費";
  document.getElementById("expense-id").value = "";
  document.getElementById("expense-amount").value = "";
  document.getElementById("expense-name").value = "";
  document.getElementById("expense-note").value = "";

  // 填寫付款人選項
  const paidBySelect = document.getElementById("expense-paid-by");
  paidBySelect.innerHTML = "";
  appState.settings.members.forEach(m => {
    const opt = document.createElement("option");
    opt.value = m;
    opt.textContent = m;
    paidBySelect.appendChild(opt);
  });

  // 動態填寫付款方式 (包含自訂信用卡列表)
  const payMethodSelect = document.getElementById("expense-pay-method");
  payMethodSelect.innerHTML = "";
  
  // 1. 現金
  const optCash = document.createElement("option");
  optCash.value = "現金";
  optCash.textContent = "💵 現金";
  payMethodSelect.appendChild(optCash);

  // 2. 自訂信用卡列表
  const cards = appState.settings.creditCards || ["玉山FlyGo", "富邦J卡", "國泰CUBE", "吉鶴卡"];
  cards.forEach(card => {
    const opt = document.createElement("option");
    opt.value = `信用卡(${card})`;
    opt.textContent = `💳 信用卡 (${card})`;
    payMethodSelect.appendChild(opt);
  });

  // 3. 通用其他選項
  const optOtherCard = document.createElement("option");
  optOtherCard.value = "信用卡(其他)";
  optOtherCard.textContent = "💳 信用卡 (其他)";
  payMethodSelect.appendChild(optOtherCard);

  const optPay = document.createElement("option");
  optPay.value = "IC卡/Pay";
  optPay.textContent = "📱 IC卡 / 街口 / LINE Pay";
  payMethodSelect.appendChild(optPay);

  // 重設附件區塊
  document.getElementById("expense-attachment-input").value = "";
  document.getElementById("expense-attachment-data").value = "";
  document.getElementById("expense-attachment-name").value = "";
  document.getElementById("expense-attachment-type").value = "";
  document.getElementById("btn-remove-attachment").style.display = "none";
  const prevContainer = document.getElementById("attachment-preview-container");
  prevContainer.style.display = "none";
  prevContainer.innerHTML = "";

  // 渲染分攤人員 Checkbox
  renderSplitMembersCheckboxes(appState.settings.members);

  modal.classList.add("active");
}

function renderSplitMembersCheckboxes(selectedMembers = []) {
  const container = document.getElementById("split-members-checkboxes");
  container.innerHTML = "";

  appState.settings.members.forEach(m => {
    const isChecked = selectedMembers.includes(m);
    const label = document.createElement("label");
    label.className = `member-checkbox-label ${isChecked ? 'checked' : ''}`;
    label.innerHTML = `
      <input type="checkbox" value="${escapeHtml(m)}" ${isChecked ? 'checked' : ''} style="display:none;" onchange="this.parentElement.classList.toggle('checked', this.checked)">
      <i class="fa-solid fa-check" style="font-size:0.75rem;"></i> ${escapeHtml(m)}
    `;
    container.appendChild(label);
  });
}

function toggleAllMemberCheckboxes(checked) {
  document.querySelectorAll("#split-members-checkboxes input[type='checkbox']").forEach(cb => {
    cb.checked = checked;
    cb.parentElement.classList.toggle("checked", checked);
  });
}

function saveExpenseFromForm() {
  const id = document.getElementById("expense-id").value || `exp_${Date.now()}`;
  const currency = document.getElementById("expense-currency").value;
  const amount = parseFloat(document.getElementById("expense-amount").value);
  const title = document.getElementById("expense-name").value.trim();
  const category = document.getElementById("expense-category").value;
  const paidBy = document.getElementById("expense-paid-by").value;
  const paymentMethod = document.getElementById("expense-pay-method").value;
  const date = document.getElementById("expense-date").value;
  const note = document.getElementById("expense-note").value.trim();

  // 附件資料
  const attachmentData = document.getElementById("expense-attachment-data").value;
  const attachmentName = document.getElementById("expense-attachment-name").value;
  const attachmentType = document.getElementById("expense-attachment-type").value;

  // 選取的指定分攤人員
  const checkedBoxes = document.querySelectorAll("#split-members-checkboxes input[type='checkbox']:checked");
  const splitWith = Array.from(checkedBoxes).map(cb => cb.value);

  const splitType = document.getElementById("split-all-btn").classList.contains("active") ? "全員" : "指定";

  const newExpense = {
    id, title, amount, currency, category, paidBy, paymentMethod,
    splitType, splitWith, date, note, createdAt: new Date().toISOString()
  };

  // 移除舊項 (若為編輯) 並存入
  appState.expenses = appState.expenses.filter(x => x.id !== id);
  appState.expenses.push(newExpense);

  saveLocalStorage();
  renderApp();

  // 關閉 Modal
  document.getElementById("modal-expense").classList.remove("active");

  // 送至 Google Sheet
  sendToGoogleSheets("add_expense", { expense: newExpense });
}

// 自訂美化 Modal 替換原生 alert/confirm/prompt
function showCustomAlert(title, message, iconClass = "fa-circle-info", iconColor = "var(--primary)") {
  return new Promise((resolve) => {
    const modal = document.getElementById("modal-custom-dialog");
    document.getElementById("dialog-icon").innerHTML = `<i class="fa-solid ${iconClass}" style="color:${iconColor};"></i>`;
    document.getElementById("dialog-title").textContent = title;
    document.getElementById("dialog-message").textContent = message;
    document.getElementById("dialog-prompt-container").style.display = "none";

    const btnConfirm = document.getElementById("btn-dialog-confirm");
    const btnCancel = document.getElementById("btn-dialog-cancel");

    btnCancel.style.display = "none";
    btnConfirm.textContent = "我知道了";

    const onConfirm = () => {
      cleanup();
      resolve(true);
    };

    const cleanup = () => {
      btnConfirm.removeEventListener("click", onConfirm);
      modal.classList.remove("active");
    };

    btnConfirm.addEventListener("click", onConfirm);
    modal.classList.add("active");
  });
}

function showCustomConfirm(title, message, iconClass = "fa-triangle-exclamation", iconColor = "#ef4444") {
  return new Promise((resolve) => {
    const modal = document.getElementById("modal-custom-dialog");
    document.getElementById("dialog-icon").innerHTML = `<i class="fa-solid ${iconClass}" style="color:${iconColor};"></i>`;
    document.getElementById("dialog-title").textContent = title;
    document.getElementById("dialog-message").textContent = message;
    document.getElementById("dialog-prompt-container").style.display = "none";

    const btnConfirm = document.getElementById("btn-dialog-confirm");
    const btnCancel = document.getElementById("btn-dialog-cancel");

    btnCancel.style.display = "block";
    btnCancel.textContent = "取消";
    btnConfirm.textContent = "確定刪除";

    const onConfirm = () => {
      cleanup();
      resolve(true);
    };
    const onCancel = () => {
      cleanup();
      resolve(false);
    };

    const cleanup = () => {
      btnConfirm.removeEventListener("click", onConfirm);
      btnCancel.removeEventListener("click", onCancel);
      modal.classList.remove("active");
    };

    btnConfirm.addEventListener("click", onConfirm);
    btnCancel.addEventListener("click", onCancel);
    modal.classList.add("active");
  });
}

function showCreateTripModal() {
  return new Promise((resolve) => {
    const modal = document.getElementById("modal-custom-dialog");
    document.getElementById("dialog-icon").innerHTML = `<i class="fa-solid fa-plane-circle-plus" style="color:var(--accent);"></i>`;
    document.getElementById("dialog-title").textContent = "建立新旅遊行程";
    document.getElementById("dialog-message").textContent = "請輸入管理者驗證密碼、新行程名稱與新行程管理者密碼：";

    const promptContainer = document.getElementById("dialog-prompt-container");
    const input1 = document.getElementById("dialog-prompt-input-1");
    const input2 = document.getElementById("dialog-prompt-input-2");

    promptContainer.style.display = "block";
    
    // input1 用於輸入「管理者驗證密碼」
    input1.style.display = "block";
    input1.type = "password";
    input1.placeholder = "請輸入目前行程的管理者密碼 (預設1234)";
    input1.value = "";

    // input2 用於輸入「新行程名稱」
    input2.style.display = "block";
    input2.type = "text";
    input2.placeholder = "新行程名稱 (例如：大阪自由行 🍡)";
    input2.value = "";

    const btnConfirm = document.getElementById("btn-dialog-confirm");
    const btnCancel = document.getElementById("btn-dialog-cancel");

    btnCancel.style.display = "block";
    btnCancel.textContent = "取消";
    btnConfirm.textContent = "驗證並建立";

    const onConfirm = () => {
      const verifyPwd = input1.value.trim();
      const name = input2.value.trim();
      const currentOwnerPwd = appState.settings ? (appState.settings.ownerPassword || "1234") : "1234";

      if (verifyPwd !== currentOwnerPwd) {
        cleanup();
        showCustomAlert("權限受限", "🔒 管理者密碼錯誤！只有【管理者/擁有者】才能建立新行程。", "fa-lock", "#ef4444");
        resolve(null);
        return;
      }

      cleanup();
      if (name) {
        resolve({ name, pwd: verifyPwd });
      } else {
        showCustomAlert("提示", "行程名稱不能留空！", "fa-triangle-exclamation", "#f59e0b");
        resolve(null);
      }
    };

    const onCancel = () => {
      cleanup();
      resolve(null);
    };

    const cleanup = () => {
      btnConfirm.removeEventListener("click", onConfirm);
      btnCancel.removeEventListener("click", onCancel);
      modal.classList.remove("active");
    };

    btnConfirm.addEventListener("click", onConfirm);
    btnCancel.addEventListener("click", onCancel);
    modal.classList.add("active");
    input1.focus();
  });
}

function deleteExpense(id) {
  showCustomConfirm("刪除確認", "確定要刪除這筆記帳紀錄嗎？", "fa-trash-can", "#ef4444").then((confirmed) => {
    if (!confirmed) return;
    appState.expenses = appState.expenses.filter(x => x.id !== id);
    saveLocalStorage();
    renderApp();
    sendToGoogleSheets("delete_expense", { id });
  });
}

function openSettingsModal() {
  if (appState.currentUserRole !== "owner") {
    showCustomAlert("權限受限", "🔒 您當前是以【成員】身份登入，無權限查看或修改行程設定與刪除行程！\n請使用【擁有者密碼】登入。", "fa-lock", "#f59e0b");
    return;
  }

  const cards = appState.settings.creditCards || ["玉山FlyGo", "富邦J卡", "國泰CUBE", "吉鶴卡"];

  document.getElementById("setting-trip-name").value = appState.settings.tripName;
  document.getElementById("setting-base-currency").value = appState.settings.baseCurrency;
  document.getElementById("setting-exchange-rate").value = appState.settings.exchangeRate;
  document.getElementById("setting-members").value = appState.settings.members.join(", ");
  
  document.getElementById("setting-owner-password").value = appState.settings.ownerPassword || "";
  document.getElementById("setting-member-password").value = appState.settings.memberPassword || "";

  document.getElementById("setting-credit-cards").value = cards.join(", ");
  document.getElementById("setting-gas-url").value = globalGasUrl || appState.settings.gasUrl || "";

  document.getElementById("modal-settings").classList.add("active");
}

async function deleteCurrentTrip() {
  if (appState.currentUserRole !== "owner") {
    showCustomAlert("權限受限", "🔒 只有擁有者才有權限刪除行程！", "fa-lock", "#f59e0b");
    return;
  }

  const tripName = appState.settings.tripName;
  const confirmed = await showCustomConfirm("刪除行程警告", `⚠️ 確定要永久刪除行程「${tripName}」及其所有消費紀錄嗎？`, "fa-trash-can", "#ef4444");
  if (!confirmed) return;

  delete tripsStore[currentTripId];
  
  const remainingIds = Object.keys(tripsStore);
  if (remainingIds.length === 0) {
    const newTrip = CREATE_DEFAULT_TRIP();
    tripsStore[newTrip.id] = newTrip;
    currentTripId = newTrip.id;
  } else {
    currentTripId = remainingIds[0];
  }

  activeTrip(currentTripId);
  saveLocalStorage();

  document.getElementById("modal-settings").classList.remove("active");
  appState.isUnlocked = false;
  appState.currentUserRole = "guest";
  checkPasswordLockStatus();

  showCustomAlert("刪除成功", `🗑️ 已成功刪除行程「${tripName}」。`, "fa-circle-check", "var(--accent)");
}

function escapeHtml(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
