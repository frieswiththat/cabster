
import { Stack, StackProps } from 'aws-cdk-lib';
import { ConnectionType, Integration, IntegrationType, ProxyResource, RestApi, VpcLink, CognitoUserPoolsAuthorizer } from 'aws-cdk-lib/aws-apigateway';
import { UserPool } from 'aws-cdk-lib/aws-cognito';
import { NetworkLoadBalancer } from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import { Construct } from 'constructs';

export interface CabsterApiStackProps extends StackProps {
  loadBalancer: NetworkLoadBalancer,
  userpool: UserPool,
  authConfig: { oAuthName: string, oAuthScope: string }
}

export class CabsterApiStack extends Stack {

  public apiGateway: RestApi

  constructor(scope: Construct, id: string, props: CabsterApiStackProps) {
    super(scope, id, props);
    this.apiGateway = new RestApi(this, 'cabster-metric-api', {
      restApiName: 'cabster-metric-api',
      binaryMediaTypes: [
        '*/*',
      ]
    });

    const integration = new Integration({
      type: IntegrationType.HTTP_PROXY,
      uri: `http://${props.loadBalancer.loadBalancerDnsName}/{proxy}`,
      integrationHttpMethod: "ANY",
      options: {
        connectionType: ConnectionType.VPC_LINK,
        vpcLink: new VpcLink(this, 'NlbVpcLink', {
          targets: [props.loadBalancer]
        }),
        requestParameters: {
          "integration.request.path.proxy": "method.request.path.proxy"
        }
      }
    });

    let authorizer = new CognitoUserPoolsAuthorizer(this, 'alb authorizer', {
      cognitoUserPools: [props.userpool]
    })

    this.apiGateway.root.addProxy({
      defaultIntegration: integration,
      defaultMethodOptions: {
        authorizationScopes: [
          `${props.authConfig.oAuthName}/${props.authConfig.oAuthScope}`,
        ],
        authorizer,
        requestParameters: {
          "method.request.path.proxy": true,
        },
      }
    });
  };
}
