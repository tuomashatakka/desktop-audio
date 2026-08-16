import fs from 'node:fs';
import path from 'node:path';

/** This file lives in config/, so every repo-relative path climbs one level. */
const projectRoot = path.join(__dirname, '..');
import type { ForgeConfig } from '@electron-forge/shared-types';
import { MakerSquirrel } from '@electron-forge/maker-squirrel';
import { MakerZIP } from '@electron-forge/maker-zip';
import { MakerDeb } from '@electron-forge/maker-deb';
import { MakerRpm } from '@electron-forge/maker-rpm';
import { VitePlugin } from '@electron-forge/plugin-vite';
import { AutoUnpackNativesPlugin } from '@electron-forge/plugin-auto-unpack-natives';
import { FusesPlugin } from '@electron-forge/plugin-fuses';
import { FuseV1Options, FuseVersion } from '@electron/fuses';

/**
 * Modules listed as `external` in vite.main.config.ts / vite.worker.config.ts.
 * Vite deliberately does not bundle them (better-sqlite3 is a native .node
 * addon, mpris-service binds to D-Bus), so they have to be shipped as real
 * files inside the packaged app's node_modules.
 */
const externalModules = [ 'better-sqlite3', 'mpris-service' ];

/** Walk the runtime dependency closure of `roots` across hoisted node_modules. */
function dependencyClosure (roots: string[]): Set<string> {
  const seen = new Set<string>();

  const visit = (name: string): void => {
    if (seen.has(name))
      return;

    const manifest = path.join(projectRoot, 'node_modules', name, 'package.json');
    if (!fs.existsSync(manifest))
      return;

    seen.add(name);

    const pkg = JSON.parse(fs.readFileSync(manifest, 'utf8')) as { dependencies?: Record<string, string> };
    Object.keys(pkg.dependencies ?? {}).forEach(visit);
  };

  roots.forEach(visit);
  return seen;
}

const bundledModules = dependencyClosure(externalModules);

const macOsSigningIdentity = process.env.MACOS_SIGNING_IDENTITY;
const macOsKeychainPath = process.env.MACOS_KEYCHAIN_PATH;
const appleId = process.env.APPLE_ID;
const appleIdPassword = process.env.APPLE_APP_SPECIFIC_PASSWORD;
const appleTeamId = process.env.APPLE_TEAM_ID;

const macOsNotarizeConfig = macOsSigningIdentity && appleId && appleIdPassword && appleTeamId
  ? {
      appleId,
      appleIdPassword,
      teamId: appleTeamId,
    }
  : undefined;

/**
 * Fuses mutate Electron's executable, so every macOS build needs a final signing
 * pass. Local and credential-free CI builds use an ad-hoc identity; release CI
 * upgrades to Developer ID signing and notarization when its secrets are set.
 */
const macOsPackagerConfig: ForgeConfig['packagerConfig'] = process.platform === 'darwin'
  ? {
      osxSign: macOsSigningIdentity
        ? {
            identity: macOsSigningIdentity,
            ...(macOsKeychainPath ? { keychain: macOsKeychainPath } : {}),
          }
        : {
            identity: '-',
            identityValidation: false,
            // Ad-hoc components have no shared Team ID, so hardened runtime's
            // library validation would reject Electron Framework at launch.
            optionsForFile: () => ({ hardenedRuntime: false }),
          },
      ...(macOsNotarizeConfig ? { osxNotarize: macOsNotarizeConfig } : {}),
    }
  : {};

/**
 * The Vite plugin's default `ignore` keeps only `/.vite`, which silently drops
 * every externalized dependency and produces an app that cannot start. Keep
 * `/.vite` plus the modules Vite refused to bundle.
 */
function ignorePackagedFile (file: string): boolean {
  if (!file || file === '/node_modules')
    return false;

  if (file.startsWith('/.vite'))
    return false;

  if (!file.startsWith('/node_modules/'))
    return true;

  const request = file.slice('/node_modules/'.length);
  const segments = request.split('/');

  // Keep a scope directory (`@scope`) whenever it holds something we need.
  if (segments[0].startsWith('@') && segments.length === 1)
    return ![ ...bundledModules ].some(name => name.startsWith(`${request}/`));

  const moduleName = segments[0].startsWith('@') ? segments.slice(0, 2).join('/') : segments[0];
  return !bundledModules.has(moduleName);
}

