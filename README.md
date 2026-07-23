# Workshop 點名系統（NFC 學生證 + Firebase）

原生 HTML / CSS / ES Modules 的深色 SPA，依照 `DESIGN-SPEC.md` 的 Shell、色彩、元件與響應式規則實作。功能：以 Android 手機的 NFC 感應學生證進行點名，資料存在 Firebase Firestore；讀卡/場次/成員管理需輸入共用密碼才能進入，資料匯總頁不需要密碼。

## 目錄結構

```
project/
├── index.html
├── pages/            # summary / scan / sessions / members / lock 五個 fragment
├── js/
│   ├── core/          main.js、router.js（Hash Router）、shell.js（側欄）
│   ├── services/       firebase-config.js、db.js（Firestore CRUD）、
│   │                    auth-gate.js（密碼鎖）、nfc.js（Web NFC）
│   ├── pages/           每頁的 mountPage(context) 控制器
│   ├── ui/              toast.js、modal.js
│   └── utils/           format.js、icon.js
├── css/                theme / layout / components / attendance
├── config/app-config.json   側欄選單與摘要卡片文字（可自行調整，不需要改程式碼）
├── images/icons/*.svg   外部 SVG 圖示，以 CSS mask 呈色
└── firestore.rules      建議的 Firestore 安全規則
```

## 重要限制：Web NFC

- 只有 **Android 手機上的 Chrome 瀏覽器**支援 Web NFC（`NDEFReader`），iOS 與桌面瀏覽器都無法使用「點名讀卡」頁。
- 必須是 **HTTPS**（或 `localhost`）環境，否則 NFC API 會直接失敗；純用 `file://` 開啟 `index.html` 也不會動作。
- 網頁只能讀到學生證 NFC 晶片的**序號（UID）**，讀不到卡片內受保護的學號等資料。因此系統用「UID ↔ 成員」的對應表來辨識身分：
  - 可以先到「成員管理」預先登記每張卡的 UID，現在該頁的表單裡也有「感應卡片」按鈕，可以直接拿學生證感應一次自動帶入卡號，不用手動輸入；
  - 也可以直接在「點名讀卡」感應到陌生卡片時，現場輸入姓名建立成員（系統會記住這張卡的 UID，之後同一張卡就能直接辨識）。
- 「點名讀卡」頁的場次選單**只會列出「今天」建立的場次**（依場次的日期欄位判斷），避免不小心點到過期或未來場次。如果今天還沒有建立任何場次，頁面會顯示提示並提供「新增今日場次」按鈕，直接在讀卡頁面內建立（日期自動鎖定為當天），建立後立即可以選取並開始感應，不用切到「場次管理」頁再繞回來。
- 開始感應必須由使用者實際點擊按鈕觸發（瀏覽器規定的使用者手勢限制），無法在頁面載入時自動開始。

## 開發用「模擬模式」（無 NFC 硬體也能測試）

在電腦瀏覽器上開發時沒有 NFC 硬體，可以用網址加上查詢參數觸發模擬模式，跳過真實 Web NFC，改用手動輸入卡號測試整套簽到流程：

```
https://你的網址/#/scan?demo=1
```

模擬模式下，讀卡頁會顯示「模擬模式 DEMO」標籤與提示橫幅，原本的「開始感應」按鈕會換成一個卡號輸入框（可從已登記成員中自動帶出選項）與「模擬感應」按鈕，按下後會走跟真實感應完全相同的邏輯（比對成員、記錄簽到、彈出新成員建立表單等），方便在電腦上測試而不必真的用手機感應。**正式使用時網址不要帶這個參數**，一般點名時仍須用 Android 手機的 Chrome 進行真實 NFC 感應。

## 調整隊伍識別（Logo／隊名）

側欄與手機頂欄左上角的隊徽、隊名、副標題都在 `config/app-config.json` 的 `brand` 欄位設定：

```json
"brand": {
  "name": "Team 8725",
  "subtitle": "Misty Panther · Workshop",
  "logo": "images/brand/team-logo.png"
}
```

要換 logo 圖片，把新圖片放進 `images/brand/` 資料夾並更新 `logo` 路徑即可，不需要改任何程式碼。手機版（≤768px）為了節省橫向空間，只會顯示隊名，不顯示副標題與導覽文字（導覽列在手機上改為純圖示）。

## 新增功能：活動紀錄／好寶寶系統／匯出系統

側欄新增三個項目，對應到 Firestore 新的 `logs`、`goodkidMarks` collection 與一份新的 JSON 設定檔：

