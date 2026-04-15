// ═══════════════════════════════════════════════════════════════
//  KENANGAN KELUARGA — Google Apps Script Backend
//  Paste seluruh file ini ke Apps Script editor (Extensions → Apps Script)
//  lalu Deploy sebagai Web App
// ═══════════════════════════════════════════════════════════════

const SHEET_ID = "1wciL6Sr-B65vQfLycif4QzJxmQHumUTUoRJkoYySiKE"; // ← PASTE ID spreadsheet kamu di sini (dari URL Sheets)
// Contoh URL: https://docs.google.com/spreadsheets/d/1aBcDeFgHiJkLmNoPqRsTuVwXyZ/edit
// ID-nya adalah bagian panjang di tengah URL itu

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Content-Type": "application/json"
};

// ── Entry point GET ──
function doGet(e) {
  try {
    const action   = e.parameter.action   || "all";
    const callback = e.parameter.callback || "";   // JSONP support
    let result;

    switch (action) {
      case "photos":   result = getPhotos();   break;
      case "quotes":   result = getQuotes();   break;
      case "timeline": result = getTimeline(); break;
      case "puisi":    result = getPuisi();    break;
      case "all":      result = getAllData();  break;
      default:         result = { error: "Unknown action" };
    }

    // Kalau ada callback parameter → kembalikan sebagai JSONP
    if (callback) {
      const output = ContentService
        .createTextOutput(callback + "(" + JSON.stringify(result) + ")")
        .setMimeType(ContentService.MimeType.JAVASCRIPT);
      return output;
    }

    return jsonResponse(result);
  } catch (err) {
    return jsonResponse({ error: err.message });
  }
}

// ── Entry point POST ── (terima payload dari iframe form submit)
function doPost(e) {
  try {
    let body;
    // Bisa dari fetch (JSON) atau dari iframe form submit
    if (e.postData && e.postData.type === "application/json") {
      body = JSON.parse(e.postData.contents);
    } else if (e.parameter && e.parameter.payload) {
      body = JSON.parse(e.parameter.payload);
    } else {
      return jsonResponse({ error: "No payload" });
    }

    const action = body.action;
    let result;
    switch (action) {
      case "addPhoto":    result = addPhoto(body.data);    break;
      case "addQuote":    result = addQuote(body.data);    break;
      case "addTimeline": result = addTimeline(body.data); break;
      case "addPuisi":    result = addPuisi(body.data);    break;
      default:            result = { error: "Unknown action" };
    }
    return jsonResponse(result);
  } catch (err) {
    return jsonResponse({ error: err.message });
  }
}



// ═══════════════════════════════════════════════
//  GET FUNCTIONS
// ═══════════════════════════════════════════════

function getAllData() {
  return {
    photos:   getPhotos(),
    quotes:   getQuotes(),
    timeline: getTimeline(),
    puisi:    getPuisi()
  };
}

function getPhotos() {
  const sheet = getSheet("📷 Photos");
  const rows  = sheet.getDataRange().getValues();
  const result = [];

  for (let i = 3; i < rows.length; i++) { // skip header rows (0,1,2)
    const [id, caption, year, people, url, order, active] = rows[i];
    if (!id || String(active).toUpperCase() !== "TRUE") continue;
    result.push({
      id:      id,
      caption: caption || "",
      year:    year    || "",
      people:  people  || "",
      url:     convertDriveUrl(String(url || "")),
      order:   Number(order) || i,
    });
  }

  result.sort((a, b) => a.order - b.order);
  return result;
}

function getQuotes() {
  const sheet = getSheet("💬 Quotes");
  const rows  = sheet.getDataRange().getValues();
  const result = [];

  for (let i = 3; i < rows.length; i++) {
    const [id, text, author, category, active] = rows[i];
    if (!id || String(active).toUpperCase() !== "TRUE") continue;
    result.push({
      id:       id,
      text:     text     || "",
      author:   author   || "Anonim",
      category: category || "",
    });
  }

  return result;
}

function getTimeline() {
  const sheet = getSheet("📅 Timeline");
  const rows  = sheet.getDataRange().getValues();
  const result = [];

  for (let i = 3; i < rows.length; i++) {
    const [id, year, title, desc, icon, active] = rows[i];
    if (!id || String(active).toUpperCase() !== "TRUE") continue;
    result.push({
      id:    id,
      year:  year  || "",
      title: title || "",
      desc:  desc  || "",
      icon:  icon  || "📌",
    });
  }

  return result;
}

function getPuisi() {
  const sheet = getSheet("📜 Puisi Ayah");
  const rows  = sheet.getDataRange().getValues();
  const result = [];

  for (let i = 3; i < rows.length; i++) {
    const row = rows[i];
    const id    = row[0];
    const judul = row[1];
    const isi   = row[2];
    const tgl   = row[3];
    const active = row[4];
    const photoRaw = row[5] || "";      // kolom F = foto pilihan puisi
    const photoLabel = row[6] || "";    // kolom G = label foto (opsional)

    if (!id || String(active).toUpperCase() !== "TRUE") continue;

    result.push({
      id:         id,
      judul:      judul || "Puisi",
      isi:        isi   || "",
      tgl:        tgl   || "",
      photo:      convertDriveUrl(String(photoRaw || "")),
      photoLabel: photoLabel || ""
    });
  }

  return result;
}

