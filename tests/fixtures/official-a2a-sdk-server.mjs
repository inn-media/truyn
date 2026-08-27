import { randomUUID } from 'node:crypto';
import express from 'express';
import {
  A2A_PROTOCOL_VERSION,
  AGENT_CARD_PATH,
  TaskState
} from '@a2a-js/sdk';
import {
  AgentEvent,
  DefaultRequestHandler,
  InMemoryTaskStore
} from '@a2a-js/sdk/server';
import {
  agentCardHandler,
  jsonRpcHandler,
  UserBuilder
} from '@a2a-js/sdk/server/express';

const SDK_PACKAGE = '@a2a-js/sdk';
const SDK_VERSION = '1.0.1';

const stats = {
  executionCount: 0,
  messageIds: [],
  requests: []
};

class IndependentReasonExecutor {
  cancelTask = async () => {};

  async execute(requestContext, eventBus) {
    stats.executionCount += 1;
    stats.messageIds.push(requestContext.userMessage.messageId);

    const taskId = requestContext.taskId;
    const contextId = requestContext.contextId;
    const taskSnapshot = requestContext.task ?? {
      id: taskId,
      contextId,
      status: {
        state: TaskState.TASK_STATE_SUBMITTED,
        timestamp: new Date().toISOString(),
        message: undefined
      },
      artifacts: [],
      history: [requestContext.userMessage],
      metadata: requestContext.userMessage.metadata
    };
    eventBus.publish(AgentEvent.task(taskSnapshot));

    const textPart = requestContext.userMessage.parts.find((part) => part.content?.$case === 'text');
    const prompt = textPart?.content?.$case === 'text' ? textPart.content.value : '';
    const artifact = {
      artifactId: randomUUID(),
      name: 'Independent A2A SDK result',
      description: 'Produced by the official @a2a-js/sdk black-box fixture.',
      parts: [{
        content: { $case: 'text', value: `official-a2a:${prompt}` },
        metadata: undefined,
        filename: '',
        mediaType: 'text/plain'
      }],
      metadata: {
        fixture: 'sprint-c-independent-a2a',
        sdkPackage: SDK_PACKAGE,
        sdkVersion: SDK_VERSION
      },
      extensions: []
    };

    eventBus.publish(AgentEvent.artifactUpdate({
      taskId,
      contextId,
      artifact,
      lastChunk: true,
      append: false,
      metadata: undefined
    }));
    eventBus.publish(AgentEvent.statusUpdate({
      taskId,
      contextId,
      status: {
        state: TaskState.TASK_STATE_COMPLETED,
        timestamp: new Date().toISOString(),
        message: undefined
      },
      metadata: undefined
    }));
  }
}

const app = express();
const server = app.listen(0, '127.0.0.1', () => {
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Unable to resolve independent A2A fixture port');

  const baseUrl = `http://127.0.0.1:${address.port}`;
  const rpcUrl = `${baseUrl}/a2a/jsonrpc`;
  const cardUrl = `${baseUrl}/${AGENT_CARD_PATH}`;
  const statsUrl = `${baseUrl}/__truyn_black_box_stats`;

  const agentCard = {
    name: 'Sprint C official A2A SDK black-box agent',
    description: 'Independent A2A v1.0 server used to prove TRUYN client/provider interoperability.',
    supportedInterfaces: [{
      url: rpcUrl,
      protocolBinding: 'JSONRPC',
      tenant: '',
      protocolVersion: A2A_PROTOCOL_VERSION
    }],
    provider: {
      organization: 'A2A Project SDK black-box fixture',
      url: 'https://github.com/a2aproject/a2a-js'
    },
    version: '1.0.0-sprint-c',
    capabilities: {
      streaming: false,
      pushNotifications: false,
      extensions: [],
      extendedAgentCard: false
    },
    securitySchemes: {},
    securityRequirements: [],
    defaultInputModes: ['text/plain'],
    defaultOutputModes: ['text/plain'],
    skills: [{
      id: 'reason',
      name: 'Reason',
      description: 'Return a deterministic response from the independent official A2A SDK server.',
      tags: ['sprint-c', 'black-box', 'independent'],
      examples: ['TRUYN'],
      inputModes: ['text/plain'],
      outputModes: ['text/plain'],
      securityRequirements: []
    }],
    documentationUrl: 'https://github.com/a2aproject/a2a-js',
    signatures: []
  };

  const requestHandler = new DefaultRequestHandler(
    agentCard,
    new InMemoryTaskStore(),
    new IndependentReasonExecutor()
  );

  app.get('/__truyn_black_box_stats', (_req, res) => {
    res.json({
      sdkPackage: SDK_PACKAGE,
      sdkVersion: SDK_VERSION,
      protocolVersion: A2A_PROTOCOL_VERSION,
      ...stats
    });
  });

  app.use((req, _res, next) => {
    stats.requests.push({
      method: req.method,
      path: req.path,
      a2aVersion: req.get('a2a-version') ?? null
    });
    next();
  });

  app.use(`/${AGENT_CARD_PATH}`, agentCardHandler({ agentCardProvider: requestHandler }));
  app.use('/a2a/jsonrpc', jsonRpcHandler({
    requestHandler,
    userBuilder: UserBuilder.noAuthentication
  }));

  process.stdout.write(`${JSON.stringify({
    type: 'ready',
    sdkPackage: SDK_PACKAGE,
    sdkVersion: SDK_VERSION,
    protocolVersion: A2A_PROTOCOL_VERSION,
    cardUrl,
    rpcUrl,
    statsUrl
  })}\n`);
});

function shutdown() {
  server.close(() => process.exit(0));
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
