// Planilha XLSX sem dependências. Mesma técnica do app (src/core.js: crc32, zipStore, celulaXlsx):
// ZIP sem compressão com o mínimo de partes do formato. Aqui genérico por colunas.
//
// gerarXlsx({ aba, colunas: [{ titulo, largura, tipo }], linhas: any[][] }) -> Uint8Array
// tipo: "texto" (padrão) | "numero" (sem formato) | "moeda" (R$ 0,00) | "decimal" (0,00) | "inteiro"

const ESTILO = { cabecalho: 1, moeda: 2, decimal: 3, inteiro: 4, numero: 0, texto: 0 };

function xmlEsc(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");
}

export function letraColuna(i) {
  let s = "";
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

function celula(ref, valor, tipo) {
  if (valor == null || valor === "") return "";
  if (tipo !== "texto" && typeof valor === "number" && isFinite(valor)) {
    return '<c r="' + ref + '" s="' + ESTILO[tipo] + '"><v>' + String(valor) + "</v></c>";
  }
  return '<c r="' + ref + '" t="inlineStr" s="0"><is><t xml:space="preserve">' + xmlEsc(valor) + "</t></is></c>";
}

export function crc32(u8) {
  let table = crc32.table;
  if (!table) {
    table = crc32.table = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c;
    }
  }
  let crc = -1;
  for (let i = 0; i < u8.length; i++) crc = (crc >>> 8) ^ table[(crc ^ u8[i]) & 0xff];
  return (crc ^ -1) >>> 0;
}

export function zipStore(entries) {
  const enc = new TextEncoder();
  const chunks = [];
  const central = [];
  let offset = 0;
  let centralSize = 0;
  for (const e of entries) {
    const name = enc.encode(e.name);
    const data = e.data;
    const crc = crc32(data);
    const n = name.length;

    const local = new Uint8Array(30 + n);
    const dv = new DataView(local.buffer);
    dv.setUint32(0, 0x04034b50, true);
    dv.setUint16(4, 20, true);
    dv.setUint16(6, 0x0800, true); // nomes em UTF-8
    dv.setUint32(14, crc, true);
    dv.setUint32(18, data.length, true);
    dv.setUint32(22, data.length, true);
    dv.setUint16(26, n, true);
    local.set(name, 30);

    const cen = new Uint8Array(46 + n);
    const cdv = new DataView(cen.buffer);
    cdv.setUint32(0, 0x02014b50, true);
    cdv.setUint16(4, 20, true);
    cdv.setUint16(6, 20, true);
    cdv.setUint16(8, 0x0800, true);
    cdv.setUint32(16, crc, true);
    cdv.setUint32(20, data.length, true);
    cdv.setUint32(24, data.length, true);
    cdv.setUint16(28, n, true);
    cdv.setUint32(42, offset, true);
    cen.set(name, 46);

    chunks.push(local, data);
    central.push(cen);
    offset += local.length + data.length;
    centralSize += cen.length;
  }
  const out = new Uint8Array(offset + centralSize + 22);
  let pos = 0;
  for (const c of [...chunks, ...central]) {
    out.set(c, pos);
    pos += c.length;
  }
  const eocd = new DataView(out.buffer, pos, 22);
  eocd.setUint32(0, 0x06054b50, true);
  eocd.setUint16(8, entries.length, true);
  eocd.setUint16(10, entries.length, true);
  eocd.setUint32(12, centralSize, true);
  eocd.setUint32(16, offset, true);
  return out;
}

const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';

export function gerarXlsx({ aba, colunas, linhas }) {
  const tipos = colunas.map((c) => c.tipo || "texto");
  let dados = '<row r="1">';
  colunas.forEach((c, i) => {
    dados +=
      '<c r="' +
      letraColuna(i) +
      '1" t="inlineStr" s="' +
      ESTILO.cabecalho +
      '"><is><t>' +
      xmlEsc(c.titulo) +
      "</t></is></c>";
  });
  dados += "</row>";
  linhas.forEach((linha, l) => {
    const r = l + 2;
    dados += '<row r="' + r + '">' + linha.map((v, i) => celula(letraColuna(i) + r, v, tipos[i])).join("") + "</row>";
  });
  const larguras = colunas
    .map((c, i) => '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + (c.largura || 14) + '"/>')
    .join("");
  const ultima = letraColuna(colunas.length - 1) + (linhas.length + 1);

  const planilha =
    XML +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>' +
    "<cols>" +
    larguras +
    "</cols>" +
    "<sheetData>" +
    dados +
    "</sheetData>" +
    '<autoFilter ref="A1:' +
    ultima +
    '"/>' +
    "</worksheet>";

  const nomeAba = xmlEsc(
    String(aba || "Planilha")
      .replace(/[\\/?*[\]:]/g, " ")
      .slice(0, 31)
  );
  const partes = {
    "[Content_Types].xml":
      XML +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
      '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
      '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
      "</Types>",
    "_rels/.rels":
      XML +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
      "</Relationships>",
    "xl/workbook.xml":
      XML +
      '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
      '<sheets><sheet name="' +
      nomeAba +
      '" sheetId="1" r:id="rId1"/></sheets>' +
      '<definedNames><definedName name="_xlnm._FilterDatabase" localSheetId="0" hidden="1">\'' +
      nomeAba.replace(/'/g, "''") +
      "'!$A$1:$" +
      letraColuna(colunas.length - 1) +
      "$" +
      (linhas.length + 1) +
      "</definedName></definedNames>" +
      "</workbook>",
    "xl/_rels/workbook.xml.rels":
      XML +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
      '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
      "</Relationships>",
    "xl/styles.xml":
      XML +
      '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      '<numFmts count="1"><numFmt numFmtId="164" formatCode="&quot;R$&quot; #,##0.00"/></numFmts>' +
      '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>' +
      '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>' +
      '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
      '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
      '<cellXfs count="5">' +
      '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
      '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
      '<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
      '<xf numFmtId="2" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
      '<xf numFmtId="1" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
      "</cellXfs>" +
      '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
      "</styleSheet>",
    "xl/worksheets/sheet1.xml": planilha
  };
  const enc = new TextEncoder();
  return zipStore(Object.entries(partes).map(([name, xml]) => ({ name, data: enc.encode(xml) })));
}
