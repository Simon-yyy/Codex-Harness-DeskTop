const { app, BrowserWindow, ipcMain, dialog, shell, Menu, safeStorage } = require("electron");
const path = require("path");
const fs = require("fs");
const os = require("os");
const http = require("http");
const https = require("https");
const { spawn } = require("child_process");
const zlib = require("zlib");
const crypto = require("crypto");
const { pathToFileURL } = require("url");

let mainWindow = null;
let isDownloadingUpdate = false;
let isQuitting = false;
let pendingUpdateInstallerPath = null;

const MAX_DOCX_SOURCE_BYTES = 8 * 1024 * 1024;
/** @ 挂载 / 普通抽取默认上限 */
const MAX_EXTRACTED_TEXT_CHARS = 80000;
/** 论文分块索引允许抽取更长正文（仍不进入单轮 prompt） */
const MAX_INDEX_EXTRACTED_TEXT_CHARS = 500000;
/** 分块目标大小 / 单块工具返回上限 */
const DOC_CHUNK_TARGET_CHARS = 6000;
const DOC_CHUNK_MAX_RETURN_CHARS = 12000;

function findZipEocd(buf) {
  const min = Math.max(0, buf.length - (22 + 65535));
  for (let i = buf.length - 22; i >= min; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) return i;
  }
  return -1;
}

function readZipEntry(buf, entryName) {
  const eocd = findZipEocd(buf);
  if (eocd < 0) return null;
  const cdSize = buf.readUInt32LE(eocd + 12);
  const cdOffset = buf.readUInt32LE(eocd + 16);
  if (cdOffset < 0 || cdOffset + cdSize > buf.length) return null;
  let p = cdOffset;
  const cdEnd = cdOffset + cdSize;
  const want = String(entryName).replace(/\\/g, "/");
  while (p + 46 <= cdEnd) {
    if (buf.readUInt32LE(p) !== 0x02014b50) break;
    const method = buf.readUInt16LE(p + 10);
    const compSize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localOff = buf.readUInt32LE(p + 42);
    const name = buf.slice(p + 46, p + 46 + nameLen).toString("utf8").replace(/\\/g, "/");
    if (name === want) {
      if (localOff + 30 > buf.length || buf.readUInt32LE(localOff) !== 0x04034b50) return null;
      const localNameLen = buf.readUInt16LE(localOff + 26);
      const localExtraLen = buf.readUInt16LE(localOff + 28);
      const dataStart = localOff + 30 + localNameLen + localExtraLen;
      const dataEnd = dataStart + compSize;
      if (dataEnd > buf.length) return null;
      const data = buf.slice(dataStart, dataEnd);
      if (method === 0) return data;
      if (method === 8) return zlib.inflateRawSync(data);
      return null;
    }
    p += 46 + nameLen + extraLen + commentLen;
  }
  return null;
}

function decodeXmlText(s) {
  return String(s || "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function extractTag(xml, tagName) {
  const startTagRegex = new RegExp(`<${tagName}(?:\\s+[^>]*)?>`, 'i');
  const startMatch = startTagRegex.exec(xml);
  if (!startMatch) return null;
  const startIndex = startMatch.index + startMatch[0].length;
  const closeTag = `</${tagName}>`;
  let depth = 1;
  let pos = startIndex;
  while (pos < xml.length) {
    const openRegex = new RegExp(`<${tagName}(?:[\\s>/])`, 'ig');
    openRegex.lastIndex = pos;
    const openMatch = openRegex.exec(xml);
    const nextOpen = openMatch ? openMatch.index : -1;
    const nextClose = xml.indexOf(closeTag, pos);
    if (nextClose === -1) break;
    if (nextOpen !== -1 && nextOpen < nextClose) {
      depth++;
      pos = nextOpen + tagName.length + 1;
    } else {
      depth--;
      if (depth === 0) {
        return {
          content: xml.slice(startIndex, nextClose),
          tagHeader: startMatch[0],
          fullMatch: xml.slice(startMatch.index, nextClose + closeTag.length),
          start: startMatch.index,
          end: nextClose + closeTag.length
        };
      }
      pos = nextClose + closeTag.length;
    }
  }
  return null;
}

/** 递归解析 OMML (Office Math Markup Language) 转译为标准 LaTeX */
function ommlToLatex(xmlSnippet) {
  if (!xmlSnippet || typeof xmlSnippet !== 'string') return '';

  function parseNodes(str) {
    if (!str) return '';
    let result = '';
    let i = 0;

    while (i < str.length) {
      const nextTagStart = str.indexOf('<', i);
      if (nextTagStart === -1) break;
      const tagMatch = /^<([a-zA-Z0-9_:]+)(?:\s+([^>]*))?(\/?)>/.exec(str.slice(nextTagStart));
      if (!tagMatch) {
        i = nextTagStart + 1;
        continue;
      }
      const rawTagName = tagMatch[1];
      const localName = rawTagName.includes(':') ? rawTagName.split(':')[1] : rawTagName;
      const isSelfClosing = tagMatch[3] === '/';

      if (isSelfClosing) {
        i = nextTagStart + tagMatch[0].length;
        continue;
      }

      const extracted = extractTag(str.slice(nextTagStart), rawTagName);
      if (!extracted) {
        i = nextTagStart + tagMatch[0].length;
        continue;
      }

      const innerXml = extracted.content;
      i = nextTagStart + extracted.end;

      switch (localName) {
        case 'oMath':
        case 'oMathPara':
        case 'e':
          result += parseNodes(innerXml);
          break;
        case 't':
          result += mapMathText(decodeXmlText(innerXml));
          break;
        case 'r':
          result += parseNodes(innerXml);
          break;
        case 'f': {
          const numObj = extractTag(innerXml, 'm:num') || extractTag(innerXml, 'num');
          const denObj = extractTag(innerXml, 'm:den') || extractTag(innerXml, 'den');
          const num = numObj ? parseNodes(numObj.content) : '';
          const den = denObj ? parseNodes(denObj.content) : '';
          result += `\\frac{${num.trim()}}{${den.trim()}}`;
          break;
        }
        case 'sSup': {
          const baseObj = extractTag(innerXml, 'm:e') || extractTag(innerXml, 'e');
          const supObj = extractTag(innerXml, 'm:sup') || extractTag(innerXml, 'sup');
          const base = baseObj ? parseNodes(baseObj.content) : '';
          const sup = supObj ? parseNodes(supObj.content) : '';
          result += `{${base.trim()}}^{${sup.trim()}}`;
          break;
        }
        case 'sSub': {
          const baseObj = extractTag(innerXml, 'm:e') || extractTag(innerXml, 'e');
          const subObj = extractTag(innerXml, 'm:sub') || extractTag(innerXml, 'sub');
          const base = baseObj ? parseNodes(baseObj.content) : '';
          const sub = subObj ? parseNodes(subObj.content) : '';
          result += `{${base.trim()}}_{${sub.trim()}}`;
          break;
        }
        case 'sSubSup': {
          const baseObj = extractTag(innerXml, 'm:e') || extractTag(innerXml, 'e');
          const subObj = extractTag(innerXml, 'm:sub') || extractTag(innerXml, 'sub');
          const supObj = extractTag(innerXml, 'm:sup') || extractTag(innerXml, 'sup');
          const base = baseObj ? parseNodes(baseObj.content) : '';
          const sub = subObj ? parseNodes(subObj.content) : '';
          const sup = supObj ? parseNodes(supObj.content) : '';
          result += `{${base.trim()}}_{${sub.trim()}}^{${sup.trim()}}`;
          break;
        }
        case 'rad': {
          const degObj = extractTag(innerXml, 'm:deg') || extractTag(innerXml, 'deg');
          const baseObj = extractTag(innerXml, 'm:e') || extractTag(innerXml, 'e');
          const deg = degObj ? parseNodes(degObj.content).trim() : '';
          const base = baseObj ? parseNodes(baseObj.content).trim() : '';
          if (deg) result += `\\sqrt[${deg}]{${base}}`;
          else result += `\\sqrt{${base}}`;
          break;
        }
        case 'nary': {
          let op = '\\sum';
          const prObj = extractTag(innerXml, 'm:naryPr') || extractTag(innerXml, 'naryPr');
          if (prObj) {
            const chrMatch = /val="([^"]+)"/.exec(prObj.content);
            if (chrMatch) {
              const ch = chrMatch[1];
              if (ch === '∫') op = '\\int';
              else if (ch === '∬') op = '\\iint';
              else if (ch === '∭') op = '\\iiint';
              else if (ch === '∮') op = '\\oint';
              else if (ch === '∏') op = '\\prod';
              else if (ch === '⋂') op = '\\bigcap';
              else if (ch === '⋃') op = '\\bigcup';
              else if (ch === '∑') op = '\\sum';
            }
          }
          const subObj = extractTag(innerXml, 'm:sub') || extractTag(innerXml, 'sub');
          const supObj = extractTag(innerXml, 'm:sup') || extractTag(innerXml, 'sup');
          const baseObj = extractTag(innerXml, 'm:e') || extractTag(innerXml, 'e');
          const sub = subObj ? parseNodes(subObj.content).trim() : '';
          const sup = supObj ? parseNodes(supObj.content).trim() : '';
          const base = baseObj ? parseNodes(baseObj.content).trim() : '';
          let naryStr = op;
          if (sub) naryStr += `_{${sub}}`;
          if (sup) naryStr += `^{${sup}}`;
          result += `${naryStr} ${base}`;
          break;
        }
        case 'd': {
          let beg = '(';
          let end = ')';
          const prObj = extractTag(innerXml, 'm:dPr') || extractTag(innerXml, 'dPr');
          if (prObj) {
            const begMatch = /<m:begChr[^>]*val="([^"]*)"/.exec(prObj.content);
            const endMatch = /<m:endChr[^>]*val="([^"]*)"/.exec(prObj.content);
            if (begMatch) beg = begMatch[1];
            if (endMatch) end = endMatch[1];
          }
          const baseObj = extractTag(innerXml, 'm:e') || extractTag(innerXml, 'e');
          const base = baseObj ? parseNodes(baseObj.content).trim() : '';
          const mapDelimiter = (ch) => {
            if (!ch) return '.';
            if (ch === '{') return '\\{';
            if (ch === '}') return '\\}';
            if (ch === '|') return '|';
            if (ch === '||' || ch === '‖') return '\\|';
            return ch;
          };
          result += `\\left${mapDelimiter(beg)} ${base} \\right${mapDelimiter(end)}`;
          break;
        }
        case 'm': {
          const rows = [];
          let searchIdx = 0;
          while (searchIdx < innerXml.length) {
            const rowExtracted = extractTag(innerXml.slice(searchIdx), 'm:mr') || extractTag(innerXml.slice(searchIdx), 'mr');
            if (!rowExtracted) break;
            searchIdx += rowExtracted.end;
            const cells = [];
            let cellSearch = 0;
            while (cellSearch < rowExtracted.content.length) {
              const cellExtracted = extractTag(rowExtracted.content.slice(cellSearch), 'm:e') || extractTag(rowExtracted.content.slice(cellSearch), 'e');
              if (!cellExtracted) break;
              cellSearch += cellExtracted.end;
              cells.push(parseNodes(cellExtracted.content).trim());
            }
            if (cells.length) rows.push(cells.join(' & '));
          }
          if (rows.length) result += `\\begin{matrix} ${rows.join(' \\\\ ')} \\end{matrix}`;
          break;
        }
        case 'acc': {
          let chr = '^';
          const prObj = extractTag(innerXml, 'm:accPr') || extractTag(innerXml, 'accPr');
          if (prObj) {
            const chrMatch = /val="([^"]+)"/.exec(prObj.content);
            if (chrMatch) chr = chrMatch[1];
          }
          const baseObj = extractTag(innerXml, 'm:e') || extractTag(innerXml, 'e');
          const base = baseObj ? parseNodes(baseObj.content).trim() : '';
          if (chr === '̂' || chr === '^') result += `\\hat{${base}}`;
          else if (chr === '̄' || chr === '-') result += `\\bar{${base}}`;
          else if (chr === '⃗' || chr === '→') result += `\\vec{${base}}`;
          else if (chr === '̇') result += `\\dot{${base}}`;
          else if (chr === '̈') result += `\\ddot{${base}}`;
          else if (chr === '̃' || chr === '~') result += `\\tilde{${base}}`;
          else result += `\\bar{${base}}`;
          break;
        }
        default:
          result += parseNodes(innerXml);
          break;
      }
    }
    return result;
  }

  function mapMathText(text) {
    if (!text) return '';
    const symbolMap = {
      '±': '\\pm ', '×': '\\times ', '÷': '\\div ', '·': '\\cdot ',
      '≤': '\\le ', '≥': '\\ge ', '≠': '\\ne ', '≈': '\\approx ',
      '≡': '\\equiv ', '∈': '\\in ', '∉': '\\notin ', '⊂': '\\subset ',
      '⊆': '\\subseteq ', '∪': '\\cup ', '∩': '\\cap ', '∧': '\\land ',
      '∨': '\\lor ', '¬': '\\neg ', '⇒': '\\Rightarrow ', '⇔': '\\Leftrightarrow ',
      '→': '\\rightarrow ', '←': '\\leftarrow ', '↑': '\\uparrow ', '↓': '\\downarrow ',
      '∞': '\\infty ', '∂': '\\partial ', '∇': '\\nabla ', '∀': '\\forall ',
      '∃': '\\exists ', '∅': '\\emptyset ',
      'α': '\\alpha ', 'β': '\\beta ', 'γ': '\\gamma ', 'δ': '\\delta ',
      'ε': '\\epsilon ', 'ζ': '\\zeta ', 'η': '\\eta ', 'θ': '\\theta ',
      'ι': '\\iota ', 'κ': '\\kappa ', 'λ': '\\lambda ', 'μ': '\\mu ',
      'ν': '\\nu ', 'ξ': '\\xi ', 'π': '\\pi ', 'ρ': '\\rho ',
      'σ': '\\sigma ', 'τ': '\\tau ', 'υ': '\\upsilon ', 'φ': '\\phi ',
      'χ': '\\chi ', 'ψ': '\\psi ', 'ω': '\\omega ',
      'Γ': '\\Gamma ', 'Δ': '\\Delta ', 'Θ': '\\Theta ', 'Λ': '\\Lambda ',
      'Ξ': '\\Xi ', 'Π': '\\Pi ', 'Σ': '\\Sigma ', 'Υ': '\\Upsilon ',
      'Φ': '\\Phi ', 'Ψ': '\\Psi ', 'Ω': '\\Omega '
    };
    let mapped = '';
    for (const char of text) {
      mapped += symbolMap[char] || char;
    }
    return mapped;
  }

  return parseNodes(xmlSnippet).trim().replace(/\s+/g, ' ');
}

// 提取 docx 关系表 (rId -> target)
function parseDocxRels(buf) {
  const relsBuf = readZipEntry(buf, "word/_rels/document.xml.rels");
  if (!relsBuf) return {};
  const xml = relsBuf.toString("utf8");
  const rels = {};
  const relRegex = /<Relationship\s+([^>]+)\/>/gi;
  let m;
  while ((m = relRegex.exec(xml))) {
    const attrs = m[1];
    const idMatch = /Id="([^"]+)"/i.exec(attrs);
    const targetMatch = /Target="([^"]+)"/i.exec(attrs);
    const typeMatch = /Type="([^"]+)"/i.exec(attrs);
    if (idMatch && targetMatch) {
      const id = idMatch[1];
      let target = targetMatch[1].replace(/\\/g, "/");
      if (!target.startsWith("word/") && !target.startsWith("/")) {
        target = "word/" + target;
      } else if (target.startsWith("/")) {
        target = target.slice(1);
      }
      rels[id] = {
        target,
        type: typeMatch ? typeMatch[1] : ""
      };
    }
  }
  return rels;
}

function getMimeType(filePath) {
  const ext = (filePath.split(".").pop() || "").toLowerCase();
  switch (ext) {
    case "png": return "image/png";
    case "jpg":
    case "jpeg": return "image/jpeg";
    case "gif": return "image/gif";
    case "webp": return "image/webp";
    case "svg": return "image/svg+xml";
    case "bmp": return "image/bmp";
    default: return "application/octet-stream";
  }
}

/** 从 OOXML .docx 抽取出富文本块序列（标题、段落、公式、图片、表格） */
function extractDocxRichDocument(buf) {
  if (!buf || !Buffer.isBuffer(buf) || buf.length < 4 || buf[0] !== 0x50 || buf[1] !== 0x4b) {
    const err = new Error("不是有效的 .docx");
    err.code = "INVALID_DOCX";
    throw err;
  }
  const xmlBuf = readZipEntry(buf, "word/document.xml");
  if (!xmlBuf) {
    const err = new Error("不是有效的 .docx（缺少 word/document.xml）");
    err.code = "INVALID_DOCX";
    throw err;
  }
  const rels = parseDocxRels(buf);
  const xml = xmlBuf.toString("utf8");

  // 提取全部内置图片
  const imagesMap = {};
  let imagesCount = 0;
  for (const [rId, rel] of Object.entries(rels)) {
    if (rel.type && rel.type.includes("/image")) {
      const imgBuf = readZipEntry(buf, rel.target);
      if (imgBuf) {
        const mime = getMimeType(rel.target);
        imagesMap[rId] = {
          id: rId,
          name: path.basename(rel.target),
          dataUrl: `data:${mime};base64,${imgBuf.toString("base64")}`,
          alt: path.basename(rel.target)
        };
        imagesCount++;
      }
    }
  }

  const blocks = [];
  let mathCount = 0;
  let docTitle = "";

  function parseParagraphRuns(pXml) {
    const runs = [];
    const runRegex = /(<m:oMath>[\s\S]*?<\/m:oMath>|<w:r(?:\s[^>]*)?>[\s\S]*?<\/w:r>)/g;
    let m;
    while ((m = runRegex.exec(pXml))) {
      const chunk = m[1];
      if (chunk.startsWith("<m:oMath>")) {
        const latex = ommlToLatex(chunk);
        if (latex) {
          runs.push({ type: "math", text: latex });
          mathCount++;
        }
      } else {
        const isBold = /<w:b(?:\s[^>]*)?\/>/.test(chunk);
        const isItalic = /<w:i(?:\s[^>]*)?\/>/.test(chunk);
        const bits = [];
        const tRegex = /<w:tab\s*\/>|<w:br\s*\/>|<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g;
        let tm;
        while ((tm = tRegex.exec(chunk))) {
          if (tm[0].startsWith("<w:tab")) bits.push("\t");
          else if (tm[0].startsWith("<w:br")) bits.push("\n");
          else if (tm[1]) bits.push(decodeXmlText(tm[1]));
        }
        const text = bits.join("");
        if (text) {
          runs.push({
            type: isBold ? "bold" : isItalic ? "italic" : "text",
            text
          });
        }
      }
    }
    return runs;
  }

  const blockRegex = /(<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>|<w:tbl(?:\s[^>]*)?>[\s\S]*?<\/w:tbl>)/g;
  let bm;
  while ((bm = blockRegex.exec(xml))) {
    const chunk = bm[1];
    if (chunk.startsWith("<w:tbl")) {
      const tableData = [];
      const rowRegex = /<w:tr(?:\s[^>]*)?>([\s\S]*?)<\/w:tr>/g;
      let rm;
      while ((rm = rowRegex.exec(chunk))) {
        const rowXml = rm[1];
        const cells = [];
        const cellRegex = /<w:tc(?:\s[^>]*)?>([\s\S]*?)<\/w:tc>/g;
        let cm;
        while ((cm = cellRegex.exec(rowXml))) {
          const cellXml = cm[1];
          const cBits = [];
          const ctRegex = /<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g;
          let ctm;
          while ((ctm = ctRegex.exec(cellXml))) {
            if (ctm[1]) cBits.push(decodeXmlText(ctm[1]));
          }
          cells.push(cBits.join(" ").trim());
        }
        if (cells.length) tableData.push(cells);
      }
      if (tableData.length) {
        blocks.push({ type: "table", tableData });
      }
    } else {
      // 段落 <w:p>
      const imgEmbedMatch = /<[a-zA-Z0-9:]*blip[^>]*r:embed="([^"]+)"|<[a-zA-Z0-9:]*imagedata[^>]*r:id="([^"]+)"/i.exec(chunk);
      if (imgEmbedMatch) {
        const rId = imgEmbedMatch[1] || imgEmbedMatch[2];
        if (imagesMap[rId]) {
          blocks.push({
            type: "image",
            image: imagesMap[rId]
          });
        }
      }

      if (chunk.includes("<m:oMathPara>")) {
        const mathParaMatch = /<m:oMathPara>([\s\S]*?)<\/m:oMathPara>/g;
        let mpm;
        while ((mpm = mathParaMatch.exec(chunk))) {
          const latex = ommlToLatex(mpm[1]);
          if (latex) {
            blocks.push({
              type: "math-block",
              latex
            });
            mathCount++;
          }
        }
        continue;
      }

      let headingLevel = 0;
      const pStyleMatch = /<w:pStyle\s+[^>]*w:val="([^"]+)"/i.exec(chunk);
      if (pStyleMatch) {
        const styleVal = pStyleMatch[1].toLowerCase();
        if (styleVal.includes("heading1") || styleVal === "1" || styleVal === "title") headingLevel = 1;
        else if (styleVal.includes("heading2") || styleVal === "2" || styleVal === "subtitle") headingLevel = 2;
        else if (styleVal.includes("heading3") || styleVal === "3") headingLevel = 3;
      }

      const runs = parseParagraphRuns(chunk);
      const text = runs.map((r) => r.text).join("");

      if (!docTitle && headingLevel === 1 && text.trim()) {
        docTitle = text.trim();
      }

      if (runs.length > 0 && text.trim()) {
        if (headingLevel > 0) {
          blocks.push({
            type: "heading",
            level: headingLevel,
            text,
            runs
          });
        } else {
          blocks.push({
            type: "paragraph",
            text,
            runs
          });
        }
      }
    }
  }

  return {
    title: docTitle,
    blocks,
    imagesCount,
    mathCount
  };
}

