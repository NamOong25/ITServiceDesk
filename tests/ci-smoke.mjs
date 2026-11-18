import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';

const backend = 'http://127.0.0.1:18081';
const incidentPath = '/api/incidents';
const itIncidentPath = '/api/it/incidents';
const accessPath = '/api/access-requests';
const itAccessPath = '/api/it/access-requests';
const managerAccessPath = '/api/manager/access-requests';
const vietnamClock = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Ho_Chi_Minh', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});

function vietnamTime(instant) {
  const parts = Object.fromEntries(vietnamClock.formatToParts(new Date(instant)).map(({ type, value }) => [type, value]));
  return parts.weekday + ' ' + parts.hour + ':' + parts.minute;
}

async function login(email, role) {
  const cookies = new Map();

  async function request(path, options, expectedStatus) {
    const headers = new Headers(options.headers);
    if (cookies.size) {
      headers.set('Cookie', [...cookies].map(([name, value]) => name + '=' + value).join('; '));
    }
    const response = await fetch(backend + path, {
      ...options, headers, redirect: 'manual', signal: AbortSignal.timeout(5000),
    });
    for (const cookie of response.headers.getSetCookie()) {
      const pair = cookie.split(';', 1)[0];
      const separator = pair.indexOf('=');
      cookies.set(pair.slice(0, separator), pair.slice(separator + 1));
    }
    assert.equal(response.status, expectedStatus, (options.method ?? 'GET') + ' ' + path + ' for ' + role);
    return response.status !== 204 && response.ok ? response.json() : undefined;
  }

  async function post(path, expectedStatus, data) {
    const csrf = await request('/api/auth/csrf', {}, 200);
    const form = data instanceof URLSearchParams;
    const headers = { [csrf.headerName]: csrf.token };
    if (data !== undefined) {
      headers['Content-Type'] = form ? 'application/x-www-form-urlencoded' : 'application/json';
    }
    const body = form || data === undefined ? data : JSON.stringify(data);
    return request(path, { method: 'POST', headers, body }, expectedStatus);
  }

  await post('/api/auth/login', 204, new URLSearchParams({ email, password: 'DemoItsd-2026!' }));
  const account = await request('/api/auth/me', {}, 200);
  assert.equal(account.role, role);
  return { get: (path, expectedStatus = 200) => request(path, {}, expectedStatus), post };
}

