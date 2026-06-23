'use strict';
/**
 * lib/harvest/extractors.js — File extractors for PurpClaw Data Harvester.
 * Pulls text and metadata from every supported format.
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSafe } = require('../child-registry');

/**
 * Extract text from a file. Returns { text, metadata, ok }.
 */
async function extract(filePath, ext) {
  const extLower = (ext || path.extname(filePath)).toLowerCase();
  const fileName = path.basename(filePath);
  const stat = fs.statSync(filePath);
  
  const baseMeta = {
    fileName,
    ext: extLower,
    size: stat.size,
    created: stat.birthtime?.toISOString(),
    modified: stat.mtime?.toISOString(),
    path: filePath,
  };

  // Text-based: just read
  const textExts = ['.txt', '.md', '.rtf', '.json', '.xml', '.yaml', '.yml',
    '.js', '.ts', '.tsx', '.jsx', '.py', '.rb', '.go', '.rs', '.java',
    '.cpp', '.c', '.h', '.hpp', '.sh', '.bash', '.ps1', '.bat',
    '.sql', '.r', '.m', '.swift', '.kt', '.scala', '.lua', '.php',
    '.pl', '.pm', '.css', '.html', '.htm', '.cfg', '.conf', '.ini',
    '.env', '.gitignore', '.dockerfile', '.proto', '.gradle',
    '.srt', '.vtt', '.log', '.toml'];
  
  if (textExts.includes(extLower)) {
    const content = fs.readFileSync(filePath, 'utf8').trim();
    return { ok: true, text: content, metadata: { ...baseMeta, lines: content.split('\n').length }, method: 'text' };
  }

  // CSV
  if (extLower === '.csv') {
    const raw = fs.readFileSync(filePath, 'utf8').trim();
    const lines = raw.split('\n');
    const headers = lines[0]?.split(',').map(h => h.trim()) || [];
    return { ok: true, text: raw, metadata: { ...baseMeta, columns: headers.length, rows: lines.length - 1 }, method: 'csv' };
  }

  // PDF — try pymupdf, fall back to pdftotext
  if (extLower === '.pdf') {
    return await extractPDF(filePath, baseMeta);
  }

  // DOCX
  if (extLower === '.docx') {
    return await extractDOCX(filePath, baseMeta);
  }

  // XLSX
  if (extLower === '.xlsx' || extLower === '.xls') {
    return await extractXLSX(filePath, baseMeta);
  }

  // Images — try OCR via Tesseract
  const imgExts = ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp', '.tiff', '.tif'];
  if (imgExts.includes(extLower)) {
    return await extractImageOCR(filePath, baseMeta);
  }

  // Archives — list contents
  const archiveExts = ['.zip', '.7z', '.rar', '.tar', '.gz'];
  if (archiveExts.includes(extLower)) {
    return await extractArchive(filePath, baseMeta);
  }

  return { ok: false, text: '', metadata: baseMeta, method: 'unsupported', error: `No extractor for ${extLower}` };
}

async function extractPDF(filePath, meta) {
  // Try pymupdf first
  try {
    const r = await execSafe('python', ['-c', `
import sys, json
try:
    import fitz
    doc = fitz.open(sys.argv[1])
    text = '\\n'.join([page.get_text() for page in doc])
    print(json.dumps({"ok": True, "text": text[:50000], "pages": len(doc)}))
except Exception as e:
    print(json.dumps({"ok": False, "error": str(e)}))
`, filePath], { timeoutMs: 30000 });
    if (r.ok) {
      const d = JSON.parse(r.stdout);
      if (d.ok) return { ok: true, text: d.text, metadata: { ...meta, pages: d.pages }, method: 'pymupdf' };
    }
  } catch {}
  return { ok: false, text: '', metadata: meta, method: 'pdf', error: 'PDF extraction failed (install pymupdf)' };
}

