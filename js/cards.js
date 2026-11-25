/* Cards em imagem para o WhatsApp */
"use strict";
const NIVEL_ORD={verde:0,amarelo:1,laranja:2,vermelho:3};
const NIVEL_TXT={verde:"Sem aviso",amarelo:"Perigo Potencial",laranja:"Perigo",vermelho:"Grande Perigo"};
const F='"Archivo","Segoe UI",sans-serif', B='"Public Sans","Segoe UI",sans-serif', E='"Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif';
const W=1080, M=56;

function rr(ctx,x,y,w,h,r){ctx.beginPath();ctx.moveTo(x+r,y);ctx.arcTo(x+w,y,x+w,y+h,r);ctx.arcTo(x+w,y+h,x,y+h,r);ctx.arcTo(x,y+h,x,y,r);ctx.arcTo(x,y,x+w,y,r);ctx.closePath()}
function quebrar(ctx,txt,larg){const pal=String(txt).split(" "),lin=[];let l="";
  for(const w of pal){const t=l?l+" "+w:w;if(ctx.measureText(t).width>larg&&l){lin.push(l);l=w}else l=t}
  if(l)lin.push(l);return lin}
function texto(ctx,txt,x,y,larg,alt){const ls=quebrar(ctx,txt,larg);ls.forEach((t,i)=>ctx.fillText(t,x,y+i*alt));return ls.length*alt}
function avisosDoDia(avisos,dia){return avisos.filter(a=>a.inicio.slice(0,10)<=dia&&a.fim.slice(0,10)>=dia)}
function nivelDoDia(lista){return lista.reduce((n,a)=>NIVEL_ORD[corAviso(a)]>NIVEL_ORD[n]?corAviso(a):n,"verde")}
function corTxt(n){return n==="amarelo"?"#1b1b1b":"#fff"}
function prepararCanvas(id){const cv=$(id),ctx=cv.getContext("2d");cv.width=W;cv.height=4200;ctx.fillStyle="#f4f8f9";ctx.fillRect(0,0,W,4200);return [cv,ctx]}
function finalizarCanvas(cv,ctx,y,nomeArq,link){const img=ctx.getImageData(0,0,W,y);cv.height=y;ctx.putImageData(img,0,0);
  try{$(link).href=cv.toDataURL("image/png");$(link).download=nomeArq}catch{}}
