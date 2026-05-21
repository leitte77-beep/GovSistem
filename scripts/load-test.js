import http from "k6/http";
import { check, sleep } from "k6";

export const options = {
  stages: [
    { duration: "30s", target: 10 },
    { duration: "1m", target: 50 },
    { duration: "30s", target: 0 },
  ],
  thresholds: {
    http_req_duration: ["p(95)<2000"],
    http_req_failed: ["rate<0.05"],
  },
};

const BASE_URL = __ENV.BASE_URL || "http://localhost:8001";

export default function () {
  // Health check
  const health = http.get(`${BASE_URL}/api/v1/health`);
  check(health, { "health ok": (r) => r.status === 200 });

  // Public editions
  const editions = http.get(`${BASE_URL}/api/public/v1/editions`);
  check(editions, { "editions ok": (r) => r.status === 200 });

  // Metrics
  const metrics = http.get(`${BASE_URL}/api/v1/metrics`);
  check(metrics, { "metrics ok": (r) => r.status === 200 });

  sleep(1);
}
