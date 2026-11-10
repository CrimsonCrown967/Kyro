import { httpRouter } from "convex/server";
import { auth } from "./auth";
import { botHttp } from "./botHttp";

const http = httpRouter();

auth.addHttpRoutes(http);
for (const method of ["GET", "POST", "PUT", "PATCH", "DELETE"] as const) {
  http.route({ pathPrefix: "/bot-api/v1/", method, handler: botHttp });
}

export default http;
