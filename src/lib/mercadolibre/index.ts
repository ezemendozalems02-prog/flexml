import "server-only";

import type { MercadoLibreProvider } from "./provider";
import { MercadoLibreHttpAdapter } from "./adapters/http";
import { MercadoLibreMockAdapter } from "./adapters/mock";

/**
 * Selector de proveedor. Con MERCADOLIBRE_USE_MOCK=true se usa el adaptador
 * simulado (desarrollo sin credenciales). Las conexiones mock quedan
 * marcadas is_mock=true en la base.
 */
export function isMockMode(): boolean {
  return process.env.MERCADOLIBRE_USE_MOCK === "true";
}

let provider: MercadoLibreProvider | null = null;

export function getMercadoLibreProvider(): MercadoLibreProvider {
  if (!provider) {
    provider = isMockMode()
      ? new MercadoLibreMockAdapter()
      : new MercadoLibreHttpAdapter();
  }
  return provider;
}

export * from "./provider";
export * from "./flex-classifier";