async function extractDOCX(filePath, meta) {
  try {
    // docx2txt is a pure Python fallback
    const r = await execSafe('python', ['-c', `
import sys, json
try:
    from docx import Document
    doc = Document(sys.argv[1])
    text = '\\n'.join([p.text for p in doc.paragraphs])
    print(json.dumps({"ok": True, "text": text[:50000]}))
except Exception as e:
    print(json.dumps({"ok": False, "error": str(e)}))
`, filePath], { timeoutMs: 15000 });
    if (r.ok) {
      const d = JSON.parse(r.stdout);
      if (d.ok) return { ok: true, text: d.text, metadata: meta, method: 'python-docx' };
    }
  } catch {}
  return { ok: false, text: '', metadata: meta, method: 'docx', error: 'DOCX extraction failed (install python-docx)' };
}

async function extractXLSX(filePath, meta) {
  try {
    const r = await execSafe('python', ['-c', `
import sys, json
try:
    import openpyxl
    wb = openpyxl.load_workbook(sys.argv[1], read_only=True, data_only=True)
    sheets = []
    for name in wb.sheetnames:
        ws = wb[name]
        rows = []
        for i, row in enumerate(ws.iter_rows(values_only=True)):
            if i > 200: break
            rows.append([str(c or '') for c in row])
        sheets.append({"name": name, "rows": len(rows), "data": rows[:50]})
    print(json.dumps({"ok": True, "sheets": sheets}))
except Exception as e:
    print(json.dumps({"ok": False, "error": str(e)}))
`, filePath], { timeoutMs: 30000 });
    if (r.ok) {
      const d = JSON.parse(r.stdout);
      if (d.ok) {
        const text = d.sheets.map(s => `[${s.name}] ${s.rows} rows\n${s.data.map(r => r.join(', ')).join('\n')}`).join('\n\n');
        return { ok: true, text: text.substring(0, 50000), metadata: { ...meta, sheets: d.sheets.length }, method: 'openpyxl' };
      }
    }
  } catch {}
  return { ok: false, text: '', metadata: meta, method: 'xlsx', error: 'XLSX extraction failed (install openpyxl)' };
}

async function extractImageOCR(filePath, meta) {
  try {
    const r = await execSafe('python', ['-c', `
import sys, json
try:
    from PIL import Image
    import pytesseract
    text = pytesseract.image_to_string(Image.open(sys.argv[1]))
    print(json.dumps({"ok": True, "text": text[:20000]}))
except Exception as e:
    print(json.dumps({"ok": False, "error": str(e)}))
`, filePath], { timeoutMs: 30000 });
    if (r.ok) {
      const d = JSON.parse(r.stdout);
      if (d.ok) return { ok: true, text: d.text, metadata: { ...meta, ocr: true }, method: 'tesseract' };
    }
  } catch {}
  return { ok: false, text: '', metadata: meta, method: 'ocr', error: 'OCR failed (install pytesseract + tesseract)' };
}

async function extractArchive(filePath, meta) {
  try {
    const r = await execSafe('python', ['-c', `
import sys, json, zipfile, tarfile
path = sys.argv[1]
entries = []
if path.endswith('.zip'):
    with zipfile.ZipFile(path) as z:
        for info in z.infolist():
            entries.append({"name": info.filename, "size": info.file_size, "compressed": info.compress_size})
elif path.endswith('.tar') or path.endswith('.tar.gz') or path.endswith('.tgz'):
    with tarfile.open(path) as t:
        for m in t.getmembers():
            entries.append({"name": m.name, "size": m.size})
elif path.endswith('.7z') or path.endswith('.rar'):
    entries.append({"name": "(requires py7zr/rarfile)", "size": 0})
print(json.dumps({"ok": True, "entries": entries[:200]}))
`, filePath], { timeoutMs: 15000 });
    if (r.ok) {
      const d = JSON.parse(r.stdout);
      if (d.ok) {
        const listing = d.entries.map(e => `  ${e.name} (${e.size} bytes)`).join('\n');
        return { ok: true, text: `Archive contents:\n${listing}`, metadata: { ...meta, fileCount: d.entries.length }, method: 'archive-listing' };
      }
    }
  } catch {}
  return { ok: false, text: '', metadata: meta, method: 'archive', error: 'Archive listing failed' };
}

module.exports = { extract };
