/**
 * 旅遊記帳本 - Google Apps Script (GAS) 後端服務
 * 
 * 使用教學：
 * 1. 打開 Google Sheets ( Google 試算表 )
 * 2. 點選選單「擴充功能」 -> 「Apps Script」
 * 3. 清空內容，將此檔程式碼全部複製並貼上
 * 4. 點選右上角「部署」 -> 「新增部署」
 * 5. 類型選擇「Web 應用程式」 (Web App)
 * 6. 執行身份選「我 (Me)」，誰可以存取選「所有人 (Anyone)」
 * 7. 點選部署並授權後，複製「Web 應用程式 URL」
 * 8. 將 URL 貼入旅遊記帳網頁的設定頁面即可！
 */

function doGet(e) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  var data = sheet.getDataRange().getValues();
  
  if (data.length <= 1) {
    return createJsonResponse({ success: true, expenses: [], settings: null });
  }
  
  var expenses = [];
  var settings = null;
  
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    if (row[0] === 'SETTINGS_CONFIG') {
      try {
        settings = JSON.parse(row[1]);
      } catch(err) {}
      continue;
    }
    
    if (!row[0]) continue;
    
    expenses.push({
      id: row[0],
      title: row[1],
      amount: Number(row[2]),
      currency: row[3],
      category: row[4],
      paidBy: row[5],
      paymentMethod: row[6], // 付款方式：現金 / 信用卡 (卡號/名稱)
      splitType: row[7],     // 所有人 / 指定人員
      splitWith: row[8] ? row[8].toString().split(',') : [],
      date: row[9],
      note: row[10],
      createdAt: row[11]
    });
  }
  
  return createJsonResponse({ success: true, expenses: expenses, settings: settings });
}

function doPost(e) {
  try {
    var postData = JSON.parse(e.postData.contents);
    var action = postData.action;
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    
    if (sheet.getLastRow() === 0) {
      sheet.appendRow([
        'ID', 'Title', 'Amount', 'Currency', 'Category', 
        'PaidBy', 'PaymentMethod', 'SplitType', 'SplitWith', 
        'Date', 'Note', 'CreatedAt'
      ]);
    }
    
    if (action === 'save_settings') {
      var data = sheet.getDataRange().getValues();
      var foundRow = -1;
      for (var i = 1; i < data.length; i++) {
        if (data[i][0] === 'SETTINGS_CONFIG') {
          foundRow = i + 1;
          break;
        }
      }
      var jsonStr = JSON.stringify(postData.settings);
      if (foundRow > 0) {
        sheet.getRange(foundRow, 2).setValue(jsonStr);
      } else {
        sheet.appendRow(['SETTINGS_CONFIG', jsonStr]);
      }
      return createJsonResponse({ success: true, message: 'Settings saved' });
    }
    
    if (action === 'add_expense') {
      var item = postData.expense;
      sheet.appendRow([
        item.id,
        item.title,
        item.amount,
        item.currency,
        item.category,
        item.paidBy,
        item.paymentMethod || '現金',
        item.splitType,
        (item.splitWith || []).join(','),
        item.date,
        item.note || '',
        new Date().toISOString()
      ]);
      return createJsonResponse({ success: true, item: item });
    }
    
    if (action === 'delete_expense') {
      var targetId = postData.id;
      var data = sheet.getDataRange().getValues();
      for (var i = 1; i < data.length; i++) {
        if (data[i][0] === targetId) {
          sheet.deleteRow(i + 1);
          return createJsonResponse({ success: true, message: 'Deleted' });
        }
      }
      return createJsonResponse({ success: false, message: 'ID not found' });
    }
    
    return createJsonResponse({ success: false, message: 'Unknown action' });
  } catch (err) {
    return createJsonResponse({ success: false, error: err.toString() });
  }
}

function createJsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
