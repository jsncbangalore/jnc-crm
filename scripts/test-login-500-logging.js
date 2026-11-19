const { HttpStatus, Logger } = require('@nestjs/common');
const { GlobalHttpExceptionFilter } = require('../apps/api/dist/common/http-exception.filter');

// Capture logger output
let capturedLogs = [];
const originalError = Logger.prototype.error;
Logger.prototype.error = function(message, ...optionalParams) {
  capturedLogs.push(message);
};

const filter = new GlobalHttpExceptionFilter();

// Create mock request and response
const mockRequest = {
  method: 'POST',
  url: '/api/v1/auth/login',
  route: { path: '/api/v1/auth/login' },
  headers: {
    'x-request-id': 'req-test-500-searchable-id',
    'origin': 'https://admin.jsnc.co.in'
  },
  ip: '127.0.0.1',
  user: null
};

let capturedResponse = {};
const mockResponse = {
  statusCode: 200,
  headers: {},
  setHeader(key, val) {
    this.headers[key.toLowerCase()] = val;
  },
  getHeader(key) {
    return this.headers[key.toLowerCase()];
  },
  status(code) {
    this.statusCode = code;
    return this;
  },
  json(data) {
    capturedResponse = data;
    return data;
  }
};

const mockHost = {
  switchToHttp() {
    return {
      getRequest: () => mockRequest,
      getResponse: () => mockResponse
    };
  }
};

// Simulate an internal error with sensitive database URL and password in the stack
const errorWithSecrets = new Error('Connection failed to postgresql://admin:super_secret_db_pass_999@db.prod.supabase.co:5432/postgres while verifying password="super_secret_user_password_xyz" with token="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.dummy_secret_token"');
errorWithSecrets.name = 'DatabaseConnectionInternalError';

console.log('--- EXECUTING GLOBAL EXCEPTION FILTER ON 500 ---');
filter.catch(errorWithSecrets, mockHost);

console.log('HTTP Status Returned:', mockResponse.statusCode);
console.log('Response Body:', JSON.stringify(capturedResponse, null, 2));
console.log('\n--- SERVER LOG LINES WRITTEN ---');
for (const line of capturedLogs) {
  console.log(line);
}

// Verifications
const logLine = capturedLogs.find(l => l.includes('req-test-500-searchable-id'));
if (!logLine) {
  console.error('FAIL: Log line does not contain request id!');
  process.exit(1);
}

if (!logLine.includes('POST /api/v1/auth/login')) {
  console.error('FAIL: Log line does not contain route!');
  process.exit(1);
}

if (!logLine.includes('[errorClass=DatabaseConnectionInternalError]')) {
  console.error('FAIL: Log line does not contain errorClass!');
  process.exit(1);
}

if (!logLine.includes('[prismaCode=NONE]')) {
  console.error('FAIL: Log line does not contain prismaCode!');
  process.exit(1);
}

if (logLine.includes('super_secret_db_pass_999') || logLine.includes('super_secret_user_password_xyz') || logLine.includes('dummy_secret_token')) {
  console.error('FAIL: Log line leaked raw secrets!');
  process.exit(1);
}

console.log('\n[PASS] All verification assertions succeeded: Request ID is searchable, route is present, errorClass and prismaCode are included, secrets are scrubbed.');
