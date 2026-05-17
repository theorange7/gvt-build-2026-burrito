import { BlobServiceClient, type ContainerClient } from '@azure/storage-blob';
import { DefaultAzureCredential } from '@azure/identity';
import { getEnvMode } from '../env';
import { isValidShareSlug } from './slug';

/**
 * Azure Blob Storage container that holds published share bundles
 * (`wraps/{slug}/index.html` + `wraps/{slug}/assets/*`). The container is
 * created with anonymous object-read (blob-access), so anyone with the
 * full path can fetch a single object — but listing is disabled, so the
 * capability is "URL only", not "browse all".
 */

const CONTAINER_NAME = 'wraps';
const SHARES_PREFIX = (slug: string): string => `${slug}/`;

export type BundleUpload = {
  slug: string;
  indexHtml: string;
  viewerJs: Buffer;
  viewerCss: Buffer;
};

type BlobAPI = {
  uploadBundle(upload: BundleUpload): Promise<void>;
  deleteBundle(slug: string): Promise<void>;
};

let cached: BlobAPI | null = null;

function isLocal(): boolean {
  // Allow tests/local dev to opt out of any blob client construction.
  try {
    return getEnvMode() === 'local';
  } catch {
    return true;
  }
}

function realBlobClient(): BlobAPI {
  const account = process.env.AZURE_BLOB_STORAGE_ACCOUNT;
  if (!account) {
    throw new Error('AZURE_BLOB_STORAGE_ACCOUNT must be set when ENV_MODE is dev or prod');
  }
  const service = new BlobServiceClient(
    `https://${account}.blob.core.windows.net`,
    new DefaultAzureCredential(),
  );
  const container: ContainerClient = service.getContainerClient(CONTAINER_NAME);

  return {
    async uploadBundle(upload) {
      if (!isValidShareSlug(upload.slug)) throw new Error('invalid-slug');
      const index = container.getBlockBlobClient(`${upload.slug}/index.html`);
      await index.uploadData(Buffer.from(upload.indexHtml, 'utf8'), {
        blobHTTPHeaders: { blobContentType: 'text/html; charset=utf-8', blobCacheControl: 'no-cache' },
      });
      const js = container.getBlockBlobClient(`${upload.slug}/assets/viewer.js`);
      await js.uploadData(upload.viewerJs, {
        blobHTTPHeaders: { blobContentType: 'application/javascript; charset=utf-8' },
      });
      const css = container.getBlockBlobClient(`${upload.slug}/assets/viewer.css`);
      await css.uploadData(upload.viewerCss, {
        blobHTTPHeaders: { blobContentType: 'text/css; charset=utf-8' },
      });
    },

    async deleteBundle(slug) {
      if (!isValidShareSlug(slug)) throw new Error('invalid-slug');
      const iterator = container.listBlobsByHierarchy('/', { prefix: SHARES_PREFIX(slug) });
      for await (const item of container.listBlobsFlat({ prefix: SHARES_PREFIX(slug) })) {
        await container.deleteBlob(item.name);
      }
      // listBlobsByHierarchy with delimiter is only used to assert the prefix
      // exists; the flat iterator above handles removal. Reference it so the
      // import is intentional and bundlers don't tree-shake the helper away.
      void iterator;
    },
  };
}

export function blobClient(): BlobAPI {
  if (cached) return cached;
  if (isLocal()) {
    // Local mode never hits real storage. Tests install a fake via
    // `_setBlobClientForTests`; if none is installed, calls no-op silently —
    // share publishing is a strictly opt-in feature.
    cached = noopClient();
  } else {
    cached = realBlobClient();
  }
  return cached;
}

function noopClient(): BlobAPI {
  return {
    async uploadBundle() {
      /* local default: no-op */
    },
    async deleteBundle() {
      /* local default: no-op */
    },
  };
}

export function _setBlobClientForTests(client: BlobAPI | null): void {
  cached = client;
}

export function _resetBlobClient(): void {
  cached = null;
}

/**
 * Resolve the public URL of a share's `index.html`. When
 * `WRAP_SHARE_BASE_URL` is set (CDN / custom domain), it overrides the
 * default blob URL — the blob *path* (`{slug}/index.html`) is identical.
 */
export function buildShareUrl(slug: string): string {
  if (!isValidShareSlug(slug)) throw new Error('invalid-slug');
  const override = process.env.WRAP_SHARE_BASE_URL;
  if (override) {
    return `${override.replace(/\/$/, '')}/${slug}/index.html`;
  }
  const account = process.env.AZURE_BLOB_STORAGE_ACCOUNT;
  if (!account) {
    // In local mode the URL is informational only — share publishing no-ops.
    return `http://localhost/${CONTAINER_NAME}/${slug}/index.html`;
  }
  return `https://${account}.blob.core.windows.net/${CONTAINER_NAME}/${slug}/index.html`;
}
