import { httpRouter } from "convex/server";
import { auth } from "./auth";
import { botHttp } from "./botHttp";

const http = httpRouter();

auth.addHttpRoutes(http);
for (const method of ["GET", "POST", "PATCH", "PUT", "DELETE"] as const) {
  http.route({ pathPrefix: "/api/bots/v1/", method, handler: botHttp });
}

export default http;
