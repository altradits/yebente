/**
 * Provider errors. Every capability that has no working implementation
 * fails with one of these, clearly and honestly, instead of faking
 * success or failing silently.
 *
 * - *Unavailable / NotConfigured: nothing to talk to. HTTP 501 and a
 *   "not available yet" message.
 * - *Rejected: a definitive no (bad number, bad amount, unknown
 *   account). Safe to show; retrying changes nothing.
 * - *Unknown: the answer was unclear (timeout, garbled reply). Never
 *   treated as success or failure; the caller may ask again.
 */
export class ProviderError extends Error {
  readonly code: string;
  readonly httpStatus: number;
  readonly retryable: boolean;

  constructor(code: string, message: string, httpStatus = 500, retryable = false) {
    super(message);
    this.name = new.target.name;
    this.code = code;
    this.httpStatus = httpStatus;
    this.retryable = retryable;
  }
}

export class ChainUnavailable extends ProviderError {
  constructor(detail?: string) {
    super(
      'CHAIN_UNAVAILABLE',
      detail || 'Bitcoin chain provider is not available yet: no Bitcoin Core node is configured or reachable.',
      501,
      true,
    );
  }
}

export class ChainRejected extends ProviderError {
  constructor(reason: string) {
    super('CHAIN_REJECTED', reason, 400, false);
  }
}

export class LightningUnavailable extends ProviderError {
  constructor(detail?: string) {
    super(
      'LIGHTNING_UNAVAILABLE',
      detail || 'Lightning provider is not available yet: no LND node is configured or reachable.',
      501,
      true,
    );
  }
}

export class PriceUnavailable extends ProviderError {
  constructor(detail?: string) {
    super(
      'PRICE_UNAVAILABLE',
      detail || 'Price provider is not available yet: no rate is configured.',
      501,
      true,
    );
  }
}

export class FiatNotConfigured extends ProviderError {
  constructor(rail: string) {
    super(
      'FIAT_NOT_CONFIGURED',
      `Fiat rail "${rail}" is not available yet: no adapter is configured for it.`,
      501,
      false,
    );
  }
}

export class FiatRejected extends ProviderError {
  constructor(reason: string) {
    super('FIAT_REJECTED', reason, 400, false);
  }
}

export class FiatUnknown extends ProviderError {
  constructor(reason?: string) {
    super(
      'FIAT_UNKNOWN',
      reason || 'The fiat rail did not answer clearly. Nothing was credited or closed; ask again.',
      502,
      true,
    );
  }
}

export class NotifyUnavailable extends ProviderError {
  constructor(detail?: string) {
    super(
      'NOTIFY_UNAVAILABLE',
      detail || 'Notifications are not available yet: no sender is configured.',
      501,
      false,
    );
  }
}
