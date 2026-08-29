

# NWHR Refugee Support Platform

## Full Frontend Design Specification

**Stack:** Next.js + TypeScript + Tailwind CSS + shadcn/ui + TanStack
**Application:** NWHR Refugee Support Platform
**Design approach:** Accessible, humanitarian, professional, mobile-first

---

# 1. Project Overview

Build a modern refugee support platform for NWHR.

The platform has two primary experiences:

### Public / Beneficiary Experience

Refugees, asylum seekers and other beneficiaries can:

* Learn about NWHR
* Explore services
* Use the AI support assistant
* Request assistance
* Submit personal information
* Upload supporting documents
* Track service requests
* Receive updates
* View referrals
* Access resources
* Contact NWHR

### Staff Experience

NWHR staff can:

* Log in securely
* View dashboard statistics
* Manage beneficiaries
* Review service requests
* Review uploaded documents
* Assign cases
* Add case notes
* Create referrals
* Manage programmes
* Communicate with beneficiaries
* View reports
* Manage system settings

The frontend must clearly separate the public beneficiary experience from the staff portal.

---

# 2. Technology Stack

## Core

* Next.js
* TypeScript
* React
* Tailwind CSS

## UI

* shadcn/ui
* Radix UI primitives
* Lucide React icons

## Data Management

* TanStack Query
* TanStack Table
* TanStack Form where appropriate

## Forms

Use:

* React Hook Form where appropriate
* Zod validation
* shadcn/ui form components

## Authentication

Authentication is handled through the backend/authentication provider.

The frontend must never contain secret API keys.

## AI

The frontend communicates with the NWHR backend.

```text
Next.js
   ↓
/api/chat
   ↓
Backend
   ↓
Gemini API
```

Never call Gemini directly from client-side components using a private API key.

---

# 3. Design Philosophy

The platform must feel:

* Human
* Safe
* Trustworthy
* Professional
* Simple
* Accessible
* Calm
* Modern

Avoid:

* Excessive animations
* Excessive gradients
* Glassmorphism everywhere
* Tiny text
* Complicated navigation
* Huge numbers of cards
* Overly technical terminology
* Unnecessary popups

The user should always understand what action they can take next.

---

# 4. Brand Direction

Use the approved NWHR logo and brand colours.

Create design tokens instead of hardcoding colours throughout components.

Example:

```text
Primary
Secondary
Accent
Background
Foreground
Muted
Border
Card
Destructive
Success
Warning
```

Use CSS variables so the entire theme can be changed centrally.

Example conceptual structure:

```text
--background
--foreground
--primary
--primary-foreground
--secondary
--secondary-foreground
--muted
--muted-foreground
--accent
--accent-foreground
--destructive
--border
--input
--ring
--card
--card-foreground
```

---

# 5. Typography

Use a highly readable modern font.

Preferred:

* Inter
* Geist
* Plus Jakarta Sans

Recommended hierarchy:

```text
Hero:
48–64px desktop
36–44px mobile

Page title:
36–48px desktop
28–36px mobile

Section heading:
28–40px

Card heading:
18–24px

Body:
16px

Small:
14px
```

Body text should generally use a comfortable line height.

---

# 6. Layout System

Use a consistent container.

```text
max-width: 1280px
margin: auto
padding: 1rem mobile
padding: 2rem desktop
```

Use Tailwind responsive breakpoints.

```text
sm
md
lg
xl
2xl
```

Do not create arbitrary breakpoints unless necessary.

---

# 7. Next.js Application Structure

Use the App Router.

Recommended structure:

