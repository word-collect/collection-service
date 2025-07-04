#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib'
import { CollectionStack } from '../lib/collection-service-stack'

const app = new cdk.App()

const appName = 'word-collect'
const environment = app.node.tryGetContext('environment') || 'dev'

const collectionStack = new CollectionStack(
  app,
  `${appName}-${environment}-collection-stack`,
  {
    appName,
    environment,
    description: 'Collection stack for collection service',
    env: {
      account: process.env.CDK_DEFAULT_ACCOUNT,
      region: process.env.CDK_DEFAULT_REGION
    }
  }
)

// Add tags to all stacks
const tags = {
  Environment: environment,
  Service: 'collection-service',
  Application: appName
}

Object.entries(tags).forEach(([key, value]) => {
  cdk.Tags.of(collectionStack).add(key, value)
})
