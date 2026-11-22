// CloudFront Function (viewer response): the browser security headers on every response. A function is used instead of a custom
// response headers policy because CloudFront's Free and Pro flat-rate plans only allow AWS-managed policies, and the Content-
// Security-Policy is a custom one. The placeholder in the code below is replaced with terraform/csp.txt (by Terraform, and by scripts/dev-server.js).
// tests/unit/headers.test.js runs this very file.
function handler(event) {
  var headers = event.response.headers;
  headers['content-security-policy'] = { value: "__CSP__" };
  headers['strict-transport-security'] = { value: 'max-age=31536000' };
  headers['x-content-type-options'] = { value: 'nosniff' };
  headers['x-frame-options'] = { value: 'DENY' };
  headers['referrer-policy'] = { value: 'same-origin' };
  headers['permissions-policy'] = { value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()' };
  headers['cross-origin-opener-policy'] = { value: 'same-origin' };
  return event.response;
}