```text
src/
├── app/
│   ├── (marketing)/
│   │   ├── page.tsx
│   │   ├── about/
│   │   ├── services/
│   │   ├── programmes/
│   │   ├── resources/
│   │   ├── news/
│   │   ├── donate/
│   │   └── contact/
│   │
│   ├── (beneficiary)/
│   │   ├── get-help/
│   │   ├── dashboard/
│   │   ├── requests/
│   │   └── profile/
│   │
│   ├── staff/
│   │   ├── login/
│   │   └── dashboard/
│   │       ├── page.tsx
│   │       ├── beneficiaries/
│   │       ├── requests/
│   │       ├── referrals/
│   │       ├── documents/
│   │       ├── programmes/
│   │       ├── messages/
│   │       ├── reports/
│   │       └── settings/
│   │
│   ├── api/
│   │   └── ...
│   │
│   ├── layout.tsx
│   ├── globals.css
│   └── not-found.tsx
│
├── components/
│   ├── ui/
│   ├── marketing/
│   ├── beneficiary/
│   ├── staff/
│   ├── chatbot/
│   ├── forms/
│   └── shared/
│
├── features/
│   ├── auth/
│   ├── beneficiaries/
│   ├── requests/
│   ├── referrals/
│   ├── documents/
│   ├── programmes/
│   ├── chatbot/
│   └── notifications/
│
├── lib/
│   ├── api/
│   ├── auth/
│   ├── validations/
│   ├── query/
│   └── utils.ts
│
├── hooks/
├── types/
└── config/
```

---

# 8. shadcn/ui

Use shadcn/ui as the primary UI component system.

Install and use components such as:

```text
Button
Card
Badge
Input
Textarea
Label
Select
Checkbox
RadioGroup
Switch
Dialog
AlertDialog
Sheet
DropdownMenu
Popover
Tooltip
Tabs
Accordion
Alert
Avatar
Breadcrumb
Calendar
Command
DataTable
Pagination
Progress
Separator
Skeleton
Sonner
Table
Textarea
```

Do not build custom versions of components that shadcn/ui already provides unless there is a strong reason.

---

# 9. Component Rules

Components must be reusable.

Bad:

```text
RequestPage.tsx
```

containing 800 lines of UI and business logic.

Prefer:

```text
RequestPage
├── RequestHeader
├── RequestStatus
├── RequestInformation
├── RequestDocuments
├── RequestTimeline
├── RequestNotes
└── RequestActions
```

Keep components focused.

---

# 10. TanStack Query

Use TanStack Query for server state.

Server state includes:

* Beneficiaries
* Service requests
* Referrals
* Documents
* Programmes
* Notifications
* Messages
* Dashboard statistics

Example conceptual query keys:

```text
['beneficiaries']
['beneficiary', id]
['requests']
['request', id]
['referrals']
['referral', id]
['documents']
['programmes']
['notifications']
```

Do not duplicate server state unnecessarily in React state.

Use TanStack Query for:

* Fetching
* Caching
* Refetching
* Mutations
* Loading states
* Error states
* Invalidating stale queries

---

# 11. TanStack Query Provider

Create a central QueryClient provider.

Conceptually:

```text
app
 ↓
Providers
 ↓
QueryClientProvider
 ↓
Application
```

Configure sensible defaults for:

* staleTime
* retry
* refetch behaviour
* mutation handling

Do not create multiple QueryClients unnecessarily.

---

# 12. API Layer

Do not scatter fetch calls throughout components.

Use an API layer.

Example:

```text
lib/
└── api/
    ├── client.ts
    ├── auth.ts
    ├── beneficiaries.ts
    ├── requests.ts
    ├── referrals.ts
    ├── documents.ts
    ├── programmes.ts
    └── chatbot.ts
```

Example conceptual usage:

```text
useRequests()
useRequest(id)
useCreateRequest()
useUpdateRequest()
```

Components should consume hooks rather than directly managing API calls.

---

# 13. TanStack Table

Use TanStack Table for staff data-heavy screens.

Required screens:

* Beneficiaries
* Service Requests
* Referrals
* Documents
* Programmes

Features:

* Sorting
* Filtering
* Pagination
* Column visibility
* Row selection
* Search
* Responsive layout

Desktop:

Use tables.

Mobile:

Transform important rows into cards rather than forcing a wide table onto a small screen.

---

# 14. Public Navigation

Desktop:

```text
NWHR Logo

Home
About Us
Services
Programmes
Get Help
Resources
News & Events
Donate
Contact

Staff Login
```

Make **Get Help** the primary CTA.

Mobile:

```text
Logo                         Menu
```

Use shadcn/ui `Sheet` for the mobile navigation.

---

# 15. Homepage

## Hero

Create a strong humanitarian hero.

Headline:

> Helping Refugees Build Safer, Stronger Futures

Supporting text:

