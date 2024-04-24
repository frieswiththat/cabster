import { Construct } from 'constructs';
import { Queue } from 'aws-cdk-lib/aws-sqs';
import { Duration, Stack, StackProps } from 'aws-cdk-lib';
import { Role } from 'aws-cdk-lib/aws-iam';

export interface CabsterQueueStackProps extends StackProps {
  loadBalancerRole: Role,
}
export class CabsterQueueStack extends Stack {
  constructor(scope: Construct, id: string, props: CabsterQueueStackProps) {
    super(scope, id, props);

    const ingestQueue = new Queue(this, 'CabsterIngestQueue', {
      visibilityTimeout: Duration.seconds(300),
      queueName: 'cabster-in-queue',
    });

    ingestQueue.grantConsumeMessages(props.loadBalancerRole)

    const outQueue = new Queue(this, 'CabsterOutQueue', {
      visibilityTimeout: Duration.seconds(300),
      queueName: 'cabster-out-queue',
    });

    outQueue.grantSendMessages(props.loadBalancerRole)

  }
}
