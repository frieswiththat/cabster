#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { CabsterEcsStack } from '../lib/ecs-stack';
import { CabsterInfraStack } from '../lib/basic-infra-stack';
import { CabsterApiStack } from '../lib/api-stack';

const app = new cdk.App();

const authConfig = {
  oAuthName: 'cabster',
  oAuthScope: 'tripinfo-metrics'
}

const infraStack = new CabsterInfraStack(app, 'CabsterInfraStack', {
  postgresPort: 5032,
  authConfig
})

const ecsStack = new CabsterEcsStack(app, 'CabsterEcsStack', {
  ecsCluster: infraStack.ecsCluster,
  rdsInstance: infraStack.rdsInstance,
  fargateSgId: infraStack.fargateSg.securityGroupId,
  containerPort: 8000
})

new CabsterApiStack(app, 'CabsterApiStack', {
  loadBalancer:ecsStack.metricServiceLoadBalancer,
  userpool: infraStack.localUserPool,
  authConfig,
})