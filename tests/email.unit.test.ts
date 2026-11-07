/**
 * Phase 11A — email provider foundation (docs/15 §17.3).
 *
 * Pure, database-free characterization of the delivery contract:
 *   - the `log` provider records a redacted simulation, never the body;
 *   - the `none` provider is a true no-op;
 *   - a notification is skipped when no admin recipient is configured;
 *   - delivery failure is swallowed (best-effort) and reported as a warning;
 *   - configuration defaults and validation are explicit.
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { loadConfig } from '@server/config';
import {
  LogEmailProvider,
  NoopEmailProvider,
  type EmailLogger,
  type EmailMessage,
  type EmailProvider,
} from '@server/email/provider';
import {
  buildContactNotification,
  notifyNewContactSubmission,
} from '@server/email/service';

interface LogEntry {
  obj: Record<string, unknown>;
  message?: string;
}

function capturingLogger(entries: LogEntry[]): EmailLogger {
  return {
    info(obj, message) {
      entries.push({ obj, ...(message === undefined ? {} : { message }) });
    },
    warn(obj, message) {
      entries.push({ obj, ...(message === undefined ? {} : { message }) });
    },
  };
}

const SUBMISSION = {
  name: 'Ana Gómez',
  email: 'ana@uci.test',
  message: 'Mensaje privado que nunca debe aparecer en los logs.',
  createdAt: new Date('2026-11-07T12:00:00.000Z'),
};

function message(to = 'ops@uci.test'): EmailMessage {
  return {
    to,
    subject: 'Nuevo mensaje',
    text: 'contenido del correo',
  };
}

describe('email providers', () => {
  test('the log provider records only envelope metadata, never the body', async () => {
    const entries: LogEntry[] = [];
    const provider = new LogEmailProvider(capturingLogger(entries));

    await provider.send(message());

    assert.equal(entries.length, 1);
    assert.equal(entries[0]!.obj.to, 'ops@uci.test');
    assert.equal(entries[0]!.obj.subjectLength, 'Nuevo mensaje'.length);
    assert.equal(entries[0]!.obj.textLength, 'contenido del correo'.length);
    const serialized = JSON.stringify(entries[0]);
    assert.equal(serialized.includes('contenido del correo'), false);
    assert.equal(
      serialized.includes('Nuevo mensaje'),
      false,
      'the subject text is never copied into logs',
    );
  });

  test('the noop provider sends and logs nothing', async () => {
    const entries: LogEntry[] = [];
    const provider = new NoopEmailProvider();
    await provider.send(message());
    assert.equal(entries.length, 0);
    assert.equal(provider.kind, 'none');
  });
});

describe('contact notification', () => {
  test('builds a message addressed to the admin with the submission content', () => {
    const built = buildContactNotification('ops@uci.test', SUBMISSION);
    assert.equal(built.to, 'ops@uci.test');
    assert.ok(built.subject.includes('Ana Gómez'));
    assert.ok(built.text.includes('ana@uci.test'));
    assert.ok(built.text.includes(SUBMISSION.message));
  });

  test('is skipped when no recipient is configured', async () => {
    let called = false;
    const result = await notifyNewContactSubmission(
      { provider: 'log', contactNotifyTo: null },
      SUBMISSION,
      capturingLogger([]),
      () => {
        called = true;
        return new NoopEmailProvider();
      },
    );
    assert.equal(result, false);
    assert.equal(called, false, 'no provider is built without a recipient');
  });

  test('is skipped when delivery is disabled', async () => {
    const result = await notifyNewContactSubmission(
      { provider: 'none', contactNotifyTo: 'ops@uci.test' },
      SUBMISSION,
      capturingLogger([]),
    );
    assert.equal(result, false);
  });

  test('delivers through the configured provider and reports success', async () => {
    const entries: LogEntry[] = [];
    const result = await notifyNewContactSubmission(
      { provider: 'log', contactNotifyTo: 'ops@uci.test' },
      SUBMISSION,
      capturingLogger(entries),
    );
    assert.equal(result, true);
    assert.equal(entries.length, 1);
  });

  test('a delivery failure is swallowed and reported as a warning', async () => {
    const entries: LogEntry[] = [];
    const failing: EmailProvider = {
      kind: 'log',
      async send() {
        throw new Error('smtp down');
      },
    };

    const result = await notifyNewContactSubmission(
      { provider: 'log', contactNotifyTo: 'ops@uci.test' },
      SUBMISSION,
      capturingLogger(entries),
      () => failing,
    );

    assert.equal(result, false, 'a rejection must never escape to the route');
    assert.equal(entries.length, 1);
    assert.ok(entries[0]!.message?.includes('best-effort'));
    assert.equal(
      JSON.stringify(entries[0]).includes(SUBMISSION.message),
      false,
      'the failure log must not leak the message body',
    );
  });
});

describe('email configuration', () => {
  test('defaults to log outside production and none in production', () => {
    assert.equal(
      loadConfig({ NODE_ENV: 'development' }).email.provider,
      'log',
    );
    assert.equal(loadConfig({ NODE_ENV: 'test' }).email.provider, 'log');
    assert.equal(
      loadConfig({ NODE_ENV: 'production' }).email.provider,
      'none',
    );
  });

  test('reads and normalizes CONTACT_NOTIFY_TO', () => {
    const config = loadConfig({
      NODE_ENV: 'test',
      CONTACT_NOTIFY_TO: '  OPS@UCI.TEST ',
    });
    assert.equal(config.email.contactNotifyTo, 'ops@uci.test');
  });

  test('rejects an invalid provider or recipient', () => {
    assert.throws(
      () => loadConfig({ NODE_ENV: 'test', EMAIL_PROVIDER: 'smtp' }),
      /EMAIL_PROVIDER/,
    );
    assert.throws(
      () => loadConfig({ NODE_ENV: 'test', CONTACT_NOTIFY_TO: 'not-an-email' }),
      /CONTACT_NOTIFY_TO/,
    );
  });
});
