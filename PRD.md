# 🎙️ PanelChat — Lenny's Podcast Panel Discussions

## Overview

PanelChat is a platform that enables users to explore curated expert discussions from Lenny's Podcast transcripts. Users can browse pre-structured conversations between multiple experts on key topics, or ask their own questions with the ability to direct them to specific experts using @ mentions.

## Current Application Structure

### 1. Landing Page (`/`)
**Purpose**: Entry point for the application with podcast voting and navigation

**Features**:
- Podcast voting system (requires authentication)
- "Lenny's Podcast" button that navigates to panels
- User authentication (sign in/sign up)
- Podcast request functionality
- Custom panel creation (authenticated users)

**Authentication Flow**:
- Users can browse and vote on podcasts
- Voting requires authentication (shows sign-in prompt if not authenticated)
- After sign-in, users are returned to the same page/state

**Navigation**:
- Clicking "Lenny's Podcast" → `/lennys-podcast/panels`
- Sign in/Sign up buttons → Auth modal
- Custom panel creation → Modal (authenticated users)

### 2. Authentication System
**Technology**: Supabase Auth

**Features**:
- Email/password authentication
- Sign up with user profile (name, role, company)
- Sign in/Sign out
- Session persistence
- Protected routes and actions

**Auth Requirements**:
- **Required for**:
  - Voting on podcasts
  - Marking panels as valuable
  - Asking questions in panels
  - Creating custom panels
- **Not required for**:
  - Viewing landing page
  - Browsing panels
  - Reading discussions

**Auth Flow**:
1. User attempts protected action
2. If not authenticated → Show sign-in modal
3. User signs in/signs up
4. Return to original page/state
5. Action completes

### 3. Panels Listing Page (`/lennys-podcast/panels`)
**Purpose**: Browse and discover curated expert panels

**Features**:
- Panel grid display with cards
- Category filtering (sidebar on desktop, dropdown on mobile)
- Search functionality (panels, experts, categories)
- Sort by "Most Viewed" or "Most Valuable"
- Panel cards show:
  - Panel name and description
  - Category badge
  - Expert avatars (up to 3 visible, +N indicator)
  - Valuable count (star icon)
- Breadcrumb navigation: `PanelChat > Lenny's Podcast > Panels`

**Categories**:
- All Panels
- Early Stage Growth
- Hiring & Building Teams
- Pricing Strategy
- Scaling Product Teams
- Building Culture
- B2B Product
- Fundraising

**Navigation**:
- Clicking a panel card → `/lennys-podcast/panels/[panel-slug]`
- "Create Custom Panel" button (authenticated users only)

### 4. Panel Detail Page (`/lennys-podcast/panels/[panel-slug]`)
**Purpose**: View curated discussions and ask questions to expert panels

**URL Structure**:
- Base: `/lennys-podcast/panels/[panel-slug]`
- Tab 2: `/lennys-podcast/panels/[panel-slug]?tab=ask`
- Example: `/lennys-podcast/panels/the-growth-engine`

**Page Layout**:

#### Header Section
- Breadcrumb: `PanelChat > Lenny's Podcast > Panels > [Panel Name]`
- Panel title (H1)
- Category tag (pill badge)
- Panel description (2-3 sentences)
- Star button (valuable marker) - see below
- Panel Experts section (collapsible if >3 experts)

#### Tab Navigation
- Two tabs: "The Discussion" | "Ask the Panel"
- Active tab: Bold text with bottom border
- Inactive tab: Normal weight, gray text
- URL updates when switching tabs
- Smooth content transition

#### Tab 1: The Discussion
**Summary Line**: `[N] key discussions · [N] experts`

**Quick Filters**:
- All (default)
- Disagreements (shows moderate/strong disagreements)
- Consensus (shows consensus discussions)
- Actionable (shows action-oriented takeaways)
- Filter counts displayed in pills

**Discussion Topics List**:
- Vertical stack of collapsible discussion cards
- Each card has collapsed/expanded states

