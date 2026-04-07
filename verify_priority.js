
function getPriority(connection) {
  const isCustomIntegration = connection === "linear" || connection === "notion";
  const priority = [];

  // Priority 1: Token Vault (for native connections)
  if (!isCustomIntegration) {
    priority.push("Token Vault");
  }

  // Priority 2: Management API
  priority.push("Management API");

  // Final fallback
  priority.push("Auth0 Access Token");

  return priority;
}

const testCases = ["google-oauth2", "slack", "github", "linear", "notion"];

testCases.forEach(conn => {
  console.log(`Connection: ${conn} -> Priority: ${getPriority(conn).join(" -> ")}`);
});