> Access support, documentation assistance, skills development, referrals and other services through NWHR.

Buttons:

```text
[Get Help]
[Explore Services]
```

Hero image:

* Human interaction
* Beneficiary and caseworker
* Professional
* Warm
* Respectful
* No exploitative imagery

Use a responsive image with Next.js `Image`.

---

# 16. Homepage Sections

Order:

```text
Hero
↓
AI Support Assistant
↓
Services
↓
How NWHR Helps
↓
Programmes
↓
Impact / Statistics
↓
Latest News & Events
↓
Call To Action
↓
Partner Logos
↓
Footer
```

Do not overcrowd the homepage.

---

# 17. AI Support Assistant

Create a reusable chatbot component.

```text
ChatAssistant
├── ChatHeader
├── MessageList
├── MessageBubble
├── SuggestedActions
├── ChatInput
└── LoadingIndicator
```

Initial message:

> Hello 👋 I'm the NWHR Support Assistant. I can help you find the right service.

Suggested actions:

```text
Documentation
Permit Assistance
Education
Skills Development
Referral
Other
```

The assistant should gather basic information and route the person to the appropriate service.

The AI must not:

* Make final eligibility decisions
* Claim to be a human
* Give legal guarantees
* Replace NWHR staff
* Expose private system information

When human intervention is needed:

```text
Your request may require assistance from an NWHR staff member.

[Request Human Assistance]
```

---

# 18. Get Help Page

The Get Help experience should be a guided multi-step form.

Use shadcn/ui components.

Steps:

```text
1. Personal Information
2. Service Required
3. Request Details
4. Documents
5. Review
6. Submitted
```

Use a progress indicator.

Do not overwhelm the user with one giant form.

---

# 19. Beneficiary Information

Fields:

```text
First Name
Surname
Gender
Date of Birth
Nationality
Permit Number
Cellphone
Email
```

Use Zod validation.

Show clear errors.

Example:

```text
Please enter a valid cellphone number.
```

Avoid technical validation messages.

---

# 20. Service Selection

Use accessible cards or radio groups.

Services:

```text
Documentation
Permit Assistance
Advocacy
Education
Skills Development
Referral
Other
```

Each option can have:

* Icon
* Title
* Description
* Selection state

---

# 21. Request Details

Fields:

```text
What do you need help with?

[Textarea]
```

Optional:

```text
Preferred contact method
Additional information
```

Keep the language simple.

---

# 22. Document Upload

Create a reusable `DocumentUploader`.

Features:

* Drag and drop
* File picker
* File validation
* Progress indicator
* File preview where appropriate
* Remove file
* Retry upload
* Upload success state
* Upload failure state

Allowed file types should be controlled by backend rules.

Never expose private document URLs publicly.

---

# 23. Review Screen

Before submission show:

```text
Personal Information
Service Requested
Request Details
Documents
```

Each section has:

```text
[Edit]
```

Final action:

```text
[Submit Request]
```

Submission should use a TanStack mutation.

Disable the button while submitting.

---

# 24. Confirmation

After successful submission:

```text
Request Submitted Successfully

Reference Number

NWHR-XXXXXX

Your request has been received by NWHR.

A staff member will review your request and provide further
information when necessary.

[View Request]
[Go to Dashboard]
```

---

# 25. Beneficiary Dashboard

Layout:

```text
Sidebar / Mobile Navigation

Dashboard
My Requests
Referrals
Notifications
Profile
```

Dashboard cards:

```text
Active Requests
Pending
Completed
Referrals
```

Recent requests:

```text
Request
Service
Status
Date
Action
```

Use shadcn/ui `Card`, `Badge`, `Table` and `Skeleton`.

---

# 26. Request Status

Use consistent statuses.

```text
Pending
Under Review
Awaiting Information
Referred
Approved
Completed
Closed
```

Use both:

* Text
* Icon/visual indicator

Never communicate status using colour alone.

---

# 27. Request Details

Display:

```text
Request Number
Service
Status
Submitted Date
Description
Documents
Assigned Staff
Timeline
```

Timeline:

```text
✓ Request submitted

✓ Request received

● Staff reviewing

○ Assessment

○ Completed
```

---

# 28. Beneficiary Profile

Users can view/edit permitted information.

