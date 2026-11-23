const test = require("node:test");
const assert = require("node:assert/strict");
const Rules = require("../game-rules.js");

function makeState(overrides) {
  return Rules.normalize(Object.assign({
    pi: 0,
    round: 1,
    aquifer: 10,
    game: true,
    rolled: false,
    moving: false,
    rolling: false,
    moveRemaining: 0,
    pendingLanding: null,
    pendingChoice: null,
    combat: null,
    territories: [],
    players: [
      { id: "P1", uid: "u1", name: "Rota A", pos: 0, score: 0 },
      { id: "P2", uid: "u2", name: "Rota B", pos: 0, score: 0 }
    ]
  }, overrides || {}));
}

test("normaliza partidas antigas sem perder jogadores e cria estado cooperativo", () => {
  const state = makeState({ aquifer: 8 });
  assert.equal(state.version, 2);
  assert.equal(state.contract.id, "corredor-regional");
  assert.deepEqual(state.contract.visitedSites, []);
  assert.equal(state.aquiferHistory[0].value, 8);
  assert.equal(state.players[0].interventionTokens, 1);
  assert.deepEqual(state.players[0].footprint, { water: 0, energy: 0 });
  assert.deepEqual(Rules.validate(state), []);
});

test("valida a fase do turno antes de permitir rolar, responder ou encerrar", () => {
  const state = makeState();
  assert.equal(Rules.canPerform(state, "roll", "P1"), true);
  assert.equal(Rules.canPerform(state, "roll", "P2"), false);
  assert.equal(Rules.canPerform(state, "roll", "P1", "u2"), false);
  state.rolled = true;
  assert.equal(Rules.canPerform(state, "finish", "P1"), true);
  state.moveRemaining = 2;
  assert.equal(Rules.canPerform(state, "finish", "P1"), false);
  state.moveRemaining = 0;
  state.pendingChoice = { type: "dilemma" };
  assert.equal(Rules.canPerform(state, "finish", "P1"), false);
  assert.equal(Rules.canPerform(state, "resolve", "P1"), true);
});

test("registra mudanças do aquífero dentro da escala de 0 a 10", () => {
  const state = makeState({ aquifer: 1 });
  assert.equal(Rules.changeAquifer(state, -4, "seca"), -1);
  assert.equal(state.aquifer, 0);
  assert.equal(Rules.changeAquifer(state, 30, "reuso"), 10);
  assert.deepEqual(state.aquiferHistory.map(row => row.value), [1, 0, 10]);
  assert.deepEqual(state.aquiferHistory.map(row => row.delta), [0, -1, 10]);
});

test("classifica pegadas individuais e aplica as sinergias dos territórios", () => {
  const state = makeState(), player = state.players[0];
  assert.equal(Rules.footprintBand(player).label, "Sustentável");
  Rules.recordFootprint(player, { water: 3, energy: 2 });
  assert.equal(Rules.footprintBand(player).label, "Moderado");
  Rules.recordFootprint(player, { water: 4, energy: 1 });
  assert.equal(Rules.footprintBand(player).label, "Predador");
  assert.match(Rules.visitHouse(state, player, 24), /crédito de energia/);
  assert.equal(player.windCredit, true);
  player.cargo = { maquiada: false };
  assert.match(Rules.visitHouse(state, player, 8), /consulta registrada/);
  assert.equal(player.anaceConsulted, true);
  assert.match(Rules.visitHouse(state, player, 4), /ficha de intervenção/);
  assert.equal(player.interventionTokens, 2);
});

test("contrato exige os três locais e duas pessoas antes de premiar a equipe", () => {
  const state = makeState({ aquifer: 7 });
  const a = state.players[0], b = state.players[1];
  assert.equal(Rules.visitContractSite(state, a, "porto").added, true);
  Rules.visitContractSite(state, a, "eolica");
  const third = Rules.visitContractSite(state, a, "datacenter");
  assert.equal(third.completed, false);
  assert.equal(state.contract.visitedSites.length, 3);
  const completed = Rules.visitContractSite(state, b, "porto");
  assert.equal(completed.completed, true);
  assert.equal(state.contract.complete, true);
  assert.equal(state.aquifer, 9);
  assert.equal(a.score, 2);
  assert.equal(b.score, 2);
});

test("prazo perdido cobra o aquífero e os pontos dos participantes uma única vez", () => {
  const state = makeState({ round: 7, aquifer: 5 });
  state.contract.deadlineRound = 6;
  state.contract.participants = ["P1"];
  state.players[0].score = 3;
  const first = Rules.failContract(state);
  assert.match(first.message, /falhou no prazo/);
  assert.equal(state.aquifer, 4);
  assert.equal(state.players[0].score, 2);
  assert.equal(Rules.failContract(state), null);
});

test("prévia de entrega mostra prazo, recompensa, aquífero e crédito eólico", () => {
  const state = makeState(), player = state.players[0];
  const standard = Rules.deliveryPreview(state, player, "standard");
  assert.equal(standard.deadline, 3);
  assert.equal(standard.aquiferDelta, 0);
  assert.equal(standard.honestPoints, 3);
  const express = Rules.deliveryPreview(state, player, "express");
  assert.equal(express.deadline, 2);
  assert.equal(express.aquiferDelta, -1);
  assert.equal(express.honestPoints, 5);
  player.windCredit = true;
  assert.equal(Rules.deliveryPreview(state, player, "express").energyFootprint, 2);
});
