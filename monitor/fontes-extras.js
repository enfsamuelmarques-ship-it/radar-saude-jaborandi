// Fontes que olham o que está acontecendo AGORA (os modelos de previsão não enxergam pancadas isoladas):
//  - Defesa Civil: alertas enviados à população (feed público IDAP, padrão CAP 1.2)
//  - Radar de chuva: mosaico de radares da RainViewer, atualizado a cada 10 minutos
"use strict";
const zlib = require("zlib");

const UA = { "User-Agent": "radar-saude-jaborandi/1.0" };

/* ---------------- Defesa Civil (IDAP) ---------------- */
const FEED_IDAP = "https://idapfile.mdr.gov.br/idap/api/rss/cap";
const SEVERIDADE = { Extreme: "Grande Perigo", Severe: "Perigo", Moderate: "Perigo Potencial", Minor: "Perigo Potencial", Unknown: "Perigo Potencial" };
const COR_SEV = { "Grande Perigo": "#c62828", "Perigo": "#ea6a12", "Perigo Potencial": "#e0b400" };

const tag = (xml, nome) => { const m = xml.match(new RegExp(`<${nome}>([\\s\\S]*?)</${nome}>`)); return m ? desescapar(m[1].trim()) : ""; };
const tags = (xml, nome) => [...xml.matchAll(new RegExp(`<${nome}>([\\s\\S]*?)</${nome}>`, "g"))].map(m => m[1].trim());
const desescapar = s => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");

// ponto dentro do polígono (pontos [lat, lon])
function dentro(lat, lon, pol) {
  let d = false;
  for (let i = 0, j = pol.length - 1; i < pol.length; j = i++) {
    const [ai, oi] = pol[i], [aj, oj] = pol[j];
    if ((ai > lat) !== (aj > lat) && lon < (oj - oi) * (lat - ai) / (aj - ai) + oi) d = !d;
  }
  return d;
}
// os segmentos p1-p2 e p3-p4 se cruzam?
function cruzam(p1, p2, p3, p4) {
  const o = (a, b, c) => Math.sign((b[1] - a[1]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[1] - a[1]));
  return o(p1, p2, p3) !== o(p1, p2, p4) && o(p3, p4, p1) !== o(p3, p4, p2);
}
// o polígono do alerta encosta no território do município? (a Defesa Civil avisa quem está no município todo, não só no centro)
function encosta(pol, contorno) {
  if (contorno.some(([a, o]) => dentro(a, o, pol))) return true;
  if (pol.some(([a, o]) => dentro(a, o, contorno))) return true;
  for (let i = 0; i < pol.length; i++) {
    const a1 = pol[i], a2 = pol[(i + 1) % pol.length];
    for (let j = 0; j < contorno.length; j++) if (cruzam(a1, a2, contorno[j], contorno[(j + 1) % contorno.length])) return true;
  }
  return false;
}
// contorno do município (IBGE) a partir do arquivo do painel, em [lat, lon]
function contornoMunicipio(ibge) {
  try {
    const txt = require("fs").readFileSync(require("path").join(__dirname, "..", "js", "malha.js"), "utf8");
    const malha = JSON.parse(txt.slice(txt.indexOf("["), txt.lastIndexOf("]") + 1));
    const mu = malha.find(m => String(m.id) === String(ibge));
    return mu ? mu.p.map(anel => anel.map(([lo, la]) => [la, lo])) : [];
  } catch { return []; }
}

// data CAP (2026-11-25T19:18:14-03:00) -> "2026-11-25 19:18" no horário de Brasília
function dataLocal(iso) {
  const t = new Date(iso);
  if (isNaN(t)) return "";
  return t.toLocaleString("sv-SE", { timeZone: "America/Sao_Paulo" }).slice(0, 16);
}