/** 从 OOXML .docx 抽出段落纯文本（保留转译后的 LaTeX 公式给大模型） */
function extractDocxPlainText(buf, maxChars = MAX_EXTRACTED_TEXT_CHARS) {
  const xmlBuf = readZipEntry(buf, "word/document.xml");
  if (!xmlBuf) {
    const err = new Error("不是有效的 .docx（缺少 word/document.xml）");
    err.code = "INVALID_DOCX";
    throw err;
  }
  let xml = xmlBuf.toString("utf8");

  // 将 OMML 公式替换为标准 LaTeX 文本，注入给大模型
  xml = xml
    .replace(/<m:oMathPara(?:\s[^>]*)?>([\s\S]*?)<\/m:oMathPara>/g, (_m, p) => {
      const latex = ommlToLatex(p);
      return latex ? `<w:t> \n$$ ${latex} $$\n </w:t>` : "";
    })
    .replace(/<m:oMath(?:\s[^>]*)?>([\s\S]*?)<\/m:oMath>/g, (_m, p) => {
      const latex = ommlToLatex(p);
      return latex ? `<w:t> $${latex}$ </w:t>` : "";
    });

  const paras = [];
  for (const chunk of xml.split(/<\/w:p>/)) {
    const bits = [];
    const re = /<w:tab\s*\/>|<w:br\s*\/>|<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g;
    let m;
    while ((m = re.exec(chunk))) {
      if (m[0].startsWith("<w:tab")) bits.push("\t");
      else if (m[0].startsWith("<w:br")) bits.push("\n");
      else if (m[1]) bits.push(decodeXmlText(m[1]));
    }
    const line = bits.join("").replace(/[ \t]+\n/g, "\n").trim();
    if (line) paras.push(line);
  }
  const text = paras.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  if (!text) {
    const err = new Error("未能从文档中抽出正文");
    err.code = "EMPTY_DOCX";
    throw err;
  }
  const limit = typeof maxChars === "number" && maxChars > 0 ? maxChars : MAX_EXTRACTED_TEXT_CHARS;
  if (text.length > limit) {
    return {
      text: text.slice(0, limit) + "\n\n[⚠️ 正文过长，已截取前部]",
      truncated: true
    };
  }
  return { text, truncated: false };
}

function loadDocxBuffer(buf, maxChars = MAX_EXTRACTED_TEXT_CHARS) {
  if (!buf || !Buffer.isBuffer(buf) || buf.length < 4 || buf[0] !== 0x50 || buf[1] !== 0x4b) {
    const err = new Error("不是有效的 .docx");
    err.code = "INVALID_DOCX";
    throw err;
  }
  if (buf.length > MAX_DOCX_SOURCE_BYTES) {
    const err = new Error("docx 超过 8MB，请先另存精简后再引用");
    err.code = "FILE_TOO_LARGE";
    throw err;
  }
  return extractDocxPlainText(buf, maxChars);
}

const MAX_PDF_SOURCE_BYTES = MAX_DOCX_SOURCE_BYTES;
let pdfjsModulePromise = null;

/** 打包后 Worker/CMap 必须走 asar.unpacked，否则 Electron 读不到文件 */
function pdfjsRootDir() {
  const packed = path.dirname(require.resolve("pdfjs-dist/package.json"));
  return packed.replace(`${path.sep}app.asar${path.sep}`, `${path.sep}app.asar.unpacked${path.sep}`);
}

function loadPdfjs() {
  if (!pdfjsModulePromise) {
    pdfjsModulePromise = import("pdfjs-dist/legacy/build/pdf.mjs").then((mod) => {
      const workerFile = path.join(pdfjsRootDir(), "legacy", "build", "pdf.worker.mjs");
      if (mod.GlobalWorkerOptions) {
        mod.GlobalWorkerOptions.workerSrc = pathToFileURL(workerFile).href;
      }
      return mod;
    });
  }
  return pdfjsModulePromise;
}

/** 从文字型 PDF 抽出纯文本。扫描件没有文字层时明确失败，不做 OCR。 */
async function extractPdfPlainText(buf, maxChars = MAX_EXTRACTED_TEXT_CHARS) {
  if (!buf || !Buffer.isBuffer(buf) || buf.length < 5 || buf.slice(0, 5).toString("latin1") !== "%PDF-") {
    const err = new Error("不是有效的 PDF");
    err.code = "INVALID_PDF";
    throw err;
  }
  if (buf.length > MAX_PDF_SOURCE_BYTES) {
    const err = new Error("PDF 超过 8MB，请先另存精简后再引用");
    err.code = "FILE_TOO_LARGE";
    throw err;
  }
  const limit = typeof maxChars === "number" && maxChars > 0 ? maxChars : MAX_EXTRACTED_TEXT_CHARS;
  const pdfjs = await loadPdfjs();
  const rootDir = pdfjsRootDir();
  const task = pdfjs.getDocument({
    data: new Uint8Array(buf),
    cMapUrl: pathToFileURL(path.join(rootDir, "cmaps")).href + "/",
    cMapPacked: true,
    standardFontDataUrl: pathToFileURL(path.join(rootDir, "standard_fonts")).href + "/",
    isEvalSupported: false,
    useSystemFonts: true,
    verbosity: 0
  });
  const doc = await task.promise;
  try {
    const pages = [];
    let totalLen = 0;
    let truncated = false;
    for (let i = 1; i <= doc.numPages; i++) {
      if (totalLen >= limit) {
        truncated = true;
        break;
      }
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      const lines = [];
      let line = "";
      for (const item of content.items) {
        if (!item || typeof item.str !== "string") continue;
        line += item.str;
        if (item.hasEOL) {
          const trimmed = line.replace(/[ \t]+$/g, "").trim();
          if (trimmed) lines.push(trimmed);
          line = "";
        }
      }
      const tail = line.replace(/[ \t]+$/g, "").trim();
      if (tail) lines.push(tail);
      if (lines.length) {
        const pageText = lines.join("\n");
        pages.push(pageText);
        totalLen += pageText.length + 2;
      }
      if (typeof page.cleanup === "function") page.cleanup();
    }
    let text = pages.join("\n\n").replace(/\n{3,}/g, "\n\n").trim();
    if (!text) {
      const err = new Error(
        "扫描件无法读取：未能从 PDF 抽出文字。当前文件很可能是扫描件/图片型 PDF（无文字层）。本客户端不做 OCR：请先用 Adobe/ABBYY/系统「OCR PDF」等生成可检索文字版，或另存为 .txt/.md 后再 @ 引用"
      );
      err.code = "EMPTY_PDF";
      throw err;
    }
    if (text.length > limit) {
      text = text.slice(0, limit) + "\n\n[⚠️ 正文过长，已截取前部]";
      truncated = true;
    }
    return { text, truncated };
  } finally {
    await doc.destroy();
  }
}

/** 跨平台路径标准化（盘符大小写 + 斜杠） */
function normalizeFsPath(p) {
  if (!p || typeof p !== "string") return "";
  return path.resolve(p).replace(/\\/g, "/").toLowerCase();
}

/** 论文/长文分块索引根目录（用户数据目录，不污染工程仓库） */
function getDocIndexRoot() {
  return path.join(app.getPath("userData"), "doc-index");
}

function makeDocIndexId(fullPath, size, mtimeMs) {
  return crypto
    .createHash("sha256")
    .update(`${normalizeFsPath(fullPath)}|${size}|${mtimeMs}`)
    .digest("hex")
    .slice(0, 24);
}

function isSafeDocId(docId) {
  return typeof docId === "string" && /^[a-f0-9]{16,64}$/i.test(docId.trim());
}

function isSafeChunkId(chunkId) {
  return typeof chunkId === "string" && /^[0-9]{1,6}$/.test(String(chunkId).trim());
}

/** 按标题/固定字数切块；返回含 content 的块列表（落盘后 manifest 不含全文） */
function chunkDocumentText(fullText, targetChars = DOC_CHUNK_TARGET_CHARS) {
  const text = String(fullText || "").replace(/\r\n/g, "\n");
  const lines = text.split("\n");
  const chunks = [];
  let buf = [];
  let bufLen = 0;
  let currentTitle = "开篇";
  const target = Math.max(2000, targetChars || DOC_CHUNK_TARGET_CHARS);

  const flush = () => {
    const content = buf.join("\n").trim();
    buf = [];
    bufLen = 0;
    if (!content) return;
    const id = String(chunks.length + 1).padStart(4, "0");
    chunks.push({
      id,
      title: String(currentTitle || `第 ${chunks.length + 1} 块`).slice(0, 120),
      summary: content.slice(0, 160).replace(/\s+/g, " ").trim(),
      charCount: content.length,
      content
    });
  };

  for (const line of lines) {
    const heading =
      line.match(/^#{1,3}\s+(.+)$/) ||
      line.match(/^第[零一二三四五六七八九十百千0-9]+[章节部篇]\s*(.*)$/) ||
      line.match(/^(\d+(?:\.\d+){0,3})\s+([A-Za-z\u4e00-\u9fff].{0,80})$/);
    if (heading && bufLen > target * 0.35) {
      flush();
      currentTitle = String(heading[1] || heading[2] || line).trim().slice(0, 120) || currentTitle;
    } else if (heading && bufLen === 0) {
      currentTitle = String(heading[1] || heading[2] || line).trim().slice(0, 120) || currentTitle;
    }
    buf.push(line);
    bufLen += line.length + 1;
    if (bufLen >= target) flush();
  }
  flush();
  return chunks;
}

/** 逻辑路径是否位于 root 内（mkdir 前先判，避免越权建目录） */
function isPathLogicallyInside(rootDir, targetPath) {
  if (!rootDir || !targetPath) return false;
  const root = path.resolve(rootDir);
  const target = path.resolve(targetPath);
  const rel = path.relative(root, target);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

/** 仅允许本仓库 GitHub Releases 官方 HTTPS 安装包地址 */
function isAllowedUpdateDownloadUrl(downloadUrl) {
  if (!downloadUrl || typeof downloadUrl !== "string") return false;
  let u;
  try {
    u = new URL(downloadUrl);
  } catch {
    return false;
  }
  if (u.protocol !== "https:") return false;
  const host = u.hostname.toLowerCase();
  const pathname = u.pathname || "";
  if (host === "github.com") {
    return /^\/(?:Simon-yyy|2235465521)\/Codex-Harness-DeskTop\/releases\//i.test(pathname);
  }
  // GitHub Release 资产 CDN（browser_download_url 常跳转到此）
  if (
    host === "objects.githubusercontent.com" ||
    host === "release-assets.githubusercontent.com" ||
    host === "github-releases.githubusercontent.com"
  ) {
    return true;
  }
  // 加速镜像代理白名单（仅允许针对本仓库 Releases 资产的代理加速）
  if (host === "ghfast.top" || host === "mirror.ghproxy.com" || host === "ghproxy.net") {
    return pathname.includes("/Simon-yyy/Codex-Harness-DeskTop/releases/") ||
           pathname.includes("/2235465521/Codex-Harness-DeskTop/releases/");
  }
  return false;
}

// ---------------------------------------------------------------------------
// 自动初始化并热同步内置技能 (35 个 Matt Pocock 技能 + 8 个 Loop Engineering 技能)
// ---------------------------------------------------------------------------
function copyDirRecursive(src, dest) {
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, destPath);
    } else {
      if (!fs.existsSync(destPath) || fs.statSync(srcPath).size !== fs.statSync(destPath).size) {
        fs.copyFileSync(srcPath, destPath);
      }
    }
  }
}

function initBuiltinSkills() {
  try {
    const userHome = os.homedir();
    const targetDir = path.join(userHome, ".codex", "skills");
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    const sourceSkillsDir = path.join(__dirname, ".agents", "skills");
    let syncedCount = 0;
    if (fs.existsSync(sourceSkillsDir)) {
      const skills = fs.readdirSync(sourceSkillsDir, { withFileTypes: true });
      for (const s of skills) {
        if (s.isDirectory()) {
          const srcPath = path.join(sourceSkillsDir, s.name);
          const destPath = path.join(targetDir, s.name);
          copyDirRecursive(srcPath, destPath);
          syncedCount++;
        }
      }
      process.stdout.write(`[codex-desktop] ✓ 自动增量热同步 ${syncedCount} 个技能到: ${targetDir}\n`);
    }
  } catch (err) {
    console.error("[codex-desktop] 部署技能库异常:", err);
  }
}

/** 用户自定义技能根目录（与内置热同步目录隔离） */
function getUserSkillsRoot() {
  return path.join(os.homedir(), ".codex", "user-skills");
}

function getBuiltinSkillsDir() {
  return path.join(__dirname, ".agents", "skills");
}

function ensureUserSkillsRoot() {
  const root = getUserSkillsRoot();
  if (!fs.existsSync(root)) fs.mkdirSync(root, { recursive: true });
  return root;
}

const SKILL_ID_RE = /^[a-z0-9][a-z0-9-]{1,63}$/;

function assertValidSkillId(id) {
  if (!id || typeof id !== "string" || !SKILL_ID_RE.test(id)) {
    return { ok: false, code: "INVALID_ID", error: "技能 id 仅允许小写字母、数字与连字符，长度 2–64" };
  }
  return { ok: true };
}

function parseSkillMd(dirName, raw, source) {
  let name = dirName;
  let desc = source === "user" ? "用户自定义技能" : "OpenAI Codex 工业级工程技能";
  let content = raw;
  const fmMatch = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (fmMatch) {
    const fm = fmMatch[1];
    content = fmMatch[2].trim();
    const nameMatch = fm.match(/^name:\s*(.+)$/m);
    const descMatch = fm.match(/^description:\s*(.+)$/m);
    if (nameMatch) name = nameMatch[1].trim();
    if (descMatch) desc = descMatch[1].trim();
  }
  return {
    id: dirName,
    name,
    description: desc,
    prompt: content,
    content,
    source,
    editable: source === "user"
  };
}

function validateSkillFrontmatter(raw) {
  const fmMatch = String(raw || "").match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!fmMatch) {
    return { ok: false, code: "INVALID_FRONTMATTER", error: "SKILL.md 缺少 YAML Frontmatter" };
  }
  const fm = fmMatch[1];
  if (!/^name\s*:/m.test(fm) || !/^description\s*:/m.test(fm)) {
    return { ok: false, code: "INVALID_FRONTMATTER", error: "Frontmatter 必须包含 name 与 description" };
  }
  return { ok: true };
}

function listSkillsInDir(skillsDir, source) {
  const skills = [];
  if (!skillsDir || !fs.existsSync(skillsDir)) return skills;
  let realSkillsRoot = null;
  try {
    realSkillsRoot = fs.realpathSync(skillsDir);
  } catch {
    return skills;
  }
  const entries = fs.readdirSync(skillsDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;
    // 用户技能：拒绝非法 id，并跳过 realpath 逃逸的 junction/symlink 目录
    if (source === "user") {
      if (!SKILL_ID_RE.test(entry.name)) {
        console.warn(`[codex-desktop] 跳过非法用户技能目录名: ${entry.name}`);
        continue;
      }
    }
    const dirPath = path.join(skillsDir, entry.name);
    if (!fs.existsSync(path.join(dirPath, "SKILL.md"))) continue;
    if (source === "user") {
      try {
        const realDir = fs.realpathSync(dirPath);
        if (!isPathLogicallyInside(realSkillsRoot, realDir)) {
          console.warn(`[codex-desktop] 跳过逃逸用户技能目录: ${entry.name}`);
          continue;
        }
      } catch (err) {
        console.warn(`[codex-desktop] 跳过不可解析用户技能目录 ${entry.name}:`, err.message);
        continue;
      }
    }
    const skillFile = path.join(dirPath, "SKILL.md");
    try {
      const raw = fs.readFileSync(skillFile, "utf8");
      skills.push(parseSkillMd(entry.name, raw, source));
    } catch (err) {
      console.error(`[codex-desktop] 读取技能失败 ${entry.name}:`, err.message);
    }
  }
  return skills;
}

/**
 * 用户技能写/删目标：逻辑路径 + realpath 双重 containment（对齐 Seam 17）
 */
function assertUserSkillTargetSafe(rootDir, targetPath) {
  if (!isPathLogicallyInside(rootDir, targetPath)) {
    return { ok: false, code: "PATH_ESCAPE", error: "目标路径越权" };
  }
  try {
    const realRoot = fs.realpathSync(rootDir);
    if (fs.existsSync(targetPath)) {
      const realTarget = fs.realpathSync(targetPath);
      if (!isPathLogicallyInside(realRoot, realTarget)) {
        return { ok: false, code: "PATH_ESCAPE", error: "目标路径越权（物理链接逃逸）" };
      }
    } else {
      const parent = path.dirname(targetPath);
      if (!isPathLogicallyInside(rootDir, parent)) {
        return { ok: false, code: "PATH_ESCAPE", error: "目标路径越权" };
      }
      if (fs.existsSync(parent)) {
        const realParent = fs.realpathSync(parent);
        if (!isPathLogicallyInside(realRoot, realParent)) {
          return { ok: false, code: "PATH_ESCAPE", error: "目标路径越权（物理链接逃逸）" };
        }
      }
    }
  } catch (err) {
    return { ok: false, code: "PATH_ESCAPE", error: err.message || "路径解析失败" };
  }
  return { ok: true };
}

function listBuiltinSkillIds() {
  const ids = new Set();
  const dir = getBuiltinSkillsDir();
  if (!fs.existsSync(dir)) return ids;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) ids.add(entry.name);
  }
  return ids;
}

