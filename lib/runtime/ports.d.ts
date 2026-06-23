export interface ServiceProbe {
  id: string;
  url: string;
  ok: boolean;
  status?: number;
  error?: string;
}

export interface PortRegistry {
  DEFAULTS: Readonly<Record<string, number>>;
  PORTS: Record<string, number>;
  SERVICES: ReadonlyArray<{
    id: string;
    name: string;
    port: number;
    host: string;
    protocol: string;
  }>;
  getPort(name: string): number;
  getServiceUrl(name: string): string;
  getUnifiedApiUrl(): string;
  getWebUiUrl(): string;
  listServices(): PortRegistry['SERVICES'];
  probe(name: string, timeoutMs?: number): Promise<ServiceProbe>;
  probeAll(timeoutMs?: number): Promise<ServiceProbe[]>;
}

declare const registry: PortRegistry;
export = registry;
