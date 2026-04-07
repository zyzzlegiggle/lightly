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