function cabecalho(ctx,cor1,cor2,linha1,titulo,linha3,emoji){
  const g=ctx.createLinearGradient(0,0,W,260);g.addColorStop(0,cor1);g.addColorStop(1,cor2);ctx.fillStyle=g;ctx.fillRect(0,0,W,260);
  desenharLogo(ctx,M,22,60,true);ctx.fillStyle="#fff";ctx.font=`700 28px ${B}`;ctx.fillText(linha1,M+76,62);
  let fs=70;do{ctx.font=`800 ${fs}px ${F}`;fs-=2}while(ctx.measureText(titulo).width>W-2*M-(emoji?140:0)&&fs>36);ctx.fillText(titulo,M,146);
  ctx.font=`600 30px ${B}`;ctx.fillText(linha3,M,200);
  if(emoji){ctx.font=`100px ${E}`;ctx.textAlign="right";ctx.fillText(emoji,W-M,170);ctx.textAlign="left"}
  return 260;
}
function rodape(ctx,y,txtTopo){
  ctx.fillStyle="#13262b";rr(ctx,M,y,W-2*M,txtTopo?190:150,20);ctx.fill();let yy=y;
  if(txtTopo){ctx.fillStyle="#9fe3e4";ctx.font=`700 24px ${B}`;ctx.fillText(txtTopo,M+28,yy+44);yy+=40}
  ctx.fillStyle="#fff";ctx.font=`800 34px ${B}`;ctx.fillText("☎️ 199 Defesa Civil · 193 Bombeiros · 192 SAMU",M+28,yy+56);
  ctx.font=`500 21px ${B}`;ctx.fillStyle="#cfe3e5";ctx.fillText("Fontes: INMET e Defesa Civil (avisos) · radar e Open-Meteo (previsão)",M+28,yy+94);
  ctx.font=`700 21px ${B}`;ctx.fillStyle="#fff";ctx.fillText(ASSINATURA,M+28,yy+126);
  return (txtTopo?190:150)+30;
}
function desenharMapa(ctx,x,y,w,h,nivel){
  const pts=MALHA.find(m=>m.n==="Jaborandi").p.flat();
  const minX=Math.min(...pts.map(p=>p[0])),maxX=Math.max(...pts.map(p=>p[0])),minY=Math.min(...pts.map(p=>p[1])),maxY=Math.max(...pts.map(p=>p[1]));
  const k=Math.cos(-20.7*Math.PI/180), pad=Math.min(w,h)*0.2;
  const s=Math.min((w-2*pad)/((maxX-minX)*k),(h-2*pad)/(maxY-minY));
  const ox=x+(w-(maxX-minX)*k*s)/2, oy=y+(h-(maxY-minY)*s)/2;
  const P=([lx,ly])=>[ox+(lx-minX)*k*s, oy+(maxY-ly)*s];
  ctx.save();rr(ctx,x,y,w,h,18);ctx.clip();ctx.fillStyle="#e9f1f3";ctx.fillRect(x,y,w,h);
  const caminho=m=>{ctx.beginPath();m.p.forEach(pl=>{pl.forEach((pt,i)=>{const [a,b]=P(pt);i?ctx.lineTo(a,b):ctx.moveTo(a,b)});ctx.closePath()})};
  MALHA.forEach(m=>{if(m.n==="Jaborandi")return;caminho(m);ctx.fillStyle="#ffffff";ctx.fill();ctx.strokeStyle="#b9c8cc";ctx.lineWidth=1.5;ctx.stroke()});
  const jab=MALHA.find(m=>m.n==="Jaborandi");caminho(jab);ctx.fillStyle=HEX[nivel];ctx.fill();ctx.strokeStyle="#13262b";ctx.lineWidth=3;ctx.stroke();
  const centro=m=>{const q=m.p[0];return P([q.reduce((s,v)=>s+v[0],0)/q.length,q.reduce((s,v)=>s+v[1],0)/q.length])};
  const jp=new Path2D();jab.p.forEach(pl=>{pl.forEach((pt,i)=>{const [u,v]=P(pt);i?jp.lineTo(u,v):jp.moveTo(u,v)});jp.closePath()});const dentro=(u,v)=>[[0,0],[-50,0],[50,0],[0,-14],[0,8]].some(([du,dv])=>ctx.isPointInPath(jp,u+du,v+dv));ctx.font=`600 17px ${B}`;ctx.fillStyle="#6b7f84";ctx.textAlign="center";
  MALHA.forEach(m=>{if(m.n==="Jaborandi")return;const [a,b]=centro(m);{const vis=m.p[0].map(P).filter(([u,v])=>u>x+50&&u<x+w-50&&v>y+24&&v<y+h-14);if(vis.length>2){const u=vis.reduce((s,v)=>s+v[0],0)/vis.length,v=vis.reduce((s,q)=>s+q[1],0)/vis.length;if(!dentro(u,v))ctx.fillText(m.n,u,v)}}});
  const [jx,jy]=centro(jab);ctx.font=`800 22px ${B}`;ctx.lineWidth=5;ctx.strokeStyle="rgba(255,255,255,.9)";ctx.strokeText("JABORANDI",jx,jy+8);ctx.fillStyle="#13262b";ctx.fillText("JABORANDI",jx,jy+8);
  ctx.textAlign="left";ctx.restore();
}

