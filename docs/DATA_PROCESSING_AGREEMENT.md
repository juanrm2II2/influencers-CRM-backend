# Data Processing Agreement (DPA)

**Between:**
- **Data Controller:** The organization operating this instance of Influencers CRM (the "Controller")
- **Data Processor:** ScrapeCreators (the "Processor")

**Effective Date:** _______________

---

## 1. Purpose and Scope

This Data Processing Agreement ("DPA") governs the processing of personal data by the Processor on behalf of the Controller in connection with the ScrapeCreators API service used by the Influencers CRM platform.

### 1.1 Services Provided
The Processor provides an API service that retrieves publicly available social media profile data from platforms including TikTok, Instagram, YouTube, and Twitter/X.

### 1.2 Data Processed

| Data Category | Data Elements | Source |
|--------------|---------------|--------|
| Social media identifiers | Handles, usernames | Controller (input) |
| Public profile information | Full name, bio, profile picture URL | Social media platforms (public) |
| Engagement metrics | Follower/following counts, average likes/views | Social media platforms (public) |
| Platform URLs | Profile page URLs | Social media platforms (public) |

## 2. Data Processing Instructions

### 2.1 Purpose Limitation
The Processor shall process personal data only:
- To fulfill API requests made by the Controller
- To retrieve publicly available social media profile data
- As necessary for the performance of the service

### 2.2 Prohibited Processing
The Processor shall not:
- Process personal data for any purpose other than fulfilling the Controller's API requests
- Sell, rent, or share personal data with third parties
- Use personal data for profiling, advertising, or marketing
- Retain personal data longer than necessary to fulfill the request

## 3. Data Protection Obligations

### 3.1 Security Measures
The Processor shall implement appropriate technical and organizational measures, including:
- HTTPS/TLS encryption for all API communications
- API key authentication
- Access controls and logging
- Regular security assessments

### 3.2 Controller's Security Measures
The Controller implements the following measures:
- HTTPS enforcement for all API calls to the Processor
- API key stored securely (environment variable, not in source code)
- Input validation before API calls
- Response validation using schema validation (Zod)
- Rate limiting on outbound API calls

## 4. Sub-Processors

### 4.1 Authorization
The Processor may engage sub-processors only with prior written authorization from the Controller.

### 4.2 Sub-Processor Obligations
Any sub-processor must be bound by data protection obligations no less protective than those in this DPA.

### 4.3 Current Sub-Processors
The Processor shall maintain a list of current sub-processors and notify the Controller of any changes.

## 5. Data Subject Rights

### 5.1 Assistance
The Processor shall assist the Controller in responding to data subject requests, including:
- Access requests
- Erasure requests
- Data portability requests
- Rectification requests

### 5.2 Response Time
The Processor shall respond to assistance requests within 10 business days.

## 6. Data Breach Notification

### 6.1 Notification Timeline
The Processor shall notify the Controller of any personal data breach without undue delay and no later than 72 hours after becoming aware of the breach.

### 6.2 Notification Contents
Breach notifications shall include:
- Nature of the breach
- Categories and approximate number of data subjects affected
- Likely consequences
- Measures taken or proposed to mitigate the breach

## 7. Data Retention and Deletion

### 7.1 Retention Period
The Processor shall not retain personal data beyond the time necessary to fulfill the API request.

### 7.2 Deletion
Upon termination of the service agreement or upon the Controller's request, the Processor shall delete all personal data processed on behalf of the Controller.

### 7.3 Certification
The Processor shall provide written certification of data deletion upon request.

## 8. International Data Transfers

### 8.1 Transfer Mechanisms
If personal data is transferred to countries without an adequate level of data protection, the Processor shall ensure appropriate safeguards are in place, such as:
- Standard Contractual Clauses (SCCs)
- Binding Corporate Rules (BCRs)
- Adequacy decisions

### 8.2 Transfer Impact Assessment
The Processor shall cooperate with the Controller in conducting transfer impact assessments as required.

## 9. Audits and Inspections

### 9.1 Audit Rights
The Controller has the right to audit the Processor's compliance with this DPA, subject to reasonable notice.

### 9.2 Cooperation
The Processor shall cooperate with audits and provide necessary information to demonstrate compliance.

## 10. Liability and Indemnification

### 10.1 Processor Liability
The Processor is liable for damages caused by processing that violates this DPA or applicable data protection laws.

### 10.2 Indemnification
Each party shall indemnify the other for losses arising from the indemnifying party's breach of this DPA.

## 11. Term and Termination

### 11.1 Duration
This DPA remains in effect for the duration of the service agreement between the parties.

### 11.2 Survival
Obligations relating to data deletion, confidentiality, and liability survive termination.

### 11.3 Termination for Breach
Either party may terminate this DPA if the other party materially breaches its obligations and fails to cure within 30 days of notice.

## 12. Governing Law

This DPA is governed by the same laws that govern the main service agreement between the parties.

## 13. Amendments

This DPA may be amended only by written agreement signed by both parties.

---

## Signatures

**Data Controller:**

Name: ___________________________

Title: ___________________________

Date: ___________________________

Signature: ___________________________

---

**Data Processor (ScrapeCreators):**

Name: ___________________________

Title: ___________________________

Date: ___________________________

Signature: ___________________________

---

*This Data Processing Agreement is provided as a template. Organizations should have it reviewed by legal counsel before execution. It should be customized based on the specific data processing activities, jurisdictions, and regulatory requirements applicable to your organization.*
