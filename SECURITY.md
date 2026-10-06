# Security

Do not commit access tokens, app secrets, webhook secrets, customer phone numbers, customer chat exports or unredacted production payloads.

Use Cloudflare secrets for credentials. Test fixtures must use fictional identifiers and anonymized message content.

If a secret is committed accidentally, revoke and rotate it immediately; deleting the file from the latest commit is not sufficient.