**Discussion Card - Collapsed**:
- Icon (💬) + Title (bold)
- Meta: "[N perspectives] · [Agreement indicator]"
- Perspective previews (first line of each expert's perspective)
- "Expand discussion →" button

**Discussion Card - Expanded**:
- Expert Perspective Blocks:
  - Avatar, Name, Title/Company
  - Divider line
  - Full perspective text (3-6 sentences)
  - Episode citation (📎 Episode [number] - '[title]' @ [timestamp])
  - Action buttons:
    - "🎧 Listen to episode"
    - "💬 Ask [Expert Name]" (switches to Tab 2 with @mention)
- Key Takeaways section:
  - Container with distinctive background
  - Bullet points with icons (✓ consensus, ⚖️ nuanced, 🎯 actionable)
- "Collapse discussion ↑" button

**Bottom CTA**:
- "Can't find what you're looking for?"
- "This panel has discussed [N] key topics..."
- "Ask the Panel your question →" button (switches to Tab 2)

#### Tab 2: Ask the Panel
**Authentication Gate**:
- If not authenticated: Overlay on entire tab
- Message: "Sign in to ask questions"
- Sign-in button in overlay
- Background content dimmed/blurred

**Initial State** (authenticated, no question asked):
- Page heading: "Ask the Panel"
- Introduction text
- Popular Questions section (5-7 example questions)
- Question Input:
  - Textarea (500 char limit)
  - Character counter
  - @mention functionality (see below)
  - "Send to Panel →" button
- "How it works" section

**@Mention Functionality**:
- Trigger: Type "@" character
- Dropdown appears below cursor
- Options:
  - "@Panel" (all experts)
  - Individual expert options (avatar, name, title)
- Click inserts @ExpertName into input
- Mentions styled as chips/tags

**Loading State** (after question submitted):
- Question display
- Loading animation with steps:
  - "🌀 Analyzing question..."
  - "✓ Context understood"
  - "🔍 Searching panel conversations..."
  - "⚡ Gathering expert perspectives..."
- Portal animation (visual effect)

**Results State**:
- User's question displayed (editable)
- "Based on this panel's insights:" header
- Expert Response Cards:
  - Avatar, Name, Title/Company
  - Response text (3-6 sentences)
  - Episode citations
  - "🎧 Listen to episode" button
- Panel Consensus Box (if applicable):
  - Shows when 2+ experts agree
  - Summary text (2-3 sentences)
- Follow-up Section:
  - Question input
  - "Send →" and "Ask new question" buttons

**No Results State**:
- "🤔 Hmm, this panel hasn't discussed this topic"
- Explanation text
- Suggestions: "Try asking about:" (panel topics)
- Related panels links
- "Ask a different question" button

#### Star Button (Valuable Marker)
**Location**: Below panel description, aligned left

**Display**:
- Star icon (outline when not marked, filled when marked)
- Text: "X people found this valuable" or "You and X others found this valuable"

**States**:
- **Not Authenticated**: Outline star, clickable → Shows sign-in prompt
- **Authenticated - Not Marked**: Outline star, clickable → Marks and increments count
- **Authenticated - Marked**: Filled star, clickable → Unmarks and decrements count

**Technical**:
- Optimistic UI update (immediate visual feedback)
- API: `POST /api/panels/[slug]/mark-valuable`
- Error handling with revert on failure

## API Endpoints

### GET `/api/panels/[panel-slug]`
Returns full panel data including:
- Panel metadata (title, description, category)
- Experts list
- Discussions with perspectives
- Valuable count
- User's marked status (if authenticated)

**Response**:
```typescript
{
  panel: Panel,
  isMarkedValuable: boolean
}
```

### POST `/api/panels/[panel-slug]/mark-valuable`
Toggles user's valuable marking.

**Request**:
```typescript
{
  marked: boolean
}
```

**Response**:
```typescript
{
  valuableCount: number
}
```

**Auth**: Required (Bearer token)

### POST `/api/panels/[panel-slug]/ask`
Asks the panel a question using RAG system.

**Request**:
```typescript
{
  question: string,
  mentionedExpertIds: string[] | null  // null = @Panel (all experts)
}
```

**Response**:
```typescript
{
  responses: QuestionResponse[],
  consensus: PanelConsensus | null
}
```

**Auth**: Required (Bearer token)

## Data Models

### Panel
```typescript
{
  id: string
  slug: string
  title: string
  description: string
  shortDescription: string
  category: string
  experts: Expert[]
  discussions: Discussion[]
  metadata: {
    createdAt: string
    updatedAt: string
    viewCount: number
    valuableCount: number
  }
}
```

### Expert
```typescript
{
  id: string
  name: string
  title: string
  company: string
  avatar?: string
  bio?: string
}
```

### Discussion
```typescript
{
  id: string
  panelId: string
  title: string
  order: number
  agreementLevel: 'consensus' | 'moderate_disagreement' | 'strong_disagreement' | 'nuanced'
  perspectives: Perspective[]
  keyTakeaways: KeyTakeaway[]
  metadata: {
    viewCount: number
    expandCount: number
  }
}
```

### Perspective
```typescript
{
  id: string
  discussionId: string
  expertId: string
  expertName: string
  expertTitle: string
  expertCompany: string
  content: string
  episodeId: string
  episodeTitle: string
  episodeNumber: number
  timestamp: string
}
```

### QuestionResponse
```typescript
{
  id: string
  questionId: string
  expertId: string
  expertName: string
  expertTitle: string
  expertCompany: string
  responseText: string
  episodeReferences: Array<{
    episodeId: string
    episodeTitle: string
    episodeNumber: number
    timestamp: string
  }>
  confidence: number
}
```

## Technical Stack

### Frontend
- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript
- **Styling**: TailwindCSS
- **State Management**: React hooks
- **Authentication**: Supabase Auth
- **Animations**: Framer Motion
- **Icons**: Lucide React

### Backend
- **API**: Next.js API Routes
- **Database**: Supabase (PostgreSQL)
- **Authentication**: Supabase Auth (JWT)
- **RAG System**: (To be integrated - currently mock data)

## File Structure

```
frontend/
├── app/
│   ├── page.tsx                          # Landing page
│   ├── layout.tsx                        # Root layout
│   ├── globals.css                       # Global styles
│   ├── lennys-podcast/
│   │   └── panels/
│   │       ├── page.tsx                  # Panels listing
│   │       └── [panel-slug]/
│   │           └── page.tsx              # Panel detail page
│   ├── api/
│   │   └── panels/
│   │       └── [panel-slug]/
│   │           ├── route.ts             # GET panel data
│   │           ├── mark-valuable/
│   │           │   └── route.ts         # POST mark valuable
│   │           └── ask/
│   │               └── route.ts         # POST ask question
│   ├── privacy/
│   │   └── page.tsx                      # Privacy policy
│   └── terms/
│       └── page.tsx                      # Terms of service
├── components/
│   ├── AuthModal.tsx                     # Authentication modal
│   ├── Footer.tsx                        # Site footer
│   └── panels/
│       ├── StarButton.tsx                # Valuable marker
│       ├── PanelExperts.tsx              # Expert list
│       ├── PanelTabs.tsx                # Tab navigation
│       ├── QuickFilters.tsx              # Discussion filters
│       ├── DiscussionCard.tsx            # Discussion card
│       ├── QuestionInput.tsx             # Question input with @mentions
│       ├── ExpertMentionDropdown.tsx     # @mention dropdown
│       ├── LoadingState.tsx              # Loading animation
│       ├── ExpertResponse.tsx            # Expert response card
│       ├── NoResults.tsx                 # No results state
│       └── SignInPrompt.tsx              # Sign-in prompt modal
└── lib/
    ├── supabase.ts                       # Supabase client
    └── types/
        └── panel.ts                      # TypeScript types
```

## User Flows

### Flow 1: Browse Panels (Unauthenticated)
1. User lands on `/`
2. Clicks "Lenny's Podcast" → `/lennys-podcast/panels`
3. Browses panels, uses filters/search
4. Clicks panel card → `/lennys-podcast/panels/[slug]`
5. Views discussions, expands cards
6. Clicks star → Sign-in prompt appears
7. Signs in → Returns to panel page
8. Star button now functional

### Flow 2: Ask Panel Question (Authenticated)
1. User on panel page, Tab 1
2. Clicks "Ask the Panel your question →" → Switches to Tab 2
3. Sees popular questions, types own question
4. Uses @mention to direct to specific expert
5. Clicks "Send to Panel →"
6. Sees loading animation
7. Receives expert responses
8. Can ask follow-up questions
9. Can click "Ask new question" to start over

### Flow 3: Mark Panel as Valuable
1. User on panel page
2. Clicks star button
3. If not authenticated → Sign-in prompt
4. If authenticated → Optimistic UI update
5. API call in background
6. Count updates, star fills
7. On error → Reverts and shows error

## Design System

### Colors
- **Primary**: Orange (#EA580C, #F97316)
- **Background**: Cream (#FDFCFB)
- **Text**: Charcoal (#1F2937, #374151)
- **Borders**: Charcoal-200, Charcoal-300

### Typography
- **Font**: Inter
- **Headings**: Bold, display font
- **Body**: Regular weight, 15-16px

### Components
- **Cards**: Editorial style with rounded corners, subtle shadows
- **Buttons**: Gradient backgrounds, rounded corners
- **Inputs**: White background, orange focus ring
- **Badges**: Pill shape, colored backgrounds

### Spacing
- Consistent spacing scale
- Responsive padding/margins
- Grid system for layouts

## Responsive Design

### Mobile (< 640px)
- Stacked layouts
- Collapsible categories dropdown
- Full-width inputs
- Touch-optimized controls
- Swipeable tabs

### Tablet (640px - 1024px)
- 2-column grid for panels
- Sidebar categories
- Optimized spacing

### Desktop (> 1024px)
- 2-column panel grid
- Sticky sidebar
- Full navigation
- Hover states

## Future Enhancements (Not in Current Scope)

- User question history
- Saved/favorited panels collection
- Email notifications
- Social sharing
- Expert profile pages
- Cross-panel search
- Related panels recommendations
- Export/share responses
- Real-time collaboration
- Panel creation UI
- Admin panel for curating discussions

## Development Notes

### Current State
- ✅ Landing page with authentication
- ✅ Panels listing page
- ✅ Panel detail page with two tabs
- ✅ Star button (valuable marker)
- ✅ @mention functionality
- ✅ Mock data for panels
- ⏳ RAG system integration (placeholder)
- ⏳ Database schema (to be implemented)
- ⏳ Discussion curation tools (to be implemented)

### Next Steps
1. Implement database schema for panels, experts, discussions
2. Integrate RAG system for question answering
3. Build admin interface for curating discussions
4. Add analytics tracking
5. Implement error toasts
6. Add loading skeletons
7. Optimize performance
8. Add SEO metadata
