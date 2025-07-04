import * as cdk from 'aws-cdk-lib'
import { Construct } from 'constructs'
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb'
import * as lambda from 'aws-cdk-lib/aws-lambda-nodejs'
import * as apigwv2 from 'aws-cdk-lib/aws-apigatewayv2'
import * as integ from 'aws-cdk-lib/aws-apigatewayv2-integrations'
import * as apigwAuth from 'aws-cdk-lib/aws-apigatewayv2-authorizers'
import * as ssm from 'aws-cdk-lib/aws-ssm'

export interface CollectionStackProps extends cdk.StackProps {
  appName: string
  environment: string
}

export class CollectionStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: CollectionStackProps) {
    super(scope, id, props)
    const { appName, environment } = props

    /* ── 1. DynamoDB table (PK=userSub, SK=word) ─────────────── */
    const table = new dynamodb.Table(this, 'Table', {
      partitionKey: { name: 'userSub', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'word', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY // dev-only
    })

    /* ── 2. Lambda handler (full CRUD) ───────────────────────── */
    const fn = new lambda.NodejsFunction(this, 'Handler', {
      entry: 'src/index.ts',
      environment: { TABLE: table.tableName }
    })
    table.grantReadWriteData(fn)

    /* ── 3. HTTP API secured by Cognito JWT ─────────────────── */
    const poolId = ssm.StringParameter.valueForStringParameter(
      this,
      `/${appName}/${environment}/user-service/userPoolId`
    )
    const clientId = ssm.StringParameter.valueForStringParameter(
      this,
      `/${appName}/${environment}/user-service/appClientId`
    )

    const api = new apigwv2.HttpApi(this, 'Api')

    const authorizer = new apigwAuth.HttpJwtAuthorizer(
      'JwtAuth',
      `https://cognito-idp.${this.region}.amazonaws.com/${poolId}`,
      { jwtAudience: [clientId] }
    )

    api.addRoutes({
      path: '/',
      methods: [
        apigwv2.HttpMethod.GET,
        apigwv2.HttpMethod.POST,
        apigwv2.HttpMethod.PUT,
        apigwv2.HttpMethod.DELETE
      ],
      integration: new integ.HttpLambdaIntegration('Int', fn),
      authorizer
    })

    /* ── 4. Expose the endpoint via SSM ──────────────────────── */
    new ssm.StringParameter(this, 'EndpointParam', {
      parameterName: `/${appName}/${environment}/collection-service/api-endpoint`,
      stringValue: api.apiEndpoint
    })
  }
}
