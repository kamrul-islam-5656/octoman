function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error ?? "Unknown database error.");
}

export function getDatabaseErrorMessage(error: unknown): string {
  const message = getErrorMessage(error);

  if (message.includes("MONGODB_URI is required")) {
    return "Database is not configured. Set MONGODB_URI in .env.local.";
  }

  if (message.includes("MONGODB_CONNECT_MODE=fallback requires")) {
    return "Fallback mode is enabled but MONGODB_URI_FALLBACK is missing. Add a standard mongodb:// Atlas URI to MONGODB_URI_FALLBACK.";
  }

  if (message.includes("no MONGODB_URI_FALLBACK is configured")) {
    return "SRV/network lookup failed. Configure MONGODB_URI_FALLBACK with a non-SRV mongodb:// URI or fix firewall DNS rules.";
  }

  if (message.includes("querySrv ECONNREFUSED")) {
    return "Cannot resolve MongoDB Atlas SRV record. Check DNS/firewall settings or use the non-SRV mongodb:// connection string.";
  }

  if (message.includes("ENOTFOUND")) {
    return "MongoDB host could not be resolved. Verify your MongoDB URI and network DNS settings.";
  }

  if (message.includes("ECONNREFUSED")) {
    return "MongoDB refused the connection. Verify Atlas network access and URI credentials.";
  }

  if (message.includes("authentication failed")) {
    return "MongoDB authentication failed. Verify Atlas username/password and URI encoding.";
  }

  return "Database connection failed. Check MongoDB Atlas URI, credentials, and network allowlist.";
}