import { ApiError, Client, Environment } from "square";

const accessToken = process.env.SQUARE_ACCESS_TOKEN;
if (!accessToken) {
  throw new Error("missing access token");
}
const isProduction = process.env.NODE_ENV === "production";
console.log("accessToken", accessToken, "isProduction", isProduction);

const client = new Client({
  environment: isProduction ? Environment.Production : Environment.Sandbox,
  accessToken: accessToken,
});

export { ApiError, client };
