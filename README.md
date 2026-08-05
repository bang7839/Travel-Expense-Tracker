# 🧳 TravelPay - 手機旅遊記帳本 (Mobile-First Travel Expense Tracker)

一款針對手機瀏覽器極致優化、支援外幣換算、團體分攤（AA制/轉帳最小化試算）、**付款方式（現金/各家信用卡）**，並可免費部署於 **GitHub Pages** 與連結 **Google Sheets** 資料庫的旅遊記帳網頁。

---

## 🌟 亮點功能

1. **📱 手機端優先 (Mobile-First UX)**
   - 全介面採深色現代質感（Glassmorphism 玻璃擬態與微動畫）。
   - 底部滑順選單、懸浮快速新增記帳 (FAB)。
2. **🧳 登入畫面多行程切換 (新增功能)**
   - 解鎖登入畫面可下拉選擇切換不同的旅遊行程（例如：東京賞櫻、大阪吃到飽、韓國滑雪）。
   - 每個行程都有**獨立的記帳數據與獨立解鎖密碼**！
   - 登入頁直接提供「➕ 建立新旅遊行程」按鈕。
3. **🔐 密碼保護存取**
   - 開啟網頁或切換行程時，需輸入該行程的正確密碼才能查看與記帳。
   - 頂部導覽列提供 🔒 鎖定按鈕，可隨時鎖定離開或切換至其他行程。
3. **💴 多幣別與動態匯率換算**
   - 支援日圓 (JPY)、韓元 (KRW)、美金 (USD)、泰銖 (THB) 等，自動折算為台幣 (TWD) 總額。
4. **⚖️ 智慧分攤與最省心結算**
   - 自動統計每位成員「已支付」與「應付金額」。
   - 獨家「最少轉帳次數演算法」，自動算出一目了然的「誰該給誰多少錢」。
5. **📊 統計圖表**
   - 視覺化展示餐飲、交通、住宿、購物等分類花費與現金/信用卡比例。
6. **☁️ Google Sheets 免費雲端資料庫**
   - 支援無痛串接 Google Apps Script (GAS) API，也可離線使用 LocalStorage 本地儲存。

---

## 🚀 GitHub Pages 部署教學

1. 將本專案的所有檔案 (`index.html`, `style.css`, `app.js`, `README.md`) 儲存並 Push 上傳至您的 GitHub Repository。
2. 進入 Repository 頁面，點選 **Settings** ➔ **Pages**。
3. 在 **Source** 選擇 `Deploy from a branch`，Branch 選擇 `main` (或 `master`) / `/ (root)`。
4. 點選 **Save**，幾分鐘後即可獲得您的專屬網址（例如：`https://yourname.github.io/your-repo/`）！

---

## 📊 Google Sheets 資料庫串接教學 (3 分鐘完成)

1. 開啟 [Google Sheets](https://sheets.google.com/) 新建一份空白試算表。
2. 點選頂部選單 **擴充功能** ➔ **Apps Script**。
3. 將專案中的 `google_apps_script.js` 檔案內容完整複製，並貼上替換原本的程式碼。
4. 點選右上角 **部署 (Deploy)** ➔ **新增部署 (New deployment)**。
5. 點擊齒輪圖示選擇 **Web 應用程式 (Web App)**：
   - **說明**：旅遊記帳 API
   - **執行身份 (Execute as)**：`我 (Me)`
   - **誰可以存取 (Who has access)**：`所有人 (Anyone)`
6. 點選 **部署**，完成 Google 帳號授權。
7. 複製產生的 **Web 應用程式 URL** (Web App URL)。
8. 打開您的記帳網頁，點選右上角 **設定 (齒輪圖示)**，將 URL 貼入「Google Sheet API 網址」欄位並點選儲存即可！
