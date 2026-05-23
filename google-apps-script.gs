/**
 * טרי בכפר — מערכת מעקב הוצאות
 * Google Apps Script Backend
 *
 * זה הקוד שרץ בשרת של Google. הוא מקבל בקשות מהאפליקציה
 * ושומר/קורא נתונים מ-Google Sheets.
 */

// ─── הגדרות (לא לשנות, יוגדר אוטומטית בהתקנה) ─────────────────────────────
const SPREADSHEET_ID = SpreadsheetApp.getActiveSpreadsheet().getId();
const DRIVE_FOLDER_NAME = 'טרי בכפר - חשבוניות';

const SHEETS = {
  expenses: 'הוצאות',
  fixed: 'הוצאות קבועות',
  installments: 'תשלומים'
};

// כותרות עמודות לכל גיליון
const HEADERS = {
  expenses: ['id','תאריך','ספק','סכום כולל','מע"מ','לפני מע"מ','קטגוריה','סוג מסמך','מספר מסמך','הערות','קישור לתמונה','נוצר ב'],
  fixed: ['id','שם','סכום','קטגוריה','תדירות','יום בחודש','ספק','הערות','פעיל','נוצר ב'],
  installments: ['id','שם','סכום כולל','מספר תשלומים','תשלומים ששולמו','תאריך התחלה','ספק','הערות','נוצר ב']
};

// ─── Entry point - הפונקציה הראשית שמקבלת בקשות ─────────────────────────────
function doPost(e) {
  try {
    ensureSheetsExist();
    const data = JSON.parse(e.postData.contents);
    const action = data.action;
    let result;

    switch(action) {
      // הוצאות שוטפות
      case 'list_expenses':    result = listRows('expenses'); break;
      case 'add_expense':      result = addExpense(data.payload); break;
      case 'update_expense':   result = updateRow('expenses', data.payload); break;
      case 'delete_expense':   result = deleteRow('expenses', data.id); break;

      // הוצאות קבועות
      case 'list_fixed':       result = listRows('fixed'); break;
      case 'add_fixed':        result = addRow('fixed', data.payload); break;
      case 'update_fixed':     result = updateRow('fixed', data.payload); break;
      case 'delete_fixed':     result = deleteRow('fixed', data.id); break;

      // תשלומים
      case 'list_installments': result = listRows('installments'); break;
      case 'add_installment':   result = addRow('installments', data.payload); break;
      case 'update_installment':result = updateRow('installments', data.payload); break;
      case 'delete_installment':result = deleteRow('installments', data.id); break;

      // העלאת תמונה
      case 'upload_image':     result = uploadImage(data.base64, data.mime, data.filename); break;

      // בדיקת חיבור
      case 'ping':             result = { ok: true, time: new Date().toISOString() }; break;

      default: throw new Error('Unknown action: ' + action);
    }

    return jsonResponse({ ok: true, data: result });

  } catch (err) {
    return jsonResponse({ ok: false, error: err.message, stack: err.stack });
  }
}

function doGet(e) {
  return ContentService.createTextOutput(
    'טרי בכפר API פעיל. שלח בקשות POST.'
  ).setMimeType(ContentService.MimeType.TEXT);
}

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ─── יצירת גיליונות במידה ולא קיימים ─────────────────────────────────────────
function ensureSheetsExist() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  for (const [key, sheetName] of Object.entries(SHEETS)) {
    let sheet = ss.getSheetByName(sheetName);
    if (!sheet) {
      sheet = ss.insertSheet(sheetName);
      sheet.appendRow(HEADERS[key]);
      // עיצוב כותרת
      const headerRange = sheet.getRange(1, 1, 1, HEADERS[key].length);
      headerRange.setFontWeight('bold');
      headerRange.setBackground('#8fc650');
      headerRange.setFontColor('#0a1505');
      sheet.setFrozenRows(1);
      sheet.setColumnWidth(1, 200);
    }
  }

  // מוחק את הגיליון "Sheet1" אם קיים
  const defaultSheet = ss.getSheetByName('Sheet1') || ss.getSheetByName('גיליון 1');
  if (defaultSheet && ss.getSheets().length > 3) {
    ss.deleteSheet(defaultSheet);
  }
}

// ─── פונקציות עזר ───────────────────────────────────────────────────────────
function getSheet(key) {
  ensureSheetsExist();
  return SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEETS[key]);
}

function rowToObject(sheetKey, row) {
  const headers = HEADERS[sheetKey];
  const obj = {};
  headers.forEach((h, i) => { obj[h] = row[i]; });
  return mapToAppFormat(sheetKey, obj);
}

