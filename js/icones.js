/* Ícones dos grupos vulneráveis: traço branco num círculo, todos no mesmo estilo.
 * Desenhados numa grade de 24 × 24 (formato de caminho SVG), usados no painel (SVG) e nos cards (canvas).
 * O texto do WhatsApp continua com os emojis, que é o que o WhatsApp mostra bem. */
"use strict";
const ICONES = {
  // coração com batimento: hipertensos e diabéticos
  hasdm: ["M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z",
          "M3.22 12H9.5l.5-1 2 4.5 2-7 1.5 3.5h5.27"],
  // infinito: autismo (TEA)
  tea:   ["M12 12c-2-2.67-4-4-6-4a4 4 0 1 0 0 8c2 0 4-1.33 6-4Zm0 0c2 2.67 4 4 6 4a4 4 0 0 0 0-8c-2 0-4 1.33-6 4Z"],
  // pessoa com bengala: idosos
  idoso: ["M11.5 4.5a2 2 0 1 1-4 0 2 2 0 0 1 4 0Z", "M9.5 8.5c-.8 1.8-.8 3.7 0 5.5l-2 7", "M9.5 14l2.5 7", "M9.5 10.5l5 2", "M16.5 12.5V21", "M16.5 12.5a1.6 1.6 0 0 0-3.2 0"],
  // carrinho de bebê: gestantes, bebês e crianças
  crianca: ["M12 4v7h7a7 7 0 0 0-7-7Z", "M4 11h16", "M5 11c0 3 2 5 5 5h4c3 0 5-2 5-5", "M4 11 2.5 7.5",
            "M10 19a1.6 1.6 0 1 1-3.2 0 1.6 1.6 0 0 1 3.2 0Z", "M17.2 19a1.6 1.6 0 1 1-3.2 0 1.6 1.6 0 0 1 3.2 0Z"],
  // pulmões: asma e DPOC
  resp:  ["M12 3v8", "M12 11l-2.5 2", "M12 11l2.5 2",
          "M9 7.5c-3 0-6 3.8-6 8.7C3 18.6 4.2 20 6 20s3-1.2 3-3V7.5Z", "M15 7.5c3 0 6 3.8 6 8.7 0 2.4-1.2 3.8-3 3.8s-3-1.2-3-3V7.5Z"],
  // tomada: acamados e uso de oxigênio (aparelhos ligados na energia)
  eletro: ["M12 22v-5", "M9 8V2", "M15 8V2", "M18 8v5a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V8Z"],
  // cadeira de rodas: pessoas com deficiência
  pcd:   ["M11.7 4a2 2 0 1 1-4 0 2 2 0 0 1 4 0Z", "M9.7 7.5V13h6l2.5 6", "M9.7 10h4.5", "M7.7 11a5.2 5.2 0 1 0 7.2 7.6"],
  // gota: doença renal ou cardíaca (controle de líquidos)
  renal: ["M12 2.8s6.2 6.6 6.2 11.2a6.2 6.2 0 0 1-12.4 0C5.8 9.4 12 2.8 12 2.8Z", "M9.2 14.5a2.8 2.8 0 0 0 2.8 2.8"],
};
const COR_ICONE = "#0b6e75";

// SVG para o painel
function iconeSVG(id, tam=36){
  const ds = ICONES[id] || [];
  return `<svg class="ico-g" width="${tam}" height="${tam}" viewBox="0 0 40 40" aria-hidden="true">
    <circle cx="20" cy="20" r="20" fill="${COR_ICONE}"/>
    <g transform="translate(8.5 8.5) scale(.96)" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ds.map(d=>`<path d="${d}"/>`).join("")}</g></svg>`;
}
// canvas para os cards: círculo de diâmetro "tam" com o canto superior esquerdo em (x, y)
function desenharIcone(ctx, id, x, y, tam){
  ctx.save();
  ctx.fillStyle = COR_ICONE; ctx.beginPath(); ctx.arc(x+tam/2, y+tam/2, tam/2, 0, Math.PI*2); ctx.fill();
  const k = tam/40;
  ctx.translate(x+8.5*k, y+8.5*k); ctx.scale(.96*k, .96*k);
  ctx.strokeStyle = "#fff"; ctx.lineWidth = 2; ctx.lineCap = "round"; ctx.lineJoin = "round";
  (ICONES[id] || []).forEach(d => ctx.stroke(new Path2D(d)));
  ctx.restore();
}