// ═══════════════════════════════════════════════
//  POST / ADD FUNCTIONS
// ═══════════════════════════════════════════════

function addPhoto(data) {
  const sheet = getSheet("📷 Photos");
  const lastRow = getLastDataRow(sheet);
  const nextId  = lastRow - 2; // rows 1-3 are headers/title

  // Handle base64 upload to Drive
  let driveUrl = data.url || "";
  if (data.base64 && data.filename) {
    driveUrl = uploadToDrive(data.base64, data.filename);
  }

  sheet.getRange(lastRow + 1, 1, 1, 7).setValues([[
    nextId,
    data.caption  || "",
    data.year     || new Date().getFullYear(),
    data.people   || "",
    driveUrl,
    nextId,
    "TRUE"
  ]]);

  return { success: true, id: nextId, url: driveUrl };
}

function addQuote(data) {
  const sheet   = getSheet("💬 Quotes");
  const lastRow = getLastDataRow(sheet);
  const nextId  = lastRow - 2;

  sheet.getRange(lastRow + 1, 1, 1, 5).setValues([[
    nextId,
    data.text     || "",
    data.author   || "Anonim",
    data.category || "Lainnya",
    "TRUE"
  ]]);

  return { success: true, id: nextId };
}

function addTimeline(data) {
  const sheet   = getSheet("📅 Timeline");
  const lastRow = getLastDataRow(sheet);
  const nextId  = lastRow - 2;

  sheet.getRange(lastRow + 1, 1, 1, 6).setValues([[
    nextId,
    data.year  || "",
    data.title || "",
    data.desc  || "",
    data.icon  || "📌",
    "TRUE"
  ]]);

  return { success: true, id: nextId };
}

function addPuisi(data) {
  const sheet   = getSheet("📜 Puisi Ayah");
  const lastRow = getLastDataRow(sheet);
  const nextId  = lastRow - 2;

  const photoInput = data.photo || data.foto || data.photoUrl || data.imageUrl || "";
  const photoLabel = data.photoLabel || "";

  // Simpan ke 7 kolom:
  // A:id, B:judul, C:isi, D:tgl, E:active, F:photo, G:photoLabel
  sheet.getRange(lastRow + 1, 1, 1, 7).setValues([[
    nextId,
    data.judul || "Tanpa Judul",
    data.isi   || "",
    data.tgl   || "",
    "TRUE",
    photoInput,
    photoLabel
  ]]);

  return { success: true, id: nextId, photo: convertDriveUrl(String(photoInput || "")) };
}

// ═══════════════════════════════════════════════
//  HELPER: Upload base64 image ke Google Drive
// ═══════════════════════════════════════════════

function uploadToDrive(base64Data, filename) {
  // Buat folder "Kenangan Keluarga" di Drive jika belum ada
  let folder;
  const folders = DriveApp.getFoldersByName("Kenangan Keluarga");
  if (folders.hasNext()) {
    folder = folders.next();
  } else {
    folder = DriveApp.createFolder("Kenangan Keluarga");
    folder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  }

  // Decode base64
  const mimeMatch = base64Data.match(/^data:([^;]+);base64,/);
  const mimeType  = mimeMatch ? mimeMatch[1] : "image/jpeg";
  const cleanData = base64Data.replace(/^data:[^;]+;base64,/, "");
  const blob      = Utilities.newBlob(Utilities.base64Decode(cleanData), mimeType, filename);

  // Simpan file
  const file = folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

  return convertDriveUrl("https://drive.google.com/file/d/" + file.getId() + "/view");
}

// ═══════════════════════════════════════════════
//  UTILITY
// ═══════════════════════════════════════════════

// Konversi URL Drive ke format thumbnail yang bisa ditampilkan sebagai <img>
function convertDriveUrl(url) {
  if (!url) return "";
  // Format: /file/d/FILE_ID/view atau /file/d/FILE_ID/edit
  const match = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (match) {
    return "https://drive.google.com/thumbnail?id=" + match[1] + "&sz=w800";
  }
  // Format: open?id=FILE_ID atau uc?id=FILE_ID
  const match2 = url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (match2) {
    return "https://drive.google.com/thumbnail?id=" + match2[1] + "&sz=w800";
  }
  return url;
}

function getSheet(name) {
  const ss = SHEET_ID
    ? SpreadsheetApp.openById(SHEET_ID)
    : SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(name);
  if (!sheet) throw new Error("Sheet tidak ditemukan: " + name);
  return sheet;
}

function getLastDataRow(sheet) {
  const data = sheet.getDataRange().getValues();
  for (let i = data.length - 1; i >= 3; i--) {
    if (data[i][0] !== "") return i + 1; // 1-indexed
  }
  return 4; // mulai dari row 4 (setelah 3 header rows)
}

function jsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}