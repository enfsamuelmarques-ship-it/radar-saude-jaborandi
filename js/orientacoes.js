/* Orientações de saúde do Radar do Tempo
 *
 * Todas as frases ficam aqui, para revisar e editar sem mexer no resto do painel.
 * Cada orientação tem várias versões. O painel troca de versão a cada dia (rodízio),
 * e no mesmo dia o painel, os cards e o texto do WhatsApp mostram sempre a mesma.
 * Para acrescentar uma versão, basta pôr mais uma frase (ou mais um grupo de frases) na lista.
 */
"use strict";

/* ---------- rodízio ---------- */
// número do dia (muda à meia-noite); iso = "2026-11-25" ou vazio para hoje
function numeroDoDia(iso){
  const t = iso ? new Date(iso+"T12:00") : new Date();
  return Math.floor(Date.UTC(t.getFullYear(),t.getMonth(),t.getDate())/864e5);
}
// escolhe a versão do dia; "extra" desencontra listas diferentes no mesmo dia
function escolher(lista, iso, extra=0){
  if(!Array.isArray(lista)) return lista;
  return lista[(numeroDoDia(iso)+extra) % lista.length];
}

/* ---------- cuidados para todos, por risco ---------- */
// cada item da lista é uma versão completa (um conjunto de 1 a 3 dicas)
const DICAS_RISCO = {
  tempestade: [
    ["Fique longe de árvores, torres e campo aberto", "Tire os aparelhos da tomada durante os raios"],
    ["Durante os raios, fique dentro de casa ou do carro fechado", "Não se abrigue debaixo de árvores"],
    ["Evite usar chuveiro elétrico e telefone com fio durante os raios", "Saia de piscinas, rios e lagos quando o tempo fechar"],
  ],
  chuvaForte: [
    ["Não atravesse ruas ou córregos alagados", "Água de enchente transmite leptospirose: use botas e luvas"],
    ["Nunca entre em água de enchente, nem a pé nem de carro", "Depois da enchente, lave a casa com água sanitária, usando luvas e botas"],
    ["Não deixe crianças brincarem na enxurrada", "Febre e dor forte na batata da perna depois de contato com enchente: procure a unidade de saúde"],
  ],
  chuvaModerada: [
    ["Atenção a pontos de alagamento e pistas escorregadias"],
    ["No trânsito com chuva, reduza a velocidade e acenda o farol"],
    ["Limpe calhas e ralos para a água da chuva escorrer"],
  ],
  dengue: [
    ["Depois da chuva, esvazie vasos, pneus, baldes e calhas", "Febre e dor no corpo: procure a unidade de saúde"],
    ["Tampe a caixa d'água e coloque areia nos pratinhos das plantas", "Com suspeita de dengue, beba bastante líquido e não tome AAS nem anti-inflamatório"],
    ["Reserve 10 minutos por semana para procurar água parada em casa", "Febre com manchas no corpo, dor atrás dos olhos ou nas juntas: procure a unidade de saúde"],
  ],
  calorIntenso: [
    ["Beba água mesmo sem sede", "Evite o sol e o esforço físico das 10h às 16h", "Tontura e confusão podem ser insolação: procure atendimento"],
    ["Use roupas leves e claras e chapéu", "Ofereça água a idosos e crianças várias vezes ao dia", "Pele quente e seca, dor de cabeça forte ou desmaio: ligue 192"],
    ["Feche as cortinas nas horas mais quentes e deixe a casa ventilada", "Evite bebida alcoólica no calor", "Quem trabalha ao ar livre: faça pausas na sombra e beba água"],
  ],
  calor: [
    ["Beba água e use roupas leves"],
    ["Prefira atividades ao ar livre no começo da manhã ou no fim da tarde"],
    ["Leve uma garrafa de água ao sair de casa"],
  ],
  arSeco: [
    ["Beba água e use soro no nariz e nos olhos", "Evite exercício ao ar livre das 10h às 16h"],
    ["Uma toalha molhada ou uma bacia com água no quarto ajudam a umidificar o ar", "Não queime lixo nem mato: a fumaça piora a respiração"],
    ["Passe hidratante na pele e nos lábios", "Falta de ar ou chiado no peito: procure a unidade de saúde"],
  ],
  vento: [
    ["Fique longe de árvores, postes e fios caídos"],
    ["Prenda objetos soltos no quintal e na laje"],
    ["Fio caído no chão: não chegue perto e ligue para a companhia de energia"],
  ],
  uv: [
    ["Use protetor solar, chapéu e óculos e evite o sol das 10h às 16h"],
    ["Ao ficar no sol, passe o protetor solar de novo a cada 2 horas"],
    ["Crianças e quem trabalha ao ar livre: chapéu de aba larga e roupa de manga comprida"],
  ],
  tranquilo: [
    ["Mantenha a hidratação e os cuidados com a água parada"],
    ["Aproveite o tempo bom para eliminar criadouros do mosquito no quintal"],
    ["Bom dia para pôr as vacinas em dia na unidade de saúde"],
  ],
};

