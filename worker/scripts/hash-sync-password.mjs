import { pbkdf2Sync, randomBytes } from 'node:crypto';
import { createInterface } from 'node:readline/promises';

const readline = createInterface({ input: process.stdin, output: process.stdout });
try {
  const password = await readline.question('Sync password (use a long, unique password): ');
  if (password.length < 16) {
    console.error('Use at least 16 characters.');
    process.exitCode = 1;
  } else {
    const salt = randomBytes(16);
    const iterations = 310000;
    const hash = pbkdf2Sync(password, salt, iterations, 32, 'sha256');
    console.log('pbkdf2-sha256$' + iterations + '$' + salt.toString('base64') + '$' + hash.toString('base64'));
  }
} finally {
  readline.close();
}
