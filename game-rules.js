/* Regras e estado de domínio do Sede de Nuvem. Sem dependência do DOM. */
(function (root) {
  "use strict";

  const CONTRACT_SITES = ["porto", "eolica", "datacenter"];
  const VALID_CHOICES = ["delivery", "dilemma", "power", "council", "councilActor"];
  const clamp = (value, min, max) => Math.max(min, Math.min(max, Number(value) || 0));

  function createContract(round) {
    return {
      id: "corredor-regional",
      name: "Corredor Porto · Parque Eólico · Data Center",
      sites: CONTRACT_SITES.slice(),
      visitedSites: [],
      participants: [],
      deadlineRound: Math.min(6, (round || 1) + 5),
      complete: false,
      failed: false
    };
  }

  function normalize(state) {
    if (!state || typeof state !== "object") return state;
    state.version = Math.max(2, Number(state.version) || 0);
    state.aquifer = clamp(state.aquifer, 0, 10);
    state.aquiferHistory = Array.isArray(state.aquiferHistory) && state.aquiferHistory.length
      ? state.aquiferHistory
      : [{ round: state.round || 1, value: state.aquifer, delta: 0, reason: "Estado inicial ou retomado" }];
    state.lastMove = state.lastMove || null;
    state.moveRemaining = Math.max(0, Number(state.moveRemaining) || 0);
    state.contract = state.contract || createContract(state.round || 1);
    state.contract.sites = Array.isArray(state.contract.sites) ? state.contract.sites : CONTRACT_SITES.slice();
    state.contract.visitedSites = Array.isArray(state.contract.visitedSites) ? state.contract.visitedSites : [];
    state.contract.participants = Array.isArray(state.contract.participants) ? state.contract.participants : [];
    state.contract.deadlineRound = Number(state.contract.deadlineRound) || 6;
    state.pendingChoice = state.pendingChoice || null;
    state.events = Array.isArray(state.events) ? state.events : [];
    state.decisions = Array.isArray(state.decisions) ? state.decisions : [];
    state.deliveryResults = Array.isArray(state.deliveryResults) ? state.deliveryResults : [];
    state.ethicalCounters = state.ethicalCounters || {};
    (state.players || []).forEach(function (player) {
      player.footprint = player.footprint || { water: 0, energy: 0 };
      player.footprint.water = Math.max(0, Number(player.footprint.water) || 0);
      player.footprint.energy = Math.max(0, Number(player.footprint.energy) || 0);
      player.interventionTokens = player.interventionTokens == null ? 1 : clamp(player.interventionTokens, 0, 2);
      player.windCredit = !!player.windCredit;
      player.anaceConsulted = !!player.anaceConsulted;
    });
    return state;
  }

  function validate(state) {
    const errors = [];
    if (!state || typeof state !== "object") return ["Estado de jogo ausente."];
    if (!Array.isArray(state.players) || state.players.length < 2 || state.players.length > 4) errors.push("A partida precisa ter de 2 a 4 jogadores.");
    if (!Number.isInteger(state.pi) || state.pi < 0 || state.pi >= (state.players || []).length) errors.push("Índice do jogador da vez inválido.");
    if (!Number.isInteger(state.round) || state.round < 1 || state.round > 10) errors.push("Rodada fora do intervalo permitido.");
    if (!Number.isFinite(state.aquifer) || state.aquifer < 0 || state.aquifer > 10) errors.push("Nível do aquífero inválido.");
    if (!Number.isInteger(state.moveRemaining) || state.moveRemaining < 0 || state.moveRemaining > 6) errors.push("Movimento pendente inválido.");
    (state.players || []).forEach(function (player, index) {
      if (!Number.isInteger(player.pos) || player.pos < 0 || player.pos > 31) errors.push("Posição inválida para o jogador " + (index + 1) + ".");
      if (!Number.isFinite(player.score) || player.score < -1000) errors.push("Pontuação inválida para o jogador " + (index + 1) + ".");
    });
    (state.territories || []).forEach(function (territory) {
      if (territory.owner != null && (!Number.isInteger(territory.owner) || territory.owner < 0 || territory.owner >= (state.players || []).length)) errors.push("Controle de território inválido.");
    });
    if (state.pendingChoice && !VALID_CHOICES.includes(state.pendingChoice.type)) errors.push("Etapa de escolha pendente desconhecida.");
    return errors;
  }

  function currentPlayer(state) {
    return state && state.players && state.players[state.pi] || null;
  }

  function canPerform(state, action, actorId, onlineUid) {
    if (!state || !state.game || validate(state).length) return false;
    const actor = currentPlayer(state);
    if (!actor || actor.id !== actorId || onlineUid && actor.uid !== onlineUid) return false;
    if (state.moving || state.rolling) return false;
    const pending = state.pendingLanding != null || !!state.pendingChoice || !!state.combat;
    if (action === "roll") return !pending && !state.rolled && state.moveRemaining === 0;
    if (action === "finish") return !pending && !!state.rolled && state.moveRemaining === 0;
    if (action === "resolve") return pending;
    return false;
  }

  function changeAquifer(state, delta, reason) {
    const previous = clamp(state.aquifer, 0, 10);
    const next = clamp(previous + (Number(delta) || 0), 0, 10);
    state.aquifer = next;
    state.aquiferHistory = Array.isArray(state.aquiferHistory) ? state.aquiferHistory : [];
    if (next !== previous) {
      state.aquiferHistory.push({ round: state.round || 1, value: next, delta: next - previous, reason: String(reason || "Ação da partida") });
      if (state.aquiferHistory.length > 40) state.aquiferHistory.shift();
    }
    return next - previous;
  }

  function recordFootprint(player, impact) {
    if (!player) return;
    player.footprint = player.footprint || { water: 0, energy: 0 };
    player.footprint.water = Math.max(0, player.footprint.water + (Number(impact && impact.water) || 0));
    player.footprint.energy = Math.max(0, player.footprint.energy + (Number(impact && impact.energy) || 0));
  }

  function footprintBand(player) {
    const footprint = player && player.footprint || { water: 0, energy: 0 };
    const total = (Number(footprint.water) || 0) + (Number(footprint.energy) || 0);
    if (total <= 3) return { label: "Sustentável", className: "low", score: total };
    if (total <= 8) return { label: "Moderado", className: "medium", score: total };
    return { label: "Predador", className: "high", score: total };
  }

  function recordLastMove(state, player, text) {
    if (!state) return;
    state.lastMove = {
      round: state.round || 1,
      playerId: player && player.id || null,
      playerName: player && player.name || "Mesa",
      text: String(text || "A partida foi atualizada.")
    };
  }

  function visitHouse(state, player, house) {
    if (!state || !player) return "";
    if (house === 24 && !player.windCredit) {
      player.windCredit = true;
      return "Sinergia: o Parque Eólico concedeu 1 crédito de energia para uma entrega expressa.";
    }
    if (house === 8 && player.cargo && !player.cargo.maquiada && !player.anaceConsulted) {
      player.anaceConsulted = true;
      return "Aldeia Anacé: consulta registrada; a próxima entrega transparente vale +1 ponto.";
    }
    if (house === 4 && player.interventionTokens < 2) {
      player.interventionTokens++;
      return "Tribunal: ganhou 1 ficha de intervenção para auditoria ou acordo de poupança.";
    }
    return "";
  }

  function visitContractSite(state, player, siteId) {
    const contract = state && state.contract;
    if (!contract || contract.complete || contract.failed || !contract.sites.includes(siteId)) return null;
    const joined = !contract.participants.includes(player.id);
    if (joined) contract.participants.push(player.id);
    let added = false;
    if (!contract.visitedSites.includes(siteId)) {
      contract.visitedSites.push(siteId);
      added = true;
    }
    const sitesComplete = contract.sites.every(function (site) { return contract.visitedSites.includes(site); });
    if (sitesComplete && contract.participants.length >= 2) {
      contract.complete = true;
      (state.players || []).forEach(function (participant) {
        if (contract.participants.includes(participant.id)) participant.score += 2;
      });
      const water = changeAquifer(state, 2, "Contrato regional concluído");
      return { completed: true, added: added, message: "Contrato concluído: Porto, Parque Eólico e Data Center conectados. Participantes recebem +2 pontos e o aquífero recupera " + water + "." };
    }
    if (sitesComplete && joined) return { completed: false, added: false, message: "Os três locais estão conectados. Falta uma segunda pessoa participar para fechar o contrato." };
    return added ? { completed: false, added: true, message: player.name + " avançou o contrato regional: " + contract.visitedSites.length + "/" + contract.sites.length + " locais visitados." } : null;
  }

  function failContract(state) {
    const contract = state && state.contract;
    if (!contract || contract.complete || contract.failed || state.round <= contract.deadlineRound) return null;
    contract.failed = true;
    const water = changeAquifer(state, -1, "Contrato regional não concluído");
    contract.participants.forEach(function (id) {
      const player = (state.players || []).find(function (item) { return item.id === id; });
      if (player) player.score -= 1;
    });
    return { message: "O contrato regional falhou no prazo: aquífero " + water + "; cada participante perde 1 ponto." };
  }

  function deliveryPreview(state, player, level) {
    const express = level === "express";
    const wind = express && player && player.windCredit;
    return {
      level: express ? "Entrega Expressa de Alta Demanda" : "Entrega Padrão",
      deadline: express ? 2 : 3,
      honestPoints: express ? 5 : 3,
      disguisedPoints: express ? 6 : 4,
      aquiferDelta: express ? -1 : 0,
      waterFootprint: express ? 2 : 1,
      energyFootprint: express ? (wind ? 2 : 3) : 1,
      windCredit: !!wind,
      summary: express
        ? "+2 pontos potenciais, prazo de 2 rodadas e aquífero −1. " + (wind ? "O crédito eólico reduz 1 ponto da pegada energética." : "Pegada energética maior.")
        : "Prazo de 3 rodadas, sem custo extra no aquífero."
    };
  }

  function landingPreview(index, player) {
    const house = index + 1;
    const messages = {
      4: "Tribunal: pode recuperar 1 ficha de intervenção (limite 2).",
      8: "Aldeia Anacé: consulta transparente prepara +1 ponto numa entrega honesta.",
      20: "Data Center: local de contrato regional; entregas expressas têm maior pegada.",
      24: "Parque Eólico: recebe crédito que reduz a pegada energética da próxima entrega expressa.",
      28: "Porto: completa o corredor regional e habilita a recompensa coletiva."
    };
    const base = messages[house] || "";
    const cargo = player && player.cargo;
    if (cargo && cargo.to === house && cargo.pickedUp) return base + (base ? " " : "") + "Destino da carga: entrega " + (cargo.serviceLevel === "express" ? "expressa" : "padrão") + " pode ser concluída aqui.";
    return base;
  }

  const api = {
    createContract: createContract,
    normalize: normalize,
    validate: validate,
    canPerform: canPerform,
    changeAquifer: changeAquifer,
    recordFootprint: recordFootprint,
    footprintBand: footprintBand,
    recordLastMove: recordLastMove,
    visitHouse: visitHouse,
    visitContractSite: visitContractSite,
    failContract: failContract,
    deliveryPreview: deliveryPreview,
    landingPreview: landingPreview
  };

  root.SedeRules = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
