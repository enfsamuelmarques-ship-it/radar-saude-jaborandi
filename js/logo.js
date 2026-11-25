// Logo "Radar da Saúde": radar varrendo a região, cruz da saúde no centro e ponto de alerta.
// Desenhado num quadro de 68×68. O ponto de alerta muda de cor conforme o nível.
const LOGO_COR={fundo:"#06141a",anel:"#1c3b44",radar:"#33d1d6",cruz:"#e2f1f3",ponto:"#ff7a1a"};

function logoSVG(corPonto){
  const c=LOGO_COR;
  return `<svg viewBox="0 0 68 68" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Radar da Saúde">
<circle cx="34" cy="34" r="30" fill="none" stroke="${c.anel}" stroke-width="2.5"/>
<circle cx="34" cy="34" r="19" fill="none" stroke="${c.anel}" stroke-width="2.5"/>
<g class="varredura"><path d="M34 34 L34 4 A30 30 0 0 1 60 19 Z" fill="${c.radar}" fill-opacity=".35"/>
<line x1="34" y1="34" x2="60" y2="19" stroke="${c.radar}" stroke-width="2.5" stroke-linecap="round"/></g>
<circle class="ponto" cx="50" cy="16" r="4" fill="${corPonto||c.ponto}"/>
<rect x="29" y="22" width="10" height="24" rx="2" fill="${c.cruz}"/>
<rect x="22" y="29" width="24" height="10" rx="2" fill="${c.cruz}"/>
</svg>`;
}

// Desenha o logo num canvas, em (x,y) com lado "t". comFundo: disco escuro atrás.
function desenharLogo(ctx,x,y,t,comFundo,corPonto){
  const c=LOGO_COR, s=t/68;
  ctx.save();ctx.translate(x,y);ctx.scale(s,s);
  if(comFundo){ctx.beginPath();ctx.arc(34,34,34,0,Math.PI*2);ctx.fillStyle=c.fundo;ctx.fill()}
  ctx.lineWidth=2.5;ctx.strokeStyle=c.anel;
  [30,19].forEach(r=>{ctx.beginPath();ctx.arc(34,34,r,0,Math.PI*2);ctx.stroke()});
  const a0=-Math.PI/2, a1=Math.atan2(19-34,60-34);
  ctx.beginPath();ctx.moveTo(34,34);ctx.arc(34,34,30,a0,a1);ctx.closePath();
  ctx.globalAlpha=.35;ctx.fillStyle=c.radar;ctx.fill();ctx.globalAlpha=1;
  ctx.beginPath();ctx.moveTo(34,34);ctx.lineTo(60,19);ctx.strokeStyle=c.radar;ctx.lineCap="round";ctx.stroke();
  ctx.beginPath();ctx.arc(50,16,4,0,Math.PI*2);ctx.fillStyle=corPonto||c.ponto;ctx.fill();
  ctx.fillStyle=c.cruz;
  const ret=(a,b,w,h)=>{ctx.beginPath();ctx.roundRect?ctx.roundRect(a,b,w,h,2):ctx.rect(a,b,w,h);ctx.fill()};
  ret(29,22,10,24);ret(22,29,24,10);
  ctx.restore();
}

// Imagem quadrada para a foto do grupo do WhatsApp (o WhatsApp recorta em círculo)
function baixarLogoGrupo(){
  const t=640, cv=document.createElement("canvas");cv.width=cv.height=t;
  const ctx=cv.getContext("2d");
  ctx.fillStyle=LOGO_COR.fundo;ctx.fillRect(0,0,t,t);
  desenharLogo(ctx,t*0.14,t*0.14,t*0.72,false);
  const a=document.createElement("a");a.download="logo-radar-saude-jaborandi.png";a.href=cv.toDataURL("image/png");a.click();
}