Sections:

```text
Personal Information
Contact Information
Documents
Preferences
Security
```

Do not expose internal staff notes.

---

# 29. Staff Portal

The staff application uses a dedicated layout.

```text
Staff Sidebar
        ↓
Topbar
        ↓
Page Content
```

Desktop sidebar:

```text
Dashboard
Beneficiaries
Service Requests
Referrals
Documents
Programmes
Messages
Reports
Settings
```

Mobile sidebar:

Use shadcn/ui `Sheet`.

---

# 30. Staff Dashboard

Top-level metrics:

```text
Total Beneficiaries
Pending Requests
Requests Under Review
Open Referrals
```

Additional sections:

```text
Recent Requests
Request Status Distribution
Recent Beneficiaries
Upcoming Activities
```

Do not create meaningless analytics.

Every metric should help staff make decisions.

---

# 31. Beneficiary Management

Page:

```text
Beneficiaries
```

Features:

* Search
* Filters
* Sorting
* Pagination
* View profile
* View requests

Use TanStack Table.

Example columns:

```text
Name
Contact
Nationality
Active Requests
Status
Created
Actions
```

---

# 32. Beneficiary Profile — Staff

Staff can view:

```text
Personal Information
Contact Information
Service Requests
Documents
Referrals
Case Notes
Activity History
```

Separate sensitive internal notes from information visible to beneficiaries.

---

# 33. Service Requests — Staff

Use TanStack Table.

Filters:

```text
Status
Service
Date
Assigned Staff
Priority
```

Actions:

```text
View
Assign
Update Status
Create Referral
Add Note
```

---

# 34. Request Review

Request review page:

```text
Request Header
↓
Beneficiary Information
↓
Service Request
↓
Documents
↓
Case Notes
↓
Referral
↓
Timeline
↓
Actions
```

Actions:

```text
Assign Case
Change Status
Request More Information
Create Referral
Add Note
Close Request
```

Use confirmation dialogs for destructive or irreversible actions.

---

# 35. Case Notes

Staff-only notes.

Example:

```text
Case Notes

[Add Note]

Staff member
Date
Note
```

Beneficiaries must not automatically see internal notes.

---

# 36. Referral Management

Referral page:

```text
Referral ID
Beneficiary
Request
Destination
Reason
Status
Created
Actions
```

Statuses:

```text
Pending
Sent
Accepted
Completed
Cancelled
```

---

# 37. Programme Management

Staff can manage:

```text
Education
Skills Development
Entrepreneurship
Social Cohesion
Women & Girls Empowerment
Youth Empowerment
```

Programme fields:

```text
Name
Description
Category
Location
Start Date
End Date
Capacity
Status
```

---

# 38. Documents

Staff document management should support:

```text
View
Download where authorised
Verify
Reject
Request replacement
```

Document statuses:

```text
Uploaded
Under Review
Verified
Rejected
Replacement Required
```

All document access must respect authorization.

---

# 39. Notifications

Create a notification system.

Types:

```text
Request Update
Referral Update
Document Update
Programme Update
System Notification
```

Use:

* Notification badge
* Dropdown
* Notification page

Use TanStack Query for notification state.

---

# 40. Authentication

Create separate flows for beneficiaries and staff where required.

Possible routes:

```text
/login
/register
/forgot-password
/reset-password
/staff/login
```

Authentication state must be handled centrally.

Protected routes should redirect unauthenticated users.

Staff routes must require staff authorization.

---

# 41. Authorization

Frontend route protection is not sufficient by itself.

The backend must enforce authorization.

Frontend should:

* Hide unauthorized navigation
* Prevent unauthorized actions
* Redirect unauthorized users
* Handle `401`
* Handle `403`

Example:

```text
401 → Authentication required

403 → You do not have permission to access this resource
```

---

# 42. Error Handling

Create consistent error handling.

States:

```text
Loading
Success
Empty
Error
Unauthorized
Forbidden
Not Found
Offline
```

Use shadcn/ui:

```text
Alert
Toast / Sonner
Skeleton
Empty State
```

Never display raw backend errors to users.

---

# 43. TanStack Mutation Pattern

Mutations should handle:

```text
idle
pending
success
error
```

Example operations:

