/**
 * Pre-compiles @wrapped/shared into dist/_shared/ (CommonJS + declaration files)
 * before the server tsc run. This lets tsconfig.build.json point the path alias
 * at the pre-compiled output, so tsc sees .d.ts library files rather than raw
 * TypeScript source — preventing tsc from emitting shared files alongside the
 * pnpm-linked source.
 */
import { mkdirSync, writeFileSync, rmSync } from 'fs';
import { execSync } from 'child_process';
import { resolve, dirname, relative } from 'path';
import { fileURLToPath } from 'url';

const serverRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sharedRoot = resolve(serverRoot, '..', 'shared');
const sharedDistDir = resolve(serverRoot, 'dist', '_shared');

mkdirSync(sharedDistDir, { recursive: true });

const sharedRelDist = relative(sharedRoot, sharedDistDir); // ../server/dist/_shared
const tmpTsConfig = resolve(sharedRoot, 'tsconfig.build-for-server.tmp.json');
writeFileSync(
  tmpTsConfig,
  JSON.stringify(
    {
      extends: './tsconfig.json',
      compilerOptions: {
        noEmit: false,
        outDir: sharedRelDist,
        module: 'commonjs',
        moduleResolution: 'node',
        declaration: true,
        isolatedModules: false,
      },
      include: ['src/**/*'],
    },
    null,
    2,
  ),
);
try {
  execSync(`npx tsc -p "${tmpTsConfig}"`, { stdio: 'inherit' });
} finally {
  rmSync(tmpTsConfig, { force: true });
}

writeFileSync(
  resolve(sharedDistDir, 'package.json'),
  JSON.stringify(
    {
      name: '@wrapped/shared',
      version: '0.0.0',
      main: 'index.js',
      types: 'index.d.ts',
      exports: {
        '.': { require: './index.js', types: './index.d.ts' },
        './types': { require: './types.js', types: './types.d.ts' },
        './schemas': { require: './schemas.js', types: './schemas.d.ts' },
      },
    },
    null,
    2,
  ),
);

console.log('Pre-compiled @wrapped/shared → dist/_shared/');
