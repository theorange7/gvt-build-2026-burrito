import { ServiceBusClient, type ServiceBusSender } from '@azure/service-bus';
import { DefaultAzureCredential } from '@azure/identity';
import type { EnqueueWrapRequest } from '@wrapped/shared';
import { getEnvMode } from '../env';

let cachedClient: ServiceBusClient | null = null;
let cachedSender: ServiceBusSender | null = null;

function getSender(): ServiceBusSender {
  if (cachedSender) return cachedSender;
  const queueName = process.env.AZURE_SERVICE_BUS_QUEUE_NAME ?? 'wrap-jobs';
  if (getEnvMode() === 'local') {
    const cs = process.env.ServiceBusConnection;
    if (!cs) throw new Error('ServiceBusConnection must be set when ENV_MODE=local');
    cachedClient = new ServiceBusClient(cs);
  } else {
    const namespace = process.env.AZURE_SERVICE_BUS_NAMESPACE;
    if (!namespace) throw new Error('AZURE_SERVICE_BUS_NAMESPACE must be set when ENV_MODE is dev or prod');
    cachedClient = new ServiceBusClient(namespace, new DefaultAzureCredential());
  }
  cachedSender = cachedClient.createSender(queueName);
  return cachedSender;
}

type EnqueueSender = Pick<ServiceBusSender, 'sendMessages'>;

let testSender: EnqueueSender | null = null;

export function _setSenderForTests(sender: EnqueueSender | null): void {
  testSender = sender;
}

/**
 * Enqueue a wrap-generation job. The message metadata carries an opaque
 * `jobLookupToken` rather than the caller's installId — see #7 in the
 * code-review notes. The worker resolves the token via the lookup row in
 * `wrapJobs`. This keeps installId out of Service Bus metadata, the DLQ, and
 * any auto-captured App Insights traces.
 */
export async function enqueueWrapJob(payload: EnqueueWrapRequest, jobLookupToken: string): Promise<void> {
  const sender = testSender ?? getSender();
  await sender.sendMessages({
    body: payload,
    messageId: payload.jobId,
    contentType: 'application/json',
    applicationProperties: { jobId: payload.jobId, jobLookupToken },
  });
}
