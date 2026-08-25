import {
  AGENT_DESCRIPTOR_SCHEMA as sharedSchema,
  AGENT_DESCRIPTOR_VERSION as sharedVersion,
  DEFAULT_SUPPORTED_INTERFACES as sharedInterfaces,
  DEFAULT_SUPPORTED_PROTOCOLS as sharedProtocols,
  agentDescriptorSigningPayload as sharedSigningPayload,
  negotiateAgentDescriptor as sharedNegotiate,
  parseAgentDescriptor as sharedParse,
  unsignedAgentDescriptor as sharedUnsigned,
  verifyAgentDescriptorSignature as sharedVerify
} from '../../conformance/reference/agent-descriptor.js';
import type {
  AgentDescriptor,
  DescriptorNegotiationOptions,
  DescriptorNegotiationResult,
  DescriptorParseOptions,
  DescriptorParseResult,
  DescriptorVerificationOptions,
  DescriptorVerificationResult
} from './types.ts';

export const AGENT_DESCRIPTOR_SCHEMA = sharedSchema as 'truyn.agent-descriptor/v1';
export const AGENT_DESCRIPTOR_VERSION = sharedVersion as '1';
export const DEFAULT_SUPPORTED_PROTOCOLS = sharedProtocols as readonly string[];
export const DEFAULT_SUPPORTED_INTERFACES = sharedInterfaces as readonly string[];

export function unsignedAgentDescriptor(descriptor: AgentDescriptor): Record<string, unknown> {
  return sharedUnsigned(descriptor) as Record<string, unknown>;
}

export function agentDescriptorSigningPayload(descriptor: AgentDescriptor): string {
  return sharedSigningPayload(descriptor);
}

export function parseAgentDescriptor(
  input: unknown,
  options: DescriptorParseOptions = {}
): DescriptorParseResult {
  return sharedParse(input, options) as DescriptorParseResult;
}

export function negotiateAgentDescriptor(
  input: unknown,
  options: DescriptorNegotiationOptions = {}
): DescriptorNegotiationResult {
  return sharedNegotiate(input, options) as DescriptorNegotiationResult;
}

export function verifyAgentDescriptorSignature(
  input: unknown,
  options: DescriptorVerificationOptions = {}
): DescriptorVerificationResult {
  return sharedVerify(input, options) as DescriptorVerificationResult;
}
