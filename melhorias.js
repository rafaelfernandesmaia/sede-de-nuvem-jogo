/* Sede de Nuvem · melhorias.js
   Camada complementar para o jogo atual.
   Inclua depois do script principal e antes de firebase-config.js.
*/
(()=>{
  const $=selector=>document.querySelector(selector);
  const SAVE_KEY="sede-de-nuvem-save-v2";

  function readSave(){
    try{
      const state=JSON.parse(localStorage.getItem(SAVE_KEY)||"null");
      return state&&state.game&&!state.online?state:null;
    }catch(error){return null}
  }
  function clearSave(){try{localStorage.removeItem(SAVE_KEY)}catch(error){}}
  window.clearSavedLocalGame=clearSave;
  function saveGame(){
    try{
      if(G&&G.game&&!G.online)localStorage.setItem(SAVE_KEY,JSON.stringify(G));
      else if(G&&!G.game)clearSave();
    }catch(error){}
  }

  /* Casas clicáveis: permite consultar o efeito antes de cair nelas. */
  const style=document.createElement("style");
  style.textContent=".cell{cursor:pointer}.cell:focus-visible{outline:4px solid #f4c845;outline-offset:2px}.cell .label{font-size:clamp(7px,.82vw,11px)}.decision-impact{display:block;margin-top:4px;color:#456044;font-style:normal;font-weight:800}.inspect-note{font-size:11px;font-weight:700;color:#657263}";
  document.head.appendChild(style);

  function inspectHouse(index){
    if(!G||!G.game||!$("#overlay").classList.contains("hidden"))return;
    const info=houseCardText(index);
    modal('<span class="eyebrow">CASA '+(index+1)+' DE 32 · CONSULTA</span><div class="cards-face"><span class="card-label">'+esc(info.icon+" "+info.name.toUpperCase())+'</span><h2>'+esc(info.name)+'</h2><p>'+esc(info.detail)+'</p><p class="inspect-note">Esta consulta não move o peão nem aplica o efeito.</p></div><div class="form-actions"><button class="btn primary" id="closeHouseInspect" type="button">Fechar</button></div>');
    $("#closeHouseInspect").onclick=closeModal;
  }
  const originalDrawBoard=drawBoard;
  drawBoard=function(){
    originalDrawBoard.apply(this,arguments);
    document.querySelectorAll("#board .cell").forEach(function(cell,index){
      cell.setAttribute("tabindex","0");
      cell.setAttribute("aria-label",cell.getAttribute("aria-label")+" · Ative para consultar esta casa");
      cell.onclick=function(){inspectHouse(index)};
      cell.onkeydown=function(event){
        if(event.key==="Enter"||event.key===" "){event.preventDefault();inspectHouse(index)}
      };
    });
  };

  /* Explica os efeitos das duas escolhas sem alterar as regras do roteiro. */
  const originalShowDilemma=showDilemma;
  showDilemma=function(card,readOnly){
    originalShowDilemma.apply(this,arguments);
    if(readOnly)return;
    const honest=$("#honestChoice small"),shortcut=$("#riskyChoice small");
    if(honest)honest.insertAdjacentHTML("beforeend",'<i class="decision-impact">Efeito: mantém a transparência e recebe um Power Up.</i>');
    if(shortcut)shortcut.insertAdjacentHTML("beforeend",'<i class="decision-impact">Efeito: aquífero −1 e avanço de 3 casas; se houver carga, ela fica marcada como maquiada.</i>');
  };

  /* Salva somente partidas locais neste aparelho; partidas online ficam no Firebase. */
  const originalRender=render;
  render=function(){
    const result=originalRender.apply(this,arguments);
    saveGame();
    return result;
  };
  const originalEndGame=endGame;
  endGame=function(){
    clearSave();
    return originalEndGame.apply(this,arguments);
  };

  window.hasSavedLocalGame=function(){return!!readSave()};
  window.restoreSavedLocalGame=function(){
    const state=readSave();
    if(!state){showMainMenu();return}
    const wasRolling=!!state.rolling;
    G=Object.assign({},state,{online:null,rolling:false,moving:false,turnNotice:state.turnNotice||"",turnNoticeSerial:state.turnNoticeSerial==null?-1:state.turnNoticeSerial});
    G.players=G.players||[];G.territories=G.territories||[];G.log=G.log||[];G.pendingChoice=G.pendingChoice||null;G.pendingLanding=G.pendingLanding==null?null:G.pendingLanding;
    if(wasRolling){G.rolled=false;G.lastRoll=0}
    if(G.combat&&G.combat.phase==="rolling"){
      const house=G.combat.house;G.combat=null;
      const territory=G.territories.find(function(item){return item.house===house});
      if(territory)G.pendingLanding=territory.house-1;
    }else if(G.combat&&G.combat.phase==="result")G.combat=null;
    if(!G.game){clearSave();showMainMenu();return}
    rulesSeen=true;closeModal();render();
    if(G.pendingLanding!==null){showHouseCard(G.pendingLanding,false);return}
    if(G.pendingChoice){openCurrentChoice(false);return}
    if(G.combat){showCombatCard(G.combat,false);return}
    if(isMyTurn())prepareTurn();
    toast("Partida local retomada.");
  };

  /* Mostra a opção de retomada no menu após recarregar a página. */
  const originalShowMainMenu=showMainMenu;
  showMainMenu=function(){
    originalShowMainMenu.apply(this,arguments);
    if(G&&G.game)return;
    if(!readSave()||$("#menuSavedGame"))return;
    const grid=$(".menu-grid"),newGame=$("#menuNewGame");
    if(!grid||!newGame)return;
    const button=document.createElement("button");
    button.id="menuSavedGame";button.type="button";button.className="btn menu-wide";
    button.textContent="↻ Retomar partida salva";
    button.onclick=window.restoreSavedLocalGame;
    newGame.insertAdjacentElement("afterend",button);
  };

  render();
  showMainMenu();
})();