```text
createRequest()
updateRequest()
uploadDocument()
createReferral()
updateStatus()
addCaseNote()
```

After successful mutations:

```text
invalidate relevant query
show success notification
update UI
```

---

# 44. Forms

Use:

```text
React Hook Form
+
Zod
+
shadcn/ui
```

Keep validation schemas separate.

Example:

```text
lib/
└── validations/
    ├── auth.ts
    ├── beneficiary.ts
    ├── request.ts
    ├── referral.ts
    └── programme.ts
```

Client validation improves UX.

Backend validation remains authoritative.

---

# 45. Accessibility

The application must follow accessible design principles.

Requirements:

* Semantic HTML
* Keyboard navigation
* Focus states
* ARIA labels where needed
* Accessible dialogs
* Accessible forms
* Accessible error messages
* Sufficient contrast
* Large touch targets
* Screen-reader-friendly controls

shadcn/ui components should be preferred because they are built on accessible Radix primitives.

---

# 46. Responsive Design

Mobile is a first-class experience.

### Mobile

```text
360px+
```

### Tablet

```text
768px+
```

### Desktop

```text
1024px+
```

### Large desktop

```text
1280px+
```

Forms should become one column on mobile.

Staff tables should become responsive cards where necessary.

---

# 47. Loading Experience

Use Skeleton components.

Example:

```text
DashboardSkeleton
RequestSkeleton
TableSkeleton
ProfileSkeleton
```

Avoid large blank spaces while waiting for API responses.

---

# 48. Empty States

Every list needs an empty state.

Example:

```text
No requests found

You don't have any service requests yet.

[Get Help]
```

Staff:

```text
No beneficiaries found

Try changing your search or filters.
```

---

# 49. Toast Notifications

Use shadcn/ui Sonner.

Examples:

```text
Request submitted successfully.
Document uploaded successfully.
Request status updated.
Referral created successfully.
Profile updated successfully.
```

Errors:

```text
Something went wrong.
Please try again.
```

---

# 50. Animations

Use minimal motion.

Good uses:

* Page transitions
* Dialog opening
* Dropdowns
* Hover states
* Loading indicators
* Chat messages

Avoid animation that delays users.

Prefer CSS/Tailwind transitions.

---

# 51. Image Handling

Use Next.js `Image`.

Requirements:

* Responsive images
* Appropriate sizes
* Lazy loading where appropriate
* Meaningful alt text
* Optimized assets

Do not use massive unoptimized images.

---

# 52. SEO

Public pages should have:

* Page title
* Meta description
* Open Graph metadata
* Appropriate headings
* Semantic HTML
* Sitemap
* Robots configuration

Private dashboards should not be indexed.

---

# 53. Security Rules

Never place secrets in:

```text
NEXT_PUBLIC_*
```

unless the value is intentionally public.

Private values include:

```text
Gemini API key
Database credentials
JWT secrets
Private storage credentials
Backend secrets
```

Frontend environment variables must be treated carefully.

---

# 54. Environment Variables

Use:

```text
.env.local
```

Example conceptual variables:

```text
NEXT_PUBLIC_API_URL=
NEXT_PUBLIC_APP_URL=
```

Private backend secrets belong on the backend, not in the Next.js client.

---

# 55. Performance

Use Next.js features appropriately.

Prefer:

* Server Components by default
* Client Components only when interactivity is required
* Dynamic imports for heavy components
* Next.js Image optimization
* Proper caching
* TanStack Query for client-side server state

Do not turn the entire application into `"use client"`.

---

# 56. Server vs Client Components

Default:

```text
Server Component
```

Use `"use client"` only when the component requires:

* State
* Event handlers
* Browser APIs
* TanStack Query hooks
* Interactive forms
* Chat functionality

Keep the client boundary as small as practical.

---

# 57. Design Tokens

Centralize:

```text
Colors
Spacing
Radius
Typography
Shadows
Transitions
Breakpoints
```

Avoid random values throughout the application.

Use Tailwind classes consistently.

---

# 58. UI Consistency

Buttons must have consistent variants:

```text
default
secondary
outline
ghost
destructive
link
```

Badges:

```text
default
secondary
success
warning
destructive
```

Cards should use consistent:

```text
padding
radius
border
shadow
```

