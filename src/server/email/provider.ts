/**
 * Pluggable email delivery (Phase 11A foundation, docs/15 §17.3).
 *
 * The application depends on this small `EmailProvider` contract, never on a
 * concrete transport. Phase 11A ships two providers:
 *
 *   - `log`  — renders a simulated send to the server log (development only);
 *   - `none` — disables delivery entirely (unconfigured/production default).
 *
 * A real SMTP/API provider is a Phase 13 concern. It will implement the same
 * interface and must read its credentials from environment configuration —
 * never from source (docs/11 §26).
 *
 * Privacy: the `log` provider deliberately records only envelope metadata
 * (recipient, subject length, body length). The subject and body carry the
 * sender's name/message; that personal data must never be copied into logs
 * (docs/14 §28).
 */

export type EmailProviderKind = 'log' | 'none';

/** One plain-text (optionally HTML) message to a single recipient. */
export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

/** Minimal structured logger the providers accept (Fastify's `log` fits). */
export interface EmailLogger {
  info(obj: Record<string, unknown>, message?: string): void;
  warn(obj: Record<string, unknown>, message?: string): void;
}

/**
 * Delivery contract. Implementations either hand the message to a transport
 * or explicitly ignore it; callers treat rejection as a delivery failure.
 */
export interface EmailProvider {
  readonly kind: EmailProviderKind;
  send(message: EmailMessage): Promise<void>;
}

/** Development provider: never sends, records a redacted simulation. */
export class LogEmailProvider implements EmailProvider {
  readonly kind = 'log' as const;

  constructor(private readonly logger: EmailLogger) {}

  async send(message: EmailMessage): Promise<void> {
    this.logger.info(
      {
        emailProvider: this.kind,
        to: message.to,
        subjectLength: message.subject.length,
        textLength: message.text.length,
        hasHtml: message.html !== undefined,
      },
      'Simulated email delivery (EMAIL_PROVIDER=log)',
    );
  }
}

/** Disabled provider: delivery is a no-op while the integration is unset. */
export class NoopEmailProvider implements EmailProvider {
  readonly kind = 'none' as const;

  async send(_message: EmailMessage): Promise<void> {
    // Intentionally does nothing: `none` means "no delivery configured".
  }
}

/** Build the provider selected by configuration. */
export function createEmailProvider(
  kind: EmailProviderKind,
  logger: EmailLogger,
): EmailProvider {
  return kind === 'log' ? new LogEmailProvider(logger) : new NoopEmailProvider();
}