function mapToAppFormat(sheetKey, hebrewObj) {
  if (sheetKey === 'expenses') {
    return {
      id: hebrewObj.id,
      date: hebrewObj['תאריך'],
      supplier: hebrewObj['ספק'],
      total_amount: +hebrewObj['סכום כולל'] || 0,
      vat_amount: +hebrewObj['מע"מ'] || 0,
      amount_before_vat: +hebrewObj['לפני מע"מ'] || 0,
      category: hebrewObj['קטגוריה'],
      document_type: hebrewObj['סוג מסמך'],
      document_number: hebrewObj['מספר מסמך'],
      notes: hebrewObj['הערות'],
      image: hebrewObj['קישור לתמונה'],
    };
  }
  if (sheetKey === 'fixed') {
    return {
      id: hebrewObj.id,
      name: hebrewObj['שם'],
      amount: +hebrewObj['סכום'] || 0,
      category: hebrewObj['קטגוריה'],
      frequency: hebrewObj['תדירות'],
      day: hebrewObj['יום בחודש'],
      supplier: hebrewObj['ספק'],
      notes: hebrewObj['הערות'],
      active: hebrewObj['פעיל'] === true || hebrewObj['פעיל'] === 'TRUE' || hebrewObj['פעיל'] === 'כן',
    };
  }
  if (sheetKey === 'installments') {
    return {
      id: hebrewObj.id,
      name: hebrewObj['שם'],
      total: +hebrewObj['סכום כולל'] || 0,
      installments: +hebrewObj['מספר תשלומים'] || 0,
      paid: +hebrewObj['תשלומים ששולמו'] || 0,
      first_date: hebrewObj['תאריך התחלה'],
      supplier: hebrewObj['ספק'],
      notes: hebrewObj['הערות'],
    };
  }
}

function mapFromAppFormat(sheetKey, obj) {
  if (sheetKey === 'expenses') {
    return [obj.id, obj.date, obj.supplier, obj.total_amount, obj.vat_amount, obj.amount_before_vat,
            obj.category, obj.document_type, obj.document_number, obj.notes, obj.image, new Date()];
  }
  if (sheetKey === 'fixed') {
    return [obj.id, obj.name, obj.amount, obj.category, obj.frequency, obj.day,
            obj.supplier, obj.notes, obj.active === true || obj.active === 'true' ? 'כן' : 'לא', new Date()];
  }
  if (sheetKey === 'installments') {
    return [obj.id, obj.name, obj.total, obj.installments, obj.paid,
            obj.first_date, obj.supplier, obj.notes, new Date()];
  }
}

// ─── פעולות CRUD ────────────────────────────────────────────────────────────
function listRows(sheetKey) {
  const sheet = getSheet(sheetKey);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  const headers = HEADERS[sheetKey];
  const data = sheet.getRange(2, 1, lastRow - 1, headers.length).getValues();
  return data.map(row => rowToObject(sheetKey, row)).filter(r => r.id);
}

function addRow(sheetKey, payload) {
  const sheet = getSheet(sheetKey);
  const rowData = mapFromAppFormat(sheetKey, payload);
  sheet.appendRow(rowData);
  return payload;
}

function addExpense(payload) {
  // אם יש תמונה כ-base64, מעלה ל-Drive ושומר רק את הקישור
  if (payload.image && payload.image.startsWith('data:')) {
    const parts = payload.image.split(',');
    const mime = parts[0].split(':')[1].split(';')[0];
    const base64 = parts[1];
    const filename = `invoice_${payload.id}_${Date.now()}.${mime.split('/')[1]}`;
    const url = uploadImage(base64, mime, filename);
    payload.image = url;
  }
  return addRow('expenses', payload);
}

function findRowById(sheetKey, id) {
  const sheet = getSheet(sheetKey);
  const data = sheet.getRange(2, 1, sheet.getLastRow() - 1 || 1, 1).getValues();
  for (let i = 0; i < data.length; i++) {
    if (data[i][0] === id) return i + 2; // +2 because row 1 is header, array is 0-indexed
  }
  return -1;
}

function updateRow(sheetKey, payload) {
  const rowIdx = findRowById(sheetKey, payload.id);
  if (rowIdx < 0) throw new Error('Row not found: ' + payload.id);
  const sheet = getSheet(sheetKey);
  const rowData = mapFromAppFormat(sheetKey, payload);
  sheet.getRange(rowIdx, 1, 1, rowData.length).setValues([rowData]);
  return payload;
}

function deleteRow(sheetKey, id) {
  const rowIdx = findRowById(sheetKey, id);
  if (rowIdx < 0) throw new Error('Row not found: ' + id);
  getSheet(sheetKey).deleteRow(rowIdx);
  return { id, deleted: true };
}

// ─── העלאת תמונות ל-Drive ────────────────────────────────────────────────────
function getOrCreateFolder() {
  const folders = DriveApp.getFoldersByName(DRIVE_FOLDER_NAME);
  if (folders.hasNext()) return folders.next();
  return DriveApp.createFolder(DRIVE_FOLDER_NAME);
}

function uploadImage(base64, mime, filename) {
  const folder = getOrCreateFolder();
  const decoded = Utilities.base64Decode(base64);
  const blob = Utilities.newBlob(decoded, mime, filename || `invoice_${Date.now()}.jpg`);
  const file = folder.createFile(blob);
  // הופך את הקובץ לציבורי-קריאה (כל מי שיש לו לינק יכול לראות)
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return file.getUrl();
}

// ─── פונקציית התקנה ראשונית - הרץ פעם אחת בלבד ───────────────────────────────
function setup() {
  ensureSheetsExist();
  getOrCreateFolder();
  Logger.log('✅ ההתקנה הסתיימה בהצלחה!');
  Logger.log('Spreadsheet ID: ' + SPREADSHEET_ID);
}
