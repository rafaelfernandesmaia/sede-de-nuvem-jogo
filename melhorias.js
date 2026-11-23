/* Sede de Nuvem · melhorias.js
   Adicione no index.html, logo DEPOIS do </script> principal e ANTES de firebase-config.js:
   <script src="./melhorias.js"></script> */
(()=>{
const N={water:'Água',energy:'Energia',license:'Licença Social',dev:'Desenvolvimento'};
/* [prefixo da tag, efeito coletivo da decisão responsável, evidência que a justifica] */
const ROWS=[
['DADO',{license:1},/Metodologia|Relatório/],
['DIREITO',{water:1,dev:-1},/ONU|poços/],
['EFEITO',{dev:-2,license:1},/Relatório|Nexo/],
['NEXO',{water:1,energy:-1},/Nexo/],
['CONSULTA',{license:2,dev:-1},/OIT/],
['GREEN',{license:2},/Acesso|Metodologia/],
['RESPONS',{dev:-1,license:1},/Jonas/],
['JUSTI',{license:2,water:1},/poços|ONU/],
['TRANSP',{license:2},/Acesso|Metodologia/]];
const row=d=>ROWS.find(r=>d.tag.startsWith(r[0]));
const fmt=fx=>Object.entries(fx).map(([k,v])=>(v>0?'+':'')+v+' '+N[k]).join(' · ');
const RISK={dev:2,water:-1,license:-2};

/* 1. Leitura: fontes maiores e casas clicáveis */
const st=document.createElement('style');
st.textContent='.cell{cursor:pointer}.cell .name{font-size:9px!important}.cell .num{font-size:8px!important}@media(max-width:650px){.cell .name{font-size:7px!important}.cell .ico{font-size:17px!important}.cell{min-height:52px!important}}.choice small i{color:#8a5a3c;font-style:normal;font-weight:900}';
document.head.appendChild(st);
function inspect(i){
  if(!$('#overlay').classList.contains('hidden'))return;
  showHouseCard(i,G,true);
  const w=$('#modal .onlineok');
  if(w){w.className='house-action';w.innerHTML='<button class="btn primary" id="closeHouse">Fechar</button>';$('#closeHouse').onclick=()=>$('#overlay').classList.add('hidden')}
}
{const _d=drawBoard;drawBoard=function(){_d.apply(this,arguments);document.querySelectorAll('#board .cell').forEach((c,i)=>{c.onclick=()=>inspect(i)})}}

/* 2. Dilemas com consequências próprias e atalho tentador (ganho pessoal x custo coletivo) */
resolveDilemma=function(good,d){
  sfx(good?'good':'bad');
  G.pendingChoice=null;$('#overlay').classList.add('hidden');
  const p=cur(),S=G.stats,r=row(d);
  (G.choices=G.choices||[]).push({title:d.title,good:!!good,who:p.name,round:G.round});
  if(good){
    const fx=r?r[1]:{license:1};
    for(const k in fx)S[k]=clamp(S[k]+fx[k]);
    p.score+=1;
    const i=r?G.hand.findIndex(c=>r[2].test(c.name)):-1;
    if(i>=0){G.hand.splice(i,1);p.score++;add('<b>Evidência aplicada:</b> +1 ponto extra por justificar a escolha.')}
    const pid=['atalho','escolta','slm'][G.round%3];G.powers.push(pid);showPowerReveal(pid,p.name,'gain');
    add('<b>Decisão responsável</b> ('+fmt(fx)+', +1 ponto). '+d.why);
  }else{
    for(const k in RISK)S[k]=clamp(S[k]+RISK[k]);
    p.score+=2;
    add('<b>Atalho:</b> +2 pontos para '+esc(p.name)+', mas '+fmt(RISK)+' para toda a equipe.');
    if(d.tag.startsWith('GREEN')){G.greenwash=true;p.greenwash=true;p.score=Math.max(0,p.score-2);add('<b>Greenwashing detectado:</b> -2 pontos.')}
  }
  if(S.water<=0){end(false);return}
  G.drawn=true;render();window.syncOnline?.();
};
/* mostra o custo real de cada opção antes da escolha */
{const _dd=drawDilemma;drawDilemma=function(){
  _dd.apply(this,arguments);
  const d=G.pendingChoice&&G.pendingChoice.card;if(!d)return;
  const r=row(d),g=$('#good small'),b=$('#bad small');
  if(g)g.insertAdjacentHTML('beforeend','<br><i>'+fmt(r?r[1]:{license:1})+' · +1 ponto (+1 com evidência)</i>');
  if(b)b.insertAdjacentHTML('beforeend','<br><i>+2 pontos para você · '+fmt(RISK)+' para todos</i>');
}}

/* 3. Salvar e retomar partida local (sobrevive a recarregar a página) */
const KEY='sdn-save-v1';
{const _r=render;render=function(){_r.apply(this,arguments);try{if(G.game&&!G.online)localStorage.setItem(KEY,JSON.stringify(G))}catch(e){}}}
{const _e=end;end=function(){try{localStorage.removeItem(KEY)}catch(e){}return _e.apply(this,arguments)}}
try{
  const s=localStorage.getItem(KEY);
  if(s&&confirm('Há uma partida em andamento neste aparelho. Continuar de onde parou?')){
    G=JSON.parse(s);G.moving=false;G.diceRolling=false;rulesSeen=true;
    $('#overlay').classList.add('hidden');render();
    if(G.pendingLanding!=null)showHouseCard(G.pendingLanding,G,false);
    else if(G.pendingChoice){const pc=G.pendingChoice;G.pendingChoice=null;pc.type==='mission'?openMissionChoice(mission()):drawDilemma(pc.optional)}
  }
}catch(e){}
})();
