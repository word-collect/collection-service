import * as cdk from 'aws-cdk-lib'
import { Construct } from 'constructs'
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb'
import * as lambda from 'aws-cdk-lib/aws-lambda-nodejs'
import * as apigwv2 from 'aws-cdk-lib/aws-apigatewayv2'
import * as integ from 'aws-cdk-lib/aws-apigatewayv2-integrations'
import * as apigwAuth from 'aws-cdk-lib/aws-apigatewayv2-authorizers'
import * as ssm from 'aws-cdk-lib/aws-ssm'
import * as events from 'aws-cdk-lib/aws-events'
import * as targets from 'aws-cdk-lib/aws-events-targets'

export interface CollectionStackProps extends cdk.StackProps {
  appName: string
  environment: string
}

export class CollectionStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: CollectionStackProps) {
    super(scope, id, props)
    const { appName, environment } = props

    const eventBus = events.EventBus.fromEventBusName(
      this,
      'SharedEventBus',
      cdk.Fn.importValue(`${appName}-${environment}-event-bus-name`)
    )

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

    const ingestFn = new lambda.NodejsFunction(this, 'IngestHandler', {
      entry: 'src/ingest-analysis.ts',
      environment: { TABLE: table.tableName },
      memorySize: 1024,
      timeout: cdk.Duration.minutes(1)
    })
    table.grantWriteData(ingestFn) // change if it needs to read

    /* ── 3. HTTP API secured by Cognito JWT ─────────────────── */
    const poolId = ssm.StringParameter.valueForStringParameter(
      this,
      `/${appName}/${environment}/user-service/userPoolId`
    )
    const clientId = ssm.StringParameter.valueForStringParameter(
      this,
      `/${appName}/${environment}/user-service/appClientId`
    )

    const api = new apigwv2.HttpApi(this, 'Api', {
      corsPreflight: {
        allowOrigins: [
          'https://wordcollect.haydenturek.com',
          'http://localhost:3000'
        ],
        allowMethods: [
          apigwv2.CorsHttpMethod.GET,
          apigwv2.CorsHttpMethod.POST,
          apigwv2.CorsHttpMethod.PUT,
          apigwv2.CorsHttpMethod.DELETE,
          apigwv2.CorsHttpMethod.OPTIONS
        ],
        allowHeaders: ['authorization', 'content-type'],
        allowCredentials: true
      }
    })

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

    // events
    new events.Rule(this, 'AnalysisReadyToCollection', {
      eventBus,
      eventPattern: {
        source: ['extraction-service'],
        detailType: ['AnalysisReady']
      },
      targets: [new targets.LambdaFunction(ingestFn)]
    })

    /* ── 4. Expose the endpoint via SSM ──────────────────────── */
    new ssm.StringParameter(this, 'EndpointParam', {
      parameterName: `/${appName}/${environment}/collection-service/api-endpoint`,
      stringValue: api.apiEndpoint
    })
  }
}
