export function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

export function notFound(message) {
  return httpError(404, message);
}
