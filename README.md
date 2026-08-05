# 🧳 TravelPay - 手機旅遊記帳本 (Mobile-First Travel Expense Tracker)

一款針對手機瀏覽器極致優化、支援外幣換算、團體分攤（AA制/轉帳最小化試算）、**付款方式（現金/各家信用卡）**，並可免費部署於 **GitHub Pages** 與連結 **Google Sheets** 資料庫的旅遊記帳網頁。

---

## 🌟 亮點功能

1. **📱 手機端優先 (Mobile-First UX)**
   - 全介面採深色現代質感（Glassmorphism 玻璃擬態與微動畫）。
   - 底部滑順選單、懸浮快速新增記帳 (FAB)。
2. **🧳 登入畫面多行程與首頁切換**
   - 頂部導覽列圖示升級為 **🏠 首頁圖示**，點擊隨時回到行程切換與選擇畫面。
   - 登入頁直接提供「➕ 建立新旅遊行程」按鈕。
3. **🔐 擁有者 vs 成員 雙層權限控制 (新增功能)**
   - **擁有者 (Owner)**：輸入擁有者密碼解鎖（預設 `1234`），具備修改行程名稱、匯率、成員名單、雙層密碼與**刪除行程**之全權。
   - **成員 (Member)**：輸入成員密碼解鎖（預設 `0000`），**僅能新增消費與查看結算**，無法點開或修改系統設定與刪除行程。
4. **🌐 全域 Google Sheet API**
   - 設定中的 Google API 網址升級為全域設置，所有建立的行程自動共用同一個 Google 試算表。
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
