# Repository Operations

## LINE change notifications

After completing and deploying a user-requested code or configuration change:

1. Verify the deployed batch and the existing `ts-league-auto-input` service.
2. Send a LINE notification using the deployed server's existing LINE secrets.
3. Include the implemented behavior, configurable parameters, deployment commit, and verification result.
4. Never include credentials or secret values in the notification or logs.

Do not send a change notification for questions or investigations that do not modify the repository or deployed configuration.
