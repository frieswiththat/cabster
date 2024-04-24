
import { Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { DatabaseInstance, DatabaseInstanceEngine, PostgresEngineVersion } from 'aws-cdk-lib/aws-rds';
import { InstanceClass, InstanceSize, InstanceType, InterfaceVpcEndpointAwsService, Port, SecurityGroup, SubnetType, Vpc } from 'aws-cdk-lib/aws-ec2';
import { Cluster } from 'aws-cdk-lib/aws-ecs';
import { OAuthScope, UserPool, UserPoolClient, UserPoolClientIdentityProvider, UserPoolDomain, UserPoolResourceServer } from 'aws-cdk-lib/aws-cognito';

export interface CabsterInfraStackProps extends StackProps {
  readonly postgresPort: number
  readonly authConfig: { oAuthName: string, oAuthScope: string }
}

export class CabsterInfraStack extends Stack {
  public localUserPool: UserPool
  public localUserPoolAppClient: UserPoolClient
  public localUserPoolDomain: UserPoolDomain
  public resourceServer: UserPoolResourceServer
  public ecsCluster: Cluster
  public rdsInstance: DatabaseInstance
  public fargateSg: SecurityGroup


  constructor(scope: Construct, id: string, props: CabsterInfraStackProps) {
    super(scope, id, props);

    const vpc = new Vpc(this, "ecsVpc", {
      maxAzs: 2,
      vpcName: `cabster-vpc`,
      subnetConfiguration: [
        {
          cidrMask: 24,
          name: 'app',
          subnetType: SubnetType.PUBLIC,
        },
        {
          cidrMask: 28,
          name: 'database',
          subnetType: SubnetType.PRIVATE_ISOLATED,
        },
      ],
    })

    vpc.addInterfaceEndpoint('SecretsManagerVpcEndpoint', {
      service: InterfaceVpcEndpointAwsService.SECRETS_MANAGER,
    });

    vpc.addInterfaceEndpoint('EcrVpcEndpoint', {
      service: InterfaceVpcEndpointAwsService.ECR,
    });

    this.fargateSg = new SecurityGroup(this, "fargateSg", {
      securityGroupName: `cabster-fargate-sg`,
      vpc: vpc,
    })

    const rdsSg = new SecurityGroup(this, "rdsSg", {
      securityGroupName: `cabster-rds-sg`,
      vpc: vpc
    })

    rdsSg.connections.allowFrom(this.fargateSg, Port.tcp(props.postgresPort))

    this.rdsInstance = new DatabaseInstance(this, "rdsInstance", {
      engine: DatabaseInstanceEngine.postgres({
        version: PostgresEngineVersion.VER_14
      }),
      vpc: vpc,
      databaseName: `cabsterDb`,
      vpcSubnets: {
        subnetGroupName: 'database'
      },
      securityGroups: [rdsSg],
      instanceType: InstanceType.of(InstanceClass.BURSTABLE3, InstanceSize.MEDIUM),
    })

    this.ecsCluster = new Cluster(this, "cabsterCluster", {
      vpc: vpc,
      clusterName: `cabster-cluster`
    })

    this.localUserPool = new UserPool(this, id, {
      userPoolName: `cabster-userpool`,
      selfSignUpEnabled: false
    })

    this.localUserPoolDomain = new UserPoolDomain(this, 'cabsterUserPoolDomain', {
      cognitoDomain: {
        domainPrefix: `cabster`
      },
      userPool: this.localUserPool
    })


    this.resourceServer = this.localUserPool.addResourceServer('ResourceServer', {
      userPoolResourceServerName: props.authConfig.oAuthName,
      identifier: props.authConfig.oAuthName,
      scopes: [
        {
          scopeName: props.authConfig.oAuthScope,
          scopeDescription: "access metric api",
        },
      ],
    });


    this.localUserPool.addClient('cabsterUserPoolAppClient', {
      generateSecret: true,
      oAuth: {
        flows: {
          clientCredentials: true
        },
        scopes: [OAuthScope.custom(`${props.authConfig.oAuthName}/${props.authConfig.oAuthScope}`)]
      }
    });
  }
}