/* ---------- grupos vulneráveis ---------- */
// por tipo de risco: tempestade, chuva, calor, seco; "base" vale para dias sem risco
const GRUPOS=[
 {id:"hasdm",emoji:"🫀",nome:"Hipertensos e diabéticos",dicas:{
   calor:["Não pare os remédios. Beba água, meça a pressão e a glicemia e guarde a insulina longe do sol",
     "No calor a pressão pode cair: levante devagar e beba água ao longo do dia. Não suspenda remédios por conta própria",
     "Guarde a insulina fechada na geladeira, fora do congelador. A que está em uso pode ficar em local fresco, longe do sol",
     "Calor e suor alteram a glicemia: meça com mais frequência e tenha um lanche à mão"],
   seco:["Beba água ao longo do dia e meça a pressão e a glicemia",
     "Leve uma garrafa de água e beba aos poucos, mesmo sem sede",
     "Pouca água no corpo pode alterar a pressão e a glicemia: mantenha os remédios no horário"],
   chuva:["Guarde remédios e insulina em local seco e não ande descalço na água",
     "Diabéticos: sequem bem os pés depois da chuva e procurem a unidade se houver ferimento",
     "Tenha remédios para alguns dias em casa, caso a chuva impeça a ida à farmácia"],
   tempestade:["Deixe os remédios à mão. Se faltar energia, guarde a insulina em local fresco, longe do sol",
     "Guarde receitas e a lista de remédios num saco plástico, fácil de pegar",
     "Se faltar luz por muitas horas, mantenha a insulina em local fresco e nunca a congele"],
   base:["Tome os remédios no horário e acompanhe a pressão e a glicemia",
     "Faça o acompanhamento na unidade de saúde e leve o cartão de pressão e glicemia",
     "Menos sal e menos açúcar no prato ajudam a controlar a pressão e a glicemia",
     "Caminhar 30 minutos por dia, nos horários mais frescos, ajuda no controle"]}},
 {id:"tea",emoji:"♾️",nome:"Pessoas autistas (TEA)",dicas:{
   tempestade:["Trovões e falta de luz podem assustar: tenha abafador, lanterna e um cantinho calmo",
     "Explique antes o que é o trovão e combine um lugar seguro da casa para ficar",
     "Lanterna e objetos conhecidos por perto ajudam se faltar luz"],
   chuva:["Se a rotina mudar por causa da chuva, avise antes",
     "Use figuras ou um quadro para mostrar o novo plano do dia quando a chuva mudar a rotina",
     "Barulho de chuva forte incomoda: abafador ou música calma podem ajudar"],
   calor:["Ofereça água em horários fixos, sem esperar que peçam",
     "Roupas leves e de tecido macio ajudam quem tem sensibilidade ao calor e às texturas",
     "Observe sinais de calor que a pessoa pode não dizer: irritação, rosto vermelho, cansaço"],
   seco:["Ofereça água em horários fixos, sem esperar que peçam",
     "O soro no nariz pode incomodar: mostre antes como é e faça com calma"],
   base:["Mantenha a rotina e avise antes sobre mudanças",
     "Antecipe as atividades do dia com calendário ou figuras",
     "Tenha à mão o contato da equipe que acompanha a pessoa"]}},
 {id:"idoso",emoji:"👵",nome:"Idosos",dicas:{
   calor:["O idoso sente menos sede: ofereça água várias vezes ao dia",
     "Deixe a casa arejada e evite sair entre 10h e 16h",
     "Confusão, tontura ou fraqueza no calor podem ser desidratação: procure atendimento",
     "Ofereça frutas com bastante água, como melancia e laranja"],
   seco:["O idoso sente menos sede: ofereça água várias vezes ao dia",
     "Use soro nos olhos e no nariz e passe hidratante na pele",
     "Uma toalha molhada ou uma bacia com água no quarto ajudam a umidificar o ar"],
   chuva:["Com o piso molhado, redobre o cuidado para evitar quedas",
     "Use calçado fechado com sola antiderrapante e acenda a luz ao andar à noite",
     "Deixe os caminhos da casa livres de tapetes e objetos para evitar tombos"],
   tempestade:["Familiares e vizinhos: liguem para o idoso que mora sozinho",
     "Deixe lanterna e telefone carregado perto da cama"],
   base:["Familiares e vizinhos: fiquem atentos ao idoso que mora sozinho",
     "Mantenha as vacinas em dia, como a da gripe e a da Covid",
     "Confira se os remédios estão sendo tomados nos horários certos"]}},
 {id:"crianca",emoji:"👶",nome:"Gestantes, bebês e crianças",dicas:{
   calor:["Use roupas leves, fique na sombra e beba água. Bebês: ofereça o peito mais vezes",
     "Gestantes: bebam bastante água e descansem com as pernas para cima",
     "Nunca deixe uma criança sozinha dentro de carro fechado, nem por pouco tempo",
     "Bebês com menos de 6 meses: só leite materno, mesmo no calor. Ofereça o peito mais vezes"],
   seco:["Ofereça água e use soro no nariz das crianças",
     "Soro no nariz antes de mamar ajuda o bebê a respirar melhor",
     "Evite brincadeiras ao ar livre das 10h às 16h"],
   chuva:["Não deixe as crianças brincarem na enxurrada",
     "Água de enchente pode transmitir leptospirose: mantenha as crianças longe",
     "Gestantes: evitem andar em ruas alagadas"],
   tempestade:["Durante os raios, mantenha as crianças dentro de casa",
     "Durante os raios, fique longe das janelas e evite o chuveiro elétrico"],
   base:["Mantenha as vacinas em dia",
     "Leve a caderneta da criança ou da gestante a todas as consultas",
     "Pré-natal em dia: faça todas as consultas e exames"]}},
 {id:"resp",emoji:"🫁",nome:"Asma e DPOC",dicas:{
   seco:["Tenha a bombinha sempre por perto e use soro no nariz",
     "Evite poeira e fumaça e não queime lixo nem folhas",
     "O ar seco irrita os pulmões: beba água e use soro no nariz"],
   calor:["Tenha a bombinha à mão e evite esforço no calor",
     "Leve a bombinha de resgate sempre que sair"],
   chuva:["Areje a casa e limpe o mofo",
     "A umidade favorece o mofo: seque bem roupas e cobertas antes de guardar"],
   tempestade:["Tenha a bombinha à mão. Quem usa nebulizador precisa de um plano para falta de luz",
     "Tempestades podem piorar a asma em algumas pessoas: deixe a bombinha de resgate por perto"],
   base:["Use o remédio de controle todos os dias",
     "A vacina da gripe em dia protege quem tem asma ou DPOC",
     "Peça à equipe de saúde para conferir se você usa a bombinha do jeito certo"]}},
 {id:"eletro",emoji:"🔌",nome:"Acamados e uso de oxigênio",dicas:{
   tempestade:["Tenha um plano para falta de energia: bateria ou cilindro de oxigênio reserva",
     "Quem usa aparelho ligado na energia pode ser cadastrado na companhia de energia: é um direito"],
   chuva:["Deixe pronta uma bolsa com remédios, receitas e documentos",
     "Tenha anotados os telefones da equipe de saúde e do SAMU (192)"],
   calor:["Mude o acamado de posição, ofereça água e deixe o quarto arejado",
     "No calor a pele do acamado sofre mais: mantenha-a limpa e seca e mude de posição a cada 2 horas"],
   base:["Tenha um plano para falta de energia",
     "Mude o acamado de posição a cada 2 horas para evitar feridas"]}},
 {id:"pcd",emoji:"♿",nome:"Pessoas com deficiência",dicas:{
   chuva:["Combine com vizinhos quem vai ajudar se a rua alagar",
     "Calçada molhada escorrega: redobre o cuidado com cadeira de rodas, muletas e andador"],
   tempestade:["Deixe a cadeira de rodas e as baterias carregadas e por perto",
     "Deixe livre o caminho de saída da casa e combine quem vai ajudar"],
   calor:["Cadeira de rodas exposta ao sol esquenta: cuidado com queimaduras",
     "Leve água ao sair e procure lugares com sombra"],
   base:["Tenha um plano de ajuda com vizinhos e família",
     "Guarde documentos e receitas num lugar fácil de pegar"]}},
 {id:"renal",emoji:"💧",nome:"Doença renal ou cardíaca",dicas:{
   calor:["Siga a quantidade de líquidos que a equipe de saúde orientou",
     "Inchaço, falta de ar ou tontura no calor: procure a equipe de saúde"],
   seco:["Siga a quantidade de líquidos que a equipe de saúde orientou"]}}
];
// uma orientação por grupo, da situação mais grave do dia; a versão muda a cada dia
function cuidadosPorGrupo(R, iso){
  const ativos=tiposAtivos(R), prio=["tempestade","chuva","calor","seco"];
  return GRUPOS.map((g,gi)=>{
    const t = prio.find(t=>ativos.has(t)&&g.dicas[t]) || (g.dicas.base ? "base" : null);
    return {...g, tipo:t, lista: t ? [escolher(g.dicas[t], iso, gi)] : []};
  }).filter(g=>g.lista.length);
}

