/* Renderização do tabuleiro e dos painéis. Regras ficam em game-rules.js. */
"use strict";

function trackHTML() {
  const water = G ? G.aquifer : 10;
  return '<div class="track-head"><span><i class="bi bi-droplet-half" aria-hidden="true"></i> Aquífero compartilhado</span><strong>' + water + ' / 10</strong></div>' +
    '<div class="track" role="meter" aria-label="Nível do aquífero" aria-valuemin="0" aria-valuemax="10" aria-valuenow="' + water + '"><i style="width:' + water * 10 + '%"></i></div>' +
    '<div class="track-caption"><span>0 · crise coletiva</span><span>10 · recurso preservado</span></div>';
}

function drawBoard() {
  const board = $("board");
  board.innerHTML = "";
  for (let i = 0; i < 32; i++) {
    const stateTerritory = territoryAt(i), seed = TERRITORY_SEEDS.find(function (item) { return item.house - 1 === i; });
    const kind = houseTypeAt(i), info = seed ? { icon: seed.icon, label: seed.short, name: seed.name } : HOUSE_INFO[kind];
    const cell = document.createElement("div");
    cell.className = "cell " + kind;
    cell.style.gridRow = String(COORDS[i][0] + 1);
    cell.style.gridColumn = String(COORDS[i][1] + 1);
    cell.setAttribute("role", "gridcell");
    cell.setAttribute("aria-label", "Casa " + (i + 1) + ": " + (seed ? seed.name : info.name));
    const number = document.createElement("span"); number.className = "num"; number.textContent = String(i + 1); cell.appendChild(number);
    if (stateTerritory && stateTerritory.owner != null && G && G.players[stateTerritory.owner]) {
      const owner = document.createElement("span"); owner.className = "owner-mark";
      owner.style.background = G.players[stateTerritory.owner].color; owner.title = "Controlado por " + G.players[stateTerritory.owner].name; cell.appendChild(owner);
    }
    const icon = document.createElement("span"); icon.className = "ico"; icon.setAttribute("aria-hidden", "true"); icon.textContent = info.icon; cell.appendChild(icon);
    const label = document.createElement("span"); label.className = "label"; label.textContent = info.label; cell.appendChild(label);
    const tokens = document.createElement("span"); tokens.className = "tokens";
    if (G) G.players.forEach(function (player, index) {
      if (player.pos !== i) return;
      const token = document.createElement("span"); token.className = "token"; token.style.background = player.color;
      token.setAttribute("aria-label", "Marcador " + player.colorName); token.title = "Marcador " + player.colorName; tokens.appendChild(token);
      if (index === G.pi) cell.classList.add("active");
    });
    cell.appendChild(tokens); board.appendChild(cell);
  }
  const center = document.createElement("div"); center.className = "board-center";
  center.setAttribute("aria-label", "Mapa do Pecém e estado do aquífero");
  center.innerHTML = '<span>PECÉM · CEARÁ · 2030</span>';
  board.appendChild(center);
  if (window.SedeHooks) window.SedeHooks.emit("boardRendered", { board: board, state: G });
}

function renderPlayers() {
  const box = $("players"), announcement = $("turnAnnouncement");
  if (!G) {
    announcement.innerHTML = "";
    box.innerHTML = '<div class="card-note">Comece uma partida para escolher os marcadores.</div>';
    return;
  }
  const active = current(), myTurn = isMyTurn();
  announcement.innerHTML = '<div class="turn-banner"><span class="turn-icon"><i class="bi bi-dice-5" aria-hidden="true"></i></span><div><small>AGORA É A VEZ DE</small><strong>' + esc(active.name) + '</strong><em>' +
    (myTurn ? "Confira a carga e lance o dado." : "A rota está com outro marcador.") + '</em></div></div>' +
    (G.turnNotice && G.turnNoticeSerial === G.turnSerial ? '<p class="turn-notice">' + esc(G.turnNotice) + '</p>' : "");
  box.innerHTML = G.players.map(function (player, index) {
    const band = SedeRules.footprintBand(player), activePlayer = index === G.pi;
    return '<div class="player-row ' + (activePlayer ? "current turn-highlight" : "") + '"><span class="player-chip" style="background:' + esc(player.color) + '" aria-label="Marcador '+esc(player.colorName)+'"></span><div class="player-text"><div class="player-name-row"><b>' + esc(player.name) + '</b></div><small class="footprint-line"><b class="footprint-badge ' + band.className + '">' +
      band.label + '</b> · ' + player.deliveries + '/3 entregas</small></div><div class="player-score">' +
      player.score + ' pts</div></div>';
  }).join("");
}