function desenharCard1(p,avisos,R,info){
  const [cv,ctx]=prepararCanvas("card1"), d=p.daily, c=p.current, agora=new Date();
  const cor=HEX[info.nivelGeral];
  let y=cabecalho(ctx,cor,"#0b6e75","VIGILÂNCIA EM SAÚDE · JABORANDI/SP",info.chamada,
    agora.toLocaleDateString("pt-BR",{weekday:"long",day:"2-digit",month:"long"})+" · atualizado às "+agora.toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"}),emojiTempo(c.weather_code));
  y+=36;
  // mapas hoje / amanhã
  ctx.fillStyle="#13262b";ctx.font=`800 32px ${F}`;ctx.fillText("🗺️ NÍVEL DE AVISO OFICIAL EM JABORANDI",M,y+8);y+=30;
  const mw=(W-2*M-24)/2, mh=360;
  let alturaInfo=0;
  [0,1].forEach(i=>{const x=M+i*(mw+24), lista=avisosDoDia(avisos,d.time[i]), nv=nivelDoDia(lista);
    ctx.fillStyle="#13262b";ctx.font=`800 28px ${B}`;ctx.fillText(i===0?"HOJE":"AMANHÃ",x,y+26);
    ctx.fillStyle="#56696e";ctx.font=`600 22px ${B}`;ctx.fillText(new Date(d.time[i]+"T12:00").toLocaleDateString("pt-BR",{weekday:"short",day:"2-digit",month:"2-digit"}),x+(i===0?96:136),y+26);
    desenharMapa(ctx,x,y+44,mw,mh,nv);
    // pílula do nível
    let yy=y+44+mh+14;
    ctx.fillStyle=HEX[nv];rr(ctx,x,yy,mw,52,14);ctx.fill();ctx.fillStyle=corTxt(nv);ctx.font=`800 26px ${B}`;
    ctx.fillText(`${EMO[nv]} ${NIVEL_TXT[nv].toUpperCase()}`,x+18,yy+35);yy+=66;
    ctx.fillStyle="#13262b";ctx.font=`600 23px ${B}`;
    const eventos=[...new Set(lista.map(a=>a.descricao))];
    if(!eventos.length){ctx.fillText("Nenhum aviso para o dia",x+4,yy+22);yy+=34}
    eventos.forEach(ev=>{yy+=texto(ctx,`${emojiEvento(ev)} ${ev}`,x+4,yy+22,mw-8,32)});
    alturaInfo=Math.max(alturaInfo,yy-y);
  });
  y+=alturaInfo+20;
  // legenda
  ctx.font=`600 20px ${B}`;let lx=M;
  ["verde","amarelo","laranja","vermelho"].forEach(n=>{ctx.fillStyle=HEX[n];rr(ctx,lx,y,22,22,5);ctx.fill();ctx.fillStyle="#56696e";const t=NIVEL_TXT[n];ctx.fillText(t,lx+30,y+18);lx+=30+ctx.measureText(t).width+28});
  y+=54;
  // agora + previsão
  ctx.fillStyle="#fff";rr(ctx,M,y,W-2*M,200,22);ctx.fill();
  ctx.fillStyle="#13262b";ctx.font=`800 92px ${F}`;ctx.fillText(fmt(c.temperature_2m)+"°",M+28,y+118);
  ctx.font=`600 24px ${B}`;ctx.fillStyle="#56696e";ctx.fillText("AGORA · 💧 "+fmt(c.relative_humidity_2m)+"%",M+32,y+164);
  const col=(W-2*M-290)/3;
  for(let i=0;i<3;i++){const x=M+290+i*col;
    ctx.fillStyle="#56696e";ctx.font=`700 24px ${B}`;ctx.fillText(nomeDia(d.time[i],i).toUpperCase(),x,y+50);
    ctx.font=`42px ${E}`;ctx.fillText(emojiTempo(d.weather_code[i]),x,y+104);
    ctx.fillStyle="#13262b";ctx.font=`700 28px ${B}`;ctx.fillText(`${fmt(d.temperature_2m_min[i])}°/${fmt(d.temperature_2m_max[i])}°`,x+56,y+98);
    ctx.fillStyle="#0b6e75";ctx.font=`600 24px ${B}`;ctx.fillText(`☔ ${fmt(d.precipitation_sum[i],0)} mm · ${fmt(d.precipitation_probability_max[i])}%`,x,y+158);}
  y+=230;
  // principais riscos (chips)
  const relev=R.filter(r=>r.nivel!=="verde");
  if(relev.length){ctx.fillStyle="#13262b";ctx.font=`800 32px ${F}`;ctx.fillText("⚠️ RISCOS À SAÚDE",M,y+8);y+=30;
    ctx.font=`700 25px ${B}`;let cx=M,cy=y;
    relev.forEach(r=>{const t=`${emojiEvento(r.titulo)} ${r.titulo}`,w=ctx.measureText(t).width+40;
      if(cx+w>W-M){cx=M;cy+=66}
      ctx.fillStyle=HEX[r.nivel];rr(ctx,cx,cy,w,52,26);ctx.fill();ctx.fillStyle=corTxt(r.nivel);ctx.fillText(t,cx+20,cy+35);cx+=w+12});
    y=cy+80;}
  y+=rodape(ctx,y,"➡️ Veja as orientações de saúde no próximo card");
  finalizarCanvas(cv,ctx,y,"card1-tempo-jaborandi-"+d.time[0]+".png","baixar-card1");
}

function desenharCard2(p,R,G,info){
  const [cv,ctx]=prepararCanvas("card2"), d=p.daily, agora=new Date();
  let y=cabecalho(ctx,"#0b6e75","#0b4f55","VIGILÂNCIA EM SAÚDE · JABORANDI/SP","ORIENTAÇÕES DE SAÚDE",
    agora.toLocaleDateString("pt-BR",{weekday:"long",day:"2-digit",month:"long"})+" · "+info.chamada.toLowerCase(),"🩺");
  y+=36;
  const relev=R.filter(r=>r.nivel!=="verde");
  if(relev.length){
    ctx.fillStyle="#13262b";ctx.font=`800 32px ${F}`;ctx.fillText("👥 CUIDADOS PARA TODOS",M,y+8);y+=30;
    relev.forEach(r=>{
      // mede
      ctx.font=`500 24px ${B}`;const linhas=r.dicas.map(t=>quebrar(ctx,t,W-2*M-80).length);const h=70+linhas.reduce((s,n)=>s+n*32+8,0);
      ctx.fillStyle="#fff";rr(ctx,M,y,W-2*M,h,18);ctx.fill();ctx.fillStyle=HEX[r.nivel];rr(ctx,M,y,14,h,7);ctx.fill();
      ctx.fillStyle=HEX[r.nivel];ctx.font=`800 29px ${B}`;ctx.fillText(`${emojiEvento(r.titulo)} ${r.titulo.toUpperCase()}`,M+34,y+44);
      let yy=y+80;ctx.fillStyle="#2e4247";ctx.font=`500 24px ${B}`;
      r.dicas.forEach(t=>{ctx.fillText("•",M+36,yy);yy+=texto(ctx,t,M+58,yy,W-2*M-80,32)+8});
      y+=h+14;});
    y+=16;
  }
  if(G.length){
    ctx.fillStyle="#13262b";ctx.font=`800 32px ${F}`;ctx.fillText("💙 ATENÇÃO ESPECIAL",M,y+8);y+=30;
    const cw=(W-2*M-20)/2, tl=cw-40;
    const alturaGrupo=g=>{ctx.font=`800 25px ${B}`;const hn=quebrar(ctx,g.nome,cw-100).length*30;ctx.font=`500 21px ${B}`;
      return Math.max(64,hn+30)+g.lista.reduce((s,t)=>s+quebrar(ctx,t,tl-18).length*27+10,0)+16};
    for(let i=0;i<G.length;i+=2){
      const par=G.slice(i,i+2), h=Math.max(...par.map(alturaGrupo));
      par.forEach((g,j)=>{const x=M+j*(cw+20);
        ctx.fillStyle="#dff0f0";rr(ctx,x,y,cw,h,18);ctx.fill();
        ctx.font=`44px ${E}`;ctx.fillText(g.emoji,x+18,y+56);
        ctx.fillStyle="#0b4f55";ctx.font=`800 25px ${B}`;const hn=texto(ctx,g.nome,x+82,y+42,cw-100,30);
        let yy=y+Math.max(64,hn+30)+14;ctx.fillStyle="#2e4247";ctx.font=`500 21px ${B}`;
        g.lista.forEach(t=>{ctx.fillText("•",x+20,yy);yy+=texto(ctx,t,x+38,yy,tl-18,27)+10});
      });
      y+=h+16;
    }
    y+=10;
  }
  y+=rodape(ctx,y,"");
  finalizarCanvas(cv,ctx,y,"card2-orientacoes-jaborandi-"+d.time[0]+".png","baixar-card2");
}
function desenharCards(p,avisos,R,G,info){desenharCard1(p,avisos,R,info);desenharCard2(p,R,G,info)}
