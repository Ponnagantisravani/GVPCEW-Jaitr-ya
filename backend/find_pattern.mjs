import fs from 'fs';
import path from 'path';

function searchDir(dir, pattern) {
  const files = fs.readdirSync(dir);
  for (const f of files) {
    if (f === 'node_modules' || f === '.git' || f === 'dist') continue;
    const full = path.join(dir, f);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      searchDir(full, pattern);
    } else if (f.endsWith('.js') || f.endsWith('.jsx') || f.endsWith('.sql') || f.endsWith('.json') || f.endsWith('.mjs')) {
      const content = fs.readFileSync(full, 'utf8');
      if (content.includes(pattern)) {
        console.log(`Found in: ${full}`);
      }
    }
  }
}

searchDir('c:/Users/SRAVANI/Documents/GVPCEW APP', 'faculty.invalid');