test('IT Service Desk API', { timeout: 60_000 }, async (suite) => {
  const employee = await login('nhanvien@itsd.example', 'EMPLOYEE');
  const otherEmployee = await login('ci-observer@itsd.example', 'EMPLOYEE');
  const it = await login('it@itsd.example', 'IT');
  const manager = await login('quanly@itsd.example', 'MANAGER');
  const secondIt = await login('it2@itsd.example', 'IT');

  await suite.test('SLA counts working hours across the weekend', async () => {
    const queue = await it.get(itIncidentPath);
    const sample = queue.find((item) => item.title === '[Demo SLA] Không kết nối được VPN');
    assert.ok(sample, 'Expected the weekend incident from the portfolio profile');
    const { ticket, sla, activity } = await it.get(itIncidentPath + '/' + sample.id);
    assert.equal(vietnamTime(ticket.createdAt), 'Fri 16:30');
    assert.equal(vietnamTime(sla.dueAt), 'Mon 09:30');
    assert.equal(vietnamTime(sla.firstReplyAt), 'Mon 09:12');
    assert.equal(sla.state, 'ON_TIME');
    assert.equal(sla.minutes, 18);
    assert.deepEqual(sla.periods.map(({ start, end }) => (Date.parse(end) - Date.parse(start)) / 60_000), [30, 90]);
    assert.ok(activity.some((event) =>
      event.kind === 'INTERNAL_NOTE' && Date.parse(event.createdAt) < Date.parse(sla.firstReplyAt)));
  });

  await suite.test('IT can claim access requests only after manager approval', async () => {
    const created = await employee.post(accessPath, 201, {
      systemName: 'CI design workspace', requestedPermission: 'Edit',
      reason: 'Review the portfolio demo', submissionKey: randomUUID(),
    });
    assert.equal(created.status, 'PENDING');
    const itRequest = itAccessPath + '/' + created.id;
    const decision = managerAccessPath + '/' + created.id + '/decision';
    await it.get(itRequest, 404);
    await it.post(itRequest + '/claim', 404);
    await employee.post(decision, 403, { outcome: 'APPROVED' });
    await manager.post(decision, 204, { outcome: 'APPROVED' });
    await it.post(itRequest + '/claim', 204);
    await it.post(itRequest + '/complete', 204);
    const finished = await employee.get(accessPath + '/' + created.id);
    assert.equal(finished.status, 'FULFILLED');
    assert.equal(finished.assignee, 'it@itsd.example');
  });

  await suite.test('An incident handoff grants ownership once and preserves the first-reply SLA', async () => {
    const created = await employee.post(incidentPath, 201, {
      title: 'CI warehouse scanner handoff', description: 'The scanner disconnects after every label.',
      impact: 'TEAM', category: 'DEVICE', submissionKey: randomUUID(),
    });
    const request = itIncidentPath + '/' + created.id;
    const handoff = { recipient: 'it2@itsd.example', reason: 'The next shift handles warehouse devices.',
      submissionKey: randomUUID() };
    await it.post(request + '/claim', 204);
    await it.post(request + '/messages', 204, {
      kind: 'PUBLIC_REPLY', body: 'We are investigating the scanner.', submissionKey: randomUUID(),
    });
    const initial = await it.get(request);
    assert.ok(initial.transferOptions.includes(handoff.recipient));
    assert.deepEqual((await secondIt.get(request)).transferOptions, []);
    await employee.post(request + '/transfer', 403, handoff);
    await secondIt.post(request + '/transfer', 403, { ...handoff, recipient: 'it@itsd.example' });
    await it.post(request + '/transfer', 400, { ...handoff, recipient: 'quanly@itsd.example' });
    await it.post(request + '/transfer', 400, { ...handoff, recipient: 'it@itsd.example' });
    await it.post(request + '/transfer', 400, { ...handoff, reason: '   ' });
    await it.post(request + '/transfer', 204, handoff);
    await it.post(request + '/transfer', 204, handoff);
    await it.post(request + '/transfer', 409, { ...handoff, reason: 'Different reason.' });
    await it.post(request + '/resolve', 403);

    const assigned = await secondIt.get(request);
    assert.equal(assigned.ticket.status, 'IN_PROGRESS');
    assert.equal(assigned.ticket.assignee, handoff.recipient);
    assert.equal(assigned.sla.firstReplyAt, initial.sla.firstReplyAt);
    assert.equal(assigned.sla.dueAt, initial.sla.dueAt);
    const events = assigned.activity.filter(event => event.kind === 'TRANSFERRED');
    assert.equal(events.length, 1);
    assert.equal(events[0].actor, 'it@itsd.example');
    assert.equal(events[0].recipient, handoff.recipient);
    assert.equal(events[0].body, handoff.reason);
    const employeeView = await employee.get(incidentPath + '/' + created.id);
    assert.equal(employeeView.assignee, handoff.recipient);
    assert.ok(employeeView.activity.every(event => event.kind !== 'TRANSFERRED'));
    await secondIt.post(request + '/messages', 204, {
      kind: 'PUBLIC_REPLY', body: 'The scanner is working again.', submissionKey: randomUUID(),
    });
    await secondIt.post(request + '/resolve', 204);
    const completed = await secondIt.get(request);
    assert.equal(completed.ticket.status, 'RESOLVED');
    assert.equal(completed.sla.firstReplyAt, initial.sla.firstReplyAt);
  });

  await suite.test('Waiting for the requester pauses the resolution SLA and keeps the first reply', async () => {
    const created = await employee.post(incidentPath, 201, {
      title: 'CI missing printer error code', description: 'The shared printer shows an error.',
      impact: 'TEAM', category: 'DEVICE', submissionKey: randomUUID(),
    });
    const request = itIncidentPath + '/' + created.id;
    const customer = incidentPath + '/' + created.id;
    const ask = { kind: 'WAIT_REQUESTED', body: 'Can you send the error code?', submissionKey: randomUUID() };
    const initial = await it.get(request);
    assert.equal(initial.resolutionSla.targetMinutes, 480);
    assert.equal(initial.resolutionSla.state, 'ACTIVE');
    await it.post(request + '/claim', 204);
    await secondIt.post(request + '/messages', 403, ask);
    await it.post(request + '/messages', 204, ask);
    await it.post(request + '/messages', 204, ask);
    await it.post(request + '/messages', 409, { ...ask, submissionKey: randomUUID() });
    await it.post(request + '/messages', 204, {
      kind: 'INTERNAL_NOTE', body: 'Checking the printer logs.', submissionKey: randomUUID(),
    });
    const paused = await it.get(request);
    assert.equal(paused.ticket.status, 'WAITING_CUSTOMER');
    assert.equal(paused.resolutionSla.state, 'PAUSED');
    assert.equal(paused.resolutionSla.dueAt, null);
    const questions = paused.activity.filter(event => event.kind === 'WAIT_REQUESTED');
    assert.equal(questions.length, 1);
    assert.equal(Date.parse(paused.sla.firstReplyAt), Date.parse(questions[0].createdAt));
    assert.deepEqual(paused.resolutionSla, (await it.get(request)).resolutionSla);
    const queue = await it.get(itIncidentPath);
    assert.equal(queue.find(item => item.id === created.id).sla.firstReplyAt, paused.sla.firstReplyAt);
    const waiting = await employee.get(customer);
    assert.equal(waiting.status, 'WAITING_CUSTOMER');
    const managerDetail = await manager.get('/api/manager/incidents/' + created.id);
    assert.equal(managerDetail.ticket.status, 'WAITING_CUSTOMER');
    assert.deepEqual(managerDetail.resolutionSla, paused.resolutionSla);
    assert.equal(managerDetail.sla.firstReplyAt, paused.sla.firstReplyAt);
    assert.ok(managerDetail.activity.some(event => event.body === ask.body));
    assert.ok(managerDetail.activity.every(event => event.kind !== 'INTERNAL_NOTE'));
    const overview = await manager.get('/api/manager/overview?days=90');
    const waitingRow = overview.issues.find(issue => issue.id === created.id);
    assert.equal(waitingRow.status, 'WAITING_CUSTOMER');
    assert.equal(waitingRow.resolutionSla.state, 'PAUSED');
    assert.equal(waitingRow.replyState, paused.sla.state);
    assert.ok(waiting.activity.some(event => event.body === ask.body));
    assert.ok(waiting.activity.every(event => event.kind !== 'INTERNAL_NOTE'));
    const reply = { body: 'Error code E3.', submissionKey: randomUUID() };
    await otherEmployee.post(customer + '/messages', 404, reply);
    const answered = await employee.post(customer + '/messages', 200, reply);
    assert.equal(answered.status, 'IN_PROGRESS');
    await employee.post(customer + '/messages', 200, reply);

    const resumed = await it.get(request);
    assert.equal(resumed.ticket.assignee, 'it@itsd.example');
    assert.equal(resumed.resolutionSla.state, 'ACTIVE');
    assert.ok(resumed.resolutionSla.dueAt);
    assert.equal(resumed.sla.firstReplyAt, paused.sla.firstReplyAt);
    const nextQuestion = { ...ask, submissionKey: randomUUID() };
    await it.post(request + '/messages', 204, nextQuestion);
    await employee.post(customer + '/messages', 200, reply);
    assert.equal((await it.get(request)).ticket.status, 'WAITING_CUSTOMER');
    await it.post(request + '/transfer', 204, {
      recipient: 'it2@itsd.example', reason: 'Next shift continues the investigation.', submissionKey: randomUUID(),
    });
    const transferred = await secondIt.get(request);
    assert.equal(transferred.resolutionSla.state, 'PAUSED');
    const managerAfterHandoff = await manager.get('/api/manager/incidents/' + created.id);
    assert.equal(managerAfterHandoff.ticket.assignee, 'it2@itsd.example');
    assert.ok(managerAfterHandoff.activity.every(event => event.kind !== 'TRANSFERRED'));
    await secondIt.post(request + '/priority', 204, { priority: 'HIGH' });
    await secondIt.post(request + '/resolve', 204);
    const resolved = await secondIt.get(request);
    assert.equal(resolved.resolutionSla.targetMinutes, 480);
    assert.equal(resolved.resolutionSla.state, 'ON_TIME');
    assert.ok(resolved.resolutionSla.resolvedAt);
    const lastResolution = resolved.activity.find(event => event.kind === 'RESOLVED');
    await employee.post(customer + '/resolution-feedback', 200, {
      resolutionId: lastResolution.id, decision: 'REOPENED', body: 'The error returned.', submissionKey: randomUUID(),
    });
    const reopened = await secondIt.get(request);
    assert.equal(reopened.resolutionSla.state, 'ACTIVE');
    assert.ok(reopened.resolutionSla.usedMinutes >= resolved.resolutionSla.usedMinutes);
    assert.equal(reopened.sla.firstReplyAt, paused.sla.firstReplyAt);
  });

  await suite.test('In-app notifications target the right account and are read once', async () => {
    const inbox = '/api/notifications';
    async function itemFor(user, id, kind) {
      const overview = await user.get(inbox);
      const matches = overview.items.filter(item => item.resourceId === id && item.kind === kind);
      assert.equal(matches.length, 1, 'One notification for ' + kind);
      return matches[0];
    }

    const submitted = { systemName: 'CI notifications approved workspace', requestedPermission: 'View',
      reason: 'Test notifications', submissionKey: randomUUID() };
    const [access, repeated] = await Promise.all([
      employee.post(accessPath, 201, submitted), employee.post(accessPath, 201, submitted),
    ]);
    assert.equal(access.id, repeated.id);
    const pending = await itemFor(manager, access.id, 'ACCESS_SUBMITTED');
    assert.equal(pending.title, submitted.systemName);
    assert.equal(pending.unread, true);
    assert.equal((await it.get(inbox)).items.some(item => item.id === pending.id), false);
    await it.post(inbox + '/' + pending.id + '/read', 404);
    const before = (await manager.get(inbox)).unreadCount;
    await manager.post(inbox + '/' + pending.id + '/read', 204);
    await manager.post(inbox + '/' + pending.id + '/read', 204);
    assert.equal((await manager.get(inbox)).unreadCount, before - 1);
    assert.equal((await itemFor(manager, access.id, 'ACCESS_SUBMITTED')).unread, false);
    const decision = managerAccessPath + '/' + access.id + '/decision';
    await manager.post(decision, 204, { outcome: 'APPROVED' });
    await manager.post(decision, 204, { outcome: 'APPROVED' });
    const approved = await itemFor(employee, access.id, 'ACCESS_APPROVED');

    const rejected = await employee.post(accessPath, 201, {
      ...submitted, systemName: 'CI notifications rejected workspace', submissionKey: randomUUID(),
    });
    await manager.post(managerAccessPath + '/' + rejected.id + '/decision', 204, {
      outcome: 'REJECTED', note: 'Scope exceeds the request.',
    });
    const denied = await itemFor(employee, rejected.id, 'ACCESS_REJECTED');
    const older = await employee.get(inbox + '?before=' + denied.id);
    assert.ok(older.items.some(item => item.id === approved.id) && older.items.every(item => item.id < denied.id));

    const ticket = await employee.post(incidentPath, 201, {
      title: 'CI notifications scanner', description: 'A scanner has stopped working.',
      impact: 'TEAM', category: 'DEVICE', submissionKey: randomUUID(),
    });
    const work = itIncidentPath + '/' + ticket.id;
    await it.post(work + '/claim', 204);
    const ask = { kind: 'WAIT_REQUESTED', body: 'Can you send the scanner model?', submissionKey: randomUUID() };
    await it.post(work + '/messages', 204, ask);
    await it.post(work + '/messages', 204, ask);
    await it.post(work + '/messages', 204, {
      kind: 'INTERNAL_NOTE', body: 'Internal details.', submissionKey: randomUUID(),
    });
    await itemFor(employee, ticket.id, 'WAIT_REQUESTED');
    const transfer = { recipient: 'it2@itsd.example', reason: 'Handoff to the next shift.', submissionKey: randomUUID() };
    await it.post(work + '/transfer', 204, transfer);
    await it.post(work + '/transfer', 204, transfer);
    await itemFor(secondIt, ticket.id, 'TRANSFERRED');
    const reply = { body: 'Scanner model A.', submissionKey: randomUUID() };
    await employee.post(incidentPath + '/' + ticket.id + '/messages', 200, reply);
    await employee.post(incidentPath + '/' + ticket.id + '/messages', 200, reply);
    await itemFor(secondIt, ticket.id, 'REQUESTER_REPLY');
    assert.ok((await it.get(inbox)).items.every(item => item.kind !== 'REQUESTER_REPLY' || item.resourceId !== ticket.id));
    await secondIt.post(work + '/resolve', 204);
    await secondIt.post(work + '/resolve', 204);
    await itemFor(employee, ticket.id, 'RESOLVED');
    const employeeEvents = (await employee.get(inbox)).items.filter(item => item.resourceId === ticket.id
      && !item.kind.startsWith('ACCESS_'));
    assert.deepEqual(employeeEvents.map(item => item.kind), ['RESOLVED', 'WAIT_REQUESTED']);
    assert.ok((await otherEmployee.get(inbox)).items.length === 0);
  });

  await suite.test('IT publishes a guide and the employee can attach it to a new incident', async () => {
    const source = await employee.post(incidentPath, 201, {
      title: 'CI VPN guide source', description: 'Private case context that should stay in the incident.',
      impact: 'TEAM', category: 'NETWORK', submissionKey: randomUUID(),
    });
    const fromIncident = '/api/it/knowledge/from-incident/' + source.id;
    await employee.post(fromIncident, 403);
    await it.post(fromIncident, 409);
    await it.post(itIncidentPath + '/' + source.id + '/claim', 204);
    await it.post(itIncidentPath + '/' + source.id + '/resolve', 204);
    const draft = await it.post(fromIncident, 200);
    assert.equal(draft.body, '');
    assert.equal(draft.publishedAt, null);
    assert.equal((await secondIt.post(fromIncident, 200)).id, draft.id);
    const publicArticle = '/api/knowledge/' + draft.id;
    await employee.get(publicArticle, 404);
    assert.ok((await employee.get('/api/knowledge')).every(article => article.id !== draft.id));
    const report = { title: 'CI VPN issue after following the guide', description: 'Still fails after retry.',
      impact: 'PERSONAL', category: 'NETWORK', knowledgeArticleId: draft.id, submissionKey: randomUUID() };
    await employee.post(incidentPath, 400, report);
    const edit = '/api/it/knowledge/' + draft.id + '/edit';
    const content = { title: 'Reconnect to the VPN', category: 'NETWORK', body: '1. Disconnect.\n2. Reconnect.',
      revision: draft.revision, publish: false };
    await employee.post(edit, 403, content);
    await it.post(edit, 400, { ...content, body: ' ', publish: true });
    const saved = await it.post(edit, 200, content);
    assert.equal(saved.publishedAt, null);
    await it.post(edit, 409, { ...content, publish: true });
    await secondIt.post(edit, 200, { ...content, revision: saved.revision, publish: true });
    const article = await employee.get(publicArticle);
    assert.equal(article.body, content.body);
    assert.ok(article.publishedAt);
    assert.equal(article.sourceIncidentId, undefined);
    assert.ok((await employee.get('/api/knowledge')).some(item => item.id === draft.id));

    const created = await employee.post(incidentPath, 201, report);
    assert.equal(created.knowledgeArticleId, draft.id);
    assert.equal((await employee.post(incidentPath, 201, report)).id, created.id);
    await employee.post(incidentPath, 409, { ...report, knowledgeArticleId: null });
    const employeeView = await employee.get(incidentPath + '/' + created.id);
    assert.equal(employeeView.knowledgeArticleTitle, content.title);
    const itView = await it.get(itIncidentPath + '/' + created.id);
    assert.equal(itView.ticket.knowledgeArticleId, draft.id);
    assert.equal(itView.ticket.knowledgeArticleTitle, content.title);
  });

  await suite.test('Only the assigned employee can attach a device, and IT can browse its incident history', async () => {
    const root = '/api/it/assets';
    const mine = '/api/assets/mine';
    const staff = await it.get(root + '/assignees');
    const owner = staff.find(person => person.email === 'nhanvien@itsd.example');
    const other = staff.find(person => person.email === 'ci-observer@itsd.example');
    assert.ok(owner && other);
    const seed = (await it.get(root)).find(asset => asset.code === 'DEMO-LT-01');
    assert.ok(seed);
    assert.ok((await it.get(root + '/' + seed.id)).history.some(issue => issue.title.includes('pin')));

    const draft = { code: 'ci-laptop-01', name: 'CI Laptop', kind: 'LAPTOP',
      status: 'IN_USE', assignedToId: owner.id };
    await employee.post(root, 403, draft);
    await it.post(root, 400, { ...draft, assignedToId: null });
    const asset = await it.post(root, 201, draft);
    assert.equal(asset.code, 'CI-LAPTOP-01');
    await it.post(root, 409, draft);
    await employee.get(root + '/' + asset.id, 403);
    await manager.get(root + '/' + asset.id, 403);
    await it.get(mine, 403);
    assert.ok((await employee.get(mine)).some(item => item.id === asset.id));
    assert.ok((await otherEmployee.get(mine)).every(item => item.id !== asset.id));

    const report = { title: 'CI connected laptop power issue', description: 'The laptop shuts down.',
      impact: 'PERSONAL', category: 'DEVICE', assetId: asset.id, submissionKey: randomUUID() };
    await otherEmployee.post(incidentPath, 400, report);
    const created = await employee.post(incidentPath, 201, report);
    assert.equal(created.assetCode, asset.code);
    const itDetail = await it.get(itIncidentPath + '/' + created.id);
    assert.equal(itDetail.ticket.assetId, asset.id);
    const edit = root + '/' + asset.id + '/edit';
    const reassigned = await secondIt.post(edit, 200, { ...draft, assignedToId: other.id, revision: asset.revision });
    assert.equal(reassigned.assignee, other.email);
    await it.post(edit, 409, { ...draft, revision: asset.revision });
    assert.ok((await employee.get(mine)).every(item => item.id !== asset.id));
    assert.ok((await otherEmployee.get(mine)).some(item => item.id === asset.id));
    await employee.post(incidentPath, 400, { ...report, submissionKey: randomUUID() });
    assert.equal((await employee.post(incidentPath, 201, report)).id, created.id);
    assert.equal((await employee.get(incidentPath + '/' + created.id)).assetId, asset.id);
    const second = await otherEmployee.post(incidentPath, 201, { ...report, submissionKey: randomUUID() });
    const history = await it.get(root + '/' + asset.id);
    assert.equal(history.asset.incidentCount, 2);
    assert.deepEqual(history.history.map(issue => issue.id), [second.id, created.id]);

    await it.post(edit, 200, { ...draft, status: 'MAINTENANCE', assignedToId: null, revision: reassigned.revision });
    assert.ok((await otherEmployee.get(mine)).every(item => item.id !== asset.id));
    assert.equal((await it.get(root + '/' + asset.id)).history.length, 2);
  });

  await suite.test('Manager dashboard separates SLA counters and only exposes team incidents', async () => {
    const foreign = await otherEmployee.post(incidentPath, 201, {
      title: 'CI unrelated employee incident', description: 'Outside this manager’s team.',
      impact: 'TEAM', category: 'DEVICE', submissionKey: randomUUID(),
    });
    const route = '/api/manager/incidents/';
    const overview = await manager.get('/api/manager/overview?days=90');
    assert.equal(overview.issues.length, overview.totalIncidents);
    assert.equal(overview.overdueCount, overview.issues.filter(issue => issue.replyState === 'OVERDUE').length);
    assert.equal(overview.overdueResolutionCount, overview.issues.filter(issue => issue.resolutionOverdue).length);
    assert.equal(overview.waitingForEmployee, overview.issues.filter(issue => issue.status === 'WAITING_CUSTOMER').length);
    assert.ok(overview.issues.some(issue => issue.resolutionOverdue && issue.replyState === 'ON_TIME'));
    assert.ok(overview.issues.every(issue => issue.id !== foreign.id));
    const owned = overview.issues.find(issue => issue.title.startsWith('[Demo SLA]'));
    assert.ok(owned);
    await manager.get(route + foreign.id, 404);
    await it.get(route + owned.id, 403);
    await employee.get(route + owned.id, 403);
    await manager.post(route + owned.id, 403);
    const detail = await manager.get(route + owned.id);
    assert.equal(detail.ticket.id, owned.id);
    assert.equal(detail.sla.state, 'ON_TIME');
    assert.equal(detail.resolutionSla.state, 'ON_TIME');
    assert.ok(detail.activity.some(event => event.kind === 'PUBLIC_REPLY'));
    assert.ok(detail.activity.every(event => event.kind !== 'INTERNAL_NOTE'));
  });

  await suite.test('The requester can reopen with the original assignee and first reply', async () => {
    const created = await employee.post(incidentPath, 201, {
      title: 'CI VPN incident', description: 'The VPN drops while working remotely.',
      impact: 'PERSONAL', category: 'NETWORK', submissionKey: randomUUID(),
    });
    const itRequest = itIncidentPath + '/' + created.id;
    const employeeRequest = incidentPath + '/' + created.id;
    await it.post(itRequest + '/claim', 204);
    await it.post(itRequest + '/messages', 204, {
      kind: 'PUBLIC_REPLY', body: 'Please try reconnecting.', submissionKey: randomUUID(),
    });
    await it.post(itRequest + '/resolve', 204);
    const initial = await it.get(itRequest);
    assert.equal(initial.ticket.status, 'RESOLVED');
    assert.ok(initial.sla.firstReplyAt);
    const resolution = initial.activity.find((event) => event.kind === 'RESOLVED');
    assert.ok(resolution);
    const feedback = {
      resolutionId: resolution.id, decision: 'REOPENED',
      body: 'The VPN still drops.', submissionKey: randomUUID(),
    };
    const endpoint = employeeRequest + '/resolution-feedback';
    await otherEmployee.post(endpoint, 404, feedback);
    await it.post(endpoint, 403, feedback);
    await employee.post(endpoint, 200, feedback);
    await employee.post(endpoint, 200, feedback);

    const reopened = await it.get(itRequest);
    assert.equal(reopened.ticket.status, 'IN_PROGRESS');
    assert.equal(reopened.ticket.assignee, initial.ticket.assignee);
    assert.equal(reopened.sla.firstReplyAt, initial.sla.firstReplyAt);
    assert.equal(reopened.sla.dueAt, initial.sla.dueAt);
    const history = reopened.activity.filter((event) => event.kind === 'REOPENED');
    assert.equal(history.length, 1);
    assert.equal(history[0].body, feedback.body);
  });
});