function renderCargo() {
  const box = $("cargoPanel");
  if (!G || !current()) { box.innerHTML = '<p class="card-note">A partida ainda não começou.</p>'; return; }
  const player = current(), cargo = player.cargo;
  if (!cargo) {
    box.innerHTML = '<div class="cargo-card"><b>Sem carga ativa</b></div>';
    return;
  }
  const from = TERRITORY_SEEDS.find(function (item) { return item.house === cargo.from; });
  const to = TERRITORY_SEEDS.find(function (item) { return item.house === cargo.to; });
  const rounds = Math.max(0, cargo.expiresRound - G.round);
  const roundsLabel = rounds === 1 ? "RODADA" : "RODADAS";
  const level = cargo.serviceLevel === "express" ? "EXPRESSA" : cargo.serviceLevel === "standard" ? "PADRÃO" : "SLA PENDENTE";
  box.innerHTML = '<article class="cargo-card"><span class="card-label">CARGA · ' + level + '</span><h3>' + esc(cargo.name) + '</h3>' +
    '<div class="cargo-route"><span>' + esc(from ? from.short : "Território") + ' → ' + esc(to ? to.short : "Território") +
    '</span></div><div class="cargo-state">' + (cargo.pickedUp ? "COLETADA" : "RETIRAR NA ORIGEM") + " · " + rounds + " " + roundsLabel + "</div></article>";
  const stateLine=document.createElement("div");stateLine.className="cargo-status-strip";
  stateLine.innerHTML='<b class="cargo-transparency '+(cargo.maquiada?'risk':'clear')+'">'+(cargo.maquiada?'MAQUIADA':'TRANSPARENTE')+'</b>'+(player.anaceConsulted?'<span>ANACÉ +1</span>':'')+(player.windCredit?'<span>CRÉDITO EÓLICO</span>':'');
  box.querySelector(".cargo-card").appendChild(stateLine);
}

function renderLog() {
  const box = $("log");
  if (!G) { box.innerHTML = '<div class="log-entry"><p>A partida ainda não começou. Use o menu inicial para jogar.</p></div>'; return; }
  box.innerHTML = (G.log || []).map(function (item) {
    return '<div class="log-entry"><small>RODADA ' + item.round + '</small><p>' + esc(item.text) + '</p></div>';
  }).join("");
}

function renderLastMove() {
  const box = $("lastMoveSummary");
  if (!box) return;
  const move = G && G.lastMove;
  box.innerHTML = move ? '<div class="last-move-card"><small>RODADA ' + move.round + ' · ' + esc(move.playerName) + '</small><p>' + esc(move.text) + '</p></div>' :
    '<div class="last-move-card"><small>RESUMO DA ÚLTIMA JOGADA</small><p>A partida ainda não começou.</p></div>';
}

function renderImpactPreview() {
  const box = $("impactPreview");
  if (!box) return;
  if (!G || !current()) { box.innerHTML = ""; return; }
  const player = current();
  if (G.previewTarget != null) {
    const impact = SedeRules.landingPreview(G.previewTarget, player);
    box.innerHTML = '<b>Casa ' + (G.previewTarget + 1) + '</b><p>' + esc(impact || "Sem efeito especial.") + '</p>';
    return;
  }
  box.innerHTML = "";
}

function render() {
  $("trackWrap").innerHTML = trackHTML();
  drawBoard(); renderPlayers(); renderCargo(); renderLastMove(); renderImpactPreview(); renderLog();
  const demoPanel=$("demoToolsPanel");if(demoPanel)demoPanel.hidden=!(G&&G.demoMode);
  if (!G) { if(window.SedeHooks)window.SedeHooks.emit("afterRender",{state:G}); return; }
  const roundLimit=G.roundLimit||10;
  $("round").textContent = "RODADA " + Math.min(G.round, roundLimit) + " / " + roundLimit;
  $("diceFace").textContent = G.lastRoll ? "⚀⚁⚂⚃⚄⚅"[G.lastRoll - 1] : "🎲";
  $("diceLabel").textContent = G.lastRoll ? (G.players[G.pi].name + " tirou " + G.lastRoll) : "Dado de 6 faces";
  $("turnMsg").textContent = !G.game ? "Partida encerrada." : G.pendingChoice ? "Escolha em grupo." : G.pendingLanding != null ? "Confira a casa." : G.rolled ? "Encerre o turno." : "";
  $("rollBtn").disabled = !canAct() || G.rolled;
  $("endTurnBtn").disabled = !canAct() || !G.rolled;
  if(window.SedeHooks)window.SedeHooks.emit("afterRender",{state:G});
}
