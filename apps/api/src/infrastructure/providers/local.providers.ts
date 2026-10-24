import { Injectable, ServiceUnavailableException } from '@nestjs/common';

export interface ProviderStatus {
  enabled: boolean;
  provider: string;
  message: string;
}

export interface PaymentProvider {
  readonly status: ProviderStatus;
  createCheckout(): Promise<never>;
}

export interface InvoiceProvider {
  readonly status: ProviderStatus;
  issue(): Promise<never>;
}

export interface SignatureProvider {
  readonly status: ProviderStatus;
  sign(): Promise<never>;
}

function unavailable(provider: string): never {
  throw new ServiceUnavailableException({
    code: 'PROVIDER_NOT_CONFIGURED',
    message: `Ο πάροχος ${provider} δεν έχει ρυθμιστεί σε τοπικό περιβάλλον`,
  });
}

@Injectable()
export class LocalPaymentProvider implements PaymentProvider {
  readonly status: ProviderStatus = {
    enabled: false,
    provider: 'local',
    message: 'Δεν έχει ρυθμιστεί πάροχος πληρωμών',
  };

  async createCheckout(): Promise<never> {
    return unavailable('πληρωμών');
  }
}

@Injectable()
export class LocalInvoiceProvider implements InvoiceProvider {
  readonly status: ProviderStatus = {
    enabled: false,
    provider: 'local',
    message: 'Δεν έχει ρυθμιστεί πάροχος ηλεκτρονικής τιμολόγησης',
  };

  async issue(): Promise<never> {
    return unavailable('τιμολόγησης');
  }
}

@Injectable()
export class LocalSignatureProvider implements SignatureProvider {
  readonly status: ProviderStatus = {
    enabled: false,
    provider: 'local',
    message: 'Δεν έχει ρυθμιστεί πάροχος ψηφιακής υπογραφής',
  };

  async sign(): Promise<never> {
    return unavailable('ψηφιακής υπογραφής');
  }
}
