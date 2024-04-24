import { Duration, Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { DatabaseInstance } from 'aws-cdk-lib/aws-rds';
import { SecurityGroup } from 'aws-cdk-lib/aws-ec2';
import { Cluster, ContainerImage, Secret as EcsSecret } from 'aws-cdk-lib/aws-ecs';
import { ApplicationLoadBalancedFargateService, QueueProcessingFargateService } from 'aws-cdk-lib/aws-ecs-patterns';
import { Secret } from 'aws-cdk-lib/aws-secretsmanager';
import path = require('path');
import { Queue } from 'aws-cdk-lib/aws-sqs';
import { Metric } from 'aws-cdk-lib/aws-cloudwatch';
import { AdjustmentType, ScalableTarget, StepScalingAction } from 'aws-cdk-lib/aws-applicationautoscaling';
import { ApplicationScalingAction } from 'aws-cdk-lib/aws-cloudwatch-actions';

export interface CabsterEcsStackProps extends StackProps {
  readonly ecsCluster: Cluster
  readonly rdsInstance: DatabaseInstance
  readonly fargateSgId: string
  readonly containerPort: number
}

export class CabsterEcsStack extends Stack {

  constructor(scope: Construct, id: string, props: CabsterEcsStackProps) {
    super(scope, id, props);

    const { rdsInstance, ecsCluster, fargateSgId, containerPort } = props

    const fargateSg = SecurityGroup.fromSecurityGroupId(this, "FargateSg", fargateSgId)

    const pwSecret = Secret.fromSecretNameV2(this, 'dbSecret', rdsInstance.secret!.secretName)

    const ingestQueue = new Queue(this, 'CabsterIngestQueue', {
      visibilityTimeout: Duration.seconds(300000),
      retentionPeriod: Duration.seconds(30000),
      receiveMessageWaitTime: Duration.seconds(30),
      fifo: true,
      queueName: 'cabster-in-queue.fifo',
    });

    const outQueue = new Queue(this, 'CabsterOutQueue', {
      visibilityTimeout: Duration.seconds(300000),
      retentionPeriod: Duration.seconds(30000),
      receiveMessageWaitTime: Duration.seconds(30),
      fifo: true,
      queueName: 'cabster-out-queue.fifo',
    });

    const ecsTripinfoStack = new QueueProcessingFargateService(this, "cabster-tripinfo-receipt-service", {
      cluster: ecsCluster,
      cpu: 512,
      memoryLimitMiB: 4096,
      securityGroups: [fargateSg],
      taskSubnets: {
        subnetGroupName: 'app'
      },
      image: ContainerImage.fromAsset(path.join(__dirname, '../cabster-receipts-tripinfo')),
      minScalingCapacity: 0,
      maxScalingCapacity: 1,
      queue: ingestQueue,
      environment: {
        "POSTGRES_HOST": rdsInstance.dbInstanceEndpointAddress,
        "OUT_QUEUE": outQueue.queueArn,
      },
      scalingSteps: [
        { change: 0, upper: 0 },
        { change: +1, lower: 1 }
      ],
      secrets: { "DATABASE_SECRET": EcsSecret.fromSecretsManager(pwSecret) },
      visibilityTimeout: Duration.hours(12)
    })

    const scalingCpuMetric = ecsTripinfoStack.service.metricCpuUtilization({
      period: Duration.minutes(3),
      statistic: "Average"
    })

    const scaleDownAlarm = scalingCpuMetric.createAlarm(this, 'tripinfo-scale-down-alarm', {
      evaluationPeriods: 1,
      threshold: 0.01,
      actionsEnabled: true,
      datapointsToAlarm: 1,
      alarmName: 'Tripinfo-Scale-Down-Alarm'
    })

    const scalingTarget = ScalableTarget.fromScalableTargetId(this, 'TripinfoScalableTarget', `service/${ecsCluster.clusterName}/${ecsTripinfoStack.service.serviceName}|ecs:service:DesiredCount|ecs`)

    const scalingAction = new StepScalingAction(this, 'scaleDown', {
      scalingTarget,
      adjustmentType: AdjustmentType.EXACT_CAPACITY
    })

    scalingAction.addAdjustment({
      adjustment: 0, upperBound: 0
    })

    scaleDownAlarm.addAlarmAction(new ApplicationScalingAction(scalingAction))

    ingestQueue.grantConsumeMessages(ecsTripinfoStack.taskDefinition.taskRole)
    outQueue.grantSendMessages(ecsTripinfoStack.taskDefinition.taskRole)

    const ecsQueryStack = new ApplicationLoadBalancedFargateService(this, "cabster-metric-query-service", {
      cluster: ecsCluster,
      cpu: 512,
      desiredCount: 1,
      memoryLimitMiB: 4096,
      publicLoadBalancer: true,
      securityGroups: [fargateSg],
      taskSubnets: {
        subnetGroupName: 'app'
      },
      taskImageOptions: {
        image: ContainerImage.fromAsset(path.join(__dirname, '../cabster-metric-query-service')),
        containerPort: containerPort,
        environment: {
          "POSTGRES_HOST": rdsInstance.dbInstanceEndpointAddress,
        },
        secrets: { "DATABASE_SECRET": EcsSecret.fromSecretsManager(pwSecret) }
      },
      redirectHTTP: true,
    })


    ecsQueryStack.loadBalancer.addSecurityGroup(fargateSg)
  }
}
