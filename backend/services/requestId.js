import { nanoid } from "nanoid";

export function requestIdMiddleware(req, res, next) {
  req.requestId = req.header("x-request-id") || generateRequestId();
  res.setHeader("x-request-id", req.requestId);
  next();
}

export function generateRequestId() {
  return `req_${nanoid(12)}`;
}
