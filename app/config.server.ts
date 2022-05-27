function ensureEnvVar(envVarName: string) {
  const value = process.env[envVarName];
  if (value === undefined) {
    throw new Error(`Missing environment variable ${envVarName}`);
  }
  return value;
}

const config = {
  databaseUrl: ensureEnvVar("DATABASE_URL"),
  sessionSecret: ensureEnvVar("SESSION_SECRET"),
  squareAppId: ensureEnvVar("APP_ID"),
  squareLocationId: ensureEnvVar("LOCATION_ID"),
  squareAccessToken: ensureEnvVar("SQUARE_ACCESS_TOKEN"),
};

export default config;