/* ---------- dica da época do ano ---------- */
// meses: 1 = janeiro ... 12 = dezembro. Em cada dia aparece uma das dicas válidas para o mês.
const DICAS_EPOCA = [
  {meses:[11,12,1,2,3,4,5], emoji:"🦟", titulo:"Época de dengue e chikungunya",
    textos:["Calor e chuva fazem o mosquito se multiplicar. 10 minutos por semana procurando água parada em casa protegem a família inteira",
      "Pergunte na unidade de saúde quem pode tomar a vacina da dengue"]},
  {meses:[9,10,11,12,1,2,3], emoji:"🦂", titulo:"Época de escorpiões",
    textos:["Sacuda roupas, toalhas e sapatos antes de usar e mantenha o quintal sem entulho",
      "Picada de escorpião: lave o local com água e sabão e procure atendimento imediatamente, principalmente se for criança"]},
  {meses:[3,4,5,6], emoji:"💉", titulo:"Vacina da gripe",
    textos:["Época da campanha de vacinação contra a gripe: idosos, crianças, gestantes e doentes crônicos devem se vacinar. Confira as datas na unidade de saúde"]},
  {meses:[5,6,7,8], emoji:"🧣", titulo:"Frio e doenças respiratórias",
    textos:["Mesmo no frio, deixe a casa arejada e lave as mãos com frequência",
      "Agasalhe bem bebês e idosos nas manhãs frias. Febre alta ou falta de ar: procure a unidade de saúde"]},
  {meses:[6,7,8,9,10], emoji:"🔥", titulo:"Tempo seco e queimadas",
    textos:["Não coloque fogo em lixo, mato ou palha: é proibido e a fumaça faz mal à saúde",
      "Com fumaça de queimada no ar, feche as janelas e beba água. Quem tem asma deve deixar a bombinha à mão"]},
  {meses:[10,11,12], emoji:"🧹", titulo:"Começo das chuvas",
    textos:["Antes das chuvas fortes, limpe calhas, caixa d'água e quintal para não acumular água parada"]},
  {meses:[12,1,2], emoji:"🏊", titulo:"Férias e calor",
    textos:["Nunca deixe crianças sozinhas perto de piscina, rio ou lago, nem por um minuto",
      "Protetor solar, chapéu e água sempre por perto nos passeios de férias"]},
];
function dicaDaEpoca(iso){
  const t = iso ? new Date(iso+"T12:00") : new Date(), mes = t.getMonth()+1;
  const opcoes = DICAS_EPOCA.flatMap(d => d.meses.includes(mes) ? d.textos.map(texto => ({emoji:d.emoji, titulo:d.titulo, texto})) : []);
  return opcoes.length ? escolher(opcoes, iso, 3) : null;
}
