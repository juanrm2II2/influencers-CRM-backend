# Privacy Policy

**Last Updated:** 2026-04-10

## 1. Introduction

This Privacy Policy explains how **Influencers CRM** ("we", "our", "us") collects, uses, stores, and protects personal data when you use our influencer customer relationship management platform (the "Service").

We are committed to protecting your privacy and complying with applicable data protection laws, including the General Data Protection Regulation (GDPR) and the California Consumer Privacy Act (CCPA).

## 2. Data Controller

The data controller responsible for your personal data is the organization operating this instance of Influencers CRM. Contact details are available from your system administrator.

## 3. Data We Collect

### 3.1 User Account Data
- Email address
- User ID (from authentication provider)
- User role

### 3.2 Influencer Profile Data
- Social media handles and platform identifiers
- Public profile information (name, bio, profile picture URL)
- Follower/following counts and engagement metrics
- Platform profile URLs

### 3.3 Outreach Data
- Contact dates and channels
- Messages sent and responses received
- Follow-up dates

### 3.4 Technical Data
- Anonymized IP addresses (last octet zeroed for IPv4)
- Request correlation IDs
- Audit log entries (actions performed)

## 4. Legal Basis for Processing

We process personal data under the following legal bases:

- **Legitimate Interest:** Operating the CRM platform, managing influencer relationships
- **Consent:** Marketing communications, analytics, third-party data sharing
- **Contractual Necessity:** Providing the Service to authenticated users
- **Legal Obligation:** Maintaining audit logs for compliance purposes

## 5. How We Use Your Data

- To provide and maintain the Service
- To manage influencer profiles and outreach activities
- To generate analytics and reports
- To maintain security and prevent abuse
- To comply with legal obligations

## 6. Data Sharing

We may share data with:

- **ScrapeCreators API:** We use ScrapeCreators to fetch publicly available social media profile data. This is governed by a Data Processing Agreement. See Section 13.
- **Cloud Infrastructure Providers:** Our hosting and database providers process data on our behalf under appropriate data processing agreements.

We do not sell personal data to third parties.

## 7. Data Retention

We apply the following retention periods:

| Data Type | Retention Period | Justification |
|-----------|-----------------|---------------|
| Audit logs | 90 days (configurable) | Security and compliance |
| Revoked tokens | 30 days (configurable) | Security |
| DSAR requests | 365 days (configurable) | Regulatory compliance |
| Influencer profiles | Until deleted by user | Business purpose |
| Consent records | Until account deletion | Legal requirement |

Automated purging runs periodically to enforce these policies. Retention periods can be configured via environment variables (`RETENTION_AUDIT_LOG_DAYS`, `RETENTION_REVOKED_TOKENS_DAYS`, `RETENTION_DSAR_DAYS`).

## 8. Your Rights

Under GDPR and applicable laws, you have the right to:

### 8.1 Right of Access (DSAR)
Request a copy of all personal data we hold about you.
- **Endpoint:** `GET /api/privacy/export`
- **Endpoint:** `POST /api/privacy/requests` with `request_type: "access"`

### 8.2 Right to Erasure (Right to Be Forgotten)
Request deletion of your personal data.
- **Endpoint:** `DELETE /api/privacy/data`
- **Endpoint:** `POST /api/privacy/requests` with `request_type: "erasure"`

### 8.3 Right to Data Portability
Receive your data in a structured, machine-readable format (JSON).
- **Endpoint:** `GET /api/privacy/export`

### 8.4 Right to Withdraw Consent
Withdraw previously granted consent at any time.
- **Endpoint:** `POST /api/privacy/consent` with `granted: false`

### 8.5 Right to Rectification
Request correction of inaccurate personal data. Contact your system administrator.

### 8.6 Right to Restrict Processing
Request restriction of processing under certain circumstances. Contact your system administrator.

## 9. Consent Management

We provide granular consent management for the following categories:

- **Data Processing:** Consent to process your data for the Service
- **Marketing:** Consent to receive marketing communications
- **Analytics:** Consent to include your data in analytics
- **Third-Party Sharing:** Consent to share data with third parties

Manage your consent preferences via:
- `GET /api/privacy/consent` — view current consent status
- `POST /api/privacy/consent` — update consent preferences

## 10. Security Measures

We implement the following security measures:

- HTTPS enforcement in production
- JWT-based authentication with token revocation
- Role-based access control
- Input validation and sanitization
- Rate limiting
- IP address anonymization in logs
- Structured audit logging
- Helmet security headers

## 11. International Data Transfers

If data is transferred outside your jurisdiction, we ensure appropriate safeguards are in place, such as Standard Contractual Clauses or adequacy decisions.

## 12. Children's Privacy

The Service is not intended for use by individuals under the age of 16. We do not knowingly collect personal data from children.

## 13. Third-Party Data Processors

### ScrapeCreators
- **Purpose:** Fetching publicly available social media profile data
- **Data Shared:** Social media handles and platform identifiers
- **Safeguards:** Data Processing Agreement in place, HTTPS-only communication, API key authentication
- **See:** `docs/DATA_PROCESSING_AGREEMENT.md`

## 14. Changes to This Policy

We may update this Privacy Policy from time to time. Changes will be communicated through the Service. Your continued use of the Service after changes constitutes acceptance.

## 15. Contact

For privacy-related inquiries, data subject access requests, or complaints, contact your system administrator or the designated Data Protection Officer.

---

*This privacy policy is provided as a template. Organizations deploying this software should customize it to reflect their specific data processing activities, jurisdictions, and legal requirements.*
