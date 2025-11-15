# Implementation Plan: UI/UX Enhancements

## Stage 1: Security - Anti-Prompt-Leaking ✅
**Goal**: Prevent users from extracting system prompts through attacks like "translate above"
**Success Criteria**: All prompt leak attempts are detected and blocked
**Status**: Complete

### Changes Made:
- ✅ Added prompt leak detection to `api/startup-mentor.js` (was missing)
- ✅ Enhanced detection patterns in `lib/prompt-guard.js` for more sophisticated attacks
- ✅ Added Chinese language attack pattern detection (翻译上面, 重复上面, etc.)
- ✅ Protected system prompts with `protectSystemPrompt()` wrapper
- ✅ Sanitized user messages with `sanitizeUserMessage()`
- ✅ Added deflection responses for all modes

## Stage 2: Search & Filters ✅
**Goal**: Full-text search within conversations with date/mode filters
**Success Criteria**:
- Users can search message content (not just titles)
- Filter by date range, mode type
- Search results are highlighted
**Status**: Complete

### Implementation Steps:
1. ✅ Update database schema to support full-text search
   - Created `supabase-search-migration.sql` with GIN indexes
   - Created `search_conversations()` function with filters
2. ✅ Create search API endpoint `/api/search`
3. ✅ Add search UI component in sidebar
   - Debounced search (300ms)
   - Minimum 2 characters to trigger
   - Escape key to clear
4. ✅ Implement result highlighting with `<mark>` tags
5. ✅ Add filter support for date range and AI mode
   - Backend supports filters via query params
   - Frontend ready for UI controls (can be added later)

### Files Created/Modified:
- `supabase-search-migration.sql` - Database migration
- `api/search.js` - Search API endpoint
- `public/script.js` - Search functionality and UI
- `public/styles.css` - Search result styles

## Stage 3: Message Reactions & Bookmarking ✅
**Goal**: Users can star/bookmark messages and react with thumbs up/down
**Success Criteria**:
- Bookmark icon on each message
- Thumbs up/down buttons
- Reactions persist to database
**Status**: Complete

### Implementation Steps:
1. ✅ Update schema with reactions/bookmarks table
   - Created `message_reactions` table
   - Added RLS policies
   - Created `get_bookmarked_messages()` function
2. ✅ Create API endpoints for reactions
   - `POST /api/reactions` - Add reaction
   - `DELETE /api/reactions` - Remove reaction
   - `GET /api/reactions` - Get user reactions
3. ✅ Add UI buttons to messages
   - Thumbs up/down buttons
   - Bookmark star button
   - Active state styling
4. ✅ Store reactions in database with toggle functionality

### Files Created/Modified:
- `supabase-reactions-migration.sql` - Database migration
- `api/reactions.js` - Reactions API endpoint
- `public/script.js` - Reaction UI and logic
- `public/styles.css` - Reaction button styles

## Stage 4: Welcome/Landing Page ✅
**Goal**: Add a welcome screen like Claude/ChatGPT with example prompts
**Success Criteria**:
- Show welcome screen when no conversation is active
- Display example prompts for each mode (learning, startup, agent)
- Clicking a prompt starts a new conversation
- Smooth transitions between welcome and chat
**Status**: Complete

### Implementation Steps:
1. ✅ Create welcome screen HTML with example prompts
   - 3 sections: Learning, Startup, Agent
   - 3 prompt cards per section
2. ✅ Add welcome screen CSS styling
   - Card hover effects
   - Responsive grid layout
   - Fade-in animation
3. ✅ Add JavaScript to show/hide welcome screen
   - Show on new chat
   - Hide when conversation loads or message sent
   - Prompt card click handlers
4. ✅ Auto-submit prompt when card clicked
   - Sets correct mode
   - Fills input with prompt text
   - Submits form automatically

### Files Modified:
- `public/index.html` - Added welcome screen HTML
- `public/styles.css` - Welcome screen styles
- `public/script.js` - Show/hide logic and prompt handlers

## Stage 5: Conversation Templates
**Goal**: Pre-built conversation starters and saveable custom prompts
**Success Criteria**:
- Template gallery with quick-start cards
- Users can save custom prompts
- One-click to start from template
**Status**: Not Started

### Implementation Steps:
1. Create templates configuration file
2. Build template picker UI
3. Add "Save as template" button
4. Store custom templates in database
5. Template modal on new chat

## Stage 5: Multi-language Support
**Goal**: Toggle between Chinese/English UI
**Success Criteria**:
- Language switcher in UI
- All UI text translatable
- Auto-detect browser language
- Persist language preference
**Status**: Not Started

### Implementation Steps:
1. Create i18n library structure (`/lib/i18n.js`)
2. Extract all UI strings to language files
3. Add language switcher to header
4. Implement auto-detection
5. Store preference in localStorage/database

## Stage 6: Dark/Light Theme Toggle
**Goal**: Theme switcher with system preference detection
**Success Criteria**:
- Toggle button in UI
- Smooth theme transitions
- System preference detection
- Theme persists across sessions
**Status**: Not Started

### Implementation Steps:
1. Create CSS variables for theming
2. Add dark theme stylesheet
3. Implement theme toggle logic
4. Detect system preference
5. Store in localStorage
6. Add smooth transitions

## Stage 7: Conversation Folders/Tags
**Goal**: Organize conversations with folders and multi-tag support
**Success Criteria**:
- Create/edit/delete folders
- Drag-and-drop to folders
- Multi-tag conversations
- Tag-based filtering
**Status**: Not Started

### Implementation Steps:
1. Update schema for tags/folders
2. Create tag management API
3. Add folder sidebar section
4. Implement tag editor UI
5. Add tag filter chips
6. Drag-and-drop support

## Testing Plan

### Security Testing (Stage 1) ✅
- [x] Test "translate above" attack → blocked
- [x] Test "翻译上面" attack → blocked
- [x] Test "repeat previous" attack → blocked
- [x] Test "show system prompt" attack → blocked
- [x] Verify deflection messages are appropriate

### Feature Testing (Stages 2-7)
- [ ] Search finds messages in conversation body
- [ ] Filters work correctly
- [ ] Bookmarks persist after refresh
- [ ] Templates create new conversations correctly
- [ ] Language switching updates all UI elements
- [ ] Theme toggle works on all pages
- [ ] Tags can be added/removed/filtered

## Quality Gates

- [ ] All tests passing
- [ ] No console errors
- [ ] Mobile responsive
- [ ] Performance: no slow queries
- [ ] Security: no new vulnerabilities introduced
