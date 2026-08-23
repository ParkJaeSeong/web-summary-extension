# Security Policy

## Supported version

Security fixes are applied to the latest PageMind beta source and release package.

## Reporting a vulnerability

Do not include API keys, private documents, or other sensitive data in a public issue. Until a
dedicated private security contact is published, provide a minimal reproduction without secrets and
mark the report as security-sensitive in the repository issue tracker. A private reporting address
must be added before public release.

## Security model

PageMind runs inside the user's Chrome profile and stores credentials locally. It validates provider
and PDF destinations, requests exact optional origins, uses a self-only extension CSP, and does not
execute provider responses as code. This does not protect data from malware or another person who
already controls the device or browser profile.
