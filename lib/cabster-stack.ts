import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { Queue } from 'aws-cdk-lib/aws-sqs';

export class CabsterStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const ingestQueue = new Queue(this, 'CabsterIngestQueue', {
      visibilityTimeout: cdk.Duration.seconds(300),
      queueName: 'cabster-in-queue',
    });

    const outQueue = new Queue(this, 'CabsterOutQueue', {
      visibilityTimeout: cdk.Duration.seconds(300),
      queueName: 'cabster-out-queue',
    });


    
  }
}
