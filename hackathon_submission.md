## Inspiration
Switching between Slack, Gmail, and IDEs kills developer focus. We built Lightly to create a mission control for developers. By linking a repository, users can modify projects anywhere through a unified workspace and an AI agent that orchestrates their entire tool stack.

## What it does
Lightly is an AI-powered workspace that unifies development with management and communication.
*   **Repo to Sandbox**: Link any repo to launch a live project preview on DigitalOcean.
*   **Project Aware Agent**: An AI that manages Slack messages, Linear tasks, Notion docs, and Google Calendar events.
*   **Contextual Sync**: The agent automatically scopes all actions to the correct project and team.

## How we built it
*   **Frontend**: Next.js with a premium, focused design.
*   **Agent**: Python FastAPI handling tool routing and logic.
*   **Auth**: Auth0 for identity and secure integration management.
*   **Infrastructure**: DigitalOcean Droplets and ngrok for live previews.

## Challenges we ran into
*   **Token Fragmentation**: Managing OAuth lifecycles for multiple APIs with different expiry policies was a security risk.
*   **Iframe Security**: Configuring CORS and CSP to allow sandboxes to embed securely across domains.
*   **Syncing**: Building a bridge between agent actions and the UI for instant updates.

## Accomplishments that we're proud of
*   **Auth0 Token Vault Integration**: We used the federated token exchange flow to get provider access tokens on demand.
*   **Zero Trust Flow**: Leveraging Token Vault ensures raw third-party secrets never reside in our application logic.
*   **One Click Setup**: A system that detects connection types and handles exchanges via the Auth0 Management API automatically.

## What we learned
*   **Federated Identity**: Auth0 Token Vault abstracted the complexity of refreshing tokens for Google, Slack, and other providers.
*   **Agentic Reliability**: AI systems are only as good as their data access. Secure, reliable token flows are the foundation of a working agent.

## What's next for Lightly
*   **GitHub Integration**: Allowing the agent to open PRs and commit code directly.
*   **Automated Workflows**: Multi-step sequences that trigger across different apps based on project events.
*   **Enhanced Sandboxing**: Scalable environments for complex multi-container repositories.

***

### Auth0 Token Vault Highlight
Lightly uses Auth0 as a **secure token proxy**. When the agent needs to act, it calls our backend to perform a **Federated Token Exchange**. Auth0 identifies the user, refreshes the provider token in the background, and returns a valid credential. This allows the agent to function autonomously without the user ever needing to manually re-login to individual services.

***

# 📝 BONUS BLOG POST: Scaling AI Agentic Workflows with Auth0 Token Vault

Building an AI agent that can truly "act" on behalf of a user is a daunting task, primarily because of the security risks associated with third-party integrations. Traditionally, developers were forced to choose between a poor user experience (frequent re-authentication) or a major security risk (storing raw, long-lived access tokens in a local database). When we set out to build **Lightly**, we knew we needed a third option. That is where Auth0 Token Vault became our secret weapon.

### The Integration Wall
In the early days of development, our AI agent struggled with "integration fragmentation." We were trying to manage OAuth flows for Slack, Linear, Notion, and Google simultaneously. Every service has its own token expiry window and refresh logic. Orchestrating this at scale meant building a complex, error-prone token manager that sat dangerously close to our main application logic.

### Solving the "401" Problem with Token Vault
By implementing **Auth0 Token Vault**, we moved the security burden from our database to a world-class identity provider. Our biggest achievement was the implementation of the **Federated Token Exchange** (`urn:auth0:params:oauth:grant-type:token-exchange:federated-connection-access-token`). This architecture allows our Python-based AI agent to request a fresh token only when it is actually needed. 

Instead of our backend storing sensitive client secrets for every service, we use Auth0 as a secure vault. When the agent wants to post a Slack update, it performs a secure handshake with Auth0. Auth0 verifies the session, refreshes the underlying Slack token using its own encrypted storage, and returns a short-lived credential to our agent.

### The Future of Agentic Autonomy
This shift unlocked true autonomy for Lightly. Because Token Vault handles the complexities of federated identity, our agent can function during long-running background tasks without ever hitting a "401 Unauthorized" error. It ensures that the developer's "mission control" remains active and connected, regardless of how many tools are in the stack. By leveraging Token Vault, we stopped being "token managers" and started being "agent architects," focusing on the logic that actually matters: helping developers move faster.
