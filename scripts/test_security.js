const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const APP_TSX_PATH = path.join(PROJECT_ROOT, 'src', 'App.tsx');
const RULES_PATH = path.join(PROJECT_ROOT, 'firestore.rules');

console.log('\x1b[36m%s\x1b[0m', '🛡️  Running World Cup 2026 Prediction App Security Audits...');

let errorsCount = 0;
let passesCount = 0;

function logPass(desc) {
  console.log('\x1b[32m%s\x1b[0m', `  ✔ PASS: ${desc}`);
  passesCount++;
}

function logFail(desc, details) {
  console.error('\x1b[31m%s\x1b[0m', `  ✘ FAIL: ${desc}`);
  if (details) console.error(`          Reason: ${details}`);
  errorsCount++;
}

// 1. Audit firestore.rules presence & basic structure
if (fs.existsSync(RULES_PATH)) {
  logPass('firestore.rules file exists in the project root.');
  const rulesContent = fs.readFileSync(RULES_PATH, 'utf8');

  // Verify delete: if false on matches
  if (rulesContent.match(/match \/matches\/\{matchId\}[^}]*allow delete:\s*if\s*false/s)) {
    logPass('Matches collection is protected from client-side destruction (allow delete: if false).');
  } else {
    logFail('Matches collection delete rule is insecure or missing.', 'Matches collection must explicitly restrict delete accesses.');
  }

  // Verify delete: if false on settings
  if (rulesContent.match(/match \/settings\/\{settingId\}[^}]*allow delete:\s*if\s*false/s)) {
    logPass('Settings collection is protected from client-side destruction (allow delete: if false).');
  } else {
    logFail('Settings collection delete rule is insecure or missing.', 'Settings collection must explicitly restrict delete accesses.');
  }

  // Verify delete: if false on recaps
  if (rulesContent.match(/match \/recaps\/\{recapId\}[^}]*allow delete:\s*if\s*false/s)) {
    logPass('Recaps collection is protected from client-side destruction (allow delete: if false).');
  } else {
    logFail('Recaps collection delete rule is insecure or missing.', 'Recaps collection must explicitly restrict delete accesses.');
  }

  // Verify basic auth check function
  if (rulesContent.includes('request.auth != null')) {
    logPass('Authenticated access helper checks exist (request.auth != null).');
  } else {
    logFail('Unauthenticated wildcard reads/writes detected.', 'Rules should enforce authentication checking.');
  }
} else {
  logFail('firestore.rules file does not exist in the project root.', 'Create firestore.rules to secure database operations.');
}

// 2. Audit App.tsx for authenticated writes checks
if (fs.existsSync(APP_TSX_PATH)) {
  logPass('App.tsx source file exists.');
  const appContent = fs.readFileSync(APP_TSX_PATH, 'utf8');

  const checkFunctions = [
    { name: 'dbWriteBet', regex: /const dbWriteBet = async[^}]*fbInstance\.auth\.currentUser/s },
    { name: 'dbWriteGroup', regex: /const dbWriteGroup = async[^}]*fbInstance\.auth\.currentUser/s },
    { name: 'dbWriteMatches', regex: /const dbWriteMatches = async[^}]*fbInstance\.auth\.currentUser/s },
    { name: 'dbResolveDailySession', regex: /const dbResolveDailySession = async[^}]*fbInstance\.auth\.currentUser/s }
  ];

  checkFunctions.forEach(fn => {
    if (appContent.match(fn.regex)) {
      logPass(`${fn.name}() client-side database write wrapper enforces active user authentication checking.`);
    } else {
      logFail(`${fn.name}() does not enforce active user checking.`, `Modify ${fn.name}() to check fbInstance.auth.currentUser before writing to Firestore.`);
    }
  });

} else {
  logFail('App.tsx source file not found.', 'App.tsx must be located at src/App.tsx');
}

console.log('\n----------------------------------------');
if (errorsCount === 0) {
  console.log('\x1b[32m%s\x1b[0m', `🎉 SECURITY AUDIT COMPLETE: ${passesCount} checks passed, 0 failures.`);
  process.exit(0);
} else {
  console.error('\x1b[31m%s\x1b[0m', `⚠️  SECURITY AUDIT FAILED: ${passesCount} checks passed, ${errorsCount} failures.`);
  process.exit(1);
}
