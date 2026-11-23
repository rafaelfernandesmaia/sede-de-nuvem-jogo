/* Pontos de extensão explícitos entre a partida e suas camadas opcionais. */
(function (root) {
  "use strict";
  const listeners = new Map();

  function on(name, callback) {
    if (typeof callback !== "function") throw new TypeError("O hook precisa receber uma função.");
    const queue = listeners.get(name) || [];
    queue.push(callback);
    listeners.set(name, queue);
    return function () {
      const current = listeners.get(name) || [];
      listeners.set(name, current.filter(function (item) { return item !== callback; }));
    };
  }

  function emit(name, payload) {
    return (listeners.get(name) || []).slice().map(function (callback) {
      return callback(payload);
    });
  }

  function request(name, payload) {
    const queue = (listeners.get(name) || []).slice();
    for (let index = queue.length - 1; index >= 0; index--) {
      const result = queue[index](payload);
      if (result !== undefined) return result;
    }
    return undefined;
  }

  root.SedeHooks = { on: on, emit: emit, request: request };
})(typeof window !== "undefined" ? window : globalThis);
