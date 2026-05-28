import assert from 'node:assert';
import path from 'node:path';
import nock from 'nock';
import * as sinon from 'sinon';
import {
  SourceCommands,
} from '../../src/commands/source-commands';
import {
  RegistrySource,
} from '../../src/types/registry';
import {
  createE2ETestContext,
  E2ETestContext,
  generateTestId,
} from '../helpers/e2e-test-helpers';

suite('Test Readme Download on Source Sync', () => {
  const fixturesPath = path.join(__dirname, '../fixtures/local-library');
  let testContext: E2ETestContext;
  let testId: string;
  let sandbox: sinon.SinonSandbox;
  let sourceCommands: SourceCommands;

  // Mock sources with different types
  const mockSources: RegistrySource[] = [
    {
      id: 'test-source',
      name: 'Test Source',
      type: 'github',
      url: 'https://github.com/test-owner/test-repo',
      enabled: true,
      priority: 1,
      token: 'test-token'
    },
    {
      id: 'awesome-test',
      name: 'Awesome Copilot Test',
      type: 'awesome-copilot',
      url: 'https://github.com/test-owner/awesome-copilot',
      enabled: true,
      priority: 1
    },
    {
      id: 'test-local-awesome',
      name: 'Test Local Awesome',
      type: 'local-awesome-copilot',
      url: fixturesPath,
      enabled: true,
      priority: 1
    }
  ];

  setup(async () => {
    testId = generateTestId('readme-download');
    sandbox = sinon.createSandbox();
    testContext = await createE2ETestContext();
    sourceCommands = new SourceCommands(testContext.registryManager);

    nock('https://api.github.com')
      .persist()
      .get('/repos/test-owner/test-repo/releases')
      .reply(200, [
        {
          tag_name: 'v1.0.0',
          name: 'Release 1.0.0',
          body: 'Release notes',
          published_at: '2025-01-01T00:00:00Z',
          assets: [
            {
              name: 'deployment-manifest.json',
              url: 'https://api.github.com/repos/test-owner/test-repo/releases/assets/123',
              browser_download_url: 'https://github.com/.../deployment-manifest.json',
              size: 1024
            },
            {
              name: 'bundle.zip',
              url: 'https://api.github.com/repos/test-owner/test-repo/releases/assets/124',
              browser_download_url: 'https://github.com/.../bundle.zip',
              size: 2048
            },
            {
              name: 'README.md',
              url: 'https://api.github.com/repos/test-owner/test-repo/releases/assets/125',
              browser_download_url: 'https://github.com/.../README.md',
              size: 512
            }
          ]
        }
      ]);

    nock('https://api.github.com')
      .persist()
      .get('/repos/test-owner/test-repo/releases/assets/123')
      .matchHeader('Accept', 'application/octet-stream')
      .reply(200, Buffer.from(`id: test-collection\nname: Test Bundle\nversion: 1.0.0\nauthor: test-owner`));

    nock('https://github.com')
      .persist()
      .get('/repos/test-owner/test-repo/releases/assets/125')
      .matchHeader('Accept', 'application/octet-stream')
      .reply(200, Buffer.from('# My Bundle\nThis is the README content.'));

    // Mock awesome copilot source responses
    nock('https://api.github.com')
      .persist()
      .get('/repos/test-owner/awesome-copilot/contents/collections?ref=main')
      .reply(200, [
        {
          name: 'test-collection.collection.yml',
          type: 'file',
          download_url: 'https://raw.githubusercontent.com/test-owner/awesome-copilot/main/collections/test-collection.collection.yml'
        }
      ]);
    // Mock the collection file content
    nock('https://raw.githubusercontent.com')
      .persist()
      .get('/test-owner/awesome-copilot/main/collections/test-collection.collection.yml')
      .reply(200, `
       id: test-collection
       name: Test Collection
       description: Test collection for unit tests
       tags: ["test", "example"]
       items:
         - path: "prompts/test.prompt.md"
           kind: prompt
       `);
  });

  test('Readme should be downloaded and cached correctly', async () => {
    await Promise.all(mockSources.map(async (source) => testContext.registryManager.addSource(source)));
    await sourceCommands.syncAllSources({ silent: true });
    testContext.registryManager.onReadmeDownloaded(({ sourceId, bundleIds }) => {
      assert.strictEqual(sourceId, 'test-source', 'Readme should be downloaded for the correct source');
    });
  });
});
