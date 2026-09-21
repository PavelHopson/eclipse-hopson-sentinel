import type { DecisionCorpusCase } from './shadowEvaluation.ts'

export type SentinelIncidentDecision = 'ignore' | 'review' | 'escalate'

const ROUTES = ['ignore', 'review', 'escalate'] as const

export const sentinelIncidentSeedCorpus: readonly DecisionCorpusCase<SentinelIncidentDecision>[] =
  [
    {
      id: 'known-device-routine-login',
      expected: 'ignore',
      allowedDecisions: ROUTES,
      context: {
        event: 'login',
        deviceKnown: true,
        geoExpected: true,
        failedAttempts: 0,
        privilegeChange: false,
      },
    },
    {
      id: 'known-device-single-failure',
      expected: 'ignore',
      allowedDecisions: ROUTES,
      context: {
        event: 'login_failed',
        deviceKnown: true,
        geoExpected: true,
        failedAttempts: 1,
        privilegeChange: false,
      },
    },
    {
      id: 'new-device-normal-geo',
      expected: 'review',
      allowedDecisions: ROUTES,
      context: {
        event: 'login',
        deviceKnown: false,
        geoExpected: true,
        failedAttempts: 0,
        privilegeChange: false,
      },
    },
    {
      id: 'known-device-unexpected-geo',
      expected: 'review',
      allowedDecisions: ROUTES,
      context: {
        event: 'login',
        deviceKnown: true,
        geoExpected: false,
        failedAttempts: 0,
        privilegeChange: false,
      },
    },
    {
      id: 'repeated-login-failures-known-device',
      expected: 'review',
      allowedDecisions: ROUTES,
      context: {
        event: 'login_failed',
        deviceKnown: true,
        geoExpected: true,
        failedAttempts: 5,
        privilegeChange: false,
      },
    },
    {
      id: 'new-device-unexpected-geo',
      expected: 'escalate',
      allowedDecisions: ROUTES,
      context: {
        event: 'login',
        deviceKnown: false,
        geoExpected: false,
        failedAttempts: 2,
        privilegeChange: false,
      },
    },
    {
      id: 'privilege-change-known-admin',
      expected: 'review',
      allowedDecisions: ROUTES,
      context: {
        event: 'privilege_change',
        actorKnown: true,
        changeExpected: true,
        target: 'admin',
      },
    },
    {
      id: 'unexpected-privilege-escalation',
      expected: 'escalate',
      allowedDecisions: ROUTES,
      context: {
        event: 'privilege_change',
        actorKnown: false,
        changeExpected: false,
        target: 'admin',
      },
    },
    {
      id: 'routine-readonly-command',
      expected: 'ignore',
      allowedDecisions: ROUTES,
      context: {
        event: 'operator_request',
        capability: 'system_info',
        mutation: false,
        externalSideEffect: false,
      },
    },
    {
      id: 'unknown-readonly-command',
      expected: 'review',
      allowedDecisions: ROUTES,
      context: {
        event: 'operator_request',
        capability: 'unknown_readonly',
        mutation: false,
        externalSideEffect: false,
      },
    },
    {
      id: 'destructive-operator-request',
      expected: 'escalate',
      allowedDecisions: ROUTES,
      context: {
        event: 'operator_request',
        capability: 'delete_files',
        mutation: true,
        externalSideEffect: true,
      },
    },
    {
      id: 'publish-request',
      expected: 'escalate',
      allowedDecisions: ROUTES,
      context: {
        event: 'operator_request',
        capability: 'publish',
        mutation: true,
        externalSideEffect: true,
      },
    },
    {
      id: 'provider-rate-limit',
      expected: 'review',
      allowedDecisions: ROUTES,
      context: {
        event: 'provider_error',
        category: 'rate_limit',
        retryable: true,
        secretExposure: false,
      },
    },
    {
      id: 'provider-auth-failure',
      expected: 'escalate',
      allowedDecisions: ROUTES,
      context: {
        event: 'provider_error',
        category: 'authentication',
        retryable: false,
        secretExposure: false,
      },
    },
    {
      id: 'suspected-secret-exposure',
      expected: 'escalate',
      allowedDecisions: ROUTES,
      context: {
        event: 'security_finding',
        category: 'secret_exposure',
        credentialType: 'api_key',
        externallyVisible: true,
      },
    },
    {
      id: 'dependency-low-severity',
      expected: 'review',
      allowedDecisions: ROUTES,
      context: {
        event: 'dependency_finding',
        severity: 'low',
        reachable: false,
        runtimeDependency: true,
      },
    },
    {
      id: 'dependency-critical-reachable',
      expected: 'escalate',
      allowedDecisions: ROUTES,
      context: {
        event: 'dependency_finding',
        severity: 'critical',
        reachable: true,
        runtimeDependency: true,
      },
    },
    {
      id: 'known-maintenance-window',
      expected: 'ignore',
      allowedDecisions: ROUTES,
      context: {
        event: 'service_restart',
        maintenanceWindow: true,
        approvedChange: true,
        unexpectedErrors: false,
      },
    },
  ] as const