async function alertasDefesaCivil({ latitude, longitude, ibge }) {
  const r = await fetch(FEED_IDAP, { headers: UA, signal: AbortSignal.timeout(90000) });
  if (!r.ok) throw new Error("Defesa Civil HTTP " + r.status);
  const xml = await r.text();
  if (!xml.includes("<entry>")) throw new Error("Defesa Civil: resposta sem alertas (formato mudou?)");
  const agora = Date.now(), lista = [], chaves = new Set(), contornos = contornoMunicipio(ibge);
  for (const bloco of xml.split("<entry>").slice(1)) {
    if (tag(bloco, "status") !== "Actual" || tag(bloco, "msgType") === "Cancel") continue;
    const expira = Date.parse(tag(bloco, "expires"));
    if (!isNaN(expira) && expira < agora) continue;
    const poligonos = tags(bloco, "polygon").map(p => p.split(/\s+/).map(par => par.split(",").map(Number)).filter(([a, o]) => !isNaN(a) && !isNaN(o)));
    const geocodes = tags(bloco, "value");
    const atinge = poligonos.some(p => p.length > 2 && (dentro(latitude, longitude, p) || contornos.some(c => encosta(p, c))))
      || geocodes.some(v => v === ibge || v === ibge.slice(0, 6));
    if (!atinge) continue;
    const a = {
      codigo: "dc:" + tag(bloco, "identifier"),
      fonte: "Defesa Civil",
      evento: tag(bloco, "event"),
      severidade: SEVERIDADE[tag(bloco, "severity")] || "Perigo Potencial",
      certeza: tag(bloco, "certainty"),
      urgencia: tag(bloco, "urgency"),
      remetente: tag(bloco, "senderName"),
      texto: tag(bloco, "description") || tag(bloco, "headline").replace(/^Defesa Civil:\s*/i, ""),
      instrucoes: tag(bloco, "instruction"),
      inicio: dataLocal(tag(bloco, "onset") || tag(bloco, "sent")),
      fim: dataLocal(tag(bloco, "expires")),
      enviado: tag(bloco, "sent"),
      // GeoJSON (lon, lat), igual aos avisos do INMET, para desenhar no mapa do painel
      poligono: JSON.stringify({ type: "MultiPolygon", coordinates: poligonos.filter(p => p.length > 2).map(p => [p.map(([la, lo]) => [lo, la])]) }),
    };
    a.aviso_cor = COR_SEV[a.severidade];
    // o mesmo alerta vem repetido, um por canal (SMS, WhatsApp, Google...)
    const chave = [a.evento, a.texto, a.fim].join("|");
    if (chaves.has(chave)) continue;
    chaves.add(chave);
    lista.push(a);
  }
  return lista.sort((x, y) => (y.enviado || "").localeCompare(x.enviado || ""));
}

/* ---------------- Radar de chuva (RainViewer) ---------------- */
// Lê PNG RGBA/RGB/paleta de 8 bits, sem entrelaçamento (formato dos quadros do radar)
function lerPNG(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error("não é PNG");
  let p = 8, w, h, tipo, prof, paleta, trns, idat = [];
  while (p < buf.length) {
    const n = buf.readUInt32BE(p), t = buf.toString("ascii", p + 4, p + 8), d = buf.subarray(p + 8, p + 8 + n);
    if (t === "IHDR") { w = d.readUInt32BE(0); h = d.readUInt32BE(4); prof = d[8]; tipo = d[9]; if (d[12]) throw new Error("PNG entrelaçado"); }
    else if (t === "PLTE") paleta = d;
    else if (t === "tRNS") trns = d;
    else if (t === "IDAT") idat.push(d);
    else if (t === "IEND") break;
    p += 12 + n;
  }
  if (prof !== 8) throw new Error("PNG com profundidade " + prof);
  const canais = { 6: 4, 2: 3, 3: 1, 0: 1, 4: 2 }[tipo];
  const cru = zlib.inflateSync(Buffer.concat(idat)), linha = w * canais, px = Buffer.alloc(w * h * canais);
  for (let y = 0; y < h; y++) {
    const f = cru[y * (linha + 1)], src = y * (linha + 1) + 1, dst = y * linha;
    for (let x = 0; x < linha; x++) {
      const a = x >= canais ? px[dst + x - canais] : 0, b = y ? px[dst - linha + x] : 0, c = (x >= canais && y) ? px[dst - linha + x - canais] : 0;
      let v = cru[src + x];
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) { const pp = a + b - c, pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c); v += (pa <= pb && pa <= pc) ? a : pb <= pc ? b : c; }
      px[dst + x] = v & 255;
    }
  }
  // devolve RGBA
  const rgba = Buffer.alloc(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    if (tipo === 6) px.copy(rgba, i * 4, i * 4, i * 4 + 4);
    else if (tipo === 2) { px.copy(rgba, i * 4, i * 3, i * 3 + 3); rgba[i * 4 + 3] = 255; }
    else if (tipo === 3) { const k = px[i]; rgba[i * 4] = paleta[k * 3]; rgba[i * 4 + 1] = paleta[k * 3 + 1]; rgba[i * 4 + 2] = paleta[k * 3 + 2]; rgba[i * 4 + 3] = trns && k < trns.length ? trns[k] : 255; }
    else { const g = px[i * canais]; rgba[i * 4] = rgba[i * 4 + 1] = rgba[i * 4 + 2] = g; rgba[i * 4 + 3] = tipo === 4 ? px[i * 2 + 1] : 255; }
  }
  return { w, h, rgba };
}

// Esquema de cores 2 da RainViewer: azul claro/azul = fraca, amarelo = moderada/forte, laranja/vermelho = muito forte
function intensidade(r, g, b) {
  if (r > 200 && g < 120) return 3;         // vermelho, magenta
  if (r > 200 && g >= 120) return 2;        // amarelo, laranja
  if (b > 120 || g > 120) return 1;         // azuis e cinza (garoa)
  return 1;
}
const NOME_INT = ["", "fraca", "moderada a forte", "muito forte"];
const RAIO_TERRA = 6371;
function distKm(la1, lo1, la2, lo2) {
  const r = Math.PI / 180, dl = (la2 - la1) * r, dn = (lo2 - lo1) * r;
  const h = Math.sin(dl / 2) ** 2 + Math.cos(la1 * r) * Math.cos(la2 * r) * Math.sin(dn / 2) ** 2;
  return 2 * RAIO_TERRA * Math.asin(Math.sqrt(h));
}
function rumo(la1, lo1, la2, lo2) {
  const r = Math.PI / 180, y = Math.sin((lo2 - lo1) * r) * Math.cos(la2 * r);
  const x = Math.cos(la1 * r) * Math.sin(la2 * r) - Math.sin(la1 * r) * Math.cos(la2 * r) * Math.cos((lo2 - lo1) * r);
  const g = (Math.atan2(y, x) / r + 360) % 360;
  return ["norte", "nordeste", "leste", "sudeste", "sul", "sudoeste", "oeste", "noroeste"][Math.round(g / 45) % 8];
}