function assertNotBuiltinSkillId(id) {
  if (listBuiltinSkillIds().has(id)) {
    return { ok: false, code: "ID_CONFLICT_BUILTIN", error: `技能 id 与内置技能冲突: ${id}` };
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------
// 创建全中文、全功能联动的专业常驻应用菜单
// ---------------------------------------------------------------------------
function createApplicationMenu() {
  const template = [
    {
      label: "文件 (&F)",
      submenu: [
        {
          label: "新建会话",
          accelerator: "CmdOrCtrl+N",
          click: () => {
            if (mainWindow) mainWindow.webContents.send("menu-action", "new-chat");
          }
        },
        { type: "separator" },
        {
          label: "模型服务商设置...",
          accelerator: "CmdOrCtrl+,",
          click: () => {
            if (mainWindow) mainWindow.webContents.send("menu-action", "open-settings");
          }
        },
        { type: "separator" },
        {
          label: "退出 Codex Desktop",
          accelerator: "CmdOrCtrl+Q",
          click: () => {
            isQuitting = true;
            app.quit();
          }
        }
      ]
    },
    {
      label: "编辑 (&E)",
      submenu: [
        { label: "撤销", accelerator: "CmdOrCtrl+Z", role: "undo" },
        { label: "重做", accelerator: "Shift+CmdOrCtrl+Z", role: "redo" },
        { type: "separator" },
        { label: "剪切", accelerator: "CmdOrCtrl+X", role: "cut" },
        { label: "复制", accelerator: "CmdOrCtrl+C", role: "copy" },
        { label: "粘贴", accelerator: "CmdOrCtrl+V", role: "paste" },
        { label: "全选", accelerator: "CmdOrCtrl+A", role: "selectAll" }
      ]
    },
    {
      label: "视图 (&V)",
      submenu: [
        { label: "重新加载", accelerator: "CmdOrCtrl+R", role: "reload" },
        { label: "强制重新加载", accelerator: "Shift+CmdOrCtrl+R", role: "forceReload" },
        { type: "separator" },
        { label: "切换全屏", accelerator: "F11", role: "togglefullscreen" },
        { label: "实际大小", accelerator: "CmdOrCtrl+0", role: "resetZoom" },
        { label: "放大", accelerator: "CmdOrCtrl+=", role: "zoomIn" },
        { label: "缩小", accelerator: "CmdOrCtrl+-", role: "zoomOut" },
        { type: "separator" },
        { label: "开发者工具", accelerator: "CmdOrCtrl+Shift+I", role: "toggleDevTools" }
      ]
    },
    {
      label: "主题 (&T)",
      submenu: [
        {
          label: "escook Dark (经典暗色)",
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.send("menu-action", "theme:dark");
              mainWindow.webContents.send("theme-change", "dark");
            }
          }
        },
        {
          label: "escook Dark Soft (柔和暗色)",
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.send("menu-action", "theme:dark-soft");
              mainWindow.webContents.send("theme-change", "dark-soft");
            }
          }
        },
        {
          label: "escook Light (暖色调亮)",
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.send("menu-action", "theme:light");
              mainWindow.webContents.send("theme-change", "light");
            }
          }
        },
        {
          label: "escook Light Soft (柔和亮色)",
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.send("menu-action", "theme:light-soft");
              mainWindow.webContents.send("theme-change", "light-soft");
            }
          }
        }
      ]
    },
    {
      label: "帮助 (&H)",
      submenu: [
        {
          label: "检查新版本更新...",
          click: () => checkForUpdates(false)
        },
        {
          label: "提交 Bug 报告与反馈...",
          accelerator: "CmdOrCtrl+Shift+F",
          click: () => {
            if (mainWindow) mainWindow.webContents.send("menu-action", "open-feedback");
          }
        },
        {
          label: "关于 Codex Desktop",
          click: () => {
            if (mainWindow) mainWindow.webContents.send("menu-action", "open-about");
          }
        },
        { type: "separator" },
        {
          label: "GitHub 开源仓库",
          click: () => shell.openExternal("https://github.com/Simon-yyy/Codex-Harness-DeskTop")
        }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

// ---------------------------------------------------------------------------
// 主窗口创建
// ---------------------------------------------------------------------------
function createWindow() {
  createApplicationMenu();

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 900,
    minHeight: 600,
    title: "Codex Desktop",
    icon: path.join(__dirname, "assets", "icon.png"),
    frame: true,
    autoHideMenuBar: false, // 顶部菜单栏常驻显示
    show: false,
    backgroundColor: "#1f2430",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true,
      devTools: true
    }
  });

  mainWindow.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    process.stdout.write(`[Renderer Console] [L${level}] ${message} (at ${sourceId}:${line})\n`);
  });

  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    process.stderr.write(`[Renderer Load Fail] ${errorCode}: ${errorDescription} (${validatedURL})\n`);
  });

  const distIndexPath = path.join(__dirname, "ui", "dist", "index.html");
  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(distIndexPath).catch(() => {
      mainWindow.loadFile(path.join(__dirname, "ui", "index.html"));
    });
  }

  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
    initBuiltinSkills();

    // 启动 3 秒后在后台静默自动检查客户端更新
    setTimeout(() => {
      checkForUpdates(true);
    }, 3000);
  });

  // 处理外部链接，防止在应用内跳出
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("http://") || url.startsWith("https://")) {
      shell.openExternal(url);
    }
    return { action: "deny" };
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

// ---------------------------------------------------------------------------
// In-App Auto Updater (GitHub Releases)
// ---------------------------------------------------------------------------
function downloadFile(url, destPath, onProgress) {
  return new Promise((resolve, reject) => {
    const candidateUrls = [url];
    if (url.includes("/Codex-Harness-DeskTop/releases/download/")) {
      candidateUrls.push(`https://ghfast.top/${url}`);
      candidateUrls.push(`https://mirror.ghproxy.com/${url}`);
    }

    let candidateIndex = 0;

    function tryDownloadNext() {
      if (candidateIndex >= candidateUrls.length) {
        return reject(new Error("所有下载源均尝试失败，请检查网络连接"));
      }
      const currentUrl = candidateUrls[candidateIndex++];
      console.warn(`[codex-desktop] 尝试下载更新包 (${candidateIndex}/${candidateUrls.length}):`, currentUrl);

      const file = fs.createWriteStream(destPath);
      const getOptions = { headers: { "User-Agent": "cline/3.0.0" } };
      let reqTimeout = null;
      let hasEnded = false;

      function cleanup() {
        if (reqTimeout) { clearTimeout(reqTimeout); reqTimeout = null; }
        try { file.close(); } catch (_) {}
        try { fs.unlinkSync(destPath); } catch (_) {}
      }

      function doGet(targetUrl, redirectCount = 0) {
        if (redirectCount > 5) {
          cleanup();
          return tryDownloadNext();
        }

        const client = targetUrl.startsWith("http:") ? http : https;
        const req = client.get(targetUrl, getOptions, (res) => {
          if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            if (reqTimeout) { clearTimeout(reqTimeout); reqTimeout = null; }
            let nextLoc = res.headers.location;
            if (nextLoc.startsWith("/")) {
              const prevUrl = new URL(targetUrl);
              nextLoc = `${prevUrl.origin}${nextLoc}`;
            }
            return doGet(nextLoc, redirectCount + 1);
          }

          if (res.statusCode !== 200) {
            cleanup();
            return tryDownloadNext();
          }

          if (reqTimeout) { clearTimeout(reqTimeout); reqTimeout = null; }

          const totalBytes = parseInt(res.headers["content-length"] || "0", 10);
          let downloadedBytes = 0;

          res.on("data", (chunk) => {
            downloadedBytes += chunk.length;
            file.write(chunk);
            if (totalBytes > 0 && onProgress) {
              const percent = Math.min(100, Math.floor((downloadedBytes / totalBytes) * 100));
              onProgress(percent, downloadedBytes, totalBytes);
            }
          });

          res.on("end", () => {
            if (hasEnded) return;
            hasEnded = true;
            file.end(() => {
              setTimeout(() => resolve(destPath), 300);
            });
          });

          res.on("error", () => {
            if (hasEnded) return;
            cleanup();
            tryDownloadNext();
          });
        });

        reqTimeout = setTimeout(() => {
          if (hasEnded) return;
          console.warn("[codex-desktop] 当前更新源响应超时，正在自动切换备选加速节点...");
          req.destroy();
          cleanup();
          tryDownloadNext();
        }, 8000);

        req.on("error", () => {
          if (hasEnded) return;
          cleanup();
          tryDownloadNext();
        });
      }

      doGet(currentUrl);
    }

    tryDownloadNext();
  });
}

function isNewerVersion(remote, local) {
  if (!remote || !local) return false;
  const parse = v => String(v).replace(/^v/, "").split(".").map(n => parseInt(n, 10) || 0);
  const [r1, r2, r3] = parse(remote);
  const [l1, l2, l3] = parse(local);
  if (r1 > l1) return true;
  if (r1 < l1) return false;
  if (r2 > l2) return true;
  if (r2 < l2) return false;
  return r3 > l3;
}

function checkForUpdates(isSilent = false) {
  if (isDownloadingUpdate) {
    if (!isSilent) {
      dialog.showMessageBox(mainWindow || null, {
        type: "info",
        title: "更新正在下载中",
        message: "新版本安装包正在后台下载，请稍候...",
        buttons: ["知道了"]
      });
    }
    return;
  }

  const repoCandidates = [
    "/repos/2235465521/Codex-Harness-DeskTop/releases/latest",
    "/repos/Simon-yyy/Codex-Harness-DeskTop/releases/latest"
  ];

  function queryRepo(index = 0) {
    if (index >= repoCandidates.length) {
      if (!isSilent) {
        dialog.showMessageBox(mainWindow || null, {
          type: "info",
          title: "检查更新",
          message: `未找到远程发布版本。\n当前本地版本: v${app.getVersion()}`,
          buttons: ["确定"]
        });
      }
      return;
    }

    const currentPath = repoCandidates[index];
    const options = {
      hostname: "api.github.com",
      path: currentPath,
      headers: { "User-Agent": "cline/3.0.0" }
    };

    https.get(options, (res) => {
      let body = "";
      res.on("data", (d) => body += d);
      res.on("end", () => {
        try {
          if (res.statusCode !== 200) {
            // 若首选仓库尚无 release，无感切换至主干仓库
            if (index + 1 < repoCandidates.length) {
              return queryRepo(index + 1);
            }
            if (!isSilent) {
              let tip = `无法连接或未找到远程发布版本 (HTTP ${res.statusCode})。\n当前本地版本: v${app.getVersion()}`;
              if (res.statusCode === 403) {
                tip = `GitHub API 访问频次受限 (HTTP 403)。\n请稍后再试，或直接通过【关于】页面的 GitHub 仓库链接获取最新版本！\n当前本地版本: v${app.getVersion()}`;
              }
              dialog.showMessageBox(mainWindow || null, {
                type: "info",
                title: "检查更新",
                message: tip,
                buttons: ["确定"]
              });
            }
            return;
          }

          const data = JSON.parse(body);
          const latestTag = (data.tag_name || "").replace(/^v/, "");
          const currentVer = app.getVersion();

          if (latestTag && isNewerVersion(latestTag, currentVer)) {
            const assets = data.assets || [];
            const exeAsset = assets.find((a) => a.name && a.name.endsWith(".exe") && /setup/i.test(a.name))
              || assets.find((a) => a.name && a.name.endsWith(".exe") && !/elevate/i.test(a.name));
            const downloadUrl = exeAsset ? exeAsset.browser_download_url : "";

            // 向渲染进程广播更新就绪事件
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send("update-available", {
                currentVersion: currentVer,
                latestVersion: latestTag,
                body: data.body || "常规性能提升与体验优化。",
                downloadUrl: downloadUrl
              });
            }

            // 如果是用户主动手动点击检查更新，弹出对话框
            if (!isSilent) {
              dialog.showMessageBox(mainWindow || null, {
                type: "info",
                title: "🎉 发现全新版本",
                message: `发现 Codex Desktop 全新版本 v${latestTag}（当前版本: v${currentVer}）！\n\n更新说明：\n${data.body || "常规性能提升与体验优化。"}`,
                buttons: ["⚡ 立即在应用内下载升级", "稍后再说"],
                defaultId: 0
              }).then(({ response }) => {
                if (response === 0 && downloadUrl) {
                  startDownloadUpdate(downloadUrl, latestTag);
                }
              });
            }
          } else if (!isSilent) {
            dialog.showMessageBox(mainWindow || null, {
              type: "info",
              title: "检查更新",
              message: `当前已是最新版本 (v${currentVer})，无需更新。`,
              buttons: ["确定"]
            });
          }
        } catch (err) {
          if (!isSilent) {
            dialog.showMessageBox(mainWindow || null, {
              type: "error",
              title: "检查更新失败",
              message: `解析更新数据异常: ${err.message}`,
              buttons: ["确定"]
            });
          }
        }
      });
    }).on("error", (err) => {
      if (index + 1 < repoCandidates.length) {
        return queryRepo(index + 1);
      }
      if (!isSilent) {
        dialog.showMessageBox(mainWindow || null, {
          type: "error",
          title: "网络异常",
          message: `无法连接更新服务器: ${err.message}`,
          buttons: ["确定"]
        });
      }
    });
  }

  queryRepo(0);
}

function applyPendingUpdate(retryCount = 0) {
  if (!pendingUpdateInstallerPath || !fs.existsSync(pendingUpdateInstallerPath)) return false;
  try {
    // /S 表示 NSIS 静默覆写安装，自动覆盖历史安装目录，无需用户手动卸载或重选路径
    spawn(pendingUpdateInstallerPath, ["/S", "--updated"], {
      detached: true,
      stdio: "ignore"
    }).unref();
    isQuitting = true;
    app.quit();
    return true;
  } catch (err) {
    if (err.code === "EBUSY" && retryCount < 5) {
      console.warn(`[codex-desktop] 安装包正忙 (EBUSY)，将在 500ms 后自动重试启动 (${retryCount + 1}/5)...`);
      setTimeout(() => applyPendingUpdate(retryCount + 1), 500);
      return true;
    }
    dialog.showErrorBox("启动安装程序失败", `无法自动执行安装包: ${err.message}`);
    return false;
  }
}

function startDownloadUpdate(assetUrl, newVersion) {
  if (!isAllowedUpdateDownloadUrl(assetUrl)) {
    console.error("[codex-desktop] 拒绝非白名单更新下载 URL:", assetUrl);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("update-error", { error: "更新下载地址未通过安全白名单校验" });
    }
    dialog.showMessageBox(mainWindow || null, {
      type: "error",
      title: "更新被拒绝",
      message: "下载地址未通过安全白名单校验，已阻止安装包下载。\n请仅通过应用内检查更新获取官方版本。",
      buttons: ["确定"]
    });
    return;
  }
  if (isDownloadingUpdate) return;
  isDownloadingUpdate = true;
  const tempDir = os.tmpdir();
  const installerPath = path.join(tempDir, `Codex-Desktop-Setup-${newVersion}.exe`);

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("update-downloading", { version: newVersion });
  }

  downloadFile(assetUrl, installerPath, (percent, downloadedBytes, totalBytes) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("update-progress", { percent, downloadedBytes, totalBytes });
    }
  }).then(() => {
    isDownloadingUpdate = false;
    pendingUpdateInstallerPath = installerPath;
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("update-downloaded", { version: newVersion, installerPath });
    }
    dialog.showMessageBox(mainWindow || null, {
      type: "info",
      title: "🎉 新版本已下载完成",
      message: `Codex Desktop v${newVersion} 安装包已就绪！\n\n新版本将自动就地覆写升级，老版本无需卸载，所有会话记录与配置 100% 完整保留。`,
      buttons: ["⚡ 立即重启完成升级", "稍后退出时自动升级"],
      defaultId: 0
    }).then(({ response }) => {
      if (response === 0) {
        applyPendingUpdate();
      } else {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send("update-pending-on-quit", { version: newVersion });
        }
      }
    });
  }).catch((err) => {
    isDownloadingUpdate = false;
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("update-error", { error: err.message });
    }
    dialog.showMessageBox(mainWindow || null, {
      type: "error",
      title: "更新下载失败",
      message: `下载更新包遇到错误: ${err.message}`,
      buttons: ["确定"]
    });
  });
}

// ---------------------------------------------------------------------------
// IPC Handlers
// ---------------------------------------------------------------------------
ipcMain.handle("get-app-info", () => {
  let count = 43;
  try {
    const sourceSkillsDir = path.join(__dirname, ".agents", "skills");
    if (fs.existsSync(sourceSkillsDir)) {
      count = fs.readdirSync(sourceSkillsDir).filter((s) => fs.statSync(path.join(sourceSkillsDir, s)).isDirectory()).length;
    }
  } catch (e) {}

  return {
    version: app.getVersion(),
    name: "Codex Desktop",
    harness: "OpenAI Codex Harness (Native Multimodal & Dual-Track Auto-Update)",
    skillsCount: count,
    electronVersion: process.versions.electron,
    nodeVersion: process.versions.node,
    platform: process.platform,
    arch: process.arch
  };
});

ipcMain.handle("get-skills", async () => {
  try {
    const builtin = listSkillsInDir(getBuiltinSkillsDir(), "builtin");
    const user = listSkillsInDir(getUserSkillsRoot(), "user");
    const builtinIds = new Set(builtin.map((s) => s.id));
    const merged = [...builtin];
    for (const s of user) {
      if (builtinIds.has(s.id)) {
        console.warn(`[codex-desktop] 用户技能 id 与内置冲突，已跳过: ${s.id}`);
        continue;
      }
      merged.push(s);
    }
    return merged;
  } catch (err) {
    console.error("[codex-desktop] 加载技能库失败:", err);
    return [];
  }
});

ipcMain.handle("import-user-skill", async () => {
  const win = mainWindow || BrowserWindow.getFocusedWindow();
  const result = await dialog.showOpenDialog(win, {
    title: "选择包含 SKILL.md 的技能目录",
    properties: ["openDirectory"]
  });
  if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
    return { ok: false, canceled: true, code: "CANCELED" };
  }

  const srcDir = result.filePaths[0];
  const skillFile = path.join(srcDir, "SKILL.md");
  if (!fs.existsSync(skillFile)) {
    return { ok: false, code: "NO_SKILL_MD", error: "所选目录缺少 SKILL.md" };
  }

  const folderName = path.basename(srcDir);
  const idCheck = assertValidSkillId(folderName);
  if (!idCheck.ok) return { ok: false, code: idCheck.code, error: idCheck.error };

  const conflict = assertNotBuiltinSkillId(folderName);
  if (!conflict.ok) return { ok: false, code: conflict.code, error: conflict.error };

  let raw;
  try {
    raw = fs.readFileSync(skillFile, "utf8");
  } catch (err) {
    return { ok: false, code: "READ_FAILED", error: err.message };
  }
  const fm = validateSkillFrontmatter(raw);
  if (!fm.ok) return { ok: false, code: fm.code, error: fm.error };

  const root = ensureUserSkillsRoot();
  const destDir = path.join(root, folderName);
  const pathSafe = assertUserSkillTargetSafe(root, destDir);
  if (!pathSafe.ok) return { ok: false, code: pathSafe.code, error: pathSafe.error };
  if (fs.existsSync(destDir)) {
    return { ok: false, code: "ALREADY_EXISTS", error: `用户技能已存在: ${folderName}` };
  }

  try {
    copyDirRecursive(srcDir, destDir);
    const afterSafe = assertUserSkillTargetSafe(root, destDir);
    if (!afterSafe.ok) {
      try {
        fs.rmSync(destDir, { recursive: true, force: true });
      } catch {
        /* 尽力回滚 */
      }
      return { ok: false, code: afterSafe.code, error: afterSafe.error };
    }
    const skill = parseSkillMd(folderName, fs.readFileSync(path.join(destDir, "SKILL.md"), "utf8"), "user");
    return { ok: true, skill };
  } catch (err) {
    return { ok: false, code: "IMPORT_FAILED", error: err.message };
  }
});

ipcMain.handle("save-user-skill", async (_event, payload = {}) => {
  const id = typeof payload.id === "string" ? payload.id.trim() : "";
  const name = typeof payload.name === "string" ? payload.name.trim() : "";
  const description = typeof payload.description === "string" ? payload.description.trim() : "";
  const body = typeof payload.body === "string" ? payload.body : "";
  const overwrite = payload.overwrite === true;

  const idCheck = assertValidSkillId(id);
  if (!idCheck.ok) return { ok: false, code: idCheck.code, error: idCheck.error };
  if (!name) return { ok: false, code: "INVALID_NAME", error: "名称不能为空" };
  if (!description) return { ok: false, code: "INVALID_DESCRIPTION", error: "描述不能为空" };
  if (!String(body).trim()) return { ok: false, code: "INVALID_BODY", error: "技能正文不能为空" };

  const conflict = assertNotBuiltinSkillId(id);
  if (!conflict.ok) return { ok: false, code: conflict.code, error: conflict.error };

  const root = ensureUserSkillsRoot();
  const destDir = path.join(root, id);
  const pathSafe = assertUserSkillTargetSafe(root, destDir);
  if (!pathSafe.ok) return { ok: false, code: pathSafe.code, error: pathSafe.error };
  if (fs.existsSync(destDir) && !overwrite) {
    return { ok: false, code: "ALREADY_EXISTS", error: `用户技能已存在: ${id}` };
  }

  const safeName = name.replace(/\r?\n/g, " ").slice(0, 120);
  const safeDesc = description.replace(/\r?\n/g, " ").slice(0, 300);
  const content = `---\nname: ${safeName}\ndescription: ${safeDesc}\n---\n\n${String(body).trim()}\n`;

  try {
    if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
    const skillFile = path.join(destDir, "SKILL.md");
    const fileSafe = assertUserSkillTargetSafe(root, skillFile);
    if (!fileSafe.ok) return { ok: false, code: fileSafe.code, error: fileSafe.error };
    // 目录若为逃逸 junction，再次拦截
    const dirSafe = assertUserSkillTargetSafe(root, destDir);
    if (!dirSafe.ok) return { ok: false, code: dirSafe.code, error: dirSafe.error };
    fs.writeFileSync(skillFile, content, "utf8");
    const skill = parseSkillMd(id, content, "user");
    return { ok: true, skill };
  } catch (err) {
    return { ok: false, code: "SAVE_FAILED", error: err.message };
  }
});

ipcMain.handle("delete-user-skill", async (_event, skillId) => {
  const id = typeof skillId === "string" ? skillId.trim() : "";
  const idCheck = assertValidSkillId(id);
  if (!idCheck.ok) return { ok: false, code: idCheck.code, error: idCheck.error };

  if (listBuiltinSkillIds().has(id)) {
    return { ok: false, code: "NOT_USER_SKILL", error: "不能删除内置技能" };
  }

  const root = ensureUserSkillsRoot();
  const destDir = path.join(root, id);
  const pathSafe = assertUserSkillTargetSafe(root, destDir);
  if (!pathSafe.ok) return { ok: false, code: pathSafe.code, error: pathSafe.error };
  if (!fs.existsSync(destDir)) {
    return { ok: false, code: "NOT_FOUND", error: `用户技能不存在: ${id}` };
  }

  try {
    // 删除前再次 realpath，防止 TOCTOU 与 junction 逃逸
    const again = assertUserSkillTargetSafe(root, destDir);
    if (!again.ok) return { ok: false, code: again.code, error: again.error };
    fs.rmSync(destDir, { recursive: true, force: true });
    return { ok: true };
  } catch (err) {
    return { ok: false, code: "DELETE_FAILED", error: err.message };
  }
});

