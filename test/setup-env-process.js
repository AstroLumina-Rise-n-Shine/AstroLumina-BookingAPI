// Sets process.env for BookingAPI tests before modules that validate env are loaded.
const SENTRY_DSN = "https://abc123@o0.ingest.sentry.io/0";

Object.assign(process.env, {
  NODE_ENV: "development",

  BOOKING_API_SERVER_PORT: "3033",
  BOOKING_API_SENTRY_DSN: SENTRY_DSN,

  RESEND_API_KEY: "re_test_key",
  R2_BASE_URL: "https://r2.test.local",
  CALCOM_API_KEY: "cal_test_key",
  CALCOM_BASE_URL: "https://api.cal.com",

  D1_ACCOUNT_ID: "test-account",
  D1_DATABASE_ID: "test-db",
  D1_API_TOKEN: "test-token",

  ASTROLOGY_API_SERVER_DC_PORT: "3031",
  ASTROLOGY_API_SERVER_DC_DNS: "dc.test.local",
  ASTROLOGY_API_SERVER_K8S_PORT: "3131",
  ASTROLOGY_API_SERVER_K8S_DNS: "k8s.test.local",

  BOOKING_API_SERVER_DC_PORT: "3033",
  BOOKING_API_SERVER_DC_DNS: "dc.test.local",
  BOOKING_API_SERVER_K8S_PORT: "3133",
  BOOKING_API_SERVER_K8S_DNS: "k8s.test.local",

  PAYMENT_API_SERVER_DC_PORT: "3032",
  PAYMENT_API_SERVER_DC_DNS: "dc.test.local",
  PAYMENT_API_SERVER_K8S_PORT: "3132",
  PAYMENT_API_SERVER_K8S_DNS: "k8s.test.local",

  FRONTEND_SERVER_DC_PORT: "8080",
  FRONTEND_SERVER_DC_DNS: "dc.test.local",
  FRONTEND_SERVER_K8S_PORT: "8180",
  FRONTEND_SERVER_K8S_DNS: "k8s.test.local",
});