---

# 59. Mobile Navigation

Beneficiary:

```text
Home
Get Help
My Requests
Notifications
Profile
```

Staff:

```text
Dashboard
Beneficiaries
Requests
Referrals
Documents
Messages
Settings
```

Use a mobile bottom navigation only where it genuinely improves usability.

---

# 60. Footer

Footer sections:

```text
NWHR

About
Services
Programmes
Get Help
Resources

Contact

Social Media

Privacy Policy
Terms
Accessibility
```

Include partner logos where appropriate.

---

# 61. Public Pages

Required pages:

```text
/
 /about
 /services
 /services/[slug]
 /programmes
 /programmes/[slug]
 /get-help
 /resources
 /news
 /news/[slug]
 /donate
 /contact
```

---

# 62. Beneficiary Pages

```text
/dashboard
/requests
/requests/[id]
/referrals
/notifications
/profile
```

---

# 63. Staff Pages

```text
/staff/login
/staff/dashboard
/staff/dashboard/beneficiaries
/staff/dashboard/beneficiaries/[id]
/staff/dashboard/requests
/staff/dashboard/requests/[id]
/staff/dashboard/referrals
/staff/dashboard/documents
/staff/dashboard/programmes
/staff/dashboard/messages
/staff/dashboard/reports
/staff/dashboard/settings
```

---

# 64. Route Organization

Use Next.js route groups to separate concerns.

```text
app/
├── (marketing)/
├── (beneficiary)/
└── staff/
```

Route groups should not unnecessarily change the URL structure.

---

# 65. Shared Components

Create reusable components:

```text
Navbar
Footer
PageHeader
SectionHeader
Button
ServiceCard
ProgrammeCard
StatusBadge
EmptyState
ErrorState
LoadingState
ConfirmDialog
FileUploader
Pagination
SearchInput
FilterBar
```

---

# 66. Feature-Based Components

Organize complex features separately.

```text
features/
├── requests/
│   ├── components/
│   ├── hooks/
│   ├── api.ts
│   ├── schemas.ts
│   └── types.ts
│
├── beneficiaries/
│   ├── components/
│   ├── hooks/
│   ├── api.ts
│   └── types.ts
```

This prevents the project from becoming one giant `components` folder.

---

# 67. Data Flow

General data flow:

```text
UI Component
     ↓
TanStack Query Hook
     ↓
API Client
     ↓
Backend
     ↓
Database
```

For mutations:

```text
User Action
     ↓
Form Validation
     ↓
TanStack Mutation
     ↓
API
     ↓
Backend
     ↓
Database
     ↓
Invalidate Query
     ↓
Updated UI
```

---

# 68. AI Data Flow

```text
User
 ↓
Chat UI
 ↓
TanStack Mutation
 ↓
Backend /api/chat
 ↓
Gemini
 ↓
Backend processes response
 ↓
Chat UI
```

The frontend must not contain the Gemini secret.

---

# 69. Human Escalation

The AI must provide a path to human support.

Example:

```text
I think an NWHR staff member should review this request.

[Request Human Assistance]
```

This can create a service request or escalation depending on backend logic.

---

# 70. Trust & Privacy UX

Because beneficiaries may submit sensitive information:

Always clearly communicate:

```text
Why information is being requested
```

Do not request unnecessary information.

Document uploads must show:

```text
Your documents are submitted securely to NWHR
for review.
```

Avoid displaying sensitive information in URLs or browser-visible query parameters.

---

# 71. Internationalization Readiness

Structure the application so translations can be added later.

Avoid hardcoding large amounts of user-facing text inside complicated components.

Potential future languages:

```text
English
Portuguese
French
Other relevant local languages
```

---

# 72. Testing Strategy

Test:

### Components

* Buttons
* Forms
* Dialogs
* File upload
* Chat

### Features

* Registration
* Login
* Service request
* Document upload
* Request tracking
* Staff request review
* Referral creation

### Accessibility

* Keyboard navigation
* Screen reader labels
* Form errors
* Focus management

---

# 73. Code Quality Rules

Do not:

* Duplicate components
* Put API calls directly everywhere
* Put business logic inside presentation components
* Use giant components
* Expose secrets
* Ignore TypeScript errors
* Disable ESLint rules without reason
* Use `any` unnecessarily
* Make every component a Client Component

