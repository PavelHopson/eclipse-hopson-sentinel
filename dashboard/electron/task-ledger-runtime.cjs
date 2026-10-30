const { randomUUID } = require('node:crypto');
const { createTaskPolicy } = require('./task-ledger-contract.cjs');

function createTaskLedgerRuntime({ transport, confirm = async () => false }) {
  const policy = createTaskPolicy(); let current = null;
  const failure = error => ({ ok: false, error, executionAllowed: false });
  const isCurrent = session => Boolean(current && current.id === session && !current.abort.signal.aborted);
  const close = session => { if (isCurrent(session)) { current.abort.abort(); current = null; } };
  return {
    activate(projectId) {
      if (!policy.projects.includes(projectId)) return failure('invalid_request');
      current?.abort.abort();
      current = { id: randomUUID(), projectId, abort: new AbortController(), busy: false };
      return { ok: true, session: current.id, projectId };
    },
    isCurrent, close,
    dispose() { if (current) close(current.id); },
    async request(input) {
      let args;
      try {
        const { session, ...raw } = input;
        if (!isCurrent(session) || raw.projectId !== current.projectId) return failure('stale_session');
        args = policy.request(raw);
      } catch { return failure('invalid_request'); }
      const scope = current;
      if (scope.busy) return failure('busy');
      scope.busy = true;
      try {
        const mutation = ['propose', 'transition'].includes(args.kind);
        if (mutation) {
          let task;
          if (args.kind === 'transition') {
            const fresh = await transport({ kind: 'get', projectId: args.projectId, taskId: args.taskId }, scope.abort.signal);
            if (!isCurrent(scope.id)) return failure('stale_session');
            if (!fresh.ok) return fresh;
            task = policy.task(fresh.task, args.projectId);
            if (task.revision !== args.expectedRevision) return failure('conflict');
          }
          const confirmed = await confirm({ ...args, task });
          if (!isCurrent(scope.id)) return failure('stale_session');
          if (!confirmed) return failure('cancelled');
          args.idempotencyKey = randomUUID();
        }
        const result = await transport(args, scope.abort.signal);
        return isCurrent(scope.id) ? result : failure('stale_session');
      } catch { return failure(['propose', 'transition'].includes(args.kind) ? 'delivery_unconfirmed' : 'unavailable'); }
      finally { scope.busy = false; }
    },
  };
}

module.exports = { createTaskLedgerRuntime };