ipcMain.handle("open-user-skills-dir", async () => {
  try {
    const root = ensureUserSkillsRoot();
    const errMsg = await shell.openPath(root);
    if (errMsg) return { ok: false, error: errMsg };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

// ---------------------------------------------------------------------------
// MCP 连接器（Streamable HTTP）— 对齐豆包「标准大数据智能连接器」
// ---------------------------------------------------------------------------
const DEFAULT_STSC_CONNECTOR = {
  id: "stsc-data-platform",
  name: "STSC_data_platform",
  transport: "http",
  url: "http://47.106.104.48:8089/api/v1/openapi/doubao/mcp",
  healthUrl: "http://47.106.104.48:8089/api/v1/health",
  enabled: false,
  authHeaderName: "Authorization",
  apiKeyEncrypted: null,
};

function getConnectorsConfigPath() {
  return path.join(os.homedir(), ".codex", "connectors.json");
}

function encryptConnectorSecret(plain) {
  if (!plain || typeof plain !== "string") return null;
  try {
    if (safeStorage && safeStorage.isEncryptionAvailable()) {
      return {
        type: "safeStorage",
        data: safeStorage.encryptString(plain).toString("base64"),
      };
    }
  } catch (_) { /* fallthrough */ }
  return { type: "plain", data: Buffer.from(plain, "utf8").toString("base64") };
}

function decryptConnectorSecret(enc) {
  if (!enc || !enc.data) return "";
  try {
    if (enc.type === "safeStorage" && safeStorage) {
      return safeStorage.decryptString(Buffer.from(enc.data, "base64"));
    }
    return Buffer.from(enc.data, "base64").toString("utf8");
  } catch (_) {
    return "";
  }
}

function loadConnectorsConfig() {
  const p = getConnectorsConfigPath();
  try {
    if (fs.existsSync(p)) {
      const raw = JSON.parse(fs.readFileSync(p, "utf8"));
      if (raw && Array.isArray(raw.connectors) && raw.connectors.length) {
        return raw;
      }
    }
  } catch (_) { /* use default */ }
  return { connectors: [{ ...DEFAULT_STSC_CONNECTOR }] };
}

function saveConnectorsConfig(cfg) {
  const dir = path.join(os.homedir(), ".codex");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(getConnectorsConfigPath(), JSON.stringify(cfg, null, 2), "utf8");
}

function sanitizeConnectorPublic(c) {
  return {
    id: c.id,
    name: c.name,
    transport: c.transport || "http",
    url: c.url,
    healthUrl: c.healthUrl || "",
    enabled: !!c.enabled,
    authHeaderName: c.authHeaderName || "Authorization",
    hasApiKey: !!(c.apiKeyEncrypted && c.apiKeyEncrypted.data),
  };
}

function httpRequestRaw(urlString, options = {}) {
  return new Promise((resolve, reject) => {
    let u;
    try {
      u = new URL(urlString);
    } catch (e) {
      reject(new Error("无效 URL"));
      return;
    }
    if (u.protocol !== "http:" && u.protocol !== "https:") {
      reject(new Error("仅允许 http/https"));
      return;
    }
    const lib = u.protocol === "https:" ? https : http;
    const body = options.body != null ? Buffer.from(options.body, "utf8") : null;
    const req = lib.request(
      {
        protocol: u.protocol,
        hostname: u.hostname,
        port: u.port || (u.protocol === "https:" ? 443 : 80),
        path: u.pathname + u.search,
        method: options.method || "GET",
        headers: {
          ...(options.headers || {}),
          ...(body ? { "Content-Length": body.length } : {}),
        },
        timeout: options.timeout || 30000,
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          resolve({
            status: res.statusCode || 0,
            headers: res.headers,
            body: Buffer.concat(chunks).toString("utf8"),
          });
        });
      }
    );
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("请求超时"));
    });
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

function parseMaybeSseJsonRpc(bodyText) {
  const text = String(bodyText || "").trim();
  if (!text) return null;
  if (text.startsWith("{")) {
    try {
      return JSON.parse(text);
    } catch (_) {
      return null;
    }
  }
  // SSE: data: {...}
  const lines = text.split(/\r?\n/);
  let last = null;
  for (const line of lines) {
    const m = line.match(/^data:\s*(.+)$/);
    if (!m) continue;
    const payload = m[1].trim();
    if (!payload || payload === "[DONE]") continue;
    try {
      last = JSON.parse(payload);
    } catch (_) { /* continue */ }
  }
  return last;
}

const mcpSessionCache = new Map(); // connectorId -> { sessionId, tools, at }

async function mcpJsonRpc(connector, method, params, sessionId) {
  const apiKey = decryptConnectorSecret(connector.apiKeyEncrypted);
  if (!apiKey) {
    const err = new Error("未配置 API Key");
    err.code = "NO_API_KEY";
    throw err;
  }
  const authName = connector.authHeaderName || "Authorization";
  const authValue = apiKey.startsWith("Bearer ") ? apiKey : `Bearer ${apiKey}`;
  const id = Date.now() % 1000000;
  const payload = JSON.stringify({
    jsonrpc: "2.0",
    id,
    method,
    params: params || {},
  });
  const headers = {
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
    [authName]: authValue,
  };
  if (sessionId) {
    headers["Mcp-Session-Id"] = sessionId;
    headers["mcp-session-id"] = sessionId;
  }
  const res = await httpRequestRaw(connector.url, {
    method: "POST",
    headers,
    body: payload,
    timeout: 45000,
  });
  if (res.status === 401) {
    const err = new Error("未授权（401）：请检查 API Key");
    err.code = "UNAUTHORIZED";
    throw err;
  }
  if (res.status === 429) {
    const err = new Error("请求过于频繁（429），请稍后再试");
    err.code = "RATE_LIMIT";
    throw err;
  }
  if (res.status < 200 || res.status >= 300) {
    const err = new Error(`MCP HTTP ${res.status}: ${(res.body || "").slice(0, 200)}`);
    err.code = "HTTP_ERROR";
    throw err;
  }
  const nextSession =
    res.headers["mcp-session-id"] ||
    res.headers["Mcp-Session-Id"] ||
    sessionId ||
    null;
  const rpc = parseMaybeSseJsonRpc(res.body);
  if (!rpc) {
    const err = new Error("无法解析 MCP 响应");
    err.code = "PARSE_ERROR";
    throw err;
  }
  if (rpc.error) {
    const err = new Error(rpc.error.message || JSON.stringify(rpc.error));
    err.code = "MCP_ERROR";
    throw err;
  }
  return { result: rpc.result, sessionId: nextSession };
}

/** MCP 通知：不得带 id，响应可为空 / 202 */
async function mcpNotify(connector, method, params, sessionId) {
  const apiKey = decryptConnectorSecret(connector.apiKeyEncrypted);
  if (!apiKey) return;
  const authName = connector.authHeaderName || "Authorization";
  const authValue = apiKey.startsWith("Bearer ") ? apiKey : `Bearer ${apiKey}`;
  const payload = JSON.stringify({
    jsonrpc: "2.0",
    method,
    params: params || {},
  });
  const headers = {
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
    [authName]: authValue,
  };
  if (sessionId) {
    headers["Mcp-Session-Id"] = sessionId;
    headers["mcp-session-id"] = sessionId;
  }
  try {
    await httpRequestRaw(connector.url, {
      method: "POST",
      headers,
      body: payload,
      timeout: 15000,
    });
  } catch (_) { /* 通知失败不阻断会话 */ }
}

async function ensureMcpSession(connector) {
  const cached = mcpSessionCache.get(connector.id);
  if (cached && cached.sessionId && Date.now() - cached.at < 10 * 60 * 1000) {
    return cached;
  }
  const init = await mcpJsonRpc(connector, "initialize", {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "codex-desktop", version: app.getVersion() },
  }, null);
  // 规范：notifications/initialized 无 id
  await mcpNotify(connector, "notifications/initialized", {}, init.sessionId);
  const listed = await mcpJsonRpc(connector, "tools/list", {}, init.sessionId);
  const tools = (listed.result && listed.result.tools) || [];
  const entry = {
    sessionId: listed.sessionId || init.sessionId,
    tools,
    at: Date.now(),
  };
  mcpSessionCache.set(connector.id, entry);
  return entry;
}

function findConnectorById(id) {
  const cfg = loadConnectorsConfig();
  return (cfg.connectors || []).find((c) => c.id === id) || null;
}

ipcMain.handle("connectors-list", async () => {
  const cfg = loadConnectorsConfig();
  // 确保默认预置存在
  if (!(cfg.connectors || []).some((c) => c.id === DEFAULT_STSC_CONNECTOR.id)) {
    cfg.connectors = [DEFAULT_STSC_CONNECTOR, ...(cfg.connectors || [])];
    saveConnectorsConfig(cfg);
  }
  return { ok: true, connectors: cfg.connectors.map(sanitizeConnectorPublic) };
});

ipcMain.handle("connectors-save", async (_event, payload = {}) => {
  try {
    const id = String(payload.id || "").trim() || DEFAULT_STSC_CONNECTOR.id;
    if (!/^[a-z0-9][a-z0-9_-]{1,63}$/i.test(id)) {
      return { ok: false, code: "INVALID_ID", error: "连接器 id 非法" };
    }
    const cfg = loadConnectorsConfig();
    let idx = cfg.connectors.findIndex((c) => c.id === id);
    const prev = idx >= 0 ? cfg.connectors[idx] : { ...DEFAULT_STSC_CONNECTOR, id };
    const next = {
      ...prev,
      id,
      name: typeof payload.name === "string" && payload.name.trim() ? payload.name.trim() : prev.name,
      url: typeof payload.url === "string" && payload.url.trim() ? payload.url.trim() : prev.url,
      healthUrl:
        typeof payload.healthUrl === "string" ? payload.healthUrl.trim() : prev.healthUrl,
      enabled: payload.enabled != null ? !!payload.enabled : !!prev.enabled,
      authHeaderName: payload.authHeaderName || prev.authHeaderName || "Authorization",
      transport: "http",
      apiKeyEncrypted: prev.apiKeyEncrypted,
    };
    if (typeof payload.apiKey === "string" && payload.apiKey.trim()) {
      next.apiKeyEncrypted = encryptConnectorSecret(payload.apiKey.trim());
    }
    if (payload.clearApiKey) {
      next.apiKeyEncrypted = null;
      next.enabled = false;
    }
    // 无 Key 不得保持启用（防止 clearApiKey / 半截保存留下脏状态）
    if (next.enabled && !(next.apiKeyEncrypted && next.apiKeyEncrypted.data)) {
      next.enabled = false;
    }
    if (idx >= 0) cfg.connectors[idx] = next;
    else cfg.connectors.push(next);
    saveConnectorsConfig(cfg);
    mcpSessionCache.delete(id);
    return { ok: true, connector: sanitizeConnectorPublic(next) };
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  }
});

ipcMain.handle("connectors-set-enabled", async (_event, payload = {}) => {
  const id = String(payload.id || "").trim();
  const cfg = loadConnectorsConfig();
  const c = cfg.connectors.find((x) => x.id === id);
  if (!c) return { ok: false, code: "NOT_FOUND", error: "连接器不存在" };
  const wantEnabled = !!payload.enabled;
  if (wantEnabled && !(c.apiKeyEncrypted && c.apiKeyEncrypted.data)) {
    return {
      ok: false,
      code: "NO_API_KEY",
      error: "请先保存 API Key 再启用连接器",
    };
  }
  c.enabled = wantEnabled;
  saveConnectorsConfig(cfg);
  if (!c.enabled) mcpSessionCache.delete(id);
  return { ok: true, connector: sanitizeConnectorPublic(c) };
});

ipcMain.handle("connectors-test", async (_event, payload = {}) => {
  try {
    const id = String(payload.id || DEFAULT_STSC_CONNECTOR.id).trim();
    const connector = findConnectorById(id);
    if (!connector) return { ok: false, code: "NOT_FOUND", error: "连接器不存在" };
    if (!(connector.apiKeyEncrypted && connector.apiKeyEncrypted.data)) {
      return { ok: false, code: "NO_API_KEY", error: "请先保存 API Key 再测试连接器" };
    }
    const healthUrl = connector.healthUrl || "";
    let health = null;
    if (healthUrl) {
      try {
        const h = await httpRequestRaw(healthUrl, { method: "GET", timeout: 10000 });
        health = { status: h.status, body: (h.body || "").slice(0, 300) };
      } catch (e) {
        health = { status: 0, error: e.message };
      }
    }
    mcpSessionCache.delete(id);
    const session = await ensureMcpSession(connector);
    return {
      ok: true,
      health,
      toolCount: (session.tools || []).length,
      tools: (session.tools || []).slice(0, 30).map((t) => ({
        name: t.name,
        description: t.description || "",
      })),
    };
  } catch (err) {
    return {
      ok: false,
      code: err.code || "TEST_FAILED",
      error: err.message || String(err),
    };
  }
});

ipcMain.handle("connectors-list-tools", async () => {
  try {
    const cfg = loadConnectorsConfig();
    const enabled = (cfg.connectors || []).filter((c) => c.enabled);
    const all = [];
    for (const c of enabled) {
      if (!c.apiKeyEncrypted) continue;
      try {
        const session = await ensureMcpSession(c);
        for (const t of session.tools || []) {
          all.push({
            connectorId: c.id,
            connectorName: c.name,
            name: t.name,
            qualifiedName: `mcp__${c.id}__${t.name}`,
            description: t.description || "",
            inputSchema: t.inputSchema || t.input_schema || { type: "object", properties: {} },
          });
        }
      } catch (e) {
        all.push({
          connectorId: c.id,
          connectorName: c.name,
          error: e.message,
        });
      }
    }
    return { ok: true, tools: all };
  } catch (err) {
    return { ok: false, error: err.message || String(err), tools: [] };
  }
});

ipcMain.handle("connectors-call-tool", async (_event, payload = {}) => {
  try {
    const connectorId = String(payload.connectorId || "").trim();
    let toolName = String(payload.name || "").trim();
    // 允许传入 qualifiedName
    if (toolName.startsWith("mcp__")) {
      const parts = toolName.split("__");
      if (parts.length >= 3) {
        toolName = parts.slice(2).join("__");
      }
    }
    const connector = findConnectorById(connectorId);
    if (!connector) return { ok: false, code: "NOT_FOUND", error: "连接器不存在" };
    if (!connector.enabled) return { ok: false, code: "DISABLED", error: "连接器未启用" };
    const session = await ensureMcpSession(connector);
    let args = payload.arguments;
    if (typeof args === "string") {
      try {
        args = JSON.parse(args || "{}");
      } catch (_) {
        args = {};
      }
    }
    if (!args || typeof args !== "object") args = {};
    const called = await mcpJsonRpc(
      connector,
      "tools/call",
      { name: toolName, arguments: args },
      session.sessionId
    );
    return { ok: true, result: called.result };
  } catch (err) {
    return {
      ok: false,
      code: err.code || "CALL_FAILED",
      error: err.message || String(err),
    };
  }
});

/** PDF 用：Markdown/纯文本 → HTML（printToPDF） */
function buildWordCompatibleHtml(title, text) {
  const esc = String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
  const body = esc
    .split(/\r?\n/)
    .map((line) => {
      if (/^#{1,6}\s+/.test(line)) {
        const t = line.replace(/^#{1,6}\s+/, "");
        return `<p><b>${t}</b></p>`;
      }
      if (!line.trim()) return "<p>&nbsp;</p>";
      return `<p>${line}</p>`;
    })
    .join("\n");
  const safeTitle = String(title || "Codex导出")
    .replace(/</g, "")
    .replace(/>/g, "")
    .slice(0, 80);
  return `<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:w="urn:schemas-microsoft-com:office:word"
 xmlns="http://www.w3.org/TR/REC-html40">
<head>
<meta charset="utf-8" />
<title>${safeTitle}</title>
<style>
  body { font-family: "Microsoft YaHei", SimSun, sans-serif; font-size: 12pt; line-height: 1.6; }
  p { margin: 0 0 8pt 0; white-space: pre-wrap; }
</style>
</head>
<body>${body}</body>
</html>`;
}

/** ZIP CRC32（OOXML 包内本地文件头需要） */
function crc32Bytes(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) {
      c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
    }
  }
  return (c ^ 0xffffffff) >>> 0;
}

/** 无压缩 ZIP 条目（method=0 Store），Word/WPS 均可打开 */
function zipStoreArchive(entries) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  for (const { name, data } of entries) {
    const nameBuf = Buffer.from(name, "utf8");
    const payload = Buffer.isBuffer(data) ? data : Buffer.from(data, "utf8");
    const crc = crc32Bytes(payload);
    const local = Buffer.alloc(30 + nameBuf.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(0, 8); // Store
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(0, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(payload.length, 18);
    local.writeUInt32LE(payload.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);
    nameBuf.copy(local, 30);
    localParts.push(local, payload);

    const central = Buffer.alloc(46 + nameBuf.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(0, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(payload.length, 20);
    central.writeUInt32LE(payload.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    nameBuf.copy(central, 46);
    centralParts.push(central);
    offset += local.length + payload.length;
  }
  const centralDir = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralDir.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);
  return Buffer.concat([...localParts, centralDir, end]);
}

function xmlEscapeText(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** OOXML 文本 run：支持粗体 / 斜体 / 行内代码 / 字号 */
function ooxmlTextRun(text, opts = {}) {
  const content = text.length ? xmlEscapeText(text) : " ";
  const parts = [];
  if (opts.bold) parts.push("<w:b/><w:bCs/>");
  if (opts.italic) parts.push("<w:i/><w:iCs/>");
  if (opts.code) {
    parts.push('<w:rFonts w:ascii="Consolas" w:hAnsi="Consolas" w:eastAsia="Consolas"/>');
    parts.push('<w:sz w:val="20"/><w:szCs w:val="20"/>');
    parts.push('<w:shd w:val="clear" w:fill="F3F4F6"/>');
  } else if (opts.sz) {
    parts.push(`<w:sz w:val="${opts.sz}"/><w:szCs w:val="${opts.sz}"/>`);
  }
  const rPr = parts.length ? `<w:rPr>${parts.join("")}</w:rPr>` : "";
  return `<w:r>${rPr}<w:t xml:space="preserve">${content}</w:t></w:r>`;
}

/** 行内 Markdown → OOXML runs（**粗体** / *斜体* / `代码`）；baseOpts 用于标题等强制样式 */
function markdownInlineToOoxmlRuns(line, baseOpts = {}) {
  const src = String(line || "");
  if (!src) return ooxmlTextRun(" ", baseOpts);
  const re = /\*\*([^*]+)\*\*|`([^`]+)`|\*([^*]+)\*/g;
  const runs = [];
  let last = 0;
  let m;
  while ((m = re.exec(src)) !== null) {
    if (m.index > last) runs.push(ooxmlTextRun(src.slice(last, m.index), baseOpts));
    if (m[1] != null) {
      runs.push(ooxmlTextRun(m[1], { ...baseOpts, bold: true }));
    } else if (m[2] != null) {
      runs.push(ooxmlTextRun(m[2], { ...baseOpts, code: true }));
    } else if (m[3] != null) {
      runs.push(ooxmlTextRun(m[3], { ...baseOpts, italic: true }));
    }
    last = m.index + m[0].length;
  }
  if (last < src.length) runs.push(ooxmlTextRun(src.slice(last), baseOpts));
  return runs.length ? runs.join("") : ooxmlTextRun(" ", baseOpts);
}

function ooxmlParagraph(runsXml, pPrXml = "") {
  return `<w:p>${pPrXml || ""}${runsXml}</w:p>`;
}

/**
 * Markdown 正文 → OOXML 段落序列
 * 支持：标题、无序/有序列表、代码围栏、粗体/斜体/行内代码
 */
function markdownToOoxmlParagraphs(text) {
  const lines = String(text || "").split(/\r?\n/);
  const out = [];
  let inFence = false;
  let fenceLang = "";

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const fenceOpen = line.match(/^```([\w-]*)\s*$/);
    if (fenceOpen) {
      if (!inFence) {
        inFence = true;
        fenceLang = fenceOpen[1] || "";
        if (fenceLang) {
          out.push(ooxmlParagraph(
            ooxmlTextRun(fenceLang, { code: true, italic: true }),
            '<w:pPr><w:shd w:val="clear" w:fill="EEF2FF"/><w:spacing w:before="120" w:after="0"/></w:pPr>'
          ));
        }
      } else {
        inFence = false;
        fenceLang = "";
        out.push(ooxmlParagraph(
          ooxmlTextRun(" "),
          '<w:pPr><w:spacing w:before="0" w:after="120"/></w:pPr>'
        ));
      }
      continue;
    }
    if (inFence) {
      out.push(ooxmlParagraph(
        ooxmlTextRun(line.length ? line : " ", { code: true }),
        '<w:pPr><w:shd w:val="clear" w:fill="F3F4F6"/><w:spacing w:before="0" w:after="0"/><w:ind w:left="200"/></w:pPr>'
      ));
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      const level = heading[1].length;
      const sz = level === 1 ? 36 : level === 2 ? 32 : level === 3 ? 28 : 24;
      out.push(ooxmlParagraph(
        markdownInlineToOoxmlRuns(heading[2], { bold: true, sz }),
        '<w:pPr><w:spacing w:before="200" w:after="120"/></w:pPr>'
      ));
      continue;
    }

    const ul = line.match(/^\s*[-*+]\s+(.*)$/);
    if (ul) {
      out.push(ooxmlParagraph(
        markdownInlineToOoxmlRuns(ul[1]),
        '<w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr><w:spacing w:after="60"/></w:pPr>'
      ));
      continue;
    }

    const ol = line.match(/^\s*\d+\.\s+(.*)$/);
    if (ol) {
      out.push(ooxmlParagraph(
        markdownInlineToOoxmlRuns(ol[1]),
        '<w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="2"/></w:numPr><w:spacing w:after="60"/></w:pPr>'
      ));
      continue;
    }

    if (!line.trim()) {
      out.push(ooxmlParagraph(ooxmlTextRun(" "), '<w:pPr><w:spacing w:after="80"/></w:pPr>'));
      continue;
    }

    out.push(ooxmlParagraph(
      markdownInlineToOoxmlRuns(line),
      '<w:pPr><w:spacing w:after="100"/></w:pPr>'
    ));
  }

  return out.join("");
}

