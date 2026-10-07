import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { afterEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ spawn: vi.fn() }));
vi.mock('electron', () => ({ app: { isPackaged: false, getAppPath: () => '/desktop' } }));
vi.mock('node:child_process', () => ({ spawn: mocks.spawn }));
vi.mock('node:os', () => ({ release: () => '23.0.0' }));

import { createComputerControl } from './computer-control';

class Worker extends EventEmitter {
  stdin = new PassThrough();
  stdout = new PassThrough();
  stderr = new PassThrough();
  kill = vi.fn();
  requests: { id: string; method: string; sessionID: string; input: Record<string, unknown> }[] =
    [];
  constructor() {
    super();
    this.stdin.on('data', (line: Buffer) => this.requests.push(JSON.parse(line.toString())));
  }
  reply(value: unknown) {
    const line = `${JSON.stringify(value)}\n`;
    // Pipe chunk boundaries do not necessarily coincide with protocol lines.
    this.stdout.write(line.slice(0, 7));
    this.stdout.write(line.slice(7));
  }
}

afterEach(() => vi.clearAllMocks());

it.runIf(process.platform === 'darwin')(
  'cancels queued work and discards an active worker without replaying input',
  async () => {
    const first = new Worker();
    const second = new Worker();
    mocks.spawn.mockReturnValueOnce(first).mockReturnValueOnce(second);
    const control = createComputerControl();
    const running = new AbortController();
    const cancelled = new AbortController();
    const call = (method: string) => ({ sessionID: 'session', method, input: { app: 'fixture' } });
    const active = control.handle(call('computer.type'), running.signal);
    const activeFailure = expect(active).rejects.toThrow('partial input');
    const queued = control.handle(call('computer.press'), cancelled.signal);
    const queuedFailure = expect(queued).rejects.toThrow('before execution');
    const remaining = control.handle(call('computer.state'), new AbortController().signal);
    cancelled.abort();
    running.abort();
    await Promise.all([activeFailure, queuedFailure]);
    expect(first.requests.map((request) => request.method)).toEqual(['computer.type']);
    expect(first.kill).toHaveBeenCalledWith('SIGTERM');
    expect(mocks.spawn).toHaveBeenCalledTimes(1);
    first.emit('close', 0);
    expect(second.requests.map((request) => request.method)).toEqual(['computer.state']);
    second.reply({ id: second.requests[0]!.id, result: { snapshotID: 'fresh-worker' } });
    expect((await remaining).content).toEqual([
      { type: 'text', text: '{"snapshotID":"fresh-worker"}' },
    ]);
    const closing = control.close();
    second.emit('close', 0);
    await closing;
  },
);

it.runIf(process.platform === 'darwin')(
  'allows native permission requests only through the trusted Settings API',
  async () => {
    const control = createComputerControl();
    await expect(
      control.handle(
        {
          sessionID: 'desktop-permissions',
          method: 'computer.request_permissions',
          input: { kind: 'accessibility' },
        },
        new AbortController().signal,
      ),
    ).rejects.toThrow('trusted desktop Settings');
    expect(mocks.spawn).not.toHaveBeenCalled();

    for (const kind of ['accessibility', 'screenRecording'] as const) {
      const worker = new Worker();
      mocks.spawn.mockReturnValueOnce(worker);
      const requested = control.requestPermissions(kind);
      await Promise.resolve();
      const call = worker.requests.at(-1)!;
      expect(call).toMatchObject({
        sessionID: 'desktop-permissions',
        method: 'computer.request_permissions',
        input: { kind },
      });
      await expect(
        control.handle(
          { sessionID: 'session', method: 'computer.status', input: {} },
          new AbortController().signal,
        ),
      ).rejects.toThrow('setup is in progress');
      worker.reply({ id: call.id, result: { requested: kind, granted: false } });
      await vi.waitFor(() => expect(worker.kill).toHaveBeenCalledWith('SIGTERM'));
      worker.emit('close', 0);
      await requested;
    }
    expect(mocks.spawn).toHaveBeenCalledTimes(2);
    await control.close();
  },
);

it.runIf(process.platform === 'darwin')(
  'rotates idle workers around a Settings request without ever interrupting active input',
  async () => {
    const first = new Worker();
    const second = new Worker();
    const third = new Worker();
    mocks.spawn.mockReturnValueOnce(first).mockReturnValueOnce(second).mockReturnValueOnce(third);
    const control = createComputerControl();
    const input = control.handle(
      { sessionID: 'session', method: 'computer.type', input: { app: 'fixture', text: 'hello' } },
      new AbortController().signal,
    );
    await expect(control.requestPermissions('accessibility')).rejects.toThrow('busy');
    expect(first.kill).not.toHaveBeenCalled();
    first.reply({ id: first.requests[0]!.id, result: { performed: 'type' } });
    await input;

    const requested = control.requestPermissions('accessibility');
    expect(first.kill).toHaveBeenCalledWith('SIGTERM');
    first.emit('close', 0);
    await Promise.resolve();
    expect(second.requests[0]?.method).toBe('computer.request_permissions');
    second.reply({
      id: second.requests[0]!.id,
      result: { requested: 'accessibility', granted: true },
    });
    await vi.waitFor(() => expect(second.kill).toHaveBeenCalledWith('SIGTERM'));
    second.emit('close', 0);
    await requested;
    const refreshed = control.handle(
      { sessionID: 'desktop-status', method: 'computer.status', input: {} },
      new AbortController().signal,
    );
    expect(third.requests[0]?.method).toBe('computer.status');
    third.reply({
      id: third.requests[0]!.id,
      result: { supported: true, accessibility: true, screenRecording: true },
    });
    expect((await refreshed).content).toEqual([
      { type: 'text', text: '{"supported":true,"accessibility":true,"screenRecording":true}' },
    ]);
    const closing = control.close();
    third.emit('close', 0);
    await closing;
  },
);

it.runIf(process.platform === 'darwin')(
  'rejects mismatched response IDs and stops the helper rather than accepting stale results',
  async () => {
    const worker = new Worker();
    mocks.spawn.mockReturnValueOnce(worker);
    const control = createComputerControl();
    const pending = control.handle(
      { sessionID: 'session', method: 'computer.click', input: { app: 'fixture', x: 1, y: 2 } },
      new AbortController().signal,
    );
    const failure = expect(pending).rejects.toThrow('invalid response');
    worker.reply({ id: 'other-request', result: { performed: 'click' } });
    await failure;
    expect(worker.kill).toHaveBeenCalledWith('SIGTERM');
    const closing = control.close();
    worker.emit('close', 0);
    await closing;
  },
);