Do:

* Use TypeScript
* Create reusable components
* Keep features modular
* Use proper types
* Validate forms
* Handle loading/error/empty states
* Keep server and client responsibilities clear

---

# 74. UI Development Rule

Before creating a new component:

1. Check whether shadcn/ui already provides it.
2. Check whether an existing project component can be reused.
3. Only create a new component when necessary.

This prevents component duplication.

---

# 75. TanStack Development Rule

Use TanStack Query for server state.

Use React state for temporary UI state.

Example:

```text
Server state:
requests
beneficiaries
notifications

Local UI state:
modal open/closed
selected tab
input state
sidebar open/closed
```

Do not use global state for data that TanStack Query already manages.

---

# 76. Table Development Rule

Every staff table must support:

```text
Loading
Empty
Error
Search
Filtering
Sorting
Pagination
Row actions
Mobile responsiveness
```

Never build a table that only works with successful API data.

---

# 77. Form Development Rule

Every form must have:

```text
Initial state
Validation
Loading state
Error state
Success state
Disabled submission state
Accessible labels
```

Prevent duplicate submissions.

---

# 78. Final UX Journey

```text
Visitor
   ↓
Homepage
   ↓
Explore Services
   ↓
AI Support Assistant
   ↓
Get Help
   ↓
Personal Information
   ↓
Service Selection
   ↓
Request Details
   ↓
Document Upload
   ↓
Review
   ↓
Submit
   ↓
Reference Number
   ↓
Beneficiary Dashboard
   ↓
NWHR Staff Review
   ↓
Assessment
   ↓
Referral / Assistance
   ↓
Completion
```

---

# 79. Final Architecture

```text
                         NWHR PLATFORM

                              │
                 ┌────────────┴────────────┐
                 │                         │
             PUBLIC UI                 STAFF PORTAL
                 │                         │
             Next.js                   Next.js
                 │                         │
             shadcn/ui                 shadcn/ui
                 │                         │
             Tailwind                  Tailwind
                 │                         │
                 └────────────┬────────────┘
                              │
                       TanStack Query
                              │
                         API Layer
                              │
                         Backend API
                              │
                ┌─────────────┼─────────────┐
                │             │             │
             Database      Documents      Gemini
                │             │             │
                └─────────────┴─────────────┘
```

---

# 80. Definition of Done

The frontend is considered complete when:

* All public pages are responsive
* Beneficiary authentication works
* Staff authentication works
* Protected routes work
* Service request flow works
* Document upload works
* Beneficiary dashboard works
* Request tracking works
* Staff dashboard works
* Beneficiary management works
* Request management works
* Referral system works
* Programme management works
* AI assistant works through the backend
* Loading states exist
* Error states exist
* Empty states exist
* Forms are validated
* Tables support filtering and pagination
* Mobile layouts work
* Accessibility has been considered
* No private API keys are exposed
* TypeScript has no avoidable errors
* Components are reusable
* UI follows the NWHR design system

---

# 81. Primary Development Principle

Do not build the entire application as one huge page.

Build the system feature by feature:

```text
1. Design system
2. Public layout
3. Homepage
4. Services
5. Get Help
6. Authentication
7. Beneficiary dashboard
8. Service requests
9. Documents
10. Staff dashboard
11. Beneficiary management
12. Request management
13. Referrals
14. Programmes
15. Notifications
16. AI assistant
17. Reports
18. Testing
19. Security review
20. Deployment
```

Every feature must use the same design system and architectural patterns.

**The goal is a maintainable Next.js application, not simply a visually impressive frontend.**

## Image Assets

All local images must be stored in `/public/images`.

### Hero
Path:
`/images/hero-refugee.jpg`

Requirements:
- Landscape
- Minimum 2400px wide
- Refugee/beneficiary meeting with a professional caseworker
- Subject positioned on the right
- Dark/clean space on the left for hero text
- Warm, respectful humanitarian photography
- No distressing or exploitative imagery

### Services
Documentation:
`/images/services/documentation.jpg`

Education:
`/images/services/education.jpg`

Skills Development:
`/images/services/skills-development.jpg`