/**
 * 构建真正的 OOXML .docx（ZIP + word/document.xml + numbering）
 * 富文本：标题层级、列表、代码围栏、粗体/斜体/行内代码
 */
function buildOoxmlDocxBuffer(title, text) {
  const paragraphs = markdownToOoxmlParagraphs(text);
  const safeTitle = xmlEscapeText(String(title || "Codex导出").slice(0, 80));
  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
 xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <w:body>
    <w:p><w:pPr><w:spacing w:after="200"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="36"/><w:szCs w:val="36"/></w:rPr><w:t xml:space="preserve">${safeTitle}</w:t></w:r></w:p>
    ${paragraphs}
    <w:sectPr>
      <w:pgSz w:w="11906" w:h="16838"/>
      <w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/>
    </w:sectPr>
  </w:body>
</w:document>`;

  const numberingXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:abstractNum w:abstractNumId="0">
    <w:multiLevelType w:val="hybridMultilevel"/>
    <w:lvl w:ilvl="0">
      <w:start w:val="1"/>
      <w:numFmt w:val="bullet"/>
      <w:lvlText w:val="•"/>
      <w:lvlJc w:val="left"/>
      <w:pPr><w:ind w:left="720" w:hanging="360"/></w:pPr>
    </w:lvl>
  </w:abstractNum>
  <w:abstractNum w:abstractNumId="1">
    <w:multiLevelType w:val="hybridMultilevel"/>
    <w:lvl w:ilvl="0">
      <w:start w:val="1"/>
      <w:numFmt w:val="decimal"/>
      <w:lvlText w:val="%1."/>
      <w:lvlJc w:val="left"/>
      <w:pPr><w:ind w:left="720" w:hanging="360"/></w:pPr>
    </w:lvl>
  </w:abstractNum>
  <w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>
  <w:num w:numId="2"><w:abstractNumId w:val="1"/></w:num>
</w:numbering>`;

  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>
</Types>`;

  const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

  const docRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>
</Relationships>`;

  return zipStoreArchive([
    { name: "[Content_Types].xml", data: contentTypes },
    { name: "_rels/.rels", data: rootRels },
    { name: "word/document.xml", data: documentXml },
    { name: "word/_rels/document.xml.rels", data: docRels },
    { name: "word/numbering.xml", data: numberingXml }
  ]);
}

function stripMarkdownToPlain(text) {
  return String(text || "")
    .replace(/```[\s\S]*?```/g, (m) => m.replace(/```[^\n]*\n?/g, "").replace(/```/g, ""))
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/\*(.*?)\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/^\s*[-*+]\s+/gm, "• ")
    .trim();
}

/**
 * 消息级导出（对齐豆包「下载」）：MD / TXT / Word(.docx OOXML) / PDF
 * payload: { content, title?, format?: 'md'|'txt'|'docx'|'pdf', defaultName? }
 */
