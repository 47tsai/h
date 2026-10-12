import { appendFileSync } from 'node:fs';
import { pbkdf2Sync, randomBytes } from 'node:crypto';
import { createInterface } from 'node:readline/promises';

function hashPassword(password) {
  password = password.trim();
  if (password.length < 8) throw new Error('Use at least 8 characters.');
  const salt = randomBytes(16);
  const iterations = 310000;
  const hash = pbkdf2Sync(password, salt, iterations, 32, 'sha256');
  return 'pbkdf2-sha256$' + iterations + '$' + salt.toString('base64') + '$' + hash.toString('base64');
}

if (Object.hasOwn(process.env, 'SYNC_PASSWORD')) {
  try {
    const encoded = hashPassword(process.env.SYNC_PASSWORD);
    if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, 'hash=' + encoded + '\n');
    else console.log(encoded);
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Unable to hash password.');
    process.exitCode = 1;
  }
} else {
  const readline = createInterface({ input: process.stdin, output: process.stdout });
  try {
    process.stdout.write('Sync password (use a long, unique password): ');
    readline._writeToOutput = () => {};
    const password = await readline.question('');
    process.stdout.write('\n');
    console.log(hashPassword(password));
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Unable to hash password.');
    process.exitCode = 1;
  } finally {
    readline.close();
  }
}
