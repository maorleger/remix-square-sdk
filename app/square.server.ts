import { ApiError, Client, Environment } from "square";
import config from "./config.server";

const accessToken = config.squareAccessToken;

const client = new Client({
  environment: Environment.Sandbox,
  accessToken: accessToken,
});

export { ApiError, client };