| 路由 | 頁面 | 需要密碼 | 說明 |
|---|---|---|---|
| `#/goodkid` | 好寶寶系統 | 是（一般管理密碼） | 每位成員卡片上有 5 個可點擊的 emoji 按鈕，點一下就記錄一次；可重複點擊、可同時累積多種不同 emoji，由管理者手動判斷、手動標記，不是系統自動判斷。 |
| `#/log` | 活動紀錄 | 是（一般管理密碼） | 列出所有名單新增／刪除、場次新增／刪除、簽到／取消簽到、好寶寶標記等操作紀錄，可用上方的篩選按鈕依類型篩選。 |
| `#/export` | 匯出系統 | 否 | 選擇開始與結束日期，按一下「匯出 CSV」會下載該範圍內所有簽到紀錄（場次名稱、日期、成員姓名、卡號、簽到時間），檔案已加上 UTF-8 BOM，Excel 開啟中文不會變亂碼。 |

如果想調整密碼保護的分配，改 `config/app-config.json` 裡對應項目的 `protected` 欄位即可，不用改程式碼。

### 活動紀錄如何運作

`js/services/db.js` 裡的每個新增／更新／刪除函式（成員、場次、簽到、好寶寶標記）在成功寫入後，都會順手呼叫 `addLog()` 寫一筆紀錄到 Firestore 的 `logs` collection，欄位為 `type`（例如 `member_add`、`attendance_delete`、`goodkid_mark`）、`message`（給人看的說明文字）、`meta`（相關 id）、`createdAt`。這個寫入是「盡力而為」：就算寫入紀錄失敗，也不會擋下原本的操作本身。`logs` collection 在 `firestore.rules` 裡設定為只能新增、禁止修改或刪除，維持稽核紀錄不被竄改的完整性。

### 好寶寶系統怎麼運作、按鈕怎麼調整

這是**手動標記**系統：管理者自行判斷成員當下的表現，點擊對應的 emoji 記錄一次；同一個人可以在同一次造訪裡被點擊多種不同 emoji，也可以對同一個 emoji重複點擊多次疊加次數。每個 emoji 按鈕右上角會顯示目前累積的次數，次數大於 0 時右下角會出現一個「−」小按鈕，可以移除一次（例如點錯了）。

可點擊的 5 個 emoji 選項完全由 `config/goodkid-emoji.json` 決定，不用改程式碼：

```json
{
  "emojiOptions": [
    { "emoji": "🌟", "label": "表現優異" },
    { "emoji": "👍", "label": "積極參與" },
    { "emoji": "🎯", "label": "準時到場" },
    { "emoji": "🙌", "label": "樂於協助" },
    { "emoji": "⚠️", "label": "需要提醒" }
  ]
}
```

想換 emoji 或文字說明，直接改這份 JSON 裡的內容即可；`emojiOptions` 陣列有幾個項目，頁面上就會顯示幾個按鈕。累積的次數存在 Firestore 的 `goodkidMarks/{memberId}` 文件裡，欄位 `counts` 是「emoji → 次數」的對照表。

## 點名讀卡的獨立密碼（適合固定擺放的讀卡機）

「點名讀卡」頁面現在使用**獨立於其他管理頁面的專用密碼**（存在 `settings/app.scanPassword`），跟場次管理／成員管理／活動紀錄／好寶寶系統共用的 `settings/app.readPassword` 是分開的兩組密碼。這樣你可以：

- 把讀卡機密碼設定得比較簡單好輸入（畢竟現場常常要重新解鎖），跟後台管理密碼分開，互不影響安全性。
- 讀卡機的解鎖狀態存在瀏覽器的 `localStorage`（而不是 `sessionStorage`），所以如果你把某支手機或平板固定架設當作讀卡機，解鎖一次之後，就算重新整理頁面或重開瀏覽器也會維持解鎖，不用每次都重新輸入——除非你手動點側欄的「鎖定讀卡機」，或清除瀏覽器資料。
- 其他管理頁面（場次管理、成員管理、活動紀錄、好寶寶系統）仍然共用原本的 `readPassword`，解鎖狀態存在 `sessionStorage`，關閉分頁就需要重新輸入，適合比較敏感的管理操作。

**需要你額外做的事**：到 Firestore Console 找到 `settings/app` 這份文件，新增一個欄位 `scanPassword`（字串），填入你要給讀卡機用的密碼。如果沒有設定這個欄位，「點名讀卡」頁面的解鎖畫面會顯示提示，告訴你要先去設定。

## Firebase 設定步驟

