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

# JWT TOKEN
Do not forget to set the JWT SECRET token when deploying the lambda authorizer

# Environment
- NODE_ENV -> Specifica l'ambiente DEV o PROD
- ROOMLESS_JWT_SECRET -> Secret per verificare i token degli utenti roomless
- AUTHORIZER_JWT_SECRET -> Secret per verificare i supertoken (se valido limiter viene skippato)
- DEFAULT_RATE_LIMIT -> Chiamate al minuto massime per NON admin (loggati e non loggati)
- ADMIN_RATE_LIMIT -> Chiamate al minuto massi per utenti admin
- DISABLE_AUTHORIZER -> Se true authorizer ritorna sempre politica Allow (consente tutto, killswitch)