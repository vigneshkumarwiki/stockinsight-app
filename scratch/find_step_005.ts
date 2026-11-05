import * as fs from 'fs';
import * as path from 'path';

function searchFiles(dir: string) {
  const files = fs.readdirSync(dir);
  for (const f of files) {
    const full = path.join(dir, f);
    if (fs.statSync(full).isDirectory()) {
      if (f !== 'node_modules' && f !== '.git' && f !== 'dist' && f !== 'scratch') searchFiles(full);
    } else if (f.endsWith('.ts') || f.endsWith('.tsx')) {
      const content = fs.readFileSync(full, 'utf-8');
      const lines = content.split('\n');
      lines.forEach((line, idx) => {
        if (line.includes('step="0.05"') || line.includes("step='0.05'") || line.includes('min="0.05"')) {
          console.log(full + ':' + (idx + 1) + ': ' + line.trim());
        }
      });
    }
  }
}

searchFiles('./src');
console.log('Search complete.');
