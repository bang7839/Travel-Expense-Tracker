/**
 * TravelPay - 旅遊記帳前端核心 Logic (app.js)
 */

// 預設資料結構與 State
const DEFAULT_SETTINGS = {
  tripName: "東京快樂之旅 🎌",
  baseCurrency: "TWD",
  foreignCurrency: "JPY",
  exchangeRate: 0.215, // 1 JPY = 0.215 TWD
  members: ["小明", "小美", "阿強"],
  gasUrl: "",
  appPassword: "" // 密碼保護 (空白表示未設置)
};

let appState = {
  settings: { ...DEFAULT_SETTINGS },
  expenses: [],
  currentCategoryFilter: "all",
  activeTab: "tab-records",
  isUnlocked: false
};

// 初始化 App
document.addEventListener("DOMContentLoaded", () => {
  loadLocalStorage();
  initEventListeners();
  checkPasswordLockStatus();

  // 設定預設日期為今天
  document.getElementById("expense-date").value = new Date().toISOString().split("T")[0];

  // 若填寫了 Google Apps Script API 且已解鎖，嘗試同步
  if (appState.settings.gasUrl && appState.isUnlocked) {
    syncFromGoogleSheets();
  }
});

function checkPasswordLockStatus() {
  const lockOverlay = document.getElementById("lock-screen");
  const appContainer = document.getElementById("app");

  if (!appState.settings.appPassword) {
    // 未設置密碼，直接進入
    appState.isUnlocked = true;
    lockOverlay.classList.add("unlocked");
    appContainer.classList.remove("app-locked");
    renderApp();
  } else {
    // 需輸入密碼
    appState.isUnlocked = false;
    lockOverlay.classList.remove("unlocked");
    appContainer.classList.add("app-locked");
  }
}

// 1. 本地 LocalStorage 管理
function loadLocalStorage() {
  const savedSettings = localStorage.getItem("travelpay_settings");
  const savedExpenses = localStorage.getItem("travelpay_expenses");
  
  if (savedSettings) {
    appState.settings = { ...DEFAULT_SETTINGS, ...JSON.parse(savedSettings) };
  }
  if (savedExpenses) {
    appState.expenses = JSON.parse(savedExpenses);
  }
}

function saveLocalStorage() {
  localStorage.setItem("travelpay_settings", JSON.stringify(appState.settings));
  localStorage.setItem("travelpay_expenses", JSON.stringify(appState.expenses));
}

// 2. Google Apps Script 雲端同步
async function syncFromGoogleSheets() {
  const url = appState.settings.gasUrl;
  if (!url) return;

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
  const url = appState.settings.gasUrl;
  if (!url) return;

  try {
    updateSyncStatus("loading", "更新雲端...");
    await fetch(url, {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...payload })
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

    card.innerHTML = `
      <div class="expense-left">
        <div class="cat-icon">${catIconMap[item.category] || "💸"}</div>
        <div class="expense-info">
          <div class="title">${escapeHtml(item.title)}</div>
          <div class="meta">
            <span>${item.date}</span>
            <span>• ${escapeHtml(item.paidBy)} 付款</span>
            <span class="badge-pay-method">${escapeHtml(item.paymentMethod || '現金')}</span>
          </div>
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
  // 解鎖表單送出
  document.getElementById("form-login").addEventListener("submit", (e) => {
    e.preventDefault();
    const inputPwd = document.getElementById("input-lock-password").value;
    const errorEl = document.getElementById("lock-error-msg");

    if (inputPwd === appState.settings.appPassword) {
      appState.isUnlocked = true;
      document.getElementById("lock-screen").classList.add("unlocked");
      document.getElementById("app").classList.remove("app-locked");
      errorEl.textContent = "";
      document.getElementById("input-lock-password").value = "";
      renderApp();

      if (appState.settings.gasUrl) {
        syncFromGoogleSheets();
      }
    } else {
      errorEl.textContent = "❌ 密碼錯誤，請重新輸入";
      document.getElementById("input-lock-password").select();
    }
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

  // 提交記帳表單
  document.getElementById("form-expense").addEventListener("submit", (e) => {
    e.preventDefault();
    saveExpenseFromForm();
  });

  // 儲存設定表單
  document.getElementById("btn-save-settings").addEventListener("click", () => {
    saveSettingsFromForm();
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

function deleteExpense(id) {
  if (!confirm("確定要刪除這筆記帳紀錄嗎？")) return;
  
  appState.expenses = appState.expenses.filter(x => x.id !== id);
  saveLocalStorage();
  renderApp();

  sendToGoogleSheets("delete_expense", { id });
}

function openSettingsModal() {
  document.getElementById("setting-trip-name").value = appState.settings.tripName;
  document.getElementById("setting-base-currency").value = appState.settings.baseCurrency;
  document.getElementById("setting-exchange-rate").value = appState.settings.exchangeRate;
  document.getElementById("setting-members").value = appState.settings.members.join(", ");
  document.getElementById("setting-app-password").value = appState.settings.appPassword || "";
  document.getElementById("setting-gas-url").value = appState.settings.gasUrl || "";

  document.getElementById("modal-settings").classList.add("active");
}

function saveSettingsFromForm() {
  const tripName = document.getElementById("setting-trip-name").value.trim() || "旅遊記帳";
  const baseCurrency = document.getElementById("setting-base-currency").value;
  const exchangeRate = parseFloat(document.getElementById("setting-exchange-rate").value) || 1;
  const membersRaw = document.getElementById("setting-members").value;
  const members = membersRaw.split(/[,，]/).map(s => s.trim()).filter(Boolean);
  const appPassword = document.getElementById("setting-app-password").value.trim();
  const gasUrl = document.getElementById("setting-gas-url").value.trim();

  appState.settings = {
    ...appState.settings,
    tripName, baseCurrency, exchangeRate,
    members: members.length > 0 ? members : ["我"],
    appPassword,
    gasUrl
  };

  saveLocalStorage();
  renderApp();

  document.getElementById("modal-settings").classList.remove("active");

  sendToGoogleSheets("save_settings", { settings: appState.settings });
}

function escapeHtml(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
