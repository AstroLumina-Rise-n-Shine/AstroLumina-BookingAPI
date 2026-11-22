import { env } from "./env.js";

function httpAndHttps(host: string, port: number): string[] {
  return [`http://${host}:${port}`, `https://${host}:${port}`];
}

const services = [
  {
    endpoints: [
      {
        dns: env.FRONTEND_SERVER_DC_DNS,
        port: env.FRONTEND_SERVER_DC_PORT,
      },
      {
        dns: env.FRONTEND_SERVER_K8S_DNS,
        port: env.FRONTEND_SERVER_K8S_PORT,
      },
    ],
  },
  {
    endpoints: [
      {
        dns: env.ASTROLOGY_API_SERVER_DC_DNS,
        port: env.ASTROLOGY_API_SERVER_DC_PORT,
      },
      {
        dns: env.ASTROLOGY_API_SERVER_K8S_DNS,
        port: env.ASTROLOGY_API_SERVER_K8S_PORT,
      },
    ],
  },
  {
    endpoints: [
      {
        dns: env.BOOKING_API_SERVER_DC_DNS,
        port: env.BOOKING_API_SERVER_DC_PORT,
      },
      {
        dns: env.BOOKING_API_SERVER_K8S_DNS,
        port: env.BOOKING_API_SERVER_K8S_PORT,
      },
    ],
  },
  {
    endpoints: [
      {
        dns: env.PAYMENT_API_SERVER_DC_DNS,
        port: env.PAYMENT_API_SERVER_DC_PORT,
      },
      {
        dns: env.PAYMENT_API_SERVER_K8S_DNS,
        port: env.PAYMENT_API_SERVER_K8S_PORT,
      },
    ],
  },
];

const localHosts = [
  "localhost",
  "192.168.200.210",
  "192.168.200.211",
  "192.168.200.212",
  "192.168.100.210",
  "192.168.100.211",
  "192.168.100.212",
];

const origins: string[] = [];

for (const service of services) {
  for (const endpoint of service.endpoints) {
    for (const host of localHosts) {
      origins.push(...httpAndHttps(host, endpoint.port));
    }
    origins.push(...httpAndHttps(endpoint.dns, endpoint.port));
  }
}

origins.push(
  "https://astrolumina.pages.dev",
  "https://develop.astrolumina.pages.dev",
  "https://astrolumina.com",
  "https://astrolumina.ro",
);

export const defaultOrigins = [...new Set(origins)];
