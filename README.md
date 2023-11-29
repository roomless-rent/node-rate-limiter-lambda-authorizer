# node-rate-limiter-lambda-authorizer
An AWS lambda authorizer implementation using [node-rate-limiter-flexible](https://github.com/animir/node-rate-limiter-flexible).

## Deploy instruction
NODE_ENV=<env> sls deploy
NODE_ENV=<env> sls deploy function -f authorizer

# Dynamo table definition 
The dynamo table should have the following field:
- key: S
- expire: N

DO NOT FORGET TO PUT THE CORRECT ARN NAME IN THE SERVERLESS.YAML