1. 到 [Firebase Console](https://console.firebase.google.com/) 建立新專案，啟用 **Firestore Database**（正式環境模式即可，稍後會套用 `firestore.rules`）。
2. 專案設定 → 一般 → 新增網頁應用程式，取得設定物件，貼到 `js/services/firebase-config.js` 的 `firebaseConfig`。
3. 部署 `firestore.rules`（可用 Firebase CLI：`firebase deploy --only firestore:rules`，或直接貼到 Console 的規則編輯器）。
4. 到 Firestore Console 手動建立一份文件：collection `settings`、文件 ID `app`，填入兩個欄位（都是字串）：`readPassword`（一般管理頁面用）與 `scanPassword`（點名讀卡機專用，可以跟 `readPassword` 設不同的密碼）。這一步刻意不開放從網頁寫入，避免密碼被任何前端程式改掉。
5. 建議直接用 **Firebase Hosting** 部署整個 `project/` 資料夾：Hosting 預設就是 HTTPS，同時滿足 Web NFC 的安全環境要求，也方便手機直接開網址使用。

   ```bash
   npm install -g firebase-tools
   firebase login
   firebase init hosting   # public 目錄選這個 project 資料夾
   firebase deploy
   ```

### 關於密碼機制的安全性

這是「單一共用密碼」方案，密碼存在 Firestore、由前端直接讀出比對，**不是** Firebase Authentication 等級的身分驗證，只能當作降低隨手誤用的門檻。`firestore.rules` 已將 `settings` 設為禁止任何用戶端寫入、但仍需要開放讀取才能比對，這是此方案本質上的取捨。如果之後需要更嚴謹的保護（例如公開網址、擔心密碼被找到），建議改用 Firebase Authentication 帳號登入，我可以再協助調整。

## 本機開發

純靜態檔案，但 ES Modules 需要透過 HTTP(S) 而非 `file://` 開啟，也建議用手機在同一網路下用 HTTPS 測試 NFC。最簡單的方式：

```bash
npx serve project        # 或 python3 -m http.server 5173 -d project
```

若要在手機上測試 NFC，仍需部署到有 HTTPS 的網址（Firebase Hosting 最方便），或使用 `ngrok` 之類的工具建立臨時 HTTPS 通道。

## 資料模型（Firestore）

| Collection | 欄位 | 說明 |
|---|---|---|
| `settings/app` | `readPassword`, `scanPassword` | 兩組獨立密碼：`readPassword` 給一般管理頁面，`scanPassword` 給點名讀卡頁面／讀卡機專用，僅可讀取，需由後台維護 |
| `members/{id}` | `name`, `cardUID`, `note`, `createdAt` | 成員與其學生證 UID 對應 |
| `sessions/{id}` | `name`, `date`, `note`, `createdAt` | 點名場次（活動） |
| `attendance/{id}` | `sessionId`, `memberId`, `memberName`, `cardUID`, `checkedInAt` | 每筆簽到紀錄；同一場次同一成員只會建立一筆 |
| `logs/{id}` | `type`, `message`, `meta`, `createdAt` | 操作紀錄（新增／刪除成員、場次、簽到、好寶寶標記等），只能新增、無法修改或刪除 |
| `goodkidMarks/{memberId}` | `counts`（emoji → 次數的對照表）, `updatedAt` | 好寶寶系統的手動標記次數，doc id 就是成員 id |

## 頁面與密碼保護

| 路由 | 頁面 | 需要密碼 | 使用哪組密碼 |
|---|---|---|---|
| `#/summary` | 資料匯總（三欄：場次列表／出席名單／統計卡片） | 否 | — |
| `#/scan` | 點名讀卡（NFC 感應，手機優化） | 是 | `scanPassword`（獨立、存 localStorage） |
| `#/sessions` | 場次管理 | 是 | `readPassword`（存 sessionStorage） |
| `#/members` | 成員管理（含 UID 登記） | 是 | `readPassword` |
| `#/goodkid` | 好寶寶系統（手動 emoji 標記） | 是 | `readPassword` |
| `#/log` | 活動紀錄 | 是 | `readPassword` |
| `#/export` | 匯出系統（CSV） | 否 | — |

一般管理頁面（場次／成員／好寶寶系統／活動紀錄）的解鎖狀態存在 `sessionStorage`，關閉分頁就需要重新輸入；側欄底部會分別顯示「一般管理」與「讀卡機」目前是否解鎖，也各自提供獨立的「鎖定管理」／「鎖定讀卡機」按鈕可手動鎖回。點名讀卡的解鎖狀態存在 `localStorage`，適合固定架設的讀卡機長期保持解鎖（詳見上方「點名讀卡的獨立密碼」章節）。

## 調整文案與選單

`config/app-config.json` 集中管理側欄選單文字、圖示、每個路由是否需要密碼，以及資料匯總頁的統計卡片標籤，不需要改 JavaScript 就能調整顯示內容，符合設計規範第 12 節「JSON 驅動設定」的原則。
