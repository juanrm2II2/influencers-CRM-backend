# Terms of Service

**Last Updated:** 2026-04-10

## 1. Acceptance of Terms

By accessing or using the Influencers CRM platform (the "Service"), you agree to be bound by these Terms of Service ("Terms"). If you do not agree, do not use the Service.

## 2. Description of Service

Influencers CRM is a customer relationship management platform designed for managing influencer profiles, tracking outreach activities, and organizing influencer marketing campaigns. The Service provides:

- Influencer profile search and management
- Outreach tracking and communication logs
- Analytics and engagement metrics
- Data export and privacy management tools

## 3. User Accounts

### 3.1 Authentication
Access to the Service requires authentication via a valid JWT token issued by the configured authentication provider (Supabase). You are responsible for maintaining the confidentiality of your credentials.

### 3.2 Account Responsibilities
- You must provide accurate information
- You are responsible for all activities under your account
- You must notify the administrator immediately of any unauthorized access
- Sharing credentials is prohibited

## 4. Acceptable Use

You agree not to:

- Attempt to bypass authentication or authorization controls
- Submit malicious input (SQL injection, XSS, etc.)
- Exceed rate limits or abuse the API
- Use the Service for any illegal purpose
- Scrape or harvest data beyond the Service's intended functionality
- Attempt to access other users' data without authorization

## 5. Data Processing

### 5.1 Influencer Data
The Service processes publicly available social media data through third-party APIs (ScrapeCreators). By using the search functionality, you acknowledge that:

- Profile data is fetched from public sources
- Data accuracy depends on third-party API providers
- You are responsible for ensuring your use complies with applicable laws

### 5.2 User Data
Your personal data is processed in accordance with our [Privacy Policy](PRIVACY_POLICY.md). You retain the right to access, export, and delete your data as described therein.

## 6. Privacy and Data Protection

We are committed to protecting your privacy. Please review our [Privacy Policy](PRIVACY_POLICY.md) for details on:

- What data we collect and why
- Your rights under GDPR and applicable laws
- How to exercise your data subject rights
- Our data retention policies

## 7. Intellectual Property

- The Service software is provided under the terms of its license (see repository LICENSE file)
- Data you input remains your property
- Publicly available influencer data is subject to the respective platforms' terms of service

## 8. API Usage

### 8.1 Rate Limits
The Service enforces rate limits (100 requests per 15-minute window by default). Exceeding these limits will result in temporary access restrictions.

### 8.2 Bulk Operations
Bulk search operations are limited to 50 handles per request. This limit exists to ensure fair usage and system stability.

## 9. Service Availability

- The Service is provided "as is" without guarantees of uptime or availability
- We may perform maintenance that temporarily affects availability
- We reserve the right to modify or discontinue features with reasonable notice

## 10. Security

### 10.1 Our Obligations
We implement industry-standard security measures including:
- HTTPS encryption
- JWT authentication with token revocation
- Role-based access control
- Input validation and sanitization
- Audit logging

### 10.2 Your Obligations
- Keep your authentication credentials secure
- Report security vulnerabilities responsibly
- Do not attempt to circumvent security controls

## 11. Limitation of Liability

To the maximum extent permitted by law:

- The Service is provided "as is" and "as available"
- We disclaim all warranties, express or implied
- We are not liable for indirect, incidental, or consequential damages
- Our total liability is limited to the amount paid for the Service

## 12. Indemnification

You agree to indemnify and hold harmless the Service operators from claims arising from:

- Your violation of these Terms
- Your misuse of the Service
- Your violation of any third-party rights

## 13. Termination

- We may suspend or terminate access for violation of these Terms
- You may terminate your use at any time
- Upon termination, you may request data export and erasure under our Privacy Policy

## 14. Modifications

We reserve the right to modify these Terms at any time. Changes will be communicated through the Service. Continued use after changes constitutes acceptance.

## 15. Governing Law

These Terms are governed by the laws of the jurisdiction in which the Service operator is established, without regard to conflict of law provisions.

## 16. Severability

If any provision of these Terms is found unenforceable, the remaining provisions continue in effect.

## 17. Contact

For questions about these Terms, contact your system administrator.

---

*These terms of service are provided as a template. Organizations deploying this software should customize them to reflect their specific legal requirements and jurisdiction.*