/**
 * better-sqlite3 ships its whole node-gyp workspace (~17MB of object files plus
 * a ~10MB sqlite3 amalgamation). electron-rebuild needs those sources while
 * packaging, so they can only be dropped once the addon has been compiled --
 * hence a `packageAfterPrune` hook rather than an `ignore` rule.
 */
function stripNativeBuildInputs (buildPath: string): void {
  const moduleRoot = path.join(buildPath, 'node_modules', 'better-sqlite3');
  if (!fs.existsSync(moduleRoot))
    return;

  const remove = (...segments: string[]): void =>
    fs.rmSync(path.join(moduleRoot, ...segments), { recursive: true, force: true });

  remove('deps');
  remove('src');
  remove('binding.gyp');

  const buildDir = path.join(moduleRoot, 'build');
  if (!fs.existsSync(buildDir))
    return;

  // Keep only build/Release/*.node -- the compiled addon Electron dlopens.
  fs.readdirSync(buildDir)
    .filter(entry => entry !== 'Release')
    .forEach(entry => remove('build', entry));

  const releaseDir = path.join(buildDir, 'Release');
  fs.readdirSync(releaseDir)
    .filter(entry => !entry.endsWith('.node'))
    .forEach(entry => remove('build', 'Release', entry));
}

const config: ForgeConfig = {
  packagerConfig: {
    asar: true,
    icon: path.join(projectRoot, 'assets', 'icon'),
    extraResource: [ path.join(projectRoot, 'resources') ],
    ignore: ignorePackagedFile,
    ...macOsPackagerConfig,
  },
  rebuildConfig: {
    force: true,
    onlyModules: ['better-sqlite3'],
  },
  hooks: {
    packageAfterPrune: (_forgeConfig, buildPath) => {
      stripNativeBuildInputs(buildPath);
      return Promise.resolve();
    },
  },
  makers: [
    new MakerSquirrel({}),
    new MakerZIP({}, ['darwin']),
    new MakerRpm({}),
    new MakerDeb({}),
  ],
  plugins: [
    new VitePlugin({
      // `build` can specify multiple entry builds, which can be Main process, Preload scripts, Worker process, etc.
      // If you are familiar with Vite configuration, it will look really familiar.
      build: [
        {
          // `entry` is just an alias for `build.lib.entry` in the corresponding file of `config`.
          entry: 'src/main.ts',
          config: 'config/vite/main.config.ts',
          target: 'main',
        },
        {
          entry: 'src/preload.ts',
          config: 'config/vite/preload.config.ts',
          target: 'preload',
        },
        {
          entry: 'src/context-menu-preload.ts',
          config: 'config/vite/preload.config.ts',
          target: 'preload',
        },
        // Every worker main.ts spawns has to be built, or `new Worker(...)`
        // points at a file that does not exist.
        {
          entry: 'src/scanner-worker.ts',
          config: 'config/vite/worker.config.ts',
          target: 'main',
        },
        {
          entry: 'src/db-reader.ts',
          config: 'config/vite/worker.config.ts',
          target: 'main',
        },
        {
          entry: 'src/db-writer.ts',
          config: 'config/vite/worker.config.ts',
          target: 'main',
        },
        {
          entry: 'src/analysis-worker.ts',
          config: 'config/vite/worker.config.ts',
          target: 'main',
        },
      ],
      renderer: [
        {
          name: 'main_window',
          config: 'config/vite/renderer.config.ts',
        },
        {
          name: 'context_menu_window',
          config: 'config/vite/context-menu.config.ts',
        },
      ],
    }),
    // Moves native .node addons out of app.asar and into app.asar.unpacked,
    // since Electron cannot dlopen a binary from inside an asar archive.
    new AutoUnpackNativesPlugin({}),
    // Fuses are used to enable/disable various Electron functionality
    // at package time, before code signing the application
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
};

export default config;
