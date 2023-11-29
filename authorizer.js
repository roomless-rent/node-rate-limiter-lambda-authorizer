const { DynamoDB } = require("@aws-sdk/client-dynamodb");
const { RateLimiterDynamo } = require("rate-limiter-flexible");
const jwt = require('jsonwebtoken');

const RATE_LIMITER_SECONDS = 60;
const dynamoClient = new DynamoDB();

const rateLimiter = new RateLimiterDynamo({
    storeClient: dynamoClient,
    points: Number(process.env.DEFAULT_RATE_LIMIT) | 30,
    duration: RATE_LIMITER_SECONDS,
    tableName: `api-rate-limiter-${process.env.NODE_ENV}`,
    tableCreated: true,
    keyPrefix: 'not-admin'
});

const rateLimiterAdmin = new RateLimiterDynamo({
    storeClient: dynamoClient,
    points: Number(process.env.ADMIN_RATE_LIMIT) | 90,
    duration: RATE_LIMITER_SECONDS,
    tableName: `api-rate-limiter-${process.env.NODE_ENV}`,
    tableCreated: true,
    keyPrefix: 'admin'
});

module.exports.handler = async function(event, context, callback) {

    const request = {
        headers: event.headers,
        context: event.requestContext,
        path: event.requestContext.path,
        sourceIp: event.requestContext.identity.sourceIp,
        userAgent: event.requestContext.identity.userAgent,
    }

    if (!request.sourceIp) {
        console.error('No source ip found, returning deny');
        return generatePolicy('Deny', event.methodArn);
    }

    const host = `${request.sourceIp} (${request.userAgent})`;
    let token = null;

    // Supertoken, if provided no rate limiter is used
    if (request.headers['x-authorizer-token']) {
        const bearer = request.headers['x-authorizer-token'];
        try {
            const authorizerToken = jwt.verify(bearer, process.env.AUTHORIZER_JWT_TOKEN);
            console.log(`Found valid authorizer token (supertoken) from host ${host}. Token: ${JSON.stringify(authorizerToken)}`);
            return generatePolicy('Allow', event.methodArn);
        } catch(_) {}
    }

    if (request.headers['Authorization']) {
        const bearer = request.headers['Authorization'].replace('Bearer ', '');
        try {
            token = jwt.verify(bearer, process.env.ROOMLESS_JWT_SECRET);
            console.log(`Found verified token from host ${host}. Token: ${JSON.stringify(token)}`);
        } catch(e) {
            console.error(`Failed to verify token ${e}`);
        }
    }

    let rateLimiterRes = null;
    let policy = null;

    // Use different rate limiter for admins
    if (token && token.roles?.includes('ROLE_ADMIN')) {
        console.log(`Using admin rate limiter for host: ${host}, email: ${token.sub}`);
        try {
            rateLimiterRes = await rateLimiterAdmin.consume(request.sourceIp);
            policy = generatePolicy('Allow', event.methodArn, rateLimiterRes);
        } catch(e) {
            policy = generatePolicy('Deny', event.methodArn, e);
        }
    } else {
        console.log(`Using default rate limiter for host ${host}, email: ${token?.sub || 'N/A'}`);
        try {
            rateLimiterRes =  await rateLimiter.consume(request.sourceIp);
            policy = generatePolicy('Allow', event.methodArn, rateLimiterRes);
        } catch(e) {
            policy = generatePolicy('Deny', event.methodArn, e);
        }
    }

    console.log(`Rate limiter result for host ${host}: ${rateLimiterRes}`);
    return policy;
}

/**
 * Generates a policy with the specified effect.
 *
 * @param {string} effect - The effect of the policy (Allow or Deny)
 * @return {Object} The generated policy object.
 */
function generatePolicy(effect, resource, context) {

    return {
        principalId: "user",
        policyDocument: {
            Version: "2012-10-17",
            Statement: [
                {
                    Action: "execute-api:Invoke",
                    Effect: effect,
                    Resource: resource
                }
            ]
        },
        context: context
    }
}