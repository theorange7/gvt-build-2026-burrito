import { ServiceBusClient, type ServiceBusSender } from '@azure/service-bus';
import { DefaultAzureCredential } from '@azure/identity';
import type { EnqueueWrapRequest } from '@wrapped/shared';

let cachedClient: ServiceBusClient | null = null;
let cachedSender: ServiceBusSender | null = null;

function getSender(): ServiceBusSender {
  if (cachedSender) return cachedSender;
  const namespace = process.env.AZURE_SERVICE_BUS_NAMESPACE;
  const queueName = process.env.AZURE_SERVICE_BUS_QUEUE_NAME ?? 'wrap-jobs';
  if (!namespace) {
    throw new Error('AZURE_SERVICE_BUS_NAMESPACE is not set. Configure it in the Functions app settings.');
  }
  cachedClient = new ServiceBusClient(namespace, new DefaultAzureCredential());
  cachedSender = cachedClient.createSender(queueName);
  return cachedSender;
}

type EnqueueSender = Pick<ServiceBusSender, 'sendMessages'>;

let testSender: EnqueueSender | null = null;

export function _setSenderForTests(sender: EnqueueSender | null): void {
  testSender = sender;
}

export async function enqueueWrapJob(payload: EnqueueWrapRequest, installId: string): Promise<void> {
  const sender = testSender ?? getSender();
  await sender.sendMessages({
    body: payload,
    messageId: payload.jobId,
    contentType: 'application/json',
    applicationProperties: { jobId: payload.jobId, installId },
  });
}
