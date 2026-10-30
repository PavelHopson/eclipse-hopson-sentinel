// Self-contained so the identical policy also runs inside the private SSH bridge.
function createTaskPolicy() {
  const projects = ['ultron', 'ai-hub', 'starai', 'starcrm', 'starmarket'];
  const states = ['proposed', 'planned', 'paused', 'completed', 'cancelled'];
  const actions = ['accept', 'pause', 'resume', 'complete', 'cancel'];
  const uuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
  const fail = () => { throw new Error('invalid_contract'); };
  const text = (value, max, empty = false) => {
    if (typeof value !== 'string' || value.length > max || (!empty && !value.trim()) || /[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069<>]/u.test(value)) fail();
    return value;
  };
  const date = value => { if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value) || new Date(value).toISOString() !== value) fail(); return value; };
  const object = value => { if (!value || typeof value !== 'object' || Array.isArray(value)) fail(); };
  const request = (raw, internal = false) => {
    object(raw);
    const fields = { list: ['after'], get: ['taskId'], propose: ['title', 'detail'], transition: ['taskId', 'action', 'expectedRevision', 'evidenceNote'] };
    if (!projects.includes(raw.projectId) || !Object.hasOwn(fields, raw.kind)) fail();
    const allowed = ['kind', 'projectId', ...fields[raw.kind], ...(internal ? ['idempotencyKey'] : [])];
    if (Object.keys(raw).some(key => !allowed.includes(key))) fail();
    const result = { kind: raw.kind, projectId: raw.projectId };
    if (raw.kind === 'list') {
      if (!Number.isSafeInteger(raw.after ?? 0) || (raw.after ?? 0) < 0) fail();
      result.after = raw.after ?? 0;
    }
    if (['get', 'transition'].includes(raw.kind)) { if (typeof raw.taskId !== 'string' || !uuid.test(raw.taskId)) fail(); result.taskId = raw.taskId; }
    if (raw.kind === 'propose') { result.title = text(raw.title, 160); result.detail = text(raw.detail ?? '', 800, true); }
    if (raw.kind === 'transition') {
      if (!actions.includes(raw.action) || !Number.isInteger(raw.expectedRevision) || raw.expectedRevision < 1 || raw.expectedRevision > 64) fail();
      Object.assign(result, { action: raw.action, expectedRevision: raw.expectedRevision });
      if (raw.action === 'complete') result.evidenceNote = text(raw.evidenceNote, 400);
      else if (raw.evidenceNote !== undefined) fail();
    }
    if (internal && ['propose', 'transition'].includes(raw.kind)) {
      if (typeof raw.idempotencyKey !== 'string' || !uuid.test(raw.idempotencyKey)) fail();
      result.idempotencyKey = raw.idempotencyKey;
    }
    return result;
  };
  const task = (raw, projectId) => {
    object(raw);
    if (typeof raw.id !== 'string' || !uuid.test(raw.id) || raw.projectId !== projectId || !states.includes(raw.state) || raw.executionAllowed !== false || !Number.isInteger(raw.revision) || raw.revision < 1 || raw.revision > 64 || typeof raw.createdBy !== 'string' || !/^[a-z][a-z0-9-]{1,62}$/.test(raw.createdBy)) fail();
    let completionEvidence = null;
    if (raw.state === 'completed') {
      if (raw.completionEvidence?.kind !== 'owner_attested' || raw.completionEvidence.verifiedByRuntime !== false) fail();
      completionEvidence = { kind: 'owner_attested', note: text(raw.completionEvidence.note, 400), verifiedByRuntime: false };
    } else if (raw.completionEvidence !== null) fail();
    return { id: raw.id, projectId, title: text(raw.title, 160), detail: text(raw.detail, 800, true), state: raw.state, revision: raw.revision, createdAt: date(raw.createdAt), updatedAt: date(raw.updatedAt), createdBy: raw.createdBy, executionAllowed: false, completionEvidence };
  };
  const response = (raw, args) => {
    object(raw);
    if (args.kind === 'list') {
      if (raw.schemaVersion !== 'eclipse.task-list.v1' || raw.projectId !== args.projectId || raw.executionAllowed !== false || !Array.isArray(raw.items) || raw.items.length > 20 || !Number.isInteger(raw.total) || raw.total < raw.items.length || raw.total > 1000 || !(raw.nextCursor === null || Number.isSafeInteger(raw.nextCursor) && raw.nextCursor > args.after)) fail();
      const items = raw.items.map(value => task(value, args.projectId));
      if (new Set(items.map(value => value.id)).size !== items.length) fail();
      return { ok: true, items, total: raw.total, nextCursor: raw.nextCursor, executionAllowed: false };
    }
    if (raw.schemaVersion !== 'eclipse.task.v1') fail();
    const value = task(raw.task, args.projectId);
    if (args.taskId && value.id !== args.taskId) fail();
    if (args.kind !== 'get' && typeof raw.replayed !== 'boolean') fail();
    let events;
    if (args.kind === 'get') {
      if (!Array.isArray(raw.events) || raw.events.length !== value.revision) fail();
      events = raw.events.map((event, index) => {
        if (event.revision !== index + 1 || !['propose', ...actions].includes(event.action) || typeof event.actor !== 'string' || !/^[a-z][a-z0-9-]{1,62}$/.test(event.actor)) fail();
        return { revision: event.revision, action: event.action, actor: event.actor, at: date(event.at) };
      });
    }
    return { ok: true, task: value, ...(events ? { events } : { replayed: raw.replayed }), executionAllowed: false };
  };
  return { projects, request, task, response };
}

module.exports = { createTaskPolicy };
