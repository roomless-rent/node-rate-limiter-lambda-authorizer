const { DynamoDB } = require("@aws-sdk/client-dynamodb");
const { RateLimiterDynamo } = require("rate-limiter-flexible");
const jwt = require("jsonwebtoken");

const RATE_LIMITER_SECONDS = 60;
const dynamoClient = new DynamoDB();

const rateLimiter = new RateLimiterDynamo({
  storeClient: dynamoClient,
  points: Number(process.env.DEFAULT_RATE_LIMIT),
  duration: RATE_LIMITER_SECONDS,
  tableName: `api-rate-limiter-${process.env.NODE_ENV}`,
  tableCreated: true,
  keyPrefix: "not-admin",
});

const rateLimiterAdmin = new RateLimiterDynamo({
  storeClient: dynamoClient,
  points: Number(process.env.ADMIN_RATE_LIMIT),
  duration: RATE_LIMITER_SECONDS,
  tableName: `api-rate-limiter-${process.env.NODE_ENV}`,
  tableCreated: true,
  keyPrefix: "admin",
});

module.exports.handler = async function (event, context, callback) {
  // Controllo kill-switch
  if (process.env.DISABLE_AUTHORIZER === "true") {
    console.warn("Kill-switch is enabled, so the authorizer: returning allow");
    return generatePolicy("Allow", event.methodArn);
  }

  // Controllo la presenza di un Super token
  if (event.headers["x-authorizer-token"]) {
    try {
      jwt.verify(
        event.headers["x-authorizer-token"],
        process.env.AUTHORIZER_JWT_SECRET
      );
      console.log(`There is a valid Super token in the request`);
      return generatePolicy("Allow", event.methodArn);
    } catch (_) {}
  }

  // Richiesta in ingresso
  const request = {
    headers: event.headers,
    context: event.requestContext,
    path: event.requestContext.path,
    sourceIp: event.requestContext.identity.sourceIp,
    userAgent: event.requestContext.identity.userAgent,
    vercelRealIp: event.headers["x-vercel-real-ip"], // Avvocato, questo ce lo puo' mettere chiunque
  };

  // Indirizzo IP dell'utente (ottenuto tramite Vercel oppure dalla sorgente)
  const hostIP = request.vercelRealIp || request.sourceIp;
  if (request.vercelRealIp) {
    console.debug(`IP address obtained from Vercel: ${request.vercelRealIp}`);
  }

  if (!hostIP) {
    console.error("IP Address not found, returning deny");
    return generatePolicy("Deny", event.methodArn);
  }

  const host = `${hostIP} (${request.userAgent})`;
  console.log(`New request from host ${host} on path ${request.path}`);

  let token = null;
  const authorization =
    request.headers["authorization"] || request.headers["Authorization"];
  if (authorization) {
    console.debug(
      `(${hostIP}) Found a token in Authorization: ${authorization}`
    );
    const bearer = authorization.replace("Bearer ", "").trim();
    try {
      token = jwt.verify(bearer, process.env.ROOMLESS_JWT_SECRET);
      console.debug(
        `(${hostIP}) Found a valid Bearer token with the following information: ${JSON.stringify(
          token
        )}`
      );
    } catch (e) {
      console.error(
        `(${hostIP}) An error occurred while verifying token (${bearer}) (${token}): ${e}`
      );
    }
  }

  let policy = null;
  let rateLimiterRes = null;
  const isAdmin = token && token.roles?.includes("ROLE_ADMIN");

  console.log(
    `Using ${
      isAdmin ? "admin" : "default"
    } rate limiter for host: ${host}, email: ${token?.sub || "N/A"}`
  );
  try {
    policy = "Allow";
    rateLimiterRes = await (isAdmin ? rateLimiterAdmin : rateLimiter).consume(
      hostIP
    );
  } catch (e) {
    if (e.remainingPoints != null && e.remainingPoints <= 0) {
      policy = "Deny";
      rateLimiterRes = e;
    } else {
      console.error(
        `Unexpected error when consuming rate limiter admin (returning allow) ${JSON.stringify(
          e
        )}`
      );
      return generatePolicy("Allow", event.methodArn);
    }
  }

  console.log(
    `Returning policy ${policy} for host ${host}. Rate limiter result: ${JSON.stringify(
      rateLimiterRes
    )}`
  );
  return generatePolicy(policy, event.methodArn, {
    hostIp: hostIP,
    hostPath: request.path,
    hostUserAgent: request.userAgent,

    limiterMsBeforeNext: rateLimiterRes.msBeforeNext,
    limiterConsumedPoints: rateLimiterRes.consumedPoints,
    limiterRemainingPoints: rateLimiterRes.remainingPoints,
    limiterIsFirstInDuration: rateLimiterRes.isFirstInDuration,

    // ? Il messaggio di errore deve essere contenuto in una stringa
    errorMessage:
      policy === "Deny"
        ? '"Rate limit exceeded, please try again later"'
        : undefined,
  });
};

/**
 * Generates a policy with the specified effect.
 *
 * @param {string} effect - The effect of the policy (Allow or Deny)
 * @return {Object} The generated policy object.
 */
function generatePolicy(effect, resource, context = undefined) {
  return {
    principalId: "user",
    policyDocument: {
      Version: "2012-10-17",
      Statement: [
        {
          Action: "execute-api:Invoke",
          Effect: effect,
          Resource: resource,
        },
      ],
    },
    context: context,
  };
}
