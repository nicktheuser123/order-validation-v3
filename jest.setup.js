require("dotenv").config({ quiet: true }); // Suppress dotenv console output

// Override console.log to bypass Jest's verbose stack trace output
const originalLog = console.log;
console.log = (...args) => {
  // Write directly to stdout to avoid Jest's console capture and stack traces
  const message = args.map(arg => 
    typeof arg === 'string' ? arg : 
    typeof arg === 'object' ? JSON.stringify(arg, null, 2) : 
    String(arg)
  ).join(' ');
  process.stdout.write(message + '\n');
};
