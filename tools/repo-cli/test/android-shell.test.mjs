import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const repositoryRoot = path.resolve(import.meta.dirname, '..', '..', '..');
const androidRoot = path.join(repositoryRoot, 'apps', 'android');
const read = (relativePath) => readFileSync(path.join(androidRoot, relativePath), 'utf8');

function stringNames(xml) {
  return [...xml.matchAll(/<string\s+name="([^"]+)"/gu)].map((match) => match[1]).sort();
}

test('Android shell is bounded to supported API levels and generated contracts', () => {
  const build = read('app/build.gradle.kts');
  assert.match(build, /compileSdk\s*=\s*36/u);
  assert.match(build, /minSdk\s*=\s*26/u);
  assert.match(build, /targetSdk\s*=\s*35/u);
  assert.match(build, /androidx\.room\.compiler/u);
  assert.match(build, /androidx\.work\.runtime/u);
  assert.match(build, /kotlin\.kapt/u);
  assert.ok(
    existsSync(
      path.join(
        repositoryRoot,
        'packages',
        'contracts',
        'generated',
        'kotlin',
        'src',
        'main',
        'kotlin',
      ),
    ),
  );
  assert.ok(
    existsSync(
      path.join(repositoryRoot, 'packages', 'design-tokens', 'tokens', 'generated', 'android'),
    ),
  );
});

test('Android manifest fails closed for network, backup, and exported-component boundaries', () => {
  const manifest = read('app/src/main/AndroidManifest.xml');
  assert.match(manifest, /android:usesCleartextTraffic="false"/u);
  assert.match(manifest, /android:networkSecurityConfig="@xml\/network_security_config"/u);
  assert.match(manifest, /android:allowBackup="false"/u);
  assert.doesNotMatch(manifest, /MANAGE_EXTERNAL_STORAGE/u);
  assert.doesNotMatch(manifest, /<service\b(?=[^>]*\bandroid:exported\s*=\s*"true")[^>]*>/u);
  assert.match(manifest, /android:name="androidx\.work\.WorkManagerInitializer"/u);
  assert.match(
    manifest,
    /android:name="androidx\.work\.WorkManagerInitializer"[\s\S]*tools:node="remove"/u,
  );

  const network = read('app/src/main/res/xml/network_security_config.xml');
  assert.match(network, /cleartextTrafficPermitted="false"/u);
  const backup = read('app/src/main/res/xml/backup_rules.xml');
  const extraction = read('app/src/main/res/xml/data_extraction_rules.xml');
  for (const rules of [backup, extraction]) {
    for (const domain of ['database', 'sharedpref', 'external']) {
      assert.match(rules, new RegExp(`<exclude\\b(?=[^>]*\\bdomain="${domain}")[^>]*>`, 'u'));
    }
  }
});

test('Vietnamese and English Android catalogs have identical complete keys', () => {
  const vietnamese = stringNames(read('app/src/main/res/values/strings.xml'));
  const english = stringNames(read('app/src/main/res/values-en/strings.xml'));
  assert.deepEqual(vietnamese, english);
  assert.ok(vietnamese.length >= 8);
});

test('Android shell has durable local state, injected workers, and process-death coverage', () => {
  const localStore = read('app/src/main/java/com/databreeze/android/storage/LocalStore.kt');
  const sync = read('app/src/main/java/com/databreeze/android/sync/SyncPorts.kt');
  const app = read('app/src/main/java/com/databreeze/android/DataBreezeApplication.kt');
  assert.match(localStore, /@Database\(entities = \[SyncQueueEntity::class\]/u);
  assert.match(localStore, /primaryKeys = \["accountId", "workspaceId", "mutationId"\]/u);
  assert.match(sync, /ExistingWorkPolicy\.APPEND_OR_REPLACE/u);
  assert.match(sync, /DataBreezeWorkerFactory/u);
  assert.match(sync, /setRequiredNetworkType\(NetworkType\.CONNECTED\)/u);
  assert.match(app, /Configuration\.Provider/u);
  assert.match(app, /setWorkerFactory\(runtime\.workerFactory\)/u);
  assert.ok(
    existsSync(
      path.join(
        androidRoot,
        'app',
        'src',
        'androidTest',
        'java',
        'com',
        'databreeze',
        'android',
        'RoomIsolationTest.kt',
      ),
    ),
  );
  assert.ok(
    existsSync(
      path.join(
        androidRoot,
        'app',
        'src',
        'androidTest',
        'java',
        'com',
        'databreeze',
        'android',
        'MainActivityTest.kt',
      ),
    ),
  );
});
