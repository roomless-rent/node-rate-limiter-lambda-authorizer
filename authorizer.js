const { DynamoDB } = require("@aws-sdk/client-dynamodb");
const { RateLimiterDynamo } = require("rate-limiter-flexible");
const jwt = require('jsonwebtoken');

const RATE_LIMITER_SECONDS = 60;
const dynamoClient = new DynamoDB();

const rateLimiter = new RateLimiterDynamo({
    storeClient: dynamoClient,
    points: Number(process.env.DEFAULT_RATE_LIMIT) | 30,
    duration: RATE_LIMITER_SECONDS,
    tableName: 'api-rate-limiter-prod',
    tableCreated: true,
    keyPrefix: 'not-admin'
});

const rateLimiterAdmin = new RateLimiterDynamo({
    storeClient: dynamoClient,
    points: Number(process.env.ADMIN_RATE_LIMIT) | 90,
    duration: RATE_LIMITER_SECONDS,
    tableName: 'api-rate-limiter-prod',
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
        callback(null, generatePolicy('Deny', event.methodArn, {}));
    }

    let token = null;

    if (request.headers['Authorization']) {
        const bearer = request.headers['Authorization'].replace('Bearer ', '');
        console.log(`Bearer: ${bearer}`);
        console.log(process.env)
        try {
            token = jwt.verify(bearer, process.env.JWT_SECRET);
            console.log(`Verified token: ${JSON.stringify(token)}`);
        } catch(e){
            console.error(`Failed to verify token ${e}`);
        }
    }

    let rateLimiterRes = null;
    let policy = null;

    // Use different rate limiter for admins
    if (token && token.roles?.includes('ROLE_ADMIN')) {
        console.log(`Using admin rate limiter for ip: ${request.sourceIp}, email: ${token.sub}`);
        try {
            rateLimiterRes = await rateLimiterAdmin.consume(request.sourceIp);
            policy = generatePolicy('Allow', event.methodArn);
        } catch(e) {
            policy = generatePolicy('Deny', event.methodArn);
        }
    } else {
        console.log(`Using default rate limiter for ip ${request.sourceIp}, email: ${token?.sub || 'N/A'}`);
        try {
            rateLimiterRes =  await rateLimiter.consume(request.sourceIp);
            policy = generatePolicy('Allow', event.methodArn);
        } catch(e) {
            policy = generatePolicy('Deny', event.methodArn);
        }
    }

    console.log(`Rate limiter result for ip ${request.sourceIp} (${request.userAgent}): ${rateLimiterRes}`);
    callback(null, policy);
}

/**
 * Generates a policy with the specified effect.
 *
 * @param {string} effect - The effect of the policy (Allow or Deny)
 * @return {Object} The generated policy object.
 */
function generatePolicy(effect, resource) {

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
        }
    }
}