const Z = 7; // ~1,1 km por pixel; é o maior zoom liberado no plano gratuito
async function analisarQuadro(host, caminho, lat, lon, raioKm) {
  const n = 2 ** Z, toPx = (la, lo) => {
    const s = Math.sin(la * Math.PI / 180);
    return [(lo + 180) / 360 * n * 256, (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * n * 256];
  };
  const [cx, cy] = toPx(lat, lon), kmPorPx = 40075 * Math.cos(lat * Math.PI / 180) / (n * 256), rPx = Math.ceil(raioKm / kmPorPx);
  const tiles = new Map();
  for (let tx = Math.floor((cx - rPx) / 256); tx <= Math.floor((cx + rPx) / 256); tx++)
    for (let ty = Math.floor((cy - rPx) / 256); ty <= Math.floor((cy + rPx) / 256); ty++) {
      const r = await fetch(`${host}${caminho}/256/${Z}/${tx}/${ty}/2/1_1.png`, { headers: UA, signal: AbortSignal.timeout(30000) });
      if (!r.ok) throw new Error("radar HTTP " + r.status);
      tiles.set(tx + "/" + ty, lerPNG(Buffer.from(await r.arrayBuffer())));
    }
  let perto = null, maxInt = 0, pixelsChuva = 0, sobreJab = 0;
  for (let py = Math.floor(cy - rPx); py <= cy + rPx; py++) for (let px = Math.floor(cx - rPx); px <= cx + rPx; px++) {
    const t = tiles.get(Math.floor(px / 256) + "/" + Math.floor(py / 256)); if (!t) continue;
    const i = ((py % 256) * 256 + (px % 256)) * 4, al = t.rgba[i + 3];
    if (al < 40) continue;
    // pixel -> lat/lon
    const plon = (px + .5) / (n * 256) * 360 - 180, my = Math.PI * (1 - 2 * (py + .5) / (n * 256)), plat = Math.atan(Math.sinh(my)) * 180 / Math.PI;
    const d = distKm(lat, lon, plat, plon);
    if (d > raioKm) continue;
    const it = intensidade(t.rgba[i], t.rgba[i + 1], t.rgba[i + 2]);
    pixelsChuva++; if (d <= 8) sobreJab = Math.max(sobreJab, it);
    if (!perto || d < perto.km) perto = { km: d, lat: plat, lon: plon, intensidade: it };
    maxInt = Math.max(maxInt, it);
  }
  return { perto, maxInt, pixelsChuva, sobreJab };
}

async function radarDeChuva({ latitude, longitude }, raioKm = 60) {
  const r = await fetch("https://api.rainviewer.com/public/weather-maps.json", { headers: UA, signal: AbortSignal.timeout(30000) });
  if (!r.ok) throw new Error("radar HTTP " + r.status);
  const j = await r.json(), passado = j.radar?.past || [];
  if (!passado.length) throw new Error("radar sem quadros");
  const ult = passado[passado.length - 1], ant = passado[Math.max(0, passado.length - 4)]; // ~30 min antes
  const agora = await analisarQuadro(j.host, ult.path, latitude, longitude, raioKm);
  let antes = null;
  try { if (ant !== ult) antes = await analisarQuadro(j.host, ant.path, latitude, longitude, raioKm); } catch {}
  const res = {
    hora: new Date(ult.time * 1000).toISOString(),
    raioKm,
    chovendoEmJaborandi: agora.sobreJab > 0,
    intensidadeEmJaborandi: NOME_INT[agora.sobreJab] || "",
    maisProxima: agora.perto ? { km: Math.round(agora.perto.km), direcao: rumo(latitude, longitude, agora.perto.lat, agora.perto.lon), intensidade: NOME_INT[agora.perto.intensidade] } : null,
    maisForte: NOME_INT[agora.maxInt] || "",
    area: agora.pixelsChuva,
  };
  if (agora.perto && antes?.perto) {
    const dif = antes.perto.km - agora.perto.km; // km que chegou mais perto em ~30 min
    res.tendencia = dif > 4 ? "se aproximando" : dif < -4 ? "se afastando" : "parada";
    res.kmEm30min = Math.round(dif);
  } else if (agora.perto && antes && !antes.perto) res.tendencia = "se formando";
  return res;
}

module.exports = { alertasDefesaCivil, radarDeChuva, lerPNG, dentro };
