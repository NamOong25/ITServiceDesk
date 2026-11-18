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