ipcMain.handle("export-chat-artifact", async (_event, payload = {}) => {
  const content = typeof payload.content === "string" ? payload.content : "";
  if (!content.trim()) {
    return { ok: false, code: "EMPTY", error: "没有可导出的内容" };
  }
  const title = (typeof payload.title === "string" && payload.title.trim()) || "Codex导出";
  const preferred = String(payload.format || "").toLowerCase();
  const defaultName = (typeof payload.defaultName === "string" && payload.defaultName.trim())
    || `codex-export-${new Date().toISOString().slice(0, 10)}`;

  const win = mainWindow || BrowserWindow.getFocusedWindow();
  const filters = [
    { name: "Markdown", extensions: ["md"] },
    { name: "纯文本", extensions: ["txt"] },
    { name: "Word 文档", extensions: ["docx"] },
    { name: "PDF", extensions: ["pdf"] }
  ];
  let defaultPath = defaultName.replace(/[<>:"/\\|?*]/g, "_").slice(0, 80);
  if (preferred === "md") defaultPath += ".md";
  else if (preferred === "txt") defaultPath += ".txt";
  else if (preferred === "doc" || preferred === "docx") defaultPath += ".docx";
  else if (preferred === "pdf") defaultPath += ".pdf";
  else defaultPath += ".md";

  const result = await dialog.showSaveDialog(win, {
    title: "导出回答",
    defaultPath,
    filters
  });
  if (result.canceled || !result.filePath) {
    return { ok: false, canceled: true, code: "CANCELED" };
  }

  let filePath = result.filePath;
  let ext = path.extname(filePath).toLowerCase().replace(/^\./, "") || "md";
  // 兼容旧入口 format=doc：统一写成真正的 OOXML .docx
  if (ext === "doc") {
    filePath = filePath.replace(/\.doc$/i, ".docx");
    ext = "docx";
  }

  try {
    if (ext === "pdf") {
      const html = buildWordCompatibleHtml(title, content);
      const hidden = new BrowserWindow({
        show: false,
        width: 800,
        height: 1000,
        webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false }
      });
      try {
        await hidden.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
        const pdfBuf = await hidden.webContents.printToPDF({
          printBackground: true,
          pageSize: "A4",
          margins: { marginType: "default" }
        });
        fs.writeFileSync(filePath, pdfBuf);
      } finally {
        if (!hidden.isDestroyed()) hidden.destroy();
      }
    } else if (ext === "docx") {
      const docxBuf = buildOoxmlDocxBuffer(title, content);
      fs.writeFileSync(filePath, docxBuf);
    } else if (ext === "txt") {
      fs.writeFileSync(filePath, stripMarkdownToPlain(content), "utf8");
    } else {
      // md 及其它：原样保存
      fs.writeFileSync(filePath, content, "utf8");
    }
    return { ok: true, filePath, format: ext };
  } catch (err) {
    return { ok: false, code: "EXPORT_FAILED", error: err.message || String(err) };
  }
});

ipcMain.handle("show-item-in-folder", (_event, filePath) => {
  if (typeof filePath === "string" && filePath.trim()) {
    shell.showItemInFolder(path.resolve(filePath));
  }
  return { ok: true };
});

ipcMain.handle("check-for-updates-manual", () => {
  checkForUpdates(false);
  return { success: true };
});

ipcMain.handle("start-download-update-action", (_event, { downloadUrl, version }) => {
  if (!downloadUrl || !version) {
    return { success: false, error: "Missing downloadUrl or version" };
  }
  if (!isAllowedUpdateDownloadUrl(downloadUrl)) {
    return { success: false, error: "Download URL failed allowlist check" };
  }
    startDownloadUpdate(downloadUrl, version);
    return { success: true };
});

ipcMain.handle("apply-update-now", () => {
  const ok = applyPendingUpdate();
  return { success: ok };
});

ipcMain.handle("apply-update-on-quit", () => {
  return { success: true, pending: !!pendingUpdateInstallerPath };
});

// 官方 Codex CLI (Rust / Node @openai/codex) 状态检测适配器
ipcMain.handle("detect-core-status", async () => {
  return new Promise((resolve) => {
    const { exec } = require("child_process");
    exec("codex --version", (err, stdout) => {
      if (!err && stdout && stdout.trim()) {
        resolve({
          installed: true,
          version: stdout.trim(),
          source: "system-path",
          latestAvailable: "v0.152.1"
        });
      } else {
        const userHome = os.homedir();
        const customBin = path.join(userHome, ".codex", "bin", process.platform === "win32" ? "codex.exe" : "codex");
        if (fs.existsSync(customBin)) {
          resolve({
            installed: true,
            version: "v0.152.1 (local)",
            path: customBin,
            source: "local-dir",
            latestAvailable: "v0.152.1"
          });
        } else {
          resolve({
            installed: false,
            version: "none",
            latestAvailable: "v0.152.1"
          });
        }
      }
    });
  });
});

ipcMain.handle("open-external", async (_event, targetUrl) => {
  if (targetUrl && (targetUrl.startsWith("https://") || targetUrl.startsWith("http://"))) {
    shell.openExternal(targetUrl);
    return { success: true };
  }
  return { success: false, error: "Invalid URL" };
});

ipcMain.handle("save-temp-image", async (_event, base64Data) => {
  try {
    const tempDir = path.join(os.tmpdir(), "codex-desktop-images");
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
    
    const cleanBase64 = base64Data.replace(/^data:image\/\w+;base64,/, "");
    const buffer = Buffer.from(cleanBase64, "base64");
    const fileName = `clipboard-${Date.now()}.png`;
    const filePath = path.join(tempDir, fileName);
    fs.writeFileSync(filePath, buffer);
    return { success: true, path: filePath };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// ---------------------------------------------------------------------------
// App Lifecycle
// ---------------------------------------------------------------------------

  // -------------------------------------------------------------------------
  // 6. 底层原生大模型 API 请求管道 (Node.js 原生请求，模拟标准客户端防拦截)
  // -------------------------------------------------------------------------
  const activeLlmStreams = new Map();

  ipcMain.handle("abort-llm-stream", (_event, streamId) => {
    if (streamId && activeLlmStreams.has(streamId)) {
      const info = activeLlmStreams.get(streamId);
      if (info) {
        if (typeof info.clearActiveTimer === 'function') info.clearActiveTimer();
        if (info.req) {
          try {
            info.req.destroy();
          } catch (e) {}
        }
      }
      activeLlmStreams.delete(streamId);
      return { success: true };
    }
    return { success: false, notFound: true };
  });

  // 原生 Node.js 底层 HTTP 请求管道 (通用双协议自适应: OpenAI 兼容 & Anthropic 原生)
  // 原生 Node.js 底层 HTTP 请求管道 (通用双协议自适应 + 智能故障自愈重试)
  ipcMain.handle("call-llm-api", async (event, payload) => {
    const { endpoint, apiKey, body, customHeaders = {}, timeout: userTimeout, stream = false, streamId = '' } = payload;
    const https = require("https");
    const http = require("http");

    // 如果启用了流式传输，确保 body.stream 为 true
    if (stream && typeof body === 'object' && body !== null) {
      body.stream = true;
    }

    const postData = JSON.stringify(body);
    const cleanKey = (apiKey || "").trim();

    let parsedUrl;
    try {
      parsedUrl = new URL(endpoint);
    } catch {
      return {
        ok: false,
        status: 400,
        statusText: "Bad Request",
        body: JSON.stringify({ error: { message: "无效的 API endpoint URL" } })
      };
    }
    if (parsedUrl.protocol !== "https:" && parsedUrl.protocol !== "http:") {
      return {
        ok: false,
        status: 400,
        statusText: "Bad Request",
        body: JSON.stringify({ error: { message: "仅允许 http/https 协议的 LLM endpoint" } })
      };
    }
    const isHttps = parsedUrl.protocol === "https:";
    const client = isHttps ? https : http;

    // 判断是 Anthropic 原生端点还是 OpenAI 兼容端点
    const isAnthropicEndpoint = endpoint.includes("/messages");

    // customHeaders 先合并，鉴权头后覆盖，防止渲染进程覆盖 Authorization / x-api-key
    const safeCustomHeaders = (customHeaders && typeof customHeaders === "object") ? { ...customHeaders } : {};
    delete safeCustomHeaders.Authorization;
    delete safeCustomHeaders.authorization;
    delete safeCustomHeaders["x-api-key"];
    delete safeCustomHeaders["X-Api-Key"];

    let baseHeaders = {};
    if (isAnthropicEndpoint) {
      baseHeaders = {
        "Content-Type": "application/json",
        ...safeCustomHeaders,
        ...(stream ? {} : { "Content-Length": Buffer.byteLength(postData) }),
        "x-api-key": cleanKey,
        "anthropic-version": "2023-06-01",
        "User-Agent": "cline/3.0.0",
        "Accept": stream ? "text/event-stream, application/json" : "application/json",
        "Connection": "keep-alive"
      };
    } else {
      baseHeaders = {
        "Content-Type": "application/json",
        ...safeCustomHeaders,
        ...(stream ? {} : { "Content-Length": Buffer.byteLength(postData) }),
        "Authorization": cleanKey ? `Bearer ${cleanKey}` : "",
        "User-Agent": "cline/3.0.0",
        "Accept": stream ? "text/event-stream, application/json" : "application/json",
        "Connection": "keep-alive"
      };
    }

    // -----------------------------------------------------------------------
    // 双层自适应超时控制系统:
    // 1. 首包自适应: 根据发送 Prompt 字节大小动态调节首包等待 (默认 120s，长任务最高 300s)
    // 2. 滑动窗口保活 (Rolling Inactivity Timeout): 数据流一旦开始吐字，只要在持续传输，连接永不中断
    // -----------------------------------------------------------------------
    const payloadBytes = Buffer.byteLength(postData);
    const adaptiveInitialMs = userTimeout && userTimeout > 0
      ? userTimeout * 1000
      : Math.min(300000, 120000 + Math.floor(payloadBytes / 1000) * 15000);

    const rollingInactivityMs = 600000; // 数据流入后的空闲静默容忍度 (600s，给长推理/长思考留足静默窗)

    // 单次底层网络请求执行体
    const runAttempt = (attemptIndex, forceNewConnection = false) => {
      return new Promise((resolve) => {
        let activeTimer = null;
        let hasReceivedFirstByte = false;
        let sseBuffer = "";
        let accumulatedText = "";
        let accumulatedThinking = "";
        let lastFinishReason = "";
        let streamError = null;
        let streamUsage = null;
        // 流式 usage 末帧累加（OpenAI include_usage / Anthropic message_delta.usage）
        let lastUsage = null;
        // OpenAI tool_calls 按 index 累加（Wave D：真正执行写盘工具）
        const pendingToolCalls = {};

        const clearActiveTimer = () => {
          if (activeTimer) {
            clearTimeout(activeTimer);
            activeTimer = null;
          }
        };

        const setTimer = (ms, reason) => {
          clearActiveTimer();
          activeTimer = setTimeout(() => {
            req.destroy();
            resolve({
              ok: false,
              status: 408,
              statusText: "Request Timeout",
              body: JSON.stringify({
                error: {
                  message: reason
                }
              }),
              canRetry: !hasReceivedFirstByte
            });
          }, ms);
        };

        const options = {
          hostname: parsedUrl.hostname,
          port: parsedUrl.port ? Number(parsedUrl.port) : (isHttps ? 443 : 80),
          path: `${parsedUrl.pathname || "/"}${parsedUrl.search || ""}`,
          method: "POST",
          headers: baseHeaders,
          // 若重试或对端单向重置，强制禁用 Agent 缓存 (新建全新 TCP 握手，规避 Half-Open 假死 Socket)
          agent: forceNewConnection ? false : undefined
        };

        const req = client.request(options, (res) => {
          if (stream && streamId) {
            activeLlmStreams.set(streamId, { req, clearActiveTimer });
          }
          let responseBody = "";
          res.setEncoding("utf8");

          /** 解析单行 SSE data: 载荷（OpenAI 兼容 + Anthropic） */
          const ingestSseDataPayload = (dataStr) => {
            if (!dataStr || dataStr === "[DONE]") return;
            try {
              const parsed = JSON.parse(dataStr);
              // 捕获流式传输中可能下发的数据级错误（如欠费、限流、超长拦截等）
              if (parsed.error) {
                streamError = parsed.error.message || (typeof parsed.error === "string" ? parsed.error : JSON.stringify(parsed.error));
              }
              const choice = parsed.choices?.[0];
              // content / text；部分网关在非 delta 的 message 上给正文
              const deltaText =
                choice?.delta?.content ||
                choice?.delta?.text ||
                (choice?.message && !choice?.delta ? (choice.message.content || "") : "") ||
                "";
              const deltaThinking =
                choice?.delta?.reasoning_content ||
                choice?.delta?.reasoning ||
                (choice?.message && !choice?.delta
                  ? (choice.message.reasoning_content || choice.message.reasoning || "")
                  : "") ||
                "";
              if (choice?.finish_reason) lastFinishReason = String(choice.finish_reason);
              if (parsed.type === "message_delta" && parsed.delta?.stop_reason) {
                lastFinishReason = String(parsed.delta.stop_reason);
              }
              if (parsed.type === "message_stop" && parsed.stop_reason) {
                lastFinishReason = String(parsed.stop_reason);
              }

              // 捕获真实 usage（OpenAI 末帧 / Anthropic message_start|message_delta）
              const usageCandidate =
                parsed.usage ||
                parsed.message?.usage ||
                (parsed.type === "message_delta" ? parsed.usage : null) ||
                (parsed.type === "message_start" ? parsed.message?.usage : null) ||
                null;
              if (usageCandidate && typeof usageCandidate === "object") {
                lastUsage = { ...(lastUsage || {}), ...usageCandidate };
                streamUsage = lastUsage;
              }

              const toolCalls = choice?.delta?.tool_calls;
              if (Array.isArray(toolCalls) && toolCalls.length > 0) {
                for (const tc of toolCalls) {
                  const idx = typeof tc.index === "number" ? tc.index : 0;
                  if (!pendingToolCalls[idx]) {
                    pendingToolCalls[idx] = { id: "", name: "", arguments: "" };
                  }
                  if (tc.id) pendingToolCalls[idx].id = tc.id;
                  if (tc.function?.name) pendingToolCalls[idx].name = tc.function.name;
                  if (tc.function?.arguments) pendingToolCalls[idx].arguments += tc.function.arguments;
                }
              }

              let anthropicText = "";
              let anthropicThinking = "";
              if (parsed.type === "content_block_delta") {
                if (parsed.delta?.type === "text_delta") anthropicText = parsed.delta.text || "";
                if (parsed.delta?.type === "thinking_delta") anthropicThinking = parsed.delta.thinking || "";
                if (parsed.delta?.type === "input_json_delta" && parsed.index != null) {
                  const idx = parsed.index;
                  if (!pendingToolCalls[idx]) pendingToolCalls[idx] = { id: "", name: "", arguments: "" };
                  pendingToolCalls[idx].arguments += parsed.delta.partial_json || "";
                }
              } else if (parsed.type === "content_block_start" && parsed.content_block?.type === "tool_use") {
                const idx = parsed.index != null ? parsed.index : Object.keys(pendingToolCalls).length;
                pendingToolCalls[idx] = {
                  id: parsed.content_block.id || "",
                  name: parsed.content_block.name || "",
                  arguments: ""
                };
              }

              const contentDelta = deltaText || anthropicText || "";
              const thinkingDelta = deltaThinking || anthropicThinking;

              if (contentDelta) accumulatedText += contentDelta;
              if (thinkingDelta) accumulatedThinking += thinkingDelta;

              if ((contentDelta || thinkingDelta) && !event.sender.isDestroyed()) {
                event.sender.send("llm-stream-chunk", {
                  streamId,
                  contentDelta,
                  thinkingDelta,
                  isDone: false
                });
              }
            } catch (e) {
              // 部分未完整的 JSON 片段忽略，等待下个 chunk 拼接
            }
          };

          /** end 时冲刷无尾换行滞留在 sseBuffer 的最后一帧 */
          const flushSseTail = () => {
            if (!sseBuffer.trim()) {
              sseBuffer = "";
              return;
            }
            const leftover = sseBuffer;
            sseBuffer = "";
            const trimmedLine = leftover.trim();
            if (!trimmedLine || !trimmedLine.startsWith("data:")) return;
            ingestSseDataPayload(trimmedLine.replace(/^data:\s*/, ""));
          };

          res.on("data", (chunk) => {
            if (!hasReceivedFirstByte) {
              hasReceivedFirstByte = true;
            }
            setTimer(rollingInactivityMs, "数据流传输静默超时 (600s)，服务端可能已意外断开或长时间无输出");
            responseBody += chunk;

            if (stream && res.statusCode >= 200 && res.statusCode < 300) {
              sseBuffer += chunk;
              const lines = sseBuffer.split(/\r?\n/);
              sseBuffer = lines.pop() || "";
              for (const line of lines) {
                const trimmedLine = line.trim();
                if (!trimmedLine || !trimmedLine.startsWith("data:")) continue;
                ingestSseDataPayload(trimmedLine.replace(/^data:\s*/, ""));
              }
            }
          });

          // 捕获响应流中途 EOF / 连接被对端关闭等错误，防止未处理的流式中断
          res.on("error", (resErr) => {
            clearActiveTimer();
            const isEofError = resErr.message && (
              resErr.message.includes('unexpected EOF') ||
              resErr.message.includes('read ECONNRESET') ||
              resErr.message.includes('aborted') ||
              resErr.message.includes('stream reading error')
            );
            // 正文或长思考任一已有输出时均保留截断，避免 GLM 仅 reasoning 断流被当成空失败
            if (stream && (accumulatedText || accumulatedThinking)) {
              if (!event.sender.isDestroyed()) {
                event.sender.send("llm-stream-chunk", { streamId, isDone: true });
              }
              const partialContent = accumulatedText
                ? accumulatedText + "\n\n> ⚠️ *[传输中途中断，已截断显示]*"
                : "> ⚠️ *[传输中途中断，已截断显示]*";
              resolve({
                ok: true,
                status: 200,
                statusText: "Partial OK",
                body: JSON.stringify({
                  choices: [{ message: { content: partialContent, reasoning_content: accumulatedThinking } }]
                }),
                canRetry: false
              });
            } else {
              resolve({
                ok: false,
                status: 0,
                statusText: "Stream EOF",
                body: JSON.stringify({ error: { message: resErr.message, code: resErr.code || 'STREAM_EOF' } }),
                canRetry: isEofError && !hasReceivedFirstByte
              });
            }
          });

          res.on("end", () => {
            clearActiveTimer();

            // 冲刷无尾换行滞留在 sseBuffer 的最后一帧，避免丢 content / finish_reason
            if (stream && res.statusCode >= 200 && res.statusCode < 300) {
              flushSseTail();
            }

            const finishedToolCalls = Object.keys(pendingToolCalls)
              .sort((a, b) => Number(a) - Number(b))
              .map((k) => pendingToolCalls[k])
              .filter((tc) => tc && tc.name);
            if (stream && !event.sender.isDestroyed()) {
              event.sender.send("llm-stream-chunk", {
                streamId,
                isDone: true,
                toolCalls: finishedToolCalls,
                finishReason: lastFinishReason || undefined
              });
            }

            // 仅 HTTP 2xx 流式成功时组装 JSON；4xx/5xx 保留原始错误 body，避免盖掉上游 error.message
            // 2xx 时禁止回传裸 SSE（GLM 仅 thinking 也会组包）
            let finalBody = responseBody;
            const httpOk = res.statusCode >= 200 && res.statusCode < 300;
            if (stream && httpOk) {
              if (streamError) {
                resolve({
                  ok: false,
                  status: 400,
                  statusText: "Stream Error",
                  body: JSON.stringify({ error: { message: streamError } }),
                  canRetry: false
                });
                return;
              }
              const anthropicContent = [];
              if (accumulatedThinking) {
                anthropicContent.push({ type: "thinking", thinking: accumulatedThinking });
              }
              if (accumulatedText) {
                anthropicContent.push({ type: "text", text: accumulatedText });
              }
              for (let i = 0; i < finishedToolCalls.length; i++) {
                const tc = finishedToolCalls[i];
                let input = {};
                try { input = JSON.parse(tc.arguments || "{}"); } catch { input = {}; }
                anthropicContent.push({
                  type: "tool_use",
                  id: tc.id || `call_${i}`,
                  name: tc.name,
                  input
                });
              }

              // OpenAI 兼容 usage 字段；同时保留 Anthropic input_tokens/output_tokens
              const usageSrc = lastUsage || streamUsage;
              let usageOut = undefined;
              if (usageSrc) {
                const promptTokens =
                  usageSrc.prompt_tokens ?? usageSrc.input_tokens ?? undefined;
                const completionTokens =
                  usageSrc.completion_tokens ?? usageSrc.output_tokens ?? undefined;
                usageOut = {
                  ...usageSrc,
                  prompt_tokens: promptTokens,
                  completion_tokens: completionTokens,
                  input_tokens: usageSrc.input_tokens ?? promptTokens,
                  output_tokens: usageSrc.output_tokens ?? completionTokens
                };
              }

              finalBody = JSON.stringify({
                choices: [{
                  finish_reason: lastFinishReason || (finishedToolCalls.length ? "tool_calls" : "stop"),
                  message: {
                    content: accumulatedText || "",
                    reasoning_content: accumulatedThinking || "",
                    tool_calls: finishedToolCalls.map((tc, i) => ({
                      id: tc.id || `call_${i}`,
                      type: "function",
                      function: { name: tc.name, arguments: tc.arguments || "{}" }
                    }))
                  }
                }],
                // Anthropic 双形态：App 可读 content[]，避免只组 choices 时 anthropic 分支空读
                content: anthropicContent,
                stop_reason: lastFinishReason || (finishedToolCalls.length ? "tool_use" : "end_turn"),
                usage: usageOut || streamUsage,
                codex_tool_calls: finishedToolCalls,
                finish_reason: lastFinishReason || undefined
              });
            } else if (typeof responseBody === "string" && (responseBody.trim().startsWith("data:") || responseBody.includes("\ndata:"))) {
              // 某些网关在错误时亦返回 text/event-stream 格式，清洗为 JSON 错误
              try {
                let extractedErr = "";
                const lines = responseBody.trim().split(/\r?\n/);
                for (const l of lines) {
                  const t = l.trim();
                  if (t.startsWith("data:")) {
                    const raw = t.replace(/^data:\s*/, "");
                    if (raw && raw !== "[DONE]") {
                      const p = JSON.parse(raw);
                      if (p.error?.message || p.message) {
                        extractedErr = p.error?.message || p.message;
                        break;
                      }
                    }
                  }
                }
                if (extractedErr) {
                  finalBody = JSON.stringify({ error: { message: extractedErr } });
                }
              } catch {}
            }

            resolve({
              ok: httpOk,
              status: res.statusCode,
              statusText: res.statusMessage,
              body: finalBody,
              canRetry: false
            });
          });
        });

        req.on("error", (e) => {
          clearActiveTimer();
          // 若在此之前没有任何数据流吐出，且属于瞬态网络层中断，判定为可弹性重试
          const isTransientNetworkError =
            e.code === 'ECONNRESET' ||
            e.code === 'ETIMEDOUT' ||
            e.code === 'ECONNREFUSED' ||
            e.code === 'EPIPE' ||
            (e.message && (
              e.message.includes('ECONNRESET') ||
              e.message.includes('socket hang up') ||
              e.message.includes('aborted')
            ));

          resolve({
            ok: false,
            status: 0,
            statusText: "Network Error",
            body: JSON.stringify({ error: { message: e.message, code: e.code } }),
            canRetry: !hasReceivedFirstByte && isTransientNetworkError
          });
        });

        // 初始化启动首包等待计时器
        setTimer(
          adaptiveInitialMs,
          `首包响应等待超时 (${Math.round(adaptiveInitialMs / 1000)}s)，当前为长任务或中转站排队中，请检查中转站响应速度`
        );

        req.write(postData);
        req.end();
      });
    };

    // 弹性自愈重试调度器：最多重试 2 次（总计最多尝试 3 次），重试前短暂指数退避并强制新建连接
    const maxRetries = 2;
    let attempt = 0;
    let currentResult = null;

    while (attempt <= maxRetries) {
      const forceNew = attempt > 0;
      currentResult = await runAttempt(attempt, forceNew);
      if (currentResult.ok || !currentResult.canRetry || attempt === maxRetries) {
        break;
      }
      attempt++;
      // 指数退避等待 (第1次重试等 600ms, 第2次重试等 1200ms)
      await new Promise(r => setTimeout(r, attempt * 600));
    }

    return {
      ok: currentResult.ok,
      status: currentResult.status,
      statusText: currentResult.statusText,
      body: currentResult.body
    };
  });

  // ---------------------------------------------------------------------------
  // 主进程权威安全沙箱状态机 (Authoritative Security Sandbox State Machine)
  // ---------------------------------------------------------------------------
  const SecuritySandbox = {
    activeWorkspaceDir: null,
    permissionMode: "workspace-readonly", // "workspace-readonly" | "full-access"
    policyPath: path.join(os.homedir(), ".codex", "security-policy.json"),
    auditLogPath: path.join(os.homedir(), ".codex", "audit.log"),

    init() {
      try {
        if (fs.existsSync(this.policyPath)) {
          const raw = fs.readFileSync(this.policyPath, "utf8");
          const data = JSON.parse(raw);
          if (data.activeWorkspaceDir && fs.existsSync(data.activeWorkspaceDir)) {
            this.activeWorkspaceDir = fs.realpathSync(data.activeWorkspaceDir);
          }
          const validModes = ["chat-only", "workspace-readonly", "workspace-readwrite", "full-access"];
          if (validModes.includes(data.permissionMode)) {
            this.permissionMode = data.permissionMode;
          }
        }
      } catch (e) {
        // 容错保持默认
      }
    },

    save() {
      try {
        const dir = path.dirname(this.policyPath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(this.policyPath, JSON.stringify({
          activeWorkspaceDir: this.activeWorkspaceDir,
          permissionMode: this.permissionMode,
          updatedAt: new Date().toISOString()
        }, null, 2), "utf8");
      } catch (e) {
        // 容错
      }
    },

    logAudit(action, targetPath, details = "") {
      try {
        const dir = path.dirname(this.auditLogPath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        const record = `[${new Date().toISOString()}] [${this.permissionMode}] ${action} -> ${targetPath} ${details}\n`;
        fs.appendFileSync(this.auditLogPath, record, "utf8");
      } catch (e) {
        // 容错
      }
    }
  };

  SecuritySandbox.init();

  // ---------------------------------------------------------------------------
  // 工作区目录选择与权限管理 (主进程绝对权威)
  // ---------------------------------------------------------------------------
  ipcMain.handle("select-workspace-dir", async () => {
    const win = mainWindow || BrowserWindow.getFocusedWindow();
    const result = await dialog.showOpenDialog(win, {
      title: "选择工程工作区目录",
      properties: ["openDirectory", "createDirectory"]
    });
    if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
      return null;
    }
    try {
      const realDir = fs.realpathSync(result.filePaths[0]);
      SecuritySandbox.activeWorkspaceDir = realDir;
      SecuritySandbox.save();
      return realDir;
    } catch (err) {
      SecuritySandbox.activeWorkspaceDir = result.filePaths[0];
      SecuritySandbox.save();
      return result.filePaths[0];
    }
  });

  ipcMain.handle("set-workspace-dir", async (_event, dirPath) => {
    if (!dirPath || typeof dirPath !== "string") {
      SecuritySandbox.activeWorkspaceDir = null;
      SecuritySandbox.save();
      SecuritySandbox.logAudit("WORKSPACE_DIR_CLEARED", "");
      return { ok: true, activeWorkspaceDir: null };
    }
    try {
      if (!fs.existsSync(dirPath)) {
        return { ok: false, error: "指定的工作区目录不存在" };
      }
      const st = fs.statSync(dirPath);
      if (!st.isDirectory()) {
        return { ok: false, error: "指定路径不是目录" };
      }
      const realDir = fs.realpathSync(dirPath);
      const prev = SecuritySandbox.activeWorkspaceDir;
      SecuritySandbox.activeWorkspaceDir = realDir;
      SecuritySandbox.save();
      if (normalizeFsPath(prev) !== normalizeFsPath(realDir)) {
        SecuritySandbox.logAudit("WORKSPACE_DIR_CHANGED", `${prev || "(null)"} -> ${realDir}`);
      }
      return { ok: true, activeWorkspaceDir: realDir };
    } catch (err) {
      SecuritySandbox.activeWorkspaceDir = dirPath;
      SecuritySandbox.save();
      return { ok: true, activeWorkspaceDir: dirPath };
    }
  });

  ipcMain.handle("get-security-status", async () => {
    return {
      activeWorkspaceDir: SecuritySandbox.activeWorkspaceDir,
      permissionMode: SecuritySandbox.permissionMode
    };
  });

  ipcMain.handle("set-permission-mode", async (_event, targetMode) => {
    const validModes = ["chat-only", "workspace-readonly", "workspace-readwrite", "full-access"];
    if (!validModes.includes(targetMode)) {
      return {
        ok: false,
        error: "无效的权限模式",
        permissionMode: SecuritySandbox.permissionMode
      };
    }

    // 提升至可写模式或全局受信任时，强制原生确认（防 XSS / 前端脚本自动提权）
    const writeCapable = new Set(["workspace-readwrite", "full-access"]);
    const elevatingToWrite =
      writeCapable.has(targetMode) && !writeCapable.has(SecuritySandbox.permissionMode);
    const elevatingToFull =
      targetMode === "full-access" && SecuritySandbox.permissionMode !== "full-access";

    if (elevatingToFull || elevatingToWrite) {
      const win = mainWindow || BrowserWindow.getFocusedWindow();
      const isFull = elevatingToFull;
      const choice = await dialog.showMessageBox(win, {
        type: "warning",
        buttons: ["取消", isFull ? "确认提升为全局受信任" : "确认提升为工作区读写"],
        defaultId: 0,
        cancelId: 0,
        title: "安全权限提升确认",
        message: isFull
          ? "确定将 Agent 运行权限提升至【全局受信任】模式吗？"
          : "确定将 Agent 运行权限提升至【工作区读写】模式吗？",
        detail: isFull
          ? "警告：全局受信任模式允许 Agent 跨越当前工作区，读取本机任意系统路径下的文件（包括环境配置、系统依赖等）。\n\n请确认当前对话环境值得信赖。"
          : "工作区读写模式允许 Agent 修改当前工作区内的文件（写入前会自动保留 .bak）。\n\n请确认当前对话环境值得信赖。"
      });

      if (choice.response !== 1) {
        return {
          ok: false,
          canceled: true,
          permissionMode: SecuritySandbox.permissionMode
        };
      }
    }

    SecuritySandbox.permissionMode = targetMode;
    SecuritySandbox.save();
    SecuritySandbox.logAudit("PERMISSION_MODE_CHANGED", targetMode);

    return {
      ok: true,
      permissionMode: SecuritySandbox.permissionMode
    };
  });

  // ---------------------------------------------------------------------------
  // 权威安全沙箱文件读取通道 (渲染进程仅能传 relativePath)
  // ---------------------------------------------------------------------------
  ipcMain.handle("extract-docx-text", async (_event, payload = {}) => {
  try {
    const raw = String(payload.base64 || "").replace(/^data:[^,]*,/, "");
    if (!raw) return { ok: false, code: "INVALID_ARGUMENT", error: "缺少 docx 内容" };
    const extracted = loadDocxBuffer(Buffer.from(raw, "base64"));
    return { ok: true, text: extracted.text, truncated: extracted.truncated };
  } catch (err) {
    return {
      ok: false,
      code: err.code || "DOCX_EXTRACT_FAILED",
      error: err.message || "抽取 docx 正文失败"
    };
  }
});

ipcMain.handle("extract-pdf-text", async (_event, payload = {}) => {
  try {
    const raw = String(payload.base64 || "").replace(/^data:[^,]*,/, "");
    if (!raw) return { ok: false, code: "INVALID_ARGUMENT", error: "缺少 PDF 内容" };
    const extracted = await extractPdfPlainText(Buffer.from(raw, "base64"));
    return { ok: true, text: extracted.text, truncated: extracted.truncated };
  } catch (err) {
    return {
      ok: false,
      code: err.code || "PDF_EXTRACT_FAILED",
      error: err.message || "抽取 PDF 正文失败"
    };
  }
});

// ---------------------------------------------------------------------------
// 富文本文档与媒体读取通道 (Word 图文公式 / PDF Canvas)
// ---------------------------------------------------------------------------
ipcMain.handle("read-rich-document", async (_event, payload) => {
  const relativePath = typeof payload === "string" ? payload : payload?.relativePath;
  if (!relativePath || typeof relativePath !== "string") {
    return {
      ok: false,
      code: "INVALID_ARGUMENT",
      reason: "文件相对路径不能为空",
      hint: "请指定有效的文档路径"
    };
  }

  const mode = SecuritySandbox.permissionMode;
  const workspace = SecuritySandbox.activeWorkspaceDir;

  if (mode === "chat-only") {
    SecuritySandbox.logAudit("BLOCKED_READ_CHAT_ONLY", relativePath);
    return {
      ok: false,
      code: "CHAT_ONLY_BLOCKED",
      reason: "当前处于【纯对话咨询】模式，已强制阻断本地任何文件读取操作以保护隐私",
      hint: "如需分析项目代码与文档，请在输入框左侧将权限模式切换为【工作区只读】或【工作区读写】"
    };
  }

  let candidatePath = "";

  if (mode === "workspace-readonly" || mode === "workspace-readwrite") {
    if (!workspace) {
      return {
        ok: false,
        code: "NO_WORKSPACE",
        reason: "当前尚未选定工作区工程目录",
        hint: "请在左侧栏点击选择或切换工作区目录"
      };
    }

    candidatePath = path.resolve(workspace, relativePath);

    if (!fs.existsSync(candidatePath)) {
      return {
        ok: false,
        code: "NOT_FOUND",
        reason: `文件不存在: ${relativePath}`,
        hint: "请检查相对路径拼写是否正确"
      };
    }

    try {
      const realWorkspace = fs.realpathSync(workspace);
      const realTarget = fs.realpathSync(candidatePath);
      const rel = path.relative(realWorkspace, realTarget);
      const isContained = !rel.startsWith("..") && !path.isAbsolute(rel);

      if (!isContained) {
        SecuritySandbox.logAudit("BLOCKED_SYMLINK_OR_TRAVERSAL", candidatePath);
        return {
          ok: false,
          code: "PERMISSION_DENIED",
          reason: "目标文件指向工作区外部物理路径 (软链接逃逸或越权穿透已拦截)",
          hint: "当前受安全沙箱保护，严禁访问工作区外部物理文件"
        };
      }
      candidatePath = realTarget;
    } catch (err) {
      return {
        ok: false,
        code: "REALPATH_ERROR",
        reason: `解析文件物理路径失败: ${err.message}`,
        hint: "文件可能为损坏的无效链接"
      };
    }
  } else {
    // full-access
    candidatePath = workspace ? path.resolve(workspace, relativePath) : path.resolve(relativePath);
    if (!fs.existsSync(candidatePath)) {
      return {
        ok: false,
        code: "NOT_FOUND",
        reason: `文件不存在: ${relativePath}`,
        hint: "请检查路径拼写是否正确"
      };
    }
    try {
      candidatePath = fs.realpathSync(candidatePath);
    } catch {}
  }

  try {
    const stat = fs.statSync(candidatePath);
    if (stat.isDirectory()) {
      return {
        ok: false,
        code: "IS_DIRECTORY",
        reason: `指定路径为目录而非文档: ${relativePath}`,
        hint: "请指定具体的 .docx 或 .pdf 文件"
      };
    }

    if (/\.docx$/i.test(candidatePath)) {
      if (stat.size > MAX_DOCX_SOURCE_BYTES) {
        return {
          ok: false,
          code: "FILE_TOO_LARGE",
          reason: "docx 超过 8MB，请先另存精简后再预览",
          hint: "超出文件大小上限"
        };
      }
      const richDoc = extractDocxRichDocument(fs.readFileSync(candidatePath));
      return {
        ok: true,
        type: "docx",
        relativePath,
        fullPath: candidatePath,
        richDocument: richDoc,
        totalBytes: stat.size
      };
    }

    if (/\.pdf$/i.test(candidatePath)) {
      if (stat.size > MAX_PDF_SOURCE_BYTES) {
        return {
          ok: false,
          code: "FILE_TOO_LARGE",
          reason: "PDF 超过 8MB，请先另存精简后再预览",
          hint: "超出文件大小上限"
        };
      }
      const fileBuffer = fs.readFileSync(candidatePath);
      return {
        ok: true,
        type: "pdf",
        relativePath,
        fullPath: candidatePath,
        base64: fileBuffer.toString("base64"),
        totalBytes: stat.size
      };
    }

    return {
      ok: false,
      code: "UNSUPPORTED_TYPE",
      reason: "仅支持查看 .docx 与 .pdf 富文本文档",
      hint: "如需查看其他代码或文本，请使用常规源码视图"
    };
  } catch (err) {
    return {
      ok: false,
      code: "RICH_DOC_ERROR",
      reason: err.message || "读取富文档失败"
    };
  }
});

ipcMain.handle("read-workspace-file", async (_event, payload) => {
    const relativePath = typeof payload === "string" ? payload : payload?.relativePath;
    if (!relativePath || typeof relativePath !== "string") {
      return {
        ok: false,
        code: "INVALID_ARGUMENT",
        reason: "文件相对路径不能为空",
        hint: "请指定有效的文件路径"
      };
    }

    const mode = SecuritySandbox.permissionMode;
    const workspace = SecuritySandbox.activeWorkspaceDir;

    // 1. 纯对话模式：强制拦截任何文件读取
    if (mode === "chat-only") {
      SecuritySandbox.logAudit("BLOCKED_READ_CHAT_ONLY", relativePath);
      return {
        ok: false,
        code: "CHAT_ONLY_BLOCKED",
        reason: "当前处于【纯对话咨询】模式，已强制阻断本地任何文件读取操作以保护隐私",
        hint: "如需分析项目代码，请在输入框左侧将权限模式切换为【工作区只读】或【工作区读写】"
      };
    }

    let candidatePath = "";

    // 2. 工作区沙箱模式 (工作区只读 / 工作区读写 均受严格边界限制)
    if (mode === "workspace-readonly" || mode === "workspace-readwrite") {
      if (!workspace) {
        return {
          ok: false,
          code: "NO_WORKSPACE",
          reason: "当前尚未选定工作区工程目录",
          hint: "请在左侧栏点击选择或切换工作区目录"
        };
      }

      // 防字面穿透与拼接解析
      candidatePath = path.resolve(workspace, relativePath);

      if (!fs.existsSync(candidatePath)) {
        return {
          ok: false,
          code: "NOT_FOUND",
          reason: `文件不存在: ${relativePath}`,
          hint: "请检查相对路径拼写是否正确"
        };
      }

      // 核心安全防线：realpath 物理路径 Containment 检验 (彻底阻断 Symlink / Junction 软链接逃逸)
      try {
        const realWorkspace = fs.realpathSync(workspace);
        const realTarget = fs.realpathSync(candidatePath);
        const rel = path.relative(realWorkspace, realTarget);
        const isContained = !rel.startsWith("..") && !path.isAbsolute(rel);

        if (!isContained) {
          SecuritySandbox.logAudit("BLOCKED_SYMLINK_OR_TRAVERSAL", candidatePath);
          return {
            ok: false,
            code: "PERMISSION_DENIED",
            reason: "目标文件指向工作区外部物理路径 (软链接逃逸或越权穿透已拦截)",
            hint: "当前为工作区只读模式，严禁访问工作区外部物理文件"
          };
        }
        candidatePath = realTarget;
      } catch (err) {
        return {
          ok: false,
          code: "REALPATH_ERROR",
          reason: `解析文件物理路径失败: ${err.message}`,
          hint: "文件可能为损坏的无效链接"
        };
      }
    } else {
      // 全局受信任模式 (full-access)
      candidatePath = workspace ? path.resolve(workspace, relativePath) : path.resolve(relativePath);
      if (!fs.existsSync(candidatePath)) {
        return {
          ok: false,
          code: "NOT_FOUND",
          reason: `文件不存在: ${relativePath}`,
          hint: "请检查路径拼写是否正确"
        };
      }
      try {
        candidatePath = fs.realpathSync(candidatePath);
      } catch (err) {
        // 保持原样
      }

      // 敏感路径审计留痕
      const lower = candidatePath.toLowerCase();
      if (lower.includes(".ssh") || lower.includes(".env") || lower.includes("id_rsa") || lower.includes("credentials")) {
        SecuritySandbox.logAudit("READ_SENSITIVE_FILE", candidatePath);
      }
    }

    try {
      const stat = fs.statSync(candidatePath);
      if (stat.isDirectory()) {
        return {
          ok: false,
          code: "IS_DIRECTORY",
          reason: `指定路径为目录而非可读文件: ${relativePath}`,
          hint: "请指定具体代码或文本文件路径"
        };
      }

      if (/\.docx$/i.test(candidatePath)) {
        if (stat.size > MAX_DOCX_SOURCE_BYTES) {
          return {
            ok: false,
            code: "FILE_TOO_LARGE",
            reason: "docx 超过 8MB，请先另存精简后再引用",
            hint: "仅抽取正文文本，不读取整包二进制"
          };
        }
        try {
          const extracted = loadDocxBuffer(fs.readFileSync(candidatePath));
          return {
            ok: true,
            relativePath,
            fullPath: candidatePath,
            content: extracted.text,
            isTruncated: extracted.truncated,
            totalBytes: stat.size,
            permissionMode: mode,
            extracted: "docx"
          };
        } catch (err) {
          return {
            ok: false,
            code: err.code || "DOCX_EXTRACT_FAILED",
            reason: err.message || "抽取 docx 正文失败",
            hint: "请确认文件是 Office Open XML（.docx），不是旧版 .doc"
          };
        }
      }

      if (/\.pdf$/i.test(candidatePath)) {
        if (stat.size > MAX_PDF_SOURCE_BYTES) {
          return {
            ok: false,
            code: "FILE_TOO_LARGE",
            reason: "PDF 超过 8MB，请先另存精简后再引用",
            hint: "仅抽取正文文本，不读取二进制"
          };
        }
        try {
          const extracted = await extractPdfPlainText(fs.readFileSync(candidatePath));
          return {
            ok: true,
            relativePath,
            fullPath: candidatePath,
            content: extracted.text,
            isTruncated: extracted.truncated,
            totalBytes: stat.size,
            permissionMode: mode,
            extracted: "pdf"
          };
        } catch (err) {
          return {
            ok: false,
            code: err.code || "PDF_EXTRACT_FAILED",
            reason: err.message || "抽取 PDF 正文失败",
            hint: "文字型 PDF 可抽取正文；扫描件/图片型 PDF 请先 OCR 为可检索文字版，或另存为 .txt/.md"
          };
        }
      }

      // 二进制文件嗅探 (读取前 512 字节探测 null byte)
      const sampleSize = Math.min(512, stat.size);
      if (sampleSize > 0) {
        const fd = fs.openSync(candidatePath, "r");
        const sampleBuf = Buffer.alloc(sampleSize);
        fs.readSync(fd, sampleBuf, 0, sampleSize, 0);
        fs.closeSync(fd);

        let hasNullByte = false;
        for (let i = 0; i < sampleSize; i++) {
          if (sampleBuf[i] === 0) {
            hasNullByte = true;
            break;
          }
        }
        if (hasNullByte) {
          return {
            ok: false,
            code: "BINARY_FILE_REJECTED",
            reason: `目标文件包含二进制空字节，已拒绝读取: ${relativePath}`,
            hint: "仅支持读取文本与代码文件，防止乱码污染模型上下文"
          };
        }
      }

      // 精确以 128KB 字节 (131072 字节) 为截断边界
      const MAX_BYTES = 128 * 1024;
      let isTruncated = false;
      let content = "";

      if (stat.size > MAX_BYTES) {
        isTruncated = true;
        const fd = fs.openSync(candidatePath, "r");
        const buf = Buffer.alloc(MAX_BYTES);
        fs.readSync(fd, buf, 0, MAX_BYTES, 0);
        fs.closeSync(fd);
        content = buf.toString("utf8") + `\n\n[⚠️ 系统提示: 文件总大小 (${Math.round(stat.size / 1024)}KB) 超出限制，当前仅截取前 128KB 字节内容，剩余部分已略去]`;
      } else {
        content = fs.readFileSync(candidatePath, "utf8");
      }

      return {
        ok: true,
        relativePath,
        fullPath: candidatePath,
        content,
        isTruncated,
        totalBytes: stat.size,
        permissionMode: mode
      };
    } catch (err) {
      return {
        ok: false,
        code: "READ_ERROR",
        reason: `读取文件失败: ${err.message}`,
        hint: "请确认文件未被其他系统进程独占"
      };
    }
  });

  // ---------------------------------------------------------------------------
  // 长文档分块索引：抽取正文 → 切片落盘 → 本轮只返回目录（避免整篇进 prompt）
  // ---------------------------------------------------------------------------
  ipcMain.handle("index-workspace-document", async (_event, payload = {}) => {
    const relativePath = typeof payload === "string" ? payload : payload?.relativePath;
    if (!relativePath || typeof relativePath !== "string") {
      return { ok: false, code: "INVALID_ARGUMENT", reason: "文件相对路径不能为空" };
    }

    const mode = SecuritySandbox.permissionMode;
    const workspace = SecuritySandbox.activeWorkspaceDir;
    if (mode === "chat-only") {
      SecuritySandbox.logAudit("BLOCKED_INDEX_CHAT_ONLY", relativePath);
      return {
        ok: false,
        code: "CHAT_ONLY_BLOCKED",
        reason: "纯对话模式禁止索引本地文档",
        hint: "请切换到工作区只读/读写后再引用论文"
      };
    }

    let candidatePath = "";
    if (mode === "workspace-readonly" || mode === "workspace-readwrite") {
      if (!workspace) {
        return { ok: false, code: "NO_WORKSPACE", reason: "当前尚未选定工作区工程目录" };
      }
      candidatePath = path.resolve(workspace, relativePath);
      if (!fs.existsSync(candidatePath)) {
        return { ok: false, code: "NOT_FOUND", reason: `文件不存在: ${relativePath}` };
      }
      try {
        const realWorkspace = fs.realpathSync(workspace);
        const realTarget = fs.realpathSync(candidatePath);
        const rel = path.relative(realWorkspace, realTarget);
        const isContained = !rel.startsWith("..") && !path.isAbsolute(rel);
        if (!isContained) {
          SecuritySandbox.logAudit("BLOCKED_SYMLINK_OR_TRAVERSAL", candidatePath);
          return { ok: false, code: "PERMISSION_DENIED", reason: "目标文件指向工作区外部物理路径" };
        }
        candidatePath = realTarget;
      } catch (err) {
        return { ok: false, code: "REALPATH_ERROR", reason: err.message };
      }
    } else {
      candidatePath = workspace ? path.resolve(workspace, relativePath) : path.resolve(relativePath);
      if (!fs.existsSync(candidatePath)) {
        return { ok: false, code: "NOT_FOUND", reason: `文件不存在: ${relativePath}` };
      }
      try {
        candidatePath = fs.realpathSync(candidatePath);
      } catch (e) {}
    }

    try {
      const stat = fs.statSync(candidatePath);
      if (stat.isDirectory()) {
        return { ok: false, code: "IS_DIRECTORY", reason: "不能索引目录" };
      }

      const docId = makeDocIndexId(candidatePath, stat.size, stat.mtimeMs);
      const indexDir = path.join(getDocIndexRoot(), docId);
      const manifestPath = path.join(indexDir, "manifest.json");

      if (fs.existsSync(manifestPath)) {
        try {
          const cached = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
          if (cached && cached.docId === docId && Array.isArray(cached.chunks) && cached.chunks.length > 0) {
            return { ok: true, cached: true, ...cached };
          }
        } catch (e) {}
      }

      let extractedText = "";
      let sourceTruncated = false;
      const lower = candidatePath.toLowerCase();
      if (lower.endsWith(".docx")) {
        if (stat.size > MAX_DOCX_SOURCE_BYTES) {
          return { ok: false, code: "FILE_TOO_LARGE", reason: "docx 超过 8MB" };
        }
        const extracted = loadDocxBuffer(fs.readFileSync(candidatePath), MAX_INDEX_EXTRACTED_TEXT_CHARS);
        extractedText = extracted.text;
        sourceTruncated = !!extracted.truncated;
      } else if (lower.endsWith(".pdf")) {
        if (stat.size > MAX_PDF_SOURCE_BYTES) {
          return { ok: false, code: "FILE_TOO_LARGE", reason: "PDF 超过 8MB" };
        }
        const extracted = await extractPdfPlainText(fs.readFileSync(candidatePath), MAX_INDEX_EXTRACTED_TEXT_CHARS);
        extractedText = extracted.text;
        sourceTruncated = !!extracted.truncated;
      } else {
        const MAX_BYTES = Math.min(stat.size, 2 * 1024 * 1024);
        const buf = Buffer.alloc(MAX_BYTES);
        const fd = fs.openSync(candidatePath, "r");
        fs.readSync(fd, buf, 0, MAX_BYTES, 0);
        fs.closeSync(fd);
        for (let i = 0; i < Math.min(512, buf.length); i++) {
          if (buf[i] === 0) {
            return { ok: false, code: "BINARY_FILE_REJECTED", reason: "二进制文件无法索引" };
          }
        }
        extractedText = buf.toString("utf8");
        sourceTruncated = stat.size > MAX_BYTES;
        if (extractedText.length > MAX_INDEX_EXTRACTED_TEXT_CHARS) {
          extractedText = extractedText.slice(0, MAX_INDEX_EXTRACTED_TEXT_CHARS);
          sourceTruncated = true;
        }
      }

      const rawChunks = chunkDocumentText(extractedText, DOC_CHUNK_TARGET_CHARS);
      if (!rawChunks.length) {
        return { ok: false, code: "EMPTY_DOCUMENT", reason: "未能从文档抽出可分块正文" };
      }

      fs.mkdirSync(indexDir, { recursive: true });
      const chunksMeta = [];
      for (const ch of rawChunks) {
        const chunkFile = path.join(indexDir, `${ch.id}.txt`);
        fs.writeFileSync(chunkFile, ch.content, "utf8");
        chunksMeta.push({
          id: ch.id,
          title: ch.title,
          summary: ch.summary,
          charCount: ch.charCount
        });
      }

      const baseName = path.basename(relativePath);
      const manifest = {
        docId,
        relativePath,
        title: baseName,
        chunkCount: chunksMeta.length,
        totalChars: extractedText.length,
        sourceTruncated,
        indexedAt: Date.now(),
        chunks: chunksMeta
      };
      fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), "utf8");
      SecuritySandbox.logAudit("DOC_INDEXED", `${relativePath} -> ${docId} (${chunksMeta.length} chunks)`);
      return { ok: true, cached: false, ...manifest };
    } catch (err) {
      return {
        ok: false,
        code: err.code || "INDEX_FAILED",
        reason: err.message || "文档索引失败",
        hint: "文字型 PDF/DOCX/Markdown 可索引；扫描件请先 OCR"
      };
    }
  });

  ipcMain.handle("read-document-chunk", async (_event, payload = {}) => {
    const docId = String(payload?.docId || "").trim();
    const chunkIdRaw = String(payload?.chunkId || payload?.id || "").trim();
    const chunkId = chunkIdRaw.replace(/\D/g, "").padStart(4, "0").slice(-4);
    if (!isSafeDocId(docId)) {
      return { ok: false, code: "INVALID_ARGUMENT", reason: "docId 非法" };
    }
    if (!chunkId || chunkId === "0000") {
      return { ok: false, code: "INVALID_ARGUMENT", reason: "chunkId 非法" };
    }

    const mode = SecuritySandbox.permissionMode;
    if (mode === "chat-only") {
      return { ok: false, code: "CHAT_ONLY_BLOCKED", reason: "纯对话模式禁止读取文档分块" };
    }

    const indexDir = path.join(getDocIndexRoot(), docId);
    const manifestPath = path.join(indexDir, "manifest.json");
    const chunkPath = path.join(indexDir, `${chunkId}.txt`);
    try {
      const realRoot = fs.realpathSync(getDocIndexRoot());
      const realChunk = fs.realpathSync(chunkPath);
      const rel = path.relative(realRoot, realChunk);
      if (rel.startsWith("..") || path.isAbsolute(rel)) {
        return { ok: false, code: "PERMISSION_DENIED", reason: "分块路径越权" };
      }
    } catch (err) {
      return { ok: false, code: "NOT_FOUND", reason: `分块不存在: ${docId}/${chunkId}` };
    }

    if (!fs.existsSync(chunkPath)) {
      return { ok: false, code: "NOT_FOUND", reason: `分块不存在: ${chunkId}` };
    }

    let title = chunkId;
    let relativePath = "";
    try {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
      relativePath = manifest.relativePath || "";
      const meta = (manifest.chunks || []).find((c) => c.id === chunkId);
      if (meta?.title) title = meta.title;
    } catch (e) {}

    let content = fs.readFileSync(chunkPath, "utf8");
    let isTruncated = false;
    if (content.length > DOC_CHUNK_MAX_RETURN_CHARS) {
      content = content.slice(0, DOC_CHUNK_MAX_RETURN_CHARS) + "\n\n[⚠️ 单块返回超限，已截取前部]";
      isTruncated = true;
    }
    return {
      ok: true,
      docId,
      chunkId,
      title,
      relativePath,
      content,
      isTruncated,
      charCount: content.length
    };
  });

  /** 在已索引文档分块中做关键词检索（零依赖，返回命中块摘要） */
  ipcMain.handle("search-document-chunks", async (_event, payload = {}) => {
    const docId = String(payload?.docId || "").trim();
    const query = String(payload?.query || "").trim();
    const limit = Math.min(20, Math.max(1, Number(payload?.limit) || 8));
    if (!isSafeDocId(docId)) {
      return { ok: false, code: "INVALID_ARGUMENT", reason: "docId 非法" };
    }
    if (!query || query.length < 1) {
      return { ok: false, code: "INVALID_ARGUMENT", reason: "query 不能为空" };
    }
    if (SecuritySandbox.permissionMode === "chat-only") {
      return { ok: false, code: "CHAT_ONLY_BLOCKED", reason: "纯对话模式禁止检索文档分块" };
    }

    const indexDir = path.join(getDocIndexRoot(), docId);
    const manifestPath = path.join(indexDir, "manifest.json");
    if (!fs.existsSync(manifestPath)) {
      return { ok: false, code: "NOT_FOUND", reason: "文档尚未索引或不存在" };
    }

    let manifest;
    try {
      manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    } catch (e) {
      return { ok: false, code: "MANIFEST_ERROR", reason: "索引清单损坏" };
    }

    const terms = query
      .toLowerCase()
      .split(/[\s,，;；|]+/)
      .map((t) => t.trim())
      .filter((t) => t.length >= 1)
      .slice(0, 8);
    if (!terms.length) {
      return { ok: false, code: "INVALID_ARGUMENT", reason: "无效检索词" };
    }

    const hits = [];
    for (const meta of manifest.chunks || []) {
      const cid = String(meta.id || "").padStart(4, "0").slice(-4);
      const chunkPath = path.join(indexDir, `${cid}.txt`);
      if (!fs.existsSync(chunkPath)) continue;
      let body = "";
      try {
        body = fs.readFileSync(chunkPath, "utf8");
      } catch (e) {
        continue;
      }
      const hay = `${meta.title || ""}\n${meta.summary || ""}\n${body}`.toLowerCase();
      let score = 0;
      const matched = [];
      for (const t of terms) {
        if (!hay.includes(t)) continue;
        matched.push(t);
        const re = new RegExp(t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
        const m = body.match(re);
        score += (m ? m.length : 1) * (meta.title && String(meta.title).toLowerCase().includes(t) ? 3 : 1);
      }
      if (!matched.length) continue;
      const firstTerm = matched[0];
      const idx = body.toLowerCase().indexOf(firstTerm);
      const start = Math.max(0, idx - 40);
      const snippet = body.slice(start, start + 160).replace(/\s+/g, " ").trim();
      hits.push({
        chunkId: cid,
        title: meta.title || cid,
        score,
        matchedTerms: matched,
        snippet: (start > 0 ? "…" : "") + snippet + (start + 160 < body.length ? "…" : ""),
        charCount: meta.charCount || body.length
      });
    }

    hits.sort((a, b) => b.score - a.score);
    return {
      ok: true,
      docId,
      query,
      relativePath: manifest.relativePath || "",
      hitCount: hits.length,
      hits: hits.slice(0, limit)
    };
  });

  // ---------------------------------------------------------------------------
  // 权威安全沙箱文件写入通道 (必须要求 workspace-readwrite 或 full-access)
  // ---------------------------------------------------------------------------
  ipcMain.handle("write-workspace-file", async (_event, payload) => {
    const relativePath = typeof payload === "string" ? payload : payload?.relativePath;
    const content = payload?.content ?? "";
    const createBackup = payload?.createBackup !== false;

    if (!relativePath || typeof relativePath !== "string") {
      return {
        ok: false,
        code: "INVALID_ARGUMENT",
        reason: "文件相对路径不能为空",
        hint: "请指定有效的文件相对路径"
      };
    }

    const mode = SecuritySandbox.permissionMode;
    const workspace = SecuritySandbox.activeWorkspaceDir;

    // 1. 权限拦截：必须为 workspace-readwrite 或 full-access 模式
    if (mode === "chat-only" || mode === "workspace-readonly") {
      SecuritySandbox.logAudit("BLOCKED_WRITE_READONLY", relativePath);
      return {
        ok: false,
        code: "PERMISSION_DENIED",
        reason: `当前运行权限为【${mode === 'chat-only' ? '纯对话模式' : '工作区只读模式'}】，严禁向本地文件写入任何修改`,
        hint: "请在输入框左侧将权限模式切换为【✍️ 工作区读写】或【🌐 全局受信任】后再执行写入"
      };
    }

    let candidatePath = "";

    // 2. 工作区读写模式：严格限制在 workspace 物理边界内部
    if (mode === "workspace-readwrite") {
      if (!workspace) {
        return {
          ok: false,
          code: "NO_WORKSPACE",
          reason: "当前会话尚未绑定工作区工程目录",
          hint: "请在左侧栏选择或打开工程工作区"
        };
      }

      candidatePath = path.resolve(workspace, relativePath);

      // 防 ../ 穿越：必须先做逻辑路径包含检查，再 mkdir（避免越权建目录副作用）
      try {
        if (!isPathLogicallyInside(workspace, candidatePath)) {
          SecuritySandbox.logAudit("BLOCKED_WRITE_TRAVERSAL", candidatePath);
          return {
            ok: false,
            code: "PERMISSION_DENIED",
            reason: "目标文件指向工作区外部物理路径 (越权写入或软链接逃逸已拦截)",
            hint: "工作区读写模式下，严禁向工作区外部写入文件"
          };
        }

        const realWorkspace = fs.realpathSync(workspace);
        const targetDir = path.dirname(candidatePath);
        if (!isPathLogicallyInside(realWorkspace, targetDir)) {
          SecuritySandbox.logAudit("BLOCKED_WRITE_TRAVERSAL", candidatePath);
          return {
            ok: false,
            code: "PERMISSION_DENIED",
            reason: "目标文件指向工作区外部物理路径 (越权写入或软链接逃逸已拦截)",
            hint: "工作区读写模式下，严禁向工作区外部写入文件"
          };
        }

        if (!fs.existsSync(targetDir)) {
          fs.mkdirSync(targetDir, { recursive: true });
        }
        const realParent = fs.realpathSync(targetDir);
        const rel = path.relative(realWorkspace, realParent);
        const isContained = !rel.startsWith("..") && !path.isAbsolute(rel);

        if (!isContained) {
          SecuritySandbox.logAudit("BLOCKED_WRITE_TRAVERSAL", candidatePath);
          return {
            ok: false,
            code: "PERMISSION_DENIED",
            reason: "目标文件指向工作区外部物理路径 (越权写入或软链接逃逸已拦截)",
            hint: "工作区读写模式下，严禁向工作区外部写入文件"
          };
        }
      } catch (err) {
        return {
          ok: false,
          code: "REALPATH_ERROR",
          reason: `解析工作区路径失败: ${err.message}`
        };
      }
    } else {
      // 3. 全局受信任模式 (full-access)
      candidatePath = workspace ? path.resolve(workspace, relativePath) : path.resolve(relativePath);
      const parentDir = path.dirname(candidatePath);
      if (!fs.existsSync(parentDir)) {
        fs.mkdirSync(parentDir, { recursive: true });
      }
    }

    try {
      // 防懒惰截断守卫：若原有文件存在，且拟写入代码包含未展开的占位符，严禁直接覆盖
      if (fs.existsSync(candidatePath) && !payload?.forceOverwrite) {
        const STUB_PATTERNS = [
          // 关键词拆开写入，避免护栏静态扫描误伤本守卫实现
          new RegExp(String.raw`\/\/\s*\.{3,}\s*(?:` + ["保"+"持不变","其"+"余不变","其"+"余代码","原"+"有代码","代"+"码不变","现"+"有代码","existing code","rest of code","unchanged","previous code"].join("|") + ")", "i"),
          new RegExp(String.raw`\/\*\s*\.{3,}\s*(?:` + ["保"+"持不变","其"+"余不变","其"+"余代码","原"+"有代码","代"+"码不变","现"+"有代码","existing code","rest of code","unchanged","previous code"].join("|") + String.raw`)\s*\*\/`, "i"),
          new RegExp(String.raw`#\s*\.{3,}\s*(?:` + ["保"+"持不变","其"+"余不变","其"+"余代码","原"+"有代码","代"+"码不变","现"+"有代码","existing code","rest of code","unchanged","previous code"].join("|") + ")", "i"),
          new RegExp(String.raw`\/\/\s*TODO:\s*(?:` + ["其"+"余保持不变","其"+"余代码不变","其"+"余不变"].join("|") + ")", "i")
        ];
        const matchedStub = STUB_PATTERNS.find(pat => pat.test(content));
        if (matchedStub) {
          SecuritySandbox.logAudit("BLOCKED_STUB_OVERWRITE", candidatePath);
          return {
            ok: false,
            code: "STUB_DETECTED",
            reason: "检测到代码中包含未展开的省略占位符，已安全阻断覆写以保护源文件不受损坏",
            hint: "请要求 AI 输出完整可直接运行的源码文件，或手动复制代码中的变动段落"
          };
        }
      }

      // 自动创建 .bak 历史安全备份
      let backupPath = null;
      if (createBackup && fs.existsSync(candidatePath)) {
        backupPath = `${candidatePath}.bak`;
        try {
          fs.copyFileSync(candidatePath, backupPath);
        } catch (e) {}
      }

      // 执行物理写盘
      fs.writeFileSync(candidatePath, content, "utf8");
      SecuritySandbox.logAudit("WRITE_FILE_SUCCESS", candidatePath);

      return {
        ok: true,
        relativePath,
        fullPath: candidatePath,
        bytesWritten: Buffer.byteLength(content, "utf8"),
        backupPath,
        permissionMode: mode
      };
    } catch (err) {
      SecuritySandbox.logAudit("WRITE_FILE_FAILED", candidatePath, err.message);
      return {
        ok: false,
        code: "WRITE_ERROR",
        reason: `写入文件失败: ${err.message}`,
        hint: "请检查该文件是否被其他编辑器或系统进程占用锁定"
      };
    }
  });

  // ---------------------------------------------------------------------------
  // 权威安全沙箱文件差异对比通道 (读取当前物理文件与 .bak 备份比对)
  // ---------------------------------------------------------------------------
  ipcMain.handle("read-workspace-file-diff", async (_event, payload) => {
    const relativePath = typeof payload === "string" ? payload : payload?.relativePath;
    if (!relativePath || typeof relativePath !== "string") {
      return { ok: false, code: "INVALID_ARGUMENT", reason: "文件相对路径不能为空" };
    }

    const mode = SecuritySandbox.permissionMode;
    const workspace = SecuritySandbox.activeWorkspaceDir;

    if (mode === "chat-only") {
      return { ok: false, code: "CHAT_ONLY_BLOCKED", reason: "纯对话模式下禁止读取工作区文件" };
    }

    let candidatePath = "";
    if (mode === "workspace-readonly" || mode === "workspace-readwrite") {
      if (!workspace) {
        return { ok: false, code: "NO_WORKSPACE", reason: "当前尚未选定工作区工程目录" };
      }
      candidatePath = path.resolve(workspace, relativePath);
      try {
        const realWorkspace = fs.realpathSync(workspace);
        const realTarget = fs.realpathSync(candidatePath);
        const rel = path.relative(realWorkspace, realTarget);
        if (rel.startsWith("..") || path.isAbsolute(rel)) {
          return { ok: false, code: "PERMISSION_DENIED", reason: "越权穿透已拦截" };
        }
      } catch (err) {
        // 文件若不存在
        return { ok: false, code: "NOT_FOUND", reason: `文件不存在: ${relativePath}` };
      }
    } else {
      candidatePath = workspace ? path.resolve(workspace, relativePath) : path.resolve(relativePath);
    }

    try {
      const previewKind = /\.docx$/i.test(candidatePath) ? "docx" : (/\.pdf$/i.test(candidatePath) ? "pdf" : "");
      const readPreviewText = async (filePath, kind) => {
        if (kind === "docx") return loadDocxBuffer(fs.readFileSync(filePath)).text;
        if (kind === "pdf") return (await extractPdfPlainText(fs.readFileSync(filePath))).text;
        return fs.readFileSync(filePath, "utf8");
      };
      const currentContent = await readPreviewText(candidatePath, previewKind);
      const backupPath = `${candidatePath}.bak`;
      let originalContent = null;
      let hasBackup = false;

      if (fs.existsSync(backupPath)) {
        originalContent = await readPreviewText(backupPath, previewKind);
        hasBackup = true;
      }

      return {
        ok: true,
        relativePath,
        hasBackup,
        originalContent,
        currentContent
      };
    } catch (err) {
      return { ok: false, code: "READ_DIFF_ERROR", reason: `读取差异失败: ${err.message}` };
    }
  });

  // ---------------------------------------------------------------------------
  // 权威安全沙箱一键还原通道 (将 .bak 备份原子覆盖回源文件并清理备份)
  // ---------------------------------------------------------------------------
  ipcMain.handle("revert-workspace-file", async (_event, payload) => {
    const relativePath = typeof payload === "string" ? payload : payload?.relativePath;
    if (!relativePath || typeof relativePath !== "string") {
      return { ok: false, code: "INVALID_ARGUMENT", reason: "文件相对路径不能为空" };
    }

    const mode = SecuritySandbox.permissionMode;
    const workspace = SecuritySandbox.activeWorkspaceDir;

    if (mode === "chat-only" || mode === "workspace-readonly") {
      return {
        ok: false,
        code: "PERMISSION_DENIED",
        reason: `当前运行权限为【${mode === 'chat-only' ? '纯对话模式' : '工作区只读模式'}】，严禁回滚或修改本地文件`,
        hint: "请在输入框左侧将权限模式切换为【✍️ 工作区读写】或【🌐 全局受信任】后再执行还原"
      };
    }

    let candidatePath = "";
    if (mode === "workspace-readwrite") {
      if (!workspace) {
        return { ok: false, code: "NO_WORKSPACE", reason: "当前尚未选定工作区工程目录" };
      }
      candidatePath = path.resolve(workspace, relativePath);
      try {
        const realWorkspace = fs.realpathSync(workspace);
        const targetDir = path.dirname(candidatePath);
        const realParent = fs.realpathSync(targetDir);
        const rel = path.relative(realWorkspace, realParent);
        if (rel.startsWith("..") || path.isAbsolute(rel)) {
          return { ok: false, code: "PERMISSION_DENIED", reason: "越权路径还原已拦截" };
        }
      } catch (err) {
        return { ok: false, code: "NOT_FOUND", reason: `无法定位目标文件: ${err.message}` };
      }
    } else {
      candidatePath = workspace ? path.resolve(workspace, relativePath) : path.resolve(relativePath);
    }

    const backupPath = `${candidatePath}.bak`;
    if (!fs.existsSync(backupPath)) {
      return {
        ok: false,
        code: "NO_BACKUP",
        reason: "未找到该文件的历史备份副本 (.bak)，无法执行原子还原"
      };
    }

    try {
      const restoredContent = fs.readFileSync(backupPath, "utf8");
      fs.writeFileSync(candidatePath, restoredContent, "utf8");
      fs.unlinkSync(backupPath); // 还原后清理临时备份
      SecuritySandbox.logAudit("REVERT_FILE_SUCCESS", candidatePath);

      return {
        ok: true,
        relativePath,
        content: restoredContent
      };
    } catch (err) {
      SecuritySandbox.logAudit("REVERT_FILE_FAILED", candidatePath, err.message);
      return {
        ok: false,
        code: "REVERT_ERROR",
        reason: `还原文件失败: ${err.message}`
      };
    }
  });

  // ---------------------------------------------------------------------------
  // ---------------------------------------------------------------------------
  // 工业级工作区工程文件树读取 (主流 IDE 对齐：按需懒加载 + 缓存排除 + 智能防饿死)
  // ---------------------------------------------------------------------------
  const WORKSPACE_IGNORED_DIRS = new Set([
    "node_modules", ".git", ".svn", ".hg", "dist", "build", ".cache",
    "release", "coverage", ".next", ".nuxt", ".vite", "out", "tmp", "temp",
    ".turbo", ".electron", "package-lock.json", "yarn.lock", "pnpm-lock.yaml",
    "npm-cache", ".npm", "m2-repo", ".m2", "jdk", "jre", "maven", "gradle", ".gradle",
    "target", "vendor", "bin", "obj", ".cargo", ".rustup"
  ]);

  const WORKSPACE_ALLOWED_DOT_NAMES = new Set([
    ".agents", ".github", ".vscode", ".env", ".gitignore", ".npmrc",
    ".editorconfig", ".prettierrc", ".eslintrc", ".commitlintrc", ".husky"
  ]);

  function isWorkspaceEntryValid(name, isFile = false) {
    if (name.startsWith(".")) {
      const isAllowed = WORKSPACE_ALLOWED_DOT_NAMES.has(name) ||
                        name.startsWith(".env.") ||
                        name.endsWith(".json") ||
                        name.endsWith(".js") ||
                        name.endsWith(".ts") ||
                        name.endsWith(".yml") ||
                        name.endsWith(".yaml");
      if (!isAllowed) return false;
    }
    if (WORKSPACE_IGNORED_DIRS.has(name)) return false;
    if (isFile && (name.endsWith(".bak") || name.endsWith(".tmp") || name.endsWith(".swp") || name.startsWith("~"))) {
      return false;
    }
    return true;
  }

  // 辅助函数：超时 Promise 封装 (杜绝主进程死锁与网络盘卡死)
  function withTimeout(promise, ms = 2500, fallbackVal = null) {
    let timer;
    const timeoutPromise = new Promise((resolve) => {
      timer = setTimeout(() => resolve(fallbackVal), ms);
    });
    return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timer));
  }

  /** 文件树路径沙箱：chat-only 阻断；非 full-access 必须落在 activeWorkspaceDir 内 */
  async function resolveTreePathOrDeny(folderPath) {
    const mode = SecuritySandbox.permissionMode;
    if (mode === "chat-only") {
      SecuritySandbox.logAudit("BLOCKED_TREE_CHAT_ONLY", folderPath || "");
      return { ok: false, code: "CHAT_ONLY_BLOCKED" };
    }
    if (!folderPath || typeof folderPath !== "string") {
      return { ok: false, code: "INVALID_ARGUMENT" };
    }

    const resolved = path.resolve(folderPath);
    if (mode === "full-access") {
      let realTarget = resolved;
      try {
        realTarget = await fs.promises.realpath(resolved);
      } catch (e) {
        // 目录尚不存在时保留 resolve 结果
      }
      return { ok: true, realTarget, rootDir: SecuritySandbox.activeWorkspaceDir || realTarget };
    }

    const workspace = SecuritySandbox.activeWorkspaceDir;
    if (!workspace) {
      SecuritySandbox.logAudit("BLOCKED_TREE_NO_WORKSPACE", folderPath);
      return { ok: false, code: "NO_WORKSPACE" };
    }

    let realWorkspace = workspace;
    try {
      realWorkspace = await fs.promises.realpath(workspace);
    } catch (e) {
      realWorkspace = path.resolve(workspace);
    }

    if (!isPathLogicallyInside(realWorkspace, resolved)) {
      SecuritySandbox.logAudit("BLOCKED_TREE_TRAVERSAL", folderPath);
      return { ok: false, code: "PERMISSION_DENIED" };
    }

    let realTarget = resolved;
    try {
      realTarget = await fs.promises.realpath(resolved);
    } catch (e) {
      realTarget = resolved;
    }

    if (!isPathLogicallyInside(realWorkspace, realTarget)) {
      SecuritySandbox.logAudit("BLOCKED_TREE_TRAVERSAL", folderPath);
      return { ok: false, code: "PERMISSION_DENIED" };
    }

    return { ok: true, realTarget, rootDir: realWorkspace };
  }

  // 1. 读取指定单个目录的直接子项 (纯异步非阻塞 + 2.5秒超时熔断)
  ipcMain.handle("read-directory-children", async (_event, folderPath) => {
    if (!folderPath || typeof folderPath !== "string") return [];
    return withTimeout(
      (async () => {
        try {
          const gate = await resolveTreePathOrDeny(folderPath);
          if (!gate.ok) return [];

          const rootDir = gate.rootDir;
          const entries = await fs.promises.readdir(gate.realTarget, { withFileTypes: true });
          const items = [];

          entries.sort((a, b) => {
            if (a.isDirectory() === b.isDirectory()) {
              return a.name.localeCompare(b.name);
            }
            return a.isDirectory() ? -1 : 1;
          });

          for (const entry of entries) {
            if (!isWorkspaceEntryValid(entry.name, entry.isFile())) continue;
            const fullPath = path.join(gate.realTarget, entry.name);
            const relativePath = path.relative(rootDir, fullPath).replace(/\\/g, "/");
            items.push({
              name: entry.name,
              path: relativePath,
              fullPath,
              isDirectory: entry.isDirectory(),
              children: entry.isDirectory() ? [] : undefined
            });
          }
          return items;
        } catch (err) {
          console.error("[main] read-directory-children 异常:", err.message);
          return [];
        }
      })(),
      2500,
      []
    );
  });

  // 2. 初始工作区文件树构建 (纯异步非阻塞 + 2.5秒强力超时熔断 + 仅读直接首层)
  ipcMain.handle("read-workspace-tree", async (_event, dirPath, options = {}) => {
    const targetDir = (typeof dirPath === "string" && dirPath) ? dirPath : SecuritySandbox.activeWorkspaceDir;
    if (!targetDir || typeof targetDir !== "string") return null;

    return withTimeout(
      (async () => {
        try {
          const gate = await resolveTreePathOrDeny(targetDir);
          if (!gate.ok) return null;

          const realTarget = gate.realTarget;

          let totalItemCount = 0;
          const MAX_TOTAL_ITEMS = 3000;
          const MAX_DEPTH = typeof options.maxDepth === "number" ? options.maxDepth : 1; // 默认首层秒开，深层按需动态展开
          const visitedRealPaths = new Set([realTarget]);

          async function buildTreeAsync(currentPath, depth = 0) {
            if (depth > MAX_DEPTH) return [];
            let rawEntries = [];
            try {
              rawEntries = await fs.promises.readdir(currentPath, { withFileTypes: true });
            } catch (e) {
              return [];
            }

            const validEntries = rawEntries.filter(entry => isWorkspaceEntryValid(entry.name, entry.isFile()));
            validEntries.sort((a, b) => {
              if (a.isDirectory() === b.isDirectory()) {
                return a.name.localeCompare(b.name);
              }
              return a.isDirectory() ? -1 : 1;
            });

            const currentLevelNodes = [];
            const dirNodesToRecurse = [];

            for (const entry of validEntries) {
              totalItemCount++;
              const fullPath = path.join(currentPath, entry.name);
              const relativePath = path.relative(realTarget, fullPath).replace(/\\/g, "/");

              if (entry.isDirectory()) {
                const node = {
                  name: entry.name,
                  path: relativePath,
                  fullPath,
                  isDirectory: true,
                  children: []
                };
                currentLevelNodes.push(node);
                dirNodesToRecurse.push({ node, fullPath });
              } else if (entry.isFile()) {
                currentLevelNodes.push({
                  name: entry.name,
                  path: relativePath,
                  fullPath,
                  isDirectory: false
                });
              }
            }

            for (const { node, fullPath } of dirNodesToRecurse) {
              if (depth + 1 <= MAX_DEPTH && totalItemCount < MAX_TOTAL_ITEMS) {
                try {
                  const realFolder = await fs.promises.realpath(fullPath);
                  if (!visitedRealPaths.has(realFolder)) {
                    visitedRealPaths.add(realFolder);
                    node.children = await buildTreeAsync(fullPath, depth + 1);
                  }
                } catch (e) {}
              }
            }

            return currentLevelNodes;
          }

          const tree = await buildTreeAsync(realTarget, 0);

          return {
            rootPath: realTarget,
            rootName: path.basename(realTarget),
            tree,
            totalCount: totalItemCount,
            isTruncated: totalItemCount >= MAX_TOTAL_ITEMS
          };
        } catch (err) {
          return { error: err.message };
        }
      })(),
      2500,
      {
        rootPath: targetDir,
        rootName: path.basename(targetDir),
        tree: [],
        totalCount: 0,
        isTimeout: true
      }
    );
  });

app.whenReady().then(() => {
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("before-quit", () => {
  if (pendingUpdateInstallerPath && fs.existsSync(pendingUpdateInstallerPath) && !isQuitting) {
    try {
      // /S 参数实现静默覆盖升级，重启应用后即为新版，完全免卸载
      spawn(pendingUpdateInstallerPath, ["/S", "--updated"], {
        detached: true,
        stdio: "ignore"
      }).unref();
    } catch (e) {
      console.error("[codex-desktop] 退出时执行覆写更新失败:", e);
    }
  }
  isQuitting = true;
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});